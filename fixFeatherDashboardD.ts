import fs from 'fs';

let content = fs.readFileSync('src/components/FeatherDashboard.tsx', 'utf8');

const drawerTargetRegex = /\{\/\* 4\. DETAIL DRAWER SIDE VIEW DIALOG \*\/\}(.|\n)*$/m;

const newDrawer = `{/* 4. DETAIL DRAWER SIDE VIEW DIALOG */}
      {selectedDevice && (
        <div className="fixed inset-0 bg-prizm-surface-strong backdrop-blur-xs z-50 flex justify-end animate-fade-in font-mono">
          <div className="w-full max-w-lg bg-prizm-surface border-l border-prizm-border h-full p-6 flex flex-col justify-between overflow-y-auto shadow-2xl relative">
            
            <div className="space-y-6">
              {/* Drawer header */}
              <div className="flex justify-between items-start border-b border-prizm-border pb-4">
                <div>
                  <span className="text-prizm-text-muted uppercase text-[9px] tracking-widest block mb-1">
                    Enriched Device Diagnostic Profile
                  </span>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-prizm-text tracking-tighter">
                      {selectedDevice.ip}
                    </h2>
                    <span className={\`px-2 py-0.5 rounded text-[10px] font-bold \${
                      selectedDevice.reachable ? "bg-emerald-400/10 text-emerald-400" : "bg-rose-500/10 text-rose-500"
                    }\`}>
                      {selectedDevice.reachable ? "ONLINE" : "OFFLINE"}
                    </span>
                  </div>
                  <span className="text-prizm-primary font-bold text-[10px] block mt-1">
                    {selectedDevice.entityDescription}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedDevice(null)}
                  className="p-1 rounded hover:bg-prizm-surface-strong text-prizm-text-muted hover:text-prizm-text cursor-pointer transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Status and Merged Identifiers */}
              <div className="space-y-3">
                <div className="bg-prizm-surface-strong border border-prizm-border p-3 rounded space-y-1.5 text-[10px]">
                  <span className="text-prizm-text-muted uppercase text-[8px] block mb-1">Merged Source Identity Data</span>
                  <div className="flex justify-between">
                    <span className="text-prizm-text-muted">Entity Description:</span>
                    <span className="text-prizm-text font-semibold">{selectedDevice.entityDescription || "Unmapped"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-prizm-text-muted">Array Index:</span>
                    <span className="text-prizm-text font-bold">{selectedDevice.arrayIndex !== undefined ? selectedDevice.arrayIndex : "Unmapped"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-prizm-text-muted">String Index:</span>
                    <span className="text-prizm-text font-bold">{selectedDevice.stringIndex !== undefined ? selectedDevice.stringIndex : "Unmapped"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-prizm-text-muted">Device Status / Firmware:</span>
                    <span className="text-prizm-text font-bold">{selectedDevice.firmwareVersion || selectedDevice.softwareVersion || "Not reported"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-prizm-text-muted">Operational State:</span>
                    <span className="text-prizm-primary font-black uppercase">{selectedDevice.deviceState || "Normal"}</span>
                  </div>
                </div>

                {/* Source contributions */}
                <div className="bg-prizm-surface-strong border border-prizm-border p-3 rounded col-span-2 space-y-2">
                  <span className="text-prizm-text-muted uppercase text-[8px] block w-full border-b border-prizm-border pb-1 mb-1">Source Coverage / Pipeline Diagnostics</span>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-prizm-text-muted">Direct Feather:</span>
                      <span className={\`font-bold \${selectedDevice.sourceCoverage?.directFeather ? "text-emerald-400" : "text-prizm-text-muted"}\`}>
                        {selectedDevice.sourceCoverage?.directFeather ? "Sourced" : "Failed/Unreachable"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-prizm-text-muted">BlockViewer Topology:</span>
                      <span className={\`font-bold \${selectedDevice.sourceCoverage?.blockviewer ? "text-emerald-400" : "text-prizm-text-muted"}\`}>
                        {selectedDevice.sourceCoverage?.blockviewer ? "Sourced" : "Missing"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-prizm-text-muted">String IP Map:</span>
                      <span className={\`font-bold \${selectedDevice.sourceCoverage?.stringIpMap ? "text-emerald-400" : "text-prizm-text-muted"}\`}>
                        {selectedDevice.sourceCoverage?.stringIpMap ? "Sourced" : "Missing"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-prizm-text-muted">IP Map:</span>
                      <span className={\`font-bold \${selectedDevice.sourceCoverage?.ipMap ? "text-emerald-400" : "text-prizm-text-muted"}\`}>
                        {selectedDevice.sourceCoverage?.ipMap ? "Sourced" : "Missing"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-prizm-text-muted">Last Call (BMS):</span>
                      <span className={\`font-bold \${selectedDevice.sourceCoverage?.lastCall ? "text-emerald-400" : "text-prizm-text-muted"}\`}>
                        {selectedDevice.sourceCoverage?.lastCall ? "Sourced" : "Missing"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-prizm-text-muted">1st Responder / HVAC:</span>
                      <span className={\`font-bold \${selectedDevice.sourceCoverage?.firstResponder ? "text-emerald-400" : "text-prizm-text-muted"}\`}>
                        {selectedDevice.sourceCoverage?.firstResponder ? "Sourced" : "Missing"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Warnings / Alarms log */}
                {selectedDevice.warningCount !== undefined && selectedDevice.warningCount > 0 && (
                  <div className="bg-prizm-warning/10 border border-prizm-warning/20 p-3 rounded">
                    <span className="text-prizm-warning uppercase text-[10px] font-black tracking-widest block mb-2">
                       Active Warning Interlocks ({selectedDevice.warningCount})
                    </span>
                    <ul className="list-disc pl-4 space-y-1 text-prizm-text text-[10px]">
                      {(selectedDevice.warnInfo || []).map((w, idx) => (
                         <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedDevice.alarmCount !== undefined && selectedDevice.alarmCount > 0 && (
                  <div className="bg-prizm-danger/10 border border-prizm-danger/20 p-3 rounded">
                    <span className="text-prizm-danger uppercase text-[10px] font-black tracking-widest block mb-2">
                       Active TRIP / Fault Log ({selectedDevice.alarmCount})
                    </span>
                    <ul className="list-disc pl-4 space-y-1 text-prizm-text text-[10px]">
                      {(selectedDevice.alarmFaults || []).map((a, idx) => (
                         <li key={idx}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {selectedDevice.hvacSummary || selectedDevice.temperatureCellC !== undefined || selectedDevice.temperatureSupplyC !== undefined ? (
                    <div className="bg-prizm-surface-strong border border-prizm-border p-3 rounded space-y-1 text-[10px]">
                        <span className="text-prizm-text-muted uppercase text-[8px] block mb-1">MIO / HVAC Details</span>
                        {selectedDevice.hvacSummary && <div className="text-prizm-primary font-bold mb-1">{selectedDevice.hvacSummary}</div>}
                        <div className="flex justify-between">
                            <span className="text-prizm-text-muted">Space Temp (Supply):</span>
                            <span className="text-prizm-text font-bold">{selectedDevice.temperatureSupplyC !== undefined ? \`\${selectedDevice.temperatureSupplyC}°C\` : "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-prizm-text-muted">Cell Temp:</span>
                            <span className="text-prizm-text font-bold">{selectedDevice.temperatureCellC !== undefined ? \`\${selectedDevice.temperatureCellC}°C\` : "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-prizm-text-muted">HVAC Mode/Stage:</span>
                            <span className="text-prizm-text font-bold">{selectedDevice.hvacMode || "N/A"}</span>
                        </div>
                    </div>
                ): null}

              </div>

              {/* Advanced toggle for raw json */}
              <div className="space-y-2 border-t border-prizm-border pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-prizm-text-muted text-[10px] uppercase">Advanced direct output debug</span>
                  <button
                    onClick={() => setAdvancedDrawerShowJson(!advancedDrawerShowJson)}
                    className="px-2 py-1 bg-black/5 hover:bg-black/10 rounded font-bold text-[9px] text-prizm-text cursor-pointer"
                  >
                    {advancedDrawerShowJson ? "Hide Raw report JSON" : "Show Raw report JSON"}
                  </button>
                </div>

                {advancedDrawerShowJson && (
                   <div className="bg-black border border-prizm-border p-3 rounded font-mono text-[9px] text-prizm-text-muted select-text break-all overflow-y-auto max-h-[300px]">
                     <pre className="whitespace-pre-wrap">{JSON.stringify(selectedDevice.raw || {}, null, 2)}</pre>
                   </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}`;

content = content.replace(drawerTargetRegex, newDrawer);

fs.writeFileSync('src/components/FeatherDashboard.tsx', content);

console.log('Drawer Replacement done');
