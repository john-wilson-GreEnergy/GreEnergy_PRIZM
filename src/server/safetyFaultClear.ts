import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import protobuf from "protobufjs";
import { getEmsCachedBlock } from "./emsTurtleClient";
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
  entityType: string;
  entitySubType: string;
  statusMessage: string;
  enabled: boolean;
  ready: boolean;
  communicating: boolean;
  allowFaultReset: boolean;
  stationCode: string;
  blockIndex: string;
  sourceEndpoint: string;
  lastSeen: string;
  raw?: any;
}

function normalizeTopology(topologyData: any): SafetyFaultClearCandidate[] {
    const candidates: SafetyFaultClearCandidate[] = [];
    if (!topologyData) return candidates;

    // The topology might be an array or inside an object
    const list = Array.isArray(topologyData) ? topologyData : (topologyData.topology || []);

    for (const item of list) {
        if (!item || !item.entityKeyToken) continue;

        candidates.push({
            id: item.entityKeyToken || item.entityKey || item.displayKey || Math.random().toString(),
            displayKey: item.displayKey || "",
            entityKey: item.entityKey || "",
            entityKeyToken: item.entityKeyToken || "",
            entityType: item.entityType || "",
            entitySubType: item.entitySubType || "",
            statusMessage: item.statusMessage || "",
            enabled: Boolean(item.enabled),
            ready: Boolean(item.ready),
            communicating: Boolean(item.communicating),
            allowFaultReset: Boolean(item.allowFaultReset),
            stationCode: item.stationCode || "",
            blockIndex: item.blockIndex || "",
            sourceEndpoint: "/tools/monitor/ems/blockviewer/data",
            lastSeen: new Date().toISOString(),
            raw: item
        });
    }

    // Try mapping nested blocks/arrays/strings from blockviewer if "topology" isn't direct
    if (topologyData.arrays && Array.isArray(topologyData.arrays)) {
        for (const arr of topologyData.arrays) {
            if (arr.entityKeyToken) {
                 candidates.push(extractCandidate(arr));
            }
            if (arr.strings && Array.isArray(arr.strings)) {
                for (const str of arr.strings) {
                    if (str.entityKeyToken) {
                        candidates.push(extractCandidate(str));
                    }
                }
            }
        }
    }
    
    // De-duplicate by entityKeyToken
    const uniqueMap = new Map<string, SafetyFaultClearCandidate>();
    for (const cand of candidates) {
        uniqueMap.set(cand.entityKeyToken, cand);
    }
    
    return Array.from(uniqueMap.values());
}

function extractCandidate(item: any): SafetyFaultClearCandidate {
    return {
        id: item.entityKeyToken,
        displayKey: item.displayKey || "",
        entityKey: item.entityKey || "",
        entityKeyToken: item.entityKeyToken || "",
        entityType: item.entityType || "",
        entitySubType: item.entitySubType || "",
        statusMessage: item.statusMessage || "",
        enabled: Boolean(item.enabled),
        ready: Boolean(item.ready),
        communicating: Boolean(item.communicating),
        allowFaultReset: Boolean(item.allowFaultReset),
        stationCode: item.stationCode || "",
        blockIndex: item.blockIndex || "",
        sourceEndpoint: "/tools/monitor/ems/blockviewer/data",
        lastSeen: new Date().toISOString(),
        raw: item
    };
}

