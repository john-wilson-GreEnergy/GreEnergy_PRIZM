import React, { useState, useEffect } from "react";
import { ShieldAlert, AlertTriangle, RefreshCw, Cpu, CheckCircle, XCircle } from "lucide-react";

interface Candidate {
  id: string;
  displayKey: string;
  entityKey: string;
  entityKeyToken: string;
  entityType: string;
  entitySubType: string;
  statusMessage: string;
  enabled: boolean;
  ready: boolean;
  communicating: boolean;
  allowFaultReset: boolean;
  stationCode: string;
  blockIndex: string;
  sourceEndpoint: string;
  lastSeen: string;
}

export default function SafetyFaultClearView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [executeResult, setExecuteResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rawEntityDetails, setRawEntityDetails] = useState<any>(null);

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/local/safety-fault-clear/candidates");
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  const handleExecute = async () => {
    if (!selectedCandidate) return;
    setProcessing(true);
    setExecuteResult(null);

    try {
      const res = await fetch("/api/local/safety-fault-clear/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: data?.profileId,
          entityKeyToken: selectedCandidate.entityKeyToken,
          expectedDisplayKey: selectedCandidate.displayKey,
          expectedStatusMessage: selectedCandidate.statusMessage,
          confirmationText: confirmationInput
        })
      });

      const resData = await res.json();
      setExecuteResult(resData);
      
      const historyEntry = { ...resData, timestamp: new Date().toISOString() };
      setHistory(prev => [historyEntry, ...prev]);

      if (resData.ok) {
         fetchCandidates(); // refresh table
      }

    } catch (err) {
      setExecuteResult({ error: String(err) });
    } finally {
      setProcessing(false);
    }
  };

  const isEligible = (c: Candidate) => c.allowFaultReset && c.entityKeyToken && data?.profileId;

  if (loading && !data) {
     return <div className="p-8 text-prizm-text-muted font-mono uppercase text-xs flex justify-center">Loading Blockviewer Topology...</div>;
  }

  return (
    <div className="flex-1 flex flex-col font-sans h-full bg-prizm-bg p-4 sm:p-6 overflow-y-auto custom-scrollbar pb-20 relative">
       
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-prizm-border pb-4 mb-4 shrink-0">
         <div>
            <span className="text-[10px] text-prizm-danger font-bold uppercase tracking-wider block">Safety Command Action</span>
            <h2 className="text-lg font-bold text-prizm-text tracking-wide flex items-center gap-2">
               Manual Fault Reset
            </h2>
         </div>
         
         <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono select-none">
            <button onClick={fetchCandidates} className="flex items-center gap-1.5 px-3 py-1.5 border border-prizm-border bg-prizm-surface hover:bg-prizm-surface-strong text-prizm-text-muted hover:text-prizm-text rounded transition cursor-pointer">
               <RefreshCw size={12} className={loading ? "animate-spin text-prizm-primary" : ""} />
               REFRESH TOPOLOGY
            </button>
         </div>
      </div>

      <div className="bg-prizm-warning/10 border border-prizm-warning/30 rounded-lg p-5 mb-8">
         <div className="flex items-start gap-4">
            <ShieldAlert size={24} className="text-prizm-warning shrink-0 mt-1" />
            <div>
               <h3 className="text-prizm-warning font-bold uppercase text-xs tracking-wider mb-2">Restricted Zone: Safety Clear Enabled</h3>
               <p className="text-sm text-prizm-text-muted">
                 Commands generated here send active control directives directly to the EMS. Local Turtle systems do not return deterministic success confirmations synchronously; HTTP 200 implies QUEUED. Changes require subsequent topology rescans to verify cleared states.
               </p>
               <div className="mt-4 flex flex-wrap gap-4 text-[10px] font-mono font-bold text-prizm-text">
                  <div className="bg-black/30 px-2 py-1 rounded border border-prizm-border">
                     Target Profile: {data?.profileId}
                  </div>
                  <div className="bg-black/30 px-2 py-1 rounded border border-prizm-border">
                     EMS Base URL: {data?.emsBaseUrl}
                  </div>
                  <div className="bg-black/30 px-2 py-1 rounded border border-prizm-border text-prizm-text-muted">
                     Last Scan: {new Date().toLocaleTimeString()}
                  </div>
               </div>
            </div>
         </div>
      </div>
      
      <div className="mb-8">
         <h3 className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest border-b border-prizm-border pb-2 mb-4">Eligible Fault Clear Entities</h3>
         {data?.eligible && data.eligible.length === 0 ? (
             <div className="p-8 text-center text-prizm-text-muted font-mono text-[10px] uppercase border border-prizm-border border-dashed rounded bg-black/10">
                No active entities currently flagged with allowFaultReset=true.
             </div>
         ) : (
             <div className="overflow-x-auto border border-prizm-border rounded-lg bg-prizm-surface">
                 <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
                   <thead className="bg-prizm-surface-strong text-prizm-text-muted">
                      <tr>
                         <th className="px-4 py-3 font-bold uppercase border-b border-prizm-border">Display Key</th>
                         <th className="px-4 py-3 font-bold uppercase border-b border-prizm-border">Type / SubType</th>
                         <th className="px-4 py-3 font-bold uppercase border-b border-prizm-border">Status Message</th>
                         <th className="px-4 py-3 font-bold uppercase border-b border-prizm-border">Rdy / Comm / En</th>
                         <th className="px-4 py-3 font-bold uppercase border-b border-prizm-border text-prizm-danger text-center">allowFaultReset</th>
                         <th className="px-4 py-3 font-bold uppercase border-b border-prizm-border text-center">Action</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-prizm-border/40">
                      {data?.eligible.map((item: Candidate) => (
                         <tr key={item.id} className="hover:bg-white/5 text-prizm-text">
                            <td className="px-4 py-3">
                               <button onClick={() => { setRawEntityDetails(item); setDrawerOpen(true); }} className="hover:underline font-bold text-prizm-info">
                                 {item.displayKey}
                               </button>
                               <div className="text-[9px] text-prizm-text-muted mt-0.5">{item.entityKeyToken}</div>
                            </td>
                            <td className="px-4 py-3 text-prizm-text-muted">{item.entityType} {item.entitySubType ? ` / ${item.entitySubType}` : ''}</td>
                            <td className="px-4 py-3 max-w-[200px] truncate" title={item.statusMessage}>{item.statusMessage || "-"}</td>
                            <td className="px-4 py-3 text-center">
                               <span className={item.ready ? "text-emerald-400 mx-1" : "text-prizm-text-muted mx-1"}>R</span>
                               <span className={item.communicating ? "text-emerald-400 mx-1" : "text-prizm-danger mx-1"}>C</span>
                               <span className={item.enabled ? "text-emerald-400 mx-1" : "text-prizm-text-muted mx-1"}>E</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                               <span className="bg-prizm-danger/10 text-prizm-danger rounded px-2 py-0.5 font-bold uppercase">TRUE</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                                <button 
                                   disabled={!isEligible(item)}
                                   onClick={() => {
                                      setSelectedCandidate(item);
                                      setConfirmationInput("");
                                      setExecuteResult(null);
                                   }}
                                   className="bg-prizm-primary/10 hover:bg-prizm-primary/20 text-prizm-primary border border-prizm-primary/30 px-3 py-1 font-bold rounded uppercase transition disabled:opacity-50 disabled:cursor-not-allowed"
                                 >
                                   Queue Fault Clear
                                </button>
                            </td>
                         </tr>
                      ))}
                   </tbody>
                 </table>
             </div>
         )}
      </div>

      {history.length > 0 && (
         <div className="mb-8">
            <h3 className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest border-b border-prizm-border pb-2 mb-4">Command History (Current Session)</h3>
            <div className="overflow-x-auto border border-prizm-border rounded-lg bg-prizm-surface">
                 <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
                   <thead className="bg-black/20 text-prizm-text-muted">
                      <tr>
                         <th className="px-4 py-2 font-bold uppercase border-b border-prizm-border">Timestamp</th>
                         <th className="px-4 py-2 font-bold uppercase border-b border-prizm-border">Entity Token</th>
                         <th className="px-4 py-2 font-bold uppercase border-b border-prizm-border">Result</th>
                         <th className="px-4 py-2 font-bold uppercase border-b border-prizm-border">Verification</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-prizm-border/40">
                      {history.map((h, i) => (
                         <tr key={i} className="hover:bg-white/5">
                            <td className="px-4 py-2 text-prizm-text-muted">{new Date(h.timestamp).toLocaleTimeString()}</td>
                            <td className="px-4 py-2 text-prizm-text font-bold">{h.entityKeyToken}</td>
                            <td className="px-4 py-2">
                               {h.queued ? <span className="text-emerald-400 font-bold uppercase flex items-center gap-1"><CheckCircle size={10} /> Queued (HTTP 200)</span> : <span className="text-prizm-danger font-bold uppercase flex items-center gap-1"><XCircle size={10} /> ${h.error || 'Failed'}</span>}
                            </td>
                            <td className="px-4 py-2 text-prizm-text-muted">
                                {h.verification ? (
                                    h.verification.appearsCleared ? (
                                        <span className="text-emerald-400 font-bold">Appears Cleared</span>
                                    ) : (
                                        <span>No change confirmed in immediate scan</span>
                                    )
                                ) : '-'}
                            </td>
                         </tr>
                      ))}
                   </tbody>
                 </table>
            </div>
         </div>
      )}

      {/* Not eligible */}
      <div className="mb-8">
         <h3 className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest border-b border-prizm-border pb-2 mb-4">Observed Topology Entities (Not Eligible for Reset)</h3>
         <div className="overflow-y-auto max-h-[300px] border border-prizm-border rounded-lg bg-prizm-surface">
            <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
              <thead className="bg-prizm-surface-strong text-prizm-text-muted sticky top-0">
                 <tr>
                    <th className="px-4 py-2 border-b border-prizm-border">Display Key</th>
                    <th className="px-4 py-2 border-b border-prizm-border">Status Message</th>
                    <th className="px-4 py-2 border-b border-prizm-border text-center">allowFaultReset</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-prizm-border/40">
                 {data?.notEligible?.map((item: Candidate) => (
                    <tr key={item.id} className="hover:bg-white/5 opacity-60 hover:opacity-100">
                       <td className="px-4 py-1.5 text-prizm-text">{item.displayKey} <span className="text-[9px] text-prizm-text-muted ml-2">{item.entityKeyToken}</span></td>
                       <td className="px-4 py-1.5 text-prizm-text-muted">{item.statusMessage || "-"}</td>
                       <td className="px-4 py-1.5 text-center text-prizm-text-muted">FALSE</td>
                    </tr>
                 ))}
                 {!data?.notEligible?.length && (
                    <tr><td colSpan={3} className="px-4 py-3 text-center text-prizm-text-muted">No entities found</td></tr>
                 )}
              </tbody>
            </table>
         </div>
      </div>
      
      {/* Target Action Modal */}
      {selectedCandidate && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !processing && setSelectedCandidate(null)} />
            
            <div className="bg-[#0E1015] border border-prizm-border rounded-lg shadow-2xl z-10 w-full max-w-lg overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
               <div className="bg-prizm-warning/10 border-b border-prizm-warning/30 p-4 flex items-center gap-3 shrink-0">
                  <AlertTriangle className="text-prizm-warning" />
                  <h3 className="font-bold font-mono text-prizm-warning uppercase tracking-widest text-sm">Target Action Confirmation</h3>
               </div>
               
               <div className="p-6 overflow-y-auto font-mono text-xs">
                  <p className="text-prizm-text-muted leading-relaxed mb-6">
                     You are about to issue a manual `<span className="text-prizm-text font-bold">ClearDeviceFault</span>` command natively to the local Turtle EMS. 
                     This action will inject a valid protobuf payload into the controller's runtime block sequence.
                  </p>
                  
                  <div className="bg-black/30 border border-prizm-border rounded p-4 space-y-3 mb-6">
                     <div className="grid grid-cols-[120px_1fr] gap-2">
                        <span className="text-prizm-text-muted">Expected Key:</span>
                        <span className="text-prizm-text font-bold">{selectedCandidate.displayKey}</span>
                     </div>
                     <div className="grid grid-cols-[120px_1fr] gap-2">
                        <span className="text-prizm-text-muted">Type / SubType:</span>
                        <span className="text-prizm-text">{selectedCandidate.entityType} {selectedCandidate.entitySubType ? `/ ${selectedCandidate.entitySubType}` : ''}</span>
                     </div>
                     <div className="grid grid-cols-[120px_1fr] gap-2 items-start">
                        <span className="text-prizm-text-muted">Entity Token:</span>
                        <span className="text-prizm-text bg-prizm-surface px-1.5 py-0.5 rounded break-all tracking-wider text-[10px] border border-prizm-border">{selectedCandidate.entityKeyToken}</span>
                     </div>
                  </div>
                  
                  {executeResult ? (
                     <div className={`p-4 rounded border ${executeResult.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-prizm-danger/10 border-prizm-danger/30 text-prizm-danger'} mb-6`}>
                        <h4 className="font-bold mb-2 uppercase tracking-wide">Command Results</h4>
                        {executeResult.error ? (
                           <p>{executeResult.error}</p>
                        ) : (
                           <div className="space-y-2">
                              <p>Command ID: {executeResult.commandId}</p>
                              <p>Status: {executeResult.queued ? 'HTTP 200 (QUEUED)' : 'FAILED'}</p>
                              <div className="mt-4 pt-4 border-t border-current/30 text-[10px]">
                                <p className="font-bold uppercase opacity-80 mb-1">Post-Command Verification Scan:</p>
                                <p>Still Present: {executeResult.verification.stillPresent ? 'Yes' : 'No'}</p>
                                <p>Message: {executeResult.verification.statusMessageAfter || 'None'}</p>
                                <p>allowFaultReset: {executeResult.verification.allowFaultResetAfter !== null ? String(executeResult.verification.allowFaultResetAfter) : 'Unknown'}</p>
                                
                                {executeResult.warnings && executeResult.warnings.length > 0 && (
                                   <div className="mt-2 text-prizm-warning">
                                      {executeResult.warnings.map((w: string, i: number) => <div key={i}>⚠️ {w}</div>)}
                                   </div>
                                )}
                              </div>
                           </div>
                        )}
                     </div>
                  ) : (
                     <div className="space-y-2">
                        <label className="block text-prizm-text font-bold uppercase tracking-widest text-[10px]">Confirmation String</label>
                        <p className="text-[10px] text-prizm-text-muted mb-2">To proceed, please type the exact Entity Token above or <span className="text-prizm-text font-bold uppercase bg-white/5 px-1 rounded">CLEAR FAULT</span></p>
                        <input 
                           type="text" 
                           value={confirmationInput}
                           onChange={e => setConfirmationInput(e.target.value)}
                           className="w-full bg-black/50 border border-prizm-border rounded px-4 py-3 text-prizm-text focus:outline-none focus:border-prizm-primary font-mono text-sm uppercase tracking-wider"
                           placeholder="Enter confirmation..."
                           autoComplete="off"
                           disabled={processing}
                        />
                        {(confirmationInput.length > 0 && confirmationInput !== selectedCandidate.entityKeyToken && confirmationInput !== "CLEAR FAULT") && (
                           <p className="text-prizm-danger text-[10px] mt-1 uppercase">Does not match required confirmation string</p>
                        )}
                     </div>
                  )}

               </div>
               
               <div className="p-4 border-t border-prizm-border bg-prizm-surface-strong flex justify-end gap-3 shrink-0 font-mono text-xs uppercase tracking-widest">
                  <button 
                     onClick={() => {
                        setSelectedCandidate(null);
                        setConfirmationInput("");
                        setExecuteResult(null);
                        if (executeResult?.ok) fetchCandidates();
                     }}
                     disabled={processing}
                     className="px-4 py-2 text-prizm-text-muted hover:text-prizm-text transition"
                  >
                     {executeResult ? "Close" : "Cancel"}
                  </button>
                  {!executeResult && (
                     <button
                        onClick={handleExecute}
                        disabled={processing || (confirmationInput !== selectedCandidate.entityKeyToken && confirmationInput !== "CLEAR FAULT")}
                        className="bg-prizm-danger hover:bg-red-500 text-white px-6 py-2 rounded font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                     >
                        {processing ? <RefreshCw size={14} className="animate-spin" /> : null}
                        {processing ? "Executing..." : "Execute Command"}
                     </button>
                  )}
               </div>
            </div>
         </div>
      )}

      {/* Raw Details Drawer */}
      {drawerOpen && rawEntityDetails && (
        <div className="absolute inset-y-0 right-0 w-full sm:w-[480px] bg-[#0E1015] border-l border-prizm-border shadow-2xl flex flex-col font-mono z-40 animate-fade-in">
           <div className="flex justify-between items-center p-4 border-b border-prizm-border bg-prizm-surface shrink-0">
             <div>
                <span className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-widest block">Topology Raw Detail</span>
                <h2 className="text-lg font-bold text-prizm-text">{rawEntityDetails.displayKey}</h2>
             </div>
             <button onClick={() => setDrawerOpen(false)} className="p-2 bg-black/20 hover:bg-black/40 text-prizm-text-muted hover:text-prizm-text rounded transition cursor-pointer">
                <XCircle size={16} />
             </button>
           </div>
           <div className="flex-1 overflow-y-auto p-4 bg-black/50">
              <pre className="text-[10px] text-prizm-info break-words whitespace-pre-wrap">
                 {JSON.stringify(rawEntityDetails, null, 2)}
              </pre>
           </div>
        </div>
      )}
      
    </div>
  );
}
