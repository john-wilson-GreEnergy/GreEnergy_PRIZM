import { ProfileStore } from "../profiles/profileStore";
import { FanControlAudit } from "./fanControlAudit";
import * as fs from "fs";
import * as path from "path";
import {
  FanControlCapabilities,
  FanControlHoldRequest,
  FanControlHoldResponse,
  FanControlStopRequest,
  FanControlHoldStatus,
  FanCommandTargetStatus,
  FanCommandVerificationRow,
  FanControlAuditRecord,
  FanCommandTarget
} from "./fanControlTypes";
import { stringNumberToEnergySegment, formatStringEsLabel } from "../../lib/stringToEsMapper";
import { buildNormalizedStringsData } from "../stringsDashboard";

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

  // Maximum consecutive failures allowed before target automatic abort
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

    // Expand targets list
    let targets: FanCommandTarget[] = [];
    if (req.targets && Array.isArray(req.targets) && req.targets.length > 0) {
      targets = req.targets;
    } else if (req.controller && req.arrayNumber && req.stringNumber) {
      targets = [{
        controller: req.controller,
        arrayNumber: req.arrayNumber,
        stringNumber: req.stringNumber,
        energySegmentNumber: req.totalCellGroups // backward-compatible mapping if any
      }];
    }

    // 1. Validation
    let rejectionReason = "";
    if (targets.length === 0) {
      rejectionReason = "At least one target is required";
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
    } else {
      // Validate each target
      for (const t of targets) {
        if (!t.controller || (t.controller !== "ems" && t.controller !== "bms")) {
          rejectionReason = "Each target requires controller (ems or bms)";
          break;
        }
        if (t.arrayNumber === undefined || !Number.isInteger(t.arrayNumber) || t.arrayNumber < 1 || t.arrayNumber > 8) {
          rejectionReason = "Each target requires a valid arrayNumber (1 to 8)";
          break;
        }
        if (t.stringNumber === undefined || !Number.isInteger(t.stringNumber) || t.stringNumber < 1 || t.stringNumber > 40) {
          rejectionReason = "Each target requires a valid stringNumber (1 to 40)";
          break;
        }
      }
    }

    if (rejectionReason) {
      const fallbackTarget = targets[0] || { controller: "ems", arrayNumber: 0, stringNumber: 0 };
      FanControlAudit.write({
        timestamp: new Date().toISOString(),
        action: "START",
        holdId: "",
        controller: fallbackTarget.controller,
        arrayNumber: fallbackTarget.arrayNumber,
        stringNumber: fallbackTarget.stringNumber,
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
        controller: fallbackTarget.controller,
        arrayNumber: fallbackTarget.arrayNumber,
        stringNumber: fallbackTarget.stringNumber,
        fanSpeedPercent: req.fanSpeedPercent || 0,
        durationSeconds: req.durationSeconds || 0,
        repeatIntervalSeconds: req.repeatIntervalSeconds || 0,
        sendStopAtEnd: !!req.sendStopAtEnd,
        auditId,
        message: `Validation failed: ${rejectionReason}`
      };
    }

    // Check overlaps with other RUNNING holds
    let overlappingTarget: FanCommandTarget | null = null;
    for (const h of this.activeHolds.values()) {
      if (h.state !== "RUNNING") continue;
      for (const t of targets) {
        const foundOverlap = h.targets.find(
          (ht) =>
            ht.state === "RUNNING" &&
            ht.controller === t.controller &&
            ht.arrayNumber === t.arrayNumber &&
            ht.stringNumber === t.stringNumber
        );
        if (foundOverlap) {
          overlappingTarget = t;
          break;
        }
      }
      if (overlappingTarget) break;
    }

    if (overlappingTarget) {
      const dupReason = `Overlapping target already has an active hold: controller ${overlappingTarget.controller}, Array ${overlappingTarget.arrayNumber}, String ${overlappingTarget.stringNumber}`;
      FanControlAudit.write({
        timestamp: new Date().toISOString(),
        action: "START",
        holdId: "",
        controller: overlappingTarget.controller,
        arrayNumber: overlappingTarget.arrayNumber,
        stringNumber: overlappingTarget.stringNumber,
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
        controller: overlappingTarget.controller,
        arrayNumber: overlappingTarget.arrayNumber,
        stringNumber: overlappingTarget.stringNumber,
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

    // Map targets to target statuses
    const targetStatuses: FanCommandTargetStatus[] = targets.map((t) => {
      const tId = `${holdId}-A${t.arrayNumber}-S${t.stringNumber}`;
      const esNum = t.energySegmentNumber ?? stringNumberToEnergySegment(t.stringNumber);
      const label = formatStringEsLabel({
        blockIndex: 1,
        arrayNumber: t.arrayNumber,
        stringNumber: t.stringNumber,
        energySegmentNumber: esNum ?? undefined,
        compact: true
      });

      return {
        targetId: tId,
        controller: t.controller,
        arrayNumber: t.arrayNumber,
        stringNumber: t.stringNumber,
        energySegmentNumber: esNum,
        label,
        lastCommandAt: null,
        lastCommandOk: false,
        lastCommandStatus: null,
        lastCommandResponse: null,
        errorCount: 0,
        consecutiveErrorCount: 0,
        state: "RUNNING"
      };
    });

    const primary = targetStatuses[0];
    const initialStatus: FanControlHoldStatus = {
      holdId,
      controller: primary.controller,
      arrayNumber: primary.arrayNumber,
      stringNumber: primary.stringNumber,
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
      state: "RUNNING",
      targets: targetStatuses
    };

    this.activeHolds.set(holdId, initialStatus);

    // Log the START actions
    FanControlAudit.write({
      timestamp: startedAt,
      action: "START",
      holdId,
      controller: primary.controller,
      arrayNumber: primary.arrayNumber,
      stringNumber: primary.stringNumber,
      fanSpeedPercent: clampedSpeed,
      durationSeconds: req.durationSeconds,
      repeatIntervalSeconds: req.repeatIntervalSeconds,
      sendStopAtEnd: !!req.sendStopAtEnd,
      accepted: true,
      operator: req.operator || "PRIZM Operator",
      auditId
    });

    for (const t of targetStatuses) {
      FanControlAudit.write({
        timestamp: startedAt,
        action: "START",
        holdId,
        controller: t.controller,
        arrayNumber: t.arrayNumber,
        stringNumber: t.stringNumber,
        fanSpeedPercent: clampedSpeed,
        durationSeconds: req.durationSeconds,
        repeatIntervalSeconds: req.repeatIntervalSeconds,
        sendStopAtEnd: !!req.sendStopAtEnd,
        accepted: true,
        operator: req.operator || "PRIZM Operator",
        auditId,
        targetId: t.targetId
      });
    }

    // 2. Immediately send first command to all targets
    await this.dispatchCommands(holdId, clampedSpeed, req.operator);

    // 3. Set up the scheduler interval
    const intervalId = setInterval(async () => {
      await this.tickHold(holdId, req.sendStopAtEnd, req.operator);
    }, req.repeatIntervalSeconds * 1000);

    this.activeIntervals.set(holdId, intervalId);

    return {
      accepted: true,
      holdId,
      controller: primary.controller,
      arrayNumber: primary.arrayNumber,
      stringNumber: primary.stringNumber,
      fanSpeedPercent: clampedSpeed,
      durationSeconds: req.durationSeconds,
      repeatIntervalSeconds: req.repeatIntervalSeconds,
      sendStopAtEnd: !!req.sendStopAtEnd,
      startedAt,
      expiresAt,
      nextCommandAt,
      auditId,
      message: "String fan command hold started successfully for " + targets.length + " targets.",
      targets
    };
  }

  public static async stopHold(req: FanControlStopRequest): Promise<{ stopped: boolean; auditId: string; message: string }> {
    const auditId = "audit-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
    
    // Support target-specific stops
    if (req.targetId) {
      for (const hold of this.activeHolds.values()) {
        const target = hold.targets.find(t => t.targetId === req.targetId);
        if (target && target.state === "RUNNING") {
          target.state = "STOPPED";
          
          let stopCmdUrl = "";
          let stopHttpStatus: number | null = null;
          let stopResponseText: string | null = null;

          if (req.sendStopCommand ?? true) {
            const stopResult = await this.sendFanCommand(
              target.controller,
              target.arrayNumber,
              target.stringNumber,
              0
            );
            stopCmdUrl = stopResult.url;
            stopHttpStatus = stopResult.status;
            stopResponseText = stopResult.response;
          }

          FanControlAudit.write({
            timestamp: new Date().toISOString(),
            action: "STOP",
            holdId: hold.holdId,
            controller: target.controller,
            arrayNumber: target.arrayNumber,
            stringNumber: target.stringNumber,
            fanSpeedPercent: hold.fanSpeedPercent,
            durationSeconds: 0,
            repeatIntervalSeconds: hold.repeatIntervalSeconds,
            sendStopAtEnd: false,
            commandUrl: stopCmdUrl || undefined,
            httpStatus: stopHttpStatus,
            responseText: stopResponseText ? stopResponseText.substring(0, 200) : null,
            accepted: true,
            operator: req.operator || "PRIZM Operator",
            auditId,
            targetId: target.targetId
          });

          // If all targets stopped/failed, stop parent hold session
          const allInactive = hold.targets.every(t => t.state !== "RUNNING");
          if (allInactive) {
            hold.state = "STOPPED";
            hold.nextCommandAt = null;
            const interval = this.activeIntervals.get(hold.holdId);
            if (interval) {
              clearInterval(interval);
              this.activeIntervals.delete(hold.holdId);
            }
          }

          return {
            stopped: true,
            auditId,
            message: `Target ${target.label} stopped successfully.`
          };
        }
      }
      return {
        stopped: false,
        auditId,
        message: "Active target not found."
      };
    }

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

    // Stop all targets
    const stopPromises = targetHold.targets.map(async (t) => {
      if (t.state !== "RUNNING") return;
      t.state = "STOPPED";

      let stopCmdUrl = "";
      let stopHttpStatus: number | null = null;
      let stopResponseText: string | null = null;

      if (req.sendStopCommand ?? true) {
        const stopResult = await this.sendFanCommand(
          t.controller,
          t.arrayNumber,
          t.stringNumber,
          0
        );
        stopCmdUrl = stopResult.url;
        stopHttpStatus = stopResult.status;
        stopResponseText = stopResult.response;
      }

      FanControlAudit.write({
        timestamp: new Date().toISOString(),
        action: "STOP",
        holdId,
        controller: t.controller,
        arrayNumber: t.arrayNumber,
        stringNumber: t.stringNumber,
        fanSpeedPercent: targetHold!.fanSpeedPercent,
        durationSeconds: 0,
        repeatIntervalSeconds: targetHold!.repeatIntervalSeconds,
        sendStopAtEnd: false,
        commandUrl: stopCmdUrl || undefined,
        httpStatus: stopHttpStatus,
        responseText: stopResponseText ? stopResponseText.substring(0, 200) : null,
        accepted: true,
        operator: req.operator || "PRIZM Operator",
        auditId,
        targetId: t.targetId
      });
    });

    await Promise.all(stopPromises);

    try {
      await this.saveHoldRun(holdId, "STOPPED", req.operator);
    } catch (e) {
      console.error("[FanControlService] Failed to auto-save stopped hold run:", e);
    }

    // Parent stop log
    FanControlAudit.write({
      timestamp: new Date().toISOString(),
      action: "STOP",
      holdId,
      controller: targetHold.controller,
      arrayNumber: targetHold.arrayNumber,
      stringNumber: targetHold.stringNumber,
      fanSpeedPercent: targetHold.fanSpeedPercent,
      durationSeconds: 0,
      repeatIntervalSeconds: targetHold.repeatIntervalSeconds,
      sendStopAtEnd: false,
      accepted: true,
      operator: req.operator || "PRIZM Operator",
      auditId
    });

    return {
      stopped: true,
      auditId,
      message: `Hold ${holdId} and its ${targetHold.targets.length} targets stopped successfully.`
    };
  }

  private static async tickHold(holdId: string, sendStopAtEnd: boolean, operator?: string): Promise<void> {
    const hold = this.activeHolds.get(holdId);
    if (!hold || hold.state !== "RUNNING") {
      const interval = this.activeIntervals.get(holdId);
      if (interval) {
        clearInterval(interval);
        this.activeIntervals.delete(holdId);
      }
      return;
    }

    const now = Date.now();
    const expiresTime = new Date(hold.expiresAt).getTime();

    // Expired?
    if (now >= expiresTime) {
      const interval = this.activeIntervals.get(holdId);
      if (interval) {
        clearInterval(interval);
        this.activeIntervals.delete(holdId);
      }

      hold.state = "STOPPED";
      hold.nextCommandAt = null;

      const stopPromises = hold.targets.map(async (t) => {
        if (t.state !== "RUNNING") return;
        t.state = "STOPPED";

        let stopCmdUrl = "";
        let stopHttpStatus: number | null = null;
        let stopResponseText: string | null = null;

        if (sendStopAtEnd) {
          const stopResult = await this.sendFanCommand(
            t.controller,
            t.arrayNumber,
            t.stringNumber,
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
          controller: t.controller,
          arrayNumber: t.arrayNumber,
          stringNumber: t.stringNumber,
          fanSpeedPercent: hold.fanSpeedPercent,
          durationSeconds: 0,
          repeatIntervalSeconds: hold.repeatIntervalSeconds,
          sendStopAtEnd,
          commandUrl: stopCmdUrl || undefined,
          httpStatus: stopHttpStatus,
          responseText: stopResponseText ? stopResponseText.substring(0, 200) : null,
          accepted: true,
          operator: operator || "PRIZM Operator",
          auditId,
          targetId: t.targetId
        });
      });

      await Promise.all(stopPromises);

      try {
        await this.saveHoldRun(holdId, "COMPLETED", operator);
      } catch (e) {
        console.error("[FanControlService] Failed to auto-save completed hold run:", e);
      }

      // Parent complete
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
        accepted: true,
        operator: operator || "PRIZM Operator",
        auditId
      });
      return;
    }

    // Tick commands
    await this.dispatchCommands(holdId, hold.fanSpeedPercent, operator);
  }

  private static async dispatchCommands(holdId: string, speed: number, operator?: string): Promise<void> {
    const hold = this.activeHolds.get(holdId);
    if (!hold) return;

    const tickTime = new Date();
    hold.lastCommandAt = tickTime.toISOString();
    hold.nextCommandAt = new Date(tickTime.getTime() + hold.repeatIntervalSeconds * 1000).toISOString();
    hold.commandCount += 1;

    const promises = hold.targets.map(async (t) => {
      if (t.state !== "RUNNING") return;

      const cmdResult = await this.sendFanCommand(
        t.controller,
        t.arrayNumber,
        t.stringNumber,
        speed
      );

      t.lastCommandAt = tickTime.toISOString();
      t.lastCommandOk = cmdResult.ok;
      t.lastCommandStatus = cmdResult.status;
      t.lastCommandResponse = cmdResult.response;

      const auditId = "audit-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);

      if (cmdResult.ok) {
        t.consecutiveErrorCount = 0;
        FanControlAudit.write({
          timestamp: tickTime.toISOString(),
          action: "COMMAND",
          holdId,
          controller: t.controller,
          arrayNumber: t.arrayNumber,
          stringNumber: t.stringNumber,
          fanSpeedPercent: speed,
          durationSeconds: 0,
          repeatIntervalSeconds: hold.repeatIntervalSeconds,
          sendStopAtEnd: true,
          commandUrl: cmdResult.url,
          httpStatus: cmdResult.status,
          responseText: cmdResult.response ? cmdResult.response.substring(0, 200) : null,
          accepted: true,
          operator: operator || "PRIZM Operator",
          auditId,
          targetId: t.targetId
        });
      } else {
        t.errorCount += 1;
        const currentErrors = (t.consecutiveErrorCount || 0) + 1;
        t.consecutiveErrorCount = currentErrors;

        FanControlAudit.write({
          timestamp: tickTime.toISOString(),
          action: "COMMAND",
          holdId,
          controller: t.controller,
          arrayNumber: t.arrayNumber,
          stringNumber: t.stringNumber,
          fanSpeedPercent: speed,
          durationSeconds: 0,
          repeatIntervalSeconds: hold.repeatIntervalSeconds,
          sendStopAtEnd: true,
          commandUrl: cmdResult.url,
          httpStatus: cmdResult.status,
          responseText: cmdResult.response ? cmdResult.response.substring(0, 200) : null,
          accepted: false,
          error: `Command failed: ${cmdResult.response || "No response details"}`,
          operator: operator || "PRIZM Operator",
          auditId,
          targetId: t.targetId
        });

        if (currentErrors >= this.CONSECUTIVE_ERROR_THRESHOLD) {
          t.state = "FAILED";
          const failAuditId = "audit-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
          FanControlAudit.write({
            timestamp: new Date().toISOString(),
            action: "FAILED",
            holdId,
            controller: t.controller,
            arrayNumber: t.arrayNumber,
            stringNumber: t.stringNumber,
            fanSpeedPercent: speed,
            durationSeconds: 0,
            repeatIntervalSeconds: hold.repeatIntervalSeconds,
            sendStopAtEnd: true,
            accepted: false,
            error: `Aborted: exceeded ${this.CONSECUTIVE_ERROR_THRESHOLD} consecutive failures`,
            operator: operator || "PRIZM Operator",
            auditId: failAuditId,
            targetId: t.targetId
          });
        }
      }
    });

    await Promise.all(promises);

    // Sync parent properties with first target
    const primary = hold.targets[0];
    if (primary) {
      hold.lastCommandOk = primary.lastCommandOk;
      hold.lastCommandStatus = primary.lastCommandStatus;
      hold.lastCommandResponse = primary.lastCommandResponse;
      hold.errorCount = hold.targets.reduce((sum, t) => sum + t.errorCount, 0);
    }

    // If all targets stopped/failed, fail or stop the parent hold session too
    const allFailed = hold.targets.every(t => t.state === "FAILED");
    const allInactive = hold.targets.every(t => t.state !== "RUNNING");
    if (allFailed) {
      hold.state = "FAILED";
      hold.nextCommandAt = null;
    } else if (allInactive) {
      hold.state = "STOPPED";
      hold.nextCommandAt = null;
    }
  }

  public static async getVerification(holdId?: string, settings?: {
    warmupSeconds?: number;
    tolerancePercent?: number;
    staleTelemetryMs?: number;
    requireAllFansRunning?: boolean;
    rpmMinimum?: number;
  }): Promise<FanCommandVerificationRow[]> {
    const holdsToVerify = holdId 
      ? [this.activeHolds.get(holdId)].filter((h): h is FanControlHoldStatus => !!h)
      : Array.from(this.activeHolds.values()).filter(h => h.state === "RUNNING");

    if (holdsToVerify.length === 0) return [];

    // Fetch live string report telemetry
    const stringsResult = await buildNormalizedStringsData(false).catch((err) => {
      console.error("[FanControlService] Error building live strings data for verification:", err.message);
      return null;
    });

    const liveStrings = stringsResult?.strings || [];
    const rows: FanCommandVerificationRow[] = [];

    const warmupSeconds = settings?.warmupSeconds ?? 30;
    const tolerancePercent = settings?.tolerancePercent ?? 15;
    const staleTelemetryMs = settings?.staleTelemetryMs ?? 120000;

    for (const hold of holdsToVerify) {
      const elapsedMs = Date.now() - new Date(hold.startedAt).getTime();
      const isWarmingUp = elapsedMs < warmupSeconds * 1000;

      for (const t of hold.targets) {
        // Find corresponding live telemetry
        const live = liveStrings.find(
          (ls: any) => ls.arrayNumber === t.arrayNumber && ls.stringNumber === t.stringNumber
        );

        const commandedSpeedPercent = hold.fanSpeedPercent;
        const commandedState = commandedSpeedPercent > 0 ? "ON" : "OFF";

        if (!live) {
          rows.push({
            holdId: hold.holdId,
            targetId: t.targetId,
            controller: t.controller,
            arrayNumber: t.arrayNumber,
            stringNumber: t.stringNumber,
            energySegmentNumber: t.energySegmentNumber,
            label: t.label,
            commandedSpeedPercent,
            commandedState,
            actualFanState: "UNKNOWN",
            actualFanSpeedPercent: null,
            actualFanRpm: null,
            actualFanRpmByFan: null,
            actualFanPercentByFan: null,
            fanCount: null,
            fanRatedRpm: null,
            fanStatusAvgRpm: null,
            fanStatusPercent: null,
            feedbackTimestamp: null,
            telemetryAgeMs: null,
            result: "UNKNOWN_NO_TELEMETRY",
            notes: ["No telemetry feedback source found for this string."]
          });
          continue;
        }

        const fanRatedRpm = live.fanRatedRpm !== undefined && live.fanRatedRpm !== null ? Number(live.fanRatedRpm) : 7500;
        const fanCount = live.fanCount !== undefined && live.fanCount !== null ? Number(live.fanCount) : null;
        const fanStatusAvgRpm = live.fanStatusAvgRpm !== undefined && live.fanStatusAvgRpm !== null ? Number(live.fanStatusAvgRpm) : null;
        const fanStatusPercent = live.fanStatusPercent !== undefined && live.fanStatusPercent !== null ? Number(live.fanStatusPercent) : null;

        const actualFanSpeedPercent = fanStatusPercent;
        const actualFanRpm = fanStatusAvgRpm;
        const actualFanRpmByFan = Array.isArray(live.fanStatusRpmValues) ? live.fanStatusRpmValues : null;
        const feedbackTimestamp = live.timestampUtc || live.timestamp || null;

        const actualFanPercentByFan = actualFanRpmByFan
          ? actualFanRpmByFan.map((rpm: number) => {
              const rated = fanRatedRpm > 0 ? fanRatedRpm : 7500;
              return Math.max(0, Math.min(100, Math.round((rpm / rated) * 100)));
            })
          : null;

        let telemetryAgeMs: number | null = null;
        if (feedbackTimestamp) {
          telemetryAgeMs = Date.now() - new Date(feedbackTimestamp).getTime();
        }

        const actualFanState = actualFanSpeedPercent === null 
          ? "UNKNOWN" 
          : (actualFanSpeedPercent > 0 ? "ON" : "OFF");

        // Stale Telemetry Check
        if (telemetryAgeMs !== null && telemetryAgeMs > staleTelemetryMs) {
          rows.push({
            holdId: hold.holdId,
            targetId: t.targetId,
            controller: t.controller,
            arrayNumber: t.arrayNumber,
            stringNumber: t.stringNumber,
            energySegmentNumber: t.energySegmentNumber,
            label: t.label,
            commandedSpeedPercent,
            commandedState,
            actualFanState,
            actualFanSpeedPercent,
            actualFanRpm,
            actualFanRpmByFan,
            actualFanPercentByFan,
            fanCount,
            fanRatedRpm,
            fanStatusAvgRpm,
            fanStatusPercent,
            feedbackTimestamp,
            telemetryAgeMs,
            result: "FAIL_STALE_TELEMETRY",
            notes: [`Telemetry is stale (${Math.round(telemetryAgeMs / 1000)}s old)`]
          });
          continue;
        }

        let result: FanCommandVerificationRow["result"] = "PASS";
        const notes: string[] = [];

        if (commandedSpeedPercent > 0) {
          if (actualFanSpeedPercent === null && actualFanRpm === null) {
            result = "UNKNOWN_NO_TELEMETRY";
            notes.push("Telemetry exists but has no fan speed / RPM readings.");
          } else if (actualFanSpeedPercent === 0 || (actualFanRpm === 0 && (!actualFanRpmByFan || actualFanRpmByFan.every((r: any) => Number(r) === 0)))) {
            if (isWarmingUp) {
              result = "PASS";
              notes.push(`Warming up (${Math.round(elapsedMs / 1000)}s elapsed of ${warmupSeconds}s warmup limit)`);
            } else {
              result = "WARN_ZERO_RPM";
              notes.push("Fans report 0 RPM / 0% speed despite ON command");
            }
          } else if (actualFanSpeedPercent !== null) {
            const diff = actualFanSpeedPercent - commandedSpeedPercent;
            if (diff < -tolerancePercent) {
              result = "WARN_UNDER_COMMAND";
              notes.push(`Actual speed (${actualFanSpeedPercent}%) is below commanded speed (${commandedSpeedPercent}%) by ${Math.abs(diff)}% (tolerance: ${tolerancePercent}%)`);
            } else if (diff > tolerancePercent) {
              result = "WARN_OVER_COMMAND";
              notes.push(`Actual speed (${actualFanSpeedPercent}%) is above commanded speed (${commandedSpeedPercent}%) by ${Math.abs(diff)}% (tolerance: ${tolerancePercent}%)`);
            } else {
              result = "PASS";
              notes.push("Fan speed verified within tolerance.");
            }
          } else {
            // RPM exists but no percentage, evaluate on binary
            result = "PASS";
            notes.push(`Verified running at ${actualFanRpm} RPM.`);
          }
        } else {
          // Commanded to 0%
          if (actualFanSpeedPercent === null || actualFanSpeedPercent === 0 || (actualFanRpm === 0 && (!actualFanRpmByFan || actualFanRpmByFan.every((r: any) => Number(r) === 0)))) {
            result = "PASS";
            notes.push("Fans stopped as commanded.");
          } else {
            if (isWarmingUp) {
              result = "PASS";
              notes.push("Fans stopping.");
            } else {
              result = "WARN_OVER_COMMAND";
              notes.push(`Fans still spinning at ${actualFanSpeedPercent}% after stop command`);
            }
          }
        }

        // Add granular individual fan analysis if telemetry is available
        if (actualFanRpmByFan && actualFanRpmByFan.length > 0 && commandedSpeedPercent > 0) {
          actualFanRpmByFan.forEach((rpm: number, index: number) => {
            const fanNum = index + 1;
            const fanPct = actualFanPercentByFan ? actualFanPercentByFan[index] : null;

            if (rpm === 0) {
              notes.push(`Fan ${fanNum} remained at 0 RPM`);
              if (settings?.requireAllFansRunning) {
                result = "WARN_ZERO_RPM";
              }
            } else if (fanPct !== null) {
              const fanDiff = fanPct - commandedSpeedPercent;
              if (fanDiff < -tolerancePercent) {
                notes.push(`Fan ${fanNum} is below command by ${Math.abs(fanDiff)}%`);
                if (result === "PASS") {
                  result = "WARN_UNDER_COMMAND";
                }
              } else if (fanDiff > tolerancePercent) {
                notes.push(`Fan ${fanNum} is above command by ${Math.abs(fanDiff)}%`);
                if (result === "PASS") {
                  result = "WARN_OVER_COMMAND";
                }
              }
            }
          });
        }

        // Configurable verify option: requireAllFansRunning (fallback logic)
        if (result === "PASS" && settings?.requireAllFansRunning && actualFanRpmByFan) {
          const zeroFan = actualFanRpmByFan.some((r: any) => Number(r) === 0);
          if (zeroFan && commandedSpeedPercent > 0) {
            result = "WARN_ZERO_RPM";
            if (!notes.includes("At least one individual fan is reporting 0 RPM.")) {
              notes.push("At least one individual fan is reporting 0 RPM.");
            }
          }
        }

        rows.push({
          holdId: hold.holdId,
          targetId: t.targetId,
          controller: t.controller,
          arrayNumber: t.arrayNumber,
          stringNumber: t.stringNumber,
          energySegmentNumber: t.energySegmentNumber,
          label: t.label,
          commandedSpeedPercent,
          commandedState,
          actualFanState,
          actualFanSpeedPercent,
          actualFanRpm,
          actualFanRpmByFan,
          actualFanPercentByFan,
          fanCount,
          fanRatedRpm,
          fanStatusAvgRpm,
          fanStatusPercent,
          feedbackTimestamp,
          telemetryAgeMs,
          result,
          notes
        });
      }
    }

    return rows;
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

  private static RUNS_CACHE_FILE = path.join(process.cwd(), "data", "cache", "fan_runs.json");

  private static loadSavedRuns(): any[] {
    try {
      if (fs.existsSync(this.RUNS_CACHE_FILE)) {
        const content = fs.readFileSync(this.RUNS_CACHE_FILE, "utf-8");
        return JSON.parse(content) || [];
      }
    } catch (err) {
      console.error("[FanControlService] Failed to load saved runs:", err);
    }
    return [];
  }

  private static saveRunsToCache(runs: any[]): void {
    try {
      fs.mkdirSync(path.dirname(this.RUNS_CACHE_FILE), { recursive: true });
      fs.writeFileSync(this.RUNS_CACHE_FILE, JSON.stringify(runs, null, 2), "utf-8");
    } catch (err) {
      console.error("[FanControlService] Failed to save runs to cache:", err);
    }
  }

  public static getSavedRuns(): any[] {
    return this.loadSavedRuns();
  }

  public static async saveHoldRun(holdId: string, customState?: string, operator?: string): Promise<any | null> {
    const hold = this.activeHolds.get(holdId);
    if (!hold) return null;

    const verificationRows = await this.getVerification(holdId);
    const duration = Math.round((new Date(hold.expiresAt).getTime() - new Date(hold.startedAt).getTime()) / 1000);

    const run = {
      runId: holdId + "-" + Date.now(),
      holdId: hold.holdId,
      timestamp: new Date().toISOString(),
      fanSpeedPercent: hold.fanSpeedPercent,
      durationSeconds: duration,
      operator: operator || "PRIZM Operator",
      targetsCount: hold.targets.length,
      state: customState || hold.state,
      verificationResults: verificationRows
    };

    const runs = this.loadSavedRuns();
    runs.unshift(run);
    this.saveRunsToCache(runs);
    return run;
  }

  public static deleteSavedRun(runId: string): boolean {
    const runs = this.loadSavedRuns();
    const filtered = runs.filter((r: any) => r.runId !== runId);
    if (filtered.length !== runs.length) {
      this.saveRunsToCache(filtered);
      return true;
    }
    return false;
  }

  public static clearSavedRuns(): void {
    this.saveRunsToCache([]);
  }
}
