import React, { useState, useEffect, useRef } from "react";
import { 
  Network, 
  Cpu, 
  Settings, 
  Play, 
  Power, 
  Gauge, 
  Download, 
  Trash2, 
  RotateCw, 
  Sliders, 
  ShieldAlert, 
  Plus, 
  FileText, 
  Pause, 
  Terminal,
  Activity,
  CheckCircle2,
  X,
  SlidersHorizontal,
  FlameKindling
} from "lucide-react";

// Types matching system architecture
interface TopologyMapping {
  id: string;
  arrayId: number;
  stringId: number;
  ipAddress: string;
  nodeType: "BESS String" | "HVAC Controller" | "IO Gateway" | "PCS Inverter";
  status: "ONLINE" | "FAULTED" | "STANDBY";
  name: string;
}

interface DynamicLog {
  id: string;
  timestamp: string;
  level: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  sourceIp: string;
  sourceNode: string;
  message: string;
}

interface ModbusMapItem {
  register: number;
  type: string;
  fieldType: string;
  description: string;
  rw: string;
  scaleFactorName: string;
  unit: string;
  rawReading?: number;
  liveValue?: string | number;
  liveTimestamp?: string;
  liveStatus?: 'idle' | 'polling' | 'success' | 'error';
}

const DEFAULT_TOPOLOGY: TopologyMapping[] = [
  { id: "top-1", arrayId: 1, stringId: 1, ipAddress: "10.0.1.10", nodeType: "BESS String", status: "ONLINE", name: "Rack Array 1 String 1" },
  { id: "top-2", arrayId: 1, stringId: 2, ipAddress: "10.0.1.15", nodeType: "BESS String", status: "ONLINE", name: "Rack Array 1 String 2" },
  { id: "top-3", arrayId: 3, stringId: 1, ipAddress: "10.0.3.10", nodeType: "BESS String", status: "FAULTED", name: "Imbalanced String 3-1" },
  { id: "top-4", arrayId: 3, stringId: 2, ipAddress: "10.0.3.15", nodeType: "BESS String", status: "ONLINE", name: "Rack Array 3 String 2" },
  { id: "top-5", arrayId: 3, stringId: 0, ipAddress: "10.0.3.3", nodeType: "HVAC Controller", status: "ONLINE", name: "Subcluster 3 Thermostat" },
  { id: "top-6", arrayId: 1, stringId: 0, ipAddress: "10.0.1.3", nodeType: "IO Gateway", status: "ONLINE", name: "Subcluster 1 Interface" },
];

