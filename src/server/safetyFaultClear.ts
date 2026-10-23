import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import protobuf from "protobufjs";
import { getEmsCachedBlock, getEmsCachedLastCall } from "./emsTurtleClient";
import { ProfileStore } from "./profiles/profileStore";
import { buildEmsBaseUrl } from "./profiles/profileManager";
import { safetyFaultEquipment } from './safetyFaultIdentity';

const router = Router();

export const SAFETY_FAULT_CLEAR_PROTO = `syntax = "proto3";

package phoenixtongue;

message Command {
  string commandId = 1;
  string originalCommandId = 3;
  Endpoint commandTarget = 4;
  Endpoint commandSource = 5;
  CommandPayload commandPayload = 6;
  string username = 7;
}

message CommandPayload {
  ManualClearDeviceFault manualClearDeviceFault = 51;
}

message ManualClearDeviceFault {
  string entityKey = 1;
}

message Endpoint {
  EndpointType endpointType = 1;
  string stationCode = 2;
  uint32 blockIndex = 3;
  uint32 arrayIndex = 4;
  uint32 stringIndex = 5;
  uint32 batteryPackIndex = 6;
  uint32 cellGroupIndex = 7;
  uint32 arrayPcsIndex = 8;
  uint32 blockMeterIndex = 9;
  uint32 blockDataSourceIndex = 10;
  uint32 blockHvacIndex = 11;
  uint32 lowVoltageMeterIndex = 12;
  uint32 openClosedDetectorIndex = 13;
  uint32 containerIndex = 14;
  uint32 humidityTemperatureSensorIndex = 15;
  uint32 dcDcConverterModuleIndex = 16;
  uint32 upsIndex = 17;
  uint32 arrayGFDIndex = 18;
  uint32 digitalSwitchesIndex = 19;
  uint32 dcDcConverterGroupIndex = 20;
  uint32 dcDcParallelingControllerIndex = 21;
  uint32 blockEnclosureIndex = 22;
  uint32 fanControlRelayIndex = 23;
  uint32 multiPcsManagerIndex = 24;
  uint32 dispatchableDcDcBatteryIndex = 26;
  uint32 acPvBatteryIndex = 27;
  uint32 pvPcsIndex = 28;
  uint32 loadTapChangerIndex = 29;
  uint32 emsIndex = 30;
  uint32 bmsIndex = 31;
  uint32 blockEnclosureGroupIndex = 32;
  uint32 featherIndex = 33;
}

enum EndpointType {
  INVALID_COMMAND_TARGET_TYPE = 0;
  GOBLIN = 1;
  STATION = 2;
  BLOCK = 3;
  ARRAY = 4;
  STRING = 5;
  BATTERY_PACK = 6;
  CELL_GROUP = 7;
  ARRAY_PCS = 8;
  BLOCK_METER = 9;
  BLOCK_DATA_SOURCE = 10;
  BLOCK_HVAC = 11;
  LOW_VOLTAGE_METER = 12;
  OPEN_CLOSED_DETECTOR = 13;
  AC_BATTERY = 14;
  CONTAINER = 15;
  HUMIDITY_TEMPERATURE_SENSOR = 16;
  DC_DC_CONVERTER = 17;
  UPS = 18;
  ARRAY_GFD = 19;
  PV_PCS = 20;
  DIGITAL_SWITCHES = 21;
  DC_DC_CONVERTER_GROUP = 22;
  DC_DC_PARALLELING_CONTROLLER = 23;
  BLOCK_ENCLOSURE = 24;
  FAN_CONTROL_RELAY = 25;
  DISPATCHABLE_DC_DC_BATTERY = 26;
  AC_PV_BATTERY = 27;
  MULTI_PCS_MANAGER = 28;
  LOAD_TAP_CHANGER = 29;
  EMS = 30;
  BMS = 31;
  BLOCK_ENCLOSURE_CONTROLLER = 32;
  FIRE_PANEL = 33;
  BLOCK_ENCLOSURE_GROUP = 34;
  FEATHER = 35;
}`;

let root: protobuf.Root | null = null;
try {
  root = protobuf.parse(SAFETY_FAULT_CLEAR_PROTO).root;
} catch (err) {
  console.warn("Could not parse SAFETY_FAULT_CLEAR_PROTO inline", err);
}

