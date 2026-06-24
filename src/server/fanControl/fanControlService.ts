import { ProfileStore } from "../profiles/profileStore";
import { FanControlAudit } from "./fanControlAudit";
import {
  FanControlCapabilities,
  FanControlHoldRequest,
  FanControlHoldResponse,
  FanControlStopRequest,
  FanControlHoldStatus,
  FanControlAuditRecord
} from "./fanControlTypes";

// Helper to get EMS/Turtle base URL
function getEmsBaseUrl(): string {
  const profile = ProfileStore.getActiveProfile();
  if (!profile || !profile.emsHost || !profile.emsPort || !profile.turtlePath) {
    return "http://10.0.0.3:8080/turtle";
  }
  const host = profile.emsHost;
  const port = profile.emsPort;
  const path = profile.turtlePath.replace(/\/$/, "");
  return `http://${host}:${port}${path}`;
}

export class FanControlService {
  private static activeHolds = new Map<string, FanControlHoldStatus>();
  private static activeIntervals = new Map<string, NodeJS.Timeout>();
  private static consecutiveErrors = new Map<string, number>();

  // Maximum consecutive failures allowed before automatic abort
  private static CONSECUTIVE_ERROR_THRESHOLD = 3;

  static {
    // Graceful shutdown: clear all intervals on process exit
    const cleanup = () => {
      console.log("[FanControlService] Cleaning up active fan command intervals...");
      for (const interval of this.activeIntervals.values()) {
        clearInterval(interval);
      }
      this.activeIntervals.clear();
    };

    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
  }

  public static getCapabilities(): FanControlCapabilities {
    return {
      turtleFanEndpointSupported: true,
      nativeDurationSupported: false,
      holdSchedulerSupported: true,
      controllers: ["ems", "bms"],
      message: "Turtle fan endpoint supports fan speed only. PRIZM will maintain command duration by reissuing fan command at interval."
    };
  }

  public static getActiveHolds(): FanControlHoldStatus[] {
    return Array.from(this.activeHolds.values());
  }

  public static async startHold(req: FanControlHoldRequest): Promise<FanControlHoldResponse> {
    const holdId = "hold-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
    const auditId = "audit-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);

    // 1. Validation
    let rejectionReason = "";
    if (!req.controller || (req.controller !== "ems" && req.controller !== "bms")) {
      rejectionReason = "controller required, ems or bms";
    } else if (req.arrayNumber === undefined || !Number.isInteger(req.arrayNumber) || req.arrayNumber <= 0) {
      rejectionReason = "arrayNumber required, positive integer";
    } else if (req.stringNumber === undefined || !Number.isInteger(req.stringNumber) || req.stringNumber <= 0) {
      rejectionReason = "stringNumber required, positive integer";
    } else if (req.fanSpeedPercent === undefined || isNaN(req.fanSpeedPercent)) {
      rejectionReason = "fanSpeedPercent required";
    } else if (req.durationSeconds === undefined || isNaN(req.durationSeconds) || req.durationSeconds < 10) {
      rejectionReason = "durationSeconds required, minimum duration 10 seconds";
    } else if (req.durationSeconds > 1800) {
      rejectionReason = "durationSeconds exceeds maximum duration of 1800 seconds";
    } else if (req.repeatIntervalSeconds === undefined || isNaN(req.repeatIntervalSeconds) || req.repeatIntervalSeconds < 5 || req.repeatIntervalSeconds > 120) {
      rejectionReason = "repeatIntervalSeconds required, must be between 5 and 120 seconds";
    } else if (req.repeatIntervalSeconds >= req.durationSeconds) {
      rejectionReason = "repeatIntervalSeconds must be less than durationSeconds";
    } else if (!req.confirmationPhrase || req.confirmationPhrase !== "HOLD FAN SPEED") {
      rejectionReason = "confirmationPhrase must equal HOLD FAN SPEED";
    }

    if (rejectionReason) {
      FanControlAudit.write({
        timestamp: new Date().toISOString(),
        action: "START",
        holdId: "",
        controller: req.controller || "ems",
        arrayNumber: req.arrayNumber || 0,
        stringNumber: req.stringNumber || 0,
        fanSpeedPercent: req.fanSpeedPercent || 0,
        durationSeconds: req.durationSeconds || 0,
        repeatIntervalSeconds: req.repeatIntervalSeconds || 0,
        sendStopAtEnd: !!req.sendStopAtEnd,
        accepted: false,
        rejectionReason,
        operator: req.operator || "PRIZM Operator",
        auditId
      });

      return {
        accepted: false,
        controller: req.controller || "ems",
        arrayNumber: req.arrayNumber || 0,
        stringNumber: req.stringNumber || 0,
        fanSpeedPercent: req.fanSpeedPercent || 0,
        durationSeconds: req.durationSeconds || 0,
        repeatIntervalSeconds: req.repeatIntervalSeconds || 0,
        sendStopAtEnd: !!req.sendStopAtEnd,
        auditId,
        message: `Validation failed: ${rejectionReason}`
      };
    }

    // Check if another active hold exists for the same controller/array/string
    const duplicate = Array.from(this.activeHolds.values()).find(
      (h) =>
        h.state === "RUNNING" &&
        h.controller === req.controller &&
        h.arrayNumber === req.arrayNumber &&
        h.stringNumber === req.stringNumber
    );

    if (duplicate) {
      const dupReason = `Another active hold (${duplicate.holdId}) exists for controller ${req.controller}, Array ${req.arrayNumber}, String ${req.stringNumber}`;
      FanControlAudit.write({
        timestamp: new Date().toISOString(),
        action: "START",
        holdId: "",
        controller: req.controller,
        arrayNumber: req.arrayNumber,
        stringNumber: req.stringNumber,
        fanSpeedPercent: req.fanSpeedPercent,
        durationSeconds: req.durationSeconds,
        repeatIntervalSeconds: req.repeatIntervalSeconds,
        sendStopAtEnd: !!req.sendStopAtEnd,
        accepted: false,
        rejectionReason: dupReason,
        operator: req.operator || "PRIZM Operator",
        auditId
      });

      return {
        accepted: false,
        controller: req.controller,
        arrayNumber: req.arrayNumber,
        stringNumber: req.stringNumber,
        fanSpeedPercent: req.fanSpeedPercent,
        durationSeconds: req.durationSeconds,
        repeatIntervalSeconds: req.repeatIntervalSeconds,
        sendStopAtEnd: !!req.sendStopAtEnd,
        auditId,
        message: dupReason
      };
    }

    // Clamp and round fanSpeedPercent to nearest 5
    const clampedSpeed = Math.max(0, Math.min(100, Math.round(req.fanSpeedPercent / 5) * 5));

    const startedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + req.durationSeconds * 1000).toISOString();
    const nextCommandAt = new Date(Date.now() + req.repeatIntervalSeconds * 1000).toISOString();

