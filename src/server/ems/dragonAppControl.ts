import fsSync from "fs";
import path from "path";
import protobuf from "protobufjs";
import { getEmsCachedBlock, getEmsCachedLastCall } from "../emsTurtleClient";
import { ProfileStore } from "../profiles/profileStore";
import { buildEmsBaseUrl } from "../profiles/profileManager";
import { getAppInteraction } from "./emsAppInteractionRegistry";
import { randomUUID } from "crypto";

export interface SetAppStatusInput {
  stationCode: string;
  blockIndex: number;
  appCode: string;
  priority: number;
  enabled: boolean;
  confirmationText: string;
  requestedBy?: string;
}

export interface SetAppStatusResult {
  success: boolean;
  queued?: boolean;
  stationCode?: string;
  blockIndex?: number;
  appCode?: string;
  priority?: number;
  enabled?: boolean;
  targetEndpointType?: string;
  commandResponseCode?: string;
  commandResponseText?: string;
  auditId?: string;
  error?: string;
  message?: string;
  requestedPriority?: number;
  livePriority?: number;
  expectedConfirmationText?: string;
  interaction?: string;
  supportedLocally?: boolean;
  verificationAttempts?: number;
}

const EMS_APP_CONTROL_PROTO = `syntax = "proto3";
package phoenixtongue;
message Command {
  string commandId = 1;
  string originalCommandId = 3;
  Endpoint commandTarget = 4;
  Endpoint commandSource = 5;
  CommandPayload commandPayload = 6;
  string username = 7;
}
message CommandPayload { SetEMSApplicationEnabledStatus setEMSApplicationEnabledStatus = 202; }
message SetEMSApplicationEnabledStatus {
  string applicationTypeCode = 1;
  uint32 applicationPriority = 2;
  bool enabled = 5;
}
message Endpoint {
  EndpointType endpointType = 1;
  string stationCode = 2;
  uint32 blockIndex = 3;
}
enum EndpointType { INVALID_COMMAND_TARGET_TYPE = 0; GOBLIN = 1; STATION = 2; BLOCK = 3; }
`;

const emsAppControlRoot = protobuf.parse(EMS_APP_CONTROL_PROTO).root;

export async function buildSetEmsApplicationEnabledStatusCommand(input: SetAppStatusInput): Promise<{ commandBytes: Buffer; commandId: string }> {
  const Command = emsAppControlRoot.lookupType("phoenixtongue.Command");
  const commandId = randomUUID();
  const endpoint = { endpointType: 3, stationCode: input.stationCode.trim(), blockIndex: input.blockIndex };
  const payload = {
    commandId,
    commandTarget: endpoint,
    commandSource: endpoint,
    commandPayload: {
      setEMSApplicationEnabledStatus: {
        applicationTypeCode: input.appCode,
        applicationPriority: input.priority,
        enabled: input.enabled,
      },
    },
    username: input.requestedBy?.trim() || "local-prizm",
  };
  const validationError = Command.verify(payload);
  if (validationError) throw new Error(`Protobuf validation failed: ${validationError}`);
  return { commandBytes: Buffer.from(Command.encode(Command.create(payload)).finish()), commandId };
}

function writeAuditLog(record: any) {
  const auditPath = path.join(process.cwd(), "data", "audit", "ems_app_control_audit.jsonl");
  try {
    fsSync.mkdirSync(path.dirname(auditPath), { recursive: true });
    fsSync.appendFileSync(auditPath, JSON.stringify(record) + "\n");
  } catch (err) {
    console.error("[DragonAppControl] Failed to write audit log:", err);
  }
}

