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
      await onAddDevice({ name, ipAddress, port, model, capacityKwh });
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
  };

  const saveEdit = async (id: string) => {
    try {
      await onEditDevice(id, {
        name: editName,
        ipAddress: editIp,
        port: editPort,
        model: editModel,
        capacityKwh: editCapacity
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
                      <div className="space-y-3">
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
                              className="mt-1 w-full text-xs font-mono rounded bg--[#0F1117] border border-white/10 px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-500"
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

                        <div className="flex justify-end gap-2 pt-2">
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
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono">
                        <div className="flex items-start gap-3">
                          <div className="bg-white/5 border border-white/10 p-2 rounded text-cyan-400 shrink-0">
                            <Cpu size={16} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-xs">{dev.name}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${dev.status === "Faulted" ? "bg-rose-500/10 text-rose-400" : "bg-white/5 text-white/40"}`}>
                                {dev.status}
                              </span>
                            </div>
                            <p className="text-[10px] text-white/40 mt-1">
                              {dev.model} • {dev.ipAddress}:{dev.port} • <span className="text-white/20">Cap: {dev.capacityKwh}kWh</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-auto">
                          <button 
                            onClick={() => startEditing(dev)}
                            className="p-1.5 rounded text-white/40 border border-white/10 hover:border-white/20 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                            title="Edit details"
                          >
                            <Settings size={13} />
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
