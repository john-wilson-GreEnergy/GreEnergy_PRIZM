import express, { Router } from "express";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import * as prizmDataCoordinator from "../prizmDataCoordinator";
import { buildSiteSensorSummary } from "../siteSensors/siteSensorsRoutes";

const router = Router();

export type DiagnosticSession = {
  id: string;
  name: string;
  technician?: string;
  notes?: string;
  startedAt: string;
  endedAt?: string;
  active: boolean;
  paused: boolean;
  pollIntervalMs: number;
  captureScope: {
    strings: boolean;
    stringDetails: boolean;
    balancing: boolean;
    pcs: boolean;
    siteSensors: boolean;
    hvac: boolean;
    sourceHealth: boolean;
    notifications: boolean;
  };
  sampleCount: number;
  lastPollAt?: string;
  lastPollStatus?: "success" | "partial" | "failed";
  storageEstimateBytes?: number;
};

export type DiagnosticSessionSample = {
  sessionId: string;
  timestamp: string;
  pollDurationMs: number;
  sourceQuality: "live" | "partial" | "stale" | "failed";
  data: {
    strings?: any;
    stringDetails?: any;
    balancing?: any;
    pcs?: any;
    siteSensors?: any;
    hvac?: any;
    sourceHealth?: any;
    notifications?: any;
  };
  errors?: Array<{
    source: string;
    error: string;
  }>;
};

// Global session state in-memory
let activeSession: DiagnosticSession | null = null;
let pollIntervalTimer: NodeJS.Timeout | null = null;

const SESSIONS_DIR = path.join(process.cwd(), "data", "diagnostic-sessions");
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Helper to convert Bytes to MB approx
function getSessionDirectorySize(sessionId: string): number {
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) return 0;
  let totalSize = 0;
  try {
    const files = fs.readdirSync(sessionDir);
    for (const file of files) {
      const filePath = path.join(sessionDir, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        totalSize += stat.size;
      }
    }
  } catch (e) {
    // ignore
  }
  return totalSize;
}

// Core Capture Snapshot Helper
async function captureDataSnapshot(scope: DiagnosticSession["captureScope"]): Promise<{
  data: DiagnosticSessionSample["data"];
  errors: DiagnosticSessionSample["errors"];
  sourceQuality: DiagnosticSessionSample["sourceQuality"];
}> {
  const data: DiagnosticSessionSample["data"] = {};
  const errors: DiagnosticSessionSample["errors"] = [];
  let sourceQuality: DiagnosticSessionSample["sourceQuality"] = "live";

  const snapshot = prizmDataCoordinator.getLatestSnapshot();
  const emsState = snapshot?.liveStatus?.state || "OFFLINE";
  if (emsState === "OFFLINE") sourceQuality = "failed";
  else if (emsState === "PARTIAL" || emsState === "CACHED") sourceQuality = "partial";
  else sourceQuality = "live";

  // Strings
  if (scope.strings) {
    try {
      data.strings = snapshot?.normalized?.strings || [];
    } catch (e: any) {
      errors.push({ source: "strings", error: e.message });
    }
  }

  // PCS
  if (scope.pcs) {
    try {
      data.pcs = snapshot?.normalized?.pcs || [];
    } catch (e: any) {
      errors.push({ source: "pcs", error: e.message });
    }
  }

  // Site Sensors
  if (scope.siteSensors) {
    try {
      const summary = buildSiteSensorSummary();
      data.siteSensors = summary?.rows || [];
    } catch (e: any) {
      errors.push({ source: "siteSensors", error: e.message });
    }
  }

  // HVAC / Feather
  if (scope.hvac) {
    try {
      data.hvac = snapshot?.normalized?.feather || [];
    } catch (e: any) {
      errors.push({ source: "hvac", error: e.message });
    }
  }

  // Source Health
  if (scope.sourceHealth) {
    try {
      data.sourceHealth = snapshot?.rollups?.sourceHealth || snapshot?.liveStatus || null;
    } catch (e: any) {
      errors.push({ source: "sourceHealth", error: e.message });
    }
  }

  // Notifications
  if (scope.notifications) {
    try {
      data.notifications = snapshot?.normalized?.correctiveActions || [];
    } catch (e: any) {
      errors.push({ source: "notifications", error: e.message });
    }
  }

  // String details and/or Balancing Detail
  if (scope.stringDetails || scope.balancing) {
    try {
      const stringsList = snapshot?.normalized?.strings || [];
      const balancingDetailsList: any[] = [];
      const stringDetailsList: any[] = [];

      // Query only strings that are communicating/active to limit LAN overhead
      const targetStrings = stringsList.filter(s => s.bucket !== "notCommunicating");

      // Perform detail query sequentially or in small parallel chunk to be fast & safe
      const fetchPromises = targetStrings.map(async (strRow) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1200);
          const detailUrl = `http://localhost:3000/api/local/strings/dashboard/${strRow.arrayNumber}/${strRow.stringNumber}/detail`;
          const r = await fetch(detailUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (r.ok) {
            const detailRes = await r.json();
            return {
              arrayNumber: strRow.arrayNumber,
              stringNumber: strRow.stringNumber,
              detail: detailRes
            };
          }
        } catch (err) {
          // fail silently
        }
        return null;
      });

      const fetchResults = await Promise.all(fetchPromises);
      for (const res of fetchResults) {
        if (!res) continue;
        if (scope.balancing && res.detail.balancingDetails) {
          balancingDetailsList.push(...res.detail.balancingDetails);
        }
        if (scope.stringDetails) {
          stringDetailsList.push({
            arrayNumber: res.arrayNumber,
            stringNumber: res.stringNumber,
            voltageMatrix: res.detail.voltageMatrix,
            temperatureMatrix: res.detail.temperatureMatrix,
            bpcs: res.detail.bpcs,
            hasBalancingMap: res.detail.hasBalancingMap
          });
        }
      }

      if (scope.balancing) {
        data.balancing = balancingDetailsList;
      }
      if (scope.stringDetails) {
        data.stringDetails = stringDetailsList;
      }
    } catch (e: any) {
      errors.push({ source: "stringDetailsOrBalancing", error: e.message });
    }
  }

  return { data, errors, sourceQuality };
}

