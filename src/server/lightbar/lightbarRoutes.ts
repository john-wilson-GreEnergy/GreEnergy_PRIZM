import { Router, Request, Response, NextFunction } from "express";
import { LightbarService } from "./lightbarService";
import {
  validatePatternInput,
  generatePatternPreview,
  parseRangeSelection,
  getEffectiveTopologyLimits
} from "./lightbarPatternEngine";
import { FaultLightbarEngineState, computeFaultLightbarStates } from "./faultLightbarEngine";
import { ProfileStore } from "../profiles/profileStore";
import { getEmsCachedRawStrings } from "../emsTurtleClient";

const router = Router();

// Handle cross-cutting errors gracefully
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Configuration check helper
const ensureProfileReady = () => {
  const profile = ProfileStore.getActiveProfile();
  if (!profile || !profile.emsHost || !profile.emsPort || !profile.turtlePath) {
    throw new Error("Active EMS profile is missing or connection settings are not configured. Cannot perform lightbar operations.");
  }
  return profile;
};

/**
 * GET /api/local/lightbar/status
 */
router.get("/status", asyncHandler(async (req: Request, res: Response) => {
  const profile = ProfileStore.getActiveProfile();
  const ready = !!(profile && profile.emsHost && profile.emsPort && profile.turtlePath);
  
  // Calculate raw strings data age
  const cacheRaw = getEmsCachedRawStrings();
  const lastUpdated = cacheRaw.lastUpdated;
  let faultDataAgeSeconds = -1;
  if (lastUpdated) {
    faultDataAgeSeconds = Math.max(0, Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000));
  }

  res.json({
    success: true,
    ready,
    activeProfile: profile ? {
      id: profile.id,
      profileName: profile.profileName,
      emsHost: profile.emsHost,
      emsPort: profile.emsPort,
      turtlePath: profile.turtlePath,
      emsBaseUrl: ready ? `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}` : "Connecting...",
      blocks: profile.topologyModel?.blocks || []
    } : null,
    turtleBaseUrl: ready ? `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}` : "Connecting...",
    faultDataLastUpdated: lastUpdated,
    source: cacheRaw.source,
    faultDataAgeSeconds,
    faultVisualizerEnabled: FaultLightbarEngineState.enabled,
    faultVisualizerDryRun: FaultLightbarEngineState.dryRun,
    managedLightbarCount: FaultLightbarEngineState.activeManagedLightbars.size
  });
}));

/**
 * GET /api/local/lightbar/capabilities
 */
router.get("/capabilities", asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    executor: "turtle-direct",
    endpointTemplate: "/tools/controls/ems/array/{array}/string/{string}/lightbarcommand",
    modes: ["single", "alt4", "mirror", "usa", "clear"],
    faultVisualizer: true,
    limits: {
      red: { min: 0, max: 255 },
      green: { min: 0, max: 255 },
      blue: { min: 0, max: 255 },
      white: { min: 0, max: 255 },
      durationSeconds: { min: 1, max: 86400 },
      concurrency: { min: 1, max: 64, default: 8 }
    },
    defaults: {
      singleDurationSeconds: 60,
      usaDurationSeconds: 50400,
      clear: {
        arrayStart: 1,
        arrayEnd: 8,
        stringStart: 1,
        stringEnd: 40,
        red: 0,
        green: 0,
        blue: 0,
        white: 255,
        durationSeconds: 1
      },
      faultVisualizer: {
        warningColor: { red: 255, green: 255, blue: 0, white: 0 },
        alarmColor: { red: 255, green: 0, blue: 0, white: 0 },
        clearColor: { red: 0, green: 0, blue: 0, white: 255 },
        clearDurationSeconds: 1,
        activeFaultDurationSeconds: 50400,
        pollIntervalSeconds: 30,
        dryRunDefault: true
      }
    }
  });
}));

/**
 * POST /api/local/lightbar/preview
 */
router.post("/preview", asyncHandler(async (req: Request, res: Response) => {
  ensureProfileReady();
  const options = req.body;
  
  const validation = validatePatternInput(options);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  const preview = generatePatternPreview(options);
  
  // Exclude duplicate arrays/strings counts for representation
  const { maxArray, maxString } = getEffectiveTopologyLimits();
  const arrCountSet = new Set(preview.map(p => p.array));
  const strCountSet = new Set(preview.map(p => p.string));

  res.json({
    success: true,
    mode: options.mode,
    arrayCount: arrCountSet.size,
    stringCount: strCountSet.size,
    commandCount: preview.length,
    durationSeconds: options.durationSeconds,
    preview,
    warnings: []
  });
}));

