import React from "react";
import { 
  Zap, 
  Activity, 
  ShieldAlert, 
  Sliders, 
  Cpu, 
  FileText, 
  Heart, 
  Check, 
  AlertTriangle,
  Flame,
  Wind,
  DoorOpen,
  Droplet,
  Settings,
  Battery
} from "lucide-react";

interface SystemDetailsViewProps {
  onSelectCategory: (category: string) => void;
  pollCounter: number;
  telemetry?: {
    chargePower: string;
    dischargePower: string;
    chargeEnergy: string;
    dischargeEnergy: string;
    dcOnline: string;
    dcNearline: string;
    acOnline: string;
    realPowerMeasured: string;
    realPowerCommanded: string;
    reactivePowerMeasured: string;
    reactivePowerCommanded: string;
  };
  electricalDevices?: {
    name: string;
    total: number;
    healthy: number;
    unhealthy: number;
    statusText: string;
    categoryLink: string;
    alerts: string;
  }[];
  environmentalDevices?: {
    name: string;
    total: number;
    healthy: number;
    unhealthy: number;
    statusText: string;
    categoryLink?: string;
  }[];
  stackApps?: {
    priority: number;
    checked: boolean;
    name: string;
    config: string;
    status: string;
  }[];
  plugins?: {
    actions: string;
    active: boolean;
    name: string;
    status: string;
  }[];
}