// Append sample to samples.jsonl
function appendSampleToJournal(sessionId: string, sample: DiagnosticSessionSample) {
  try {
    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const filePath = path.join(sessionDir, "samples.jsonl");
    fs.appendFileSync(filePath, JSON.stringify(sample) + "\n", "utf8");
  } catch (e) {
    console.error("Failed to append diagnostic session sample:", e);
  }
}

// Generate comparison report summary
function generateComparisonSummary(start: any, end: any): any {
  if (!start || !end) return null;

  const startData = start.data || {};
  const endData = end.data || {};

  // New & cleared faults since baseline
  const startFaults: any[] = startData.notifications || [];
  const endFaults: any[] = endData.notifications || [];
  const startFaultKeys = new Set(startFaults.map(f => f.id || f.code || f.message));
  const endFaultKeys = new Set(endFaults.map(f => f.id || f.code || f.message));

  const newFaults = endFaults.filter(f => !startFaultKeys.has(f.id || f.code || f.message));
  const clearedFaults = startFaults.filter(f => !endFaultKeys.has(f.id || f.code || f.message));

  // Strings changed state
  const startStrings: any[] = startData.strings || [];
  const endStrings: any[] = endData.strings || [];
  const stringChanges: any[] = [];
  const startStringMap = new Map(startStrings.map(s => [`${s.arrayNumber}-${s.stringNumber}`, s]));
  endStrings.forEach(s => {
    const key = `${s.arrayNumber}-${s.stringNumber}`;
    const prev = startStringMap.get(key);
    if (prev && prev.state !== s.state) {
      stringChanges.push({
        string: `Array ${s.arrayNumber} String ${s.stringNumber}`,
        from: prev.state,
        to: s.state
      });
    }
  });

  // PCS changed state
  const startPcs: any[] = startData.pcs || [];
  const endPcs: any[] = endData.pcs || [];
  const pcsChanges: any[] = [];
  const startPcsMap = new Map(startPcs.map(p => [p.ip || p.id || p.name, p]));
  endPcs.forEach(p => {
    const key = p.ip || p.id || p.name;
    const prev = startPcsMap.get(key);
    if (prev && prev.state !== p.state) {
      pcsChanges.push({
        name: p.name || p.id || key,
        from: prev.state,
        to: p.state
      });
    }
  });

  // Sensors changed state
  const startSensors: any[] = startData.siteSensors || [];
  const endSensors: any[] = endData.siteSensors || [];
  const sensorChanges: any[] = [];
  const startSensorsMap = new Map(startSensors.map(s => [s.id, s]));
  endSensors.forEach(s => {
    const prev = startSensorsMap.get(s.id);
    if (prev && prev.health !== s.health) {
      sensorChanges.push({
        label: s.displayLabel,
        from: prev.health,
        to: s.health
      });
    }
  });

  // Balancing started/stopped
  const startBal: any[] = startData.balancing || [];
  const endBal: any[] = endData.balancing || [];
  const startBalBpcs = new Set(startBal.map(b => `${b.arrayNumber}-${b.stringNumber}-${b.bpcNumber}`));
  const endBalBpcs = new Set(endBal.map(b => `${b.arrayNumber}-${b.stringNumber}-${b.bpcNumber}`));

  const balancingStarted = endBal.filter(b => !startBalBpcs.has(`${b.arrayNumber}-${b.stringNumber}-${b.bpcNumber}`));
  const balancingStopped = startBal.filter(b => !endBalBpcs.has(`${b.arrayNumber}-${b.stringNumber}-${b.bpcNumber}`));

  // CapacityChanged calculation
  const startCapAvgSoc = startStrings.length > 0 ? (startStrings.reduce((acc, s) => acc + (s.soc || 0), 0) / startStrings.length).toFixed(1) : "0";
  const endCapAvgSoc = endStrings.length > 0 ? (endStrings.reduce((acc, s) => acc + (s.soc || 0), 0) / endStrings.length).toFixed(1) : "0";

  return {
    newFaults,
    clearedFaults,
    stringChanges,
    pcsChanges,
    sensorChanges,
    balancingStarted: balancingStarted.map(b => `Array ${b.arrayNumber} String ${b.stringNumber} BPC${b.bpcNumber}`),
    balancingStopped: balancingStopped.map(b => `Array ${b.arrayNumber} String ${b.stringNumber} BPC${b.bpcNumber}`),
    capacitySocialStart: startCapAvgSoc,
    capacitySocialEnd: endCapAvgSoc,
    durationMs: new Date(end.timestamp).getTime() - new Date(start.timestamp).getTime()
  };
}