/**
 * POST /api/local/lightbar/apply
 */
router.post("/apply", asyncHandler(async (req: Request, res: Response) => {
  ensureProfileReady();
  const options = req.body;

  if (!options.confirmed) {
    return res.status(400).json({ success: false, error: "Explicit user confirmation is required to deploy visual field commands." });
  }

  const validation = validatePatternInput(options);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  const preview = generatePatternPreview(options);
  const concurrency = options.concurrency || 8;

  const results = await LightbarService.applyManualCommands(
    options.mode,
    preview,
    concurrency,
    options.arrays,
    options.strings,
    options.operator || "Operator Console"
  );

  const successCount = results.filter(r => r.ok).length;
  const failedCount = results.length - successCount;

  res.json({
    success: true,
    mode: options.mode,
    commandCount: results.length,
    successCount,
    failedCount,
    durationSeconds: options.durationSeconds,
    results
  });
}));

/**
 * POST /api/local/lightbar/clear
 */
router.post("/clear", asyncHandler(async (req: Request, res: Response) => {
  ensureProfileReady();
  const options = req.body;

  if (!options.confirmed) {
    return res.status(400).json({ success: false, error: "Confirmatory click is required to clear string lightbars." });
  }

  const concurrency = options.concurrency || 8;
  const { maxArray, maxString } = getEffectiveTopologyLimits();
  const arrays = `1-${maxArray}`;
  const strings = `1-${maxString}`;

  const clearOptions = {
    mode: "clear" as const,
    arrays,
    strings,
    color: { red: 0, green: 0, blue: 0, white: 255 },
    durationSeconds: 1
  };

  const preview = generatePatternPreview(clearOptions);
  
  const results = await LightbarService.applyManualCommands(
    "clear",
    preview,
    concurrency,
    arrays,
    strings,
    options.operator || "Operator Dashboard Shortcut"
  );

  const successCount = results.filter(r => r.ok).length;
  const failedCount = results.length - successCount;

  res.json({
    success: true,
    mode: "clear",
    commandCount: results.length,
    successCount,
    failedCount,
    durationSeconds: 1,
    results
  });
}));

/**
 * GET /api/local/lightbar/audit
 */
router.get("/audit", asyncHandler(async (req: Request, res: Response) => {
  const logs = LightbarService.getAuditLogs();
  // Filter for manual control events or return all
  res.json(logs);
}));


/* ==========================================================================
   FAULT VISUALIZER ROUTES
   ========================================================================== */

/**
 * GET /api/local/lightbar/fault-visualizer/status
 */
router.get("/fault-visualizer/status", asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    enabled: FaultLightbarEngineState.enabled,
    dryRun: FaultLightbarEngineState.dryRun,
    liveModeActive: FaultLightbarEngineState.liveModeActive,
    lastRunTime: FaultLightbarEngineState.lastRunTime,
    pollIntervalSeconds: FaultLightbarEngineState.pollIntervalSeconds,
    warningColor: FaultLightbarEngineState.warningColor,
    alarmColor: FaultLightbarEngineState.alarmColor,
    ignoredPatterns: FaultLightbarEngineState.ignoredPatterns,
    activeManagedLightbars: LightbarService.getManagedStates(),
    lastSummary: FaultLightbarEngineState.lastSummary,
    lastError: FaultLightbarEngineState.lastError
  });
}));

/**
 * POST /api/local/lightbar/fault-visualizer/preview
 */