export default function SystemDetailsView({ 
  onSelectCategory, 
  pollCounter,
  telemetry: propTelemetry,
  electricalDevices: propElectricalDevices,
  environmentalDevices: propEnvironmentalDevices,
  stackApps: propStackApps,
  plugins: propPlugins
}: SystemDetailsViewProps) {
  // Mock live values matching the screenshots if props not provided
  const telemetry = propTelemetry || {
    chargePower: "0.0 kW",
    dischargePower: "0.0 kW",
    chargeEnergy: "0.0 kWh",
    dischargeEnergy: "0.0 kWh",
    dcOnline: "0.0 kWh",
    dcNearline: "0.0 kWh",
    acOnline: "0.0 kWh",
    realPowerMeasured: "0.0 kW",
    realPowerCommanded: "0.0 kW",
    reactivePowerMeasured: "0.0 kVAR",
    reactivePowerCommanded: "0.0 kVAR"
  };

  const electricalDevices = propElectricalDevices || [
    { name: "Block Meters", total: 1, healthy: 0, unhealthy: 1, statusText: "0 Healthy | 1 Unhealthy", categoryLink: "Summary", alerts: "" },
    { name: "AC Batteries", total: 8, healthy: 8, unhealthy: 0, statusText: "8 Healthy | 0 Unhealthy", categoryLink: "Arrays", alerts: "" },
    { name: "PCSes", total: 8, healthy: 8, unhealthy: 0, statusText: "8 Healthy | 0 Unhealthy", categoryLink: "PCS List", alerts: "" },
    { name: "Arrays", total: 8, healthy: 8, unhealthy: 0, statusText: "8 Healthy | 0 Unhealthy", categoryLink: "Arrays", alerts: "" },
    { name: "Strings", total: 320, healthy: 0, standby: 0, unhealthy: 320, statusText: "0 On | 0 Near | 320 Off | 0 NC", categoryLink: "String List", alerts: "" },
  ];

  const environmentalDevices = propEnvironmentalDevices || [
    { name: "Centipede Lineups", total: 8, healthy: 0, unhealthy: 8, statusText: "0 Healthy | 8 Unhealthy" },
    { name: "Collection Segments", total: 8, healthy: 1, unhealthy: 7, statusText: "1 Healthy | 7 Unhealthy" },
    { name: "Energy Segments", total: 160, healthy: 77, unhealthy: 83, statusText: "77 Healthy | 83 Unhealthy", categoryLink: "Energy Segments" },
    { name: "Fire Safety Sensors", total: 512, healthy: 509, unhealthy: 3, statusText: "509 Untripped | 3 Tripped", categoryLink: "Sensors" },
    { name: "Gas Sensors", total: 320, healthy: 283, unhealthy: 37, statusText: "283 Untripped | 37 Tripped", categoryLink: "Sensors" },
    { name: "Door Sensors", total: 344, healthy: 285, unhealthy: 59, statusText: "285 Untripped | 59 Tripped", categoryLink: "Sensors" },
    { name: "Moisture Sensors", total: 160, healthy: 160, unhealthy: 0, statusText: "160 Untripped | 0 Tripped", categoryLink: "Sensors" },
    { name: "Environmental Controllers", total: 168, healthy: 164, unhealthy: 4, statusText: "164 Healthy | 4 Unhealthy", categoryLink: "Energy Segments" },
    { name: "Stack Managers", total: 8, healthy: 8, unhealthy: 0, statusText: "8 Healthy | 0 Unhealthy", categoryLink: "Stack Managers" },
    { name: "HVACs", total: 168, healthy: 167, unhealthy: 1, statusText: "167 Healthy | 1 Unhealthy", categoryLink: "HVACs" },
    { name: "UPSes", total: 32, healthy: 24, unhealthy: 8, statusText: "24 Healthy | 8 Unhealthy", categoryLink: "UPSes" },
  ];

  const stackApps = propStackApps || [
    { priority: 0, checked: true, name: "E-Stop Response v1.0", config: "default / 0", status: "ACBattery BHE0020:1:3: 20 trips; ACBattery BHE0020:1:4: 39 trips; ACBattery BHE0020:1:5: 23 trips..." },
    { priority: 1, checked: true, name: "Battery Safety v1.0", config: "default / 0", status: "ACBattery BHE0020:1:1 - NOTREADY / Codes : NRACBattery BHE0020:1:2 - NOTREADY..." },
    { priority: 2, checked: true, name: "High Current Protection App v1.0", config: "default / 0", status: "No derates." },
    { priority: 4, checked: true, name: "Block Power", config: "default / 0", status: "Blocking all power." },
    { priority: 300, checked: true, name: "Centipede Thermal Control v1.0", config: "default / 0", status: "OFF:262, 10-30%:58, 30-50%:0, 50-70%:0, 70-90%:0, 90-100%:0" },
    { priority: 999, checked: true, name: "Backstop v1.0", config: "default / 0", status: "Set to Standby (ZP) : ACBattery BHE0020:1:1 ACBattery BHE0020:1:2..." }
  ];

  const plugins = propPlugins || [
    { actions: "•••", active: false, name: "Sitewide Balancer Manager", status: "Not Enabled" },
    { actions: "•••", active: false, name: "Battery Pack Level Balancer Manager", status: "Not Enabled" },
    { actions: "•••", active: false, name: "Auto Balancer", status: "Not Enabled" },
    { actions: "•••", active: false, name: "Auto Contactor Management", status: "Not Enabled" }
  ];


  // Renders a high-fidelity BESS diagonal health striped bar matching the layout
  const renderHealthBar = (healthy: number, unhealthy: number, total: number, specialType?: string) => {
    if (specialType === "strings") {
      // 0 On | 0 Near | 320 Off
      return (
        <div className="flex h-3 w-32 bg-rose-900/40 rounded-sm overflow-hidden border border-rose-950/50">
          <div className="w-full h-full bg-repeating-stripes-red" title="320 Off"></div>
        </div>
      );
    }

    const healthyPct = total > 0 ? (healthy / total) * 100 : 100;
    const unhealthyPct = 100 - healthyPct;

    if (unhealthy === 0) {
      return (
        <div className="flex h-3 w-32 bg-emerald-950/20 rounded-sm overflow-hidden border border-emerald-900/30">
          <div className="bg-emerald-500 h-full w-full" title="All Healthy"></div>
        </div>
      );
    } else if (healthy === 0) {
      return (
        <div className="flex h-3 w-32 bg-rose-900/20 rounded-sm overflow-hidden border border-rose-900/30">
          <div className="h-full w-full bg-repeating-stripes-red" title="All Unhealthy"></div>
        </div>
      );
    } else {
      return (
        <div className="flex h-3 w-32 bg-white/5 rounded-sm overflow-hidden border border-white/10">
          <div className="bg-emerald-500 h-full" style={{ width: `${healthyPct}%` }} title={`${healthy} Healthy`}></div>
          <div className="h-full bg-repeating-stripes-red" style={{ width: `${unhealthyPct}%` }} title={`${unhealthy} Unhealthy`}></div>
        </div>
      );
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-5 min-h-[600px] bg-[#08090C] text-slate-300">
      
      {/* LEFT TELEMETRY COLUMN */}
      <div className="w-full md:w-56 shrink-0 bg-[#0E1017] border border-white/5 rounded p-3 text-xs space-y-4 font-mono select-none shadow-md">
        <div className="border-b border-white/5 pb-1 flex justify-between items-center bg-white/[0.01] px-1.5 py-0.5 rounded">
          <span className="text-[10px] uppercase font-bold text-slate-400">System Details Stats</span>
          <span className="text-[9px] text-[#5CF2A5] animate-pulse">● Connected</span>
        </div>

        {/* 1. AVAILABILITY */}
        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Availability</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Charge Power</span>
              <span className="text-white font-bold">{telemetry.chargePower}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Discharge Power</span>
              <span className="text-white font-bold">{telemetry.dischargePower}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Charge Energy</span>
              <span className="text-white font-bold">{telemetry.chargeEnergy}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Discharge Energy</span>
              <span className="text-white font-bold">{telemetry.dischargeEnergy}</span>
            </div>
          </div>
        </div>

        {/* 2. ENERGY CAPACITY */}
        <hr className="border-white/5" />
        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Energy Capacity</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">DC Online</span>
              <span className="text-white font-bold">{telemetry.dcOnline}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">DC Nearline</span>
              <span className="text-white font-bold">{telemetry.dcNearline}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">AC Online</span>
              <span className="text-white font-bold">{telemetry.acOnline}</span>
            </div>
          </div>
        </div>

        {/* 3. REAL POWER */}
        <hr className="border-white/5" />
        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Real Power</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Measured</span>
              <span className="text-white font-bold">{telemetry.realPowerMeasured}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Commanded</span>
              <span className="text-white font-bold">{telemetry.realPowerCommanded}</span>
            </div>
          </div>
        </div>

        {/* 4. REACTIVE POWER */}
        <hr className="border-white/5" />
        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Reactive Power</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Measured</span>
              <span className="text-slate-350">{telemetry.reactivePowerMeasured}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Commanded</span>
              <span className="text-slate-350">{telemetry.reactivePowerCommanded}</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT MAIN LAYOUT PANEL */}
      <div className="flex-1 space-y-6">
        
        {/* SUB-HEADER TAB CONTROL TOOLBAR AND STATUS */}
        <div className="flex justify-between items-center bg-[#0F1117] border border-white/5 p-2 px-3 rounded text-xs select-none">
          <div className="flex items-center gap-1.5">
            <Sliders size={12} className="text-cyan-400" />
            <span className="font-mono text-white font-bold text-[11px] tracking-wide uppercase">System Details Matrix</span>
            <span className="text-white/20 font-sans">|</span>
            <span className="text-[10px] text-slate-400 font-mono">BHE0020 :: Block 1</span>
          </div>
          <div className="flex gap-1.5 font-mono text-[10px]">
            <button className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded font-bold uppercase transition-all">Tabular</button>
            <button className="text-white/40 hover:text-white/80 px-2 py-0.5 rounded font-bold uppercase transition-all">Oneline</button>
          </div>
        </div>

        {/* 1. ELECTRICAL DEVICES TABLE */}
        <div className="space-y-2">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1 border-b border-white/5 pb-1 select-none">
            <span>▼</span>
            <span>Electrical Devices</span>
          </div>
          <div className="border border-white/5 rounded overflow-hidden">
            <table className="w-full block-tabular-theme text-left font-mono text-[11px] leading-normal border-collapse">
              <thead>
                <tr className="bg-[#11131A] text-slate-400 uppercase text-[9px] border-b border-white/5">
                  <th className="p-2 w-16 text-center">Actions</th>
                  <th className="p-2 w-48">Type</th>
                  <th className="p-2 w-20 text-center">Total</th>
                  <th className="p-2 w-36">Health</th>
                  <th className="p-2">Alerts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {electricalDevices.map((dev, idx) => (
                  <tr 
                    key={idx} 
                    onClick={() => dev.categoryLink && onSelectCategory(dev.categoryLink)}
                    className="hover:bg-cyan-500/[0.02] cursor-pointer group transition-colors"
                  >
                    <td className="p-2 text-center text-white/30 group-hover:text-cyan-400 font-bold select-none text-[12px]">•••</td>
                    <td className="p-2">
                      <span className="text-slate-300 font-bold underline group-hover:text-cyan-300 cursor-pointer">{dev.name}</span>
                    </td>
                    <td className="p-2 text-center text-white font-bold">{dev.total}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        {renderHealthBar(dev.healthy, dev.unhealthy, dev.total, dev.name === "Strings" ? "strings" : undefined)}
                        <span className="text-[10px] text-slate-400 font-bold">{dev.statusText}</span>
                      </div>
                    </td>
                    <td className="p-2 text-rose-400 font-bold text-[10px]">{dev.alerts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. ENVIRONMENTAL DEVICES TABLE */}
        <div className="space-y-2">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1 border-b border-white/5 pb-1 select-none">
            <span>▼</span>
            <span>Environmental Devices</span>
          </div>
          <div className="border border-white/5 rounded overflow-hidden">
            <table className="w-full block-tabular-theme text-left font-mono text-[11px] leading-normal border-collapse">
              <thead>
                <tr className="bg-[#11131A] text-slate-400 uppercase text-[9px] border-b border-white/5">
                  <th className="p-2 w-48">Type</th>
                  <th className="p-2 w-20 text-center">Total</th>
                  <th className="p-2 w-36">Health</th>
                  <th className="p-2">Details / Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {environmentalDevices.map((dev, idx) => (
                  <tr 
                    key={idx} 
                    onClick={() => dev.categoryLink && onSelectCategory(dev.categoryLink)}
                    className="hover:bg-cyan-500/[0.02] cursor-pointer group transition-colors"
                  >
                    <td className="p-2">
                      <span className={`text-slate-300 font-bold ${dev.categoryLink ? "underline group-hover:text-cyan-300 cursor-pointer" : ""}`}>{dev.name}</span>
                    </td>
                    <td className="p-2 text-center text-white font-bold">{dev.total}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        {renderHealthBar(dev.healthy, dev.unhealthy, dev.total, dev.name.includes("Sensors") ? "sensors" : undefined)}
                        <span className="text-[10px] text-slate-400 font-bold">{dev.statusText}</span>
                      </div>
                    </td>
                    <td className="p-2 text-white/40 text-[10px] group-hover:text-white/60">
                      {dev.categoryLink ? "Jump to detailed views ↗" : "System integrated"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. CONTROL LOOP: STACKOS APPS */}
        <div className="space-y-2">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1 border-b border-white/5 pb-1 select-none">
            <span>▼</span>
            <span>Control Loop :: StackOS Apps (Enabled 6 / 9)</span>
          </div>
          <div className="border border-white/5 rounded overflow-hidden">
            <table className="w-full block-tabular-theme text-left font-mono text-[11px] leading-normal border-collapse">
              <thead>
                <tr className="bg-[#11131A] text-slate-400 uppercase text-[9px] border-b border-white/5">
                  <th className="p-2 w-16 text-center">Actions</th>
                  <th className="p-2 w-12 text-center">✔</th>
                  <th className="p-2 w-20 text-center">Priority</th>
                  <th className="p-2 w-56">App Name</th>
                  <th className="p-2 w-24">Config</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {stackApps.map((app, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-2 text-center text-white/30 text-[12px] cursor-pointer">•••</td>
                    <td className="p-2 text-center select-none text-emerald-400 font-bold">✔</td>
                    <td className="p-2 text-center font-bold text-cyan-300">{app.priority}</td>
                    <td className="p-2 text-white font-semibold">{app.name}</td>
                    <td className="p-2 text-white/40 text-[10px]">{app.config}</td>
                    <td className="p-2 text-[10px] text-white/80 whitespace-nowrap overflow-hidden text-ellipsis max-w-xs" title={app.status}>
                      {app.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. PLUG-INS */}
        <div className="space-y-2">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1 border-b border-white/5 pb-1 select-none">
            <span>▼</span>
            <span>Plug-Ins</span>
          </div>
          <div className="border border-white/5 rounded overflow-hidden">
            <table className="w-full block-tabular-theme text-left font-mono text-[11px] leading-normal border-collapse">
              <thead>
                <tr className="bg-[#11131A] text-slate-400 uppercase text-[9px] border-b border-white/5">
                  <th className="p-2 w-16 text-center">Actions</th>
                  <th className="p-2 w-12 text-center">✔</th>
                  <th className="p-2 w-56">Name</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {plugins.map((plug, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.01] font-mono select-none">
                    <td className="p-2 text-center text-white/30 text-[12px]">•••</td>
                    <td className="p-2 text-center text-white/20">—</td>
                    <td className="p-2 font-bold text-slate-400">{plug.name}</td>
                    <td className="p-2 text-white/40 italic">{plug.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