    const initialStatus: FanControlHoldStatus = {
      holdId,
      controller: req.controller,
      arrayNumber: req.arrayNumber,
      stringNumber: req.stringNumber,
      fanSpeedPercent: clampedSpeed,
      startedAt,
      expiresAt,
      repeatIntervalSeconds: req.repeatIntervalSeconds,
      lastCommandAt: null,
      nextCommandAt,
      commandCount: 0,
      lastCommandOk: false,
      lastCommandStatus: null,
      lastCommandResponse: null,
      errorCount: 0,
      state: "RUNNING"
    };

    this.activeHolds.set(holdId, initialStatus);
    this.consecutiveErrors.set(holdId, 0);

    // 2. Immediately send the first fan command
    const firstResult = await this.sendFanCommand(
      req.controller,
      req.arrayNumber,
      req.stringNumber,
      clampedSpeed
    );

    const nowStr = new Date().toISOString();
    initialStatus.lastCommandAt = nowStr;
    initialStatus.commandCount = 1;
    initialStatus.lastCommandOk = firstResult.ok;
    initialStatus.lastCommandStatus = firstResult.status;
    initialStatus.lastCommandResponse = firstResult.response;

    if (!firstResult.ok) {
      initialStatus.errorCount = 1;
      this.consecutiveErrors.set(holdId, 1);
    }

    // Log the START action
    FanControlAudit.write({
      timestamp: nowStr,
      action: "START",
      holdId,
      controller: req.controller,
      arrayNumber: req.arrayNumber,
      stringNumber: req.stringNumber,
      fanSpeedPercent: clampedSpeed,
      durationSeconds: req.durationSeconds,
      repeatIntervalSeconds: req.repeatIntervalSeconds,
      sendStopAtEnd: !!req.sendStopAtEnd,
      commandUrl: firstResult.url,
      httpStatus: firstResult.status,
      responseText: firstResult.response ? firstResult.response.substring(0, 200) : null,
      accepted: true,
      operator: req.operator || "PRIZM Operator",
      auditId
    });

    // 3. Set up the scheduler interval
    const intervalId = setInterval(async () => {
      await this.tickHold(holdId, req.sendStopAtEnd, req.operator);
    }, req.repeatIntervalSeconds * 1000);

    this.activeIntervals.set(holdId, intervalId);

