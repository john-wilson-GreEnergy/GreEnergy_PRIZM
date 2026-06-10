import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import protobuf from "protobufjs";
import { getEmsCachedBlock, getEmsCachedLastCall } from "./emsTurtleClient";
import { ProfileStore } from "./profiles/profileStore";
import { buildEmsBaseUrl } from "./profiles/profileManager";

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
  raw?: any;
}

function normalizeKey(key: string): string {
    if (!key) return "";
    return key.replace(/[-:]/g, "_");
}

function extractLastCallCandidates(obj: any, candidates: SafetyFaultClearCandidate[] = []): SafetyFaultClearCandidate[] {
    if (!obj || typeof obj !== 'object') return candidates;
    
    if (obj.entityKey && typeof obj.entityKey === 'string') {
        if (obj.allowFaultReset === true || 'allowFaultReset' in obj) {
            const rawHtml = obj.statusMessage || "";
            const plainText = rawHtml.replace(/<[^>]*>?/gm, '');

            candidates.push({
                id: obj.entityKey,
                displayKey: obj.displayKey || obj.entityKey,
                entityKey: obj.entityKey,
                entityKeyToken: normalizeKey(obj.entityKey),
                resetEntityKey: obj.entityKey,
                entityType: obj.entityType || "",
                entitySubType: obj.entitySubType || "",
                statusMessage: obj.statusMessage || "",
                statusMessageText: plainText,
                enabled: obj.enabled === true,
                ready: obj.ready === true,
                communicating: obj.communicating === true,
                allowFaultReset: Boolean(obj.allowFaultReset),
                stationCode: obj.stationCode || "",
                blockIndex: obj.blockIndex || "",
                source: "lastCall",
                sourceEndpoint: "/tools/report/ems/lastCall.json",
                blockviewerMatched: false,
                lastCallMatched: true,
                lastSeen: new Date().toISOString(),
                raw: obj
            });
        }
    }
    
    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            extractLastCallCandidates(obj[key], candidates);
        }
    }
    
    return candidates;
}

function extractBlockviewerCandidate(item: any): SafetyFaultClearCandidate {
    const rawHtml = item.statusMessage || "";
    const plainText = rawHtml.replace(/<[^>]*>?/gm, '');
    return {
        id: item.entityKeyToken || item.entityKey || item.displayKey || Math.random().toString(),
        displayKey: item.displayKey || "",
        entityKey: item.entityKey || "",
        entityKeyToken: item.entityKeyToken || "",
        resetEntityKey: item.entityKeyToken || "",
        entityType: item.entityType || "",
        entitySubType: item.entitySubType || "",
        statusMessage: item.statusMessage || "",
        statusMessageText: plainText,
        enabled: Boolean(item.enabled),
        ready: Boolean(item.ready),
        communicating: Boolean(item.communicating),
        allowFaultReset: Boolean(item.allowFaultReset),
        stationCode: item.stationCode || "",
        blockIndex: item.blockIndex || "",
        source: "blockviewer",
        sourceEndpoint: "/tools/monitor/ems/blockviewer/data",
        blockviewerMatched: true,
        lastCallMatched: false,
        lastSeen: new Date().toISOString(),
        raw: item
    };
}

function normalizeBlockviewerTopology(topologyData: any): SafetyFaultClearCandidate[] {
    const candidates: SafetyFaultClearCandidate[] = [];
    if (!topologyData) return candidates;

    const list = Array.isArray(topologyData) ? topologyData : (topologyData.topology || []);

    for (const item of list) {
        if (!item || !item.entityKeyToken) continue;
        candidates.push(extractBlockviewerCandidate(item));
    }

    if (topologyData.arrays && Array.isArray(topologyData.arrays)) {
        for (const arr of topologyData.arrays) {
            if (arr.entityKeyToken) {
                 candidates.push(extractBlockviewerCandidate(arr));
            }
            if (arr.strings && Array.isArray(arr.strings)) {
                for (const str of arr.strings) {
                    if (str.entityKeyToken) {
                        candidates.push(extractBlockviewerCandidate(str));
                    }
                }
            }
        }
    }
    
    const uniqueMap = new Map<string, SafetyFaultClearCandidate>();
    for (const cand of candidates) {
        uniqueMap.set(cand.entityKeyToken, cand);
    }
    
    return Array.from(uniqueMap.values());
}