// Verification background polling helper
async function verifyEmsAppState(
  appCode: string, 
  targetEnabled: boolean,
  baseUrl: string,
): Promise<{ 
  status: "VERIFIED_SUCCESS" | "VERIFIED_FAILED" | "VERIFICATION_UNAVAILABLE"; 
  attempts: number; 
  liveEnabled?: boolean; 
  message?: string 
}> {
  const searchAppInPayload = (obj: any): any => {
    if (!obj || typeof obj !== "object") return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = searchAppInPayload(item);
        if (found) return found;
      }
    } else {
      if (obj.appCode === appCode || obj.applicationTypeCode === appCode) {
        return obj;
      }
      for (const key of Object.keys(obj)) {
        const found = searchAppInPayload(obj[key]);
        if (found) return found;
      }
    }
    return null;
  };

  const maxAttempts = 12;
  let lastFoundLiveEnabled: boolean | undefined = undefined;
  let everFoundApp = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/tools/monitor/ems/blockviewer/data?verifyTs=${Date.now()}-${attempt}`, {
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });

      if (res.ok) {
        const summaryData = await res.json();
        const matchedApp = searchAppInPayload(summaryData);
        if (matchedApp) {
          everFoundApp = true;
          const liveEnabled = matchedApp.enabled !== undefined ? matchedApp.enabled : matchedApp.applicationEnabled;
          if (typeof liveEnabled === "boolean") {
            lastFoundLiveEnabled = liveEnabled;
            if (liveEnabled === targetEnabled) {
              return { 
                status: "VERIFIED_SUCCESS", 
                attempts: attempt, 
                liveEnabled, 
                message: `${appCode} ${targetEnabled ? "enable" : "disable"} verified by EMS readback.` 
              };
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[DragonAppControl] Attempt ${attempt} readback failed:`, err);
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (everFoundApp && typeof lastFoundLiveEnabled === "boolean") {
    return {
      status: "VERIFIED_FAILED",
      attempts: maxAttempts,
      liveEnabled: lastFoundLiveEnabled,
      message: `${appCode} state readback mismatch after polling. Expected ${targetEnabled}, got ${lastFoundLiveEnabled}.`
    };
  }

  return {
    status: "VERIFICATION_UNAVAILABLE",
    attempts: maxAttempts,
    message: `${appCode} could not be successfully read back or found in summary feed.`
  };
}