router.post("/fault-visualizer/preview", asyncHandler(async (req: Request, res: Response) => {
  const config = req.body || {};
  
  const activeStates = computeFaultLightbarStates({
    warningColor: config.warningColor,
    alarmColor: config.alarmColor,
    clearColor: config.clearColor,
    ignoredPatterns: config.ignoredPatterns,
    clearOnResolved: config.clearOnResolved,
    refreshOnChange: config.refreshOnChange
  });

  // Calculate actions and summaries
  let alarmCount = 0;
  let warningCount = 0;
  let ignoredOnlyCount = 0;
  let clearPendingCount = 0;

  const actions = activeStates.map(state => {
    if (state.severity === "alarm") {
      alarmCount++;
    } else if (state.severity === "warning") {
      warningCount++;
    } else if (state.ignoredAlarms.length > 0 || state.ignoredWarnings.length > 0) {
      ignoredOnlyCount++;
    }

    if (state.desiredAction === "clear") {
      clearPendingCount++;
    }

    return {
      blockId: state.blockId,
      blockIndex: state.blockIndex,
      arrayIndex: state.arrayIndex,
      stringIndex: state.stringIndex,
      severity: state.severity,
      desiredAction: state.desiredAction,
      color: state.desiredColor,
      effectiveAlarms: state.effectiveAlarms,
      ignoredAlarms: state.ignoredAlarms,
      effectiveWarnings: state.effectiveWarnings,
      ignoredWarnings: state.ignoredWarnings
    };
  });

  const commandCount = actions.filter(a => a.desiredAction !== "none").length;

  res.json({
    success: true,
    dryRun: config.dryRun !== undefined ? config.dryRun : true,
    summary: {
      alarmCount,
      warningCount,
      ignoredOnlyCount,
      clearPendingCount,
      commandCount
    },
    actions
  });
}));

/**
 * POST /api/local/lightbar/fault-visualizer/apply-once
 */
router.post("/fault-visualizer/apply-once", asyncHandler(async (req: Request, res: Response) => {
  const config = req.body || {};

  if (!config.confirmed) {
    return res.status(400).json({ success: false, error: "Confirmation is required to trigger fault illumination cycle." });
  }

  const dryRunValue = config.dryRun !== undefined ? config.dryRun : false;
  if (!dryRunValue) {
    ensureProfileReady();

    // Data age check
    const cacheRaw = getEmsCachedRawStrings();
    const lastUpdated = cacheRaw.lastUpdated;
    let faultDataAgeSeconds = -1;
    if (lastUpdated) {
      faultDataAgeSeconds = Math.max(0, Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000));
    }
    const isStale = !lastUpdated || faultDataAgeSeconds > 60;
    const bypass = config.bypassStaleCheck === true || config.overrideStaleCheck === true;

    if (isStale && !bypass) {
      const ageStr = lastUpdated ? `${faultDataAgeSeconds}s` : "unknown";
      return res.status(400).json({
        success: false,
        error: `Fault telemetry data is stale (age: ${ageStr}). Live commands blocked. Please refresh the strings dashboard first.`,
        stale: true,
        ageSeconds: faultDataAgeSeconds
      });
    }
  }

  const results = await LightbarService.runFaultVisualizerCycle({
    dryRun: dryRunValue,
    clearOnResolved: config.clearOnResolved !== undefined ? config.clearOnResolved : true,
    refreshOnChange: config.refreshOnChange !== undefined ? config.refreshOnChange : true,
    concurrency: config.concurrency || 8,
    durationSeconds: config.durationSeconds || 50400,
    warningColor: config.warningColor || FaultLightbarEngineState.warningColor,
    alarmColor: config.alarmColor || FaultLightbarEngineState.alarmColor,
    clearColor: config.clearColor || FaultLightbarEngineState.clearColor,
    ignoredPatterns: config.ignoredPatterns || FaultLightbarEngineState.ignoredPatterns,
    operator: config.operator || "Operator Run Once"
  });

  res.json(results);
}));

/**
 * POST /api/local/lightbar/fault-visualizer/start
 */
