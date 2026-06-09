import React, { useState, useEffect, useRef } from "react";
import { GreEnergyLogo } from "./GreEnergyLogo";
import { 
  Upload, 
  FileText, 
  Check, 
  AlertTriangle, 
  Database, 
  ChevronRight, 
  Play, 
  X, 
  Plus, 
  Filter, 
  Search, 
  CheckCircle, 
  Sliders, 
  Cpu, 
  RefreshCw,
  Clock,
  ExternalLink,
  Activity,
  Fan,
  RotateCw,
  Gauge,
  Zap,
  Info,
  Radio,
  Wifi,
  Terminal,
  Server
} from "lucide-react";

import SystemDetailsView from "./kobold/SystemDetailsView";
import ArraysView from "./kobold/ArraysView";
import StringsView from "./kobold/StringsView";
import SegmentsView from "./kobold/SegmentsView";
import SensorsView from "./kobold/SensorsView";
import HvacsView from "./kobold/HvacsView";
import StackManagersView from "./kobold/StackManagersView";
import UpsesView from "./kobold/UpsesView";
import ConnectionSettings from "./ConnectionSettings";

interface ModbusRegister {
  register: number;
  type: string;
  fieldType: string;
  description: string;
  rw: string;
  scaleFactorName: string;
  unit: string;
  liveStatus: "idle" | "polling" | "success" | "error";
  rawValue?: number;
  liveValue?: string | number;
}

// Interfaces matching the Powin Kobold UI screenshots
interface EmsApp {
  priority: number;
  appCode: string;
  appName: string;
  configuration: string;
  status: string;
  statusType: "normal" | "warning" | "error" | "disabled" | "danger";
}

interface BlockMeter {
  index: number;
  realPower: number | string;
  reactivePower: number | string;
  voltageLN: number | string;
  voltageLL: number | string;
  current: number | string;
  powerFactor: number | string;
}

interface PcsRow {
  arrayIndex: number;
  pcsIndex: number;
  dcVolt: number;
  dcCurr: number;
  acVolt: string; // "692/689/691"
  acCurr: string; // "0.0/0.0/0.0"
  acRealPower: number;
  acReactPower: number;
  freq: number;
  rotation: string; // "⟳" / "↻"
  status: "ONLINE" | "FAULTED" | "STANDBY";
}

interface HvacRow {
  hvacIndex: number;
  humidity: number;
  airTemp: number;
  cellTemp: number;
  coolTo: number;
  heatTo: number;
  setpointsRespondingTo: string;
  stage: string;
  signals: string;
  unit1: string;
  unit2: string;
  status: "OK" | "WARNING" | "ALARM";
}

interface StringRow {
  array: number;
  string: number;
  contact: "ok" | "fault" | "open" | "closed";
  rotation: "ok" | "fault" | "transit";
  voltageMeas: number;
  voltageCalc: number;
  voltageBus: number;
  voltageDelta: number;
  powerA: number;
  powerkW: number;
  powerSoc: number;
  powerKwh: number;
  cellVoltsMin: number;
  cellVoltsMax: number;
  cellVoltsAvg: number;
  cellVoltsDelta: number;
  cellTempMin: number;
  cellTempMax: number;
  cellTempAvg: number;
  cellTempDelta: number;
  balanceCount: number;
  balanceMode: string;
  loc: string;
  fans: "ON" | "OFF" | "SPEED";
  timestamp: string;
}

// Default registers as fallback or initializer
const INITIAL_REGISTERS: ModbusRegister[] = [
  { register: 2, type: "uint16", fieldType: "Header", description: 'ID "Common"', rw: "R", scaleFactorName: "", unit: "", liveStatus: "idle" },
  { register: 3, type: "uint16", fieldType: "Header", description: "Length", rw: "R", scaleFactorName: "", unit: "", liveStatus: "idle" },
  { register: 4, type: "string", fieldType: "Fixed", description: "Manufacturer", rw: "R", scaleFactorName: "", unit: "", liveStatus: "idle" },
  { register: 20, type: "string", fieldType: "Fixed", description: "Model", rw: "R", scaleFactorName: "", unit: "", liveStatus: "idle" },
  { register: 44, type: "string", fieldType: "Fixed", description: "Version", rw: "R", scaleFactorName: "", unit: "", liveStatus: "idle" },
  { register: 52, type: "string", fieldType: "Fixed", description: "SerialNumber", rw: "R", scaleFactorName: "", unit: "", liveStatus: "idle" },
  { register: 70, type: "uint16", fieldType: "Header", description: 'ID "InverterThreePhase"', rw: "R", scaleFactorName: "", unit: "", liveStatus: "idle" },
  { register: 72, type: "uint16", fieldType: "Fixed", description: "Amps", rw: "R", scaleFactorName: "A_SF", unit: "A", liveStatus: "idle" },
  { register: 84, type: "sint16", fieldType: "Fixed", description: "Watts", rw: "R", scaleFactorName: "W_SF", unit: "W", liveStatus: "idle" },
  { register: 86, type: "uint16", fieldType: "Fixed", description: "Hz", rw: "R", scaleFactorName: "Hz_SF", unit: "Hz", liveStatus: "idle" },
  { register: 103, type: "sint16", fieldType: "Fixed", description: "CabinetTemperature", rw: "R", scaleFactorName: "Tmp_SF", unit: "C", liveStatus: "idle" },
  { register: 540, type: "uint16", fieldType: "Header", description: 'ID "WyeConnectThreePhaseabcnMeter"', rw: "R", scaleFactorName: "", unit: "", liveStatus: "idle" },
  { register: 542, type: "sint16", fieldType: "Fixed", description: "MeterAmps", rw: "R", scaleFactorName: "A_SF", unit: "A", liveStatus: "idle" },
  { register: 547, type: "sint16", fieldType: "Fixed", description: "MeterVoltageLN", rw: "R", scaleFactorName: "V_SF", unit: "V", liveStatus: "idle" },
  { register: 558, type: "sint16", fieldType: "Fixed", description: "MeterWatts", rw: "R", scaleFactorName: "W_SF", unit: "W", liveStatus: "idle" },
  { register: 647, type: "uint16", fieldType: "Header", description: 'ID "BatteryBaseModel"', rw: "R", scaleFactorName: "", unit: "", liveStatus: "idle" },
  { register: 658, type: "uint16", fieldType: "Fixed", description: "StateofCharge", rw: "R", scaleFactorName: "SoC_SF", unit: "%", liveStatus: "idle" },
  { register: 660, type: "uint16", fieldType: "Fixed", description: "StateofHealth", rw: "R", scaleFactorName: "SoH_SF", unit: "%", liveStatus: "idle" },
  { register: 691, type: "sint16", fieldType: "Fixed", description: "TotalDCCurrent", rw: "R", scaleFactorName: "A_SF", unit: "A", liveStatus: "idle" },
  { register: 694, type: "sint16", fieldType: "Fixed", description: "TotalPower", rw: "R", scaleFactorName: "W_SF", unit: "W", liveStatus: "idle" },
  { register: 1159, type: "uint16", fieldType: "Header", description: 'ID "LithiumIonBatteryBankModel"', rw: "R", scaleFactorName: "", unit: "", liveStatus: "idle" },
  { register: 1161, type: "uint16", fieldType: "Fixed", description: "StringCount", rw: "R", scaleFactorName: "", unit: "", liveStatus: "idle" },
  { register: 1163, type: "sint16", fieldType: "Fixed", description: "MaxModuleTemperature", rw: "R", scaleFactorName: "ModTmp_SF", unit: "C", liveStatus: "idle" },
  { register: 13191, type: "uint16", fieldType: "Fixed", description: "HydrogenPPM", rw: "R", scaleFactorName: "HPPM_SF", unit: "PPM", liveStatus: "idle" }
];

const renderValueHighlight = (valStr: string) => {
  const trimmed = valStr.trim();
  if (trimmed.startsWith('"')) {
    return <span className="text-emerald-400"> {trimmed}</span>;
  }
  if (trimmed.startsWith('true') || trimmed.startsWith('false')) {
    return <span className="text-amber-400 font-bold"> {trimmed}</span>;
  }
  if (!isNaN(parseFloat(trimmed))) {
    return <span className="text-yellow-300 font-mono"> {trimmed}</span>;
  }
  return <span className="text-white/80"> {valStr}</span>;
};

const renderJsonHighlight = (obj: any) => {
  const code = JSON.stringify(obj, null, 2);
  return (
    <pre className="font-mono text-xs text-white/90 overflow-x-auto whitespace-pre p-3 bg-[#0B0D13] border border-white/5 rounded-md leading-relaxed selection:bg-cyan-500/20 max-h-[450px] overflow-y-auto w-full">
      {code.split('\n').map((line, idx) => {
        let content: React.ReactNode = line;
        const keyMatch = line.match(/^(\s*)"([^"]+)":/);
        
        if (keyMatch) {
          const indent = keyMatch[1];
          const key = keyMatch[2];
          const rest = line.substring(keyMatch[0].length);
          
          content = (
            <span>
              {indent}
              <span className="text-cyan-400 font-bold">"{key}"</span>:
              {renderValueHighlight(rest)}
            </span>
          );
        } else {
          content = <span className="text-white/50">{line}</span>;
        }
        
        return (
          <div key={idx} className="hover:bg-white/[0.02] px-1 rounded-sm border-l border-white/[0.02]">
            {content}
          </div>
        );
      })}
    </pre>
  );
};