// Endpoints

// GET /api/local/diagnostic-session/status
router.get("/status", (req, res) => {
  if (activeSession) {
    // update estimates dynamically
    activeSession.storageEstimateBytes = getSessionDirectorySize(activeSession.id);
    return res.json(activeSession);
  }
  res.json({ active: false, paused: false });
});

// POST /api/local/diagnostic-session/start
router.post("/start", async (req, res) => {
  try {
    if (activeSession) {
      return res.status(400).json({ error: "A diagnostic session is already active. Please stop it first." });
    }

    const { name, technician, notes, pollIntervalMs = 10000, captureScope } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: "session name is required" });
    }

    const sessionId = `ds_${Date.now()}_` + Math.random().toString(36).substring(2, 7);
    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const scope = {
      strings: !!captureScope?.strings,
      stringDetails: !!captureScope?.stringDetails,
      balancing: !!captureScope?.balancing,
      pcs: !!captureScope?.pcs,
      siteSensors: !!captureScope?.siteSensors,
      hvac: !!captureScope?.hvac,
      sourceHealth: !!captureScope?.sourceHealth,
      notifications: !!captureScope?.notifications
    };

    activeSession = {
      id: sessionId,
      name,
      technician,
      notes,
      startedAt: new Date().toISOString(),
      active: true,
      paused: false,
      pollIntervalMs,
      captureScope: scope,
      sampleCount: 0,
      storageEstimateBytes: 0
    };

    // 1. Capture Start Snapshot (baseline)
    const startTimeStamp = new Date().toISOString();
    const t0 = Date.now();
    const snapData = await captureDataSnapshot(scope);
    const t1 = Date.now();

    const startSnapshot: DiagnosticSessionSample = {
      sessionId,
      timestamp: startTimeStamp,
      pollDurationMs: t1 - t0,
      sourceQuality: snapData.sourceQuality,
      data: snapData.data,
      errors: snapData.errors
    };

    fs.writeFileSync(
      path.join(sessionDir, "start-snapshot.json"),
      JSON.stringify(startSnapshot, null, 2),
      "utf8"
    );

    activeSession.lastPollAt = startTimeStamp;
    activeSession.lastPollStatus = snapData.errors.length === 0 ? "success" : "partial";
    activeSession.sampleCount = 1;
    appendSampleToJournal(sessionId, startSnapshot);

    // Save initial session metadata
    fs.writeFileSync(
      path.join(sessionDir, "session.json"),
      JSON.stringify(activeSession, null, 2),
      "utf8"
    );

    // Setup Polling Scheduler
    const runPoller = async () => {
      if (!activeSession || activeSession.paused || !activeSession.active) return;
      
      const pollT0 = Date.now();
      const currentScope = activeSession.captureScope;
      const pollData = await captureDataSnapshot(currentScope);
      const pollT1 = Date.now();

      const sample: DiagnosticSessionSample = {
        sessionId: activeSession.id,
        timestamp: new Date().toISOString(),
        pollDurationMs: pollT1 - pollT0,
        sourceQuality: pollData.sourceQuality,
        data: pollData.data,
        errors: pollData.errors
      };

      appendSampleToJournal(activeSession.id, sample);

      activeSession.sampleCount++;
      activeSession.lastPollAt = sample.timestamp;
      activeSession.lastPollStatus = pollData.errors.length === 0 ? "success" : "partial";

      fs.writeFileSync(
        path.join(SESSIONS_DIR, activeSession.id, "session.json"),
        JSON.stringify(activeSession, null, 2),
        "utf8"
      );
    };

    pollIntervalTimer = setInterval(runPoller, pollIntervalMs);

    res.json(activeSession);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/local/diagnostic-session/pause