    return {
      accepted: true,
      holdId,
      controller: req.controller,
      arrayNumber: req.arrayNumber,
      stringNumber: req.stringNumber,
      fanSpeedPercent: clampedSpeed,
      durationSeconds: req.durationSeconds,
      repeatIntervalSeconds: req.repeatIntervalSeconds,
      sendStopAtEnd: !!req.sendStopAtEnd,
      startedAt,
      expiresAt,
      nextCommandAt,
      auditId,
      message: "String fan command hold started successfully."
    };
  }

  public static async stopHold(req: FanControlStopRequest): Promise<{ stopped: boolean; auditId: string; message: string }> {
    const auditId = "audit-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
    let targetHold: FanControlHoldStatus | undefined;

    if (req.holdId) {
      targetHold = this.activeHolds.get(req.holdId);
    } else if (req.controller && req.arrayNumber && req.stringNumber) {
      targetHold = Array.from(this.activeHolds.values()).find(
        (h) =>
          h.state === "RUNNING" &&
          h.controller === req.controller &&
          h.arrayNumber === req.arrayNumber &&
          h.stringNumber === req.stringNumber
      );
    }

    if (!targetHold || targetHold.state !== "RUNNING") {
      return {
        stopped: false,
        auditId,
        message: "No active hold matching parameters was found."
      };
    }

    const holdId = targetHold.holdId;

    // Clear interval timer
    const interval = this.activeIntervals.get(holdId);
    if (interval) {
      clearInterval(interval);
      this.activeIntervals.delete(holdId);
    }

    targetHold.state = "STOPPED";
    targetHold.nextCommandAt = null;

    let stopCmdUrl = "";
    let stopHttpStatus: number | null = null;
    let stopResponseText: string | null = null;

    // Optionally send stop command (fanCtlAll/0)
    if (req.sendStopCommand) {
      const stopResult = await this.sendFanCommand(
        targetHold.controller,
        targetHold.arrayNumber,
        targetHold.stringNumber,
        0
      );
      stopCmdUrl = stopResult.url;
      stopHttpStatus = stopResult.status;
      stopResponseText = stopResult.response;
    }

    // Log the STOP action
    FanControlAudit.write({
      timestamp: new Date().toISOString(),
      action: "STOP",
      holdId,
      controller: targetHold.controller,
      arrayNumber: targetHold.arrayNumber,
      stringNumber: targetHold.stringNumber,
      fanSpeedPercent: targetHold.fanSpeedPercent,
      durationSeconds: 0, // Not applicable for manual stop audit record duration
      repeatIntervalSeconds: targetHold.repeatIntervalSeconds,
      sendStopAtEnd: false,
      commandUrl: stopCmdUrl || undefined,
      httpStatus: stopHttpStatus,
      responseText: stopResponseText ? stopResponseText.substring(0, 200) : null,
      accepted: true,
      operator: req.operator || "PRIZM Operator",
      auditId
    });

    return {
      stopped: true,
      auditId,
      message: `Hold ${holdId} stopped successfully.`
    };
  }

  private static async tickHold(holdId: string, sendStopAtEnd: boolean, operator?: string): Promise<void> {
    const hold = this.activeHolds.get(holdId);
    if (!hold || hold.state !== "RUNNING") {
      // Safeguard: clear interval if hold is no longer active
      const interval = this.activeIntervals.get(holdId);
      if (interval) {
        clearInterval(interval);
        this.activeIntervals.delete(holdId);
      }
      return;
    }

    const now = Date.now();
    const expiresTime = new Date(hold.expiresAt).getTime();

    // Check if hold has expired
    if (now >= expiresTime) {
      // Natural completion
      const interval = this.activeIntervals.get(holdId);
      if (interval) {
        clearInterval(interval);
        this.activeIntervals.delete(holdId);
      }

      hold.state = "STOPPED";
      hold.nextCommandAt = null;

      let stopCmdUrl = "";
      let stopHttpStatus: number | null = null;
      let stopResponseText: string | null = null;

      if (sendStopAtEnd) {
        const stopResult = await this.sendFanCommand(
          hold.controller,
          hold.arrayNumber,
          hold.stringNumber,
          0
        );
        stopCmdUrl = stopResult.url;
        stopHttpStatus = stopResult.status;
        stopResponseText = stopResult.response;
      }

      const auditId = "audit-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
      FanControlAudit.write({
        timestamp: new Date().toISOString(),
        action: "COMPLETE",
        holdId,
        controller: hold.controller,
        arrayNumber: hold.arrayNumber,
        stringNumber: hold.stringNumber,
        fanSpeedPercent: hold.fanSpeedPercent,
        durationSeconds: 0,
        repeatIntervalSeconds: hold.repeatIntervalSeconds,
        sendStopAtEnd,
        commandUrl: stopCmdUrl || undefined,
        httpStatus: stopHttpStatus,
        responseText: stopResponseText ? stopResponseText.substring(0, 200) : null,
        accepted: true,
        operator: operator || "PRIZM Operator",
        auditId
      });
      return;
    }

    // Reissue command
    const cmdResult = await this.sendFanCommand(
      hold.controller,
      hold.arrayNumber,
      hold.stringNumber,
      hold.fanSpeedPercent
    );

    const tickTime = new Date();
    hold.lastCommandAt = tickTime.toISOString();
    hold.nextCommandAt = new Date(tickTime.getTime() + hold.repeatIntervalSeconds * 1000).toISOString();
    hold.commandCount += 1;
    hold.lastCommandOk = cmdResult.ok;
    hold.lastCommandStatus = cmdResult.status;
    hold.lastCommandResponse = cmdResult.response;

    const auditId = "audit-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);

    if (cmdResult.ok) {
      this.consecutiveErrors.set(holdId, 0);

      FanControlAudit.write({
        timestamp: tickTime.toISOString(),
        action: "COMMAND",
        holdId,
        controller: hold.controller,
        arrayNumber: hold.arrayNumber,
        stringNumber: hold.stringNumber,
        fanSpeedPercent: hold.fanSpeedPercent,
        durationSeconds: 0,
        repeatIntervalSeconds: hold.repeatIntervalSeconds,
        sendStopAtEnd,
        commandUrl: cmdResult.url,
        httpStatus: cmdResult.status,
        responseText: cmdResult.response ? cmdResult.response.substring(0, 200) : null,
        accepted: true,
        operator: operator || "PRIZM Operator",
        auditId
      });
    } else {
      hold.errorCount += 1;
      const currentErrors = (this.consecutiveErrors.get(holdId) || 0) + 1;
      this.consecutiveErrors.set(holdId, currentErrors);

      FanControlAudit.write({
        timestamp: tickTime.toISOString(),
        action: "COMMAND",
        holdId,
        controller: hold.controller,
        arrayNumber: hold.arrayNumber,
        stringNumber: hold.stringNumber,
        fanSpeedPercent: hold.fanSpeedPercent,
        durationSeconds: 0,
        repeatIntervalSeconds: hold.repeatIntervalSeconds,
        sendStopAtEnd,
        commandUrl: cmdResult.url,
        httpStatus: cmdResult.status,
        responseText: cmdResult.response ? cmdResult.response.substring(0, 200) : null,
        accepted: false,
        error: `Command failed: ${cmdResult.response || "No response details"}`,
        operator: operator || "PRIZM Operator",
        auditId
      });

      // Threshold check
      if (currentErrors >= this.CONSECUTIVE_ERROR_THRESHOLD) {
        // Abort the hold
        const interval = this.activeIntervals.get(holdId);
        if (interval) {
          clearInterval(interval);
          this.activeIntervals.delete(holdId);
        }

        hold.state = "FAILED";
        hold.nextCommandAt = null;

        const failAuditId = "audit-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
        FanControlAudit.write({
          timestamp: new Date().toISOString(),
          action: "FAILED",
          holdId,
          controller: hold.controller,
          arrayNumber: hold.arrayNumber,
          stringNumber: hold.stringNumber,
          fanSpeedPercent: hold.fanSpeedPercent,
          durationSeconds: 0,
          repeatIntervalSeconds: hold.repeatIntervalSeconds,
          sendStopAtEnd,
          accepted: false,
          error: `Aborted: exceeded ${this.CONSECUTIVE_ERROR_THRESHOLD} consecutive communication failures`,
          operator: operator || "PRIZM Operator",
          auditId: failAuditId
        });
      }
    }
  }

  private static async sendFanCommand(
    controller: "ems" | "bms",
    arrayNumber: number,
    stringNumber: number,
    fanSpeedPercent: number
  ): Promise<{ ok: boolean; status: number | null; response: string | null; url: string }> {
    const baseUrl = getEmsBaseUrl();
    const url = `${baseUrl}/tools/controls/${controller}/array/${arrayNumber}/string/${stringNumber}/fanCtlAll/${fanSpeedPercent}`;

    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 5000);
      const res = await fetch(url, { signal: abortController.signal });
      clearTimeout(timeoutId);

      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        response: text,
        url
      };
    } catch (err: any) {
      return {
        ok: false,
        status: null,
        response: err.message || "Network Timeout / Error",
        url
      };
    }
  }
}