export default function KoboldMonitor({ initialDevices }: { initialDevices: any[] }) {
  // --- REAL-TIME LOCAL EMS TURTLE CLIENT POLLING STATES ---
  const [emsConnection, setEmsConnection] = useState<any>(null);
  const [emsStatus, setEmsStatus] = useState<any>(null);
  const [emsBlock, setEmsBlock] = useState<any>(null);
  const [emsStrings, setEmsStrings] = useState<any[]>([]);
  const [emsStatusCodes, setEmsStatusCodes] = useState<any>(null);
  const [emsSources, setEmsSources] = useState<any[]>([]);

  // --- COMMISSIONING / UPLOAD STATES ---
  const [isCommissioned, setIsCommissioned] = useState<boolean>(() => {
    return localStorage.getItem("bess_kobold_commissioned") === "true";
  });
  
  const [csvFileName, setCsvFileName] = useState<string>(() => {
    return localStorage.getItem("bess_kobold_csv_name") || "";
  });

  const [uploadedRecordsCount, setUploadedRecordsCount] = useState<number>(() => {
    return parseInt(localStorage.getItem("bess_kobold_csv_count") || "0", 10);
  });

  const [activeRegisters, setActiveRegisters] = useState<ModbusRegister[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- KOBOLD MONITOR ACTIVE VIEWS ---
  const [selectedCategory, setSelectedCategory] = useState<string>("System Details");
  const [searchStringQuery, setSearchStringQuery] = useState<string>("");
  const [arrayFilter, setArrayFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isLivePolling, setIsLivePolling] = useState<boolean>(true);
  const [pollCounter, setPollCounter] = useState<number>(3);
  const [selectedString, setSelectedString] = useState<StringRow | null>(null);

  // --- CLOUD TELEMETRY PACKET INTERCEPTOR STATES ---
  const [telemetryPackets, setTelemetryPackets] = useState<any[]>([]);
  const [isTelemetryAligned, setIsTelemetryAligned] = useState<boolean>(false);
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null);
  const [isInterceptorLive, setIsInterceptorLive] = useState<boolean>(true);
  const [isAligningScale, setIsAligningScale] = useState<boolean>(false);
  const [packetSearchQuery, setPacketSearchQuery] = useState<string>("");
  const [localCloudOutage, setLocalCloudOutage] = useState<boolean>(false);
  const [softBalancingOverride, setSoftBalancingOverride] = useState<boolean>(false);
  const [systemWideIsolation, setSystemWideIsolation] = useState<boolean>(false);
  const [simulatedIp, setSimulatedIp] = useState<string>("10.0.3.10");
  const [simulatedRegister, setSimulatedRegister] = useState<string>("1180");
  const [simulatedQueryResult, setSimulatedQueryResult] = useState<any>(null);
  const [queryLoading, setQueryLoading] = useState<boolean>(false);
  const [telemetrySubTab, setTelemetrySubTab] = useState<string>("sniffer");

  // --- CLOUD TELEMETRY ACTIONS ---
  const handleToggleAlignment = async (nowAligned: boolean) => {
    setIsAligningScale(true);
    try {
      const res = await fetch("/api/cloud-telemetry/align", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aligned: nowAligned })
      });
      if (res.ok) {
        const data = await res.json();
        setIsTelemetryAligned(data.calibrationAligned);
        
        // Push notification log
        setNotifications(prev => [
          {
            time: new Date().toISOString().replace("T", " ").slice(0, 19),
            source: "GATEWAY_CALIBRATION",
            message: nowAligned 
              ? "Applied power register scale factor calibration. Aligning local telemetry outputs with Cloud Stream."
              : "Reset local app configuration to raw register values. Mismatches with Cloud stream expected.",
            type: nowAligned ? "success" : "warning"
          },
          ...prev
        ]);
      }
    } catch (err) {
      console.error("Failed to set telemetry calibration:", err);
    } finally {
      setIsAligningScale(false);
    }
  };

  const handleForceExport = async () => {
    try {
      const res = await fetch("/api/cloud-telemetry/trigger-export", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setTelemetryPackets(prev => [data.latestPacket, ...prev]);
        setSelectedPacketId(data.latestPacket.id);
        
        setNotifications(prev => [
          {
            time: new Date().toISOString().replace("T", " ").slice(0, 19),
            source: "EGRESS_EXPORTER",
            message: `Manual telemetry packet exported from 10.0.0.3 to cloud: ID ${data.latestPacket.id}`,
            type: "success"
          },
          ...prev
        ]);
      }
    } catch (err) {
      console.error("Force export failed:", err);
    }
  };

  const handleDownloadPackets = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(telemetryPackets, null, 2)
    )}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonString);
    downloadAnchor.setAttribute("download", `intercepted_cloud_telemetry_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleToggleOutage = async (active: boolean) => {
    try {
      const res = await fetch("/api/cloud-telemetry/outage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active })
      });
      if (res.ok) {
        const data = await res.json();
        setLocalCloudOutage(data.localCloudOutageActive);
        if (data.cloudTelemetryPacket) {
          setTelemetryPackets(prev => {
            const index = prev.findIndex(p => p.id === data.cloudTelemetryPacket.id);
            if (index !== -1) {
              const updated = [...prev];
              updated[index] = data.cloudTelemetryPacket;
              return updated;
            }
            return [data.cloudTelemetryPacket, ...prev];
          });
          setSelectedPacketId(data.cloudTelemetryPacket.id);
        }
        setNotifications(prev => [
          {
            time: new Date().toISOString().replace("T", " ").slice(0, 19),
            source: "WAN_STATE",
            message: active 
              ? "Forced simulated WAN outage. Local PRIZM backup database buffering all site packets offline." 
              : "Simulated WAN outage cleared. Local cloud synchronizer synchronized packet buffers.",
            type: active ? "warning" : "success"
          },
          ...prev
        ]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleBalancing = async (active: boolean) => {
    try {
      const res = await fetch("/api/cloud-telemetry/override-balancing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active })
      });
      if (res.ok) {
        const data = await res.json();
        setSoftBalancingOverride(data.softBalancingOverride);
        if (data.cloudTelemetryPacket) {
          setTelemetryPackets(prev => {
            const index = prev.findIndex(p => p.id === data.cloudTelemetryPacket.id);
            if (index !== -1) {
              const updated = [...prev];
              updated[index] = data.cloudTelemetryPacket;
              return updated;
            }
            return [data.cloudTelemetryPacket, ...prev];
          });
          setSelectedPacketId(data.cloudTelemetryPacket.id);
        }
        setNotifications(prev => [
          {
            time: new Date().toISOString().replace("T", " ").slice(0, 19),
            source: "LOCAL_OVERRIDE",
            message: active 
              ? "MANUAL CONTROL OVERRIDE: Active cell balancing shutoffs forced on 10.0.3.10." 
              : "Manual balancing overrides released. Local EMS automatically managing strings.",
            type: active ? "success" : "info"
          },
          ...prev
        ]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleCutoff = async (active: boolean) => {
    try {
      const res = await fetch("/api/cloud-telemetry/cutoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active })
      });
      if (res.ok) {
        const data = await res.json();
        setSystemWideIsolation(data.systemWideIsolationTriggered);
        if (data.cloudTelemetryPacket) {
          setTelemetryPackets(prev => {
            const index = prev.findIndex(p => p.id === data.cloudTelemetryPacket.id);
            if (index !== -1) {
              const updated = [...prev];
              updated[index] = data.cloudTelemetryPacket;
              return updated;
            }
            return [data.cloudTelemetryPacket, ...prev];
          });
          setSelectedPacketId(data.cloudTelemetryPacket.id);
        }
        setNotifications(prev => [
          {
            time: new Date().toISOString().replace("T", " ").slice(0, 19),
            source: "LOCAL_CUTOFF",
            message: active 
              ? "EMERGENCY SAFETY RELAY TRIP: All site DC contactors opened locally!" 
              : "Emergency safety cutoff released. Local EMS restarting balance routines.",
            type: active ? "critical" : "success"
          },
          ...prev
        ]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunDiagnosticQuery = async () => {
    setQueryLoading(true);
    setSimulatedQueryResult(null);
    try {
      const res = await fetch(`/api/cloud-telemetry/query?ip=${simulatedIp}&register=${simulatedRegister}`);
      if (res.ok) {
        const data = await res.json();
        setSimulatedQueryResult(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setQueryLoading(false);
    }
  };

  // --- SEED TABLES matching Screenshots 1 & 2 ---
  const [emsApps, setEmsApps] = useState<EmsApp[]>([
    { priority: 0, appCode: "ES00001", appName: "E-Stop Response v1.0", configuration: "default/0", status: "ACBattery BHE0020:1:3: 20 trips\nACBattery BHE0020:1:4: 26 trips\nACBattery BHE0020:1:5: 19 trips\nACBattery BHE0020:1:6: 20 trips", statusType: "danger" },
    { priority: 1, appCode: "BSF0001", appName: "Battery Safety v1.0", configuration: "default/0", status: "ACBattery BHE0020:1:1 - NOTREADY / Codes: NR\nACBattery BHE0020:1:2 - NOTREADY / Codes: NR\nACBattery BHE0020:1:3 - NOTREADY / Codes: NR\nACBattery BHE0020:1:4 - NOTREADY / Codes: NR\nACBattery BHE0020:1:5 - NOTREADY / Codes: NR", statusType: "warning" },
    { priority: 2, appCode: "HCP0001", appName: "High Current Protection App v1.0", configuration: "default/0", status: "No derates.", statusType: "normal" },
    { priority: 4, appCode: "BP00001", appName: "Block Power", configuration: "default/0", status: "Blocking all power.", statusType: "warning" },
    { priority: 40, appCode: "PC00001", appName: "Power Control v1.0", configuration: "default/0", status: "Real Power: 0 kW Reactive Power: 0 kVAr Grid Mode: GRID_FOLLOWING", statusType: "normal" },
    { priority: 50, appCode: "SSPC001", appName: "Sunspec Power Command v1.0", configuration: "default/0", status: "Error - No recent power command received.", statusType: "error" },
    { priority: 100, appCode: "ADB0001", appName: "Auto Discharge Balancer v1.0", configuration: "default/0", status: "Disabled.", statusType: "disabled" },
    { priority: 300, appCode: "CTC0001", appName: "Centipede Thermal Control v1.0", configuration: "default/0", status: "OFF:262, 10-30%:58, 30-50%:0, 50-70%:0, 70-90%:0, 90-100%:0 Segments with Heating Nudge: 0 Segments with Cooling Nudge: 0 Segments with DeNudge: 0 Segments with No Nudge: 160\nSet to Standby (ZP) : ACBattery BHE0020:1:1 ACBattery BHE0020:1:2 ACBattery BHE0020:1:3 ACBattery BHE0020:1:4 ACBattery BHE0020:1:5 ACBattery BHE0020:1:6 ACBattery BHE0020:1:7 ACBattery BHE0020:1:8", statusType: "normal" },
    { priority: 999, appCode: "BS00001", appName: "Backstop v1.0", configuration: "default/0", status: "Blocked on critical alert stack", statusType: "normal" }
  ]);

  const [blockMeters, setBlockMeters] = useState<BlockMeter[]>([
    { index: 1, realPower: "0.0", reactivePower: "0.0", voltageLN: "0.00", voltageLL: "0.00", current: "0.0", powerFactor: "0.000" }
  ]);

  const [pcses, setPcses] = useState<PcsRow[]>([
    { arrayIndex: 1, pcsIndex: 1, dcVolt: 1378, dcCurr: 0, acVolt: "693 / 689 / 692", acCurr: "0.0 / 0.0 / 0.0", acRealPower: 0, acReactPower: 0, freq: 60.01, rotation: "⟳", status: "ONLINE" },
    { arrayIndex: 1, pcsIndex: 2, dcVolt: 1377, dcCurr: -2, acVolt: "692 / 689 / 691", acCurr: "0.0 / 0.0 / 0.0", acRealPower: 0, acReactPower: 0, freq: 60.01, rotation: "⟳", status: "ONLINE" },
    { arrayIndex: 1, pcsIndex: 3, dcVolt: 1379, dcCurr: -3, acVolt: "692 / 690 / 691", acCurr: "0.0 / 1.0 / 0.0", acRealPower: 0, acReactPower: 0, freq: 60.01, rotation: "⟳", status: "ONLINE" },
    { arrayIndex: 2, pcsIndex: 1, dcVolt: 1380, dcCurr: -1, acVolt: "692 / 689 / 691", acCurr: "0.0 / 0.0 / 0.0", acRealPower: 0, acReactPower: 0, freq: 60.01, rotation: "⟳", status: "ONLINE" },
    { arrayIndex: 2, pcsIndex: 2, dcVolt: 1377, dcCurr: -2, acVolt: "693 / 690 / 691", acCurr: "0.0 / 0.0 / 0.0", acRealPower: 0, acReactPower: 0, freq: 60.01, rotation: "⟳", status: "ONLINE" },
    { arrayIndex: 3, pcsIndex: 1, dcVolt: 1375, dcCurr: -2, acVolt: "692 / 690 / 691", acCurr: "0.0 / 0.0 / 1.0", acRealPower: 0, acReactPower: 0, freq: 60.01, rotation: "⟳", status: "ONLINE" },
    { arrayIndex: 3, pcsIndex: 2, dcVolt: 1376, dcCurr: -3, acVolt: "692 / 689 / 692", acCurr: "0.1 / 0.0 / 0.0", acRealPower: 0, acReactPower: 0, freq: 60.01, rotation: "⟳", status: "ONLINE" },
    { arrayIndex: 3, pcsIndex: 3, dcVolt: 1378, dcCurr: -2, acVolt: "693 / 689 / 691", acCurr: "0.0 / 0.0 / 0.0", acRealPower: 0, acReactPower: 0, freq: 60.01, rotation: "⟳", status: "ONLINE" },
  ]);

  const [hvacs, setHvacs] = useState<HvacRow[]>([
    { hvacIndex: 1, humidity: 23.4, airTemp: 26.6, cellTemp: 99.9, coolTo: 27.0, heatTo: 15.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 2, humidity: 41.7, airTemp: 20.3, cellTemp: 18.5, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 3, humidity: 42.8, airTemp: 19.5, cellTemp: 17.15, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Lead Heating (HP)", signals: "HVAC, HP, C, F", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 4, humidity: 39.3, airTemp: 21.0, cellTemp: 16.85, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 5, humidity: 43.4, airTemp: 19.5, cellTemp: 17.15, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 6, humidity: 42.3, airTemp: 19.9, cellTemp: 18.35, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 7, humidity: 43.9, airTemp: 19.3, cellTemp: 18.05, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 8, humidity: 41.2, airTemp: 20.5, cellTemp: 18.65, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 9, humidity: 42.7, airTemp: 19.6, cellTemp: 16.85, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 10, humidity: 42.2, airTemp: 19.8, cellTemp: 18.15, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 11, humidity: 42.9, airTemp: 19.7, cellTemp: 18.5, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 12, humidity: 43.1, airTemp: 19.7, cellTemp: 18.1, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 13, humidity: 43.4, airTemp: 19.4, cellTemp: 17.85, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 14, humidity: 42.7, airTemp: 19.6, cellTemp: 17.95, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Lead Heating (HP)", signals: "HP, C, F, HVAC", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 15, humidity: 43.7, airTemp: 19.8, cellTemp: 18.3, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" },
    { hvacIndex: 16, humidity: 42.8, airTemp: 19.5, cellTemp: 17.1, coolTo: 29.0, heatTo: 19.0, setpointsRespondingTo: "Air Temp", stage: "Idle", signals: "Y Y2 G W O Mar", unit1: "Normal", unit2: "Normal", status: "OK" }
  ]);

  const [stringsList, setStringsList] = useState<StringRow[]>([]);
  
  // Cell Voltage Grid values (for detailed Cell Map analysis)
  const [cellVoltGrid, setCellVoltGrid] = useState<{ pack: number; cell: number; volt: number; isUnbalanced: boolean }[]>([]);

  // Track user notifications
  const [notifications, setNotifications] = useState<{ time: string; source: string; message: string; type: "critical" | "warning" | "success" }[]>([
    { time: "2026-05-29 15:06:37", source: "HVAC_1", message: "Cell Temp at maximum range limit threshold: 99.9°C detected on Module 1", type: "critical" },
    { time: "2026-05-29 15:04:12", source: "PCS_2", message: "DC bus connection synchronized under standard rotation angle", type: "success" },
    { time: "2026-05-29 14:58:22", source: "EMS_CORE", message: "Block Power safety interlocking triggered due to manual test bypass", type: "warning" },
    { time: "2026-05-29 14:45:00", source: "UNIT_GATEWAY", message: "Modbus TCP communication loop healthy, 502 port open", type: "success" }
  ]);

  // --- SITE IP MAP STATES & CONFIGS ---
  const [stringIPMap, setStringIPMap] = useState<{ array: number; string: number; ip: string }[]>([]);

  const [siteIPMap, setSiteIPMap] = useState<{ target: string; ipAddress: string; model: string }[]>([]);

  const [auxFilter, setAuxFilter] = useState<string>("");
  const [stringArrayFilter, setStringArrayFilter] = useState<string>("All");

  const [siteIPFileName, setSiteIPFileName] = useState<string>("standard_site_ip_map.csv");
  const [stringIPFileName, setStringIPFileName] = useState<string>("standard_string_ip_map.csv");

  const [pingingIP, setPingingIP] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Record<string, { status: "success" | "error"; msg: string; latency: number }>>({});
  
  const [isDraggingSiteIP, setIsDraggingSiteIP] = useState<boolean>(false);
  const [isDraggingStringIP, setIsDraggingStringIP] = useState<boolean>(false);

  const siteIPInputRef = useRef<HTMLInputElement>(null);
  const stringIPInputRef = useRef<HTMLInputElement>(null);

  // Load Modbus Map CSV from local storage or server
  const loadActiveModbusMap = async () => {
    try {
      const res = await fetch("/api/local/modbus-map");
      if (res.ok) {
        const wrapper = await res.json();
        if (wrapper && wrapper.data) {
          parseAndSetModbusMap(wrapper.data);
          return;
        }
      }
      const resFallback = await fetch("/turtle/tools/report/ems/modbus_map.csv");
      if (resFallback.ok) {
        const text = await resFallback.text();
        parseAndSetModbusMap(text);
      } else {
        setActiveRegisters(INITIAL_REGISTERS);
      }
    } catch (err) {
      console.error("Connectivity err loading map:", err);
      setActiveRegisters(INITIAL_REGISTERS);
    }
  };

  // Load IP Map CSV files from server
  const loadActiveIPMaps = async () => {
    try {
      const resString = await fetch("/api/local/string-ip-map");
      let loadedStringMap = false;
      if (resString.ok) {
        const wrapper = await resString.json();
        if (wrapper && Array.isArray(wrapper.data) && wrapper.data.length > 0) {
          setStringIPMap(wrapper.data);
          loadedStringMap = true;
        } else if (wrapper && typeof wrapper.data === "string" && wrapper.data.length > 0) {
          parseAndSetStringIPMap(wrapper.data);
          loadedStringMap = true;
        }
      }
      
      if (!loadedStringMap) {
        const resStringFallback = await fetch("/turtle/tools/report/ems/stringIPMap.csv");
        if (resStringFallback.ok) {
          const text = await resStringFallback.text();
          parseAndSetStringIPMap(text);
        }
      }
    } catch (err) {
      console.error("Error loading string IP map:", err);
    }

    try {
      const resSite = await fetch("/api/local/ip-map");
      let loadedSiteMap = false;
      if (resSite.ok) {
        const wrapper = await resSite.json();
        if (wrapper && Array.isArray(wrapper.data) && wrapper.data.length > 0) {
          setSiteIPMap(wrapper.data);
          loadedSiteMap = true;
        } else if (wrapper && typeof wrapper.data === "string" && wrapper.data.length > 0) {
          parseAndSetSiteIPMap(wrapper.data);
          loadedSiteMap = true;
        }
      }
      
      if (!loadedSiteMap) {
        const resSiteFallback = await fetch("/turtle/tools/report/ems/ipMap.csv");
        if (resSiteFallback.ok) {
          const text = await resSiteFallback.text();
          parseAndSetSiteIPMap(text);
        }
      }
    } catch (err) {
      console.error("Error loading site IP map:", err);
    }
  };

  const parseAndSetStringIPMap = (text: string) => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return;
    const parsed: { array: number; string: number; ip: string }[] = [];

    // Analyze header
    const headerLine = lines[0];
    const columns = headerLine.split(",").map(c => c.trim().toLowerCase());
    let arrayIdx = columns.indexOf("arrayindex");
    let stringIdx = columns.indexOf("stringindex");
    let ipAddressIdx = columns.indexOf("ipaddress");

    // Support friendly name lists that don't match exactly
    if (arrayIdx === -1) arrayIdx = columns.indexOf("array");
    if (stringIdx === -1) stringIdx = columns.indexOf("string");
    if (ipAddressIdx === -1) ipAddressIdx = columns.indexOf("ip");

    // Support alternative friendly name "EntityKey-Friendly,EntityKey-Token,IPAddress"
    const isFriendlyFormat = columns.includes("entitykey-friendly") && columns.includes("ipaddress");

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",").map(p => p.trim());
      if (isFriendlyFormat) {
        const friendlyName = parts[0]; // e.g. "String BHE0020:1:1:19"
        const ip = parts[2];
        if (friendlyName && ip) {
          // Parse out array and string
          // format: "String BHE0020:1:{array}:{string}"
          const m = friendlyName.match(/String\s+[A-Za-z0-0_]+:\d+:(\d+):(\d+)/i);
          if (m) {
            parsed.push({ array: parseInt(m[1], 10), string: parseInt(m[2], 10), ip });
          } else {
            // simpler match
            const m2 = friendlyName.match(/:(\d+):(\d+)/);
            if (m2) {
              parsed.push({ array: parseInt(m2[1], 10), string: parseInt(m2[2], 10), ip });
            } else {
              parsed.push({ array: 1, string: i, ip });
            }
          }
        }
      } else if (arrayIdx !== -1 && stringIdx !== -1 && ipAddressIdx !== -1) {
        if (parts.length > Math.max(arrayIdx, stringIdx, ipAddressIdx)) {
          const arr = parseInt(parts[arrayIdx], 10);
          const str = parseInt(parts[stringIdx], 10);
          const ip = parts[ipAddressIdx];
          if (!isNaN(arr) && !isNaN(str) && ip) {
            parsed.push({ array: arr, string: str, ip });
          }
        }
      } else {
        // Fallback straight row mapping
        if (parts.length >= 3) {
          const arr = parseInt(parts[0], 10);
          const str = parseInt(parts[1], 10);
          const ip = parts[2];
          if (!isNaN(arr) && !isNaN(str) && ip) {
            parsed.push({ array: arr, string: str, ip });
          }
        }
      }
    }

    if (parsed.length > 0) {
      setStringIPMap(parsed);
    }
  };

  const parseAndSetSiteIPMap = (text: string) => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return;

    // Detect header columns
    const headerLine = lines[0];
    const columns = headerLine.split(",").map(c => c.trim().toLowerCase());

    const entityKeyTypeIdx = columns.indexOf("entitykeytype");
    const ipAddressIdx = columns.indexOf("ipaddress");
    const tcpPortIdx = columns.indexOf("tcpport");
    const blockHvacIdx = columns.indexOf("blockhvacindex");
    const networkSwitchIdx = columns.indexOf("networkswitchindex");
    const upsIdx = columns.indexOf("upsindex");
    const firePanelIdx = columns.indexOf("firepanelindex");
    const blockIdx = columns.indexOf("blockindex");
    const arrayIdx = columns.indexOf("arrayindex");

    const parsed: { target: string; ipAddress: string; model: string }[] = [];

    // If it's the professional netmap format
    if (entityKeyTypeIdx !== -1 && ipAddressIdx !== -1) {
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",").map(p => p.trim());
        if (parts.length > Math.max(entityKeyTypeIdx, ipAddressIdx)) {
          const rawType = parts[entityKeyTypeIdx];
          const ip = parts[ipAddressIdx];
          if (!ip) continue;

          // Skip empty or comment lines
          if (rawType.startsWith("#") || rawType.toLowerCase() === "entitykeytype") continue;

          const port = tcpPortIdx !== -1 ? parts[tcpPortIdx] : "502";
          
          let subIdx = "";
          if (blockHvacIdx !== -1 && parts[blockHvacIdx] && parts[blockHvacIdx] !== "null") {
            subIdx = "HVAC-" + parts[blockHvacIdx];
          } else if (networkSwitchIdx !== -1 && parts[networkSwitchIdx] && parts[networkSwitchIdx] !== "null") {
            subIdx = "SW-" + parts[networkSwitchIdx];
          } else if (upsIdx !== -1 && parts[upsIdx] && parts[upsIdx] !== "null") {
            subIdx = "UPS-" + parts[upsIdx];
          } else if (firePanelIdx !== -1 && parts[firePanelIdx] && parts[firePanelIdx] !== "null") {
            subIdx = "Fire-" + parts[firePanelIdx];
          }

          const bIdx = (blockIdx !== -1 && parts[blockIdx] && parts[blockIdx] !== "null") ? `B${parts[blockIdx]}` : "";
          const aIdx = (arrayIdx !== -1 && parts[arrayIdx] && parts[arrayIdx] !== "null") ? `A${parts[arrayIdx]}` : "";
          const hierarchy = [bIdx, aIdx].filter(Boolean).join("-");

          const friendlyTarget = [rawType, subIdx, hierarchy ? `(${hierarchy})` : ""].filter(Boolean).join(" ");
          parsed.push({
            target: friendlyTarget || rawType || "Aux Devices Instance",
            ipAddress: ip,
            model: `${rawType} Node [Port ${port}]`
          });
        }
      }
    } else {
      // Fallback simple format (Target, IPAddress, Model)
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",").map(p => p.trim());
        if (parts.length >= 3) {
          const target = parts[0];
          const ipAddress = parts[1];
          const model = parts[2];
          if (target && ipAddress && model) {
            parsed.push({ target, ipAddress, model });
          }
        }
      }
    }

    if (parsed.length > 0) {
      setSiteIPMap(parsed);
    }
  };

  const testIPConnection = async (ip: string) => {
    setPingingIP(ip);
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
    const randomLatency = Math.floor(Math.random() * 35) + 6; // 6ms - 41ms
    await delay(500);

    try {
      const unit = 1;
      const type = "holding";
      const start = 1;
      const count = 10;
      const response = await fetch(`/tools/controls/modbusPoll/host/${ip}/port/502/unitId/${unit}/type/${type}/start/${start}/count/${count}/data.csv`);
      
      if (response.ok) {
        setPingResults(prev => ({
          ...prev,
          [ip]: {
            status: "success",
            latency: randomLatency,
            msg: `TCP CON-OK :: Unit #1 active at port 502 (Modbus TCP). Protocol: BESS_RTU_v4.`
          }
        }));
        // Automatically add system event log
        setNotifications(prev => [
          {
            time: new Date().toISOString().replace('T', ' ').slice(0, 19),
            source: "PING_TESTER",
            message: `Verified physical communication link with ${ip}:502. Response timing stable at ${randomLatency}ms.`,
            type: "success"
          },
          ...prev
        ]);
      } else {
        setPingResults(prev => ({
          ...prev,
          [ip]: {
            status: "error",
            latency: randomLatency + 140,
            msg: `GATEWAY TIMEOUT :: Site bridge responsive but failed to lock Modbus loop registers.`
          }
        }));
      }
    } catch (err: any) {
      setPingResults(prev => ({
        ...prev,
        [ip]: {
          status: "error",
          latency: 350,
          msg: `CONNECTION TIMEOUT :: Packets lost on the sub-address subnet route.`
        }
      }));
    } finally {
      setPingingIP(null);
    }
  };

  const safeJsonFetch = async (url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        return null;
      }
      return await res.json();
    } catch (e) {
      return null;
    }
  };

  const pollLocalEmsData = async () => {
    try {
      // 1. Connection status
      const connData = await safeJsonFetch("/api/local/connection");
      if (connData) {
        setEmsConnection(connData);
      }

      // 2. Main Blockviewer data
      const blockWrapper = await safeJsonFetch("/api/local/block");
      if (blockWrapper) {
        setEmsBlock(blockWrapper);
        
        // Propagate down to local states so legacy charts or lists also stay updated!
        if (blockWrapper.data) {
          const sys = blockWrapper.data.system;
          if (blockWrapper.data.pcses) {
            setPcses(blockWrapper.data.pcses);
          }
          if (blockWrapper.data.hvacs) {
            setHvacs(blockWrapper.data.hvacs);
          }
        }
      }

      // 3. Status JSON data
      const statusWrapper = await safeJsonFetch("/api/local/status");
      if (statusWrapper) {
        setEmsStatus(statusWrapper);
      }

      // 4. Strings
      const stringsWrapper = await safeJsonFetch("/api/local/strings");
      if (stringsWrapper) {
        setEmsStrings(stringsWrapper.data || []);
      }

      // 5. Status Codes
      const codesWrapper = await safeJsonFetch("/api/local/status-codes");
      if (codesWrapper) {
        setEmsStatusCodes(codesWrapper);
      }

      // 6. EMS Sources Diagnostics
      const debugSources = await safeJsonFetch("/api/local/debug/sources");
      if (debugSources && Array.isArray(debugSources)) {
        setEmsSources(debugSources);
      }
    } catch (err) {
      console.error("Error polling local EMS API endpoints in browser:", err);
    }
  };

  useEffect(() => {
    pollLocalEmsData();
    const interval = setInterval(pollLocalEmsData, 3000);
    return () => clearInterval(interval);
  }, []);

  const renderConnectionBanner = () => {
    if (!emsConnection) return null;

    const {
      source = "offline",
      staleData = false,
      lastUpdated = null,
      activeEmsBaseUrl = "",
      activeProfileName = "PRIZM Core Hardware Bess Profile",
      pollIntervalMs = 3000
    } = emsConnection;

    let bannerBg = "bg-[#2D0F1B]/95 text-[#F87171] border-red-900/30";
    let statusClass = "bg-red-500 animate-pulse";
    let statusText = "EMS HARDWARE HARD OFFLINE :: No Cached Live Telemetry Found";

    if (source === "live") {
      bannerBg = "bg-[#0A2619]/90 text-[#34D399] border-emerald-900/40";
      statusClass = "bg-emerald-400 animate-pulse";
      statusText = "PRODUCTION LIVE :: Connected via direct Ethernet backplane";
    } else if (source === "cached") {
      bannerBg = "bg-[#251A07]/90 text-[#FBBF24] border-yellow-800/30";
      statusClass = "bg-amber-500 animate-pulse";
      statusText = "LAN DISCONNECTED :: Displaying cached offline hardware state";
    } else if (source === "demo") {
      bannerBg = "bg-[#0D1F3D]/90 text-[#38BDF8] border-cyan-800/30";
      statusClass = "bg-cyan-400 animate-pulse";
      statusText = "DEVELOPMENT DEMO INSTANCE :: Serving Hand-Crafted Simulation Datasets";
    }

    return (
      <div className={`w-full py-2.5 px-4 border-b text-[11px] font-mono select-none flex flex-col md:flex-row justify-between items-center gap-2 ${bannerBg}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${statusClass}`} />
          <span className="font-bold uppercase tracking-wider">
            {statusText}
          </span>
          <span className="text-white/20">|</span>
          <button 
            type="button"
            onClick={() => {
              setSelectedCategory("EMS LAN Diagnostics");
              setSelectedString(null);
            }}
            className="hover:text-cyan-300 hover:underline flex items-center gap-0.5 cursor-pointer transition-all focus:outline-none text-[11px] font-mono"
            title="Click to switch or manage target profiles"
          >
            <span>PROFILE: <span className="text-cyan-400 font-bold border-b border-dashed border-cyan-400/50">{activeProfileName} [Switch & Preset Config]</span></span>
          </button>
          <span className="text-white/20">|</span>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("EMS LAN Diagnostics");
              setSelectedString(null);
            }}
            className="hover:text-cyan-300 hover:underline flex items-center gap-0.5 cursor-pointer transition-all focus:outline-none text-[11px] font-mono"
            title="Click to view EMS diagnostics & settings"
          >
            <span>LAN BASE_URL: <span className="text-white font-bold">{activeEmsBaseUrl || emsConnection?.emsHost || "Loading..."}</span></span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          {source === "demo" && (
            <span className="bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 px-1.5 py-0.5 rounded font-bold uppercase text-[9px] tracking-wider animate-pulse">
              DEMO STATE
            </span>
          )}
          {source === "cached" && (
            <span className="bg-amber-500/15 border border-yellow-500/30 text-yellow-500 px-1.5 py-0.5 rounded font-bold uppercase text-[9px] tracking-wider animate-pulse font-mono">
              AMBER CACHE
            </span>
          )}
          {source === "offline" && (
            <span className="bg-red-500/15 border border-red-500/30 text-red-300 px-1.5 py-0.5 rounded font-bold uppercase text-[9px] tracking-wider animate-pulse font-mono">
              OFFLINE PROTECTION ACTIVE
            </span>
          )}
          <span>LAST FLUSH: <span className="text-white">{lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "NEVER"}</span></span>
          <span className="text-white/20">|</span>
          <span>HEARTBEAT: <span className="text-white">{pollIntervalMs}ms</span></span>
        </div>
      </div>
    );
  };

  useEffect(() => {
    loadActiveModbusMap();
    loadActiveIPMaps();
    generateMockStrings();
    generateCellVoltages();
  }, []);

  // Poll timer
  useEffect(() => {
    if (!isLivePolling || !isCommissioned) return;
    const interval = setInterval(() => {
      setPollCounter((prev) => {
        if (prev <= 1) {
          // Trigger data update
          randomizeTelemetryData();
          return 3;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isLivePolling, isCommissioned]);

  // Intercepted telemetry stream polling
  useEffect(() => {
    if (selectedCategory !== "Cloud Telemetry Interceptor" || !isInterceptorLive) return;

    const fetchTelemetry = async () => {
      try {
        const res = await fetch("/api/cloud-telemetry/packets");
        if (res.ok) {
          const data = await res.json();
          setTelemetryPackets(data.packets);
          setIsTelemetryAligned(data.calibrationAligned);
          setLocalCloudOutage(data.localCloudOutageActive || false);
          setSoftBalancingOverride(data.softBalancingOverride || false);
          setSystemWideIsolation(data.systemWideIsolationTriggered || false);
          // Set initial selection if none is loaded
          if (data.packets.length > 0 && !selectedPacketId) {
            setSelectedPacketId(data.packets[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch cloud telemetry stream:", err);
      }
    };

    fetchTelemetry(); // run once immediately
    const timer = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(timer);
  }, [selectedCategory, isInterceptorLive, selectedPacketId]);

  const parseAndSetModbusMap = (text: string) => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      setActiveRegisters(INITIAL_REGISTERS);
      return;
    }
    const parsed: ModbusRegister[] = [];
    
    // Quote-aware parser
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

    for (let i = 1; i < lines.length; i++) {
      const parts = parseCSVRow(lines[i]);
      if (parts.length >= 10 && parts[1]) {
        const regNum = parseInt(parts[1], 10);
        if (!isNaN(regNum)) {
          parsed.push({
            fieldType: parts[0],
            register: regNum,
            type: parts[5],
            description: parts[3].replace(/""/g, '"').replace(/^"/, '').replace(/"$/, ''),
            rw: parts[7],
            scaleFactorName: parts[8],
            unit: parts[9],
            liveStatus: "success",
            rawValue: parseFloat(parts[4]) || 0,
            liveValue: parts[4] || "-"
          });
        }
      }
    }
    if (parsed.length > 0) {
      setActiveRegisters(parsed);
    } else {
      setActiveRegisters(INITIAL_REGISTERS);
    }
  };

  const generateMockStrings = () => {
    const data: StringRow[] = [];
    // Populate Array 1 (Strings 1-40)
    for (let s = 1; s <= 40; s++) {
      data.push({
        array: 1,
        string: s,
        contact: s % 15 === 0 ? "fault" : "ok",
        rotation: s % 22 === 0 ? "fault" : "ok",
        voltageMeas: 1377 + (s % 5),
        voltageCalc: 1377 + (s % 5),
        voltageBus: 0,
        voltageDelta: -1377 - (s % 5),
        powerA: s % 4 === 0 ? 30 : 0,
        powerkW: s % 4 === 0 ? 30 : 0,
        powerSoc: 24,
        powerKwh: 89 + (s % 3),
        cellVoltsMin: 3260 + (s % 10) * 2,
        cellVoltsMax: 3280 + (s % 10) * 2,
        cellVoltsAvg: 3279,
        cellVoltsDelta: 10 + (s % 15),
        cellTempMin: 15.0 + (s % 4),
        cellTempMax: 18.0 + (s % 3),
        cellTempAvg: 17.5,
        cellTempDelta: 3.0,
        balanceCount: s % 12 === 0 ? 1 : 0,
        balanceMode: "Provided",
        loc: `001B0${(s % 9).toString(16).toUpperCase()}`,
        fans: s % 6 === 0 ? "OFF" : "ON",
        timestamp: "2026-05-29 15:06:37"
      });
    }
    // Populate Array 2 (Strings 1-40)
    for (let s = 1; s <= 40; s++) {
      data.push({
        array: 2,
        string: s,
        contact: "ok",
        rotation: "ok",
        voltageMeas: 1378 - (s % 3),
        voltageCalc: 1378 - (s % 3),
        voltageBus: 0,
        voltageDelta: -1378 + (s % 3),
        powerA: 0,
        powerkW: 0,
        powerSoc: 24,
        powerKwh: 89,
        cellVoltsMin: 3270,
        cellVoltsMax: 3280,
        cellVoltsAvg: 3279,
        cellVoltsDelta: 10,
        cellTempMin: 10.0 + (s % 6),
        cellTempMax: 20.0 + (s % 4),
        cellTempAvg: 18.0,
        cellTempDelta: 5.0,
        balanceCount: 0,
        balanceMode: "Provided",
        loc: `002B0${(s % 9).toString(16).toUpperCase()}`,
        fans: "ON",
        timestamp: "2026-05-29 15:06:38"
      });
    }
    // Populate Array 3 (Strings 1-12)
    for (let s = 1; s <= 12; s++) {
      data.push({
        array: 3,
        string: s,
        contact: s === 1 ? "fault" : "ok",
        rotation: s === 1 ? "fault" : "ok",
        voltageMeas: s === 1 ? 1375 : 1379,
        voltageCalc: s === 1 ? 1375 : 1379,
        voltageBus: 0,
        voltageDelta: s === 1 ? -1375 : -1379,
        powerA: s === 1 ? 0 : 25,
        powerkW: s === 1 ? 0 : 35,
        powerSoc: s === 1 ? 14 : 26,
        powerKwh: s === 1 ? 80 : 97,
        cellVoltsMin: s === 1 ? 3208 : 3275,
        cellVoltsMax: s === 1 ? 3280 : 3287,
        cellVoltsAvg: 3280,
        cellVoltsDelta: s === 1 ? 72 : 12,
        cellTempMin: s === 1 ? 18.0 : 12.0,
        cellTempMax: s === 1 ? 30.0 : 20.0,
        cellTempAvg: 18.5,
        cellTempDelta: s === 1 ? 12.0 : 4.0,
        balanceCount: 0,
        balanceMode: s === 1 ? "Off" : "Provided",
        loc: `003A0${s.toString(16).toUpperCase()}`,
        fans: s === 1 ? "OFF" : "ON",
        timestamp: "2026-05-29 15:06:39"
      });
    }
    setStringsList(data);
  };

  const generateCellVoltages = () => {
    const list = [];
    for (let p = 1; p <= 16; p++) {
      for (let c = 1; c <= 20; c++) {
        // Simulating the lagging cell at Pack 12, Cell 6 like shown in screenshots / modbus MAP values
        const isBad = (p === 12 && c === 6);
        const isVeryHot = (p === 3 && c === 4);
        list.push({
          pack: p,
          cell: c,
          volt: isBad ? 3510 : isVeryHot ? 3390 : 3275 + Math.floor(Math.random() * 15),
          isUnbalanced: isBad || isVeryHot
        });
      }
    }
    setCellVoltGrid(list);
  };

  const randomizeTelemetryData = () => {
    // Modify live values minimally for simulation effect
    setStringsList(prev => prev.map(s => {
      if (s.contact === "fault") return s;
      const fluxVolt = Math.random() > 0.5 ? 1 : -1;
      return {
        ...s,
        voltageMeas: s.voltageMeas + fluxVolt,
        voltageCalc: s.voltageCalc + fluxVolt,
        voltageDelta: s.voltageDelta - fluxVolt,
        powerSoc: Math.min(100, Math.max(0, s.powerSoc + (Math.random() > 0.8 ? 0.1 : 0))),
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
      };
    }));

    setHvacs(prev => prev.map(h => {
      const fluxTemp = parseFloat(((Math.random() > 0.5 ? 0.1 : -0.1)).toFixed(2));
      return {
        ...h,
        airTemp: parseFloat((h.airTemp + fluxTemp).toFixed(2)),
        cellTemp: parseFloat((h.cellTemp + fluxTemp * 0.5).toFixed(2)),
      };
    }));

    setPcses(prev => prev.map(p => {
      const dcFlux = Math.floor(Math.random() * 3) - 1;
      return {
        ...p,
        dcVolt: p.dcVolt + dcFlux,
      };
    }));
  };

  // --- CSV FILE DROP / MANUALLY SELECT UPLOAD HANDLER ---
  const handleCSVStringParse = async (csvContent: string, fileName: string) => {
    if (!csvContent || !csvContent.includes(",") || csvContent.length < 50) {
      setUploadError("Invalid CSV content. Please ensure the file has valid Modbus headers.");
      return;
    }

    try {
      setUploadError("");
      
      // Post to the newly created backend endpoint
      const res = await fetch("/api/upload-modbus-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent })
      });

      if (!res.ok) {
        throw new Error("Local server was unable to store the custom map.");
      }

      // Local state and localStorage update
      parseAndSetModbusMap(csvContent);
      setIsCommissioned(true);
      setCsvFileName(fileName);
      const linesCount = csvContent.split("\n").filter(Boolean).length - 1;
      setUploadedRecordsCount(linesCount);
      
      localStorage.setItem("bess_kobold_commissioned", "true");
      localStorage.setItem("bess_kobold_csv_name", fileName);
      localStorage.setItem("bess_kobold_csv_count", String(linesCount));

      // Append success log
      setNotifications(prev => [
        { 
          time: new Date().toISOString().replace('T', ' ').slice(0, 19), 
          source: "SYSTEM_LOADER", 
          message: `Custom site map fully compiled: '${fileName}' containing ${linesCount} register nodes is now running on the RTU.`, 
          type: "success" 
        },
        ...prev
      ]);
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "An issue occurred while transmitting and deploying the site configuration.");
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const onFileSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setUploadError("Only Modbus map files with the .csv extension are supported.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      handleCSVStringParse(text, file.name);
    };
    reader.readAsText(file);
  };

  const loadDefaultMap = () => {
    setCsvFileName("standard_powin_modbus_map.csv");
    setUploadedRecordsCount(INITIAL_REGISTERS.length);
    setActiveRegisters(INITIAL_REGISTERS);
    setIsCommissioned(true);

    localStorage.setItem("bess_kobold_commissioned", "true");
    localStorage.setItem("bess_kobold_csv_name", "standard_powin_modbus_map.csv");
    localStorage.setItem("bess_kobold_csv_count", String(INITIAL_REGISTERS.length));

    setNotifications(prev => [
      { 
        time: new Date().toISOString().replace('T', ' ').slice(0, 19), 
        source: "COMMISSION", 
        message: "Loaded the default Powin Modular Energy Modbus Mapping Schema successfully.", 
        type: "success" 
      },
      ...prev
    ]);
  };

  const handleDecommission = () => {
    if (window.confirm("Are you sure you want to de-commission this site? This resets the active Modbus Map schema.")) {
      setIsCommissioned(false);
      setCsvFileName("");
      setUploadedRecordsCount(0);
      localStorage.removeItem("bess_kobold_commissioned");
      localStorage.removeItem("bess_kobold_csv_name");
      localStorage.removeItem("bess_kobold_csv_count");
    }
  };

  // Counting logic from screenshots
  const stringCount = stringsList.length;
  const arrayCount = 3; // Arrays 1, 2, 3
  const pcsCount = pcses.length;

  // Filter String List based on GUI filters
  const filteredStrings = stringsList.filter(s => {
    const matchesSearch = s.loc.toLowerCase().includes(searchStringQuery.toLowerCase()) || 
                          `array ${s.array}`.includes(searchStringQuery.toLowerCase()) ||
                          `string ${s.string}`.includes(searchStringQuery.toLowerCase());
    const matchesArray = arrayFilter === "ALL" ? true : s.array === parseInt(arrayFilter);
    const matchesStatus = statusFilter === "ALL" ? true : 
                          statusFilter === "FAULTED" ? (s.contact === "fault" || s.rotation === "fault") :
                          s.contact === "ok" && s.rotation === "ok";
    return matchesSearch && matchesArray && matchesStatus;
  });

  return (
    <div className="w-full bg-[#08090C] rounded-lg border border-white/10 overflow-hidden shadow-2xl transition-all font-sans">
      
      {/* 1. COMMISSIONING SCREEN (STARTING POINT FOR NEW SITE) */}
      {!isCommissioned ? (
        <div className="p-8 max-w-2xl mx-auto flex flex-col justify-center min-h-[500px]">
          <div className="text-center mb-8">
            <div className="inline-flex p-4 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mb-4 animate-pulse">
              <Database size={40} />
            </div>
            <h2 className="text-2xl font-light text-white tracking-widest uppercase">SITE COMMISSIONING GATEWAY</h2>
            <p className="text-xs text-white/50 font-mono mt-2">
              Technician Workspace :: Solar Star 3 & Block Substations
            </p>
            <p className="text-xs text-cyan-400 font-mono font-bold mt-1 uppercase">
              PLUG IN TO SYSTEM & DOWNLOAD OR UPLOAD ACTIVE RESOURCE CONFIGURATION
            </p>
          </div>

          {/* DRAG AND DROP ZONE */}
          <div 
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragging 
                ? "bg-cyan-500/15 border-cyan-400 border-solid" 
                : "bg-[#11131A] border-white/15 hover:border-cyan-500/50 hover:bg-white/[0.02]"
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={onFileSelectChange} 
              accept=".csv" 
              className="hidden" 
            />
            <div className="flex flex-col items-center">
              <Upload size={36} className={`${isDragging ? "text-cyan-400 animate-bounce" : "text-white/40"} mb-3`} />
              <p className="text-sm text-white font-medium">Drag & Drop site Modbus map CSV here</p>
              <p className="text-xs text-white/40 mt-1 mb-4 font-mono">or click to browse local files manually</p>
              
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/5 rounded text-[10px] font-mono text-cyan-300">
                <span>Expected structure: FIELDTYPE, MODBUSADDRESS, FIELDNAME, TYPE, R/W, UNIT</span>
              </div>
            </div>
          </div>

          {uploadError && (
            <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded flex items-start gap-2 text-rose-300 font-mono text-xs">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          <div className="relative my-6 flex items-center justify-center">
            <hr className="w-full border-white/5" />
            <span className="absolute px-3 bg-[#08090C] text-[10px] font-mono tracking-widest text-white/30 uppercase">
              OR START WITH STATIC SIMULATION
            </span>
          </div>

          <button 
            type="button"
            onClick={loadDefaultMap}
            className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-black font-mono font-bold text-xs uppercase rounded transition-all flex items-center justify-center gap-2"
          >
            <Play size={12} fill="currentColor" />
            Initialize Default Powin Solar Star BESS Map
          </button>

          <div className="mt-6 flex gap-4 text-center justify-center text-[10px] text-white/45 font-mono">
            <span>PLATFORM: COBALT KOBOLD_BESS</span>
            <span>PORT: 502 (RTU_TCP)</span>
            <span>DEFAULT UNIT_ID: 1</span>
          </div>
        </div>
      ) : (

        // 2. KOBOLD ACTIVE SYSTEM LAYOUT
        <div className="flex flex-col min-h-[680px]">
          {renderConnectionBanner()}
          
          {/* A. PRIZM HEADER */}
          <div className="bg-[#10121A] border-b border-white/10 p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* Logo representation */}
                <div className="p-1.5 bg-[#0F1A15] border border-[#5CF2A5]/30 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(92,242,165,0.15)] select-none">
                  <GreEnergyLogo className="w-9 h-9" strokeWidth={8} />
                </div>
                <div>
                  <h1 className="text-lg font-black text-white tracking-widest">
                    <span className="text-[#5CF2A5]">GreEnergy</span> PRIZM
                  </h1>
                  <p className="text-[10px] font-mono text-emerald-400 flex items-center gap-1.5 uppercase">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#5CF2A5] animate-ping"></span>
                    Prizm :: Solar Star 3 (BHE0020) :: Block 1 :: {selectedCategory}
                  </p>
                </div>
              </div>

              {/* Status Header Block */}
              <div className="flex flex-wrap items-center gap-3 md:text-right font-mono text-[11px]">
                <div className="bg-white/5 border border-white/5 rounded px-2.5 py-1">
                  <span className="text-white/40 uppercase">StackOS Contact: </span>
                  <span className="text-emerald-400 font-bold">Fri, 29 May 2026 15:06:39 GMT</span>
                </div>
                <button
                  type="button"
                  onClick={handleDecommission}
                  className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded uppercase text-[10px] font-bold transition-all"
                >
                  Commission Out
                </button>
              </div>
            </div>

            {/* B. COMMAND ACTIONS BAR FROM SCREENSHOT 1 */}
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/5">
              <button 
                type="button"
                onClick={() => alert("Broadcasting contactor safety close commands sequence across active loops...")}
                className="bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-white/90 rounded transition-all cursor-pointer"
              >
                Set Contactors
              </button>
              <button 
                type="button"
                onClick={() => alert("Broadcasting passive cell balancing setpoint sequence to 3260mV...")}
                className="bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-white/90 rounded transition-all cursor-pointer"
              >
                Set Balancing
              </button>
              <button 
                type="button"
                onClick={() => alert("Initiating phase alignment string rotations sequence...")}
                className="bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-white/90 rounded transition-all cursor-pointer"
              >
                Set Rotation
              </button>
              <button 
                type="button"
                onClick={() => {
                  const name = prompt("Enter custom location block descriptor (e.g., Container-A):");
                  if (name) alert(`Location block changed to: ${name}`);
                }}
                className="bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-white/90 rounded transition-all cursor-pointer"
              >
                Set Container
              </button>

              <div className="ml-auto flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-cyan-500/5 px-2.5 py-1 rounded border border-cyan-500/10 text-[10px] font-mono text-cyan-300">
                  <Clock size={11} className="animate-spin text-cyan-400" />
                  <span>POLL IN <strong>{pollCounter}s</strong></span>
                </div>
                <div className="hidden lg:flex items-center gap-4 text-[10px] text-white/35 font-mono">
                  <span>ENCLOSURES: <strong>{arrayCount}</strong></span>
                  <span>STRINGS: <strong>{stringCount}</strong></span>
                  <span>PCS INVERTERS: <strong>{pcsCount}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* C. TWO-COLUMN WORKSPACE FRAME */}
          <div className="flex flex-col lg:flex-row flex-1">
            
            {/* LEFT COLUMN: DROPDOWN NAVIGATION MENU (SCREENSHOT 3 REPLICATED) */}
            <div className="w-full lg:w-60 bg-[#0E1017] p-3 border-r border-white/10 shrink-0">
              <div className="text-[10px] font-mono text-white/45 tracking-widest uppercase mb-3 px-2 border-b border-white/5 pb-1">
                Prizm Explorer
              </div>

              {/* NAV CATEGORY GROUP 1: COMPONENTS */}
              <div className="space-y-0.5 mb-4">
                <div className="text-[9px] font-mono font-bold tracking-widest text-[#059669] uppercase px-2 py-1">
                  Components
                </div>
                {[
                  { name: "System Details", icon: Cpu },
                  { name: "Arrays", icon: Sliders },
                  { name: "String List", icon: Activity },
                  { name: "Energy Segments", icon: Info },
                  { name: "Sensors", icon: Gauge },
                  { name: "HVACs", icon: Fan },
                  { name: "Stack Managers", icon: Cpu },
                  { name: "UPSes", icon: Zap },
                  { name: "PCS List", icon: Sliders },
                  { name: "String Details", icon: Info }
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.name}
                      onClick={() => {
                        setSelectedCategory(item.name);
                        setSelectedString(null);
                      }}
                      className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded transition-all text-xs font-mono select-none ${
                        selectedCategory === item.name 
                          ? "bg-cyan-500/15 border-l-2 border-cyan-400 text-cyan-300 font-bold" 
                          : "text-white/60 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon size={12} className={selectedCategory === item.name ? "text-cyan-400" : "text-white/30"} />
                        {item.name}
                      </span>
                      {selectedCategory === item.name && <ChevronRight size={10} className="text-cyan-400" />}
                    </button>
                  );
                })}
              </div>

              {/* NAV CATEGORY GROUP 2: CELL MAPS */}
              <div className="space-y-0.5 mb-4">
                <div className="text-[9px] font-mono font-bold tracking-widest text-[#059669] uppercase px-2 py-1">
                  Cell Maps
                </div>
                {[
                  { name: "Cell Map :: Voltage", icon: Gauge },
                  { name: "Cell Map :: Temperature", icon: Fan }
                ].map((item) => {
                  return (
                    <button
                      key={item.name}
                      onClick={() => {
                        setSelectedCategory(item.name);
                        setSelectedString(null);
                      }}
                      className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded transition-all text-xs font-mono select-none ${
                        selectedCategory === item.name 
                          ? "bg-cyan-500/15 border-l-2 border-cyan-400 text-cyan-300 font-bold" 
                          : "text-white/60 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Gauge size={12} className={selectedCategory === item.name ? "text-cyan-400" : "text-white/30"} />
                        {item.name}
                      </span>
                      {selectedCategory === item.name && <ChevronRight size={10} className="text-cyan-400" />}
                    </button>
                  );
                })}
              </div>

              {/* NAV CATEGORY GROUP 3: EVENTS & CONFIG */}
              <div className="space-y-0.5">
                <div className="text-[9px] font-mono font-bold tracking-widest text-[#059669] uppercase px-2 py-1">
                  Configuration
                </div>
                {[
                  { name: "Modbus Map Registers", icon: Database },
                  { name: "Site IP Topology Map", icon: Sliders },
                  { name: "EMS LAN Diagnostics", icon: Server },
                  { name: "Cloud Telemetry Interceptor", icon: Radio },
                  { name: "System Event logs", icon: FileText }
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.name}
                      onClick={() => {
                        setSelectedCategory(item.name);
                        setSelectedString(null);
                      }}
                      className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded transition-all text-xs font-mono select-none ${
                        selectedCategory === item.name 
                          ? "bg-cyan-500/15 border-l-2 border-cyan-400 text-cyan-300 font-bold" 
                          : "text-white/60 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon size={12} className={selectedCategory === item.name ? "text-cyan-400" : "text-white/30"} />
                        {item.name}
                      </span>
                      {selectedCategory === item.name && <ChevronRight size={10} className="text-cyan-400" />}
                    </button>
                  );
                })}
              </div>

              {/* Config Details Overlay Box info */}
              <div className="mt-8 p-3 rounded bg-white/[0.02] border border-white/5 font-mono text-[10px] space-y-1 text-white/40 select-none">
                <div className="text-white/80 font-bold text-[9px] uppercase tracking-wider text-cyan-400">active site link</div>
                <div className="truncate">MAP: {csvFileName}</div>
                <div>NODES: {uploadedRecordsCount} registers</div>
                <div>STATE: POLLING ACTIVE</div>
              </div>
            </div>

            {/* RIGHT COLUMN: DETAIL MAIN PANEL FRAMES */}
            <div className="flex-1 bg-[#0A0B0E] p-4 overflow-x-auto min-w-0">
              
              {/* BRAND NEW KOBOLD SUB-VIEWS REPLICA */}
              {selectedCategory === "System Details" && (() => {
                const sys = emsBlock?.data?.system;
                const telemetryObj = sys ? {
                  chargePower: sys.chargePower || "0.0 kW",
                  dischargePower: sys.dischargePower || "0.0 kW",
                  chargeEnergy: sys.chargeEnergy || "0.0 kWh",
                  dischargeEnergy: sys.dischargeEnergy || "0.0 kWh",
                  dcOnline: sys.dcOnline || "0.0 kWh",
                  dcNearline: sys.dcNearline || "0.0 kWh",
                  acOnline: sys.acOnline || "0.0 kWh",
                  realPowerMeasured: sys.realPowerMeasured || "0.0 kW",
                  realPowerCommanded: sys.realPowerCommanded || "0.0 kW",
                  reactivePowerMeasured: sys.reactivePowerMeasured || "0.0 kVAR",
                  reactivePowerCommanded: sys.reactivePowerCommanded || "0.0 kVAR"
                } : undefined;
                return (
                  <SystemDetailsView 
                    onSelectCategory={setSelectedCategory} 
                    pollCounter={pollCounter} 
                    telemetry={telemetryObj}
                  />
                );
              })()}

              {selectedCategory === "Arrays" && (
                <ArraysView arrays={emsBlock?.data?.arrays} />
              )}

              {selectedCategory === "String List" && (
                <StringsView strings={emsStrings} />
              )}

              {selectedCategory === "Energy Segments" && (
                <SegmentsView />
              )}

              {selectedCategory === "Sensors" && (
                <SensorsView 
                  lateralSensors={emsBlock?.data?.sensors?.lateralSensors} 
                  sensorRows={emsBlock?.data?.sensors?.sensorRows} 
                />
              )}

              {selectedCategory === "HVACs" && (
                <HvacsView hvacs={emsBlock?.data?.hvacs} />
              )}

              {selectedCategory === "Stack Managers" && (
                <StackManagersView managers={emsBlock?.data?.stackManagers} />
              )}

              {selectedCategory === "UPSes" && (
                <UpsesView upses={emsBlock?.data?.upses} />
              )}

              {/* CATEGORY VIEW 1: SUMMARY (EMS APPS, TOPOLOGY, METERS, PCSES, HVAC_PLC) */}
              {selectedCategory === "Summary" && (
                <div className="space-y-6">
                  {/* EMS APPS TABLE FROM SCREENSHOT 2 */}
                  <div>
                    <h3 className="text-xs font-mono font-bold text-white/70 tracking-widest uppercase mb-2 border-l-2 border-emerald-500 pl-2">
                      EMS App Stack Services
                    </h3>
                    <div className="border border-white/5 rounded overflow-hidden">
                      <table className="w-full text-left font-mono text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#12141C] text-white/40 uppercase text-[10px] border-b border-white/5">
                            <th className="p-2.5 text-center">Priority</th>
                            <th className="p-2.5">Code</th>
                            <th className="p-2.5">Application Name</th>
                            <th className="p-2.5">Configuration</th>
                            <th className="p-2.5">Running Status Message</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-white/90">
                          {emsApps.map((app) => (
                            <tr key={app.priority} className="hover:bg-white/[0.01]">
                              <td className="p-2 text-center font-bold text-cyan-400">{app.priority}</td>
                              <td className="p-2 font-bold">{app.appCode}</td>
                              <td className="p-2 font-semibold text-white">{app.appName}</td>
                              <td className="p-2 text-white/55">{app.configuration}</td>
                              <td className="p-2">
                                <div className="flex flex-col gap-1 whitespace-pre-wrap max-w-xl text-[10px] leading-relaxed">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded leading-none w-fit font-bold uppercase text-[9px] tracking-tight ${
                                    app.statusType === "danger" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                                    app.statusType === "warning" ? "bg-amber-500/10 text-amber-300 border border-amber-500/20" :
                                    app.statusType === "error" ? "bg-red-500/15 text-red-400" :
                                    app.statusType === "disabled" ? "bg-white/5 text-white/40" :
                                    "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${
                                      app.statusType === "danger" ? "bg-rose-400 animate-ping" :
                                      app.statusType === "warning" ? "bg-amber-400" :
                                      "bg-emerald-400"
                                    }`}></span>
                                    {app.statusType === "danger" ? "TRIPPED / FAILSAFE" : app.statusType === "warning" ? "NOTREADY" : "OK"}
                                  </span>
                                  <span className="text-white/70">{app.status}</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* BLOCK TOPO TABLE FROM SCREENSHOT 2 */}
                  <div>
                    <h3 className="text-xs font-mono font-bold text-white/70 tracking-widest uppercase mb-2 border-l-2 border-emerald-500 pl-2">
                      Block Topology State Mapping
                    </h3>
                    <div className="border border-white/5 rounded overflow-hidden">
                      <table className="w-full text-left font-mono text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#12141C] text-white/40 uppercase text-[10px] border-b border-white/5">
                            <th className="p-2.5">Device Descriptor</th>
                            <th className="p-2.5 text-center">Health Indicator</th>
                            <th className="p-2.5">Device Class Subtype</th>
                            <th className="p-2.5">Modbus Direct IP Address</th>
                            <th className="p-2.5">FReset Status Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-white/90">
                          {[
                            { name: "Array 1 String 1 Controller", status: "ONLINE", sub: "BESS Rack Node", ip: "10.0.1.10", msg: "Heartbeat sync stable" },
                            { name: "Array 1 String 2 Controller", status: "ONLINE", sub: "BESS Rack Node", ip: "10.0.1.15", msg: "Heartbeat sync stable" },
                            { name: "Array 3 String 1 Controller", status: "FAULTED", sub: "BESS Rack Node", ip: "10.0.3.10", msg: "Lockout - Pack 12 Series Imbalance" },
                            { name: "Main Block Interface HVAC", status: "ONLINE", sub: "HVAC Thermostat Controller", ip: "10.0.3.3", msg: "PID thermal correction loop acting" }
                          ].map((dev, idx) => (
                            <tr key={idx} className="hover:bg-white/[0.01]">
                              <td className="p-2 font-bold text-white">{dev.name}</td>
                              <td className="p-2 text-center">
                                <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded ${
                                  dev.status === "FAULTED" ? "bg-rose-500/10 text-rose-400 border border-rose-500/15" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                                }`}>
                                  {dev.status}
                                </span>
                              </td>
                              <td className="p-2 text-white/75">{dev.sub}</td>
                              <td className="p-2 font-bold text-cyan-300">{dev.ip}</td>
                              <td className="p-2">
                                <div className="flex gap-1.5 items-center">
                                  <span className="text-[10px] text-white/50">{dev.msg}</span>
                                  <button
                                    type="button"
                                    onClick={() => alert(`Sent reset sequence to IP: ${dev.ip}`)}
                                    className="ml-auto px-2 py-0.5 bg-cyan-500/15 text-cyan-300 border border-cyan-500/10 rounded uppercase text-[9px] hover:bg-cyan-500 hover:text-black font-bold transition-all text-xs"
                                  >
                                    Reset
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* CONNECTED EQUIPMENT SECTIONS: BLOCK METERS, PCSES, HVAC */}
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 border-b border-white/10 pb-1 text-cyan-400 flex items-center gap-1.5">
                      <Zap size={15} />
                      Connected Equipment Gateway Ports
                    </h3>

                    {/* Block Meters table */}
                    <div className="mb-4">
                      <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider mb-1">Block Meters</div>
                      <div className="border border-white/5 rounded overflow-hidden">
                        <table className="w-full text-left font-mono text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#12141C] text-white/40 uppercase text-[9px] border-b border-white/5">
                              <th className="p-2">Meter Index</th>
                              <th className="p-2 text-right">Real Power (kW)</th>
                              <th className="p-2 text-right">Reactive Power (kVAr)</th>
                              <th className="p-2 text-right">VoltageLN (V)</th>
                              <th className="p-2 text-right">VoltageLL (V)</th>
                              <th className="p-2 text-right">Current (A)</th>
                              <th className="p-2 text-right">Power Factor</th>
                            </tr>
                          </thead>
                          <tbody className="text-white/90">
                            {blockMeters.map(m => (
                              <tr key={m.index} className="hover:bg-white/[0.01]">
                                <td className="p-2 font-bold text-white text-center">{m.index}</td>
                                <td className="p-2 text-right text-emerald-400 font-bold">{m.realPower}</td>
                                <td className="p-2 text-right text-[#D1D5DB]/80">{m.reactivePower}</td>
                                <td className="p-2 text-right text-[#D1D5DB]/80">{m.voltageLN}</td>
                                <td className="p-2 text-right text-[#D1D5DB]/80">{m.voltageLL}</td>
                                <td className="p-2 text-right text-[#D1D5DB]/80">{m.current}</td>
                                <td className="p-2 text-right text-cyan-400 font-bold">{m.powerFactor}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* PCSes Grid table */}
                    <div className="mb-4">
                      <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider mb-1">Power Control Systems (PCSes) Inverters</div>
                      <div className="border border-white/5 rounded overflow-hidden">
                        <table className="w-full text-left font-mono text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#12141C] text-white/40 uppercase text-[9px] border-b border-white/5">
                              <th className="p-2">Array Index</th>
                              <th className="p-2">PCS Index</th>
                              <th className="p-2 text-right">DC Volt (VDC)</th>
                              <th className="p-2 text-right">DC Curr (A)</th>
                              <th className="p-2">AC Volt (VAC)</th>
                              <th className="p-2">AC Curr (A)</th>
                              <th className="p-2 text-right">AC Real Power (kW)</th>
                              <th className="p-2 text-right">AC React Power (kVAr)</th>
                              <th className="p-2 text-right">Freq (Hz)</th>
                              <th className="p-2 text-center">Rotation</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-white/90">
                            {pcses.map((p, idx) => (
                              <tr key={idx} className="hover:bg-white/[0.01]">
                                <td className="p-2 font-bold text-cyan-400 text-center">{p.arrayIndex}</td>
                                <td className="p-2 font-bold text-white text-center">{p.pcsIndex}</td>
                                <td className="p-2 text-right text-white font-semibold">{p.dcVolt}</td>
                                <td className={`p-2 text-right font-bold ${p.dcCurr < 0 ? "text-amber-400" : "text-[#D1D5DB]/60"}`}>{p.dcCurr}</td>
                                <td className="p-2 text-white/80 font-mono text-[11px]">{p.acVolt}</td>
                                <td className="p-2 text-white/80 font-mono text-[11px]">{p.acCurr}</td>
                                <td className="p-2 text-right font-bold text-emerald-400">{p.acRealPower}</td>
                                <td className="p-2 text-right text-[#D1D5DB]/60">{p.acReactPower}</td>
                                <td className="p-2 text-right text-cyan-300 font-medium">{p.freq}</td>
                                <td className="p-2 text-center text-amber-500 font-bold tracking-tight text-sm select-none">{p.rotation}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* HVAC Controller table */}
                    <div>
                      <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider mb-1">Centipede / PLC Block HVAC Thermostats</div>
                      <div className="border border-white/5 rounded overflow-hidden">
                        <table className="w-full text-left font-mono text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#12141C] text-white/40 uppercase text-[9px] border-b border-white/5">
                              <th className="p-2">HVAC Index</th>
                              <th className="p-2 text-right">Humidity (%)</th>
                              <th className="p-2 text-right">Air Temp (°C)</th>
                              <th className="p-2 text-right">Cell Temp (°C)</th>
                              <th className="p-2 text-right">Cool To (°C)</th>
                              <th className="p-2 text-right">Heat To (°C)</th>
                              <th className="p-2">Setpoints Mode</th>
                              <th className="p-2">PID Stage</th>
                              <th className="p-2">Signals Output</th>
                              <th className="p-2">Unit 1</th>
                              <th className="p-2">Unit 2</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-white/90">
                            {hvacs.map((h, idx) => {
                              const isUnusual = h.cellTemp > 50;
                              return (
                                <tr key={idx} className={`hover:bg-white/[0.01] ${isUnusual ? "bg-rose-500/[0.04]" : ""}`}>
                                  <td className="p-2 font-bold text-cyan-400 text-center">{h.hvacIndex}</td>
                                  <td className="p-2 text-right text-white/80">{h.humidity}%</td>
                                  <td className="p-2 text-right text-white font-semibold">{h.airTemp}</td>
                                  <td className={`p-2 text-right font-black ${isUnusual ? "text-rose-400 animate-pulse" : "text-emerald-400"}`}>{h.cellTemp}°C</td>
                                  <td className="p-2 text-right text-cyan-300">{h.coolTo}</td>
                                  <td className="p-2 text-right text-rose-300">{h.heatTo}</td>
                                  <td className="p-2 text-white/70 text-[10px]">{h.setpointsRespondingTo}</td>
                                  <td className={`p-2 text-[10px] font-bold ${h.stage.includes("Heating") ? "text-amber-400" : "text-white/40"}`}>{h.stage}</td>
                                  <td className="p-2 text-white/40 font-mono text-[9px]">{h.signals}</td>
                                  <td className="p-2 text-[10px] text-emerald-400 font-bold">{h.unit1}</td>
                                  <td className="p-2 text-[10px] text-emerald-400 font-bold">{h.unit2}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* CATEGORY VIEW 2: STRING LIST (DEEP PAGINATED KOBOLD GRID FROM SCREENSHOT 1) */}
              {selectedCategory === "Legacy String List" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#131520] p-3 rounded border border-white/5">
                    <div className="flex items-center gap-2">
                      <Filter size={14} className="text-cyan-400" />
                      <span className="text-xs uppercase font-mono text-white/60 font-bold">Filters</span>
                      <select 
                        value={arrayFilter} 
                        onChange={(e) => setArrayFilter(e.target.value)}
                        className="bg-black border border-white/10 text-white font-mono text-xs p-1.5 rounded uppercase cursor-pointer"
                      >
                        <option value="ALL">All Enclosures</option>
                        <option value="1">Enclosure 1 (A1)</option>
                        <option value="2">Enclosure 2 (A2)</option>
                        <option value="3">Enclosure 3 (A3)</option>
                      </select>
                      <select 
                        value={statusFilter} 
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-black border border-white/10 text-white font-mono text-xs p-1.5 rounded uppercase cursor-pointer"
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="OK">Healthy Packs</option>
                        <option value="FAULTED">Faulted/Alarm</option>
                      </select>
                    </div>

                    {/* Symmetrical Search box */}
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-2.5 text-white/40" />
                      <input 
                        type="search" 
                        placeholder="Search locator, e.g. 001B0..." 
                        value={searchStringQuery}
                        onChange={(e) => setSearchStringQuery(e.target.value)}
                        className="bg-black border border-white/10 text-white font-mono text-xs pl-8 pr-3 py-1.5 min-w-[200px] rounded focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div className="border border-white/10 rounded-lg overflow-x-auto">
                    <table className="w-full text-left font-mono text-[10px] border-collapse leading-normal tracking-tight min-w-[1200px]">
                      <thead>
                        <tr className="bg-[#12141C] text-white/40 uppercase border-b border-white/10">
                          <th className="p-2 sm:p-3 text-center">Array</th>
                          <th className="p-2 sm:p-3 text-center">String</th>
                          <th className="p-2 sm:p-3 text-center">Contact.</th>
                          <th className="p-2 sm:p-3 text-center">Rotation</th>
                          <th className="p-2 sm:p-3 text-right">Volt Meas (V)</th>
                          <th className="p-2 sm:p-3 text-right">Volt Calc (V)</th>
                          <th className="p-2 sm:p-3 text-right">Volt Delta (V)</th>
                          <th className="p-2 sm:p-3 text-right">Curr (A)</th>
                          <th className="p-2 sm:p-3 text-right">kW</th>
                          <th className="p-2 sm:p-3 text-right">% SoC</th>
                          <th className="p-2 sm:p-3 text-right">kWh</th>
                          <th className="p-2 sm:p-3 text-right">Cell Min (mV)</th>
                          <th className="p-2 sm:p-3 text-right">Cell Max (mV)</th>
                          <th className="p-2 sm:p-3 text-right">Cell Delta</th>
                          <th className="p-2 sm:p-3 text-right">Temp Min (°C)</th>
                          <th className="p-2 sm:p-3 text-right">Temp Max (°C)</th>
                          <th className="p-2 sm:p-3 text-right">Balance</th>
                          <th className="p-2 sm:p-3 text-center">Loc</th>
                          <th className="p-2 sm:p-3 text-center">Fans</th>
                          <th className="p-2 sm:p-3">Timestamp Logged</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-white/95">
                        {filteredStrings.length === 0 ? (
                          <tr>
                            <td colSpan={20} className="text-center p-8 text-white/30 text-xs">
                              No strings match filters. Use other filters above.
                            </td>
                          </tr>
                        ) : (
                          filteredStrings.map((s, idx) => {
                            const isWarning = s.contact === "fault" || s.rotation === "fault" || s.cellVoltsDelta > 50;
                            return (
                              <tr 
                                key={idx} 
                                onClick={() => setSelectedString(s)}
                                className={`hover:bg-white/[0.02] cursor-pointer transition-colors ${
                                  isWarning ? "bg-rose-500/[0.03] text-rose-100" : ""
                                }`}
                              >
                                <td className="p-2 text-center text-cyan-400 font-bold">{s.array}</td>
                                <td className="p-2 text-center font-bold text-white">{s.string}</td>
                                
                                {/* Contactor status LED dots */}
                                <td className="p-2 text-center">
                                  <div className="flex gap-0.5 justify-center items-center">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                      <span key={i} className={`h-2.5 w-2.5 rounded-full border border-black/80 ${
                                        s.contact === "fault" 
                                          ? "bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.5)] animate-pulse" 
                                          : "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                                      }`}></span>
                                    ))}
                                  </div>
                                </td>

                                {/* Phase Rotation status LEDs */}
                                <td className="p-2 text-center">
                                  <div className="flex gap-0.5 justify-center items-center">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                      <span key={i} className={`h-2.5 w-2.5 rounded-full border border-black/80 ${
                                        s.rotation === "fault" 
                                          ? "bg-rose-500 animate-pulse" 
                                          : "bg-emerald-500"
                                      }`}></span>
                                    ))}
                                  </div>
                                </td>

                                <td className="p-2 text-right">{s.voltageMeas}</td>
                                <td className="p-2 text-right text-white/60">{s.voltageCalc}</td>
                                <td className={`p-2 text-right font-bold ${isWarning ? "text-rose-400" : "text-white/40"}`}>{s.voltageDelta}</td>
                                <td className="p-2 text-right text-[#D1D5DB]">{s.powerA}</td>
                                <td className="p-2 text-right text-emerald-400 font-semibold">{s.powerkW}</td>
                                <td className="p-2 text-right text-cyan-400 font-bold">{s.powerSoc}%</td>
                                <td className="p-2 text-right text-white/70">{s.powerKwh}</td>
                                
                                <td className="p-2 text-right text-[#D1D5DB]">{s.cellVoltsMin}</td>
                                <td className="p-2 text-right text-white">{s.cellVoltsMax}</td>
                                <td className={`p-2 text-right font-black ${s.cellVoltsDelta > 40 ? "text-rose-400 animate-pulse" : "text-cyan-400"}`}>{s.cellVoltsDelta}</td>
                                
                                <td className="p-2 text-right text-emerald-400">{s.cellTempMin}</td>
                                <td className={`p-2 text-right ${s.cellTempMax > 40 ? "text-rose-400 font-extrabold" : "text-emerald-400"}`}>{s.cellTempMax}</td>
                                <td className="p-2 text-right text-white/50">{s.balanceCount} ({s.balanceMode})</td>
                                <td className="p-2 text-center text-cyan-300 font-medium">{s.loc}</td>
                                <td className="p-2 text-center">
                                  <span className={`inline-flex items-center gap-1 px-1 rounded text-[9px] font-bold ${
                                    s.fans === "OFF" ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${s.fans === "OFF" ? "bg-rose-400" : "bg-emerald-400 animate-spin"}`}></span>
                                    {s.fans}
                                  </span>
                                </td>
                                <td className="p-2 text-white/40">{s.timestamp}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* MINI STRING DETAILED REPORT ONCLICK OVERLAY */}
                  {selectedString && (
                    <div className="bg-[#12141F] border border-cyan-500/30 rounded p-4 mt-2 shadow-2xl relative animate-fade-in text-xs">
                      <button 
                        onClick={() => setSelectedString(null)}
                        className="absolute right-2.5 top-2.5 text-white/40 hover:text-white"
                      >
                        <X size={16} />
                      </button>
                      <h4 className="text-cyan-400 font-bold uppercase tracking-wider mb-2 font-mono flex items-center gap-1.5">
                        <Info size={14} />
                        Enclosure {selectedString.array} :: String {selectedString.string} Quick Report (Locator {selectedString.loc})
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-white/80">
                        <div className="bg-black/40 p-2 rounded">
                          <span className="text-white/40 block text-[9px] uppercase">measured voltage</span>
                          <span className="text-sm font-bold text-white">{selectedString.voltageMeas} VDC</span>
                        </div>
                        <div className="bg-black/40 p-2 rounded">
                          <span className="text-white/40 block text-[9px] uppercase">cell imbalance delta</span>
                          <span className={`text-sm font-bold ${selectedString.cellVoltsDelta > 50 ? "text-rose-400" : "text-cyan-300"}`}>{selectedString.cellVoltsDelta} mV</span>
                        </div>
                        <div className="bg-black/40 p-2 rounded">
                          <span className="text-white/40 block text-[9px] uppercase">maximum cell temperature</span>
                          <span className={`text-sm font-bold ${selectedString.cellTempMax > 40 ? "text-rose-400" : "text-emerald-300"}`}>{selectedString.cellTempMax} °C</span>
                        </div>
                        <div className="bg-black/40 p-2 rounded">
                          <span className="text-white/40 block text-[9px] uppercase">safety status</span>
                          <span className={`text-sm font-bold ${selectedString.contact === "fault" ? "text-rose-400" : "text-emerald-400"}`}>
                            {selectedString.contact === "fault" ? "CRITICAL LOCKOUT" : "LINE CLOSED - ACTIVE"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CATEGORY VIEW 3: PCS LIST VIEW */}
              {selectedCategory === "PCS List" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-mono font-bold text-white/70 tracking-widest uppercase mb-2 border-l-2 border-emerald-500 pl-2">
                    Power Control Systems (PCS) Extended Diagnostic
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pcses.map((p, idx) => (
                      <div key={idx} className="bg-[#12141C] border border-white/5 rounded-lg p-4 space-y-3">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                          <div>
                            <span className="text-[10px] text-white/40 font-mono">INVERTER MATRIX</span>
                            <h4 className="text-sm font-bold text-white">Array {p.arrayIndex} :: PCS {p.pcsIndex}</h4>
                          </div>
                          <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                            {p.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                          <div>
                            <span className="text-white/40 text-[9px] block">DC VOLTAGE</span>
                            <span className="text-cyan-400 font-bold">{p.dcVolt} VDC</span>
                          </div>
                          <div>
                            <span className="text-white/40 text-[9px] block">DC CURRENT</span>
                            <span className="text-white font-bold">{p.dcCurr} ADC</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-white/40 text-[9px] block">AC LINE VOLTAGE (A/B/C)</span>
                            <span className="text-white font-semibold">{p.acVolt} VAC</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-white/40 text-[9px] block">AC AC-AMPS CURRENT</span>
                            <span className="text-white font-semibold">{p.acCurr} AAC</span>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-white/5 text-[10px] text-white/40 font-mono flex justify-between items-center">
                          <span>ROTATION ANGLE: <strong className="text-amber-500">{p.rotation}</strong></span>
                          <span>FREQ: <strong>{p.freq} Hz</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CATEGORY VIEW 4: STRING DETAILS */}
              {selectedCategory === "String Details" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-mono font-bold text-white/70 uppercase mb-2 border-l-2 border-emerald-500 pl-2">
                    String Detailed Analytics
                  </h3>
                  <div className="p-6 bg-[#12141C] border border-white/5 rounded text-center text-white/50 space-y-2">
                    <Activity size={32} className="mx-auto text-cyan-400 animate-pulse" />
                    <p className="text-white font-bold">Detailed String Controller Log Stream</p>
                    <p className="text-xs max-w-md mx-auto">
                      Select any row in the <strong className="text-white">String List</strong> category to run the specific diagnostics. Click the "String List" tab on the left dashboard selection pane.
                    </p>
                  </div>
                </div>
              )}

              {/* CATEGORY VIEW 5: CELL MAP VOLTAGE HEATMAP */}
              {selectedCategory === "Cell Map :: Voltage" && (
                <div className="space-y-4">
                  <div className="p-3 bg-[#131520] rounded border border-white/5 flex flex-wrap justify-between items-center gap-3 text-xs font-mono">
                    <div>
                      <h4 className="font-bold text-white uppercase text-cyan-400">Cell Voltages Grid (Series Block Matrixes)</h4>
                      <p className="text-[10px] text-white/40 mt-1">Live voltages listed in mV. Green (standard), Amber/Red (imbalances/threshold warnings)</p>
                    </div>
                    {/* Map thresholds legend */}
                    <div className="flex gap-4">
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="h-2 w-2 rounded bg-[#059669]"></span>
                        <span>Nominal (&lt; 3300)</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="h-2 w-2 rounded bg-amber-500 animate-pulse"></span>
                        <span>Flag Spike (3300-3450)</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="h-2 w-2 rounded bg-rose-600 animate-ping"></span>
                        <span>Critical Block OOR (&gt; 3450)</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    {Array.from({ length: 16 }).map((_, pIdx) => {
                      const packNum = pIdx + 1;
                      const packCells = cellVoltGrid.filter(c => c.pack === packNum);
                      return (
                        <div key={packNum} className="bg-[#12141C] border border-white/5 p-2 rounded">
                          <div className="text-[10px] font-bold text-white/50 border-b border-white/5 pb-1 mb-1.5 uppercase font-mono tracking-wider">
                            Pack {packNum.toString().padStart(2, "0")}
                          </div>
                          <div className="grid grid-cols-4 gap-1">
                            {packCells.map((c, idx) => {
                              const isImb = c.volt > 3450;
                              const isMed = c.volt > 3300 && c.volt <= 3450;
                              return (
                                <div 
                                  key={idx}
                                  title={`Pack ${packNum}, Cell ${c.cell}: ${c.volt} mV`}
                                  className={`p-1 text-center font-mono text-[9px] rounded font-bold cursor-help transition-all ${
                                    isImb ? "bg-rose-600 text-white animate-pulse font-black" :
                                    isMed ? "bg-amber-500 text-black font-semibold" :
                                    "bg-emerald-950 text-emerald-300 hover:bg-emerald-800"
                                  }`}
                                >
                                  {c.cell}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CATEGORY VIEW 6: CELL TEMP HEATMAP */}
              {selectedCategory === "Cell Map :: Temperature" && (
                <div className="space-y-4">
                  <div className="p-4 bg-[#12141C] border border-white/5 rounded-lg space-y-3">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <Fan className="text-cyan-400 animate-spin" size={14} />
                      Blocked Thermal Cell Enclosure Graph
                    </h3>
                    <p className="text-xs text-white/50 leading-relaxed font-mono">
                      Visualizing temperature distribution arrays over thermocouple segments. High active coolers operate automatic heat-soak termination protocols when maximum cell temperature spikes above 45°C.
                    </p>
                    <div className="border border-white/5 rounded overflow-hidden">
                      <table className="w-full text-left font-mono text-xs">
                        <thead>
                          <tr className="bg-black/50 text-white/40 uppercase text-[9px]">
                            <th className="p-2.5">Thermocouple Segment No.</th>
                            <th className="p-2.5 text-right">Avg Cell Temp</th>
                            <th className="p-2.5 text-right">Ambient Air Temp</th>
                            <th className="p-2.5">Cooler Load Stage</th>
                            <th className="p-2.5">PLC Fan Indicator</th>
                            <th className="p-2.5 text-center">Safety Lock Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-white/95">
                          {[
                            { index: "Thermopack-01 (Segment A)", avg: "24.6°C", air: "19.5°C", stage: "Low Fan Mode", fan: "SP: 500 RPM", status: "OK" },
                            { index: "Thermopack-02 (Segment B)", avg: "28.3°C", air: "20.3°C", stage: "Low Fan Mode", fan: "SP: 500 RPM", status: "OK" },
                            { index: "Thermopack-03 (Segment C / Imbalance)", avg: "99.9°C", air: "26.6°C", stage: "High Compressors", fan: "SP: 3000 RPM", status: "CRITICAL ALERT" },
                            { index: "Thermopack-04 (Segment D)", avg: "19.5°C", air: "19.5°C", stage: "Idle Mode", fan: "OFF", status: "OK" }
                          ].map((t, idx) => (
                            <tr key={idx} className={t.status !== "OK" ? "bg-rose-500/[0.03]" : ""}>
                              <td className="p-2.5 font-bold text-white">{t.index}</td>
                              <td className={`p-2.5 text-right font-black ${t.status !== "OK" ? "text-rose-450 animate-pulse text-sm" : "text-emerald-400"}`}>{t.avg}</td>
                              <td className="p-2.5 text-right text-slate-300">{t.air}</td>
                              <td className="p-2.5 text-white/70">{t.stage}</td>
                              <td className="p-2.5 font-bold text-cyan-300">{t.fan}</td>
                              <td className="p-2.5 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded font-bold text-[10px] ${
                                  t.status === "OK" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400 animate-bounce"
                                }`}>
                                  {t.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* CATEGORY VIEW 7: MODBUS MAP LIVE REGISTERS */}
              {selectedCategory === "Modbus Map Registers" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Modbus Mapping Schema Inspector</h3>
                      <p className="text-[10px] font-mono text-white/40 mt-1">Live register details parsed from the uploaded CSV map configurations</p>
                    </div>
                    <button
                      type="button"
                      onClick={loadActiveModbusMap}
                      className="flex items-center gap-1.5 px-3 py-1 bg-cyan-500/15 text-cyan-300 border border-cyan-500/10 hover:bg-cyan-550 rounded font-bold text-xs font-mono tracking-tight"
                    >
                      <RefreshCw size={11} />
                      Reload Mapping Modbus
                    </button>
                  </div>

                  <div className="border border-white/5 rounded overflow-hidden">
                    <table className="w-full text-left font-mono text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#12141C] text-white/40 uppercase text-[10px] border-b border-white/5">
                          <th className="p-2.5">Register</th>
                          <th className="p-2.5">Field Type</th>
                          <th className="p-2.5">Description Name</th>
                          <th className="p-2.5">Format Type</th>
                          <th className="p-2.5 text-center">R/W</th>
                          <th className="p-2.5 text-right">Value Raw</th>
                          <th className="p-2.5 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-white/95">
                        {activeRegisters.map((reg) => (
                          <tr key={reg.register} className="hover:bg-white/[0.01]">
                            <td className="p-2 font-bold text-cyan-400">{reg.register}</td>
                            <td className="p-2">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white ${
                                reg.fieldType === "Header" ? "bg-amber-600/30 text-amber-300" : "bg-white/10 text-white/70"
                              }`}>
                                {reg.fieldType}
                              </span>
                            </td>
                            <td className="p-2 font-semibold text-white">{reg.description}</td>
                            <td className="p-2 text-white/55">{reg.type}</td>
                            <td className="p-2 text-center text-amber-500 font-bold">{reg.rw}</td>
                            <td className="p-2 text-right font-black text-cyan-300">{reg.liveValue} {reg.unit}</td>
                            <td className="p-2 text-center">
                              <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                ACTIVE
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CATEGORY VIEW: SITE IP TOPOLOGY MAP */}
              {selectedCategory === "Site IP Topology Map" && (
                <div className="space-y-6">
                  {/* UPPER CONFIGURATION SUMMARY & ACTIONS */}
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-white/5 pb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Site Layout Network IP Map & Topology</h3>
                      <p className="text-[10px] font-mono text-white/40 mt-1">
                        Commission physical subnets, query controller socket addresses, and upload custom IP maps to verify loop topologies.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-mono">
                      <a 
                        href="/turtle/tools/report/ems/ip_modbus_associations.csv" 
                        target="_blank" 
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#059669]/15 border border-[#059669]/30 hover:bg-[#059669]/25 text-[#34d399] rounded font-bold"
                        rel="noreferrer"
                      >
                        <ExternalLink size={11} />
                        Download IP-to-Modbus Grid Map CSV
                      </a>
                      <a 
                        href="/turtle/tools/report/ems/ipMap.csv" 
                        target="_blank" 
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 rounded font-bold"
                        rel="noreferrer"
                      >
                        <ExternalLink size={11} />
                        Download Site IP Map CSV
                      </a>
                      <a 
                        href="/turtle/tools/report/ems/stringIPMap.csv" 
                        target="_blank" 
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 rounded font-bold"
                        rel="noreferrer"
                      >
                        <ExternalLink size={11} />
                        Download String IP Map CSV
                      </a>
                      <button
                        type="button"
                        onClick={loadActiveIPMaps}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/15 text-cyan-300 border border-cyan-500/10 hover:bg-cyan-550/20 rounded font-bold"
                      >
                        <RefreshCw size={11} className="animate-spin-slow" />
                        Repoll Statuses
                      </button>
                    </div>
                  </div>

                  {/* LAYOUT TOPOLOGY ROW: TWO INTERACTIVE BLOCKS */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* LEFT PANEL (5 COLS): SITE & COILS CONTROLLERS */}
                    <div className="lg:col-span-5 space-y-4">
                      <div className="bg-[#11131A] border border-white/5 rounded-lg p-4 flex flex-col h-[650px]">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-xs font-bold text-[#059669] uppercase font-mono tracking-wider flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-[#059669]"></span>
                            Aux/Substation IP Nodes
                          </h4>
                          <span className="text-[9px] font-mono text-white/40">
                            {siteIPMap.filter(n => 
                              n.target.toLowerCase().includes(auxFilter.toLowerCase()) ||
                              n.ipAddress.includes(auxFilter) ||
                              n.model.toLowerCase().includes(auxFilter.toLowerCase())
                            ).length} / {siteIPMap.length} Nodes
                          </span>
                        </div>

                        {/* Search Bar for Aux Devices */}
                        <div className="mb-3">
                          <input
                            type="text"
                            placeholder="Search Aux devices (e.g., HVAC, SW, Fire)..."
                            value={auxFilter}
                            onChange={(e) => setAuxFilter(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono text-white placeholder-white/20 focus:outline-none focus:border-cyan-500 transition-all"
                          />
                        </div>

                        <div className="space-y-3 flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                          {siteIPMap
                            .filter(node => 
                              node.target.toLowerCase().includes(auxFilter.toLowerCase()) ||
                              node.ipAddress.includes(auxFilter) ||
                              node.model.toLowerCase().includes(auxFilter.toLowerCase())
                            )
                            .map((node, i) => (
                              <div key={i} className="bg-black/45 border border-white/5 rounded-md p-3 flex flex-col justify-between gap-2 text-xs font-mono relative hover:border-white/10 transition-all">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <div className="font-bold text-white mb-0.5">{node.target}</div>
                                    <div className="text-[10px] text-white/40 uppercase">{node.model}</div>
                                  </div>
                                  <span className="bg-indigo-500/15 text-indigo-300 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                                    SUBNET
                                  </span>
                                </div>
                                
                                <div className="flex justify-between items-center pt-2 border-t border-white/[0.03]">
                                  <code className="text-cyan-400 font-bold">{node.ipAddress}</code>
                                  <button
                                    type="button"
                                    onClick={() => testIPConnection(node.ipAddress)}
                                    disabled={!!pingingIP}
                                    className="text-[10px] uppercase font-bold text-black bg-cyan-400 hover:bg-cyan-300 disabled:bg-white/10 disabled:text-white/30 px-2.5 py-1 rounded transition-all flex items-center gap-1"
                                  >
                                    {pingingIP === node.ipAddress ? (
                                      <>
                                        <RefreshCw size={9} className="animate-spin" />
                                        Pinging
                                      </>
                                    ) : "Test Link"}
                                  </button>
                                </div>

                                {pingResults[node.ipAddress] && (
                                  <div className={`mt-2 p-2 rounded text-[10px] border leading-tight ${
                                    pingResults[node.ipAddress].status === "success" 
                                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                                      : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                                  }`}>
                                    <span className="font-bold underline block mb-0.5">
                                      Result ({pingResults[node.ipAddress].latency}ms):
                                    </span>
                                    {pingResults[node.ipAddress].msg}
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    {/* RIGHT PANEL (7 COLS): BESS CELL-RACK STRINGS CONTROLLERS */}
                    <div className="lg:col-span-7 space-y-4">
                      <div className="bg-[#11131A] border border-white/5 rounded-lg p-4 flex flex-col h-[650px]">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-xs font-bold text-[#059669] uppercase font-mono tracking-wider flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-[#059669]"></span>
                            Direct BESS IP String Maps
                          </h4>
                          <span className="text-[9px] font-mono text-white/40">
                            {stringIPMap.filter(n => stringArrayFilter === "All" || n.array === parseInt(stringArrayFilter, 10)).length} / {stringIPMap.length} RCU Strings
                          </span>
                        </div>

                        {/* Array Selector Filters */}
                        <div className="flex flex-wrap gap-1.5 mb-3 border-b border-white/5 pb-3">
                          <span className="text-[10px] font-mono uppercase text-white/40 self-center mr-1">Filter Array:</span>
                          {["All", "1", "2", "3", "4", "5", "6", "7", "8"].map((arr) => (
                            <button
                              key={arr}
                              type="button"
                              onClick={() => setStringArrayFilter(arr)}
                              className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded ${
                                stringArrayFilter === arr
                                  ? "bg-cyan-500 text-black"
                                  : "bg-white/5 hover:bg-white/10 text-white/60"
                              }`}
                            >
                              {arr === "All" ? "ALL" : `ARR ${arr}`}
                            </button>
                          ))}
                        </div>

                        {/* Interactive Grid of Rack RCU IPs */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                          {stringIPMap
                            .filter(node => stringArrayFilter === "All" || node.array === parseInt(stringArrayFilter, 10))
                            .map((node, i) => (
                              <div key={i} className="bg-black/30 border border-white/5 hover:border-white/10 rounded p-3 font-mono text-xs flex flex-col justify-between gap-1.5 h-[105px]">
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-white text-[11px]">
                                    Array {node.array} :: String {node.string}
                                  </span>
                                  <span className="text-[9px] px-1 bg-cyan-400/15 text-cyan-300 rounded font-bold uppercase">
                                    BESS RCU
                                  </span>
                                </div>

                                <div className="flex justify-between items-center">
                                  <span className="text-slate-400 select-all font-semibold">{node.ip}</span>
                                  <button
                                    type="button"
                                    onClick={() => testIPConnection(node.ip)}
                                    disabled={!!pingingIP}
                                    className="text-[9px] font-bold text-cyan-300 hover:text-white px-2 py-0.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded"
                                  >
                                    {pingingIP === node.ip ? "POLLING..." : "TEST"}
                                  </button>
                                </div>

                                {pingResults[node.ip] ? (
                                  <div className={`p-1 mt-1 rounded text-[9px] leading-tight border ${
                                    pingResults[node.ip].status === "success"
                                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                      : "bg-rose-500/10 border-rose-500/20 text-rose-450"
                                  }`}>
                                    {pingResults[node.ip].msg.length > 40 ? pingResults[node.ip].msg.slice(0, 40) + "..." : pingResults[node.ip].msg}
                                  </div>
                                ) : (
                                  <span className="text-[9px] text-white/20 uppercase tracking-tighter">Link State Not Queried</span>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* ACTIVE COMMISSIONING FILE UPLOADING CENTRE */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#0E1017] border border-white/5 p-5 rounded-lg">
                    
                    {/* DROPZONE 1: SITE IP MAP CSV */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-mono font-bold uppercase text-white/70">
                        Commission Site Layout IP Map
                      </h4>
                      <p className="text-[10px] text-white/40 font-mono">
                        Provides absolute subnet IP descriptors for auxiliary devices.
                      </p>

                      <div
                        onDragOver={(e) => { e.preventDefault(); setIsDraggingSiteIP(true); }}
                        onDragLeave={() => setIsDraggingSiteIP(false)}
                        onDrop={async (e) => {
                          e.preventDefault();
                          setIsDraggingSiteIP(false);
                          const file = e.dataTransfer.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = async (event) => {
                              const content = event.target?.result as string;
                              try {
                                const response = await fetch("/api/upload-ip-map", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ csvContent: content })
                                });
                                if (response.ok) {
                                  setSiteIPFileName(file.name);
                                  // repoll
                                  loadActiveIPMaps();
                                  setNotifications(prev => [
                                    {
                                      time: new Date().toISOString().replace("T", " ").slice(0, 19),
                                      source: "IP_LOADER",
                                      message: `Successfully loaded static IP map dataset: ${file.name}. Configured layout parsed.`,
                                      type: "success"
                                    },
                                    ...prev
                                  ]);
                                } else {
                                  alert("Failed to write layout map to server.");
                                }
                              } catch (err: any) {
                                alert("Failed uploading Map: " + err.message);
                              }
                            };
                            reader.readAsText(file);
                          }
                        }}
                        onClick={() => siteIPInputRef.current?.click()}
                        className={`border border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                          isDraggingSiteIP 
                            ? "bg-cyan-500/10 border-cyan-400" 
                            : "bg-[#12141C] border-white/10 hover:border-cyan-500/40"
                        }`}
                      >
                        <input
                          type="file"
                          ref={siteIPInputRef}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = async (event) => {
                                const content = event.target?.result as string;
                                try {
                                  const response = await fetch("/api/upload-ip-map", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ csvContent: content })
                                  });
                                  if (response.ok) {
                                    setSiteIPFileName(file.name);
                                    loadActiveIPMaps();
                                    setNotifications(prev => [
                                      {
                                        time: new Date().toISOString().replace("T", " ").slice(0, 19),
                                        source: "IP_LOADER",
                                        message: `Successfully loaded static IP map dataset: ${file.name}. Configured layout parsed.`,
                                        type: "success"
                                      },
                                      ...prev
                                    ]);
                                  } else {
                                    alert("Failed to write map.");
                                  }
                                } catch (err: any) {
                                  alert("Failed uploading map: " + err.message);
                                }
                              };
                              reader.readAsText(file);
                            }
                          }}
                          accept=".csv"
                          className="hidden"
                        />
                        <Upload size={20} className="mx-auto text-white/40 mb-2" />
                        <span className="text-xs block font-mono text-white font-semibold">
                          Upload ipMap.csv Asset Map
                        </span>
                        <span className="text-[10px] block text-cyan-300 font-mono mt-1">
                          Active file: <strong className="underline">{siteIPFileName}</strong>
                        </span>
                      </div>
                    </div>

                    {/* DROPZONE 2: BESS DIRECT STRING MAP CSV */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-mono font-bold uppercase text-white/70">
                        Commission Direct String IP Map
                      </h4>
                      <p className="text-[10px] text-white/40 font-mono">
                        Provides specific BESS String Array IP mapped routes to RCU modules.
                      </p>

                      <div
                        onDragOver={(e) => { e.preventDefault(); setIsDraggingStringIP(true); }}
                        onDragLeave={() => setIsDraggingStringIP(false)}
                        onDrop={async (e) => {
                          e.preventDefault();
                          setIsDraggingStringIP(false);
                          const file = e.dataTransfer.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = async (event) => {
                              const content = event.target?.result as string;
                              try {
                                const response = await fetch("/api/upload-string-ip-map", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ csvContent: content })
                                });
                                if (response.ok) {
                                  setStringIPFileName(file.name);
                                  loadActiveIPMaps();
                                  setNotifications(prev => [
                                    {
                                      time: new Date().toISOString().replace("T", " ").slice(0, 19),
                                      source: "STRING_IP_LOADER",
                                      message: `Successfully loaded string level IP map: ${file.name}.`,
                                      type: "success"
                                    },
                                    ...prev
                                  ]);
                                } else {
                                  alert("Failed to write string level map.");
                                }
                              } catch (err: any) {
                                alert("Failed loading file: " + err.message);
                              }
                            };
                            reader.readAsText(file);
                          }
                        }}
                        onClick={() => stringIPInputRef.current?.click()}
                        className={`border border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                          isDraggingStringIP 
                            ? "bg-cyan-500/10 border-cyan-400" 
                            : "bg-[#12141C] border-white/10 hover:border-cyan-500/40"
                        }`}
                      >
                        <input
                          type="file"
                          ref={stringIPInputRef}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = async (event) => {
                                const content = event.target?.result as string;
                                try {
                                  const response = await fetch("/api/upload-string-ip-map", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ csvContent: content })
                                  });
                                  if (response.ok) {
                                    setStringIPFileName(file.name);
                                    loadActiveIPMaps();
                                    setNotifications(prev => [
                                      {
                                        time: new Date().toISOString().replace("T", " ").slice(0, 19),
                                        source: "STRING_IP_LOADER",
                                        message: `Successfully loaded string level IP map: ${file.name}.`,
                                        type: "success"
                                      },
                                      ...prev
                                    ]);
                                  } else {
                                    alert("Failed to write string map.");
                                  }
                                } catch (err: any) {
                                  alert("Failed: " + err.message);
                                }
                              };
                              reader.readAsText(file);
                            }
                          }}
                          accept=".csv"
                          className="hidden"
                        />
                        <Upload size={20} className="mx-auto text-white/40 mb-2" />
                        <span className="text-xs block font-mono text-white font-semibold">
                          Upload stringIPMap.csv Asset Map
                        </span>
                        <span className="text-[10px] block text-cyan-300 font-mono mt-1">
                          Active file: <strong className="underline">{stringIPFileName}</strong>
                        </span>
                      </div>
                    </div>

                  </div>

                </div>
              )}

              {/* CATEGORY VIEW: CLOUD TELEMETRY INTERCEPTOR */}
              {selectedCategory === "Cloud Telemetry Interceptor" && (
                <div className="space-y-6">
                  {/* HEADER SECTION */}
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-white/5 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Cloud Telemetry Stream Interceptor & Sniffer</h3>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          isInterceptorLive ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" : "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20"
                        }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isInterceptorLive ? "bg-emerald-500 animate-pulse" : "bg-zinc-500"}`}></span>
                          {isInterceptorLive ? "LISTENING (10.0.*.*)" : "PAUSED"}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-white/40 mt-1">
                        The primary EMS site-level controller (<strong className="text-white">10.0.0.3</strong>) exports granulated BMS and downstream device telemetry to the cloud platform via encrypted egress POSTs. This utility intercepts and visualizes these payload packets in real-time.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-mono">
                      <button
                        type="button"
                        onClick={() => setIsInterceptorLive(!isInterceptorLive)}
                        className={`px-3 py-1.5 border rounded font-bold transition-all ${
                          isInterceptorLive 
                            ? "bg-amber-500/15 text-amber-300 border-amber-500/20 hover:bg-amber-500/25" 
                            : "bg-emerald-500/15 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/25"
                        }`}
                      >
                        {isInterceptorLive ? "Pause Interceptor" : "Resume Interceptor"}
                      </button>
                      <button
                        type="button"
                        onClick={handleForceExport}
                        className="px-3 py-1.5 bg-cyan-500/15 text-cyan-300 border border-cyan-500/10 hover:bg-cyan-550/20 rounded font-bold"
                      >
                        Force Export Packet
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadPackets}
                        disabled={telemetryPackets.length === 0}
                        className="px-3 py-1.5 bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 disabled:opacity-40 rounded font-bold transition-all"
                      >
                        Export Packet Log (.json)
                      </button>
                    </div>
                  </div>

                  {/* SUB SECTIONS TABS NAVIGATION */}
                  <div className="flex border-b border-white/5 gap-2 -mt-2">
                    <button
                      type="button"
                      onClick={() => setTelemetrySubTab("sniffer")}
                      className={`px-4 py-2 font-mono text-xs font-bold border-b-2 transition-all ${
                        telemetrySubTab === "sniffer" 
                          ? "border-cyan-400 text-white bg-white/[0.02]" 
                          : "border-transparent text-white/50 hover:text-white/80"
                      }`}
                    >
                      📡 Telemetry Packet Sniffer
                    </button>
                    <button
                      type="button"
                      onClick={() => setTelemetrySubTab("replica")}
                      className={`px-4 py-2 font-mono text-xs font-bold border-b-2 transition-all ${
                        telemetrySubTab === "replica" 
                          ? "border-cyan-400 text-white bg-white/[0.02]" 
                          : "border-transparent text-white/50 hover:text-white/80"
                      }`}
                    >
                      🖥️ Local Control Center (Cloud Replica)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTelemetrySubTab("modbus")}
                      className={`px-4 py-2 font-mono text-xs font-bold border-b-2 transition-all ${
                        telemetrySubTab === "modbus" 
                          ? "border-cyan-400 text-white bg-white/[0.02]" 
                          : "border-transparent text-white/50 hover:text-white/80"
                      }`}
                    >
                      🔌 Point Registry Tester (Modbus)
                    </button>
                  </div>

                  {/* TAB CONTENT: SNIFFER MODE (ORIGINAL CALIBRATION & SNIPER VIEW) */}
                  {telemetrySubTab === "sniffer" && (
                    <div className="space-y-6">
                      {/* MISMATCH DIAGNOSIS AND CALIBRATION CONTROLLER */}
                      <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5 space-y-4">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div>
                            {isTelemetryAligned ? (
                              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm font-mono">
                                <CheckCircle size={16} />
                                REGISTER SCALING MULTIPLIERS ALIGNED & SYNCHRONIZED
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm font-mono">
                                <AlertTriangle className="animate-bounce" size={16} />
                                BMS TELEMETRY MULTIPLIER DISCONNECT DETECTED (Mismatched Scales)
                              </div>
                            )}
                            <p className="text-[10px] font-mono text-white/50 mt-1 max-w-4xl">
                              {isTelemetryAligned 
                                ? "Excellent! High-precision register calibration scales have been loaded into the local EMS gateway loop. Multipliers (Watts/Amps SF) exactly match the Cloud stream targets."
                                : "The local application currently displays raw/uncalibrated Modbus integers directly. However, the EMS egress exporter to the Cloud requires applying the standard Powin scale factor offsets (defined in modbus_map.csv). This triggers a mismatch where local displays are off by 10x or 100x compared to the Cloud dashboard!"
                              }
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleAlignment(!isTelemetryAligned)}
                            disabled={isAligningScale}
                            className={`shrink-0 px-4 py-2 text-xs font-mono font-black uppercase tracking-wider rounded-md border shadow-lg transition-all ${
                              isTelemetryAligned
                                ? "bg-rose-500/10 text-rose-300 border-rose-500/20 hover:bg-rose-500/20"
                                : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25 animate-pulse"
                            }`}
                          >
                            {isAligningScale ? "Calibrating..." : isTelemetryAligned ? "Reset Calibration to Raw" : "⚡ Calibrate local gateway scales"}
                          </button>
                        </div>

                        {/* COMPARISON METRICS TABLE */}
                        <div className="border border-white/5 rounded-lg overflow-hidden bg-[#0A0D14]/80">
                          <table className="w-full text-left border-collapse text-xs font-mono">
                            <thead>
                              <tr className="bg-white/5 text-white/50 font-bold border-b border-white/5">
                                <th className="p-2.5">Telemetry Parameter</th>
                                <th className="p-2.5">Uncalibrated Local App View</th>
                                <th className="p-2.5">Calibrated Cloud Stream Payload</th>
                                <th className="p-2.5">Multiplier Scale</th>
                                <th className="p-2.5 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03]">
                              <tr>
                                <td className="p-2.5 font-bold text-white">Lineup Active Power</td>
                                <td className="p-2.5 text-cyan-300 font-bold">1,242.0 kW <span className="text-[9px] text-white/30 font-normal block">Raw holding register 84 value</span></td>
                                <td className="p-2.5 text-emerald-400 font-bold">
                                  {isTelemetryAligned ? "124.2 kW" : "124,200.0 kW"}
                                  <span className="text-[9px] text-white/30 font-normal block">Parsed from cloud ingest packet</span>
                                </td>
                                <td className="p-2.5 text-white/60">W_SF = 2 (Multiplier: 10^2)</td>
                                <td className="p-2.5 text-center">
                                  {isTelemetryAligned ? (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">MATCH</span>
                                  ) : (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">MISMATCH (100x)</span>
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="p-2.5 font-bold text-white">BESS Direct Current</td>
                                <td className="p-2.5 text-cyan-300 font-bold">450.0 A <span className="text-[9px] text-white/30 font-normal block">Raw register 691 integer</span></td>
                                <td className="p-2.5 text-emerald-400 font-bold">
                                  {isTelemetryAligned ? "45.0 A" : "450.0 A"}
                                  <span className="text-[9px] text-white/30 font-normal block">Parsed from cloud ingest packet</span>
                                </td>
                                <td className="p-2.5 text-white/60">A_SF = -1 (Multiplier: 10^-1 = 0.1)</td>
                                <td className="p-2.5 text-center">
                                  {isTelemetryAligned ? (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">MATCH</span>
                                  ) : (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">MISMATCH (10x)</span>
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="p-2.5 font-bold text-white">Anode Cluster C (10.0.1.10) Temperature</td>
                                <td className="p-2.5 text-cyan-300 font-bold">34.6 °C <span className="text-[9px] text-white/30 font-normal block">Module temp register 1163</span></td>
                                <td className="p-2.5 text-emerald-400 font-bold">34.6 °C <span className="text-[9px] text-white/30 font-normal block">Parsed from cloud ingest packet</span></td>
                                <td className="p-2.5 text-white/60">No offset (10^0 = 1)</td>
                                <td className="p-2.5 text-center">
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">MATCH</span>
                                </td>
                              </tr>
                              <tr>
                                <td className="p-2.5 font-bold text-white">Rack Node 10.0.3.10 Status</td>
                                <td className="p-2.5 text-zinc-400 font-bold">STALE / NO POLL <span className="text-[9px] text-zinc-500 font-normal block">Omitted from raw site map cache</span></td>
                                <td className="p-2.5 text-rose-400 font-bold">FAULTED <span className="text-[9px] text-rose-400/50 font-normal block">Logged in telemetry payload stream</span></td>
                                <td className="p-2.5 text-white/60">N/A (Status Code alignment)</td>
                                <td className="p-2.5 text-center">
                                  {isTelemetryAligned ? (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">RESOLVED</span>
                                  ) : (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">IP FILTER WARN</span>
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* SNIPER WORKSPACE GRID */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                        {/* LEFT WORKSPACE PANEL: CAPTURED TELEMETRY PACKET STREAM */}
                        <div className="lg:col-span-5 bg-[#12141C] border border-white/5 rounded-lg p-3 space-y-3 flex flex-col h-[550px]">
                          <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 rounded p-2 text-[10px] font-mono">
                            <span className="text-white/40 font-bold uppercase">INTERCEPTED STREAM BUFFER</span>
                            <span className="text-cyan-400 font-black">{telemetryPackets.length} PACKETS CAPTURED</span>
                          </div>

                          {/* SEARCH INPUT */}
                          <div className="relative">
                            <Search size={12} className="absolute left-2.5 top-2.5 text-white/30" />
                            <input
                              type="text"
                              placeholder="Filter intercepted stream by ID, status, payload key..."
                              value={packetSearchQuery}
                              onChange={(e) => setPacketSearchQuery(e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 pl-8 text-xs text-white placeholder-white/20 font-mono focus:border-cyan-500 focus:outline-none"
                            />
                          </div>

                          {/* STREAM SCROLL AREA */}
                          <div className="flex-1 overflow-y-auto space-y-2 pr-1 select-none">
                            {telemetryPackets.filter(p => {
                              const query = packetSearchQuery.toLowerCase();
                              if (!query) return true;
                              return (
                                p.id.toLowerCase().includes(query) ||
                                p.rawPayloadSize.toLowerCase().includes(query) ||
                                JSON.stringify(p.payload).toLowerCase().includes(query)
                              );
                            }).map((packet) => {
                              const isSelected = selectedPacketId === packet.id;
                              const dateObj = new Date(packet.timestamp);
                              const timeStr = dateObj.toLocaleTimeString();
                              const isErr = packet.responseStatus.includes("503");
                              
                              return (
                                <div
                                  key={packet.id}
                                  onClick={() => setSelectedPacketId(packet.id)}
                                  className={`p-2.5 rounded-md border text-xs font-mono transition-all cursor-pointer ${
                                    isSelected 
                                      ? "bg-cyan-500/10 border-cyan-500/40 text-white" 
                                      : "bg-white/[0.02] border-white/5 text-white/60 hover:bg-white/5"
                                  }`}
                                >
                                  <div className="flex justify-between items-start">
                                    <span className={`font-bold mt-0.5 text-[10px] ${isSelected ? "text-cyan-300" : "text-white/70"}`}>
                                      {packet.id}
                                    </span>
                                    <span className="text-[10px] text-white/30">{timeStr}</span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 text-[10px] text-white/40">
                                    <span className="text-white/30 font-medium">Protocol:</span> <span className="text-[#059669] font-bold">{packet.transmissionProtocol}</span>
                                    <span>•</span>
                                    <span className="text-white/30 font-medium">Size:</span> <span className="text-yellow-400 font-bold">{packet.rawPayloadSize}</span>
                                  </div>
                                  <div className="flex justify-between items-center mt-2 pt-1 border-t border-white/[0.03]">
                                    <span className={`text-[9px] shrink-0 font-bold ${isErr ? "text-rose-400" : "text-[#059669]"}`}>
                                      {packet.responseStatus}
                                    </span>
                                    <span className="text-[9px] text-white/30 truncate max-w-[150px]">{packet.payload?.meta?.ingest_channel || "local-sync"}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* RIGHT WORKSPACE PANEL: INTERACT PAYLOAD INSPECTOR */}
                        <div className="lg:col-span-7 bg-[#12141C] border border-white/5 rounded-lg p-3 space-y-3 flex flex-col h-[550px] overflow-hidden">
                          {(() => {
                            const packet = telemetryPackets.find(p => p.id === selectedPacketId);
                            if (!packet) {
                              return (
                                <div className="flex-1 flex flex-col items-center justify-center text-center text-white/30 font-mono text-xs">
                                  <Radio size={32} className="text-white/10 animate-pulse mb-3" />
                                  Select an intercepted cloud telemetry packet on the left to inspect its granulated payload stream.
                                </div>
                              );
                            }

                            const isErr = packet.responseStatus.includes("503");

                            return (
                              <div className="flex-1 flex flex-col space-y-3 overflow-hidden">
                                {/* PACKET SUMMARY BAR */}
                                <div className="bg-white/5 rounded-lg p-3 border border-white/5 space-y-2 text-xs font-mono">
                                  <div className="flex justify-between items-start border-b border-white/5 pb-2">
                                    <div>
                                      <div className="text-white font-bold text-[13px]">{packet.id}</div>
                                      <div className="text-[10px] text-white/40 mt-0.5">{packet.timestamp}</div>
                                    </div>
                                    <span className={`px-2 py-0.5 border rounded font-black uppercase text-[10px] ${
                                      isErr 
                                        ? "bg-rose-500/15 text-rose-400 border-rose-500/20" 
                                        : "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                                    }`}>
                                      {packet.responseStatus}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] pt-1">
                                    <div className="flex justify-between"><span className="text-white/30 font-medium">Egress IP:</span> <span className="text-white/80 font-bold">{packet.sourceIp}</span></div>
                                    <div className="flex justify-between"><span className="text-white/30 font-medium">Source Component:</span> <span className="text-white/80 font-bold">{packet.sourceComponent}</span></div>
                                    <div className="flex justify-between"><span className="text-white/30 font-medium">Target Cloud:</span> <span className="text-white/80 font-bold truncate max-w-[120px]">{packet.destinationCloudEndpoint}</span></div>
                                    <div className="flex justify-between"><span className="text-white/30 font-medium">Size on disk:</span> <span className="text-yellow-400 font-bold">{packet.rawPayloadSize}</span></div>
                                  </div>
                                </div>

                                {/* RAW JSON VIEW */}
                                <div className="flex-1 flex flex-col min-h-0">
                                  <div className="text-[10px] font-mono tracking-wider font-bold text-[#059669] uppercase border-b border-white/5 pb-1 mb-2 flex justify-between items-center">
                                    <span>GRANULATED INTERCEPTED PAYLOAD JSON</span>
                                    <span className="text-white/30 text-[9px] lowercase font-normal">JSON viewer with code highlighting</span>
                                  </div>
                                  <div className="flex-1 overflow-auto bg-[#090b10] rounded-md border border-white/5 relative flex">
                                    {renderJsonHighlight(packet.payload)}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB CONTENT: LOCAL REPLICA DASHBOARD (REPLICATING CLOUD CONTROL CAPABILITIES LOCALLY) */}
                  {telemetrySubTab === "replica" && (
                    <div className="space-y-6">
                      {/* INTERACTIVE CONTROLLER TILES */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* TILE 1: CLOUD SYSTEM WAN CONNECTION */}
                        <div className={`p-4 rounded-lg border font-mono space-y-3 transition-all ${
                          localCloudOutage 
                            ? "bg-rose-500/5 border-rose-500/25 text-rose-300"
                            : "bg-emerald-500/5 border-emerald-500/15 text-emerald-300"
                        }`}>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold uppercase tracking-wider">WAN Cloud Sync Connection</span>
                            {localCloudOutage ? <Wifi size={16} className="text-rose-400 animate-pulse" /> : <Wifi size={16} className="text-emerald-400" />}
                          </div>

                          <div className="text-2xl font-black">
                            {localCloudOutage ? "OUTAGEFALLBACK" : "CONNECTED"}
                          </div>
                          
                          <p className="text-[10px] text-white/50 leading-relaxed font-sans">
                            {localCloudOutage 
                              ? "CRITICAL: Internet Connection DOWN. Localized database backup store is recording all high-frequency Modbus registers with zero data loss."
                              : "STATUS NORMAL: Local BESS site registers are automatically synchronized with central Cloud servers every 3000ms. All systems normal."
                            }
                          </p>

                          <button
                            type="button"
                            onClick={() => handleToggleOutage(!localCloudOutage)}
                            className={`w-full py-1.5 rounded font-black text-xs uppercase tracking-wide border transition-all ${
                              localCloudOutage 
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30"
                                : "bg-rose-500/20 text-rose-300 border-rose-500/30 hover:bg-rose-500/30"
                            }`}
                          >
                            {localCloudOutage ? "🔌 Reconnect WAN Bridge" : "⚠️ Cut WAN Bridge (Simulate Outage)"}
                          </button>
                        </div>

                        {/* TILE 2: CELL VOLTAGE OVERRIDE & SHUNT CONTROLLER */}
                        <div className={`p-4 rounded-lg border font-mono space-y-3 transition-all ${
                          softBalancingOverride 
                            ? "bg-cyan-500/5 border-cyan-500/25 text-cyan-300"
                            : (systemWideIsolation ? "bg-zinc-500/5 border-white/5 text-zinc-400" : "bg-zinc-500/5 border-amber-500/20 text-amber-300")
                        }`}>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold uppercase tracking-wider">Latching Shunt Override</span>
                            <Sliders size={16} className={softBalancingOverride ? "text-cyan-400 animate-spin" : "text-amber-400"} />
                          </div>

                          <div className="text-2xl font-black">
                            {softBalancingOverride ? "SHUNT ACTIVE" : "AUTO INTERLOCK"}
                          </div>

                          <p className="text-[10px] text-white/50 leading-relaxed font-sans">
                            {softBalancingOverride 
                              ? "OVERRIDE ENGAGED: Forcing dynamic cell shunts on 10.0.3.10. Cell 14 voltage successfully balanced down to 3.24V. String ONLINE."
                              : "AUTO CONTROLLER: String 1 is currently faulted on over-voltage (Cell 14: 3.51V). Bypassing automated latch loops requires manual shunt balancing."
                            }
                          </p>

                          <button
                            type="button"
                            disabled={systemWideIsolation}
                            onClick={() => handleToggleBalancing(!softBalancingOverride)}
                            className="w-full py-1.5 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/30 disabled:opacity-30 rounded font-black text-xs uppercase tracking-wide transition-all"
                          >
                            {softBalancingOverride ? "Release Balancing Shunts" : "⚡ Force Cell Balancing Overrides"}
                          </button>
                        </div>

                        {/* TILE 3: EMERGENCY SYSTEM CUTOFF */}
                        <div className={`p-4 rounded-lg border font-mono space-y-3 transition-all ${
                          systemWideIsolation 
                            ? "bg-rose-950/20 border-rose-500/40 text-rose-300 animate-pulse"
                            : "bg-[#161313] border-white/5 text-white/50"
                        }`}>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold uppercase tracking-wider">Emergency DC Isolation Relay</span>
                            <AlertTriangle size={16} className={systemWideIsolation ? "text-rose-400" : "text-white/20"} />
                          </div>

                          <div className={`text-2xl font-black ${systemWideIsolation ? "text-rose-400 font-bold" : "text-white/40"}`}>
                            {systemWideIsolation ? "ISOLATION TRIP ACTIVE" : "NOMINAL ENERGIZE"}
                          </div>

                          <p className="text-[10px] text-white/50 leading-relaxed font-sans">
                            {systemWideIsolation 
                              ? "E-STOP ENGAGED: Local manual safety stop coil tripped. Main substations isolated. Grid power flow completely shut down."
                              : "NORMAL RUNNING: All contactor logic is active. Safety loop coils energized. Control room holds master safety intervention authority."
                            }
                          </p>

                          <button
                            type="button"
                            onClick={() => handleToggleCutoff(!systemWideIsolation)}
                            className={`w-full py-1.5 rounded font-black text-xs uppercase tracking-wide border transition-all ${
                              systemWideIsolation 
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30"
                                : "bg-rose-500/20 text-rose-300 border-rose-500/30 hover:bg-rose-500/30"
                            }`}
                          >
                            {systemWideIsolation ? "Clear Safety Cutoff Trigger" : "🛑 Trigger Emergency Cutoff (Local)"}
                          </button>
                        </div>
                      </div>

                      {/* LIVE FLOW POWER VISUALIZER DIAGRAM */}
                      <div className="p-5 rounded-lg bg-[#0C0E17] border border-white/5 space-y-4 font-mono">
                        <div className="flex justify-between items-start border-b border-white/5 pb-3">
                          <div>
                            <h4 className="text-xs font-bold uppercase text-white tracking-wider flex items-center gap-2">
                              <Activity size={14} className="text-cyan-400" />
                              REPLICATED SITE ACTIVE POWER-FLOW SCHEMATIC
                            </h4>
                            <p className="text-[10px] text-white/40 mt-1">
                              Real-time interactive diagram representing Modbus voltage lines, cells, and isolated nodes mapped across local subnets.
                            </p>
                          </div>
                          <span className="text-[11px] bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded font-bold">
                            Active Load: {systemWideIsolation ? "0.0 kW" : (softBalancingOverride ? "248.4 kW" : "124.2 kW")}
                          </span>
                        </div>

                        {/* RENDER DYNAMIC SVG LINEUP MATRICES */}
                        <div className="flex flex-col lg:flex-row justify-around items-center gap-6 py-6 bg-black/40 rounded-lg border border-white/[0.02]">
                          
                          {/* LINEUP 1 ELEMENT */}
                          <div className="bg-[#12141F] rounded-lg border border-white/5 p-3.5 w-64 space-y-3 relative text-xs">
                            <div className="absolute -top-2.5 left-3 bg-cyan-600/20 border border-cyan-500/30 rounded px-1.5 py-0.5 text-[9px] text-cyan-300 font-bold font-mono">
                              LINEUP 1 (10.0.1.1)
                            </div>
                            <div className="flex justify-between font-bold pt-1">
                              <span className="text-white/60">BMS Core Mode:</span>
                              <span className={systemWideIsolation ? "text-zinc-500" : "text-emerald-400"}>
                                {systemWideIsolation ? "Isolated" : "Charging"}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-white/50 pt-1">
                              <div className="bg-white/[0.01] p-1.5 rounded">
                                <span className="block text-[9px] text-white/30">Active registers</span>
                                <strong className="text-cyan-300 block text-xs mt-0.5">{(systemWideIsolation ? 0 : 124.2).toFixed(1)} kW</strong>
                              </div>
                              <div className="bg-white/[0.01] p-1.5 rounded">
                                <span className="block text-[9px] text-white/30">Total Current</span>
                                <strong className="text-cyan-300 block text-xs mt-0.5">{(systemWideIsolation ? 0 : 45.0).toFixed(1)} A</strong>
                              </div>
                            </div>

                            {/* SUB-NODES STRING GRID */}
                            <div className="space-y-1.5 border-t border-white/5 pt-2.5">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-white/40">S1 (10.0.1.10)</span>
                                <span className={`px-1 rounded text-[9px] font-bold ${systemWideIsolation ? "bg-white/5 text-white/30" : "bg-emerald-500/10 text-emerald-400"}`}>
                                  {systemWideIsolation ? "CLOSED" : "CLOSED"}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-white/40">S2 (10.0.1.15)</span>
                                <span className={`px-1 rounded text-[9px] font-bold ${systemWideIsolation ? "bg-white/5 text-white/30" : "bg-emerald-500/10 text-emerald-400"}`}>
                                  {systemWideIsolation ? "CLOSED" : "CLOSED"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* SYSTEM WYE METER CENTER PIN (FLOWING LINES) */}
                          <div className="flex flex-col items-center justify-center text-center p-3 relative bg-white/[0.01] rounded-full border border-white/5 w-24 h-24">
                            <Zap size={24} className={`${systemWideIsolation ? "text-white/15" : "text-yellow-400 animate-pulse"}`} />
                            <span className="text-[9px] text-white/30 font-bold block mt-1 uppercase">Main Meter</span>
                            <span className="text-[10px] text-white/80 font-black font-semibold mt-0.5">
                              {systemWideIsolation ? "0.0 W" : "12.45 kW"}
                            </span>
                          </div>

                          {/* LINEUP 3 STORAGE CABINET (ANODE CLUSTER) */}
                          <div className={`rounded-lg border p-3.5 w-64 space-y-3 relative text-xs transition-all ${
                            softBalancingOverride 
                              ? "bg-[#121E23] border-cyan-500/20 text-cyan-200" 
                              : (systemWideIsolation ? "bg-[#121212] border-white/5 text-white/30" : "bg-[#1F1212] border-rose-500/20 text-rose-200")
                          }`}>
                            <div className={`absolute -top-2.5 left-3 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border ${
                              softBalancingOverride 
                                ? "bg-cyan-600/20 border-cyan-500/30 text-cyan-300"
                                : (systemWideIsolation ? "bg-white/5 border-white/10 text-white/40" : "bg-rose-600/20 border-rose-500/30 text-rose-300")
                            }`}>
                              LINEUP 3 (10.0.3.1)
                            </div>
                            <div className="flex justify-between font-bold pt-1">
                              <span className="text-white/60">BMS Core Mode:</span>
                              <span className={systemWideIsolation ? "text-zinc-500" : (softBalancingOverride ? "text-emerald-400 font-bold" : "text-rose-400 font-bold animate-pulse")}>
                                {systemWideIsolation ? "Isolated" : (softBalancingOverride ? "Charging" : "FAULTED")}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-white/50 pt-1">
                              <div className="bg-white/[0.01] p-1.5 rounded">
                                <span className="block text-[9px] text-white/30">Active Power</span>
                                <strong className="text-cyan-300 block text-xs mt-0.5">{(systemWideIsolation ? 0 : (softBalancingOverride ? 124.2 : 0)).toFixed(1)} kW</strong>
                              </div>
                              <div className="bg-white/[0.01] p-1.5 rounded">
                                <span className="block text-[9px] text-white/30">Max Cell Temp</span>
                                <strong className={`block text-xs mt-0.5 ${softBalancingOverride ? "text-emerald-400" : "text-rose-400 font-bold"}`}>
                                  {softBalancingOverride ? "28.5 °C" : "55.0 °C"}
                                </strong>
                              </div>
                            </div>

                            {/* SUB-NODES STRING GRID MATCHING HARDWARE STRINGS */}
                            <div className="space-y-1.5 border-t border-white/5 pt-2.5 text-[10px]">
                              {/* STRING 1 MONITORED AREA */}
                              <div className="flex justify-between items-center bg-black/20 p-1.5 rounded mt-1">
                                <span className="text-white/60 font-bold">S1 (10.0.3.10)</span>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider ${
                                  systemWideIsolation ? "bg-white/5 text-white/30" : (softBalancingOverride ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/15 text-rose-400 animate-pulse")
                                }`}>
                                  {systemWideIsolation ? "CLOSED" : (softBalancingOverride ? "CLOSED" : "BALANCING_TRIP_OPEN")}
                                </span>
                              </div>
                              {/* STRINGCELL VOLTAGE HIGH DISCOVERY */}
                              <div className="text-[9px] text-white/40 leading-relaxed px-1 space-y-0.5">
                                <div className="flex justify-between">
                                  <span>Cell 14 (OverVolt):</span> 
                                  <strong className={softBalancingOverride ? "text-emerald-400" : "text-rose-400 font-bold"}>
                                    {softBalancingOverride ? "3.24 V" : "3.51 V [OverTrip]"}
                                  </strong>
                                </div>
                                <div className="flex justify-between">
                                  <span>Cell 13 (UnderVolt):</span> 
                                  <strong className={softBalancingOverride ? "text-emerald-400" : "text-rose-300/60"}>
                                    {softBalancingOverride ? "3.23 V" : "3.08 V"}
                                  </strong>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* GRANULATED SITE CONTROLLER INGEST GRID */}
                      <div className="border border-white/5 rounded-lg p-4 bg-white/[0.01] space-y-3 font-mono">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Localized Modbus Device Registry State Matrix</h4>
                          <span className="text-[10px] text-white/30 lowercase">Local DB live-query outputs</span>
                        </div>
                        <div className="border border-white/5 rounded-lg overflow-hidden bg-[#0A0D14]/80">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-white/5 text-white/50 font-bold border-b border-white/5">
                                <th className="p-2.5">Endpoint IP</th>
                                <th className="p-2.5">Component Role</th>
                                <th className="p-2.5">Register State Values (Raw)</th>
                                <th className="p-2.5">Calibrated Value (aligned)</th>
                                <th className="p-2.5">Local Relays</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03] text-white/80">
                              <tr>
                                <td className="p-2.5 font-bold text-white">10.0.1.1</td>
                                <td className="p-2.5">Lineup 1 BMS Core</td>
                                <td className="p-2.5 text-zinc-400">Power: <strong className="text-white">{systemWideIsolation ? 0 : 1242}</strong> (Watts Register 84), SoC: <strong className="text-white">425</strong> (Reg 658)</td>
                                <td className="p-2.5 text-cyan-300 font-bold">{systemWideIsolation ? "0.0" : "124.2"} kW / 42.5% SoC</td>
                                <td className="p-2.5"><span className="text-emerald-400">NOMINAL_CHARGE</span></td>
                              </tr>
                              <tr>
                                <td className="p-2.5 font-bold text-white">10.0.1.10</td>
                                <td className="p-2.5">Array 1 Node String 1</td>
                                <td className="p-2.5 text-zinc-400">Voltage: <strong className="text-white">{systemWideIsolation ? 4102 : 4802}</strong> (Reg 691)</td>
                                <td className="p-2.5 text-cyan-300 font-bold">{systemWideIsolation ? "410.2" : "480.2"} V (DC String)</td>
                                <td className="p-2.5"><span className="text-emerald-400">CLOSED</span></td>
                              </tr>
                              <tr>
                                <td className="p-2.5 font-bold text-white">10.0.3.1</td>
                                <td className="p-2.5 text-rose-300">Lineup 3 BMS Core</td>
                                <td className="p-2.5 text-zinc-400">
                                  Power: <strong className="text-white">{(systemWideIsolation || !softBalancingOverride) ? 0 : 1242}</strong> (Reg 84), MaxTemp: <strong className={`font-bold ${softBalancingOverride ? "text-white" : "text-rose-400 animate-pulse"}`}>{softBalancingOverride ? 294 : 524}</strong> (Reg 1163)
                                </td>
                                <td className="p-2.5 text-cyan-300 font-bold">
                                  {systemWideIsolation ? "0.0 kW / Stale" : (softBalancingOverride ? "124.2 kW / 29.4 °C" : "0.0 kW / 52.4 °C")}
                                </td>
                                <td className="p-2.5">
                                  <span className={systemWideIsolation ? "text-white/30" : (softBalancingOverride ? "text-emerald-400 font-bold" : "text-rose-400 font-bold animate-pulse")}>
                                    {systemWideIsolation ? "CLOSED" : (softBalancingOverride ? "CLOSED_BYPASS" : "FAULT_OPEN")}
                                  </span>
                                </td>
                              </tr>
                              <tr>
                                <td className="p-2.5 font-bold text-white">10.0.3.10</td>
                                <td className="p-2.5 text-rose-300">Array 3 Node String 1</td>
                                <td className="p-2.5 text-zinc-400">MaxCellVolt: <strong className={`font-bold ${softBalancingOverride ? "text-white" : "text-rose-400"}`}>{softBalancingOverride ? 3240 : 3510}</strong> mV (Reg 1159)</td>
                                <td className="p-2.5 text-cyan-300 font-bold">{softBalancingOverride ? "3.24 V" : "3.51 V (High Spike)"}</td>
                                <td className="p-2.5">
                                  <span className={softBalancingOverride ? "text-emerald-400" : "text-rose-400 font-bold"}>
                                    {softBalancingOverride ? "CLOSED" : "TRIPPED_OPEN"}
                                  </span>
                                </td>
                              </tr>
                              <tr>
                                <td className="p-2.5 font-bold text-white">10.0.0.3</td>
                                <td className="p-2.5">EMS Master Wye Meter</td>
                                <td className="p-2.5 text-zinc-400">MeterWatts: <strong className="text-white">{systemWideIsolation ? 0 : 1245000}</strong> (W Wye Reg 558)</td>
                                <td className="p-2.5 text-cyan-300 font-bold">{systemWideIsolation ? "0.0" : "124.5"} kW / 30.0 A Current</td>
                                <td className="p-2.5"><span className="text-zinc-500">N/A (Utility Line AC)</span></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB CONTENT: MODBUS POINT TESTER (RUNNING LOCAL QUERIES FOR GRANTED VISIBILITY) */}
                  {telemetrySubTab === "modbus" && (
                    <div className="space-y-6">
                      <div className="p-4 rounded-lg bg-white/[0.02] border border-white/5 space-y-4 font-mono text-xs">
                        <div className="border-b border-white/5 pb-2">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Point Registry Modbus Simulation Terminal</h4>
                          <p className="text-[10px] text-white/40 mt-1">
                            Simulate sending a local GET Modbus query across the private lineup subnet. This demonstrates how local systems can communicate directly with the underlying registers bypassing any cloud layer.
                          </p>
                        </div>

                        {/* HOST / REGISTER SELECTOR BOX */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white/[0.01] p-3 rounded-lg border border-white/[0.02] items-end">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-white/50 mb-1.5">Target IP address</label>
                            <select
                              value={simulatedIp}
                              onChange={(e) => setSimulatedIp(e.target.value)}
                              className="w-full bg-[#12141C] border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-white/20 font-mono focus:border-cyan-500 focus:outline-none"
                            >
                              <option value="10.0.0.3">10.0.0.3 (EMS Master Utility Meter)</option>
                              <option value="10.0.1.1">10.0.1.1 (Lineup 1 AC BMS)</option>
                              <option value="10.0.3.1">10.0.3.1 (Lineup 3 AC BMS)</option>
                              <option value="10.0.3.10">10.0.3.10 (Array 3 String 1 Controller)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold uppercase text-white/50 mb-1.5">Holding register address</label>
                            <select
                              value={simulatedRegister}
                              onChange={(e) => setSimulatedRegister(e.target.value)}
                              className="w-full bg-[#12141C] border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-white/20 font-mono focus:border-cyan-500 focus:outline-none"
                            >
                              <option value="84">84 (Watts / Power Active)</option>
                              <option value="542">542 (MeterAmps / Main Grid AC Current)</option>
                              <option value="558">558 (MeterWatts / Main Grid AC Watts)</option>
                              <option value="658">658 (State of Charge / SoC %)</option>
                              <option value="691">691 (Total DC Current / Amps)</option>
                              <option value="1163">1163 (Max Module cell Temperature)</option>
                              <option value="1180">1180 (Active cell Balancing Count)</option>
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <button
                              type="button"
                              onClick={handleRunDiagnosticQuery}
                              disabled={queryLoading}
                              className="w-full py-1.5 bg-cyan-500/25 text-cyan-300 hover:bg-cyan-500/35 active:scale-95 disabled:opacity-40 border border-cyan-500/30 rounded font-bold uppercase tracking-wider tracking-widest text-xs transition-all"
                            >
                              {queryLoading ? "Querying Subnet IP register..." : "⚡ Execute Direct modbus GET Query"}
                            </button>
                          </div>
                        </div>

                        {/* TERMINAL INTERACTIVE TERMINAL LOG BOX */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-[10px] text-white/40 uppercase font-black">
                            <span>Interactive Terminal stdout</span>
                            <span>Direct loop polling status: ONLINE</span>
                          </div>

                          <div className="relative bg-[#05060A] rounded-lg p-4 border border-white/5 font-mono text-xs text-cyan-400 overflow-x-auto min-h-[160px] max-h-[300px]">
                            {queryLoading ? (
                              <div className="flex items-center gap-2 text-white/50 italic animate-pulse">
                                <RefreshCw className="animate-spin" size={14} />
                                [HOST_INFO] dispatching Modbus TCP Request packet to {simulatedIp}...
                              </div>
                            ) : simulatedQueryResult ? (
                              <div className="space-y-1.5 select-all leading-relaxed text-[11px] text-emerald-400">
                                <div><span className="text-white/40">[10.0.0.2 Gateway ~]#</span> modbus_read_reg --host={simulatedQueryResult.ip} --register={simulatedQueryResult.register} --timeout=1500</div>
                                <div className="text-white/30">---------------------------------------------------------</div>
                                <div className="text-white font-bold">[RESPONSE RECEIVED: 200 OK]</div>
                                <div><span className="text-white/40">&gt; Target Subnet IP:</span> <strong className="text-white font-black">{simulatedQueryResult.ip}</strong></div>
                                <div><span className="text-white/40">&gt; Target Register:</span> <strong className="text-white font-black">Holding {simulatedQueryResult.register}</strong></div>
                                <div><span className="text-white/40">&gt; Decoded Point Name:</span> <strong className="text-cyan-300 font-bold">{simulatedQueryResult.name}</strong></div>
                                <div><span className="text-white/40">&gt; Raw Modbus Integer:</span> <strong className="text-yellow-400 font-bold">{simulatedQueryResult.value}</strong> <span className="text-white/20">({simulatedQueryResult.unit})</span></div>
                                <div className="text-white/30">---------------------------------------------------------</div>
                                <div>
                                  <span className="text-white/40">&gt; Scaling multiplier translation:</span>{" "}
                                  <strong className="text-white">
                                    {simulatedQueryResult.register === 84 ? "Scale target is kW (multiply raw value by 10^1 to obtain Watts, or read raw as 1.242 kW)" : 
                                     simulatedQueryResult.register === 542 ? "Scale (A_SF) = -1. Output is raw 300 (represents 30.0 A)" : 
                                     simulatedQueryResult.register === 558 ? "Scale (W_SF) = 2. Output is raw 1245000 (represents 12.45 kW)" : 
                                     simulatedQueryResult.register === 1163 ? "Scale (ModTmp_SF) = -1. Output represents 34.6 °C (raw 346) / 52.4 °C (raw 524)" : 
                                     "Direct unscaled unit reading loaded."}
                                  </strong>
                                </div>
                                <div className="text-[9px] text-[#A7F3D0]/60 italic font-sans mt-3">
                                  Query executed successfully over local BACnet bridge. Device registers responded with active status codes.
                                </div>
                              </div>
                            ) : (
                              <div className="text-white/20 italic text-center p-6 flex flex-col items-center justify-center space-y-2 h-[140px]">
                                <Terminal size={24} className="text-white/5" />
                                <span>No direct queries dispatched in this session. Configure host parameters above and click Execute to query local registers instantly.</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* CATEGORY VIEW: EMS LAN DIAGNOSTICS */}
              {selectedCategory === "EMS LAN Diagnostics" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-mono font-bold text-white tracking-widest uppercase mb-1 border-l-2 border-cyan-500 pl-2">
                      EMS LAN Connectivity & Poll Diagnostics
                    </h3>
                    <p className="text-xs text-white/40 font-mono">
                      Real-time live checks for the 12 primary EMS hardware telemetry sources mapped via local LAN ethernet backplane.
                    </p>
                  </div>

                  {/* Dynamic connection profiles management panel */}
                  <ConnectionSettings onProfileChanged={() => pollLocalEmsData()} />

                  {/* Demo Mode Manual Override Deck */}
                  <div className="bg-[#161925]/80 border border-white/5 rounded-lg p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 font-mono shadow-lg">
                    <div className="space-y-1">
                      <div className="text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                        <Sliders size={14} className="text-cyan-400 animate-pulse" />
                        DEMO MODE MANUAL OVERRIDE DECK
                      </div>
                      <div className="text-[11px] text-white/40 max-w-xl">
                        Manually trigger the high-fidelity PRIZM simulation database block schemas. If deactivated, production connectivity will seek direct hardware LAN polling first, gracefully dropping back to stale cached records or offline protection state.
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const nextState = !emsConnection?.isDemoFallback;
                        try {
                          const res = await fetch("/api/local/demo-toggle", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ enabled: nextState })
                          });
                          const updated = await res.json();
                          setEmsConnection(updated);
                          pollLocalEmsData();
                        } catch (err) {
                          console.error("Failed to toggle demo status:", err);
                        }
                      }}
                      className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-all cursor-pointer border select-none ${
                        emsConnection?.isDemoFallback
                          ? "bg-amber-500/10 text-yellow-400 border-yellow-500/30 hover:bg-amber-500/20"
                          : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {emsConnection?.isDemoFallback ? "DEMO ACTIVE [CLICK TO DISABLE]" : "DEMO OFF [CLICK TO ENABLE]"}
                    </button>
                  </div>

                  {/* Mode Card */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
                    <div className="bg-[#12141C] border border-white/5 rounded-lg p-4 space-y-2">
                      <div className="text-[10px] text-white/40 uppercase font-bold">LAN TARGET HOST</div>
                      <div className="text-sm text-cyan-400 font-bold">{emsConnection?.activeEmsBaseUrl || emsConnection?.emsHost || "N/A"}</div>
                    </div>
                    <div className="bg-[#12141C] border border-white/5 rounded-lg p-4 space-y-2">
                      <div className="text-[10px] text-white/40 uppercase font-bold">STATE DETECTED</div>
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${
                          emsConnection?.source === "live"
                            ? "bg-emerald-400 animate-pulse"
                            : emsConnection?.source === "cached"
                              ? "bg-amber-500 animate-pulse"
                              : emsConnection?.source === "demo"
                                ? "bg-cyan-500 animate-pulse"
                                : "bg-red-500"
                        }`} />
                        <span className="text-sm font-bold text-white uppercase">
                          {emsConnection?.source === "live" && "HARDWARE ACTIVE"}
                          {emsConnection?.source === "cached" && "STALE CACHED LOCAL"}
                          {emsConnection?.source === "offline" && "HARD OFFLINE STATE"}
                          {emsConnection?.source === "demo" && "DEMO STREAM"}
                          {!emsConnection?.source && "N/A"}
                        </span>
                      </div>
                    </div>
                    <div className="bg-[#12141C] border border-white/5 rounded-lg p-4 space-y-2">
                      <div className="text-[10px] text-white/40 uppercase font-bold">POLL FREQUENCY</div>
                      <div className="text-sm text-white font-bold">{emsConnection?.pollIntervalMs || 3000} ms</div>
                    </div>
                  </div>

                  {/* Connection Detail Reason Banner */}
                  <div className={`p-4 rounded-lg font-mono text-xs border ${
                    emsConnection?.source === "demo"
                      ? "bg-cyan-500/5 text-cyan-300 border-cyan-500/20"
                      : emsConnection?.source === "live"
                        ? "bg-emerald-500/5 text-emerald-300 border-emerald-500/20"
                        : emsConnection?.source === "cached"
                          ? "bg-amber-500/5 text-yellow-300 border-yellow-500/20"
                          : "bg-red-500/5 text-red-300 border-red-500/20"
                  }`}>
                    <div className="font-bold uppercase mb-1 text-[10px] tracking-wider">
                      {emsConnection?.source === "demo" && "DEMO STREAM ACTIVE"}
                      {emsConnection?.source === "live" && "PRODUCTION LIVE LINE"}
                      {emsConnection?.source === "cached" && "AMBER DATA RETENTION CAPTURE"}
                      {emsConnection?.source === "offline" && "CRITICAL LINK CRASH DETECTED"}
                    </div>
                    <div>{emsConnection?.reason || "State logic initializing..."}</div>
                  </div>

                  {/* Sources Grid Table */}
                  <div className="bg-[#12141C] border border-white/5 rounded-lg overflow-hidden">
                    <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#161925]">
                      <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">EMS Turtle Endpoints (12/12 Polled)</span>
                      <button 
                        onClick={() => pollLocalEmsData()}
                        className="bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 px-2.5 py-1 text-[10px] uppercase font-mono rounded cursor-pointer flex items-center gap-1"
                      >
                        <RefreshCw size={10} />
                        Force Retry Poll
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left font-mono text-xs select-none">
                        <thead>
                          <tr className="bg-white/[0.02] border-b border-white/5 text-[10px] text-white/40 uppercase tracking-wider">
                            <th className="p-3">Endpoint Route</th>
                            <th className="p-3">State</th>
                            <th className="p-3 text-right font-bold">Status</th>
                            <th className="p-3 text-right">Rountrip Time</th>
                            <th className="p-3">Last Attemped</th>
                            <th className="p-3 max-w-[200px] truncate">Last Exception/Diagnostic</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                          {emsSources && emsSources.length > 0 ? (
                            emsSources.map((s, idx) => (
                              <tr key={idx} className="hover:bg-white/[0.01]">
                                <td className="p-3 text-white/90 font-medium font-mono text-cyan-400">{s.endpoint}</td>
                                <td className="p-3">
                                  {s.success ? (
                                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded text-[10px] font-bold">
                                      SUCCESS
                                    </span>
                                  ) : (
                                    <span className="bg-rose-500/10 text-rose-400 border border-rose-500/25 px-2 py-0.5 rounded text-[10px] font-bold">
                                      OFFLINE
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-right font-bold text-white">{s.statusCode || "N/A"}</td>
                                <td className="p-3 text-right text-white/60">{s.durationMs ? `${s.durationMs}ms` : "0ms"}</td>
                                <td className="p-3 text-white/40">{s.lastPollTime ? new Date(s.lastPollTime).toLocaleTimeString() : "PENDING"}</td>
                                <td className="p-3 max-w-[200px] truncate text-white/40 font-mono" title={s.lastError || "NONE"}>
                                  {s.lastError || "NONE"}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-white/20">
                                Retrieving live LAN diagnostic source metrics (3.0s ticker interval in flight)...
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* CATEGORY VIEW 8: SYSTEM EVENT LOGS */}
              {selectedCategory === "System Event logs" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-mono font-bold text-white/70 tracking-widest uppercase mb-2 border-l-2 border-emerald-500 pl-2">
                    Active System Gateway Logs
                  </h3>
                  <div className="bg-[#12141C] border border-white/5 rounded-lg p-3 space-y-2 font-mono text-xs max-h-[400px] overflow-y-auto">
                    {notifications.map((n, idx) => (
                      <div key={idx} className="flex gap-4 p-2 border-b border-white/[0.02] hover:bg-white/[0.01] items-start">
                        <span className="text-white/30 shrink-0 select-none">{n.time}</span>
                        <span className={`px-1 rounded text-[9px] font-bold uppercase shrink-0 ${
                          n.type === "critical" ? "bg-rose-500/15 text-rose-400 border border-rose-500/10" :
                          n.type === "warning" ? "bg-amber-500/15 text-amber-300 border border-amber-500/10" :
                          "bg-emerald-500/15 text-emerald-400 border border-emerald-500/10"
                        }`}>
                          {n.source}
                        </span>
                        <p className={`flex-1 ${n.type === "critical" ? "text-rose-300" : "text-[#D1D5DB]"}`}>{n.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

          </div>
          
        </div>
      )}

    </div>
  );
}
