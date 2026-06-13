import express from "express";
import {
  getActiveProfile,
  getActiveValidationReport,
  getTelemetrySnapshot,
  getDiscoveryStatus,
  triggerRebuildModbusProfile,
  runProfileValidation,
  emulateModbusRead,
  saveProfileSnapshot,
  runLiveDiagnostics
} from "./modbusProfileManager";

const router = express.Router();

// GET /api/local/modbus/profiles
router.get("/profiles", (req, res) => {
  // Lists station profiles cached inside folder
  const fs = require("fs");
  const path = require("path");
  const cacheDir = path.join(process.cwd(), "data", "modbus-profiles");

  const results: any[] = [];
  if (fs.existsSync(cacheDir)) {
    const folders = fs.readdirSync(cacheDir);
    folders.forEach((f: string) => {
      const activePath = path.join(cacheDir, f, "active.profile.json");
      const reportPath = path.join(cacheDir, f, "validation_report.json");
      if (fs.existsSync(activePath)) {
        try {
          const profile = JSON.parse(fs.readFileSync(activePath, "utf8"));
          const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : null;
          results.push({
            id: profile.id,
            stationCode: profile.stationCode,
            blockCode: profile.blockCode,
            mapHash: profile.mapHash,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
            isStale: profile.isStale,
            validationStatus: report ? report.validationStatus : "Pending",
            confidenceScore: report ? report.confidenceScore : 0
          });
        } catch {}
      }
    });
  }

  // Fallback to active if nothing stored yet
  if (results.length === 0 && getActiveProfile()) {
    const active = getActiveProfile()!;
    const report = getActiveValidationReport();
    results.push({
      id: active.id,
      stationCode: active.stationCode,
      blockCode: active.blockCode,
      mapHash: active.mapHash,
      createdAt: active.createdAt,
      updatedAt: active.updatedAt,
      isStale: active.isStale,
      validationStatus: report ? report.validationStatus : "Pending",
      confidenceScore: report ? report.confidenceScore : 0
    });
  }

  res.json({ success: true, profiles: results });
});

// GET /api/local/modbus/profile/active
router.get("/profile/active", (req, res) => {
  const active = getActiveProfile();
  const report = getActiveValidationReport();
  res.json({
    success: true,
    activeProfile: active,
    validationReport: report
  });
});

// POST /api/local/modbus/profile/rebuild
router.post("/profile/rebuild", async (req, res) => {
  try {
    const profile = await triggerRebuildModbusProfile();
    const report = getActiveValidationReport();
    res.json({
      success: true,
      profile,
      report
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// POST /api/local/modbus/profile/revalidate
router.post("/profile/revalidate", async (req, res) => {
  const active = getActiveProfile();
  if (!active) {
    return res.status(400).json({ success: false, error: "No active profile to validate" });
  }
  try {
    const report = await runProfileValidation(active, emulateModbusRead);
    if (report.validationStatus === "Verified" || report.validationStatus === "Cautious") {
      active.isStale = false;
    }
    const fs = require("fs");
    const path = require("path");
    const mapCSV = fs.readFileSync(path.join(process.cwd(), "data", "modbus-profiles", `${active.stationCode}_B${active.blockCode}`, "source_modbus_map.csv"), "utf8");
    saveProfileSnapshot(active, mapCSV, report);
    res.json({
      success: true,
      report
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// GET /api/local/modbus/discovery/status
router.get("/discovery/status", (req, res) => {
  res.json(getDiscoveryStatus());
});

// GET /api/local/telemetry/snapshot
router.get("/snapshot", (req, res) => {
  res.json(getTelemetrySnapshot());
});

// GET /api/local/telemetry/site
router.get("/site", (req, res) => {
  res.json(getTelemetrySnapshot().site);
});

// GET /api/local/telemetry/arrays
router.get("/arrays", (req, res) => {
  res.json(getTelemetrySnapshot().arrays);
});

// GET /api/local/telemetry/pcses
router.get("/pcses", (req, res) => {
  res.json(getTelemetrySnapshot().pcses);
});

// GET /api/local/telemetry/strings
router.get("/strings", (req, res) => {
  res.json(getTelemetrySnapshot().strings);
});

// GET /api/local/telemetry/hvac
router.get("/hvac", (req, res) => {
  res.json(getTelemetrySnapshot().hvac);
});

// GET /api/local/telemetry/events
router.get("/events", (req, res) => {
  res.json(getTelemetrySnapshot().events);
});

// GET /api/local/modbus/diagnostics/live-check
router.get("/diagnostics/live-check", async (req, res) => {
  try {
    const results = await runLiveDiagnostics();
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

export default router;
