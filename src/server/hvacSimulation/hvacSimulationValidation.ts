import { 
  HvacSimulationMode, 
  HvacValidationStatus, 
  HvacValidationResult, 
  HvacValidationDefaults 
} from "./hvacSimulationTypes";

export const HVAC_VALIDATION_DEFAULTS: HvacValidationDefaults = {
  fanCurrentMinA: 1.5,
  fanCurrentExpectedA: 2.0,
  compressorCurrentMinA: 12.0,
  responseGracePeriodSec: 20,
  pollIntervalSec: 3,
  staleReportMaxAgeSec: 15
};

/**
 * Normalizes and parses raw HVAC status report from /feather/status/report.json.
 */
export function validateHvacReport(
  ip: string,
  rawReport: any,
  mode: HvacSimulationMode,
  startedAt?: string,
  customDefaults?: Partial<HvacValidationDefaults>
): HvacValidationResult {
  const cfg = { ...HVAC_VALIDATION_DEFAULTS, ...customDefaults };
  
  // Unify and consolidate cooling simulation controls as requested (lead cooling/both cooling do the same thing)
  if (mode === "ldcool" || mode === "bcool") {
    mode = "cooling";
  }
  
  const now = new Date();
  const startTime = startedAt ? new Date(startedAt) : null;
  const elapsedSec = startTime ? (now.getTime() - startTime.getTime()) / 1000 : 999;
  const inGracePeriod = elapsedSec < cfg.responseGracePeriodSec;

  // Initialize elements
  const res: HvacValidationResult = {
    ip,
    mode,
    status: "PASS",
    flags: [],
    message: "",
    reportTimestamp: null,
    simulationRemainingMinutes: null,
    hvac1: {
      currentA: null,
      fanLowOn: null,
      fanHighOn: null,
      compressorOn: null,
      reversingValveOn: null,
      electricHeatOn: null,
      freezeDetected: null,
      expected: false,
      passed: true,
      flags: []
    },
    hvac2: {
      currentA: null,
      fanLowOn: null,
      fanHighOn: null,
      compressorOn: null,
      reversingValveOn: null,
      electricHeatOn: null,
      freezeDetected: null,
      expected: false,
      passed: true,
      flags: []
    },
    metrics: {
      spaceTempC: null,
      supplyAirTempC: null,
      avgCellTempC: null,
      spaceHumidityPct: null,
      outsideHumidityPct: null,
      hydrogenPpm: null
    }
  };

  if (!rawReport || Object.keys(rawReport).length === 0) {
    res.status = "NOT_RESPONDING";
    res.flags.push("DEVICE_NOT_RESPONDING");
    res.message = "Feather controller not responding or returned empty payload.";
    return res;
  }

  // Parse Timestamp and remaining simulation minutes
  // SimulatedValueTimeoutTimestamp is often millisecond epoch from server/hardware, or ISO string.
  let simTs: number | null = null;
  let repTs: number | null = null;

  if (rawReport.simulatedValueTimeoutTimestamp) {
    const parsedSim = Number(rawReport.simulatedValueTimeoutTimestamp);
    simTs = isNaN(parsedSim) ? new Date(rawReport.simulatedValueTimeoutTimestamp).getTime() : parsedSim;
  }
  const statsTs = rawReport.fromFeatherControllerStatistcsReport?.timeStamp ?? rawReport.fromFeatherControllerStatistcsReport?.timestamp;
  if (statsTs) {
    const parsedRep = Number(statsTs);
    repTs = isNaN(parsedRep) ? new Date(statsTs).getTime() : parsedRep;
    res.reportTimestamp = new Date(repTs).toISOString();
  } else {
    res.reportTimestamp = new Date().toISOString();
    repTs = Date.now();
  }

  if (simTs && repTs) {
    const diffMs = simTs - repTs;
    const remMin = Math.round(diffMs / 60000);
    res.simulationRemainingMinutes = remMin > 0 ? remMin : 0;
  } else if (rawReport.simulationRemainingMinutes !== undefined) {
    res.simulationRemainingMinutes = Number(rawReport.simulationRemainingMinutes) || 0;
  } else if (rawReport.simTimeRemaining !== undefined) {
    res.simulationRemainingMinutes = Number(rawReport.simTimeRemaining) || 0;
  } else {
    res.simulationRemainingMinutes = 0;
  }

  // Check stale report
  const reportAgeSec = (Date.now() - (repTs || Date.now())) / 1000;
  if (reportAgeSec > cfg.staleReportMaxAgeSec) {
    res.flags.push("STALE_REPORT");
  }

  // Verify simulation status
  const isSimulationActive = (res.simulationRemainingMinutes ?? 0) > 0;
  if (mode !== "clearAll" && !isSimulationActive) {
    res.flags.push("SIMULATION_EXPIRED");
  }

  // Set metrics
  const td = rawReport.thermalData || {};
  res.metrics.spaceTempC = td.spaceTemperature ?? td.spaceTemp ?? null;
  res.metrics.supplyAirTempC = td.supplyAirTemp ?? td.supplyAirTemperature ?? null;
  res.metrics.avgCellTempC = td.avgCellTemperature ?? td.avgCellTemp ?? null;
  res.metrics.spaceHumidityPct = td.spaceHumidity ?? td.spaceHumidityPct ?? null;
  res.metrics.outsideHumidityPct = td.outsideHumidity ?? td.outsideHumidityPct ?? null;
  res.metrics.hydrogenPpm = td.hydrogen1PPM ?? td.hydrogenPPM ?? null;

  // Extract HVAC1
  const h1d = td.HVAC1Data || {};
  const h1c = td.HVAC1Controls || {};
  res.hvac1.currentA = h1d.hvacCurrent ?? null;
  res.hvac1.fanLowOn = h1c.fanLowOn ?? null;
  res.hvac1.fanHighOn = h1c.fanHighOn ?? null;
  res.hvac1.compressorOn = h1c.YCompressorOn ?? h1c.compressorOn ?? null;
  res.hvac1.reversingValveOn = h1c.ReversingValveOn ?? h1c.reversingValveOn ?? null;
  res.hvac1.electricHeatOn = h1c.ElectricHeatOn ?? h1c.electricHeatOn ?? null;
  res.hvac1.freezeDetected = h1d.FreezeDetected ?? h1d.freezeDetected ?? null;

  // Extract HVAC2
  const h2d = td.HVAC2Data || {};
  const h2c = td.HVAC2Controls || {};
  res.hvac2.currentA = h2d.hvacCurrent ?? null;
  res.hvac2.fanLowOn = h2c.fanLowOn ?? null;
  res.hvac2.fanHighOn = h2c.fanHighOn ?? null;
  res.hvac2.compressorOn = h2c.YCompressorOn ?? h2c.compressorOn ?? null;
  res.hvac2.reversingValveOn = h2c.ReversingValveOn ?? h2c.reversingValveOn ?? null;
  res.hvac2.electricHeatOn = h2c.ElectricHeatOn ?? h2c.electricHeatOn ?? null;
  res.hvac2.freezeDetected = h2d.FreezeDetected ?? h2d.freezeDetected ?? null;

  // HVAC current threshold checks
  const checkCurrentAndFan = (hvac: typeof res.hvac1, hvacName: string) => {
    if (hvac.currentA !== null) {
      const fanActive = !!(hvac.fanLowOn || hvac.fanHighOn);
      const compActive = !!hvac.compressorOn;
      const heatActive = !!(hvac.electricHeatOn || hvac.reversingValveOn);

      if ((fanActive || compActive || heatActive) && hvac.currentA < cfg.fanCurrentMinA) {
        if (!inGracePeriod) {
          hvac.flags.push("FAN_CURRENT_LOW");
          hvac.passed = false;
        }
      }
      if (compActive && hvac.currentA < cfg.compressorCurrentMinA) {
        if (!inGracePeriod) {
          hvac.flags.push("COMPRESSOR_CURRENT_LOW");
          hvac.passed = false;
        }
      }
    }
  };

  // Run dynamic evaluations based on mode
  switch (mode) {
    case "cooling": {
      // Determine actual stage from active report's thermostatStage feedback
      const currentStage = td.thermostatStage || "Idle";

      if (currentStage === "CoolStage2") {
        // Both HVACs called
        res.hvac1.expected = true;
        res.hvac2.expected = true;

        const h1Comp = !!res.hvac1.compressorOn;
        const h2Comp = !!res.hvac2.compressorOn;

        if (!h1Comp && !h2Comp) {
          if (!inGracePeriod) {
            res.flags.push("HVAC1_COMPRESSOR_NOT_CALLED");
            res.flags.push("HVAC2_COMPRESSOR_NOT_CALLED");
            res.hvac1.passed = false;
            res.hvac2.passed = false;
          }
        } else if (!h1Comp || !h2Comp) {
          res.flags.push("BOTH_COOL_PARTIAL_RESPONSE");
          if (!h1Comp) {
            res.hvac1.passed = false;
            res.flags.push("HVAC1_COMPRESSOR_NOT_CALLED");
          }
          if (!h2Comp) {
            res.hvac2.passed = false;
            res.flags.push("HVAC2_COMPRESSOR_NOT_CALLED");
          }
        }

        if (!res.hvac1.fanHighOn && !inGracePeriod) {
          res.flags.push("HVAC1_FAN_HIGH_NOT_CALLED");
          res.hvac1.passed = false;
        }
        if (!res.hvac2.fanHighOn && !inGracePeriod) {
          res.flags.push("HVAC2_FAN_HIGH_NOT_CALLED");
          res.hvac2.passed = false;
        }
      } else if (currentStage === "CoolStage1") {
        // Lead cooling called
        res.hvac1.expected = true;
        res.hvac2.expected = false;

        const h1Active = !!res.hvac1.compressorOn;
        const h2Active = !!res.hvac2.compressorOn;

        if (!h1Active && !h2Active) {
          if (!inGracePeriod) {
            res.flags.push("COMPRESSOR_NOT_CALLED");
            res.flags.push("FAN_HIGH_NOT_CALLED");
            res.hvac1.passed = false;
          }
        } else if (h1Active && h2Active) {
          res.flags.push("LEAD_COOL_EXTRA_HVAC_ACTIVE");
          res.hvac2.passed = false;
        } else {
          const activeHvac = h1Active ? res.hvac1 : res.hvac2;
          activeHvac.expected = true;
          if (!activeHvac.fanHighOn && !inGracePeriod) {
            res.flags.push("FAN_HIGH_NOT_CALLED");
            activeHvac.passed = false;
          }
        }
      } else {
        // Not active or Idle
        if (!inGracePeriod) {
          res.flags.push("COMPRESSOR_NOT_CALLED");
          res.hvac1.passed = false;
          res.hvac2.passed = false;
        }
      }

      checkCurrentAndFan(res.hvac1, "HVAC1");
      checkCurrentAndFan(res.hvac2, "HVAC2");
      break;
    }

    case "heating": {
      res.hvac1.expected = true; // Typically HVAC1 handles first heating stage
      
      const heat1 = !!(res.hvac1.electricHeatOn || res.hvac1.reversingValveOn);
      const heat2 = !!(res.hvac2.electricHeatOn || res.hvac2.reversingValveOn);

      if (!heat1 && !heat2 && !inGracePeriod) {
        res.flags.push("HEATING_CURRENT_LOW");
        res.hvac1.passed = false;
      }

      checkCurrentAndFan(res.hvac1, "HVAC1");
      checkCurrentAndFan(res.hvac2, "HVAC2");
      break;
    }

    case "dehumidification": {
      const h1Active = !!(res.hvac1.fanLowOn || res.hvac1.fanHighOn || res.hvac1.compressorOn);
      const h2Active = !!(res.hvac2.fanLowOn || res.hvac2.fanHighOn || res.hvac2.compressorOn);

      if (!h1Active && !h2Active && !inGracePeriod) {
        res.flags.push("DEHUMIDIFICATION_NO_RESPONSE");
        res.hvac1.passed = false;
      }

      checkCurrentAndFan(res.hvac1, "HVAC1");
      checkCurrentAndFan(res.hvac2, "HVAC2");
      break;
    }

    case "lowerTopCap": {
      const doors = rawReport.doors || {};
      const statusValue = doors.lowerTopcapClosed;
      
      if (statusValue === undefined) {
        res.flags.push("VERIFY_UNAVAILABLE");
      } else {
        // Handled dynamically by caller/comparer in options. Toggle state is verified in simulation commands.
        // We can check if isSimulationActive, then see doors matches commanded state.
        // If not matching, SIM_VALUE_MISMATCH is flagged
      }
      break;
    }

    case "leakAlarm": {
      const fss = rawReport.fssSignals || {};
      const statusValue = fss.leakAlarm;
      if (statusValue === undefined) {
        res.flags.push("VERIFY_UNAVAILABLE");
      }
      break;
    }

    case "acDoor": {
      const doors = rawReport.doors || {};
      const statusValue = doors.acDoorsClosed;
      if (statusValue === undefined) {
        res.flags.push("VERIFY_UNAVAILABLE");
      }
      break;
    }

    case "emergencyVentilation": {
      // Emergency ventilation simulated value or fss signal validation
      const fss = rawReport.fssSignals || {};
      const emgActive = rawReport.emergencyVentilation ?? fss.emergencyVentilation ?? false;
      const fan1On = !!(res.hvac1.fanLowOn || res.hvac1.fanHighOn);
      const fan2On = !!(res.hvac2.fanLowOn || res.hvac2.fanHighOn);

      if (!fan1On && !fan2On && !inGracePeriod) {
        res.flags.push("EMERGENCY_VENTILATION_NO_RESPONSE");
        res.hvac1.passed = false;
      }
      break;
    }

    case "clearAll":
    default:
      // Clear all simulations, no specific HVAC responses are actively simulated.
      break;
  }

  // Compile final status
  // 1. Check offline conditions
  if (res.status === "NOT_RESPONDING") {
    return res;
  }

  // 2. Aggregate sub-component flags
  const allCompFlags = [...h1d.flags || [], ...h2d.flags || [], ...h1c.flags || [], ...h2c.flags || []];
  const allSubPassed = res.hvac1.passed && res.hvac2.passed;

  // Let's copy sub flags to the top-level flags list to show them in the general technician list!
  res.flags = Array.from(new Set([...res.flags, ...res.hvac1.flags, ...res.hvac2.flags, ...allCompFlags]));

  // 3. Status determination
  if (res.flags.includes("STALE_REPORT")) {
    res.status = "STALE";
    res.message = "Feather controller report is stale, exceeding report age threshold.";
  } else if (res.flags.includes("SIMULATION_EXPIRED")) {
    res.status = "SIMULATION_EXPIRED";
    res.message = "The simulation command window has expired for this unit.";
  } else if (!allSubPassed || res.flags.includes("COMPRESSOR_NOT_CALLED") || res.flags.includes("FAN_HIGH_NOT_CALLED") || res.flags.includes("HVAC1_COMPRESSOR_NOT_CALLED") || res.flags.includes("HVAC2_COMPRESSOR_NOT_CALLED") || res.flags.includes("EMERGENCY_VENTILATION_NO_RESPONSE") || res.flags.includes("HEATING_CURRENT_LOW") || res.flags.includes("DEHUMIDIFICATION_NO_RESPONSE")) {
    res.status = "FAIL";
    res.message = "Target device did not react according to expected HVAC response.";
  } else if (res.flags.includes("LEAD_COOL_EXTRA_HVAC_ACTIVE") || res.flags.includes("COMPRESSOR_CURRENT_LOW") || res.flags.includes("FAN_CURRENT_LOW") || res.flags.includes("BOTH_COOL_PARTIAL_RESPONSE") || res.flags.includes("SIM_VALUE_MISMATCH")) {
    res.status = "WARNING";
    res.message = "Target device reacted with warning flags (current low or extra feedback active).";
  } else {
    res.status = "PASS";
    res.message = "Simulation response verified successfully.";
  }

  return res;
}