router.post("/fault-visualizer/start", asyncHandler(async (req: Request, res: Response) => {
  const config = req.body || {};

  if (!config.confirmed) {
    return res.status(400).json({ success: false, error: "Confirmation is required to initiate live daemon mode." });
  }

  const dryRunValue = config.dryRun !== undefined ? config.dryRun : true;
  if (!dryRunValue) {
    ensureProfileReady();

    // Data age check
    const cacheRaw = getEmsCachedRawStrings();
    const lastUpdated = cacheRaw.lastUpdated;
    let faultDataAgeSeconds = -1;
    if (lastUpdated) {
      faultDataAgeSeconds = Math.max(0, Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000));
    }
    const isStale = !lastUpdated || faultDataAgeSeconds > 60;
    const bypass = config.bypassStaleCheck === true || config.overrideStaleCheck === true;

    if (isStale && !bypass) {
      const ageStr = lastUpdated ? `${faultDataAgeSeconds}s` : "unknown";
      return res.status(400).json({
        success: false,
        error: `Fault telemetry data is stale (age: ${ageStr}). Live loop start blocked. Please refresh the strings dashboard first.`,
        stale: true,
        ageSeconds: faultDataAgeSeconds
      });
    }
  }

  LightbarService.startLiveFaultVisualizer({
    dryRun: dryRunValue,
    clearOnResolved: config.clearOnResolved !== undefined ? config.clearOnResolved : true,
    refreshOnChange: config.refreshOnChange !== undefined ? config.refreshOnChange : true,
    pollIntervalSeconds: config.pollIntervalSeconds || 30,
    durationSeconds: config.durationSeconds || 50400,
    warningColor: config.warningColor || FaultLightbarEngineState.warningColor,
    alarmColor: config.alarmColor || FaultLightbarEngineState.alarmColor,
    clearColor: config.clearColor || FaultLightbarEngineState.clearColor,
    ignoredPatterns: config.ignoredPatterns || FaultLightbarEngineState.ignoredPatterns,
    concurrency: config.concurrency || 8,
    operator: config.operator || "Live System Service"
  });

  res.json({
    success: true,
    enabled: true,
    dryRun: dryRunValue,
    message: "Fault Visualizer loop has been initialized."
  });
}));

/**
 * POST /api/local/lightbar/fault-visualizer/stop
 */
router.post("/fault-visualizer/stop", asyncHandler(async (req: Request, res: Response) => {
  const config = req.body || {};
  
  LightbarService.stopLiveFaultVisualizer();

  let clearedResults = [];
  if (config.clearManagedLightbars) {
    clearedResults = await LightbarService.clearAllManaged(config.concurrency || 8);
  }

  res.json({
    success: true,
    enabled: false,
    clearedCount: clearedResults.length,
    message: "Fault Visualizer loop has been terminated safely."
  });
}));

/**
 * POST /api/local/lightbar/fault-visualizer/clear-resolved
 */
router.post("/fault-visualizer/clear-resolved", asyncHandler(async (req: Request, res: Response) => {
  ensureProfileReady();
  const config = req.body || {};
  const activeStates = computeFaultLightbarStates({});
  
  const pendingClears = activeStates.filter(s => s.desiredAction === "clear");
  const commands = pendingClears.map(s => ({
    blockId: s.blockId,
    blockIndex: s.blockIndex,
    array: s.arrayIndex,
    string: s.stringIndex,
    red: FaultLightbarEngineState.clearColor.red,
    green: FaultLightbarEngineState.clearColor.green,
    blue: FaultLightbarEngineState.clearColor.blue,
    white: FaultLightbarEngineState.clearColor.white,
    duration: FaultLightbarEngineState.clearDurationSeconds || 1
  }));

  let results = [];
  if (commands.length > 0) {
    results = await LightbarService.executeCommandsWithConcurrency(commands, config.concurrency || 8);
    for (const resItem of results) {
      if (resItem.ok) {
        const cmd = commands.find(c => c.array === resItem.array && c.string === resItem.string);
        const bIdx = cmd?.blockIndex ?? 1;
        const key = `${bIdx}-${resItem.array}-${resItem.string}`;
        FaultLightbarEngineState.activeManagedLightbars.delete(key);
      }
    }
    LightbarService.saveManagedStates();
  }

  res.json({
    success: true,
    clearedCount: results.filter(r => r.ok).length,
    failedCount: results.filter(r => !r.ok).length,
    results
  });
}));

/**
 * POST /api/local/lightbar/fault-visualizer/clear-all
 */
router.post("/fault-visualizer/clear-all", asyncHandler(async (req: Request, res: Response) => {
  const config = req.body || {};
  const results = await LightbarService.clearAllManaged(config.concurrency || 8);

  res.json({
    success: true,
    clearedCount: results.filter(r => r.ok).length,
    failedCount: results.filter(r => !r.ok).length,
    results
  });
}));

/**
 * GET /api/local/lightbar/fault-visualizer/audit
 */
router.get("/fault-visualizer/audit", asyncHandler(async (req: Request, res: Response) => {
  const logs = LightbarService.getAuditLogs();
  const filtered = logs.filter(log => log.source === "fault-visualizer");
  res.json(filtered);
}));

export default router;
