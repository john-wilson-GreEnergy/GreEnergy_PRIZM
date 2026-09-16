import fsSync from "fs";
import path from "path";
import protobuf from "protobufjs";
import { randomUUID } from "crypto";
import { getEmsCachedBlock, getEmsCachedLastCall } from "../emsTurtleClient";
import { ProfileStore } from "../profiles/profileStore";
import { buildEmsBaseUrl } from "../profiles/profileManager";

export interface SetPowerControlInput {
  stationCode: string;
  blockIndex: number;
  priority: number;
  realPowerkW: number;
  reactivePowerkVAr: number;
  requestedBy?: string;
}

const PROTO = `syntax = "proto3";
package phoenixtongue;
message Command { string commandId=1; string originalCommandId=3; Endpoint commandTarget=4; Endpoint commandSource=5; CommandPayload commandPayload=6; string username=7; }
message CommandPayload { SetEMSApplicationConfiguration setEMSApplicationConfiguration=200; }
message SetEMSApplicationConfiguration { string applicationTypeCode=1; uint32 applicationPriority=2; string applicationConfigurationName=5; int32 applicationConfigurationVersionid=6; bool enabled=7; bytes rawApplicationConfiguration=10; }
message Endpoint { EndpointType endpointType=1; string stationCode=2; uint32 blockIndex=3; }
enum EndpointType { INVALID_COMMAND_TARGET_TYPE=0; GOBLIN=1; STATION=2; BLOCK=3; }
`;

const root = protobuf.parse(PROTO).root;

export function parsePowerControlStatus(value: unknown) {
  const text = String(value || "");
  const real = text.match(/Real Power:\s*(-?[\d.]+)\s*kW/i);
  const reactive = text.match(/Reactive Power:\s*(-?[\d.]+)\s*kVAr/i);
  const grid = text.match(/Grid Mode:\s*([A-Z_]+)/i);
  return {
    realPowerkW: real ? Number(real[1]) : null,
    reactivePowerkVAr: reactive ? Number(reactive[1]) : null,
    gridMode: grid?.[1] || null,
  };
}

export function buildSetPowerControlCommand(input: SetPowerControlInput, enabled = true) {
  const Command = root.lookupType("phoenixtongue.Command");
  const commandId = randomUUID();
  const endpoint = { endpointType: 3, stationCode: input.stationCode.trim(), blockIndex: input.blockIndex };
  const config = {
    realPowerkW: input.realPowerkW,
    reactivePowerkVAr: input.reactivePowerkVAr,
    gridMode: "GRID_FOLLOWING",
    enabled,
    appConfigName: "instant",
    appConfigVersion: 0,
  };
  const payload = {
    commandId,
    commandTarget: endpoint,
    commandSource: endpoint,
    commandPayload: { setEMSApplicationConfiguration: {
      applicationTypeCode: "PC00001",
      applicationPriority: input.priority,
      applicationConfigurationName: "instant",
      applicationConfigurationVersionid: 0,
      enabled,
      rawApplicationConfiguration: Buffer.from(JSON.stringify(config)),
    }},
    username: input.requestedBy?.trim() || "local-prizm",
  };
  const error = Command.verify(payload);
  if (error) throw new Error(error);
  return { commandId, commandBytes: Buffer.from(Command.encode(Command.create(payload)).finish()), config };
}

function findApp(obj: any): any {
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj)) { for (const item of obj) { const found = findApp(item); if (found) return found; } }
  else {
    if (obj.appCode === "PC00001" || obj.applicationTypeCode === "PC00001") return obj;
    for (const value of Object.values(obj)) { const found = findApp(value); if (found) return found; }
  }
  return null;
}

export async function setPowerControl(input: SetPowerControlInput) {
  const auditId = randomUUID();
  const audit = (record: any) => {
    try {
      const file = path.join(process.cwd(), "data", "audit", "ems_app_control_audit.jsonl");
      fsSync.mkdirSync(path.dirname(file), { recursive: true });
      fsSync.appendFileSync(file, JSON.stringify({ timestamp: new Date().toISOString(), auditId, source: "PRIZM", action: "SET_POWER_CONTROL", ...record }) + "\n");
    } catch {}
  };
  if (![input.blockIndex, input.priority, input.realPowerkW, input.reactivePowerkVAr].every(Number.isFinite)) {
    return { success: false, error: "INVALID_INPUT", message: "Power values and target identity must be finite numbers." };
  }
  const cached = getEmsCachedLastCall()?.data || getEmsCachedBlock()?.data;
  const report = cached?.blockReport || cached;
  const topology = report?.topology || {};
  const station = topology.stationCode || report?.stationCode;
  const block = topology.blockIndex || report?.blockIndex;
  const app = findApp(cached);
  if (!app || station !== input.stationCode || Number(block) !== Number(input.blockIndex) || Number(app.priority ?? app.applicationPriority) !== Number(input.priority)) {
    return { success: false, error: "LIVE_TARGET_MISMATCH", message: "PC00001 target could not be matched to current live EMS data." };
  }
  const enabled = app.enabled !== false;
  const built = buildSetPowerControlCommand(input, enabled);
  const profile = ProfileStore.getActiveProfile();
  if (!profile) return { success: false, error: "NO_ACTIVE_PROFILE", message: "No active EMS profile." };
  const baseUrl = buildEmsBaseUrl(profile);
  let responseText = ""; let status = 0;
  try {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(`${baseUrl}/tools/controls/ems/command`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: built.commandBytes as any, signal: controller.signal });
    clearTimeout(timeout); status = response.status; responseText = await response.text();
    if (!response.ok) { audit({ accepted: false, status, responseText }); return { success: false, error: "EMS_REJECTED", message: `EMS rejected the command (${status}).` }; }
  } catch (error: any) {
    audit({ accepted: false, error: error.message }); return { success: false, error: "API_ERROR", message: error.message };
  }
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/tools/report/ems/lastCall.json?powerVerify=${Date.now()}-${attempt}`, { headers: { "Cache-Control": "no-cache" } });
      if (response.ok) {
        const live = findApp(await response.json()); const readback = parsePowerControlStatus(live?.appStatus);
        if (readback.realPowerkW === input.realPowerkW && readback.reactivePowerkVAr === input.reactivePowerkVAr) {
          audit({ accepted: true, verified: true, commandId: built.commandId, ...built.config });
          return { success: true, verified: true, auditId, commandId: built.commandId, readback, message: "Power Control setpoints verified by EMS readback." };
        }
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  audit({ accepted: true, verified: false, commandId: built.commandId, ...built.config });
  return { success: true, queued: true, verified: false, auditId, commandId: built.commandId, message: "EMS accepted the setpoints; fresh matching readback is still pending." };
}