export async function setEmsApplicationEnabledStatus(input: SetAppStatusInput): Promise<SetAppStatusResult> {
  const auditId = randomUUID();
  
  let liveApp: any = null;
  let registry: any = null;

  const logAudit = (
    accepted: boolean, 
    reason: string, 
    commandResponseCode?: string,
    payloadBuildSucceeded?: boolean,
    turtleHttpStatus?: number,
    turtleResponseText?: string,
    verificationStatus?: string,
    verificationAttempts?: number,
    liveEnabledAfter?: boolean
  ) => {
    let liveEnabledBefore = null;
    if (liveApp) {
      if (typeof liveApp.enabled === "boolean") liveEnabledBefore = liveApp.enabled;
      else if (typeof liveApp.applicationEnabled === "boolean") liveEnabledBefore = liveApp.applicationEnabled;
    }
    
    writeAuditLog({
      timestamp: new Date().toISOString(),
      stationCode: input.stationCode,
      blockIndex: input.blockIndex,
      appCode: input.appCode,
      priority: input.priority,
      requestedEnabled: input.enabled,
      liveEnabledBefore,
      liveEnabledAfter: typeof liveEnabledAfter === "boolean" ? liveEnabledAfter : null,
      interaction: registry ? registry.interaction : "unknown",
      supportedLocally: registry ? registry.supportedLocally : false,
      accepted,
      rejectionReason: reason,
      payloadBuildSucceeded: !!payloadBuildSucceeded,
      turtleHttpStatus: turtleHttpStatus || null,
      turtleResponseText: turtleResponseText ? (turtleResponseText.length > 500 ? turtleResponseText.substring(0, 500) + "..." : turtleResponseText) : null,
      verificationStatus: verificationStatus || "UNVERIFIED",
      verificationAttempts: verificationAttempts || 0,
      commandResponseCode: commandResponseCode || (accepted ? "QUEUED" : "REJECTED"),
      operator: "local",
      source: "PRIZM",
      auditId
    });
  };

  if (!input.appCode || typeof input.appCode !== "string" || input.appCode.includes("*") || input.appCode.includes(",")) {
    logAudit(false, "INVALID_APP_CODE", "REJECTED");
    return { success: false, error: "INVALID_APP_CODE", message: "Missing or invalid appCode" };
  }

  const expectedConfirmation = `${input.enabled ? "ENABLE" : "DISABLE"} ${input.appCode}`;
  registry = getAppInteraction(input.appCode);

  if (input.confirmationText !== expectedConfirmation) {
    logAudit(false, "CONFIRMATION_REQUIRED", "REJECTED");
    return { success: false, error: "CONFIRMATION_REQUIRED", expectedConfirmationText: expectedConfirmation };
  }
  
  const appStateCache = getEmsCachedBlock();
  const lastCallCache = getEmsCachedLastCall();
  if (!appStateCache?.data) {
    return { success: false, error: "DATA_UNAVAILABLE", message: "Live EMS app data cannot be read from BlockViewer." };
  }

  const identityPayload = lastCallCache?.data || appStateCache.data;
  const blockReport = identityPayload.blockReport || identityPayload;
  const topology = blockReport.topology || {};
  const currentStationCode = topology.stationCode || blockReport.stationCode || "BHE0021";
  const currentBlockIndex = topology.blockIndex || blockReport.blockIndex || 1;

  if (input.stationCode !== currentStationCode || Number(input.blockIndex) !== Number(currentBlockIndex)) {
    logAudit(false, "STATION_BLOCK_MISMATCH", "REJECTED");
    return { success: false, error: "STATION_BLOCK_MISMATCH", message: "Mismatched station/block against live data." };
  }

  function searchApp(obj: any): any {
    if (!obj || typeof obj !== "object") return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = searchApp(item);
        if (found) return found;
      }
    } else {
      if ((obj.appCode === input.appCode || obj.applicationTypeCode === input.appCode)) {
        return obj;
      }
      for (const key of Object.keys(obj)) {
        const found = searchApp(obj[key]);
        if (found) return found;
      }
    }
    return null;
  }

  liveApp = searchApp(appStateCache.data);

  if (!liveApp) {
    logAudit(false, "APP_NOT_FOUND", "REJECTED");
    return { success: false, error: "APP_NOT_FOUND", message: `App ${input.appCode} not found in live EMS data.` };
  }

  const livePriority = liveApp.priority ?? liveApp.applicationPriority;
  if (livePriority !== undefined && Number(input.priority) !== Number(livePriority)) {
    logAudit(false, "PRIORITY_MISMATCH", "REJECTED");
    return { success: false, error: "PRIORITY_MISMATCH", message: "Requested priority does not match live EMS app priority.", requestedPriority: input.priority, livePriority: livePriority };
  }

  if (!["enableDisable", "powerControl"].includes(registry.interaction) || !registry.supportedLocally || registry.interaction === "readOnly") {
    logAudit(false, "APP_NOT_SUPPORTED_LOCALLY", "REJECTED");
    return { success: false, error: "APP_NOT_SUPPORTED_LOCALLY", message: "This EMS app is not supported for local enable/disable control.", appCode: input.appCode, interaction: registry.interaction, supportedLocally: registry.supportedLocally };
  }

  // Build protobuf command bytes (Throw on failure)
  let buildResult: { commandBytes: Buffer; commandId: string };
  try {
    buildResult = await buildSetEmsApplicationEnabledStatusCommand(input);
  } catch (err: any) {
    logAudit(false, "PAYLOAD_BUILD_FAILED", "REJECTED", false, undefined, undefined, "PAYLOAD_BUILD_FAILED");
    return {
      success: false,
      error: "PAYLOAD_BUILD_FAILED",
      message: `Failed to build EMS app control protobuf command payload: ${err.message}`
    };
  }

  const { commandBytes } = buildResult;

  if (!commandBytes || commandBytes.length === 0 || commandBytes.toString() === "DUMMY_PROTOBUF_BYTES") {
    logAudit(false, "DUMMY_PAYLOAD_BLOCKED", "DUMMY_PAYLOAD_BLOCKED", false, undefined, undefined, "DUMMY_PAYLOAD_BLOCKED");
    return {
      success: false,
      error: "DUMMY_PAYLOAD_BLOCKED",
      commandResponseCode: "DUMMY_PAYLOAD_BLOCKED",
      message: "The generated command payload is dummy or empty, and sending is blocked."
    };
  }

  // Post to Turtle
  const profile = ProfileStore.getActiveProfile();
  if (!profile) {
    logAudit(false, "NO_ACTIVE_PROFILE", "REJECTED", true);
    return { success: false, error: "NO_ACTIVE_PROFILE", message: "No active profile." };
  }
  
  const baseUrl = buildEmsBaseUrl(profile);
  const postUrl = `${baseUrl}/tools/controls/ems/command`;

  let responseText = "";
  let httpStatus = 0;
  let dispatched = false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream"
      },
      body: commandBytes as any,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    httpStatus = res.status;
    try { responseText = await res.text(); } catch(e) {}

    // Treat Turtle HTTP response as dispatch evidence only.
    if (res.ok || (responseText && (responseText.includes("QUEUED") || responseText.includes("200")))) {
      dispatched = true;
    }
  } catch (err: any) {
    logAudit(false, `API_ERROR_${err.message}`, "FAILED", true);
    return { success: false, error: "API_ERROR", message: `Failed to POST command to Turtle: ${err.message}` };
  }

  if (dispatched) {
    // Perform fresh readback verification
    const verification = await verifyEmsAppState(input.appCode, input.enabled, baseUrl);

    if (verification.status === "VERIFIED_SUCCESS") {
      logAudit(
        true, 
        "VERIFIED_SUCCESS", 
        "HTTP_200_BUT_VERIFIED", 
        true, 
        httpStatus, 
        responseText, 
        verification.status, 
        verification.attempts, 
        verification.liveEnabled
      );

      // Mutate cache/storage so standard simulator readback catches it immediately
      if (liveApp) {
        if (typeof liveApp.enabled !== "undefined") liveApp.enabled = input.enabled;
        if (typeof liveApp.applicationEnabled !== "undefined") liveApp.applicationEnabled = input.enabled;
        if (liveApp.health !== undefined) liveApp.health = input.enabled ? "HEALTH_HEALTHY" : "NOT_ENABLED";
        if (liveApp.applicationHealth !== undefined) liveApp.applicationHealth = input.enabled ? "HEALTH_HEALTHY" : "NOT_ENABLED";
        
        try {
          const prizmCache = require("../cache/prizmCache");
          prizmCache.set("raw__tools_monitor_ems_blockviewer_data", appStateCache.data, {
            isRaw: true,
            rawExt: ".json",
            ttlMs: 15000
          });
        } catch (err) {
          console.warn("[DragonAppControl] Could not write mutated app lastCall back to prizmCache:", err);
        }
      }

      return {
        success: true,
        queued: false,
        stationCode: input.stationCode,
        blockIndex: input.blockIndex,
        appCode: input.appCode,
        priority: input.priority,
        enabled: input.enabled,
        targetEndpointType: "BLOCK",
        commandResponseCode: "HTTP_200_BUT_VERIFIED",
        verificationAttempts: verification.attempts,
        auditId,
        message: "Command verified by EMS readback."
      };
    } else {
      logAudit(
        false, 
        verification.status, 
        "REJECTED", 
        true, 
        httpStatus, 
        responseText, 
        verification.status, 
        verification.attempts, 
        verification.liveEnabled
      );

      if (verification.status === "VERIFIED_FAILED") {
        return {
          success: false,
          error: "VERIFIED_FAILED",
          commandResponseCode: "VERIFIED_FAILED",
          verificationAttempts: verification.attempts,
          livePriority,
          message: `${input.appCode} state readback mismatch. Expected ${input.enabled ? "enabled" : "disabled"}, got ${verification.liveEnabled ? "enabled" : "disabled"}.`
        };
      } else {
        return {
          success: false,
          error: "VERIFICATION_UNAVAILABLE",
          commandResponseCode: "VERIFICATION_UNAVAILABLE",
          verificationAttempts: verification.attempts,
          message: `${input.appCode} could not be verified on EMS summary feed after dispatch.`
        };
      }
    }
  } else {
    logAudit(false, "REJECTED_BY_TURTLE", "REJECTED", true, httpStatus, responseText, "DISPATCH_FAILED");
    return {
      success: false,
      error: "REJECTED_BY_TURTLE",
      message: "Command was not successfully received or queued by EMS controller",
      commandResponseCode: "FAILED",
      commandResponseText: responseText
    };
  }
}
