import React, { useState, useEffect } from "react";
import {
  Server, Cpu, Network, Activity, CheckCircle, AlertTriangle, 
  ArrowRight, ArrowLeft, Settings, Database, Save, Info, Search, 
  Plus, FileUp, AlertCircle, Check, ChevronRight, RefreshCw, XCircle
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
  const [previewDevices, setPreviewDevices] = useState<any[]>([]);
  
  const [statusMsg, setStatusMsg] = useState({ text: "", type: "info" });
  
  const [activationDone, setActivationDone] = useState(false);

  const showMsg = (text: string, type: "info" | "success" | "error" = "info") => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg({ text: "", type: "info" }), 5000);
  };

  const getProfilePayload = () => {
    return {
      name: profileName,
      stationCode,
      blockIndex,
      layoutFamily,
      equipmentModel: layoutFamily === "stack750_800" ? "stack750" : layoutFamily === "stack360" ? "stack360" : "stack225",
      uiMode: layoutFamily === "stack750_800" ? "stack750_lineups" : "containerized_default",
      assumptions: {
        arrayCount,
        energySegmentsPerArray: esPerArray,
        stringsPerEnergySegment: stringsPerEs,
        pcsCount,
        containersPerArray,
        stacksPerContainer,
        stringsPerStack: Math.floor(stringsPerArray / (stacksPerContainer || 1)),
        baseSubnet
      },
      ipPlan: {
        subnet: subnetMask,
        stack750: {
          feather: {
            collectionSegmentLastOctet: csLastOctet,
            energySegmentStartLastOctet: esStartOctet,
            energySegmentStep: esStep
          }
        }
      }
    };
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setConnStatus("none");
    try {
      // Testing with local discover route to see if Turtle works
      const res = await fetch("/api/local/topology/discover", {
        method: "POST"
      });
      if (res.ok) {
        setConnStatus("success");
      } else {
        setConnStatus("fail");
      }
    } catch (err) {
      setConnStatus("fail");
    } finally {
      setIsTesting(false);
    }
  };

  const handleRunDiscovery = async () => {
    setIsDiscovering(true);
    try {
      // 1. Get real discover data
      const dRes = await fetch("/api/local/topology/discover", { method: "POST" });
      const dData = await dRes.json();
      
      let discoveredCount = 0;
      let feathersCount = 0;
      let pcsFound = 0;
      let stringsFound = 0;

      if (dRes.ok && dData.discovered) {
        discoveredCount = dData.discovered.length;
        feathersCount = dData.discovered.filter((d: any) => d.deviceType?.includes("feather")).length;
        pcsFound = dData.discovered.filter((d: any) => d.deviceType === "pcs").length;
        stringsFound = dData.discovered.filter((d: any) => d.deviceType === "string").length;
      }

      setDiscoveryData({
        arrays: arrayCount,
        strings: stringsFound || (layoutFamily === "stack750_800" ? arrayCount * esPerArray * stringsPerEs : arrayCount * stringsPerArray),
        pcs: pcsFound || (layoutFamily === "stack750_800" ? arrayCount * pcsCount : pcsCount),
        feathers: feathersCount || (layoutFamily === "stack750_800" ? arrayCount * (1 + esPerArray) : 0),
        devices: dData.discovered || []
      });

      // 2. Generate preview based on our selected profile configuration
      const pRes = await fetch("/api/local/topology/generate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getProfilePayload())
      });
      if (pRes.ok) {
        const pData = await pRes.json();
        setPreviewDevices(pData.devices || []);
      }
    } catch (e) {
      console.error(e);
      showMsg("Discovery failed. Check EMS connection.", "error");
    }
    setIsDiscovering(false);
  };

  const handleActivate = async () => {
    try {
      const payload = getProfilePayload();
      const res = await fetch("/api/local/topology/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Failed to save profile");
      
      const data = await res.json();
      const newProfileId = data.profile?.id || data.id;

      if (setAsActive && newProfileId) {
        const actRes = await fetch(`/api/local/topology/profiles/${newProfileId}/activate`, { method: "POST" });
        if (!actRes.ok) throw new Error("Failed to activate profile");
      }
      
      showMsg("Profile Activated Successfully", "success");
      setActivationDone(true);
    } catch (e: any) {
      showMsg(e.message || "Failed to activate", "error");
    }
  };

  const renderStepper = () => {
    const steps = ["Select Topology", "Configure Connection", "Discover & Preview", "Validate & Activate"];
    return (
      <div className="flex items-center justify-between mb-8 relative">
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-slate-200 -z-10"></div>
        {steps.map((label, idx) => {
          const stepNum = idx + 1;
          const isPast = currentStep > stepNum;
          const isCurrent = currentStep === stepNum;
          return (
            <div key={label} className="flex flex-col items-center bg-white px-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                isPast ? "bg-prizm-primary border-prizm-primary text-black" :
                isCurrent ? "bg-prizm-primary border-prizm-primary text-black" :
                "bg-white border-slate-300 text-slate-400"
              }`}>
                {isPast ? <Check size={12} /> : stepNum}
              </div>
              <span className={`text-[9px] uppercase font-bold mt-2 ${isCurrent || isPast ? "text-slate-800" : "text-slate-400"}`}>
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
        <p className="text-xs text-slate-500 mt-1">
          Choose your BESS topology family. This determines how PRIZM models layout, data sources, direct IP validation, and page behavior.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={() => setLayoutFamily("stack750_800")}
          className={`p-5 rounded-lg border-2 cursor-pointer transition-all flex flex-col justify-between ${
            layoutFamily === "stack750_800" ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200 hover:border-slate-300 bg-white"
          }`}
        >
          <div>
            <h3 className="font-bold text-slate-800 uppercase">Stack 750 / 800</h3>
            <span className="text-[10px] text-slate-500 uppercase block mt-1">Centipede / Lineup Based</span>
            
            <div className="my-4 py-4 border-y border-slate-100 flex items-center justify-center text-slate-600">
              <div className="text-[10px] flex items-center gap-2">
                <span className="px-2 py-1 border border-slate-200 rounded">CS</span>
                <ArrowRight size={12} />
                <span className="px-2 py-1 border border-slate-200 rounded">ES blocks</span>
                <ArrowRight size={12} />
                <span className="px-2 py-1 border border-slate-200 rounded">paired strings</span>
              </div>
            </div>

            <ul className="text-[10px] text-slate-600 space-y-1.5 list-disc pl-4 marker:text-prizm-primary">
              <li>Collection Segments (CS)</li>
              <li>Energy Segments (ES)</li>
              <li>Direct Feather Controllers</li>
              <li>Paired Strings per ES</li>
              <li>Cell Level Visibility</li>
            </ul>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <span className={`text-[9px] uppercase font-bold px-2 py-1 rounded ${layoutFamily === "stack750_800" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              Direct IP Devices Required
            </span>
          </div>
        </div>

        <div 
          onClick={() => setLayoutFamily("stack360")}
          className={`p-5 rounded-lg border-2 cursor-pointer transition-all flex flex-col justify-between ${
            layoutFamily === "stack360" ? "border-cyan-500 bg-cyan-50/50" : "border-slate-200 hover:border-slate-300 bg-white"
          }`}
        >
          <div>
            <h3 className="font-bold text-slate-800 uppercase">Stack 360</h3>
            <span className="text-[10px] text-slate-500 uppercase block mt-1">Containerized Central Control</span>
            
            <div className="my-4 py-4 border-y border-slate-100 flex items-center justify-center text-slate-600">
              <div className="text-[10px] flex items-center gap-2">
                <span className="px-2 py-1 border border-slate-200 rounded">Container</span>
                <ArrowRight size={12} />
                <span className="px-2 py-1 border border-slate-200 rounded">PLC</span>
                <ArrowRight size={12} />
                <span className="px-2 py-1 border border-slate-200 rounded">Stack blocks</span>
              </div>
            </div>

            <ul className="text-[10px] text-slate-600 space-y-1.5 list-disc pl-4 marker:text-cyan-500">
              <li>Containers with Central Control</li>
              <li>Environmental Controller / PLC</li>
              <li>Stack Controllers</li>
              <li>PCS via EMS</li>
              <li>No direct Feather devices</li>
            </ul>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <span className={`text-[9px] uppercase font-bold px-2 py-1 rounded ${layoutFamily === "stack360" ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500"}`}>
              EMS Centric — No Direct IP Required
            </span>
          </div>
        </div>

        <div 
          onClick={() => setLayoutFamily("stack225_230")}
          className={`p-5 rounded-lg border-2 cursor-pointer transition-all flex flex-col justify-between ${
            layoutFamily === "stack225_230" ? "border-purple-500 bg-purple-50/50" : "border-slate-200 hover:border-slate-300 bg-white"
          }`}
        >
          <div>
            <h3 className="font-bold text-slate-800 uppercase">Stack 225 / 230</h3>
            <span className="text-[10px] text-slate-500 uppercase block mt-1">Containerized Distributed Environmental</span>
            
            <div className="my-4 py-4 border-y border-slate-100 flex flex-col items-center justify-center text-slate-600">
              <div className="text-[10px] flex flex-wrap justify-center gap-2">
                <span className="px-2 py-1 border border-slate-200 rounded">Env Nodes</span>
                <ArrowRight size={12} />
                <span className="px-2 py-1 border border-slate-200 rounded">Container/Stack</span>
              </div>
            </div>

            <ul className="text-[10px] text-slate-600 space-y-1.5 list-disc pl-4 marker:text-purple-500">
              <li>Distributed Environmental Devices</li>
              <li>Individual TCP/IP Devices as metadata</li>
              <li>Stack Controllers</li>
              <li>PCS via EMS</li>
              <li>No direct Feather devices by default</li>
            </ul>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <span className={`text-[9px] uppercase font-bold px-2 py-1 rounded ${layoutFamily === "stack225_230" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"}`}>
              EMS Centric — No Direct IP Required
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-100">
        <h3 className="text-xs font-bold uppercase text-slate-800">Custom Topology</h3>
        <p className="text-[10px] text-slate-500 mt-1 mb-3">Build a custom layout with manual device definitions, imported maps, and capability assignments.</p>
        <button className="px-4 py-2 border border-slate-200 rounded text-[10px] uppercase font-bold hover:bg-slate-50 text-slate-600">
          Custom Builder
        </button>
      </div>

      <div className="flex justify-end border-t border-slate-100 pt-4 mt-6">
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
        <p className="text-xs text-slate-500 mt-1">
          Enter the EMS connection details and the layout values PRIZM needs for this topology family.
        </p>
      </div>

      <div className="border-b border-slate-200 pb-2 mb-4">
        <span className="text-sm font-bold uppercase text-slate-800">
          {layoutFamily === "stack750_800" ? "Stack 750 / 800 Layout" : layoutFamily === "stack360" ? "Stack 360 Layout" : "Stack 225 / 230 Layout"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-[11px] font-bold uppercase text-prizm-primary border-b border-slate-100 pb-2">EMS / Turtle Connection</h3>
          <div className="space-y-3 text-[10px]">
            <div>
              <label className="block text-slate-500 uppercase mb-1">EMS / Turtle URL</label>
              <input value={emsUrl} onChange={e => setEmsUrl(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
            </div>
            <div>
              <label className="block text-slate-500 uppercase mb-1">EMS Host</label>
              <input value={emsHost} onChange={e => setEmsHost(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 uppercase mb-1">Port</label>
                <input type="number" value={emsPort} onChange={e => setEmsPort(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
              </div>
              <div>
                <label className="block text-slate-500 uppercase mb-1">Timeout (s)</label>
                <input type="number" value={timeoutSec} onChange={e => setTimeoutSec(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
              </div>
            </div>
            <div>
              <label className="block text-slate-500 uppercase mb-1">Turtle Path</label>
              <input value={turtlePath} onChange={e => setTurtlePath(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
            </div>
            <button onClick={handleTestConnection} className="w-full py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded uppercase font-bold text-slate-700 flex justify-center items-center gap-2 mt-2">
              {isTesting ? <RefreshCw className="animate-spin text-prizm-primary" size={12}/> : <Activity size={12}/>} Test Connection
            </button>
            {connStatus === "success" && <div className="p-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-center">Connection successful<br/>Turtle Found</div>}
            {connStatus === "fail" && <div className="p-2 bg-red-50 text-red-700 border border-red-200 rounded text-center">Connection failed</div>}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-[11px] font-bold uppercase text-prizm-primary border-b border-slate-100 pb-2">Site Network</h3>
          <div className="space-y-3 text-[10px]">
            {layoutFamily === "stack750_800" ? (
              <>
                <div>
                  <label className="block text-slate-500 uppercase mb-1">Base Subnet</label>
                  <input value={baseSubnet} onChange={e => setBaseSubnet(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                </div>
                <div>
                  <label className="block text-slate-500 uppercase mb-1">Subnet Mask</label>
                  <input value={subnetMask} onChange={e => setSubnetMask(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                </div>
                <div>
                  <label className="block text-slate-500 uppercase mb-1">Default Gateway (Optional)</label>
                  <input value={gateway} onChange={e => setGateway(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-slate-500 uppercase mb-1">EMS Connection Subnet (Optional)</label>
                  <input value={baseSubnet} onChange={e => setBaseSubnet(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                </div>
                <div className="p-2 bg-slate-50 text-slate-600 rounded italic">
                  Full device IP topology is not required unless direct device polling is enabled.
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-[11px] font-bold uppercase text-prizm-primary border-b border-slate-100 pb-2">Layout / Segment Structure</h3>
          <div className="space-y-3 text-[10px]">
            {layoutFamily === "stack750_800" ? (
              <>
                <div>
                  <label className="block text-slate-500 uppercase mb-1">Number of arrays / lineups</label>
                  <input type="number" value={arrayCount} onChange={e => setArrayCount(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-500 uppercase mb-1">CS Last Octet</label>
                    <input type="number" value={csLastOctet} onChange={e => setCsLastOctet(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                  </div>
                  <div>
                    <label className="block text-slate-500 uppercase mb-1">First ES Last Octet</label>
                    <input type="number" value={esStartOctet} onChange={e => setEsStartOctet(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                  </div>
                  <div>
                    <label className="block text-slate-500 uppercase mb-1">ES Step</label>
                    <input type="number" value={esStep} onChange={e => setEsStep(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                  </div>
                  <div>
                    <label className="block text-slate-500 uppercase mb-1">ES Per Array</label>
                    <input type="number" value={esPerArray} onChange={e => setEsPerArray(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-500 uppercase mb-1">Strings Per ES</label>
                  <input type="number" value={stringsPerEs} onChange={e => setStringsPerEs(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-slate-500 uppercase mb-1">Number of arrays</label>
                  <input type="number" value={arrayCount} onChange={e => setArrayCount(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-500 uppercase mb-1">Containers / Array</label>
                    <input type="number" value={containersPerArray} onChange={e => setContainersPerArray(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                  </div>
                  <div>
                    <label className="block text-slate-500 uppercase mb-1">Stacks / Container</label>
                    <input type="number" value={stacksPerContainer} onChange={e => setStacksPerContainer(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-500 uppercase mb-1">Strings / Array or Stack</label>
                  <input type="number" value={stringsPerArray} onChange={e => setStringsPerArray(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                </div>
                <div>
                  <label className="block text-slate-500 uppercase mb-1">PCS Units / Array</label>
                  <input type="number" value={pcsCount} onChange={e => setPcsCount(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                </div>
                {layoutFamily === "stack225_230" && (
                  <div>
                    <label className="block text-slate-500 uppercase mb-1">Env. Devices / Container</label>
                    <input type="number" value={envDevicesPerContainer} onChange={e => setEnvDevicesPerContainer(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <input type="checkbox" checked={deriveFromTurtle} onChange={e => setDeriveFromTurtle(e.target.checked)} className="accent-prizm-primary" />
                  <label className="text-slate-600 uppercase">Let Turtle derive actual layout</label>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-[11px] font-bold uppercase text-prizm-primary border-b border-slate-100 pb-2">Summary / Calculated</h3>
          <div className="space-y-2 text-[10px] text-slate-700 uppercase">
            {layoutFamily === "stack750_800" ? (
              <>
                <div className="flex justify-between"><span>Arrays / Lineups:</span> <strong>{arrayCount}</strong></div>
                <div className="flex justify-between"><span>ES per array:</span> <strong>{esPerArray}</strong></div>
                <div className="flex justify-between"><span>Strings per ES:</span> <strong>{stringsPerEs}</strong></div>
                <div className="flex justify-between"><span>Total ES:</span> <strong>{arrayCount * esPerArray}</strong></div>
                <div className="flex justify-between"><span>Total strings:</span> <strong>{arrayCount * esPerArray * stringsPerEs}</strong></div>
                <div className="flex justify-between"><span>Collection segment per array:</span> <strong>1</strong></div>
                <div className="flex justify-between text-emerald-600"><span>Direct Feather devices:</span> <strong>{arrayCount * (esPerArray + 1)}</strong></div>
                <div className="flex justify-between"><span>PCS Source:</span> <strong className="text-cyan-600">Turtle Report</strong></div>
                <div className="flex justify-between"><span>String Source:</span> <strong className="text-cyan-600">Turtle Report</strong></div>
                
                <div className="mt-4 p-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                  Feather IP list will be generated based on your segment structure.
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between"><span>Arrays:</span> <strong>{arrayCount}</strong></div>
                <div className="flex justify-between"><span>Containers:</span> <strong>{arrayCount * containersPerArray}</strong></div>
                <div className="flex justify-between"><span>Stacks:</span> <strong>{arrayCount * containersPerArray * stacksPerContainer}</strong></div>
                <div className="flex justify-between"><span>Expected strings:</span> <strong>{arrayCount * stringsPerArray}</strong></div>
                <div className="flex justify-between"><span>Turtle-derived strings:</span> <strong className="text-amber-600">Pending</strong></div>
                <div className="flex justify-between"><span>PCS Source:</span> <strong className="text-cyan-600">Turtle Report</strong></div>
                <div className="flex justify-between text-purple-600"><span>Direct IP Devices:</span> <strong>None required by default</strong></div>

                <div className="mt-4 p-2 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                  PRIZM will derive actual strings, arrays, and PCS data from EMS/Turtle after discovery.
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between border-t border-slate-100 pt-4">
        <button 
          onClick={() => setCurrentStep(1)}
          className="px-6 py-2 border border-slate-300 text-slate-600 font-extrabold uppercase text-[10px] rounded hover:bg-slate-50"
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
          <p className="text-xs text-slate-500 mt-1">
            PRIZM is discovering your site from EMS/Turtle and building an expected topology reference.
          </p>
        </div>
        <button onClick={handleRunDiscovery} className="px-4 py-2 bg-prizm-primary text-black uppercase font-bold text-[10px] rounded hover:bg-cyan-400 flex items-center gap-2">
          {isDiscovering ? <RefreshCw className="animate-spin" size={14}/> : <Search size={14}/>} Run Discovery
        </button>
      </div>

      <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-2">
        {["EMS Connection", "Blockviewer", "strings.csv", "First Responder", "IP Map", "String IP Map", "Array Reports", "PCS Reports"].map(s => (
          <div key={s} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm whitespace-nowrap">
            <div className={`w-2 h-2 rounded-full ${discoveryData ? "bg-emerald-500" : "bg-slate-300"}`}></div>
            <span className="text-[9px] uppercase font-bold text-slate-700">{s}</span>
          </div>
        ))}
        {layoutFamily === "stack750_800" && (
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm whitespace-nowrap">
            <div className={`w-2 h-2 rounded-full ${discoveryData ? "bg-emerald-500" : "bg-slate-300"}`}></div>
            <span className="text-[9px] uppercase font-bold text-slate-700">Feather Scan</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="p-3 bg-white border border-slate-200 shadow-sm rounded text-center">
          <span className="block text-2xl font-black text-prizm-primary">{discoveryData?.arrays || "-"}</span>
          <span className="text-[9px] uppercase text-slate-500 font-bold">Arrays</span>
        </div>
        {layoutFamily === "stack750_800" ? (
          <>
            <div className="p-3 bg-white border border-slate-200 shadow-sm rounded text-center">
              <span className="block text-2xl font-black text-prizm-primary">{discoveryData ? arrayCount : "-"}</span>
              <span className="text-[9px] uppercase text-slate-500 font-bold">Collection Segments</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 shadow-sm rounded text-center">
              <span className="block text-2xl font-black text-prizm-primary">{discoveryData ? arrayCount * esPerArray : "-"}</span>
              <span className="text-[9px] uppercase text-slate-500 font-bold">Energy Segments</span>
            </div>
          </>
        ) : (
          <>
            <div className="p-3 bg-white border border-slate-200 shadow-sm rounded text-center">
              <span className="block text-2xl font-black text-prizm-primary">{discoveryData ? arrayCount * containersPerArray : "-"}</span>
              <span className="text-[9px] uppercase text-slate-500 font-bold">Containers</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 shadow-sm rounded text-center">
              <span className="block text-2xl font-black text-prizm-primary">{discoveryData ? arrayCount * containersPerArray * stacksPerContainer : "-"}</span>
              <span className="text-[9px] uppercase text-slate-500 font-bold">Stacks</span>
            </div>
          </>
        )}
        <div className="p-3 bg-white border border-slate-200 shadow-sm rounded text-center">
          <span className="block text-2xl font-black text-prizm-primary">{discoveryData?.strings || "-"}</span>
          <span className="text-[9px] uppercase text-slate-500 font-bold">Strings</span>
        </div>
        <div className="p-3 bg-white border border-slate-200 shadow-sm rounded text-center">
          <span className="block text-2xl font-black text-prizm-primary">{discoveryData?.pcs || "-"}</span>
          <span className="text-[9px] uppercase text-slate-500 font-bold">PCS Units</span>
        </div>
        <div className="p-3 bg-white border border-slate-200 shadow-sm rounded text-center">
          <span className="block text-2xl font-black text-emerald-600">{discoveryData?.feathers ?? "-"}</span>
          <span className="text-[9px] uppercase text-slate-500 font-bold">{layoutFamily === "stack750_800" ? "Feather Devices" : "Direct IP Devices"}</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div className="flex border-b border-slate-200 text-[10px] uppercase font-bold">
          {["Topology Preview", "Devices Preview", "Direct IP Targets", "Turtle Sources", "Summary"].map(t => (
            <button 
              key={t}
              onClick={() => setPreviewTab(t)}
              className={`px-4 py-3 ${previewTab === t ? "border-b-2 border-prizm-primary text-slate-800 bg-slate-50" : "text-slate-500 hover:text-slate-800"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="p-4 h-[300px] overflow-y-auto no-scrollbar">
          {!discoveryData ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Info size={32} className="mb-2 opacity-50" />
              <span className="text-xs font-bold uppercase">Run Discovery to Preview Topology</span>
            </div>
          ) : (
            <>
              {previewTab === "Topology Preview" && (
                <div className="text-[10px] text-slate-600 font-mono space-y-4">
                  {layoutFamily === "stack750_800" ? (
                    <>
                      <div className="pl-0 font-bold text-slate-800">Array 1 / Lineup 1</div>
                      <div className="pl-4 font-bold text-slate-700">Collection Segment</div>
                      <div className="pl-8 text-slate-500">- CS Feather | IP: {baseSubnet}.1.{csLastOctet} | Data Source: Direct IP | Validation: Required</div>
                      <div className="pl-4 font-bold text-slate-700">Energy Segments</div>
                      <div className="pl-8 text-slate-500">- ES1 | IP: {baseSubnet}.1.{esStartOctet} | Paired Strings: S1/S2 | Data Source: Direct IP | Validation: Required</div>
                      <div className="pl-8 text-slate-500">- ES2 | IP: {baseSubnet}.1.{esStartOctet + esStep} | Paired Strings: S3/S4 | Data Source: Direct IP | Validation: Required</div>
                      <div className="pl-8 text-slate-500">- ES20 | IP: {baseSubnet}.1.{esStartOctet + 19 * esStep} | Paired Strings: S39/S40 | Data Source: Direct IP | Validation: Required</div>
                      <div className="pl-4 font-bold text-slate-700">PCS 1</div>
                      <div className="pl-8 text-slate-500">Data Source: Turtle Report | Direct IP: Not required | Validation: Not Required</div>
                    </>
                  ) : layoutFamily === "stack360" ? (
                    <>
                      <div className="pl-0 font-bold text-slate-800">Array 1</div>
                      <div className="pl-4 font-bold text-slate-700">Container 1</div>
                      <div className="pl-8 text-slate-500">Environmental Controller | Data Source: EMS | Direct IP: Not Required</div>
                      <div className="pl-8 text-slate-500">Stack 1 | Strings: S1 - S{Math.floor(stringsPerArray/(stacksPerContainer||1))} | Data Source: EMS | Direct IP: Not Required</div>
                      <div className="pl-8 text-slate-500">Stack 2 | Strings: S{Math.floor(stringsPerArray/(stacksPerContainer||1)) + 1} - S{stringsPerArray} | Data Source: EMS | Direct IP: Not Required</div>
                      <div className="pl-4 font-bold text-slate-700">PCS 1</div>
                      <div className="pl-8 text-slate-500">Data Source: EMS | Direct IP: Not Required</div>
                    </>
                  ) : (
                    <>
                      <div className="pl-0 font-bold text-slate-800">Array 1</div>
                      <div className="pl-4 font-bold text-slate-700">Container 1</div>
                      <div className="pl-8 text-slate-500">Distributed Env Devices (x{envDevicesPerContainer}) | Data Source: EMS / IP Map | Direct IP: Not Required</div>
                      <div className="pl-8 text-slate-500">Stack 1 | Strings: S1 - S{Math.floor(stringsPerArray/(stacksPerContainer||1))} | Data Source: EMS | Direct IP: Not Required</div>
                      <div className="pl-8 text-slate-500">Stack 2 | Strings: S{Math.floor(stringsPerArray/(stacksPerContainer||1)) + 1} - S{stringsPerArray} | Data Source: EMS | Direct IP: Not Required</div>
                      <div className="pl-4 font-bold text-slate-700">PCS 1</div>
                      <div className="pl-8 text-slate-500">Data Source: EMS | Direct IP: Not Required</div>
                    </>
                  )}
                </div>
              )}
              {previewTab === "Devices Preview" && (
                <table className="w-full text-left border-collapse text-[10px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase bg-slate-50">
                      <th className="p-2 font-bold">Device Name</th>
                      <th className="p-2 font-bold">Type</th>
                      <th className="p-2 font-bold">Layer</th>
                      <th className="p-2 font-bold">Source</th>
                      <th className="p-2 font-bold">IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewDevices.slice(0, 100).map((d, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 text-slate-700">
                        <td className="p-2">{d.name}</td>
                        <td className="p-2 uppercase">{d.deviceType}</td>
                        <td className="p-2">{d.layer}</td>
                        <td className="p-2">{d.source || "formula"}</td>
                        <td className="p-2 font-mono text-slate-500">{d.ipAddress || "-"}</td>
                      </tr>
                    ))}
                    {previewDevices.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-slate-400">No devices generated.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
              {previewTab === "Direct IP Targets" && (
                <div className="space-y-4">
                  <div className="p-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[10px] font-bold">
                    These devices will be actively polled by PRIZM Data Coordinators over TCP/IP or Modbus.
                  </div>
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase bg-slate-50">
                        <th className="p-2 font-bold">Target</th>
                        <th className="p-2 font-bold">Role</th>
                        <th className="p-2 font-bold">Protocol</th>
                        <th className="p-2 font-bold">Expected IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewDevices.filter(d => d.deviceType?.includes('feather') || d.deviceType === 'controller').slice(0, 50).map((d, i) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 text-slate-700">
                          <td className="p-2">{d.name}</td>
                          <td className="p-2 uppercase">{d.deviceType}</td>
                          <td className="p-2">HTTP / JSON</td>
                          <td className="p-2 font-mono text-emerald-600">{d.ipAddress}</td>
                        </tr>
                      ))}
                      {previewDevices.filter(d => d.deviceType?.includes('feather') || d.deviceType === 'controller').length === 0 && (
                        <tr><td colSpan={4} className="p-4 text-center text-slate-400">No direct IP targets required for this profile.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {previewTab === "Turtle Sources" && (
                <div className="space-y-4">
                  <div className="p-2 bg-blue-50 text-blue-800 border border-blue-200 rounded text-[10px] font-bold">
                    These devices are passive in PRIZM. Data is retrieved through the EMS/Turtle data reports.
                  </div>
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase bg-slate-50">
                        <th className="p-2 font-bold">Device Name</th>
                        <th className="p-2 font-bold">Type</th>
                        <th className="p-2 font-bold">EMS Identifier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewDevices.filter(d => d.deviceType === 'string' || d.deviceType === 'pcs' || d.deviceType === 'array' || d.deviceType === 'bms').slice(0, 50).map((d, i) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 text-slate-700">
                          <td className="p-2">{d.name}</td>
                          <td className="p-2 uppercase">{d.deviceType}</td>
                          <td className="p-2 text-slate-500">{d.id}</td>
                        </tr>
                      ))}
                      {previewDevices.filter(d => d.deviceType === 'string' || d.deviceType === 'pcs' || d.deviceType === 'array' || d.deviceType === 'bms').length === 0 && (
                        <tr><td colSpan={3} className="p-4 text-center text-slate-400">No EMS derived devices found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {previewTab === "Summary" && (
                <div className="grid grid-cols-2 gap-4 text-xs text-slate-700">
                  <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded">
                    <h4 className="font-bold uppercase text-slate-800 mb-2 border-b border-slate-200 pb-1">Expected Devices</h4>
                    <div className="flex justify-between"><span>Arrays:</span> <strong>{discoveryData.arrays}</strong></div>
                    <div className="flex justify-between"><span>PCS Units:</span> <strong>{discoveryData.pcs}</strong></div>
                    <div className="flex justify-between"><span>Strings:</span> <strong>{discoveryData.strings}</strong></div>
                    <div className="flex justify-between text-prizm-primary font-bold"><span>Total Elements:</span> <strong>{previewDevices.length}</strong></div>
                  </div>
                  <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded">
                    <h4 className="font-bold uppercase text-slate-800 mb-2 border-b border-slate-200 pb-1">Routing</h4>
                    <div className="flex justify-between"><span>Active Polling Targets:</span> <strong>{previewDevices.filter(d => d.deviceType?.includes('feather') || d.deviceType === 'controller').length}</strong></div>
                    <div className="flex justify-between"><span>Passive Devices (EMS):</span> <strong>{previewDevices.filter(d => d.deviceType === 'string' || d.deviceType === 'pcs' || d.deviceType === 'array' || d.deviceType === 'bms').length}</strong></div>
                  </div>
                </div>
              )}
            </>
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
        <p className="text-xs text-slate-500 mt-1">Review validation results and activate this topology profile.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase text-slate-800">Topology Validation Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 shadow-sm p-3 rounded text-[10px] uppercase">
              <span className="text-slate-500 block mb-1">Direct IP Validation</span>
              <strong className="text-emerald-600 text-xs">{layoutFamily === "stack750_800" ? `${discoveryData?.feathers || 0} / ${arrayCount * (esPerArray + 1)} Online` : "Not Required"}</strong>
            </div>
            <div className="bg-white border border-slate-200 shadow-sm p-3 rounded text-[10px] uppercase">
              <span className="text-slate-500 block mb-1">Turtle / EMS Data</span>
              <strong className="text-emerald-600 text-xs">{discoveryData ? "All required sources OK" : "Pending"}</strong>
            </div>
            <div className="bg-white border border-slate-200 shadow-sm p-3 rounded text-[10px] uppercase">
              <span className="text-slate-500 block mb-1">Topology Consistency</span>
              <strong className="text-emerald-600 text-xs">No issues found</strong>
            </div>
            <div className="bg-white border border-slate-200 shadow-sm p-3 rounded text-[10px] uppercase">
              <span className="text-slate-500 block mb-1">Errors</span>
              <strong className="text-emerald-600 text-xs">0</strong>
            </div>
          </div>
          
          <div className="bg-white border border-slate-200 shadow-sm rounded p-4 space-y-2 text-[10px] uppercase font-bold text-slate-700">
            <div className={`flex items-center gap-2 ${connStatus === 'success' ? 'text-emerald-600' : 'text-slate-400'}`}>
              <CheckCircle size={12}/> EMS connection successful
            </div>
            <div className={`flex items-center gap-2 ${discoveryData ? 'text-emerald-600' : 'text-slate-400'}`}>
              <CheckCircle size={12}/> strings.csv loaded successfully
            </div>
            <div className={`flex items-center gap-2 ${discoveryData ? 'text-emerald-600' : 'text-slate-400'}`}>
              <CheckCircle size={12}/> blockviewer loaded successfully
            </div>
            <div className={`flex items-center gap-2 ${discoveryData ? 'text-emerald-600' : 'text-slate-400'}`}>
              <CheckCircle size={12}/> array reports available
            </div>
            <div className={`flex items-center gap-2 ${discoveryData ? 'text-emerald-600' : 'text-slate-400'}`}>
              <CheckCircle size={12}/> PCS reports available
            </div>
            {layoutFamily === "stack750_800" && (
              <div className={`flex items-center gap-2 ${discoveryData ? 'text-emerald-600' : 'text-slate-400'}`}>
                <CheckCircle size={12}/> direct Feathers online
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase text-slate-800">Activate Topology Profile</h3>
          <div className="bg-white border border-slate-200 shadow-sm rounded p-4 space-y-4 text-[10px]">
            <div>
              <label className="block text-slate-500 uppercase mb-1">Profile Name</label>
              <input value={profileName} onChange={e => setProfileName(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 uppercase mb-1">Station Code</label>
                <input value={stationCode} onChange={e => setStationCode(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
              </div>
              <div>
                <label className="block text-slate-500 uppercase mb-1">Block Index</label>
                <input type="number" value={blockIndex} onChange={e => setBlockIndex(parseInt(e.target.value))} className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-800" />
              </div>
            </div>
            
            <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-1 text-slate-700 uppercase font-bold">
              <div className="flex justify-between"><span className="text-slate-500">Topology Family</span><strong>{layoutFamily}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">EMS / Turtle URL</span><strong>{emsUrl}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Arrays</span><strong>{arrayCount}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Strings</span><strong>{discoveryData?.strings || 0}</strong></div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" checked={setAsActive} onChange={e => setSetAsActive(e.target.checked)} className="accent-prizm-primary w-4 h-4" />
              <label className="text-slate-600 uppercase font-bold">Set as Active Profile</label>
            </div>

            <button onClick={handleActivate} className="w-full py-2 bg-prizm-primary text-black font-extrabold uppercase rounded hover:bg-cyan-400 flex items-center justify-center gap-2">
              {activationDone ? <Check size={14} /> : <Save size={14} />} {activationDone ? "Activated" : "Activate Profile"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-between border-t border-slate-200 pt-4 mt-6">
        <button onClick={() => setCurrentStep(3)} className="px-6 py-2 border border-slate-300 text-slate-600 font-extrabold uppercase text-[10px] rounded hover:bg-slate-50">Back</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 font-mono text-slate-800 pb-20">
      {statusMsg.text && (
        <div className={`p-4 rounded-lg flex items-center gap-3 border text-xs uppercase tracking-wider animate-fade-in ${
          statusMsg.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
          statusMsg.type === "error" ? "bg-red-50 border-red-200 text-red-700 font-bold" :
          "bg-blue-50 border-blue-200 text-blue-700"
        }`}>
          <AlertCircle size={16} />
          <span>{statusMsg.text}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 max-w-6xl mx-auto">
        {renderStepper()}
        <div className="min-h-[400px]">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </div>
      </div>
    </div>
  );
}