function mergeCandidates(bvCandidates: SafetyFaultClearCandidate[], lcCandidates: SafetyFaultClearCandidate[]): SafetyFaultClearCandidate[] {
    const map = new Map<string, SafetyFaultClearCandidate>();
    
    for (const bv of bvCandidates) {
        map.set(bv.entityKeyToken, bv);
    }
    
    for (const lc of lcCandidates) {
        const normKey = normalizeKey(lc.entityKey);
        const existing = map.get(normKey);
        if (existing) {
            existing.lastCallMatched = true;
            existing.allowFaultReset = lc.allowFaultReset;
            if (lc.statusMessage) {
                existing.statusMessage = lc.statusMessage;
            }
            if (lc.statusMessageText) {
                existing.statusMessageText = lc.statusMessageText;
            }
            existing.enabled = lc.enabled;
            if ('ready' in lc.raw) existing.ready = lc.ready;
            existing.communicating = lc.communicating;
            existing.resetEntityKey = lc.entityKey;
            existing.source = "lastCall";
        } else {
            map.set(normKey, lc);
        }
    }
    
    return Array.from(map.values());
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

        const bvCandidates = normalizeBlockviewerTopology(blockData);
        const lcCandidates = extractLastCallCandidates(lastCallData);
        
        // De-dup lcCandidates by normalized key to avoid repeating the same one
        const lcUnique = new Map<string, SafetyFaultClearCandidate>();
        for (const c of lcCandidates) {
             const nk = normalizeKey(c.entityKey);
             lcUnique.set(nk, c);
        }

        const merged = mergeCandidates(bvCandidates, Array.from(lcUnique.values()));

        const eligible = merged.filter(c => c.allowFaultReset === true);
        const notEligible = merged.filter(c => c.allowFaultReset !== true);

        const safeEligible = eligible.map(({ raw, ...rest }) => rest);
        const safeNotEligible = notEligible.map(({ raw, ...rest }) => rest);

        res.json({
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
        });
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
        try {
             const r = await fetch(baseUrl + "/tools/monitor/ems/blockviewer/data");
             if (r.ok) blockData = await r.json();
        } catch(e) {}
        
        let lastCallData: any = {};
        try {
             const r = await fetch(baseUrl + "/tools/report/ems/lastCall.json");
             if (r.ok) lastCallData = await r.json();
        } catch(e) {}

        const bvCandidates = normalizeBlockviewerTopology(blockData);
        const lcCandidates = extractLastCallCandidates(lastCallData);
        
        const lcUnique = new Map<string, SafetyFaultClearCandidate>();
        for (const c of lcCandidates) {
             const nk = normalizeKey(c.entityKey);
             lcUnique.set(nk, c);
        }
        
        const merged = mergeCandidates(bvCandidates, Array.from(lcUnique.values()));
        
        const targetEntity = merged.find(c => c.entityKeyToken === entityKeyToken || normalizeKey(c.entityKey) === entityKeyToken);
        
        if (!targetEntity) {
             return res.status(404).json({ error: "Entity not found in live topology or lastCall" });
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

        if (!root) return res.status(500).json({ error: "Protobuf definition missing" });

        const EndpointTypeEnum = root.lookupEnum("phoenixtongue.EndpointType");
        const blockEnumValue = EndpointTypeEnum.values["BLOCK"];
        const goblinEnumValue = EndpointTypeEnum.values["GOBLIN"];

        const CommandMessage = root.lookupType("phoenixtongue.Command");
        const commandPayload = {
            commandId: uuidv4(),
            commandTarget: { endpointType: blockEnumValue },
            commandSource: { endpointType: goblinEnumValue },
            commandPayload: {
                 manualClearDeviceFault: {
                     entityKey: targetEntity.resetEntityKey || targetEntity.entityKeyToken
                 }
            },
            username: operatorUsername || "local-prizm"
        };
        
        const errMsg = CommandMessage.verify(commandPayload);
        if (errMsg) return res.status(500).json({ error: "Protobuf validation failed: " + errMsg });

        const message = CommandMessage.create(commandPayload);
        const buffer = CommandMessage.encode(message).finish();

        const postUrl = baseUrl + "/tools/controls/ems/command";
        const cmdRes = await fetch(postUrl, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: Buffer.from(buffer) as any
        });

        const queued = cmdRes.status === 200;
        let responseSummary = "";
        try { responseSummary = await cmdRes.text(); } catch(e) {}

        await new Promise(resolve => setTimeout(resolve, 2000));
        
        let postBlockData: any = [];
        try {
             const r = await fetch(baseUrl + "/tools/monitor/ems/blockviewer/data");
             if (r.ok) postBlockData = await r.json();
        } catch(e) {}
        
        let postLastCallData: any = {};
        try {
             const r = await fetch(baseUrl + "/tools/report/ems/lastCall.json");
             if (r.ok) postLastCallData = await r.json();
        } catch(e) {}
        
        const postBv = normalizeBlockviewerTopology(postBlockData);
        const postLc = extractLastCallCandidates(postLastCallData);
        const postLcUnique = new Map<string, SafetyFaultClearCandidate>();
        for (const c of postLc) postLcUnique.set(normalizeKey(c.entityKey), c);
        
        const postMerged = mergeCandidates(postBv, Array.from(postLcUnique.values()));
        const afterEntity = postMerged.find(c => c.entityKeyToken === targetEntity.entityKeyToken || normalizeKey(c.entityKey) === targetEntity.entityKeyToken) || null;

        const appearsCleared = afterEntity ? (afterEntity.allowFaultReset === false) : true;
        
        res.json({
            ok: queued,
            queued,
            commandId: commandPayload.commandId,
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
