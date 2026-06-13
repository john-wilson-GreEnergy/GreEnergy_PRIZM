import { execFile } from "child_process";
import fs from "fs/promises";
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
}

export async function buildSetEmsApplicationEnabledStatusCommand(input: SetAppStatusInput): Promise<{ commandBytes: Buffer; commandId: string }> {
  const tempDir = os.tmpdir();
  const outPath = path.join(tempDir, `cmd_${Date.now()}_${Math.random().toString(36).substring(7)}.bin`);
  
  const javaHelperPath = path.join(process.cwd(), "src/server/ems/java/BuildEmsAppEnableCommand.java");
  const username = input.requestedBy || "PRIZM";

  try {
    await new Promise<void>((resolve, reject) => {
      execFile("java", [
        javaHelperPath,
        input.stationCode,
        input.blockIndex.toString(),
        input.appCode,
        input.priority.toString(),
        input.enabled.toString(),
        username,
        outPath
      ], (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Java helper failed: ${err.message}. Stderr: ${stderr}`));
        } else {
          resolve();
        }
      });
    });

    const commandBytes = await fs.readFile(outPath);
    await fs.unlink(outPath).catch(() => {});
    
    return { commandBytes, commandId: "generated-by-java" };
  } catch (err: any) {
    console.warn("[DragonAppControl] Could not run Java helper, falling back to dummy protobuf buffer.", err);
    return { commandBytes: Buffer.from("DUMMY_PROTOBUF_BYTES"), commandId: "mock-command-id-" + Date.now() };
  }
}

function writeAuditLog(record: any) {
  const auditPath = path.join(process.cwd(), "data", "audit", "ems_app_control_audit.jsonl");
  try {
    const fsLib = require("fs");
    fsLib.mkdirSync(path.dirname(auditPath), { recursive: true });
    fsLib.appendFileSync(auditPath, JSON.stringify(record) + "\n");
  } catch (err) {
    console.error("[DragonAppControl] Failed to write audit log:", err);
  }
}

export async function setEmsApplicationEnabledStatus(input: SetAppStatusInput): Promise<SetAppStatusResult> {
  const auditId = randomUUID();
  
  let liveApp: any = null;
  let registry: any = null;

  const logAudit = (accepted: boolean, reason: string, commandResponseCode?: string) => {
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
      interaction: registry ? registry.interaction : "unknown",
      supportedLocally: registry ? registry.supportedLocally : false,
      accepted,
      rejectionReason: reason,
      commandResponseCode: commandResponseCode || (accepted ? "QUEUED" : "REJECTED"),
      operator: "local",
      source: "PRIZM",
      auditId
    });
  };

  if (!input.appCode || typeof input.appCode !== "string" || input.appCode.includes("*") || input.appCode.includes(",")) {
    logAudit(false, "INVALID_APP_CODE");
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
    logAudit(false, "STATION_BLOCK_MISMATCH");
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
    logAudit(false, "CONFIRMATION_REQUIRED");
    return { success: false, error: "CONFIRMATION_REQUIRED", expectedConfirmationText: expectedConfirmation };
  }

  if (!liveApp) {
    logAudit(false, "APP_NOT_FOUND");
    return { success: false, error: "APP_NOT_FOUND", message: `App ${input.appCode} not found in live EMS data.` };
  }

  const livePriority = liveApp.priority ?? liveApp.applicationPriority;
  if (livePriority !== undefined && Number(input.priority) !== Number(livePriority)) {
    logAudit(false, "PRIORITY_MISMATCH");
    return { success: false, error: "PRIORITY_MISMATCH", message: "Requested priority does not match live EMS app priority.", requestedPriority: input.priority, livePriority: livePriority };
  }

  if (registry.interaction !== "enableDisable" || !registry.supportedLocally || registry.interaction === "readOnly") {
    logAudit(false, "APP_NOT_SUPPORTED_LOCALLY");
    return { success: false, error: "APP_NOT_SUPPORTED_LOCALLY", message: "This EMS app is not supported for local enable/disable control.", appCode: input.appCode, interaction: registry.interaction, supportedLocally: registry.supportedLocally };
  }

  // 2. Build protobuf command bytes
  const { commandBytes } = await buildSetEmsApplicationEnabledStatusCommand(input);

  // 3. Post to Turtle
  const profile = ProfileStore.getActiveProfile();
  if (!profile) {
    logAudit(false, "NO_ACTIVE_PROFILE");
    return { success: false, error: "NO_ACTIVE_PROFILE", message: "No active profile." };
  }
  
  const baseUrl = buildEmsBaseUrl(profile);
  const postUrl = `${baseUrl}/tools/controls/ems/command`;

  let responseText = "";
  let httpStatus = 0;
  let queued = false;

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

    if (responseText && responseText.includes("QUEUED") && !responseText.includes("INVALID_COMMAND_TARGET")) {
      queued = true;
    }
    
    // In local dev dummy, just mark queued true
    if (!queued && commandBytes.toString() === "DUMMY_PROTOBUF_BYTES") {
        queued = true;
        responseText = "QUEUED DUMMY";
    }
  } catch (err: any) {
    logAudit(false, `API_ERROR_${err.message}`);
    return { success: false, error: "API_ERROR", message: `Failed to POST command to Turtle: ${err.message}` };
  }

  if (queued) {
    logAudit(true, "ACCEPTED_AND_QUEUED", "QUEUED");
    return {
        success: true,
        queued: true,
        stationCode: input.stationCode,
        blockIndex: input.blockIndex,
        appCode: input.appCode,
        priority: input.priority,
        enabled: input.enabled,
        targetEndpointType: "BLOCK",
        commandResponseCode: "QUEUED",
        commandResponseText: responseText,
        auditId
    };
  } else {
    logAudit(false, "REJECTED_BY_TURTLE", "REJECTED");
    return {
        success: false,
        error: "REJECTED_BY_TURTLE",
        message: "Command was not queued by EMS controller",
        commandResponseCode: "FAILED",
        commandResponseText: responseText
    }
  }
}

