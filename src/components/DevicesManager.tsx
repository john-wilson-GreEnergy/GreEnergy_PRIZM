import React, { useState, useEffect } from "react";
import { 
  Wifi, 
  Plus, 
  Trash2, 
  Settings, 
  Terminal, 
  Search, 
  RefreshCw, 
  Check, 
  Globe, 
  Cpu, 
  Save, 
  Sliders,
  Play
} from "lucide-react";
import { BessDevice } from "../types";

interface DevicesManagerProps {
  devices: BessDevice[];
  onAddDevice: (devData: any) => Promise<void>;
  onEditDevice: (id: string, devData: any) => Promise<void>;
  onDeleteDevice: (id: string) => Promise<void>;
}

export default function DevicesManager({ devices, onAddDevice, onEditDevice, onDeleteDevice }: DevicesManagerProps) {
  // Manual adding state
  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [port, setPort] = useState(502);
  const [model, setModel] = useState("Greenergy BESS-Mega 1000");
  const [capacityKwh, setCapacityKwh] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Scan network states
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<any>(null);

  // Curl records transaction state
  const [curlLogs, setCurlLogs] = useState<any[]>([]);
  const [refreshCurlTrigger, setRefreshCurlTrigger] = useState(0);

  // Edit states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIp, setEditIp] = useState("");
  const [editPort, setEditPort] = useState(502);
  const [editModel, setEditModel] = useState("");
  const [editCapacity, setEditCapacity] = useState(500);

  // Modbus Edit States
  const [editIsRealtime, setEditIsRealtime] = useState(false);
  const [editUnitId, setEditUnitId] = useState(1);
  const [editSocReg, setEditSocReg] = useState(658);
  const [editSohReg, setEditSohReg] = useState(660);
  const [editVoltReg, setEditVoltReg] = useState(80);
  const [editCurrReg, setEditCurrReg] = useState(691);
  const [editPowerReg, setEditPowerReg] = useState(84);
  const [editTempReg, setEditTempReg] = useState(103);
  const [editFreqReg, setEditFreqReg] = useState(86);

  // Fetch server-rendered curl triggers under-the-hood
  useEffect(() => {
    fetch("/api/curllogs")
      .then(r => r.json())
      .then(data => setCurlLogs(data))
      .catch(err => console.error("Could not fetch curl logs:", err));
  }, [devices, refreshCurlTrigger]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !ipAddress) return;
    setLoading(true);
    try {
      await onAddDevice({ 
        name, 
        ipAddress, 
        port, 
        model, 
        capacityKwh,
        isRealtimeEnabled: false // Disable on initial create unless toggled later
      });
      setName("");
      setIpAddress("");
      setMsg("Device registered and Modbus handshake established!");
      setTimeout(() => setMsg(""), 4000);
    } catch (err) {
      console.error(err);
      setMsg("Validation failed on register handshakes.");
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerScan = async () => {
    setIsScanning(true);
    setScanResults(null);
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const data = await res.json();
      setScanResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsScanning(false);
    }
  };

  const startEditing = (dev: BessDevice) => {
    setEditingId(dev.id);
    setEditName(dev.name);
    setEditIp(dev.ipAddress);
    setEditPort(dev.port);
    setEditModel(dev.model);
    setEditCapacity(dev.capacityKwh);
    setEditIsRealtime(dev.isRealtimeEnabled || false);
    setEditUnitId(dev.modbusUnitId !== undefined ? dev.modbusUnitId : 1);
    setEditSocReg(dev.socReg !== undefined ? dev.socReg : 658);
    setEditSohReg(dev.sohReg !== undefined ? dev.sohReg : 660);
    setEditVoltReg(dev.voltageReg !== undefined ? dev.voltageReg : 80);
    setEditCurrReg(dev.currentReg !== undefined ? dev.currentReg : 691);
    setEditPowerReg(dev.powerReg !== undefined ? dev.powerReg : 84);
    setEditTempReg(dev.tempReg !== undefined ? dev.tempReg : 103);
    setEditFreqReg(dev.frequencyReg !== undefined ? dev.frequencyReg : 86);
  };

  const saveEdit = async (id: string) => {
    try {
      await onEditDevice(id, {
        name: editName,
        ipAddress: editIp,
        port: editPort,
        model: editModel,
        capacityKwh: editCapacity,
        isRealtimeEnabled: editIsRealtime,
        modbusUnitId: editUnitId,
        socReg: editSocReg,
        sohReg: editSohReg,
        voltageReg: editVoltReg,
        currentReg: editCurrReg,
        powerReg: editPowerReg,
        tempReg: editTempReg,
        frequencyReg: editFreqReg
      });
      setEditingId(null);
      setRefreshCurlTrigger(prev => prev + 1);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegisterScannedNode = async (scanned: any) => {
    try {
      await onAddDevice({
        name: scanned.suggestedName,
        ipAddress: scanned.ipAddress,
        port: scanned.port,
        model: scanned.model,
        capacityKwh: 1000
      });
      // Force instant refresh of scanned status
      if (scanResults) {
        setScanResults((prev: any) => {
          if (!prev) return null;
          return {
            ...prev,
            activeDevicesFound: prev.activeDevicesFound.map((item: any) => 
              item.ipAddress === scanned.ipAddress ? { ...item, isRegistered: true } : item
            )
          };
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro banner */}
      <div className="bg-[#12141C] border border-white/5 rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-mono font-bold uppercase tracking-[0.2em] text-white">BESS Node Configurations & Network Controls</h2>
          <p className="text-[11px] text-[#D1D5DB]/40 font-mono mt-1 max-w-xl">
            Register localized battery containers, scan the subnet for connected Modbus TCP controllers, and adjust modbus coil mapping tables.
          </p>
        </div>
        <button 
          onClick={handleTriggerScan}
          disabled={isScanning}
          className="px-3.5 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-mono text-xs font-bold uppercase tracking-wider rounded transition-all flex items-center gap-2 shrink-0 self-start md:self-auto cursor-pointer"
        >
          {isScanning ? (
            <>
              <RefreshCw className="animate-spin" size={13} />
              Scanning Subnet...
            </>
          ) : (
            <>
              <Search size={13} />
              Scan Subnet LAN
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT PANEL: Registered Modules & Scanning list */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Active Devices Register List */}
          <div className="bg-[#12141C] border border-white/5 rounded-lg p-5">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 mb-4 flex items-center gap-2">
              <Globe size={14} className="text-cyan-400" />
              Registered BESS Core Registrars ({devices.length})
            </h3>

            <div className="space-y-3">
              {devices.map((dev) => {
                const isEditing = editingId === dev.id;
                return (
                  <div key={dev.id} className="border border-white/5 bg-[#161922] p-4 rounded transition-all hover:bg-white/5">
                    {isEditing ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-mono text-white/40 uppercase">Device Name</label>
                            <input 
                              type="text" 
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              className="mt-1 w-full text-xs font-mono rounded bg-[#0F1117] border border-white/10 px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono text-white/40 uppercase">Model Specification</label>
                            <input 
                              type="text" 
                              value={editModel}
                              onChange={e => setEditModel(e.target.value)}
                              className="mt-1 w-full text-xs font-mono rounded bg-[#0F1117] border border-white/10 px-2.5 py-1.5 text-white focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] font-mono text-white/40 uppercase">IP Address</label>
                            <input 
                              type="text" 
                              value={editIp}
                              onChange={e => setEditIp(e.target.value)}
                              className="mt-1 w-full text-xs font-mono rounded bg-[#0F1117] border border-white/10 px-2.5 py-1.5 text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono text-white/40 uppercase">Modbus Port</label>
                            <input 
                              type="number" 
                              value={editPort}
                              onChange={e => setEditPort(Number(e.target.value))}
                              className="mt-1 w-full text-xs font-mono rounded bg-[#0F1117] border border-white/10 px-2.5 py-1.5 text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono text-white/40 uppercase">Capacity (kWh)</label>
                            <input 
                              type="number" 
                              value={editCapacity}
                              onChange={e => setEditCapacity(Number(e.target.value))}
                              className="mt-1 w-full text-xs font-mono rounded bg-[#0F1117] border border-white/10 px-2.5 py-1.5 text-white"
                            />
                          </div>
                        </div>

                        {/* Modbus Realtime Polling Switch Section */}
                        <div className="border border-white/5 bg-[#0F1117]/60 rounded p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-[11px] font-mono font-bold text-white uppercase flex items-center gap-1.5">
                                🔌 Enable Realtime Modbus TCP Polling
                              </span>
                              <span className="text-[9px] text-white/30 font-mono">
                                Read dynamic values directly from device registers instead of simulation.
                              </span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={editIsRealtime}
                                onChange={e => setEditIsRealtime(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                            </label>
                          </div>

                          {editIsRealtime && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-white/5 animate-fade-in text-[10px] font-mono">
                              <div>
                                <label className="text-white/40 block">Unit ID (Address)</label>
                                <input 
                                  type="number" 
                                  value={editUnitId} 
                                  onChange={e => setEditUnitId(Number(e.target.value))}
                                  className="mt-1 w-full rounded bg-[#161922] border border-white/15 px-2 py-1 text-white" 
                                />
                              </div>
                              <div>
                                <label className="text-white/40 block">SoC % Reg (FC3)</label>
                                <input 
                                  type="number" 
                                  value={editSocReg} 
                                  onChange={e => setEditSocReg(Number(e.target.value))}
                                  className="mt-1 w-full rounded bg-[#161922] border border-white/15 px-2 py-1 text-white" 
                                />
                              </div>
                              <div>
                                <label className="text-white/40 block">SoH % Reg</label>
                                <input 
                                  type="number" 
                                  value={editSohReg} 
                                  onChange={e => setEditSohReg(Number(e.target.value))}
                                  className="mt-1 w-full rounded bg-[#161922] border border-white/15 px-2 py-1 text-white" 
                                />
                              </div>
                              <div>
                                <label className="text-white/40 block">Voltage Reg (V)</label>
                                <input 
                                  type="number" 
                                  value={editVoltReg} 
                                  onChange={e => setEditVoltReg(Number(e.target.value))}
                                  className="mt-1 w-full rounded bg-[#161922] border border-white/15 px-2 py-1 text-white" 
                                />
                              </div>

                              <div>
                                <label className="text-white/40 block">Current Reg (A)</label>
                                <input 
                                  type="number" 
                                  value={editCurrReg} 
                                  onChange={e => setEditCurrReg(Number(e.target.value))}
                                  className="mt-1 w-full rounded bg-[#161922] border border-white/15 px-2 py-1 text-white" 
                                />
                              </div>
                              <div>
                                <label className="text-white/40 block">Active Power (kW)</label>
                                <input 
                                  type="number" 
                                  value={editPowerReg} 
                                  onChange={e => setEditPowerReg(Number(e.target.value))}
                                  className="mt-1 w-full rounded bg-[#161922] border border-white/15 px-2 py-1 text-white" 
                                />
                              </div>
                              <div>
                                <label className="text-white/40 block">Temp Register Address</label>
                                <input 
                                  type="number" 
                                  value={editTempReg} 
                                  onChange={e => setEditTempReg(Number(e.target.value))}
                                  className="mt-1 w-full rounded bg-[#161922] border border-white/15 px-2 py-1 text-white" 
                                />
                              </div>
                              <div>
                                <label className="text-white/40 block">Frequency Reg (Hz)</label>
                                <input 
                                  type="number" 
                                  value={editFreqReg} 
                                  onChange={e => setEditFreqReg(Number(e.target.value))}
                                  className="mt-1 w-full rounded bg-[#161922] border border-white/15 px-2 py-1 text-white" 
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                          <button 
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1.5 text-xs font-mono text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 rounded transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={() => saveEdit(dev.id)}
                            className="px-3 py-1.5 text-xs font-mono bg-cyan-500 text-black rounded hover:bg-cyan-400 font-bold uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Save size={12} />
                            Save Configuration
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 font-mono">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-white/5">
                          <div className="flex items-start gap-3">
                            <div className="bg-white/5 border border-white/10 p-2 rounded text-cyan-400 shrink-0">
                              <Cpu size={16} />
                            </div>
                            <div>
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="font-bold text-white text-xs">{dev.name}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${dev.status === "Faulted" ? "bg-rose-500/10 text-rose-400" : "bg-white/5 text-white/40"}`}>
                                  {dev.status}
                                </span>

                                {/* Polling method indicators */}
                                {dev.isRealtimeEnabled ? (
                                  dev.pollStatus === "connected" ? (
                                    <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/10 rounded text-[9px] font-bold uppercase flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                      Live (Unit {dev.modbusUnitId})
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 bg-rose-500/15 text-rose-400 border border-rose-500/10 rounded text-[9px] font-bold uppercase flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                      TCP Error
                                    </span>
                                  )
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-gray-500/15 text-white/50 border border-white/5 rounded text-[9px] font-bold uppercase">
                                    ✦ Emulator
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-white/40 mt-1">
                                {dev.model} • {dev.ipAddress}:{dev.port} • <span className="text-white/20">Cap: {dev.capacityKwh}kWh</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 self-end sm:self-auto">
                            <button 
                              onClick={() => startEditing(dev)}
                              className="px-2.5 py-1 text-[10px] rounded text-[#22D3EE] border border-[#22D3EE]/20 hover:bg-[#22D3EE]/10 transition-all cursor-pointer flex items-center gap-1"
                              title="Edit Modbus Map Details"
                            >
                              <Settings size={11} />
                              <span>Setup</span>
                            </button>
                            <button 
                              onClick={() => onDeleteDevice(dev.id)}
                              className="p-1.5 rounded text-white/40 border border-white/10 hover:border-rose-500/20 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                              title="Remove registration"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Modbus Error / Status Details readout when real polling fails */}
                        {dev.isRealtimeEnabled && dev.pollStatus === "polling_error" && (
                          <div className="p-2.5 rounded bg-rose-500/5 border border-rose-500/10 text-[10px] space-y-1">
                            <div className="text-rose-400 font-bold uppercase flex items-center gap-1">
                              ⚠️ Modbus Connection Exception
                            </div>
                            <p className="text-white/60 leading-relaxed max-w-xl">
                              {dev.errorLog || "Establishing connection failed. The controller refused packet ingress on port 502, or host is unreachable."}
                            </p>
                            <p className="text-white/30 text-[9px]">
                              Verify physical ethernet routing, virtual switches, or check local Modbus Daemon logs on controller at {dev.ipAddress}.
                            </p>
                          </div>
                        )}

                        {/* Modbus registers information when polling successfully */}
                        {dev.isRealtimeEnabled && dev.pollStatus === "connected" && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] bg-emerald-500/5 border border-emerald-500/10 p-2 rounded text-white/70">
                            <div>
                              <span className="text-white/40 block">Active Metrics:</span>
                              <span className="text-emerald-400 font-bold">Registers Polled OK</span>
                            </div>
                            <div>
                              <span className="text-white/40 block">Telemetry Sync:</span>
                              <span className="text-white">Every 3.0s</span>
                            </div>
                            <div>
                              <span className="text-white/40 block">Link Status:</span>
                              <span className="text-emerald-400">Stable socket</span>
                            </div>
                            <div>
                              <span className="text-white/40 block">Response size:</span>
                              <span className="text-white">12 bytes/reg</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Subnet scan segment results show */}
          {scanResults && (
            <div className="bg-[#12141C] border border-white/5 rounded-lg p-5 animate-fade-in font-mono">
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                <div>
                  <h4 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Wifi size={14} className="text-emerald-400" />
                    LAN Discovery Results ({scanResults.scannedRange})
                  </h4>
                  <p className="text-[9px] text-white/30 font-semibold mt-0.5">COMPLETED AT: {new Date(scanResults.timestamp).toLocaleTimeString()}</p>
                </div>
                <button 
                  onClick={() => setScanResults(null)}
                  className="text-[10px] text-white/40 hover:text-white uppercase font-bold cursor-pointer"
                >
                  Clear
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {scanResults.activeDevicesFound.map((scanned: any, idx: number) => (
                  <div key={idx} className="bg-[#161922] border border-white/5 p-3 rounded flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="block text-xs font-bold text-white leading-none">{scanned.ipAddress}:{scanned.port}</span>
                      <span className="block text-[10px] text-white/40 truncate mt-1">{scanned.model}</span>
                      <span className="inline-block mt-1 text-[9px] text-emerald-400 bg-emerald-500/5 px-1 py-0.2 rounded border border-emerald-500/10">RTT: {scanned.pingMs}ms</span>
                    </div>

                    {scanned.isRegistered ? (
                      <span className="px-2 py-1 text-[9px] font-bold text-white/40 bg-white/5 rounded border border-white/10 flex items-center gap-1 shrink-0">
                        <Check size={10} className="text-emerald-400" />
                        SAVED
                      </span>
                    ) : (
                      <button 
                        onClick={() => handleRegisterScannedNode(scanned)}
                        className="px-2.5 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-black text-[10px] font-bold uppercase border border-cyan-500/20 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Plus size={11} />
                        Save
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* RIGHT PANEL: Manual Registration Form & commands logger */}
        <div className="space-y-6">
          
          {/* Add BESS Node Form */}
          <div className="bg-[#12141C] border border-white/5 rounded-lg p-5">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 mb-4 flex items-center gap-2">
              <Plus size={14} className="text-cyan-400" />
              Register BESS Node Manually
            </h3>

            <form onSubmit={handleManualSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-mono text-white/40 uppercase">Device Alias / Label *</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Substation Core D"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="mt-1.5 w-full text-xs font-mono rounded bg-[#0F1117] border border-white/10 px-3 py-2 text-white placeholder-white/10 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] font-mono text-white/40 uppercase">IP Address *</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. 192.168.1.18"
                    value={ipAddress}
                    onChange={e => setIpAddress(e.target.value)}
                    className="mt-1.5 w-full text-xs font-mono rounded bg-[#0F1117] border border-white/10 px-3 py-2 text-white placeholder-white/10 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-white/40 uppercase">Port</label>
                  <input 
                    type="number"
                    value={port}
                    onChange={e => setPort(Number(e.target.value))}
                    className="mt-1.5 w-full text-xs font-mono rounded bg-[#0F1117] border border-white/10 px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-white/40 uppercase">Equipment Model Type</label>
                <select 
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="mt-1.5 w-full text-xs font-mono rounded bg-[#0F1117] border border-white/10 px-3 py-2 text-white focus:outline-none"
                >
                  <option value="Greenergy BESS-Mega 1000">Greenergy BESS-Mega 1000 (Grid Scale)</option>
                  <option value="Greenergy BESS-Eco 500">Greenergy BESS-Eco 500 (Industrial)</option>
                  <option value="Greenergy BESS-Eco 250">Greenergy BESS-Eco 250 (Light Industrial)</option>
                  <option value="Tesla Megapack XL">Tesla Megapack XL (Max Buffer)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-white/40 uppercase">Total Pack Capacity (kWh)</label>
                <input 
                  type="number"
                  min={10}
                  value={capacityKwh}
                  onChange={e => setCapacityKwh(Number(e.target.value))}
                  className="mt-1.5 w-full text-xs font-mono rounded bg-[#0F1117] border border-white/10 px-3 py-2 text-white"
                />
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="mt-2 w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold font-mono text-xs uppercase cursor-pointer tracking-wider rounded transition-colors disabled:opacity-50"
              >
                {loading ? "Establishing Handshake..." : "Register & Enable BESS Node"}
              </button>

              {msg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono rounded text-center">
                  {msg}
                </div>
              )}
            </form>
          </div>

          {/* Under-the-hood direct Modbus/curl command viewer */}
          <div className="bg-[#12141C] border border-white/5 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Terminal size={14} className="text-cyan-400" />
                Raw Dispatch logs
              </h3>
              <button 
                onClick={() => setRefreshCurlTrigger(prev => prev + 1)}
                className="p-1 rounded text-white/40 hover:text-white cursor-pointer"
                title="Refresh logs"
              >
                <RefreshCw size={11} />
              </button>
            </div>
            
            <p className="text-[10px] text-white/40 font-mono mb-3 leading-relaxed">
              BESS functions write live modbus TCP coils. Watch raw system curl dispatches triggered live below:
            </p>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 no-scrollbar">
              {curlLogs.length === 0 ? (
                <div className="text-center py-6 border border-white/5 border-dashed rounded text-[10px] text-white/30 font-mono uppercase tracking-wider">
                  No curl telemetry logs active.
                </div>
              ) : (
                curlLogs.map((log) => (
                  <div key={log.id} className="bg-[#161922] p-3 rounded border border-white/5 font-mono text-[10px] space-y-1.5">
                    <div className="flex items-center justify-between text-white/40 border-b border-white/5 pb-1 text-[9px]">
                      <span className="text-cyan-400 font-bold truncate max-w-[120px]">{log.targetDeviceName}</span>
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-white/80 break-all select-all font-semibold bg-[#0F1117] p-1.5 rounded border border-white/10">
                      {log.command}
                    </div>
                    <div className="text-[9px] text-white/30 flex justify-between">
                      <span>HTTP CODE: <span className="text-emerald-400">{log.responseStatus}</span></span>
                      <span className="truncate max-w-[100px]" title={log.responsePayload}>Res: {log.responsePayload}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