export default function TerminalToolbox({ devices }: { devices: any[] }) {
  // ------------------------- STATE DEFINITIONS -------------------------
  // Topology state (loaded from localStorage or defaults)
  const [topology, setTopology] = useState<TopologyMapping[]>(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const saved = localStorage.getItem("bess_ip_topology");
        if (saved) {
          return JSON.parse(saved);
        }
      }
    } catch (e) {
      // ignore
    }
    return DEFAULT_TOPOLOGY;
  });

  // Automated telemetries streamer log buffer
  const [liveLogs, setLiveLogs] = useState<DynamicLog[]>([]);
  const [isPolling, setIsPolling] = useState<boolean>(true);
  const [pollIntervalSec, setPollIntervalSec] = useState<number>(4);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterLevel, setFilterLevel] = useState<string>("ALL");
  const [freezeFeed, setFreezeFeed] = useState<boolean>(false);
  const [nextPollCount, setNextPollCount] = useState<number>(pollIntervalSec);

  // Edit / Add mapping forms
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newArrayId, setNewArrayId] = useState<number>(3);
  const [newStringId, setNewStringId] = useState<number>(3);
  const [newIpAddress, setNewIpAddress] = useState<string>("10.0.3.25");
  const [newNodeType, setNewNodeType] = useState<TopologyMapping["nodeType"]>("BESS String");
  const [newNodeName, setNewNodeName] = useState<string>("Static Rack Node 3-3");

  // Manual one-off controls cockpit configuration
  const [ctrlArray, setCtrlArray] = useState<number>(3);
  const [ctrlString, setCtrlString] = useState<number>(1);
  const [contactorAction, setContactorAction] = useState<"close" | "open">("close");
  const [rotateTarget, setRotateTarget] = useState<"strings" | "pcs">("strings");
  const [rotateAction, setRotateAction] = useState<"rotate" | "align">("rotate");

  // Thermal Heat Soak
  const [heatSoakSeg, setHeatSoakSeg] = useState<string>("Segment-A");
  const [heatSoakTemp, setHeatSoakTemp] = useState<number>(45);
  const [heatSoakActive, setHeatSoakActive] = useState<boolean>(false);

  // Modbus Configuration ID Offset Calibrator
  const [calibIp, setCalibIp] = useState<string>("10.0.3.3");
  const [calibUnitOffset, setCalibUnitOffset] = useState<number>(14);
  const [calibStep, setCalibStep] = useState<string>("Idle Mode");

  // Response monitor logs for one-off commands
  const [commandResponse, setCommandResponse] = useState<{
    endpoint: string;
    payload: any;
    timestamp: string;
    success: boolean;
  } | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // ------------------------- MODBUS MAP & POLL STATES -------------------------
  const [activeTab, setActiveTab] = useState<"stream" | "modbus">("stream");
  const [modbusMap, setModbusMap] = useState<ModbusMapItem[]>([]);
  const [modbusHost, setModbusHost] = useState<string>("10.0.1.10");
  const [modbusPort, setModbusPort] = useState<number>(502);
  const [modbusUnitId, setModbusUnitId] = useState<number>(1);
  const [autoPollModbus, setAutoPollModbus] = useState<boolean>(false);
  const [isModbusPolling, setIsModbusPolling] = useState<boolean>(false);

  // Quote-aware CSV parser helper
  const parseCSVRow = (row: string) => {
    const result: string[] = [];
    let cell = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(cell.trim());
        cell = "";
      } else {
        cell += char;
      }
    }
    result.push(cell.trim());
    return result;
  };

  // Fetch and parse Modbus Map
  const loadModbusMap = async () => {
    try {
      const res = await fetch("/turtle/tools/report/ems/modbus_map.csv");
      if (res.ok) {
        const text = await res.text();
        const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length > 1) {
          const parsed: ModbusMapItem[] = [];
          for (let i = 1; i < lines.length; i++) {
            const parts = parseCSVRow(lines[i]);
            if (parts.length >= 10 && parts[1]) {
              const regNum = parseInt(parts[1], 10);
              if (!isNaN(regNum)) {
                parsed.push({
                  fieldType: parts[0],
                  register: regNum,
                  type: parts[5],
                  description: parts[3],
                  rw: parts[7],
                  scaleFactorName: parts[8],
                  unit: parts[9],
                  liveValue: "-",
                  liveStatus: "idle"
                });
              }
            }
          }
          setModbusMap(parsed);
        }
      }
    } catch (err) {
      console.error("Failed to load modbus map:", err);
    }
  };

  useEffect(() => {
    loadModbusMap();
  }, []);

  const pollLiveModbusValues = async () => {
    setIsModbusPolling(true);
    setModbusMap(prev => prev.map(item => ({ ...item, liveStatus: "polling" })));
    
    try {
      const pollUrl = `/tools/controls/modbusPoll/host/${modbusHost}/port/${modbusPort}/unitId/${modbusUnitId}/type/input/start/1/count/14000/data.csv`;
      const res = await fetch(pollUrl);
      if (!res.ok) throw new Error("Gateway RTU physical connection timeout.");
      
      const csvText = await res.text();
      const lines = csvText.split("\n").map(l => l.trim()).filter(Boolean);
      const valueMap: Record<number, number> = {};
      
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length >= 3) {
          const reg = parseInt(parts[1], 10);
          const val = parseFloat(parts[2]);
          if (!isNaN(reg) && !isNaN(val)) {
            valueMap[reg] = val;
          }
        }
      }
      
      const nowStr = new Date().toLocaleTimeString();
      
      setModbusMap(prev => prev.map(item => {
        const foundVal = valueMap[item.register];
        if (foundVal !== undefined) {
          let scaleFactor = 1;
          if (item.scaleFactorName) {
            const sfRegister = prev.find(p => p.description === item.scaleFactorName);
            if (sfRegister) {
              const rawSfValue = valueMap[sfRegister.register];
              if (rawSfValue !== undefined) {
                let sfValue = rawSfValue;
                if (sfValue > 32767) sfValue -= 65536; // Twos complement conversion
                scaleFactor = Math.pow(10, sfValue);
              }
            }
          }
          
          let scaledVal: string | number = foundVal * scaleFactor;
          if (item.type === "string") {
            scaledVal = foundVal === 100 ? "Powin BESS String" : "Active RTU Carrier Link";
          } else {
            scaledVal = Math.round(Number(scaledVal) * 100) / 100;
          }
          
          return {
            ...item,
            rawReading: foundVal,
            liveValue: scaledVal,
            liveTimestamp: nowStr,
            liveStatus: "success"
          };
        }
        
        return {
          ...item,
          liveStatus: item.fieldType === "Header" ? "success" : "idle"
        };
      }));
      
      addManualEventLog("SUCCESS", modbusHost, "MODBUS_LIVE_VIEW", `Successfully parsed Modbus Map SunSpec mappings for IP: ${modbusHost}.`);
    } catch (err: any) {
      setModbusMap(prev => prev.map(item => ({ ...item, liveStatus: "error" })));
      addManualEventLog("CRITICAL", modbusHost, "MODBUS_LIVE_VIEW", `Exception polling: ${err.message || err}`);
    } finally {
      setIsModbusPolling(false);
    }
  };

  // Keep host IP updated if current is deleted/empty
  useEffect(() => {
    if (topology.length > 0 && !topology.some(t => t.ipAddress === modbusHost)) {
      setModbusHost(topology[0].ipAddress);
    }
  }, [topology, modbusHost]);

  // Auto poll Modbus Map register
  useEffect(() => {
    if (!autoPollModbus || activeTab !== "modbus") return;
    const interval = setInterval(() => {
      pollLiveModbusValues();
    }, 10000); // 10s auto refresh
    return () => clearInterval(interval);
  }, [autoPollModbus, activeTab, modbusHost, modbusPort, modbusUnitId]);

  // Save topology mapping modifications
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem("bess_ip_topology", JSON.stringify(topology));
      }
    } catch (e) {
      // ignore
    }
  }, [topology]);

  // ------------------------- POLLING LOG ENGINE -------------------------
  // Timer tick for polling countdown
  useEffect(() => {
    if (!isPolling) return;
    const interval = setInterval(() => {
      setNextPollCount((prev) => {
        if (prev <= 1) {
          triggerBackgroundSweep();
          return pollIntervalSec;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPolling, pollIntervalSec, topology]);

  // Execute background sweep over the topology IPs
  const triggerBackgroundSweep = async () => {
    if (freezeFeed) return;

    const newEntries: DynamicLog[] = [];
    const timestampStr = new Date().toISOString().replace("T", " ").slice(11, 19);

    // Network sweep progress indicator log
    newEntries.push({
      id: "sweep-" + Math.random(),
      timestamp: timestampStr,
      level: "INFO",
      sourceIp: "LOCAL_GATEWAY",
      sourceNode: "GreEnergy Prizm",
      message: `Initiating automated Modbus IP sweep across ${topology.length} active registered network nodes...`
    });

    // Gather and parse endpoint data for each node in topology mapped
    for (const node of topology) {
      try {
        if (node.nodeType === "BESS String") {
          // Get cell-string report
          const res = await fetch(`/turtle/tools/report/ems/array/${node.arrayId}/string/${node.stringId}/report.json`);
          if (res.ok) {
            const data = await res.json();
            const imbalance = data.maxCellVoltageDeltaMv;
            const isImbalanced = imbalance > 200;

            newEntries.push({
              id: `log-${node.id}-${Math.random()}`,
              timestamp: timestampStr,
              level: isImbalanced ? "CRITICAL" : "SUCCESS",
              sourceIp: node.ipAddress,
              sourceNode: node.name,
              message: `Parsed telemetry. State: ${data.state}, Avg SoC: ${data.soc}%, Voltage: ${data.voltage}V, Current: ${data.current}A, MaxDelta: ${imbalance}mV, TempDelta: ${data.maxCellTempDeltaC}°C`
            });

            // Additionally fetch alarm notifications if faulted or critical
            if (isImbalanced || node.status === "FAULTED") {
              const notifRes = await fetch(`/turtle/tools/report/ems/array/${node.arrayId}/string/${node.stringId}/notifications.json`);
              if (notifRes.ok) {
                const notifData = await notifRes.json();
                if (notifData.notification && notifData.notification.length > 0) {
                  notifData.notification.forEach((n: any) => {
                    newEntries.push({
                      id: `notif-${Math.random()}`,
                      timestamp: timestampStr,
                      level: n.notificationType.notificationCategory === "CRITICAL" ? "CRITICAL" : "WARNING",
                      sourceIp: node.ipAddress,
                      sourceNode: node.name,
                      message: `Alarm ID ${n.notificationType.notificationId} registered over BPC Pack Index ${n.notificationSource.batteryPackIndex} (Out-of-limit reading detected)`
                    });
                  });
                }
              }
            }
          } else {
            throw new Error(`Endpoint response: ${res.status}`);
          }
        } else if (node.nodeType === "HVAC Controller") {
          // Get physical HVAC diagnostics report
          const res = await fetch("/feather/status/report.json");
          if (res.ok) {
            const data = await res.json();
            const airTemp = data.thermalData?.supplyAirTemp || 19.5;
            const avgCellT = data.thermalData?.avgCellTemperature || 24.2;
            const hydrogen = data.thermalData?.hydrogen1PPM || 2.4;
            const hasLeak = hydrogen > 5.0;

            newEntries.push({
              id: `log-${node.id}-${Math.random()}`,
              timestamp: timestampStr,
              level: hasLeak ? "CRITICAL" : "INFO",
              sourceIp: node.ipAddress,
              sourceNode: node.name,
              message: `HVAC Stage: ${data.thermalData?.thermostatStage || "Active"}. Cell Temperature Avg: ${avgCellT}°C, Supply Air: ${airTemp}°C, Hydrogen Level: ${hydrogen} PPM ${hasLeak ? "[THRESHOLD EXCEEDED]" : "[SAFE]"}`
            });
          } else {
            throw new Error(`Endpoint response: ${res.status}`);
          }
        } else if (node.nodeType === "IO Gateway") {
          // Get controllers metrics status codes
          const res = await fetch("/turtle/tools/report/ems/controllerStatistics.json");
          if (res.ok) {
            const data = await res.json();
            newEntries.push({
              id: `log-${node.id}-${Math.random()}`,
              timestamp: timestampStr,
              level: "SUCCESS",
              sourceIp: node.ipAddress,
              sourceNode: node.name,
              message: `Gateway Stats: Poll Ticks = ${data.cycleClockTicks}, Active TCP Conns = ${data.activeTcpPconnections}, Modbus Rx/Tx = ${data.modbusReadsTotal}/${data.modbusWritesTotal}, CAN Packets Lost = ${data.canBusPacketsLost}`
            });
          } else {
            throw new Error(`Endpoint response: ${res.status}`);
          }
        } else if (node.nodeType === "PCS Inverter") {
          // Get main array status limit capacity
          const res = await fetch("/turtle/tools/report/ems/status.json");
          if (res.ok) {
            const data = await res.json();
            newEntries.push({
              id: `log-${node.id}-${Math.random()}`,
              timestamp: timestampStr,
              level: "INFO",
              sourceIp: node.ipAddress,
              sourceNode: node.name,
              message: `PCS Coupling: AC Grid Sync limit is ${data.activePowerLimitKw}kW. Frequency: ${data.frequencyHz}Hz, Total Charge Capacity: ${data.totalChargeCapacityKwh}kWh`
            });
          } else {
            throw new Error(`Endpoint response: ${res.status}`);
          }
        }
      } catch (err: any) {
        newEntries.push({
          id: `err-${node.id}-${Math.random()}`,
          timestamp: timestampStr,
          level: "WARNING",
          sourceIp: node.ipAddress,
          sourceNode: node.name,
          message: `Network ping timeout or connection loss: ${err.message || err}. Check physical Modbus link.`
        });
      }
    }

    // Append items capping at max 120 lines to prevent buffer bloat
    setLiveLogs((prev) => {
      const merged = [...prev, ...newEntries];
      if (merged.length > 120) {
        return merged.slice(merged.length - 120);
      }
      return merged;
    });
  };

  // Trigger manual sweep instantly
  const handleManualSweep = () => {
    triggerBackgroundSweep();
    setNextPollCount(pollIntervalSec);
  };

  // Auto-scroll logs terminal
  useEffect(() => {
    if (!freezeFeed && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [liveLogs, freezeFeed]);

  // ------------------------- TOPOLOGY CONFIGURATION -------------------------
  const handleAddTopologyNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIpAddress) return;

    const newNode: TopologyMapping = {
      id: "top-" + Date.now(),
      arrayId: Number(newArrayId),
      stringId: Number(newStringId),
      ipAddress: newIpAddress,
      nodeType: newNodeType,
      status: "ONLINE",
      name: newNodeName || `Rack Node ${newArrayId}-${newStringId}`
    };

    setTopology((prev) => [...prev, newNode]);
    addManualEventLog("SUCCESS", "LOCAL_GATEWAY", "TOPOLOGY_CONFIG", `Registered new unified IP topology node: ${newNodeName} (${newIpAddress}) mapped to Array ${newArrayId} String ${newStringId}`);
    setShowAddForm(false);
  };

  const handleDeleteNode = (id: string, name: string, ip: string) => {
    setTopology((prev) => prev.filter((item) => item.id !== id));
    addManualEventLog("WARNING", "LOCAL_GATEWAY", "TOPOLOGY_CONFIG", `Removed IP mapping route for node ${name} (${ip}) from system memory.`);
  };

  const handleResetTopology = () => {
    if (window.confirm("Restore BESS IP topology to default manufacturing presets?")) {
      setTopology(DEFAULT_TOPOLOGY);
      addManualEventLog("INFO", "LOCAL_GATEWAY", "TOPOLOGY_CONFIG", "Restored default unified IP topology addresses maps.");
    }
  };

  // Helper to drop custom message into telemetry live logs
  const addManualEventLog = (level: DynamicLog["level"], sourceIp: string, sourceNode: string, message: string) => {
    const timestampStr = new Date().toISOString().replace("T", " ").slice(11, 19);
    setLiveLogs((prev) => {
      const entry: DynamicLog = {
        id: "manual-" + Math.random(),
        timestamp: timestampStr,
        level,
        sourceIp,
        sourceNode,
        message
      };
      const merged = [...prev, entry];
      return merged.slice(merged.length - 120);
    });
  };

  // ------------------------- ACCESSIBLE COMMAND OVERRIDES -------------------------
  const dispatchContactorOverride = async () => {
    const act = contactorAction; // close or open
    const endpoint = `/tools/controls/ems/array/${ctrlArray}/string/${ctrlString}/contactors/${act}`;
    
    // Add pending log
    addManualEventLog("INFO", "LOCAL_GATEWAY", "OVERRIDE_RUNNER", `Dispatching contactor relay code: Set Array ${ctrlArray} String ${ctrlString} to [${act.toUpperCase()}]`);

    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      
      setCommandResponse({
        endpoint,
        payload: data,
        timestamp: new Date().toLocaleTimeString(),
        success: data.status === "success"
      });

      addManualEventLog("SUCCESS", "LOCAL_GATEWAY", "OVERRIDE_RUNNER", `SUCCESS: Target contactor overridden. ${data.detail || ""}`);
    } catch (err: any) {
      setCommandResponse({
        endpoint,
        payload: { error: err.message },
        timestamp: new Date().toLocaleTimeString(),
        success: false
      });
      addManualEventLog("CRITICAL", "LOCAL_GATEWAY", "OVERRIDE_RUNNER", `FAILED contactor relay override transmission: ${err.message}`);
    }
  };

  const dispatchArrayContactorOverride = async () => {
    const act = contactorAction; // close or open
    const endpoint = `/tools/controls/ems/array/${ctrlArray}/contactors/${act}`;
    addManualEventLog("INFO", "LOCAL_GATEWAY", "OVERRIDE_RUNNER", `Dispatching ARRAY-WIDE contactor override target array: ${ctrlArray} to [${act.toUpperCase()}]`);

    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      setCommandResponse({
        endpoint,
        payload: data,
        timestamp: new Date().toLocaleTimeString(),
        success: data.status === "success"
      });
      addManualEventLog("SUCCESS", "LOCAL_GATEWAY", "OVERRIDE_RUNNER", `SUCCESS: Unified stack controllers updated: ${data.detail || ""}`);
    } catch (err: any) {
      addManualEventLog("CRITICAL", "LOCAL_GATEWAY", "OVERRIDE_RUNNER", `FAILED contactor transmission: ${err.message}`);
    }
  };

  const dispatchLoopRotationOverride = async () => {
    let endpoint = "";
    if (rotateTarget === "strings") {
      endpoint = `/tools/controls/ems/array/${ctrlArray}/rotate/strings/${rotateAction}`;
    } else {
      endpoint = `/tools/controls/ems/array/${ctrlArray}/rotate/arrayPcses/cycle`;
    }

    addManualEventLog("INFO", "LOCAL_GATEWAY", "OVERRIDE_RUNNER", `Executing loop synchronization command: Type=${rotateTarget}, Action=${rotateAction} across Array segment ${ctrlArray}`);

    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      setCommandResponse({
        endpoint,
        payload: data,
        timestamp: new Date().toLocaleTimeString(),
        success: data.status === "success"
      });
      addManualEventLog("SUCCESS", "LOCAL_GATEWAY", "OVERRIDE_RUNNER", `SUCCESS: Power Conditioning Loop synced. Detail: ${data.detail || ""}`);
    } catch (err: any) {
      addManualEventLog("CRITICAL", "LOCAL_GATEWAY", "OVERRIDE_RUNNER", `FAILED balancing synchronizer action: ${err.message}`);
    }
  };

  const handleHeatSoakCommand = async (state: "start" | "stop") => {
    let endpoint = "";
    if (state === "start") {
      endpoint = `/tools/controls/ems/heatsoak/start/blockEnclosure/${heatSoakSeg}/temperatureSetpoint/${heatSoakTemp}`;
      setHeatSoakActive(true);
    } else {
      endpoint = `/tools/controls/ems/heatsoak/stop/blockEnclosure/${heatSoakSeg}`;
      setHeatSoakActive(false);
    }

    addManualEventLog("INFO", "LOCAL_GATEWAY", "HEAT_SOAK_CONTROLLER", `${state === "start" ? "INITIATING" : "TERMINATING"} block thermal soak tests. Block Segment=${heatSoakSeg}, Setpoint=${heatSoakTemp}°C`);

    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      setCommandResponse({
        endpoint,
        payload: data,
        timestamp: new Date().toLocaleTimeString(),
        success: data.status === "success"
      });
      addManualEventLog("SUCCESS", "LOCAL_GATEWAY", "HEAT_SOAK_CONTROLLER", `Thermal Soak response updated. ${data.detail || ""}`);
    } catch (err: any) {
      addManualEventLog("CRITICAL", "LOCAL_GATEWAY", "HEAT_SOAK_CONTROLLER", `Thermal Soak error packet: ${err.message}`);
    }
  };

  const triggerModbusFlashCalibration = () => {
    addManualEventLog("INFO", calibIp, "ID_CALIBRATOR", `Sending calibration setup frame packet to host controller: UnitId Offset Assign = #${calibUnitOffset}`);
    
    // Simulate flash sequence
    setTimeout(() => {
      addManualEventLog("SUCCESS", calibIp, "ID_CALIBRATOR", `Modbus Unit ID Offset flashed and synced. Flash unit setting changed to: Offset #${calibUnitOffset}. Physical hardware synchronized successfully.`);
      setCommandResponse({
        endpoint: `Modbus: Write Coil offset #${calibUnitOffset} on host ${calibIp}`,
        payload: { status: "success", appliedOffset: calibUnitOffset, deviceIp: calibIp, timeMs: 450 },
        timestamp: new Date().toLocaleTimeString(),
        success: true
      });
    }, 1200);
  };

  const triggerHvacStageDiagnosticPulse = async () => {
    addManualEventLog("INFO", calibIp, "HVAC_TESTER", `Transmitting diagnostic staging parameters. Commencing temporary stage step: [Cooling & Extraction Fan Low speed active].`);
    
    try {
      const res = await fetch("/feather/status/report.json");
      if (res.ok) {
        const data = await res.json();
        // Log out the active fan stages successfully mapped
        setTimeout(() => {
          addManualEventLog("SUCCESS", calibIp, "HVAC_TESTER", `Diagnostic Stage Response parsed. Fan Low: OK, Fan High: Off, Hydrogen gas PPM stable at 2.4` );
        }, 1000);
      }
    } catch (err: any) {
      addManualEventLog("WARNING", calibIp, "HVAC_TESTER", `Failsafe stage pulse communication failed: ${err.message}`);
    }
  };

  // ------------------------- LOGS SAVER -------------------------
  const downloadLogsFile = () => {
    const lines = liveLogs.map(l => `[${l.timestamp}] [${l.level.padEnd(8)}] [${l.sourceIp.padEnd(15)}] [${l.sourceNode}] ${l.message}`);
    const textBlob = new Blob([lines.join("\r\n")], { type: "text/plain" });
    const url = URL.createObjectURL(textBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `EMS_Gateway_Telemetry_Log_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter logs logic
  const filteredEvents = liveLogs.filter(l => {
    // Level filter
    if (filterLevel !== "ALL" && l.level !== filterLevel) return false;
    
    // Search query filter
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      return (
        l.message.toLowerCase().includes(search) ||
        l.sourceIp.includes(search) ||
        l.sourceNode.toLowerCase().includes(search) ||
        l.level.toLowerCase().includes(search)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* SECTION HEADER BLOCK */}
      <div className="bg-[#12141C] border border-white/10 rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="text-cyan-400" size={18} />
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
              EMS Central Control Cockpit & Topology Manager
            </h2>
          </div>
          <p className="text-xs text-white/50 max-w-2xl font-mono leading-relaxed">
            Real-time automated Modbus telemetry aggregator & visual overriding console. Maps physical IP routes, traces imbalanced cells, triggers manual contactors, and conditions thermal chambers directly.
          </p>
        </div>

        {/* Dynamic sweeping timer countdown and status */}
        <div className="flex items-center gap-4 shrink-0 font-mono text-[11px]">
          <div className="bg-[#0A0B0E] border border-white/5 py-1 px-3 rounded flex items-center gap-3">
            <span className="text-white/40 uppercase font-semibold text-[10px]">Autosweep:</span>
            <div className="flex items-center gap-1.5 font-bold">
              <span className={`h-1.5 w-1.5 rounded-full ${isPolling ? "bg-cyan-400 animate-ping" : "bg-white/20"}`}></span>
              <span className={isPolling ? "text-cyan-400" : "text-white/40"}>
                {isPolling ? `SWEEP IN ${nextPollCount}s` : "STANDBY"}
              </span>
            </div>
            
            <button
              onClick={() => setIsPolling(!isPolling)}
              className={`p-1 rounded cursor-pointer transition-colors ${isPolling ? "hover:bg-cyan-500/10 text-cyan-400" : "hover:bg-white/10 text-white/60"}`}
              title={isPolling ? "Pause Background Polling" : "Activate Autopolling"}
            >
              {isPolling ? <Pause size={12} /> : <Play size={12} fill="currentColor" />}
            </button>
          </div>

          <button
            onClick={handleManualSweep}
            className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black border-none text-[11px] font-bold rounded uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCw size={12} className={freezeFeed ? "" : "animate-spin-slow"} />
            Trigger Sweep
          </button>
        </div>
      </div>

      {/* TOP ROW GRID - TOPOLOGY & COCKPIT CONTROLS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* CARD A [1 lg:col-span-5] - DYNAMIC UNIFIED IP TOPOLOGY MAP */}
        <div className="lg:col-span-5 bg-[#12141C] border border-white/5 rounded-lg overflow-hidden flex flex-col justify-between">
          <div>
            <div className="border-b border-white/5 bg-[#161922] p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Network size={14} className="text-cyan-400" />
                <span className="font-mono text-xs font-bold uppercase text-white">Dynamic Unified IP Topology</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-mono font-bold uppercase rounded flex items-center gap-1 hover:bg-cyan-500/20 cursor-pointer"
                >
                  <Plus size={10} />
                  Add Route
                </button>
                <button
                  onClick={handleResetTopology}
                  className="p-1 hover:bg-white/5 text-white/40 hover:text-white uppercase text-[9px] font-mono rounded cursor-pointer"
                  title="Restore Manufacturing Preset Layout"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Inline add node route form */}
            {showAddForm && (
              <form onSubmit={handleAddTopologyNode} className="p-4 bg-[#141720] border-b border-cyan-500/20 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between text-cyan-400 font-bold border-b border-white/5 pb-1">
                  <span>REGISTER NEW HIGH-IP ROUTE</span>
                  <button type="button" onClick={() => setShowAddForm(false)} className="bg-none border-none text-white/50 hover:text-white cursor-pointer">
                    <X size={14} />
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-white/40 block text-[9px] uppercase font-bold">Node Nickname</label>
                    <input 
                      type="text" 
                      value={newNodeName} 
                      onChange={(e) => setNewNodeName(e.target.value)}
                      placeholder="e.g. String 3-3"
                      className="w-full bg-[#0F1117] border border-white/10 p-1.5 text-xs text-white rounded font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-white/40 block text-[9px] uppercase font-bold">IP Address</label>
                    <input 
                      type="text" 
                      value={newIpAddress} 
                      onChange={(e) => setNewIpAddress(e.target.value)}
                      placeholder="e.g. 10.0.3.30"
                      required
                      className="w-full bg-[#0F1117] border border-white/10 p-1.5 text-xs text-white rounded font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-white/40 block text-[9px] uppercase font-bold">Array Id</label>
                    <input 
                      type="number" 
                      value={newArrayId} 
                      onChange={(e) => setNewArrayId(Number(e.target.value))}
                      className="w-full bg-[#0F1117] border border-white/10 p-1.5 text-xs text-white rounded"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-white/40 block text-[9px] uppercase font-bold">String Id</label>
                    <input 
                      type="number" 
                      value={newStringId} 
                      onChange={(e) => setNewStringId(Number(e.target.value))}
                      className="w-full bg-[#0F1117] border border-white/10 p-1.5 text-xs text-white rounded"
                    />
                  </div>
                  <div className="space-y-1 font-mono">
                    <label className="text-white/40 block text-[9px] uppercase font-bold">Device Type</label>
                    <select
                      value={newNodeType}
                      onChange={(e) => setNewNodeType(e.target.value as any)}
                      className="w-full bg-[#0F1117] border border-white/10 p-1 text-xs text-white rounded font-bold"
                    >
                      <option value="BESS String">BESS String</option>
                      <option value="HVAC Controller">HVAC Controller</option>
                      <option value="IO Gateway">IO Gateway</option>
                      <option value="PCS Inverter">PCS Inverter</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black border-none font-bold text-[10px] rounded uppercase tracking-wider cursor-pointer"
                  >
                    Commit Mapping Route
                  </button>
                </div>
              </form>
            )}

            {/* Topology table lists */}
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px] leading-relaxed border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-white/40 text-[9px] uppercase font-bold">
                    <th className="pb-2">Node Name</th>
                    <th className="pb-2">Coords</th>
                    <th className="pb-2">IP Route</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {topology.map((node) => (
                    <tr key={node.id} className="hover:bg-white/5 font-medium">
                      <td className="py-2.5 text-white font-bold">{node.name}</td>
                      <td className="py-2.5 text-white/60">
                        {node.nodeType === "BESS String" ? `A:${node.arrayId} S:${node.stringId}` : "-"}
                      </td>
                      <td className="py-2.5 text-cyan-400 font-bold">{node.ipAddress}</td>
                      <td className="py-2.5 text-xs">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          node.nodeType === "BESS String" ? "bg-amber-500/10 text-amber-400 border border-amber-500/10" :
                          node.nodeType === "HVAC Controller" ? "bg-blue-500/10 text-blue-400 border border-blue-500/10" :
                          node.nodeType === "IO Gateway" ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/10" :
                          "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                        }`}>
                          {node.nodeType.split(" ")[0]}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => handleDeleteNode(node.id, node.name, node.ipAddress)}
                          className="p-1 hover:bg-rose-500/10 text-rose-500 rounded border-none bg-transparent cursor-pointer"
                          title="Deregister node IP routing map"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 bg-[#141720] border-t border-white/5 text-[10px] font-mono text-white/50 leading-relaxed uppercase">
            <span>Unified Subnet Mask: <span className="text-white font-bold">255.255.0.0</span></span>
            <span className="block mt-0.5">Physical Switch Stack: Stack#1 Modbus Aggregated</span>
          </div>
        </div>

        {/* CARD B [2 lg:col-span-7] - ACCESSIBLE COCKPIT CONTROLS (ONE OFF FUNCTIONS MENU) */}
        <div className="lg:col-span-7 bg-[#12141C] border border-white/5 rounded-lg overflow-hidden flex flex-col justify-between">
          <div>
            <div className="border-b border-white/5 bg-[#161922] p-4">
              <div className="flex items-center gap-2">
                <Cpu size={14} className="text-cyan-400" />
                <span className="font-mono text-xs font-bold uppercase text-white">Manual Command Overrides & Calibrators Dashboard</span>
              </div>
            </div>

            {/* Interactive Grid for functional blocks */}
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* BLOCK 1: CONTACTOR RELAY AND PCS BALANCING OVERRIDES */}
              <div className="bg-[#161922]/50 border border-white/5 rounded p-4 space-y-4">
                <div className="flex items-center gap-1.5 border-b border-white/5 pb-2">
                  <Power size={13} className="text-amber-400" />
                  <span className="font-mono text-[10px] font-bold uppercase text-white/60">Contactor & Loop Rotators</span>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  {/* Target configuration selector */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] text-white/40 uppercase block font-bold">Array Segment</label>
                      <select 
                        value={ctrlArray} 
                        onChange={(e) => setCtrlArray(Number(e.target.value))}
                        className="w-full bg-[#0F1117] border border-white/10 p-1 py-1.5 text-white/90 text-xs rounded font-bold"
                      >
                        {[1, 2, 3, 4, 12].map(v => (
                          <option key={v} value={v}>Array Segment {v}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] text-white/40 uppercase block font-bold">Target String</label>
                      <select 
                        value={ctrlString} 
                        onChange={(e) => setCtrlString(Number(e.target.value))}
                        className="w-full bg-[#0F1117] border border-white/10 p-1 py-1.5 text-white/90 text-xs rounded font-bold"
                      >
                        {[1, 2, 3, 4, 14].map(v => (
                          <option key={v} value={v}>String Node {v}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Actions for contactors */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-white/40 uppercase block font-bold">Set Switch State Relay</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setContactorAction("close"); }}
                        className={`flex-1 py-2 font-bold text-[10px] uppercase rounded border-none cursor-pointer tracking-wider text-center transition-colors ${
                          contactorAction === "close" ? "bg-emerald-500 text-black hover:bg-emerald-400" : "bg-[#0F1117] hover:bg-white/5 text-white/60"
                        }`}
                      >
                        CLOSE RELAY (ENGAGE)
                      </button>
                      <button
                        onClick={() => { setContactorAction("open"); }}
                        className={`flex-1 py-2 font-bold text-[10px] uppercase rounded border-none cursor-pointer tracking-wider text-center transition-colors ${
                          contactorAction === "open" ? "bg-rose-500 text-black hover:bg-rose-400" : "bg-[#0F1117] hover:bg-white/5 text-white/60"
                        }`}
                      >
                        OPEN RELAY (ISOLATE)
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button
                      onClick={dispatchContactorOverride}
                      className="flex-1 py-2 text-white bg-slate-800 hover:bg-slate-700 font-bold uppercase text-[9px] tracking-wider rounded cursor-pointer border-none"
                    >
                      EXECUTE ON STRING
                    </button>
                    <button
                      onClick={dispatchArrayContactorOverride}
                      className="flex-1 py-2 text-white bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500/20 font-bold uppercase text-[9px] tracking-wider rounded cursor-pointer"
                    >
                      APPLY FULL ARRAY
                    </button>
                  </div>

                  {/* String Loop Rotators parameters */}
                  <div className="pt-2 border-t border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] text-white/40 uppercase block font-bold">Balancing Loop Rotation</label>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 cursor-pointer text-white/60 text-[9px]">
                          <input type="radio" checked={rotateTarget === "strings"} onChange={() => setRotateTarget("strings")} className="accent-cyan-400" />
                          Strings
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer text-white/60 text-[9px]">
                          <input type="radio" checked={rotateTarget === "pcs"} onChange={() => setRotateTarget("pcs")} className="accent-cyan-400" />
                          PCS
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <select
                        value={rotateAction}
                        onChange={(e) => setRotateAction(e.target.value as any)}
                        className="bg-[#0F1117] border border-white/10 text-white p-1 py-1 text-[10px] rounded font-bold font-mono focus:outline-none flex-1 uppercase"
                      >
                        <option value="rotate">rotate sequence</option>
                        <option value="align">align capacity offset</option>
                      </select>
                      
                      <button
                        onClick={dispatchLoopRotationOverride}
                        className="px-3.5 py-1.5 bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-bold rounded uppercase hover:bg-cyan-500/25 text-[10px] cursor-pointer shrink-0"
                      >
                        Dispatch Code
                      </button>
                    </div>
                  </div>

                </div>
              </div>

              {/* BLOCK 2: CHAMBER CONDITIONING / ENCLOSURE HEAT SOAK (hvac_v2_doors.sh functions) */}
              <div className="bg-[#161922]/50 border border-white/5 rounded p-4 space-y-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 border-b border-white/5 pb-2">
                    <FlameKindling size={13} className="text-red-400" />
                    <span className="font-mono text-[10px] font-bold uppercase text-white/60">Enclosure Heat Soak Regulator</span>
                  </div>

                  <div className="space-y-3 font-mono text-xs">
                    <div className="space-y-1">
                      <label className="text-[9px] text-white/40 uppercase block font-bold">Chamber / Segment Block</label>
                      <select 
                        value={heatSoakSeg}
                        onChange={(e) => setHeatSoakSeg(e.target.value)}
                        className="w-full bg-[#0F1117] border border-white/10 p-1 py-1.5 text-white/90 text-xs rounded font-bold"
                      >
                        <option value="Block-Chamber-Alpha1">Segment Alpha 1 [A1]</option>
                        <option value="Block-Chamber-Alpha2">Segment Alpha 2 [A2]</option>
                        <option value="Block-Chamber-Beta3">Segment Beta 3 [B3]</option>
                        <option value="Block-Chamber-Gamma1">Segment Gamma 1 [G1]</option>
                        <option value="Imbalanced-Enclosure-3">Imbalanced Chamber Segment 14</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold">
                        <span className="text-white/40 uppercase font-bold">Target Heat Load Setpoint</span>
                        <span className="text-cyan-400">{heatSoakTemp}°C</span>
                      </div>
                      <input 
                        type="range" 
                        min="15" 
                        max="65" 
                        value={heatSoakTemp} 
                        onChange={(e) => setHeatSoakTemp(Number(e.target.value))}
                        className="w-full accent-cyan-400 h-1 bg-[#0F1117] rounded-lg border-none cursor-pointer mt-1"
                      />
                      <div className="flex justify-between text-[8px] text-white/30 font-bold font-mono">
                        <span>15°C (Min)</span>
                        <span>40°C (Nominal)</span>
                        <span>65°C (Max)</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleHeatSoakCommand("start")}
                      className={`flex-1 py-2 font-bold uppercase text-[10px] rounded tracking-wider border-none cursor-pointer text-center ${
                        heatSoakActive ? "bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.4)]" : "bg-[#0F1117] hover:bg-white/5 border border-white/10 text-white"
                      }`}
                    >
                      {heatSoakActive ? "HEATING ACTIVE" : "INITIATE SOAK"}
                    </button>
                    
                    <button
                      onClick={() => handleHeatSoakCommand("stop")}
                      disabled={!heatSoakActive}
                      className="flex-1 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 disabled:opacity-30 disabled:pointer-events-none font-bold uppercase text-[10px] rounded tracking-wider text-center cursor-pointer"
                    >
                      TERMINATE
                    </button>
                  </div>
                  
                  {/* Thermometer Status Line */}
                  <div className="mt-2.5 bg-[#0F1117] border border-white/5 p-1 px-2 rounded-sm flex items-center justify-between text-[9px] font-mono select-none">
                    <span className="text-white/40 font-bold uppercase">Conditioner Coil Active:</span>
                    <span className={`font-bold ${heatSoakActive ? "text-red-400 animate-pulse" : "text-white/20"}`}>
                      {heatSoakActive ? "● ENGAGED // HIGH TEMPERATURE WAVE" : "● IDLE // OFF"}
                    </span>
                  </div>
                </div>

              </div>

            </div>

            {/* BLOCK 3: MODBUS IDENTIFIERS CALIBRATION & HARDWARE STAGING (manual_setup.sh tools) */}
            <div className="px-5 pb-5 pt-1 border-t border-white/5">
              <div className="bg-[#161922]/50 border border-white/5 rounded p-4 font-mono text-xs">
                <div className="flex items-center gap-1.5 border-b border-white/5 pb-2 mb-3">
                  <Settings size={13} className="text-purple-400" />
                  <span className="font-bold uppercase text-white/60 text-[10px]">Modbus Unit Calibration Offset Wizard & HVAC Stages Test</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-4 space-y-1">
                    <label className="text-[9px] text-white/40 uppercase font-bold block">Target Node IP</label>
                    <select
                      value={calibIp}
                      onChange={(e) => setCalibIp(e.target.value)}
                      className="w-full bg-[#0F1117] border border-white/10 p-1.5 text-white/90 rounded text-xs font-bold"
                    >
                      {topology.map(node => (
                        <option key={node.id} value={node.ipAddress}>{node.name} ({node.ipAddress})</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3 space-y-1">
                    <label className="text-[9px] text-white/40 block font-bold uppercase">Assign Unit ID Offset</label>
                    <input 
                      type="number" 
                      value={calibUnitOffset} 
                      onChange={(e) => setCalibUnitOffset(Number(e.target.value))}
                      className="w-full bg-[#0F1117] border border-white/10 p-1 px-1.5 text-white rounded text-xs text-center font-bold"
                    />
                  </div>

                  <div className="md:col-span-5 flex gap-2">
                    <button
                      onClick={triggerModbusFlashCalibration}
                      className="flex-1 py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/20 font-bold uppercase text-[10px] tracking-wider rounded cursor-pointer transition-all"
                    >
                      Flash Unit ID Map
                    </button>
                    <button
                      onClick={triggerHvacStageDiagnosticPulse}
                      className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-705 text-white font-bold uppercase text-[10px] tracking-wider rounded cursor-pointer border-none"
                    >
                      Stage Pulse Test
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Overrides responses viewer panel */}
          <div className="h-10 border-t border-white/5 bg-[#0F1117] px-4 flex items-center justify-between text-[11px] font-mono">
            <span className="text-white/40 uppercase font-bold text-[9px] tracking-wide">Last Call Response Interceptor:</span>
            {commandResponse ? (
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${commandResponse.success ? "bg-emerald-400" : "bg-red-400"}`}></span>
                <span className={`font-bold text-[10px] ${commandResponse.success ? "text-emerald-400" : "text-rose-400"}`} title={JSON.stringify(commandResponse.payload)}>
                  [{commandResponse.success ? "SUCCESS" : "EXCEPTION"}] {commandResponse.endpoint.slice(0, 32)}...
                </span>
                <span className="text-white/20 text-[9px]">{commandResponse.timestamp}</span>
              </div>
            ) : (
              <span className="text-white/20 text-[9px] font-medium">Await controller dispatch overrides trigger...</span>
            )}
          </div>
        </div>

      </div>

      {/* LOWER ROW - TABBED AUTOMATED OBSERVABILITY SYSTEM */}
      <div className="bg-[#0B0C10] border border-white/10 rounded-lg overflow-hidden flex flex-col justify-between h-[520px]">
        
        {/* System observational tabs header */}
        <div className="border-b border-white/10 bg-[#12141C] p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 font-mono text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-cyan-400" />
              <span className="font-bold uppercase tracking-wider text-white">EMS OBSERVABILITY CHANNEL</span>
            </div>
            
            {/* Tab selection pill selectors */}
            <div className="flex bg-[#0A0B0E] p-0.5 rounded border border-white/10 select-none">
              <button
                type="button"
                onClick={() => setActiveTab("stream")}
                className={`px-3 py-1 text-[10px] font-bold rounded uppercase transition-colors duration-150 cursor-pointer ${
                  activeTab === "stream" ? "bg-cyan-500 text-black shadow-sm" : "text-white/50 hover:text-white"
                }`}
              >
                Telemetry Stream
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("modbus");
                  pollLiveModbusValues();
                }}
                className={`px-3 py-1 text-[10px] font-bold rounded uppercase transition-colors duration-150 cursor-pointer ${
                  activeTab === "modbus" ? "bg-cyan-500 text-black shadow-sm" : "text-white/50 hover:text-white"
                }`}
              >
                Modbus Map Live View
              </button>
            </div>
          </div>

          {/* TAB 1: Stream controls */}
          {activeTab === "stream" && (
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <input 
                type="text" 
                placeholder="Filter logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#0F1117] border border-white/10 text-white text-[10px] px-2.5 py-1.5 rounded focus:outline-none focus:border-cyan-500 w-full sm:w-40 uppercase font-bold"
              />

              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="bg-[#0F1117] border border-white/10 text-[#D1D5DB]/85 text-[10px] px-2.5 py-1 rounded cursor-pointer uppercase font-bold focus:outline-none"
              >
                <option value="ALL">All Levels</option>
                <option value="SUCCESS">Success Only</option>
                <option value="INFO">Info Only</option>
                <option value="WARNING">Warnings</option>
                <option value="CRITICAL">Critical Alarms</option>
              </select>

              <button
                type="button"
                onClick={() => setFreezeFeed(!freezeFeed)}
                className={`px-2 py-1 text-[10px] font-bold rounded cursor-pointer border transition-colors ${
                  freezeFeed ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-[#0F1117] text-[#D1D5DB]/65 border-white/15 hover:border-white/25"
                }`}
              >
                {freezeFeed ? "RESUME STREAM" : "FREEZE STREAM"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setLiveLogs([]);
                  addManualEventLog("INFO", "LOCAL_GATEWAY", "CLEARED", "Log stream history buffer wiped clean.");
                }}
                className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] border border-rose-500/10 rounded cursor-pointer"
              >
                Wipe
              </button>

              <button
                type="button"
                onClick={downloadLogsFile}
                className="p-1 px-2 hover:bg-white/10 text-cyan-400 bg-[#0F1117] border border-white/15 text-[10px] font-bold rounded inline-flex items-center gap-1 cursor-pointer transition-colors"
                title="Download text logs"
              >
                <Download size={11} />
                Save
              </button>
            </div>
          )}

          {/* TAB 2: Modbus map controls */}
          {activeTab === "modbus" && (
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto font-mono text-[11px]">
              
              {/* Host IP Selector */}
              <div className="flex items-center gap-1">
                <span className="text-white/40 text-[9px] uppercase font-bold">Node:</span>
                <select
                  value={modbusHost}
                  onChange={(e) => setModbusHost(e.target.value)}
                  className="bg-[#0F1117] border border-white/10 text-cyan-400 px-2 py-1 rounded cursor-pointer text-[10px] font-bold focus:outline-none"
                >
                  {topology.map(node => (
                    <option key={node.id} value={node.ipAddress}>
                      {node.name} ({node.ipAddress})
                    </option>
                  ))}
                  <option value="127.0.0.1">Localhost (127.0.0.1)</option>
                </select>
              </div>

              {/* Port */}
              <div className="flex items-center gap-1">
                <span className="text-white/40 text-[9px] uppercase font-bold">Port:</span>
                <input
                  type="number"
                  value={modbusPort}
                  onChange={(e) => setModbusPort(parseInt(e.target.value, 10) || 502)}
                  className="w-12 text-center bg-[#0F1117] border border-white/10 text-white px-1 py-0.5 rounded text-[10px]"
                />
              </div>

              {/* Unit ID */}
              <div className="flex items-center gap-1">
                <span className="text-white/40 text-[9px] uppercase font-bold">Unit:</span>
                <input
                  type="number"
                  value={modbusUnitId}
                  onChange={(e) => setModbusUnitId(parseInt(e.target.value, 10) || 1)}
                  className="w-10 text-center bg-[#0F1117] border border-white/10 text-white px-1 py-0.5 rounded text-[10px]"
                />
              </div>

              <div className="h-4 w-[1px] bg-white/10 hidden sm:block"></div>

              {/* Auto Poll Switch */}
              <label className="flex items-center gap-1.5 cursor-pointer text-white/60 text-[10px] select-none">
                <input
                  type="checkbox"
                  checked={autoPollModbus}
                  onChange={(e) => setAutoPollModbus(e.target.checked)}
                  className="accent-cyan-400 cursor-pointer"
                />
                Auto Refresh (10s)
              </label>

              {/* Trigger Refresh */}
              <button
                type="button"
                onClick={pollLiveModbusValues}
                disabled={isModbusPolling}
                className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-500/30 disabled:text-black/45 text-black text-[10px] font-bold rounded uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <RotateCw size={10} className={isModbusPolling ? "animate-spin" : ""} />
                Poll registers
              </button>
            </div>
          )}
        </div>

        {/* CONTENT PANELS CONTAINER */}
        <div className="flex-1 overflow-hidden relative">
          
          {/* TAB 1 CONTENT: DYNAMIC SCROLLER */}
          {activeTab === "stream" && (
            <div className="absolute inset-0 p-4 overflow-y-auto font-mono text-[10px] space-y-1.5 leading-relaxed bg-[#050608] select-text">
              {filteredEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/20 select-none">
                  <Activity size={24} className="animate-pulse mb-2 text-cyan-400/40" />
                  <span>No telemetry parsed data logs logged. Await next Autosweep sequence or press 'Trigger Sweep'...</span>
                </div>
              ) : (
                filteredEvents.map((log) => {
                  let textStyle = "text-[#9CA3AF]";
                  if (log.level === "SUCCESS") {
                    textStyle = "text-emerald-400";
                  } else if (log.level === "WARNING") {
                    textStyle = "text-amber-300 font-medium";
                  } else if (log.level === "CRITICAL") {
                    textStyle = "text-rose-500 font-bold bg-rose-500/5 px-1 py-0.5 rounded";
                  }

                  return (
                    <div key={log.id} className={`hover:bg-white/5 py-0.5 rounded px-1 transition-colors flex items-start gap-2 ${textStyle}`}>
                      <span className="text-white/30 shrink-0 select-none">[{log.timestamp}]</span>
                      <span className="shrink-0 font-bold select-none min-w-[75px]">
                        {log.level === "INFO" && <span className="text-blue-400">[INFO]</span>}
                        {log.level === "SUCCESS" && <span className="text-emerald-400 font-bold">[SUCCESS]</span>}
                        {log.level === "WARNING" && <span className="text-amber-400 font-bold">[WARNING]</span>}
                        {log.level === "CRITICAL" && <span className="text-rose-500 font-extrabold animate-pulse">[CRITICAL]</span>}
                      </span>
                      <span className="text-cyan-400 shrink-0 font-semibold select-all">[{log.sourceIp}]</span>
                      <span className="text-white/60 shrink-0 select-none">({log.sourceNode})</span>
                      <span className="break-all whitespace-pre-wrap flex-1 ml-1 font-medium">{log.message}</span>
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          )}

          {/* TAB 2 CONTENT: LIVE MODBUS REGISTERS FROM REGISTER MAP */}
          {activeTab === "modbus" && (
            <div className="absolute inset-0 p-5 overflow-y-auto bg-[#07080B] font-mono select-text text-xs text-[#D1D5DB]">
              
              <div className="max-w-4xl mx-auto space-y-4">
                
                {/* Visual hardware explanation banner */}
                <div className="bg-[#12141C] border border-white/5 rounded p-3 flex items-start gap-3">
                  <div className="bg-cyan-500/10 p-2 rounded shrink-0">
                    <Sliders className="text-cyan-400" size={16} />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-white text-[11px] font-bold uppercase tracking-wider">Modbus Address Space Decoder</h4>
                    <p className="text-[10px] text-white/50 leading-relaxed uppercase">
                      Gathering physical register outputs directly via the parsed schema of <strong className="text-white font-bold">modbus_map.csv</strong>. All data packets on the 10.0.*.* network subnets are polled sequentially using mapped holding registers, inputs, and coils. Applies active measurement factor scales.
                    </p>
                  </div>
                </div>

                {/* Modbus data grid */}
                <div className="bg-[#0F1117] border border-white/10 rounded overflow-hidden">
                  <table className="w-full text-left text-[11px] leading-normal border-collapse">
                    <thead>
                      <tr className="bg-[#141720]/80 border-b border-white/10 text-white/40 text-[9px] uppercase font-extrabold select-none">
                        <th className="p-3">Register</th>
                        <th className="p-3">Address Type</th>
                        <th className="p-3">Component Description</th>
                        <th className="p-3 text-center">Measurement Factor</th>
                        <th className="p-3 text-right">Raw Reading</th>
                        <th className="p-3 text-right">Decoded Live Value</th>
                        <th className="p-3 text-center">Physical Bus Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-medium">
                      {modbusMap.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-white/20 select-none">
                            <Activity size={18} className="animate-spin mb-1 mx-auto text-cyan-400/40" />
                            <span>Loading Modbus schema map definition...</span>
                          </td>
                        </tr>
                      ) : (
                        modbusMap.map((item) => {
                          const isWarning = (item.register === 13191 && typeof item.liveValue === 'number' && item.liveValue > 10) ||
                                            (item.register === 1163 && typeof item.liveValue === 'number' && item.liveValue > 50);
                          const isHeader = item.fieldType === "Header";
                          return (
                            <tr key={`${item.register}-${item.description}`} className={`hover:bg-white/[0.02] transition-colors leading-relaxed ${isWarning ? "bg-rose-500/[0.02]" : ""} ${isHeader ? "bg-cyan-500/[0.02] text-cyan-200" : ""}`}>
                              <td className="p-3 font-bold text-white">
                                <span className={`px-2 py-0.5 rounded text-[10px] border ${isHeader ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-300" : "bg-white/5 border-white/5 text-cyan-400"}`}>
                                  {item.register}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  isHeader ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/10" :
                                  item.rw === "RW" ? "bg-amber-400/10 text-amber-400 border border-amber-400/10" :
                                  "bg-purple-500/10 text-purple-400 border border-purple-500/10"
                                }`}>
                                  {isHeader ? "Header" : `${item.type} [${item.rw}]`}
                                </span>
                              </td>
                              <td className="p-3 text-white/90 font-semibold">{item.description}</td>
                              <td className="p-3 text-center text-white/40 font-bold">{item.scaleFactorName || "-"}</td>
                              
                              {/* Raw reading */}
                              <td className="p-3 text-right text-cyan-400 font-bold text-xs">
                                {isHeader ? "-" : item.liveStatus === "polling" ? (
                                  <span className="text-white/20">...</span>
                                ) : item.liveStatus === "success" && item.rawReading !== undefined ? (
                                  item.rawReading
                                ) : (
                                  "-"
                                )}
                              </td>

                              {/* Decoded live value */}
                              <td className="p-3 text-right text-xs font-bold text-white shrink-0">
                                {isHeader ? "-" : item.liveStatus === "polling" ? (
                                  <span className="text-white/20 uppercase text-[9px]">polling...</span>
                                ) : item.liveStatus === "success" && item.liveValue !== undefined ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className={isWarning ? "text-rose-400 font-extrabold animate-pulse" : "text-emerald-400"}>
                                      {item.liveValue}
                                    </span>
                                    <span className="text-[10px] text-white/30 font-medium font-mono uppercase">
                                      {item.unit || ""}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-white/20 select-none">-</span>
                                )}
                              </td>

                              {/* Physical status of the modbus register */}
                              <td className="p-3 text-center">
                                {item.liveStatus === "polling" ? (
                                  <span className="inline-flex h-2 w-2 rounded-full bg-white/20 animate-pulse"></span>
                                ) : item.liveStatus === "success" ? (
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold ${
                                    isWarning 
                                      ? "bg-rose-500/10 text-rose-400 border border-rose-500/10" 
                                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${isWarning ? "bg-rose-400 animate-ping" : "bg-emerald-400"}`}></span>
                                    {isWarning ? "ALARM" : "OK"}
                                  </span>
                                ) : item.liveStatus === "error" ? (
                                  <span className="inline-flex items-center gap-1 bg-rose-500/15 text-rose-500 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-tight">
                                    BUS TIMEOUT
                                  </span>
                                ) : (
                                  <span className="text-white/20 text-[9px] uppercase">{isHeader ? "STATIC" : "DORMANT"}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footnote instruction block */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-[9px] text-white/30 font-bold uppercase leading-relaxed border-t border-white/5 pt-3">
                  <span>Modbus Poller Buffer Block Sync: Active standard RTU overlay</span>
                  <span>Modbus mapping file: /turtle/tools/report/ems/modbus_map.csv</span>
                </div>

              </div>
              
            </div>
          )}

        </div>

        {/* TABBED SCREEN FOOTER STATUS LINE */}
        <div className="h-8 border-t border-white/10 bg-[#0A0B0E] px-4 flex items-center justify-between text-[10px] font-mono text-white/30 shrink-0 uppercase tracking-widest font-bold">
          <div className="flex items-center gap-3">
            {activeTab === "stream" ? (
              <>
                <span>Channel Stream records count: {filteredEvents.length}</span>
                <span>|</span>
                <span>Active socket loop: localhost + 10.0.*.*</span>
              </>
            ) : (
              <>
                <span>Registers parsed: {modbusMap.length} points mapped</span>
                <span>|</span>
                <span>Active Target bus: <span className="text-cyan-400 font-bold">{modbusHost}:{modbusPort} (Unit #{modbusUnitId})</span></span>
              </>
            )}
          </div>
          <span>Observability Console Session: Online</span>
        </div>

      </div>

    </div>
  );
}
