import fs from 'fs';
import path from 'path';
import { getHistoricalCacheSettings, pruneHistoricalCache } from '../cache/prizmCache';

export interface PrizmTelemetrySample {
  timestampUtc: string;
  profileId?: string | null;
  emsBaseUrl?: string | null;
  siteCode?: string | null;
  source: string;
  entityType: "site" | "array" | "string" | "hvac" | "feather" | "safety" | "bpc" | "cellGroup";
  entityKey: string;
  metricName: string;
  metricValue?: number | null;
  metricText?: string | null;
  unit?: string | null;
  quality: "live" | "cached" | "stale" | "offline" | "unknown";
  arrayNumber?: number | null;
  stringNumber?: number | null;
  bpcNumber?: number | null;
  cellGroupNumber?: number | null;
}

const HISTORY_DIR = path.join(process.cwd(), ".prizm-cache", "history");

const writeThrottleMillis = 5000;
const lastWriteMap = new Map<string, number>();

function parseRangeMs(rangeStr: string): number {
    const r = rangeStr.trim().toLowerCase();
    if (r.endsWith('m')) return parseInt(r) * 60 * 1000;
    if (r.endsWith('h')) return parseInt(r) * 60 * 60 * 1000;
    if (r.endsWith('d')) return parseInt(r) * 24 * 60 * 60 * 1000;
    return 2 * 60 * 60 * 1000; // default 2h
}

export async function appendSamples(samples: PrizmTelemetrySample[]): Promise<void> {
    const settings = getHistoricalCacheSettings();
    if (!settings.historicalSnapshotLoggingEnabled) return;

    if (!samples.length) return;
    try {
        if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
        const filePath = path.join(HISTORY_DIR, "telemetry-samples.jsonl");
        
        const nowMs = Date.now();
        const validSamples = samples.filter(s => {
            if (s.metricValue === null || s.metricValue === undefined) {
               if (s.metricText === null || s.metricText === undefined || s.metricText === "") {
                   return false; // drop fully empty samples
               }
            }
            
            const key = `${s.entityKey}:${s.metricName}`;
            const lastWrite = lastWriteMap.get(key) || 0;
            if (nowMs - lastWrite < writeThrottleMillis) {
                return false; // throttled
            }
            lastWriteMap.set(key, nowMs);
            return true;
        });

        const lines = validSamples.map(s => JSON.stringify(s)).join('\n') + '\n';
        if (validSamples.length > 0 && lines.trim().length > 0) {
            fs.appendFileSync(filePath, lines);
        }
    } catch(err) {
        console.error("Failed to append telemetry:", err);
    }
}

export async function querySeries(params: any): Promise<any> {
    const { entityKey, metric, range, limit } = params;
    const maxSamples = Math.min(parseInt(limit as string) || 5000, 5000);
    const rangeMs = parseRangeMs(range || "2h");
    const minTimestamp = Date.now() - rangeMs;
    const samples: PrizmTelemetrySample[] = [];
    let skippedBadLines = 0;
    
    try {
        const filePath = path.join(HISTORY_DIR, "telemetry-samples.jsonl");
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n').filter((l: string) => l.trim().length > 0);
            // Reverse to get newest first if we want, or just filter
            for (let i = lines.length - 1; i >= 0 && samples.length < maxSamples; i--) {
                try {
                    const s = JSON.parse(lines[i]);
                    const ts = new Date(s.timestampUtc).getTime();
                    if (s.entityKey === entityKey && s.metricName === metric && ts >= minTimestamp) {
                        samples.unshift(s); // Prepend to keep chronological order
                    }
                } catch(e) {
                    skippedBadLines++;
                }
            }
        }
    } catch (err) {
       // Ignore file read error
    }
    
    return {
        samples,
        meta: {
            entityKey,
            metric,
            range: range || "2h",
            returned: samples.length,
            skippedBadLines
        }
    };
}

export async function appendEvent(event: any): Promise<void> {
    try {
        if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
        const filePath = path.join(HISTORY_DIR, "events.jsonl");
        fs.appendFileSync(filePath, JSON.stringify(event) + '\n');
    } catch (err) {
        console.error("Failed to append event:", err);
    }
}

export async function queryEvents(params: any): Promise<any> {
    const { entityKey, range, limit } = params;
    const maxEvents = Math.min(parseInt(limit as string) || 5000, 5000);
    const rangeMs = parseRangeMs(range || "2h");
    const minTimestamp = Date.now() - rangeMs;
    const events: any[] = [];
    let skippedBadLines = 0;

    try {
        const filePath = path.join(HISTORY_DIR, "events.jsonl");
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n').filter((l: string) => l.trim().length > 0);
            for (let i = lines.length - 1; i >= 0 && events.length < maxEvents; i--) {
                try {
                    const s = JSON.parse(lines[i]);
                    const ts = new Date(s.timestampUtc).getTime();
                    if (s.entityKey === entityKey && ts >= minTimestamp) {
                        events.unshift(s);
                    }
                } catch(e) {
                    skippedBadLines++;
                }
            }
        }
    } catch (err) {
       // Ignore
    }
    return {
        events,
        meta: {
            entityKey,
            range: range || "2h",
            returned: events.length,
            skippedBadLines
        }
    };
}

export async function cleanupHistory(retentionPolicy?: any): Promise<void> {
    const retentionMs = parseRangeMs(retentionPolicy?.range || "7d");
    const minTimestamp = Date.now() - retentionMs;

    const filesToClean = ["telemetry-samples.jsonl", "events.jsonl"];

    for (const fileName of filesToClean) {
        try {
            const filePath = path.join(HISTORY_DIR, fileName);
            if (fs.existsSync(filePath)) {
                let retainedLines = 0;
                let originalLines = 0;
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n').filter((l: string) => l.trim().length > 0);
                originalLines = lines.length;
                
                const linesToKeep = lines.filter(l => {
                    try {
                        const s = JSON.parse(l);
                        const ts = new Date(s.timestampUtc).getTime();
                        return ts >= minTimestamp;
                    } catch(e) {
                        return false; // exclude bad lines
                    }
                });

                retainedLines = linesToKeep.length;
                if (retainedLines !== originalLines) {
                     fs.writeFileSync(filePath, linesToKeep.join('\n') + '\n');
                }
            }
        } catch(e) {
            console.error(`Failed to clean up history file ${fileName}:`, e);
        }
    }
}
