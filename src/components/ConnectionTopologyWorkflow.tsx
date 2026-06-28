import React, { useState, useEffect } from "react";
import {
  Server, Cpu, Network, Activity, CheckCircle, AlertTriangle, 
  ArrowRight, ArrowLeft, Settings, Database, Save, Info, Search, 
  Plus, FileUp, AlertCircle, Check, ChevronRight, RefreshCw
} from "lucide-react";

export default function ConnectionTopologyWorkflow() {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  const [layoutFamily, setLayoutFamily] = useState<"stack750_800" | "stack360" | "stack225_230" | "custom">("stack750_800");
  
  const [emsUrl, setEmsUrl] = useState("http://10.0.0.3:8080/turtle");
  const [emsHost, setEmsHost] = useState("10.0.0.3");
  const [emsPort, setEmsPort] = useState(8080);
  const [turtlePath, setTurtlePath] = useState("/turtle");
  const [timeoutSec, setTimeoutSec] = useState(5);
  const [pollingSec, setPollingSec] = useState(15);
  
  const [baseSubnet, setBaseSubnet] = useState("10.0");
  const [subnetMask, setSubnetMask] = useState("255.255.0.0");
  const [gateway, setGateway] = useState("10.0.0.1");

  const [arrayCount, setArrayCount] = useState(8);
  const [csLastOctet, setCsLastOctet] = useState(3);
  const [esStartOctet, setEsStartOctet] = useState(10);
  const [esStep, setEsStep] = useState(5);
  const [esPerArray, setEsPerArray] = useState(20);
  const [stringsPerEs, setStringsPerEs] = useState(2);

  const [containersPerArray, setContainersPerArray] = useState(1);
  const [stacksPerContainer, setStacksPerContainer] = useState(2);
  const [stringsPerArray, setStringsPerArray] = useState(40);
  const [pcsCount, setPcsCount] = useState(1);
  const [envDevicesPerContainer, setEnvDevicesPerContainer] = useState(12);
  const [deriveFromTurtle, setDeriveFromTurtle] = useState(true);

  const [previewTab, setPreviewTab] = useState("Topology Preview");

  const [profileName, setProfileName] = useState("New BESS Topology");
  const [stationCode, setStationCode] = useState("DEFAULT");
  const [blockIndex, setBlockIndex] = useState(1);
  const [setAsActive, setSetAsActive] = useState(true);

  const [connStatus, setConnStatus] = useState<"none" | "success" | "partial" | "fail">("none");
  const [isTesting, setIsTesting] = useState(false);
  
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryData, setDiscoveryData] = useState<any>(null);
  
  const [statusMsg, setStatusMsg] = useState({ text: "", type: "info" });

  const showMsg = (text: string, type: "info" | "success" | "error" = "info") => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg({ text: "", type: "info" }), 5000);
  };

  const handleTestConnection = () => {
    setIsTesting(true);
    setTimeout(() => {
      setConnStatus("success");
      setIsTesting(false);
    }, 1000);
  };

  const handleRunDiscovery = async () => {
    setIsDiscovering(true);
    // Simulate discovery
    setTimeout(() => {
      setDiscoveryData({
        arrays: arrayCount,
        strings: layoutFamily === "stack750_800" ? arrayCount * esPerArray * stringsPerEs : arrayCount * stringsPerArray,
        pcs: layoutFamily === "stack750_800" ? arrayCount * pcsCount : pcsCount,
        feathers: layoutFamily === "stack750_800" ? arrayCount * (1 + esPerArray) : 0,
        devices: []
      });
      setIsDiscovering(false);
    }, 1500);
  };

  const handleActivate = async () => {
    showMsg("Profile Activated Successfully", "success");
    // In a real implementation this would POST to /api/local/topology/profiles
  };

  const renderStepper = () => {
    const steps = ["Select Topology", "Configure Connection", "Discover & Preview", "Validate & Activate"];
    return (
      <div className="flex items-center justify-between mb-8 relative">
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/10 -z-10"></div>
        {steps.map((label, idx) => {
          const stepNum = idx + 1;
          const isPast = currentStep > stepNum;
          const isCurrent = currentStep === stepNum;
          return (
            <div key={label} className="flex flex-col items-center bg-prizm-bg px-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                isPast ? "bg-prizm-primary border-prizm-primary text-black" :
                isCurrent ? "bg-prizm-primary border-prizm-primary text-black" :
                "bg-prizm-surface border-white/20 text-prizm-text-muted"
              }`}>
                {isPast ? <Check size={12} /> : stepNum}
              </div>
              <span className={`text-[9px] uppercase font-bold mt-2 ${isCurrent || isPast ? "text-slate-200" : "text-prizm-text-muted"}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderStep1 = () => (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold uppercase text-prizm-primary">Topology Engine</h2>
        <p className="text-xs text-prizm-text-muted mt-1">
          Choose your BESS topology family. This determines how PRIZM models layout, data sources, direct IP validation, and page behavior.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={() => setLayoutFamily("stack750_800")}
          className={`p-5 rounded-lg border-2 cursor-pointer transition-all flex flex-col justify-between ${
            layoutFamily === "stack750_800" ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 hover:border-white/20 bg-prizm-surface"
          }`}
        >
          <div>
            <h3 className="font-bold text-slate-100 uppercase">Stack 750 / 800</h3>
            <span className="text-[10px] text-prizm-text-muted uppercase block mt-1">Centipede / Lineup Based</span>
            
            <div className="my-4 py-4 border-y border-white/10 flex items-center justify-center text-prizm-text-muted">
              <div className="text-[10px] flex items-center gap-2">
                <span className="px-2 py-1 border border-white/20 rounded">CS</span>
                <ArrowRight size={12} />
                <span className="px-2 py-1 border border-white/20 rounded">ES blocks</span>
                <ArrowRight size={12} />
                <span className="px-2 py-1 border border-white/20 rounded">paired strings</span>
              </div>
            </div>

            <ul className="text-[10px] text-slate-300 space-y-1.5 list-disc pl-4 marker:text-prizm-primary">
              <li>Collection Segments (CS)</li>
              <li>Energy Segments (ES)</li>
              <li>Direct Feather Controllers</li>
              <li>Paired Strings per ES</li>
              <li>Cell Level Visibility</li>
            </ul>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10">
            <span className={`text-[9px] uppercase font-bold px-2 py-1 rounded ${layoutFamily === "stack750_800" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-prizm-text-muted"}`}>
              Direct IP Devices Required
            </span>
          </div>
        </div>

        <div 
          onClick={() => setLayoutFamily("stack360")}
          className={`p-5 rounded-lg border-2 cursor-pointer transition-all flex flex-col justify-between ${
            layoutFamily === "stack360" ? "border-cyan-500 bg-cyan-500/10" : "border-white/10 hover:border-white/20 bg-prizm-surface"
          }`}
        >
          <div>
            <h3 className="font-bold text-slate-100 uppercase">Stack 360</h3>
            <span className="text-[10px] text-prizm-text-muted uppercase block mt-1">Containerized Central Control</span>
            
            <div className="my-4 py-4 border-y border-white/10 flex items-center justify-center text-prizm-text-muted">
              <div className="text-[10px] flex items-center gap-2">
                <span className="px-2 py-1 border border-white/20 rounded">Container</span>
                <ArrowRight size={12} />
                <span className="px-2 py-1 border border-white/20 rounded">PLC</span>
                <ArrowRight size={12} />
                <span className="px-2 py-1 border border-white/20 rounded">Stack blocks</span>
              </div>
            </div>

            <ul className="text-[10px] text-slate-300 space-y-1.5 list-disc pl-4 marker:text-cyan-500">
              <li>Containers with Central Control</li>
              <li>Environmental Controller / PLC</li>
              <li>Stack Controllers</li>
              <li>PCS via EMS</li>
              <li>No direct Feather devices</li>
            </ul>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10">
            <span className={`text-[9px] uppercase font-bold px-2 py-1 rounded ${layoutFamily === "stack360" ? "bg-cyan-500/20 text-cyan-400" : "bg-white/5 text-prizm-text-muted"}`}>
              EMS Centric — No Direct IP Required
            </span>
          </div>
        </div>

        <div 
          onClick={() => setLayoutFamily("stack225_230")}
          className={`p-5 rounded-lg border-2 cursor-pointer transition-all flex flex-col justify-between ${
            layoutFamily === "stack225_230" ? "border-purple-500 bg-purple-500/10" : "border-white/10 hover:border-white/20 bg-prizm-surface"
          }`}
        >
          <div>
            <h3 className="font-bold text-slate-100 uppercase">Stack 225 / 230</h3>
            <span className="text-[10px] text-prizm-text-muted uppercase block mt-1">Containerized Distributed Environmental</span>
            
            <div className="my-4 py-4 border-y border-white/10 flex flex-col items-center justify-center text-prizm-text-muted">
              <div className="text-[10px] flex flex-wrap justify-center gap-2">
                <span className="px-2 py-1 border border-white/20 rounded">Env Nodes</span>
                <ArrowRight size={12} />
                <span className="px-2 py-1 border border-white/20 rounded">Container/Stack</span>
              </div>
            </div>

            <ul className="text-[10px] text-slate-300 space-y-1.5 list-disc pl-4 marker:text-purple-500">
              <li>Distributed Environmental Devices</li>
              <li>Individual TCP/IP Devices as metadata</li>
              <li>Stack Controllers</li>
              <li>PCS via EMS</li>
              <li>No direct Feather devices by default</li>
            </ul>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10">
            <span className={`text-[9px] uppercase font-bold px-2 py-1 rounded ${layoutFamily === "stack225_230" ? "bg-purple-500/20 text-purple-400" : "bg-white/5 text-prizm-text-muted"}`}>
              EMS Centric — No Direct IP Required
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-white/10">
        <h3 className="text-xs font-bold uppercase text-slate-200">Custom Topology</h3>
        <p className="text-[10px] text-prizm-text-muted mt-1 mb-3">Build a custom layout with manual device definitions, imported maps, and capability assignments.</p>
        <button className="px-4 py-2 border border-white/20 rounded text-[10px] uppercase font-bold hover:bg-white/5 text-slate-300">
          Custom Builder
        </button>
      </div>

      <div className="flex justify-end border-t border-white/10 pt-4">
        <button 
          onClick={() => setCurrentStep(2)}
          className="px-6 py-2 bg-prizm-primary text-black font-extrabold uppercase text-[10px] rounded hover:bg-cyan-400"
        >
          Next
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold uppercase text-prizm-primary">Configure Connection & Layout Parameters</h2>
        <p className="text-xs text-prizm-text-muted mt-1">
          Enter the EMS connection details and the layout values PRIZM needs for this topology family.
        </p>
      </div>

      <div className="border-b border-white/10 pb-2 mb-4">
        <span className="text-sm font-bold uppercase text-slate-200">
          {layoutFamily === "stack750_800" ? "Stack 750 / 800 Layout" : layoutFamily === "stack360" ? "Stack 360 Layout" : "Stack 225 / 230 Layout"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-prizm-surface p-4 rounded-lg border border-white/5 space-y-4">
          <h3 className="text-[11px] font-bold uppercase text-prizm-primary border-b border-white/5 pb-2">EMS / Turtle Connection</h3>
          <div className="space-y-3 text-[10px]">
            <div>
              <label className="block text-prizm-text-muted uppercase mb-1">EMS / Turtle URL</label>
              <input value={emsUrl} onChange={e => setEmsUrl(e.target.value)} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
            </div>
            <div>
              <label className="block text-prizm-text-muted uppercase mb-1">EMS Host</label>
              <input value={emsHost} onChange={e => setEmsHost(e.target.value)} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-prizm-text-muted uppercase mb-1">Port</label>
                <input type="number" value={emsPort} onChange={e => setEmsPort(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
              </div>
              <div>
                <label className="block text-prizm-text-muted uppercase mb-1">Timeout (s)</label>
                <input type="number" value={timeoutSec} onChange={e => setTimeoutSec(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
              </div>
            </div>
            <div>
              <label className="block text-prizm-text-muted uppercase mb-1">Turtle Path</label>
              <input value={turtlePath} onChange={e => setTurtlePath(e.target.value)} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
            </div>
            <button onClick={handleTestConnection} className="w-full py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded uppercase font-bold text-slate-200 flex justify-center items-center gap-2 mt-2">
              {isTesting ? <RefreshCw className="animate-spin" size={12}/> : <Activity size={12}/>} Test Connection
            </button>
            {connStatus === "success" && <div className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-center">Connection successful<br/>Turtle Version: 2.1</div>}
          </div>
        </div>

        <div className="bg-prizm-surface p-4 rounded-lg border border-white/5 space-y-4">
          <h3 className="text-[11px] font-bold uppercase text-prizm-primary border-b border-white/5 pb-2">Site Network</h3>
          <div className="space-y-3 text-[10px]">
            {layoutFamily === "stack750_800" ? (
              <>
                <div>
                  <label className="block text-prizm-text-muted uppercase mb-1">Base Subnet</label>
                  <input value={baseSubnet} onChange={e => setBaseSubnet(e.target.value)} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                </div>
                <div>
                  <label className="block text-prizm-text-muted uppercase mb-1">Subnet Mask</label>
                  <input value={subnetMask} onChange={e => setSubnetMask(e.target.value)} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                </div>
                <div>
                  <label className="block text-prizm-text-muted uppercase mb-1">Default Gateway (Optional)</label>
                  <input value={gateway} onChange={e => setGateway(e.target.value)} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-prizm-text-muted uppercase mb-1">EMS Connection Subnet (Optional)</label>
                  <input value={baseSubnet} onChange={e => setBaseSubnet(e.target.value)} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                </div>
                <div className="p-2 bg-white/5 text-prizm-text-muted rounded italic">
                  Full device IP topology is not required unless direct device polling is enabled.
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-prizm-surface p-4 rounded-lg border border-white/5 space-y-4">
          <h3 className="text-[11px] font-bold uppercase text-prizm-primary border-b border-white/5 pb-2">Layout / Segment Structure</h3>
          <div className="space-y-3 text-[10px]">
            {layoutFamily === "stack750_800" ? (
              <>
                <div>
                  <label className="block text-prizm-text-muted uppercase mb-1">Number of arrays / lineups</label>
                  <input type="number" value={arrayCount} onChange={e => setArrayCount(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-prizm-text-muted uppercase mb-1">CS Last Octet</label>
                    <input type="number" value={csLastOctet} onChange={e => setCsLastOctet(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                  </div>
                  <div>
                    <label className="block text-prizm-text-muted uppercase mb-1">First ES Last Octet</label>
                    <input type="number" value={esStartOctet} onChange={e => setEsStartOctet(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                  </div>
                  <div>
                    <label className="block text-prizm-text-muted uppercase mb-1">ES Step</label>
                    <input type="number" value={esStep} onChange={e => setEsStep(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                  </div>
                  <div>
                    <label className="block text-prizm-text-muted uppercase mb-1">ES Per Array</label>
                    <input type="number" value={esPerArray} onChange={e => setEsPerArray(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                  </div>
                </div>
                <div>
                  <label className="block text-prizm-text-muted uppercase mb-1">Strings Per ES</label>
                  <input type="number" value={stringsPerEs} onChange={e => setStringsPerEs(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-prizm-text-muted uppercase mb-1">Number of arrays</label>
                  <input type="number" value={arrayCount} onChange={e => setArrayCount(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-prizm-text-muted uppercase mb-1">Containers / Array</label>
                    <input type="number" value={containersPerArray} onChange={e => setContainersPerArray(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                  </div>
                  <div>
                    <label className="block text-prizm-text-muted uppercase mb-1">Stacks / Container</label>
                    <input type="number" value={stacksPerContainer} onChange={e => setStacksPerContainer(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                  </div>
                </div>
                <div>
                  <label className="block text-prizm-text-muted uppercase mb-1">Strings / Array or Stack</label>
                  <input type="number" value={stringsPerArray} onChange={e => setStringsPerArray(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                </div>
                <div>
                  <label className="block text-prizm-text-muted uppercase mb-1">PCS Units / Array</label>
                  <input type="number" value={pcsCount} onChange={e => setPcsCount(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                </div>
                {layoutFamily === "stack225_230" && (
                  <div>
                    <label className="block text-prizm-text-muted uppercase mb-1">Env. Devices / Container</label>
                    <input type="number" value={envDevicesPerContainer} onChange={e => setEnvDevicesPerContainer(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <input type="checkbox" checked={deriveFromTurtle} onChange={e => setDeriveFromTurtle(e.target.checked)} className="accent-prizm-primary" />
                  <label className="text-prizm-text-muted uppercase">Let Turtle derive actual layout</label>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-prizm-surface p-4 rounded-lg border border-white/5 space-y-4">
          <h3 className="text-[11px] font-bold uppercase text-prizm-primary border-b border-white/5 pb-2">Summary / Calculated</h3>
          <div className="space-y-2 text-[10px] text-slate-300 uppercase">
            {layoutFamily === "stack750_800" ? (
              <>
                <div className="flex justify-between"><span>Arrays / Lineups:</span> <strong>{arrayCount}</strong></div>
                <div className="flex justify-between"><span>ES per array:</span> <strong>{esPerArray}</strong></div>
                <div className="flex justify-between"><span>Strings per ES:</span> <strong>{stringsPerEs}</strong></div>
                <div className="flex justify-between"><span>Total ES:</span> <strong>{arrayCount * esPerArray}</strong></div>
                <div className="flex justify-between"><span>Total strings:</span> <strong>{arrayCount * esPerArray * stringsPerEs}</strong></div>
                <div className="flex justify-between"><span>Collection segment per array:</span> <strong>1</strong></div>
                <div className="flex justify-between text-emerald-400"><span>Direct Feather devices:</span> <strong>{arrayCount * (esPerArray + 1)}</strong></div>
                <div className="flex justify-between"><span>PCS Source:</span> <strong className="text-cyan-400">Turtle Report</strong></div>
                <div className="flex justify-between"><span>String Source:</span> <strong className="text-cyan-400">Turtle Report</strong></div>
                
                <div className="mt-4 p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded">
                  Feather IP list will be generated based on your segment structure.
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between"><span>Arrays:</span> <strong>{arrayCount}</strong></div>
                <div className="flex justify-between"><span>Containers:</span> <strong>{arrayCount * containersPerArray}</strong></div>
                <div className="flex justify-between"><span>Stacks:</span> <strong>{arrayCount * containersPerArray * stacksPerContainer}</strong></div>
                <div className="flex justify-between"><span>Expected strings:</span> <strong>{arrayCount * stringsPerArray}</strong></div>
                <div className="flex justify-between"><span>Turtle-derived strings:</span> <strong className="text-amber-400">Pending</strong></div>
                <div className="flex justify-between"><span>PCS Source:</span> <strong className="text-cyan-400">Turtle Report</strong></div>
                <div className="flex justify-between text-purple-400"><span>Direct IP Devices:</span> <strong>None required by default</strong></div>

                <div className="mt-4 p-2 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded">
                  PRIZM will derive actual strings, arrays, and PCS data from EMS/Turtle after discovery.
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between border-t border-white/10 pt-4">
        <button 
          onClick={() => setCurrentStep(1)}
          className="px-6 py-2 border border-white/20 text-slate-300 font-extrabold uppercase text-[10px] rounded hover:bg-white/5"
        >
          Back
        </button>
        <button 
          onClick={() => setCurrentStep(3)}
          className="px-6 py-2 bg-prizm-primary text-black font-extrabold uppercase text-[10px] rounded hover:bg-cyan-400"
        >
          Next
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold uppercase text-prizm-primary">Discover & Preview Topology</h2>
          <p className="text-xs text-prizm-text-muted mt-1">
            PRIZM is discovering your site from EMS/Turtle and building an expected topology reference.
          </p>
        </div>
        <button onClick={handleRunDiscovery} className="px-4 py-2 bg-prizm-primary text-black uppercase font-bold text-[10px] rounded hover:bg-cyan-400 flex items-center gap-2">
          {isDiscovering ? <RefreshCw className="animate-spin" size={14}/> : <Search size={14}/>} Run Discovery
        </button>
      </div>

      <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-2">
        {["EMS Connection", "Blockviewer", "strings.csv", "First Responder", "IP Map", "String IP Map", "Array Reports", "PCS Reports"].map(s => (
          <div key={s} className="flex items-center gap-2 bg-prizm-surface px-3 py-1.5 rounded-full border border-white/10 whitespace-nowrap">
            <div className={`w-2 h-2 rounded-full ${discoveryData ? "bg-emerald-400" : "bg-gray-500"}`}></div>
            <span className="text-[9px] uppercase font-bold text-slate-300">{s}</span>
          </div>
        ))}
        {layoutFamily === "stack750_800" && (
          <div className="flex items-center gap-2 bg-prizm-surface px-3 py-1.5 rounded-full border border-white/10 whitespace-nowrap">
            <div className={`w-2 h-2 rounded-full ${discoveryData ? "bg-emerald-400" : "bg-gray-500"}`}></div>
            <span className="text-[9px] uppercase font-bold text-slate-300">Feather Scan</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="p-3 bg-prizm-surface border border-white/5 rounded text-center">
          <span className="block text-2xl font-black text-prizm-primary">{discoveryData?.arrays || "-"}</span>
          <span className="text-[9px] uppercase text-prizm-text-muted">Arrays</span>
        </div>
        {layoutFamily === "stack750_800" ? (
          <>
            <div className="p-3 bg-prizm-surface border border-white/5 rounded text-center">
              <span className="block text-2xl font-black text-prizm-primary">{discoveryData ? arrayCount : "-"}</span>
              <span className="text-[9px] uppercase text-prizm-text-muted">Collection Segments</span>
            </div>
            <div className="p-3 bg-prizm-surface border border-white/5 rounded text-center">
              <span className="block text-2xl font-black text-prizm-primary">{discoveryData ? arrayCount * esPerArray : "-"}</span>
              <span className="text-[9px] uppercase text-prizm-text-muted">Energy Segments</span>
            </div>
          </>
        ) : (
          <>
            <div className="p-3 bg-prizm-surface border border-white/5 rounded text-center">
              <span className="block text-2xl font-black text-prizm-primary">{discoveryData ? arrayCount * containersPerArray : "-"}</span>
              <span className="text-[9px] uppercase text-prizm-text-muted">Containers</span>
            </div>
            <div className="p-3 bg-prizm-surface border border-white/5 rounded text-center">
              <span className="block text-2xl font-black text-prizm-primary">{discoveryData ? arrayCount * containersPerArray * stacksPerContainer : "-"}</span>
              <span className="text-[9px] uppercase text-prizm-text-muted">Stacks</span>
            </div>
          </>
        )}
        <div className="p-3 bg-prizm-surface border border-white/5 rounded text-center">
          <span className="block text-2xl font-black text-prizm-primary">{discoveryData?.strings || "-"}</span>
          <span className="text-[9px] uppercase text-prizm-text-muted">Strings</span>
        </div>
        <div className="p-3 bg-prizm-surface border border-white/5 rounded text-center">
          <span className="block text-2xl font-black text-prizm-primary">{discoveryData?.pcs || "-"}</span>
          <span className="text-[9px] uppercase text-prizm-text-muted">PCS Units</span>
        </div>
        <div className="p-3 bg-prizm-surface border border-white/5 rounded text-center">
          <span className="block text-2xl font-black text-emerald-400">{discoveryData?.feathers ?? "-"}</span>
          <span className="text-[9px] uppercase text-prizm-text-muted">{layoutFamily === "stack750_800" ? "Feather Devices" : "Direct IP Devices"}</span>
        </div>
      </div>

      <div className="bg-prizm-surface border border-white/10 rounded-lg overflow-hidden">
        <div className="flex border-b border-white/10 text-[10px] uppercase font-bold">
          {["Topology Preview", "Devices Preview", "Direct IP Targets", "Turtle Sources", "Summary"].map(t => (
            <button 
              key={t}
              onClick={() => setPreviewTab(t)}
              className={`px-4 py-3 ${previewTab === t ? "border-b-2 border-prizm-primary text-prizm-primary bg-prizm-primary/5" : "text-prizm-text-muted hover:text-slate-200"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="p-4 h-[300px] overflow-y-auto no-scrollbar">
          {previewTab === "Topology Preview" && (
            <div className="text-[10px] text-slate-300 font-mono space-y-4">
              {layoutFamily === "stack750_800" ? (
                <>
                  <div className="pl-0">Array 1 / Lineup 1</div>
                  <div className="pl-4">Collection Segment</div>
                  <div className="pl-8 text-prizm-text-muted">- CS Feather | IP: 10.0.1.3 | Data Source: Direct IP | Validation: Required</div>
                  <div className="pl-4">Energy Segments</div>
                  <div className="pl-8 text-prizm-text-muted">- ES1 | IP: 10.0.1.10 | Paired Strings: S1/S2 | Data Source: Direct IP | Validation: Required</div>
                  <div className="pl-8 text-prizm-text-muted">- ES2 | IP: 10.0.1.15 | Paired Strings: S3/S4 | Data Source: Direct IP | Validation: Required</div>
                  <div className="pl-8 text-prizm-text-muted">- ES20 | IP: 10.0.1.105 | Paired Strings: S39/S40 | Data Source: Direct IP | Validation: Required</div>
                  <div className="pl-4">PCS 1</div>
                  <div className="pl-8 text-prizm-text-muted">Data Source: Turtle Report | Direct IP: Not required | Validation: Not Required</div>
                </>
              ) : layoutFamily === "stack360" ? (
                <>
                  <div className="pl-0">Array 1</div>
                  <div className="pl-4">Container 1</div>
                  <div className="pl-8 text-prizm-text-muted">Environmental Controller / PLC | Data Source: EMS/Turtle | Direct IP: Not required</div>
                  <div className="pl-8 text-prizm-text-muted">Stack 1 | Data Source: EMS/Turtle</div>
                  <div className="pl-8 text-prizm-text-muted">Stack 2 | Data Source: EMS/Turtle</div>
                  <div className="pl-4">PCS 1</div>
                  <div className="pl-8 text-prizm-text-muted">Data Source: Turtle Report | Direct IP: Not required</div>
                </>
              ) : (
                <>
                  <div className="pl-0">Array 1</div>
                  <div className="pl-4">Container 1</div>
                  <div className="pl-8 text-prizm-text-muted">Environmental Device 1 | Data Source: EMS/Turtle | Direct IP: Optional metadata</div>
                  <div className="pl-8 text-prizm-text-muted">Environmental Device 2 | Data Source: EMS/Turtle | Direct IP: Optional metadata</div>
                  <div className="pl-8 text-prizm-text-muted">Stack 1 | Data Source: EMS/Turtle</div>
                  <div className="pl-4">PCS 1</div>
                  <div className="pl-8 text-prizm-text-muted">Data Source: Turtle Report | Direct IP: Not required</div>
                </>
              )}
            </div>
          )}
          {previewTab === "Direct IP Targets" && (
            <div className="text-[10px] text-prizm-text-muted uppercase">
              {layoutFamily === "stack750_800" ? (
                "List of CS and ES Feathers requires direct IP validation..."
              ) : (
                "No direct IP targets required for this topology family. PRIZM will use EMS/Turtle sources unless direct device polling is configured."
              )}
            </div>
          )}
          {/* Implement other tabs lightly */}
          {(previewTab === "Devices Preview" || previewTab === "Turtle Sources" || previewTab === "Summary") && (
            <div className="text-[10px] text-prizm-text-muted uppercase italic">
              {previewTab} content generated here...
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between border-t border-white/10 pt-4">
        <button onClick={() => setCurrentStep(2)} className="px-6 py-2 border border-white/20 text-slate-300 font-extrabold uppercase text-[10px] rounded hover:bg-white/5">Back</button>
        <button onClick={() => setCurrentStep(4)} className="px-6 py-2 bg-prizm-primary text-black font-extrabold uppercase text-[10px] rounded hover:bg-cyan-400">Next</button>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold uppercase text-prizm-primary">Validate & Activate Topology</h2>
        <p className="text-xs text-prizm-text-muted mt-1">Review validation results and activate this topology profile.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase text-slate-200">Topology Validation Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-prizm-surface border border-white/10 p-3 rounded text-[10px] uppercase">
              <span className="text-prizm-text-muted block mb-1">Direct IP Validation</span>
              <strong className="text-emerald-400 text-xs">{layoutFamily === "stack750_800" ? "168 / 168 Online" : "Not Required"}</strong>
            </div>
            <div className="bg-prizm-surface border border-white/10 p-3 rounded text-[10px] uppercase">
              <span className="text-prizm-text-muted block mb-1">Turtle / EMS Data</span>
              <strong className="text-emerald-400 text-xs">All required sources OK</strong>
            </div>
            <div className="bg-prizm-surface border border-white/10 p-3 rounded text-[10px] uppercase">
              <span className="text-prizm-text-muted block mb-1">Topology Consistency</span>
              <strong className="text-emerald-400 text-xs">No issues found</strong>
            </div>
            <div className="bg-prizm-surface border border-white/10 p-3 rounded text-[10px] uppercase">
              <span className="text-prizm-text-muted block mb-1">Errors</span>
              <strong className="text-emerald-400 text-xs">0</strong>
            </div>
          </div>
          
          <div className="bg-prizm-surface border border-white/10 rounded p-4 space-y-2 text-[10px] uppercase font-bold text-slate-300">
            <div className="flex items-center gap-2 text-emerald-400"><CheckCircle size={12}/> EMS connection successful</div>
            <div className="flex items-center gap-2 text-emerald-400"><CheckCircle size={12}/> strings.csv loaded successfully</div>
            <div className="flex items-center gap-2 text-emerald-400"><CheckCircle size={12}/> blockviewer loaded successfully</div>
            <div className="flex items-center gap-2 text-emerald-400"><CheckCircle size={12}/> array reports available</div>
            <div className="flex items-center gap-2 text-emerald-400"><CheckCircle size={12}/> PCS reports available</div>
            {layoutFamily === "stack750_800" && <div className="flex items-center gap-2 text-emerald-400"><CheckCircle size={12}/> direct Feathers online</div>}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase text-slate-200">Activate Topology Profile</h3>
          <div className="bg-prizm-surface border border-white/10 rounded p-4 space-y-4 text-[10px]">
            <div>
              <label className="block text-prizm-text-muted uppercase mb-1">Profile Name</label>
              <input value={profileName} onChange={e => setProfileName(e.target.value)} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-prizm-text-muted uppercase mb-1">Station Code</label>
                <input value={stationCode} onChange={e => setStationCode(e.target.value)} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
              </div>
              <div>
                <label className="block text-prizm-text-muted uppercase mb-1">Block Index</label>
                <input type="number" value={blockIndex} onChange={e => setBlockIndex(parseInt(e.target.value))} className="w-full bg-prizm-surface-strong border border-white/10 rounded p-1.5 text-slate-200" />
              </div>
            </div>
            
            <div className="bg-prizm-surface-strong p-3 rounded space-y-1 text-slate-300 uppercase">
              <div className="flex justify-between"><span>Topology Family</span><strong>{layoutFamily}</strong></div>
              <div className="flex justify-between"><span>EMS / Turtle URL</span><strong>{emsUrl}</strong></div>
              <div className="flex justify-between"><span>Arrays</span><strong>{arrayCount}</strong></div>
            </div>

            <div className="flex items-center gap-2 mt-2">
              <input type="checkbox" checked={setAsActive} onChange={e => setSetAsActive(e.target.checked)} className="accent-prizm-primary" />
              <label className="text-prizm-text-muted uppercase font-bold">Set as Active Profile</label>
            </div>

            <button onClick={handleActivate} className="w-full py-2 bg-prizm-primary text-black font-extrabold uppercase rounded hover:bg-cyan-400 flex items-center justify-center gap-2">
              <Save size={14}/> Activate Profile
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-between border-t border-white/10 pt-4">
        <button onClick={() => setCurrentStep(3)} className="px-6 py-2 border border-white/20 text-slate-300 font-extrabold uppercase text-[10px] rounded hover:bg-white/5">Back</button>
        <button className="px-6 py-2 bg-white/10 text-slate-400 font-extrabold uppercase text-[10px] rounded cursor-not-allowed">Finish</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 font-mono text-slate-200">
      {statusMsg.text && (
        <div className={`p-4 rounded-lg flex items-center gap-3 border text-xs uppercase tracking-wider animate-fade-in ${
          statusMsg.type === "success" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
          statusMsg.type === "error" ? "bg-red-500/10 border-red-500/30 text-red-400 font-bold" :
          "bg-prizm-info/10 border-prizm-primary/30 text-cyan-400"
        }`}>
          <AlertCircle size={16} />
          <span>{statusMsg.text}</span>
        </div>
      )}

      <div className="bg-prizm-surface border border-white/10 rounded-lg p-6">
        {renderStepper()}
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
      </div>
    </div>
  );
}