router.post("/pause", (req, res) => {
  if (!activeSession) {
    return res.status(404).json({ error: "No active diagnostic session to pause." });
  }
  activeSession.paused = true;
  fs.writeFileSync(
    path.join(SESSIONS_DIR, activeSession.id, "session.json"),
    JSON.stringify(activeSession, null, 2),
    "utf8"
  );
  res.json(activeSession);
});

// POST /api/local/diagnostic-session/resume
router.post("/resume", (req, res) => {
  if (!activeSession) {
    return res.status(404).json({ error: "No paused diagnostic session to resume." });
  }
  activeSession.paused = false;
  fs.writeFileSync(
    path.join(SESSIONS_DIR, activeSession.id, "session.json"),
    JSON.stringify(activeSession, null, 2),
    "utf8"
  );
  res.json(activeSession);
});

// POST /api/local/diagnostic-session/stop
router.post("/stop", async (req, res) => {
  try {
    if (!activeSession) {
      return res.status(404).json({ error: "No active diagnostic session to stop." });
    }

    if (pollIntervalTimer) {
      clearInterval(pollIntervalTimer);
      pollIntervalTimer = null;
    }

    activeSession.active = false;
    activeSession.paused = false;
    activeSession.endedAt = new Date().toISOString();

    const sessionDir = path.join(SESSIONS_DIR, activeSession.id);

    // 2. Capture End Snapshot (final comparison)
    const endTimeStamp = new Date().toISOString();
    const t0 = Date.now();
    const snapData = await captureDataSnapshot(activeSession.captureScope);
    const t1 = Date.now();

    const endSnapshot: DiagnosticSessionSample = {
      sessionId: activeSession.id,
      timestamp: endTimeStamp,
      pollDurationMs: t1 - t0,
      sourceQuality: snapData.sourceQuality,
      data: snapData.data,
      errors: snapData.errors
    };

    fs.writeFileSync(
      path.join(sessionDir, "end-snapshot.json"),
      JSON.stringify(endSnapshot, null, 2),
      "utf8"
    );

    appendSampleToJournal(activeSession.id, endSnapshot);
    activeSession.sampleCount++;

    activeSession.storageEstimateBytes = getSessionDirectorySize(activeSession.id);

    fs.writeFileSync(
      path.join(sessionDir, "session.json"),
      JSON.stringify(activeSession, null, 2),
      "utf8"
    );

    const savedSession = { ...activeSession };
    activeSession = null;

    res.json(savedSession);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/local/diagnostic-session/capture-once
router.post("/capture-once", async (req, res) => {
  try {
    const { name = "Single Snapshot" } = req.body || {};
    const scope = {
      strings: true,
      stringDetails: false,
      balancing: true,
      pcs: true,
      siteSensors: true,
      hvac: true,
      sourceHealth: true,
      notifications: true
    };

    const t0 = Date.now();
    const snap = await captureDataSnapshot(scope);
    const t1 = Date.now();

    const snapshotSample: DiagnosticSessionSample = {
      sessionId: "snapshot_once_" + Date.now(),
      timestamp: new Date().toISOString(),
      pollDurationMs: t1 - t0,
      sourceQuality: snap.sourceQuality,
      data: snap.data,
      errors: snap.errors
    };

    res.json({
      success: true,
      name,
      snapshot: snapshotSample
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/local/diagnostic-session/:sessionId
router.get("/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const sessionFile = path.join(SESSIONS_DIR, sessionId, "session.json");
  if (!fs.existsSync(sessionFile)) {
    return res.status(404).json({ error: "Session not found" });
  }
  try {
    const meta = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
    meta.storageEstimateBytes = getSessionDirectorySize(sessionId);
    res.json(meta);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/local/diagnostic-session/:sessionId/samples
router.get("/:sessionId/samples", (req, res) => {
  const { sessionId } = req.params;
  const journalFile = path.join(SESSIONS_DIR, sessionId, "samples.jsonl");
  if (!fs.existsSync(journalFile)) {
    return res.json([]);
  }
  try {
    const lines = fs.readFileSync(journalFile, "utf8").trim().split("\n");
    const samples = lines.filter(Boolean).map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    res.json(samples);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/local/diagnostic-session/:sessionId/summary
router.get("/:sessionId/summary", (req, res) => {
  const { sessionId } = req.params;
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  const startFile = path.join(sessionDir, "start-snapshot.json");
  const endFile = path.join(sessionDir, "end-snapshot.json");

  if (!fs.existsSync(startFile)) {
    return res.status(404).json({ error: "Baseline snapshot missing for this session" });
  }

  try {
    const startObj = JSON.parse(fs.readFileSync(startFile, "utf8"));
    const endObj = fs.existsSync(endFile) ? JSON.parse(fs.readFileSync(endFile, "utf8")) : startObj;
    const summary = generateComparisonSummary(startObj, endObj);
    res.json({
      sessionId,
      summary
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/local/diagnostic-session/:sessionId/export/json
router.get("/:sessionId/export/json", (req, res) => {
  const { sessionId } = req.params;
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ error: "Session not found" });
  }

  try {
    const metaFile = path.join(sessionDir, "session.json");
    const startFile = path.join(sessionDir, "start-snapshot.json");
    const endFile = path.join(sessionDir, "end-snapshot.json");
    const journalFile = path.join(sessionDir, "samples.jsonl");

    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : null;
    const start = fs.existsSync(startFile) ? JSON.parse(fs.readFileSync(startFile, "utf8")) : null;
    const end = fs.existsSync(endFile) ? JSON.parse(fs.readFileSync(endFile, "utf8")) : null;

    let samples: any[] = [];
    if (fs.existsSync(journalFile)) {
      const lines = fs.readFileSync(journalFile, "utf8").trim().split("\n");
      samples = lines.filter(Boolean).map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      }).filter(Boolean);
    }

    res.setHeader("Content-Disposition", `attachment; filename=diagnostic_session_${sessionId}_export.json`);
    res.setHeader("Content-Type", "application/json");
    res.json({
      meta,
      startSnapshot: start,
      endSnapshot: end,
      samples
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/local/diagnostic-session/:sessionId/export/csv
router.get("/:sessionId/export/csv", (req, res) => {
  const { sessionId } = req.params;
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ error: "Session not found" });
  }

  try {
    const journalFile = path.join(sessionDir, "samples.jsonl");
    let samples: DiagnosticSessionSample[] = [];
    if (fs.existsSync(journalFile)) {
      const lines = fs.readFileSync(journalFile, "utf8").trim().split("\n");
      samples = lines.filter(Boolean).map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      }).filter(Boolean);
    }

    // Accumulators for multiple files
    const csvStrings: string[] = ["timestamp,arrayNumber,stringNumber,voltage,current,temperature,soc,soh,state,communicating,balancingActive"];
    const csvPcs: string[] = ["timestamp,pcsIp,pcsName,pcsState,activePowerKw,reactivePowerKvar,dcVoltage,dcCurrent"];
    const csvSensors: string[] = ["timestamp,sensorId,displayLabel,health,temperature,humidity,doorOpen,smokeDetected,fireAlarm"];
    const csvNotifications: string[] = ["timestamp,id,severity,heading,body,cleared"];
    const csvSourceHealth: string[] = ["timestamp,state,source,liveSucceeded,stale,cacheUsed"];
    const csvBalancing: string[] = ["timestamp,arrayNumber,stringNumber,bpcNumber,cellGroupIndex,targetVoltage,state"];

    samples.forEach(sample => {
      const ts = sample.timestamp;

      // Extract Strings
      if (sample.data?.strings) {
        sample.data.strings.forEach((s: any) => {
          csvStrings.push(`"${ts}",${s.arrayNumber || s.arrayIndex},${s.stringNumber || s.stringIndex},${s.voltage || ""},${s.current || ""},${s.temperature || ""},${s.soc || ""},${s.soh || ""},"${s.state || ""}",${!!s.communicating},${!!s.balancingActive}`);
        });
      }

      // Extract PCS
      if (sample.data?.pcs) {
        sample.data.pcs.forEach((p: any) => {
          csvPcs.push(`"${ts}","${p.ip || p.id || ""}","${p.name || ""}","${p.state || ""}",${p.activePowerKw || 0},${p.reactivePowerKvar || 0},${p.dcVoltage || 0},${p.dcCurrent || 0}`);
        });
      }

      // Extract Sensors
      if (sample.data?.siteSensors) {
        sample.data.siteSensors.forEach((s: any) => {
          const rawSens = s.sensors || {};
          const fireState = rawSens.fire?.state || "na";
          const smokeState = rawSens.smoke?.state || "na";
          const doorState = rawSens.acDoors?.state || rawSens.dcDoors?.state || "na";
          csvSensors.push(`"${ts}","${s.id}","${s.displayLabel}","${s.health}","${s.raw?.temperature || ""}","${s.raw?.humidity || ""}",${doorState === "open"},${smokeState === "tripped"},${fireState === "tripped"}`);
        });
      }

      // Extract Notifications (corrective actions)
      if (sample.data?.notifications) {
        sample.data.notifications.forEach((n: any) => {
          csvNotifications.push(`"${ts}","${n.id || n.code || ""}","${n.severity || ""}","${n.heading || ""}","${n.body || ""}",${!!n.cleared}`);
        });
      }

      // Extract Source Health
      if (sample.data?.sourceHealth) {
        const sh = sample.data.sourceHealth;
        csvSourceHealth.push(`"${ts}","${sh.state || sh.status || ""}","${sh.source || ""}",${!!sh.liveSucceeded},${!!sh.stale},${!!sh.cacheUsed}`);
      }

      // Extract Balancing Rows
      if (sample.data?.balancing) {
        sample.data.balancing.forEach((b: any) => {
          csvBalancing.push(`"${ts}",${b.arrayNumber},${b.stringNumber},${b.bpcNumber},${b.balancingCellGroupIndex || b.targetCellGroup || ""},${b.targetVoltage || ""},"${b.state || ""}"`);
        });
      }
    });

    // ZIP them up using adm-zip so they are a single exportable zip file containing the CSV table!
    const zip = new AdmZip();
    zip.addFile("strings.csv", Buffer.from(csvStrings.join("\n"), "utf8"));
    zip.addFile("pcs.csv", Buffer.from(csvPcs.join("\n"), "utf8"));
    zip.addFile("sensors.csv", Buffer.from(csvSensors.join("\n"), "utf8"));
    zip.addFile("notifications.csv", Buffer.from(csvNotifications.join("\n"), "utf8"));
    zip.addFile("source_health.csv", Buffer.from(csvSourceHealth.join("\n"), "utf8"));
    zip.addFile("balancing.csv", Buffer.from(csvBalancing.join("\n"), "utf8"));

    const zipBuffer = zip.toBuffer();
    res.setHeader("Content-Disposition", `attachment; filename=diagnostic_session_${sessionId}_csv_package.zip`);
    res.setHeader("Content-Type", "application/zip");
    res.send(zipBuffer);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
