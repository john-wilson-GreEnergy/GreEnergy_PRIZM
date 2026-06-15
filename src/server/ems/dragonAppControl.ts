import { execFile } from "child_process";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import { getEmsCachedLastCall } from "../emsTurtleClient";
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

export async function buildSetEmsApplicationEnabledStatusCommand(input: SetAppStatusInput): Promise<{ commandBytes: Buffer; commandId: string }> {
  const tempDir = os.tmpdir();
  const outPath = path.join(tempDir, `cmd_${Date.now()}_${Math.random().toString(36).substring(7)}.bin`);
  
  const javaHelperPath = path.join(process.cwd(), "src/server/ems/java/BuildEmsAppEnableCommand.java");
  const username = input.requestedBy || "PRIZM";

  const classDir = process.env.PRIZM_JAVA_HELPER_CLASS_DIR || path.join(tempDir, `prizm_class_dir_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  const turtleLibGlob = process.env.PRIZM_TURTLE_LIB_CLASSPATH || "/home/john/turtle/WEB-INF/lib/*";

  try {
    // Ensure classDir exists
    await fs.mkdir(classDir, { recursive: true });

    // Compile with javac
    await new Promise<void>((resolve, reject) => {
      execFile("javac", [
        "-cp",
        turtleLibGlob,
        "-d",
        classDir,
        javaHelperPath
      ], (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Java compilation failed: ${err.message}. Stderr: ${stderr}`));
        } else {
          resolve();
        }
      });
    });

    // Run compiled class with java
    let spawnedStdout = "";
    await new Promise<void>((resolve, reject) => {
      execFile("java", [
        "-cp",
        `${classDir}:${turtleLibGlob}`,
        "BuildEmsAppEnableCommand",
        input.stationCode,
        input.blockIndex.toString(),
        input.appCode,
        input.priority.toString(),
        input.enabled.toString(),
        username,
        outPath
      ], (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Java execution failed: ${err.message}. Stderr: ${stderr}`));
        } else {
          spawnedStdout = stdout;
          resolve();
        }
      });
    });

    const commandBytes = await fs.readFile(outPath);
    const commandId = spawnedStdout.trim() || `gen-${Date.now()}`;

    // Clean up temporary files
    await fs.unlink(outPath).catch(() => {});
    await fs.rm(classDir, { recursive: true, force: true }).catch(() => {});
    
    return { commandBytes, commandId };
  } catch (err: any) {
    // Cleanup on failure
    await fs.unlink(outPath).catch(() => {});
    await fs.rm(classDir, { recursive: true, force: true }).catch(() => {});
    console.error("[DragonAppControl] Java helper build / execution failed:", err);
    throw new Error(`Failed to compile or build real command protobuf payload: ${err.message}`);
  }
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
  targetEnabled: boolean
): Promise<{ 
  status: "VERIFIED_SUCCESS" | "VERIFIED_FAILED" | "VERIFICATION_UNAVAILABLE"; 
  attempts: number; 
  liveEnabled?: boolean; 
  message?: string 
}> {
  // Wait at least 5 seconds before first readback to avoid stale pre-command data
  await new Promise(resolve => setTimeout(resolve, 5000));
  
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

  const maxAttempts = 15;
  const url = `http://127.0.0.1:3000/api/local/site-operations/summary?refresh=true&verifyTs=${Date.now()}`;
  let lastFoundLiveEnabled: boolean | undefined = undefined;
  let everFoundApp = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
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
      await new Promise(resolve => setTimeout(resolve, 2500));
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
  
  const lastCallCache = getEmsCachedLastCall();
  if (!lastCallCache || !lastCallCache.data) {
    return { success: false, error: "DATA_UNAVAILABLE", message: "Live app data cannot be read (lastCall.json not available)." };
  }

  const blockReport = lastCallCache.data.blockReport || lastCallCache.data;
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

  liveApp = searchApp(lastCallCache.data);

  if (input.confirmationText !== expectedConfirmation) {
    logAudit(false, "CONFIRMATION_REQUIRED", "REJECTED");
    return { success: false, error: "CONFIRMATION_REQUIRED", expectedConfirmationText: expectedConfirmation };
  }

  if (!liveApp) {
    logAudit(false, "APP_NOT_FOUND", "REJECTED");
    return { success: false, error: "APP_NOT_FOUND", message: `App ${input.appCode} not found in live EMS data.` };
  }

  const livePriority = liveApp.priority ?? liveApp.applicationPriority;
  if (livePriority !== undefined && Number(input.priority) !== Number(livePriority)) {
    logAudit(false, "PRIORITY_MISMATCH", "REJECTED");
    return { success: false, error: "PRIORITY_MISMATCH", message: "Requested priority does not match live EMS app priority.", requestedPriority: input.priority, livePriority: livePriority };
  }

  if (registry.interaction !== "enableDisable" || !registry.supportedLocally || registry.interaction === "readOnly") {
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
    const verification = await verifyEmsAppState(input.appCode, input.enabled);

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
          prizmCache.set("raw__tools_report_ems_lastCall_json", lastCallCache.data, {
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