export function buildSafetyFaultClearCommand(input: {
  stationCode: string;
  blockIndex: number;
  entityKey: string;
  operatorUsername?: string;
  commandId?: string;
}): { commandId: string; buffer: Uint8Array } {
  if (!root) throw new Error("Protobuf definition missing");
  if (!input.stationCode?.trim()) throw new Error("Station code is required");
  if (!Number.isSafeInteger(input.blockIndex) || input.blockIndex < 1) throw new Error("Valid block index is required");
  if (!input.entityKey?.trim()) throw new Error("Reset entity key is required");

  const EndpointTypeEnum = root.lookupEnum("phoenixtongue.EndpointType");
  const CommandMessage = root.lookupType("phoenixtongue.Command");
  const commandId = input.commandId || uuidv4();
  const blockEndpoint = {
    endpointType: EndpointTypeEnum.values.BLOCK,
    stationCode: input.stationCode.trim(),
    blockIndex: input.blockIndex,
  };
  const commandPayload = {
    commandId,
    commandTarget: blockEndpoint,
    commandSource: blockEndpoint,
    commandPayload: {
      manualClearDeviceFault: { entityKey: input.entityKey.trim() },
    },
    username: input.operatorUsername?.trim() || "local-prizm",
  };
  const validationError = CommandMessage.verify(commandPayload);
  if (validationError) throw new Error(`Protobuf validation failed: ${validationError}`);
  return { commandId, buffer: CommandMessage.encode(CommandMessage.create(commandPayload)).finish() };
}

export interface SafetyFaultClearCandidate {
  id: string;
  displayKey: string;
  entityKey: string;
  entityKeyToken: string;
  resetEntityKey: string;
  entityType: string;
  entitySubType: string;
  statusMessage: string;
  statusMessageText: string;
  enabled: boolean;
  ready: boolean;
  communicating: boolean;
  allowFaultReset: boolean;
  stationCode: string;
  blockIndex: string;
  source: string;
  sourceEndpoint: string;
  blockviewerMatched: boolean;
  lastCallMatched: boolean;
  lastSeen: string;
  equipment?: ReturnType<typeof safetyFaultEquipment>;
  resetBlockedReason?: string;
  resetEvidence?: SafetyResetEvidence[];
  raw?: any;
}

interface SafetyResetEvidence {
  source: string;
  allowFaultReset: boolean | null;
  enabled: boolean | null;
  communicating: boolean | null;
  identityProblem: boolean;
}

function normalizeKey(key: string): string {
    if (!key) return "";
    return key.trim().replace(/[-:]/g, "_");
}

/** Inspect both feeds fully, including keyed maps and deeply nested controller records.
 * A missing identity must not hide a positive flag: retain a diagnostic-only row.
 * Iteration + WeakSet tolerate deep/cyclic offline fixtures without truncating discovery.
 */
function collectSafetyCandidates(data: unknown, source: 'blockviewer' | 'lastCall'): SafetyFaultClearCandidate[] {
    const candidates: SafetyFaultClearCandidate[] = [];
    const pending: {value: unknown; path: string}[] = [{value: data, path: '$'}];
    const seen = new WeakSet<object>();
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    const flag = (value: unknown) => typeof value === 'boolean' ? value : null;
    while (pending.length) {
        const {value, path} = pending.pop()!;
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        const raw = value as Record<string, unknown>;
        for (const [key, child] of Object.entries(raw)) {
            if (child && typeof child === 'object') pending.push({value: child, path: path + '[' + JSON.stringify(key) + ']'});
        }
        if (!Object.prototype.hasOwnProperty.call(raw, 'allowFaultReset')) continue;
        const entityKey = text(raw.entityKey);
        const suppliedToken = text(raw.entityKeyToken);
        const token = normalizeKey(entityKey || suppliedToken);
        const identityProblem = !token || !!(entityKey && suppliedToken && normalizeKey(suppliedToken) !== token);
        const statusMessage = text(raw.statusMessage);
        candidates.push({
            id: token || `unresolved:${source}:${path}`,
            entityKey, entityKeyToken: token || `unresolved:${source}:${path}`,
            resetEntityKey: identityProblem ? '' : entityKey || suppliedToken,
            displayKey: text(raw.displayKey) || entityKey || suppliedToken || 'Equipment identity unavailable',
            entityType: text(raw.entityType), entitySubType: text(raw.entitySubType),
            statusMessage, statusMessageText: statusMessage.replace(/<[^>]*>?/gm, ''),
            enabled: raw.enabled === true, ready: raw.ready === true, communicating: raw.communicating === true,
            allowFaultReset: raw.allowFaultReset === true,
            stationCode: text(raw.stationCode), blockIndex: String(raw.blockIndex ?? ''),
            source, sourceEndpoint: source === 'lastCall' ? '/tools/report/ems/lastCall.json' : '/tools/monitor/ems/blockviewer/data',
            blockviewerMatched: source === 'blockviewer', lastCallMatched: source === 'lastCall',
            lastSeen: new Date().toISOString(), raw,
            resetEvidence: [{source, allowFaultReset: flag(raw.allowFaultReset), enabled: flag(raw.enabled),
                communicating: flag(raw.communicating), identityProblem}],
        });
    }
    return candidates;
}

