import fs from "fs";
import path from "path";
import { ProfileStore } from "../profiles/profileStore";
import { LightbarMode, LightbarAuditRecord, LightbarResultItem, RGBW } from "./lightbarTypes";
import { FaultLightbarEngineState, computeFaultLightbarStates } from "./faultLightbarEngine";
import { LastAppliedLightbarState } from "./faultLightbarTypes";

const DATA_DIR = path.join(process.cwd(), "data");
const AUDIT_FILE = path.join(DATA_DIR, "prizm_lightbar_audit.json");
const MANAGED_FILE = path.join(DATA_DIR, "prizm_managed_fault_lightbars.json");

function ensureDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export class LightbarService {
  private static isInitialized = false;

  public static initialize() {
    if (this.isInitialized) return;
    this.ensureFilesExist();
    this.loadManagedStates();
    this.isInitialized = true;
  }

  private static ensureFilesExist() {
    ensureDirectory();
    if (!fs.existsSync(AUDIT_FILE)) {
      fs.writeFileSync(AUDIT_FILE, JSON.stringify([], null, 2), "utf8");
    }
    if (!fs.existsSync(MANAGED_FILE)) {
      fs.writeFileSync(MANAGED_FILE, JSON.stringify([], null, 2), "utf8");
    }
  }

  public static getAuditLogs(): LightbarAuditRecord[] {
    this.initialize();
    try {
      if (!fs.existsSync(AUDIT_FILE)) return [];
      const content = fs.readFileSync(AUDIT_FILE, "utf8");
      return JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse lightbar audit file", e);
      return [];
    }
  }

  public static writeAuditLog(record: Omit<LightbarAuditRecord, "id" | "timestamp">) {
    this.initialize();
    try {
      const logs = this.getAuditLogs();
      const newRecord: LightbarAuditRecord = {
        ...record,
        id: "audit-" + Math.random().toString(36).substring(2, 11),
        timestamp: new Date().toISOString()
      };
      logs.unshift(newRecord);
      
      // Keep recent 500 audit logs
      if (logs.length > 500) {
        logs.splice(500);
      }
      ensureDirectory();
      fs.writeFileSync(AUDIT_FILE, JSON.stringify(logs, null, 2), "utf8");
    } catch (e) {
      console.error("Failed to write lightbar audit log", e);
    }
  }

  public static getManagedStates(): LastAppliedLightbarState[] {
    this.initialize();
    return Array.from(FaultLightbarEngineState.activeManagedLightbars.values());
  }

  public static loadManagedStates() {
    ensureDirectory();
    if (fs.existsSync(MANAGED_FILE)) {
      try {
        const content = fs.readFileSync(MANAGED_FILE, "utf8");
        const list: LastAppliedLightbarState[] = JSON.parse(content);
        FaultLightbarEngineState.activeManagedLightbars.clear();
        for (const item of list) {
          let finalKey = item.key;
          let finalBlockIndex = item.blockIndex;
          let finalBlockId = item.blockId;

          if (!finalKey.includes("-") || finalKey.split("-").length === 2) {
            const profile = ProfileStore.getActiveProfile();
            const defaultBlockIndex = profile?.blockIndex ?? 1;
            const defaultBlockId = profile?.topologyModel?.blocks?.find(b => b.blockIndex === defaultBlockIndex)?.blockId || `block-${defaultBlockIndex}`;
            finalBlockIndex = defaultBlockIndex;
            finalBlockId = defaultBlockId;
            finalKey = `${finalBlockIndex}-${item.arrayIndex}-${item.stringIndex}`;
            console.warn(`[Migration] Migrating local managed state ${item.key} without block to block-aware key: ${finalKey}`);
          }

          const migratedItem = {
            ...item,
            key: finalKey,
            blockIndex: finalBlockIndex,
            blockId: finalBlockId
          };
          FaultLightbarEngineState.activeManagedLightbars.set(finalKey, migratedItem);
        }
      } catch (e) {
        console.error("Failed to load managed lightbar states", e);
      }
    }
  }

  public static saveManagedStates() {
    this.initialize();
    ensureDirectory();
    try {
      const list = Array.from(FaultLightbarEngineState.activeManagedLightbars.values());
      fs.writeFileSync(MANAGED_FILE, JSON.stringify(list, null, 2), "utf8");
    } catch (e) {
      console.error("Failed to save managed lightbar states", e);
    }
  }

  public static getBlockBaseUrl(blockIndex?: number): string {
    const profile = ProfileStore.getActiveProfile();
    if (!profile) {
      throw new Error("Lightbar command blocked: no active EMS profile/Turtle base URL is configured.");
    }
    
    if (blockIndex !== undefined && profile.topologyModel?.blocks) {
      const block = profile.topologyModel.blocks.find(b => b.blockIndex === blockIndex);
      if (block) {
        if (!block.emsHost || !block.emsPort || !block.turtlePath) {
          throw new Error(`Lightbar command blocked: target block ${blockIndex} is missing connection parameters.`);
        }
        return `http://${block.emsHost}:${block.emsPort}${block.turtlePath}`;
      }
    }

    if (!profile.emsHost || !profile.emsPort || !profile.turtlePath) {
      throw new Error("Lightbar command blocked: no active EMS profile/Turtle base URL is configured.");
    }
    return `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}`;
  }

  public static async executeCommandsWithConcurrency(
    commands: {
      blockId?: string;
      blockIndex?: number;
      emsBaseUrl?: string;
      array: number;
      string: number;
      red: number;
      green: number;
      blue: number;
      white: number;
      duration: number;
    }[],
    concurrency: number
  ): Promise<LightbarResultItem[]> {
    const profile = ProfileStore.getActiveProfile();
    if (!profile || !profile.emsHost || !profile.emsPort || !profile.turtlePath) {
      throw new Error("Lightbar command blocked: no active EMS profile/Turtle base URL is configured.");
    }

    // Resolve specific targeting urls for block topology
    for (const cmd of commands) {
      if (!cmd.emsBaseUrl) {
        cmd.emsBaseUrl = this.getBlockBaseUrl(cmd.blockIndex);
      }
    }

    const results = new Array<LightbarResultItem>(commands.length);
    let currentIndex = 0;

    const self = this;
    async function sendCommand(cmd: typeof commands[0]): Promise<LightbarResultItem> {
      const emsUrl = cmd.emsBaseUrl || self.getBlockBaseUrl(cmd.blockIndex);
      const url = `${emsUrl}/tools/controls/ems/array/${cmd.array}/string/${cmd.string}/lightbarcommand?red=${cmd.red}&green=${cmd.green}&blue=${cmd.blue}&white=${cmd.white}&duration=${cmd.duration}`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) {
          return {
            ...cmd,
            ok: false,
            url,
            error: `HTTP ${res.status}`
          };
        }

        const text = await res.text();
        const lowerText = text.toLowerCase();
        if (
          lowerText.includes("error") ||
          lowerText.includes("exception") ||
          lowerText.includes("forbidden") ||
          lowerText.includes("unauthorized") ||
          lowerText.includes("failed")
        ) {
          return {
            ...cmd,
            ok: false,
            url,
            error: `Device rejected command: ${text.substring(0, 150)}`
          };
        }

        return {
          ...cmd,
          ok: true,
          url,
          error: null
        };
      } catch (err: any) {
        return {
          ...cmd,
          ok: false,
          url,
          error: err.message || "Network Timeout"
        };
      }
    }

    async function worker() {
      while (currentIndex < commands.length) {
        const index = currentIndex++;
        const cmd = commands[index];
        results[index] = await sendCommand(cmd);
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, commands.length) }, worker);
    await Promise.all(workers);

    return results;
  }

  /**
   * Applies a set of manual commands.
   */
  public static async applyManualCommands(
    mode: LightbarMode,
    previewItems: { array: number; string: number; red: number; green: number; blue: number; white: number; duration: number }[],
    concurrency: number,
    arrays: string,
    strings: string,
    operator?: string
  ): Promise<LightbarResultItem[]> {
    const results = await this.executeCommandsWithConcurrency(previewItems, concurrency);
    
    const successCount = results.filter(r => r.ok).length;
    const failedCount = results.length - successCount;

    // Log this action to audit logs
    this.writeAuditLog({
      mode,
      source: "manual",
      dryRun: false,
      commandCount: previewItems.length,
      successCount,
      failedCount,
      duration: previewItems[0]?.duration || 60,
      arrays,
      strings,
      operator
    });

    return results;
  }

  /**
   * Runs the Fault Visualizer logic once.
   * If dryRun is false, actually dispatches Turtle commands.
   */
  public static async runFaultVisualizerCycle(options: {
    dryRun: boolean;
    clearOnResolved: boolean;
    refreshOnChange: boolean;
    concurrency: number;
    durationSeconds: number;
    warningColor: RGBW;
    alarmColor: RGBW;
    clearColor: RGBW;
    ignoredPatterns: string[];
    operator?: string;
  }): Promise<{
    success: boolean;
    dryRun: boolean;
    summary: {
      alarmCount: number;
      warningCount: number;
      ignoredOnlyCount: number;
      clearPendingCount: number;
      commandCount: number;
    };
    commandsSentCount: number;
    successCount: number;
    failedCount: number;
    results: LightbarResultItem[];
  }> {
    const activeStates = computeFaultLightbarStates({
      warningColor: options.warningColor,
      alarmColor: options.alarmColor,
      clearColor: options.clearColor,
      ignoredPatterns: options.ignoredPatterns,
      clearOnResolved: options.clearOnResolved,
      refreshOnChange: options.refreshOnChange
    });

    // Determine what calls are pending
    const commandsToRun: {
      blockId?: string;
      blockIndex?: number;
      array: number;
      string: number;
      red: number;
      green: number;
      blue: number;
      white: number;
      duration: number;
      severity: any;
      signature: string;
    }[] = [];
    const keysToClear: string[] = [];
    const keysToSet: { key: string; severity: any; color: any; signature: string; array: number; string: number; blockId?: string; blockIndex?: number }[] = [];

    let alarmCount = 0;
    let warningCount = 0;
    let ignoredOnlyCount = 0;
    let clearPendingCount = 0;

    for (const state of activeStates) {
      const blockIndex = state.blockIndex ?? 1;
      const blockId = state.blockId ?? `block-${blockIndex}`;
      const key = `${blockIndex}-${state.arrayIndex}-${state.stringIndex}`;
      const lastState = FaultLightbarEngineState.activeManagedLightbars.get(key);

      if (state.severity === "alarm") {
        alarmCount++;
      } else if (state.severity === "warning") {
        warningCount++;
      } else if (state.ignoredAlarms.length > 0 || state.ignoredWarnings.length > 0) {
        ignoredOnlyCount++;
      }

      const activeSig = JSON.stringify({
        effW: state.effectiveWarnings.sort(),
        effA: state.effectiveAlarms.sort()
      });

      let changed = false;

      if (!lastState) {
        if (state.desiredAction === "set-alarm" || state.desiredAction === "set-warning") {
          changed = true;
        }
      } else {
        if (lastState.severity !== state.severity) {
          changed = true;
        } else if (options.refreshOnChange && lastState.activeFaultSignature !== activeSig) {
          changed = true;
        }
      }

      if (state.desiredAction === "clear") {
        clearPendingCount++;
        changed = true; // Needs resolve trigger
      }

      if (changed) {
        if (state.desiredAction === "clear") {
          commandsToRun.push({
            blockId,
            blockIndex,
            array: state.arrayIndex,
            string: state.stringIndex,
            red: options.clearColor.red,
            green: options.clearColor.green,
            blue: options.clearColor.blue,
            white: options.clearColor.white,
            duration: FaultLightbarEngineState.clearDurationSeconds || 1,
            severity: "none",
            signature: ""
          });
          keysToClear.push(key);
        } else {
          commandsToRun.push({
            blockId,
            blockIndex,
            array: state.arrayIndex,
            string: state.stringIndex,
            red: state.desiredColor.red,
            green: state.desiredColor.green,
            blue: state.desiredColor.blue,
            white: state.desiredColor.white,
            duration: options.durationSeconds,
            severity: state.severity,
            signature: activeSig
          });
          keysToSet.push({
            key,
            severity: state.severity,
            color: state.desiredColor,
            signature: activeSig,
            array: state.arrayIndex,
            string: state.stringIndex,
            blockId,
            blockIndex
          });
        }
      }
    }

    const commandCount = commandsToRun.length;
    const summary = {
      alarmCount,
      warningCount,
      ignoredOnlyCount,
      clearPendingCount,
      commandCount
    };

    let commandsSentCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let results: LightbarResultItem[] = [];

    if (commandsToRun.length > 0 && !options.dryRun) {
      results = await this.executeCommandsWithConcurrency(commandsToRun, options.concurrency);
      commandsSentCount = results.length;
      
      // Update our managed list according to successes
      const now = new Date().toISOString();
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const cmd = commandsToRun[i];
        const key = `${cmd.blockIndex ?? 1}-${cmd.array}-${cmd.string}`;

        if (res.ok) {
          successCount++;
          if (cmd.severity === "none") {
            FaultLightbarEngineState.activeManagedLightbars.delete(key);
          } else {
            FaultLightbarEngineState.activeManagedLightbars.set(key, {
              key,
              blockId: cmd.blockId,
              blockIndex: cmd.blockIndex,
              arrayIndex: cmd.array,
              stringIndex: cmd.string,
              severity: cmd.severity,
              color: { red: cmd.red, green: cmd.green, blue: cmd.blue, white: cmd.white },
              lastAppliedAt: now,
              activeFaultSignature: cmd.signature
            });
          }
        } else {
          failedCount++;
        }
      }
      this.saveManagedStates();
    } else {
      // In dry run, we don't dispatch, but let's record results as ok for visualization
      results = commandsToRun.map(cmd => ({
        blockId: cmd.blockId,
        blockIndex: cmd.blockIndex,
        array: cmd.array,
        string: cmd.string,
        red: cmd.red,
        green: cmd.green,
        blue: cmd.blue,
        white: cmd.white,
        duration: cmd.duration,
        ok: true,
        url: "dry-run",
        error: null
      }));
    }

    // Only write audit if query is NOT a live no-op polling dry-run
    const isLivePolling = (options as any).isLivePolling === true;
    const isNoOp = commandsToRun.length === 0;
    
    const shouldAudit = !isLivePolling || !isNoOp || failedCount > 0;

    if (shouldAudit) {
      this.writeAuditLog({
        mode: isLivePolling ? "Fault Visualizer Polling Cycle" : "Fault Visualizer Run Once",
        source: "fault-visualizer",
        dryRun: options.dryRun,
        commandCount: commandsToRun.length,
        successCount: options.dryRun ? commandsToRun.length : successCount,
        failedCount: options.dryRun ? 0 : failedCount,
        duration: options.durationSeconds,
        arrays: "managed",
        strings: "managed",
        operator: options.operator,
        faultSignatures: commandsToRun.map(c => `[B${c.blockIndex}A${c.array}S${c.string}] ${c.severity}: ${c.signature}`),
        ignoredFaultPatterns: options.ignoredPatterns
      });
    }

    FaultLightbarEngineState.lastRunTime = new Date().toISOString();
    FaultLightbarEngineState.lastSummary = summary;

    return {
      success: true,
      dryRun: options.dryRun,
      summary,
      commandsSentCount,
      successCount,
      failedCount,
      results
    };
  }

  /**
   * Starts background telemetry polling loops.
   */
  public static startLiveFaultVisualizer(config: {
    dryRun: boolean;
    clearOnResolved: boolean;
    refreshOnChange: boolean;
    pollIntervalSeconds: number;
    durationSeconds: number;
    warningColor: RGBW;
    alarmColor: RGBW;
    clearColor: RGBW;
    ignoredPatterns: string[];
    concurrency: number;
    operator?: string;
  }) {
    this.stopLiveFaultVisualizer();

    FaultLightbarEngineState.enabled = true;
    FaultLightbarEngineState.dryRun = config.dryRun;
    FaultLightbarEngineState.liveModeActive = true;
    FaultLightbarEngineState.pollIntervalSeconds = config.pollIntervalSeconds;
    FaultLightbarEngineState.warningColor = config.warningColor;
    FaultLightbarEngineState.alarmColor = config.alarmColor;
    FaultLightbarEngineState.clearColor = config.clearColor;
    FaultLightbarEngineState.ignoredPatterns = config.ignoredPatterns;
    FaultLightbarEngineState.clearOnResolved = config.clearOnResolved;
    FaultLightbarEngineState.refreshOnChange = config.refreshOnChange;
    FaultLightbarEngineState.activeFaultDurationSeconds = config.durationSeconds;

    console.log("PRIZM Fault Visualizer service is active.");

    this.writeAuditLog({
      mode: "Fault Visualizer Continuous Loop Started",
      source: "fault-visualizer",
      dryRun: config.dryRun,
      commandCount: 0,
      successCount: 0,
      failedCount: 0,
      duration: config.durationSeconds,
      arrays: "managed",
      strings: "managed",
      operator: config.operator || "Operator"
    });

    const poll = async () => {
      try {
        await this.runFaultVisualizerCycle({
          dryRun: FaultLightbarEngineState.dryRun,
          clearOnResolved: FaultLightbarEngineState.clearOnResolved,
          refreshOnChange: FaultLightbarEngineState.refreshOnChange,
          concurrency: config.concurrency || 8,
          durationSeconds: FaultLightbarEngineState.activeFaultDurationSeconds,
          warningColor: FaultLightbarEngineState.warningColor,
          alarmColor: FaultLightbarEngineState.alarmColor,
          clearColor: FaultLightbarEngineState.clearColor,
          ignoredPatterns: FaultLightbarEngineState.ignoredPatterns,
          operator: "Live system daemon",
          isLivePolling: true
        } as any);
      } catch (e: any) {
        FaultLightbarEngineState.lastError = e.message || String(e);
        console.error("Error in live fault visualizer polling cycle:", e);
      }

      if (FaultLightbarEngineState.liveModeActive) {
        FaultLightbarEngineState.pollTimer = setTimeout(poll, FaultLightbarEngineState.pollIntervalSeconds * 1000);
      }
    };

    // Run first cycle asynchronously immediately
    setTimeout(poll, 100);
  }

  public static stopLiveFaultVisualizer() {
    if (FaultLightbarEngineState.liveModeActive) {
      this.writeAuditLog({
        mode: "Fault Visualizer Continuous Loop Stopped",
        source: "fault-visualizer",
        dryRun: false,
        commandCount: 0,
        successCount: 0,
        failedCount: 0,
        duration: 0,
        arrays: "managed",
        strings: "managed",
        operator: "Operator"
      });
    }

    FaultLightbarEngineState.enabled = false;
    FaultLightbarEngineState.liveModeActive = false;
    if (FaultLightbarEngineState.pollTimer) {
      clearTimeout(FaultLightbarEngineState.pollTimer);
      FaultLightbarEngineState.pollTimer = null;
    }
  }

  /**
   * Resets and clears all managed.
   */
  public static async clearAllManaged(concurrency: number): Promise<LightbarResultItem[]> {
    const list = this.getManagedStates();
    const commands = list.map(item => ({
      blockId: item.blockId,
      blockIndex: item.blockIndex,
      array: item.arrayIndex,
      string: item.stringIndex,
      red: FaultLightbarEngineState.clearColor.red,
      green: FaultLightbarEngineState.clearColor.green,
      blue: FaultLightbarEngineState.clearColor.blue,
      white: FaultLightbarEngineState.clearColor.white,
      duration: FaultLightbarEngineState.clearDurationSeconds || 1
    }));

    let results: LightbarResultItem[] = [];
    if (commands.length > 0) {
      results = await this.executeCommandsWithConcurrency(commands, concurrency);
      
      // Remove successfully cleared items from tracked map
      for (const res of results) {
        if (res.ok) {
          const matchedCommand = commands.find(c => c.array === res.array && c.string === res.string);
          const bIdx = matchedCommand?.blockIndex ?? 1;
          const key = `${bIdx}-${res.array}-${res.string}`;
          FaultLightbarEngineState.activeManagedLightbars.delete(key);
        }
      }
      this.saveManagedStates();
    }

    this.writeAuditLog({
      mode: "Clear All Managed Fault Lightbars",
      source: "fault-visualizer",
      dryRun: false,
      commandCount: commands.length,
      successCount: results.filter(r => r.ok).length,
      failedCount: results.filter(r => !r.ok).length,
      duration: FaultLightbarEngineState.clearDurationSeconds || 1,
      arrays: "managed",
      strings: "managed",
      operator: "Manual Reset Action"
    });

    return results;
  }
}
