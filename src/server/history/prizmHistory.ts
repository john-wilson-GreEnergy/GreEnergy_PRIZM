import fs from 'fs';
import path from 'path';

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

export async function appendSamples(samples: PrizmTelemetrySample[]): Promise<void> {
    if (!samples.length) return;
    try {
        if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
        const filePath = path.join(HISTORY_DIR, "telemetry-samples.jsonl");
        const lines = samples.map(s => JSON.stringify(s)).join('\n') + '\n';
        fs.appendFileSync(filePath, lines);
    } catch(err) {
        console.error("Failed to append telemetry:", err);
    }
}

export async function querySeries(params: any): Promise<PrizmTelemetrySample[]> {
    const { entityKey, metric, range } = params;
    const samples: PrizmTelemetrySample[] = [];
    try {
        const filePath = path.join(HISTORY_DIR, "telemetry-samples.jsonl");
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            content.split('\n').filter((l: string) => l.trim().length > 0).forEach((l: string) => {
                const s = JSON.parse(l);
                if (s.entityKey === entityKey && s.metricName === metric) {
                    samples.push(s);
                }
            });
        }
    } catch (err) {
       // Ignore
    }
    return samples;
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

export async function queryEvents(params: any): Promise<any[]> {
    const { entityKey, range } = params;
    const events: any[] = [];
    try {
        const filePath = path.join(HISTORY_DIR, "events.jsonl");
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            content.split('\n').filter((l: string) => l.trim().length > 0).forEach((l: string) => {
                const s = JSON.parse(l);
                if (s.entityKey === entityKey) {
                    events.push(s);
                }
            });
        }
    } catch (err) {
       // Ignore
    }
    return events;
}

export async function cleanupHistory(retentionPolicy: any): Promise<void> {
    // No-op for now
}