function extractLastCallCandidates(data: unknown): SafetyFaultClearCandidate[] {
    return collectSafetyCandidates(data, 'lastCall');
}

function normalizeBlockviewerTopology(data: unknown): SafetyFaultClearCandidate[] {
    return collectSafetyCandidates(data, 'blockviewer');
}

function mergeCandidates(bvCandidates: SafetyFaultClearCandidate[], lcCandidates: SafetyFaultClearCandidate[]): SafetyFaultClearCandidate[] {
    const groups = new Map<string, SafetyFaultClearCandidate[]>();
    for (const candidate of [...bvCandidates, ...lcCandidates]) {
        const group = groups.get(candidate.entityKeyToken) || [];
        group.push(candidate);
        groups.set(candidate.entityKeyToken, group);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => {
        // Prefer a positive issue description, then lastCall's canonical reset key.
        // Never let iteration order or an unversioned negative erase positive evidence.
        group.sort((a, b) => Number(b.allowFaultReset) - Number(a.allowFaultReset) ||
            Number(b.source === 'lastCall') - Number(a.source === 'lastCall') ||
            a.statusMessage.localeCompare(b.statusMessage) || a.displayKey.localeCompare(b.displayKey));
        const evidence = group.flatMap(c => c.resetEvidence || []);
        const positive = evidence.some(e => e.allowFaultReset === true);
        const identityProblem = evidence.some(e => e.identityProblem) ||
            new Set(group.map(c => c.entityKey).filter(Boolean)).size > 1;
        const resetConflict = positive && evidence.some(e => e.allowFaultReset !== true);
        const stateIncomplete = positive && evidence.some(e => e.enabled === null || e.communicating === null);
        const reason = identityProblem ? 'Equipment identity missing or inconsistent; reset blocked.' :
            resetConflict ? 'Reset reports disagree or are incomplete; refresh and review before clearing.' :
            stateIncomplete ? 'Equipment state incomplete; refresh and review before clearing.' : undefined;
        const canonicalKey = group.find(c => c.entityKey)?.entityKey;
        return {...group[0],
            entityKey: canonicalKey || group[0].entityKey,
            resetEntityKey: identityProblem ? '' : canonicalKey || group[0].resetEntityKey,
            allowFaultReset: positive,
            enabled: evidence.every(e => e.enabled === true),
            communicating: evidence.every(e => e.communicating === true),
            blockviewerMatched: group.some(c => c.blockviewerMatched),
            lastCallMatched: group.some(c => c.lastCallMatched),
            resetEvidence: evidence, resetBlockedReason: reason,
        };
    });
}

export function buildSafetyFaultCandidateSnapshot(blockData: any, lastCallData: any) {
    const blockviewerCandidates = normalizeBlockviewerTopology(blockData);
    const lastCallCandidates = extractLastCallCandidates(lastCallData);
    const merged = mergeCandidates(blockviewerCandidates, lastCallCandidates).map(candidate => ({
        ...candidate, equipment: safetyFaultEquipment(candidate.raw || {}, candidate.entityKey || candidate.entityKeyToken, candidate.displayKey),
    }));
    return {
        eligible: merged.filter(candidate => candidate.allowFaultReset === true),
        notEligible: merged.filter(candidate => candidate.allowFaultReset !== true),
        blockviewerCandidates,
        lastCallCandidates,
    };
}