// 1. GET Candidates
router.get("/candidates", async (req, res) => {
    try {
        const profile = ProfileStore.getActiveProfile();
        if (!profile) {
            return res.json({ error: "No active profile" });
        }
        
        const baseUrl = buildEmsBaseUrl(profile);
        let topologyList: any = [];
        try {
            const url = baseUrl + "/tools/monitor/ems/blockviewer/data";
            const topoRes = await fetch(url);
            if (topoRes.ok) {
                topologyList = await topoRes.json();
            }
        } catch (err) {
            // fallback to cache if fetch fails
            const cachedBlock = getEmsCachedBlock();
            if (cachedBlock && cachedBlock.data) {
                topologyList = cachedBlock.data;
            }
        }

        const candidates = normalizeTopology(topologyList);
        const eligible = candidates.filter(c => c.allowFaultReset === true);
        const notEligible = candidates.filter(c => c.allowFaultReset !== true);

        // Sanitize sensitive info for the log
        const safeCandidates = candidates.map(({ raw, ...rest }) => rest);

        res.json({
            profileId: profile.id,
            emsBaseUrl: baseUrl,
            stationCode: topologyList.stationCode || "Default",
            blockIndex: topologyList.blockIndex || "0",
            generatedAt: new Date().toISOString(),
            eligible,
            notEligible,
            source: "/tools/monitor/ems/blockviewer/data"
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// 2. POST Execute
router.post("/execute", async (req, res) => {
    try {
        const { profileId, entityKeyToken, expectedDisplayKey, expectedStatusMessage, operatorUsername, confirmationText } = req.body;
        
        const profile = ProfileStore.getActiveProfile();
        if (!profile || profile.id !== profileId) {
            return res.status(400).json({ error: "Profile mismatch or no active profile" });
        }

        if (confirmationText !== entityKeyToken && confirmationText !== "CLEAR FAULT") {
             return res.status(400).json({ error: "Invalid confirmation text" });
        }

        const baseUrl = buildEmsBaseUrl(profile);
        const url = baseUrl + "/tools/monitor/ems/blockviewer/data";
        
        const topoRes = await fetch(url);
        if (!topoRes.ok) {
             return res.status(500).json({ error: "Failed preflight topology fetch" });
        }
        
        const topologyList = await topoRes.json();
        const candidates = normalizeTopology(topologyList);
        
        const targetEntity = candidates.find(c => c.entityKeyToken === entityKeyToken);
        if (!targetEntity) {
             return res.status(404).json({ error: "Entity not found in live topology" });
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

        // Build protobuf
        if (!root) {
            return res.status(500).json({ error: "Protobuf definition missing" });
        }

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
                     entityKey: entityKeyToken
                 }
            },
            username: operatorUsername || "local-prizm"
        };
        
        // Ensure protobuf schema matches keys properly
        const errMsg = CommandMessage.verify(commandPayload);
        if (errMsg) {
             return res.status(500).json({ error: "Protobuf validation failed: " + errMsg });
        }

        const message = CommandMessage.create(commandPayload);
        const buffer = CommandMessage.encode(message).finish();

        // Decode after encode validation
        try {
            const decoded = CommandMessage.decode(buffer) as any;
            if (decoded.commandTarget?.endpointType !== blockEnumValue) {
                throw new Error("Validation Failed: commandTarget endpointType is not BLOCK");
            }
            if (decoded.commandSource?.endpointType !== goblinEnumValue) {
                throw new Error("Validation Failed: commandSource endpointType is not GOBLIN");
            }
            if (!decoded.username) {
                throw new Error("Validation Failed: username is not populated");
            }
            if (decoded.commandPayload?.manualClearDeviceFault?.entityKey !== entityKeyToken) {
                throw new Error("Validation Failed: entityKey does not match the token");
            }
        } catch (validationErr: any) {
            return res.status(500).json({ error: "Pre-flight decode validation failed: " + validationErr.message });
        }

        const postUrl = baseUrl + "/tools/controls/ems/command";
        const cmdRes = await fetch(postUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/octet-stream"
            },
            body: Buffer.from(buffer) as any
        });

        // "treated as queued"
        const queued = cmdRes.status === 200;
        let responseSummary = "";
        try {
            responseSummary = await cmdRes.text();
        } catch(e) {}

        // Wait briefly
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Post-command fetch
        let afterEntity: SafetyFaultClearCandidate | null = null;
        let stillPresent = false;
        try {
             const postTopoRes = await fetch(url);
             if (postTopoRes.ok) {
                 const postList = await postTopoRes.json();
                 const postCand = normalizeTopology(postList);
                 afterEntity = postCand.find(c => c.entityKeyToken === entityKeyToken) || null;
                 stillPresent = !!afterEntity;
             }
        } catch(e) {}

        const appearsCleared = afterEntity ? (afterEntity.allowFaultReset === false && afterEntity.statusMessage !== targetEntity.statusMessage) : false;
        
        const warnings = [];
        if (afterEntity && afterEntity.allowFaultReset === true) {
            warnings.push("Entity remains eligible for fault reset after command execution. It may not have cleared.");
        }

        const result = {
            ok: queued,
            queued,
            commandId: commandPayload.commandId,
            profileId,
            emsBaseUrl: baseUrl,
            entityKeyToken,
            before: { ...targetEntity, raw: undefined },
            after: afterEntity ? { ...afterEntity, raw: undefined } : null,
            httpStatus: cmdRes.status,
            responseSummary,
            verification: {
                stillPresent,
                allowFaultResetBefore: targetEntity.allowFaultReset,
                allowFaultResetAfter: afterEntity ? afterEntity.allowFaultReset : null,
                statusMessageBefore: targetEntity.statusMessage,
                statusMessageAfter: afterEntity ? afterEntity.statusMessage : null,
                appearsCleared
            },
            warnings
        };

        // Audit Logging (console for local log)
        console.log("[AUDIT] SafetyFaultClear Execute Attempt:", JSON.stringify({
            timestamp: new Date().toISOString(),
            profileId,
            emsBaseUrl: baseUrl,
            operatorUsername: operatorUsername || "local-prizm",
            entityKeyToken,
            displayKey: targetEntity.displayKey,
            statusMessage_before: targetEntity.statusMessage,
            allowFaultReset_before: targetEntity.allowFaultReset,
            httpStatus: cmdRes.status,
            commandId: commandPayload.commandId,
            statusMessage_after: afterEntity?.statusMessage,
            allowFaultReset_after: afterEntity?.allowFaultReset,
            queued
        }));

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