router.get("/candidates", async (req, res) => {
    try {
        const profile = ProfileStore.getActiveProfile();
        if (!profile) return res.json({ error: "No active profile" });
        
        const baseUrl = buildEmsBaseUrl(profile);
        
        let blockData: any = [];
        let blockOk = false;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500);
            const topoRes = await fetch(baseUrl + "/tools/monitor/ems/blockviewer/data", { signal: controller.signal });
            clearTimeout(timeoutId);
            if (topoRes.ok) {
                blockData = await topoRes.json();
                blockOk = true;
            }
        } catch (err) {
            const cachedBlock = getEmsCachedBlock();
            if (cachedBlock && cachedBlock.data) blockData = cachedBlock.data;
        }

        let lastCallData: any = {};
        let lastCallOk = false;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500);
            const lcRes = await fetch(baseUrl + "/tools/report/ems/lastCall.json", { signal: controller.signal });
            clearTimeout(timeoutId);
            if (lcRes.ok) {
                lastCallData = await lcRes.json();
                lastCallOk = true;
            }
        } catch (err) {
            const cachedLc = getEmsCachedLastCall();
            if (cachedLc && cachedLc.data) lastCallData = cachedLc.data;
        }

        const { eligible, notEligible, blockviewerCandidates: bvCandidates, lastCallCandidates: lcCandidates } =
            buildSafetyFaultCandidateSnapshot(blockData, lastCallData);

        const safeEligible = eligible.map(({ raw, ...rest }) => rest);
        const safeNotEligible = notEligible.map(({ raw, ...rest }) => rest);

        const responseData = {
            profileId: profile.id,
            emsBaseUrl: baseUrl,
            stationCode: blockData.stationCode || "Default",
            blockIndex: blockData.blockIndex || "0",
            generatedAt: new Date().toISOString(),
            sources: {
                blockviewer: { ok: blockOk, url: "/tools/monitor/ems/blockviewer/data", count: bvCandidates.length, eligibleCount: bvCandidates.filter(c=>c.allowFaultReset).length },
                lastCall: { ok: lastCallOk, url: "/tools/report/ems/lastCall.json", count: lcCandidates.length, eligibleCount: lcCandidates.filter(c=>c.allowFaultReset).length }
            },
            eligible: safeEligible,
            notEligible: safeNotEligible
        };
        try {
            const prizmCache = require('./cache/prizmCache');
            prizmCache.set('safety-candidates', responseData, { ttlMs: 15000 });
            if (prizmCache.writeTelemetryHistoryIfEnabled) prizmCache.writeTelemetryHistoryIfEnabled('safety-candidates', responseData);
        } catch(e) {}
        res.json(responseData);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/execute", async (req, res) => {
    try {
        const { profileId, entityKeyToken, confirmationText, operatorUsername } = req.body;
        
        const profile = ProfileStore.getActiveProfile();
        if (!profile || profile.id !== profileId) return res.status(400).json({ error: "Profile mismatch or no active profile" });

        if (confirmationText !== entityKeyToken && confirmationText !== "CLEAR FAULT") {
             return res.status(400).json({ error: "Invalid confirmation text" });
        }

        const baseUrl = buildEmsBaseUrl(profile);
        
        // Preflight fetch
        let blockData: any = [];
        let blockVerified = false;
        try {
             const r = await fetch(baseUrl + "/tools/monitor/ems/blockviewer/data");
             if (r.ok) {
                 blockData = await r.json();
                 blockVerified = !!blockData && typeof blockData === 'object';
             }
        } catch(e) {}
        
        let lastCallData: any = {};
        let lastCallVerified = false;
        try {
             const r = await fetch(baseUrl + "/tools/report/ems/lastCall.json");
             if (r.ok) {
                 lastCallData = await r.json();
                 lastCallVerified = !!lastCallData && typeof lastCallData === 'object';
             }
        } catch(e) {}

        // A missing feed must not make an earlier disagreement look resolved.
        if (!blockVerified || !lastCallVerified) {
            return res.status(409).json({error: 'Both safety reports must be available for live reset verification.'});
        }

        const preflight = buildSafetyFaultCandidateSnapshot(blockData, lastCallData);
        const merged = [...preflight.eligible, ...preflight.notEligible];
        
        const targetEntity = merged.find(c => c.entityKeyToken === entityKeyToken || normalizeKey(c.entityKey) === entityKeyToken);
        
        if (!targetEntity) {
             return res.status(404).json({ error: "Entity not found in live topology or lastCall" });
        }
        if (targetEntity.resetBlockedReason || !targetEntity.resetEntityKey) {
             return res.status(409).json({ error: targetEntity.resetBlockedReason || 'Equipment identity unavailable' });
        }
        // Selection is bound to the reviewed issue, not just a reusable entity token.
        if ((req.body.expectedDisplayKey !== undefined && req.body.expectedDisplayKey !== targetEntity.displayKey) ||
            (req.body.expectedStatusMessage !== undefined && req.body.expectedStatusMessage !== targetEntity.statusMessage) ||
            (req.body.expectedResetEntityKey !== undefined && req.body.expectedResetEntityKey !== targetEntity.resetEntityKey)) {
            return res.status(409).json({ error: "The selected fault changed. Review fresh candidates before clearing." });
        }
        if (targetEntity.allowFaultReset !== true) {
             return res.status(400).json({ error: "allowFaultReset expects true but was false" });
        }
        if (targetEntity.communicating === false) {
             return res.status(400).json({ error: "Entity is not communicating" });
        }
        if (targetEntity.enabled === false) {
             return res.status(400).json({ error: "Entity is not enabled" });
        }

        const stationCode = String(profile.stationCode || targetEntity.stationCode || "").trim();
        const blockIndex = Number(profile.blockIndex || targetEntity.blockIndex);
        const command = buildSafetyFaultClearCommand({
            stationCode,
            blockIndex,
            entityKey: targetEntity.resetEntityKey || targetEntity.entityKeyToken,
            operatorUsername,
        });

        const postUrl = baseUrl + "/tools/controls/ems/command";
        const cmdRes = await fetch(postUrl, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: Buffer.from(command.buffer) as any
        });

        const queued = cmdRes.status === 200;
        let responseSummary = "";
        try { responseSummary = await cmdRes.text(); } catch(e) {}

        await new Promise(resolve => setTimeout(resolve, 2000));
        
        let postBlockData: any = [];
        let postBlockVerified = false;
        try {
             const r = await fetch(baseUrl + "/tools/monitor/ems/blockviewer/data");
             if (r.ok) {
                 postBlockData = await r.json();
                 postBlockVerified = !!postBlockData && typeof postBlockData === 'object';
             }
        } catch(e) {}
        
        let postLastCallData: any = {};
        let postLastCallVerified = false;
        try {
             const r = await fetch(baseUrl + "/tools/report/ems/lastCall.json");
             if (r.ok) {
                 postLastCallData = await r.json();
                 postLastCallVerified = !!postLastCallData && typeof postLastCallData === 'object';
             }
        } catch(e) {}
        
        const postflight = buildSafetyFaultCandidateSnapshot(postBlockData, postLastCallData);
        const postMerged = [...postflight.eligible, ...postflight.notEligible];
        const afterEntity = postMerged.find(c => c.entityKeyToken === targetEntity.entityKeyToken || normalizeKey(c.entityKey) === targetEntity.entityKeyToken) || null;

        // Missing telemetry is not evidence of clearance.
        const appearsCleared = queued && postBlockVerified && postLastCallVerified &&
            afterEntity?.allowFaultReset === false && afterEntity.communicating === true &&
            !afterEntity.resetBlockedReason && afterEntity.resetEvidence?.every(e => e.allowFaultReset === false) === true;
        
        res.json({
            ok: queued,
            queued,
            commandId: command.commandId,
            profileId,
            emsBaseUrl: baseUrl,
            entityKeyToken: targetEntity.entityKeyToken,
            usedResetKey: targetEntity.resetEntityKey,
            before: { ...targetEntity, raw: undefined },
            after: afterEntity ? { ...afterEntity, raw: undefined } : null,
            httpStatus: cmdRes.status,
            responseSummary,
            verification: {
                stillPresent: !!afterEntity,
                allowFaultResetBefore: targetEntity.allowFaultReset,
                allowFaultResetAfter: afterEntity ? afterEntity.allowFaultReset : null,
                appearsCleared
            }
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
