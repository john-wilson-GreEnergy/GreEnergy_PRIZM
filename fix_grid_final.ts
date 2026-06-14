import fs from 'fs';

let file = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

// I will just replace the whole KPI CARD GRID block because it's messy now.
const kpiGridRegex = /\{\/\* KPI CARD GRID \*\/\}\s*<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">[\s\S]*?(?=\{\/\* EMS Apps \*\/\})/s;

const newKpiGrid = `{/* KPI CARD GRID */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">
                    <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Battery size={14} className="text-prizm-primary"/> System State of Charge
                    </h3>
                    <div className="flex items-end gap-2 mt-4">
                        <div className="text-3xl font-bold text-prizm-text font-mono">{rollups?.averageSoc?.toFixed(1) || "--"}<span className="text-lg text-prizm-text-muted">%</span></div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-prizm-border text-[11px] font-mono text-prizm-text-muted flex justify-between">
                        <span>Target:</span> <span className="text-prizm-text font-bold">{(rollups?.onlineAvailableKWh || 0).toLocaleString()} <span className="text-[9px]">kWh</span></span>
                    </div>
                </div>

                <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">
                    <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Zap size={14} className="text-prizm-primary"/> Fleet Capacity
                    </h3>
                    <div className="flex items-end gap-2 mt-4">
                        <div className="text-2xl font-bold text-prizm-text font-mono">{((rollups?.onlineAvailableKWh || 0) / 1000).toFixed(2)}<span className="text-sm text-prizm-text-muted ml-1">MWh</span></div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-prizm-border text-[11px] font-mono flex justify-between">
                        <span className="text-prizm-text-muted">Charge Lim:</span> <span className="text-emerald-400 font-bold">{((rollups.availableChargeKW || 0)/1000).toFixed(2)} <span className="text-[9px]">MW</span></span>
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] font-mono">
                        <span className="text-prizm-text-muted">Discharge Lim:</span> <span className="text-emerald-400 font-bold">{((rollups.availableDischargeKW || 0)/1000).toFixed(2)} <span className="text-[9px]">MW</span></span>
                    </div>
                </div>

                <div className="col-span-2 md:col-span-1 lg:col-span-2 bg-prizm-surface p-4 rounded-lg border border-prizm-border">
                    <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Cpu size={14} className={activeIssueGroups.length > 0 ? "text-prizm-warning" : "text-prizm-primary"}/> String Fleet Status
                    </h3>
                    <div className="grid grid-cols-2 gap-2 mt-4">
                        <div>
                             <div className="text-2xl font-bold text-prizm-warning font-mono">{sum?.bessFleetSummary?.warningStrings ?? rollups.warnings ?? "--"}</div>
                             <div className="text-[10px] text-prizm-text-muted uppercase">Strings Warn</div>
                        </div>
                        <div>
                             <div className="text-2xl font-bold text-red-500 font-mono">{sum?.bessFleetSummary?.alarmStrings ?? rollups.alarms ?? "--"}</div>
                             <div className="text-[10px] text-prizm-text-muted uppercase">Strings Alarm</div>
                        </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-prizm-border">
                        <div className="text-lg font-bold text-prizm-text font-mono">{(sum?.bessFleetSummary?.warningStrings || 0) + (sum?.bessFleetSummary?.alarmStrings || 0) || "--"}</div>
                        <div className="text-[10px] text-prizm-text-muted uppercase">Total Active</div>
                    </div>
                </div>

                <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">
                    <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Activity size={14} className="text-prizm-primary"/> Cell Metrics Average
                    </h3>
                    <div className="space-y-2 mt-4">
                        <div className="flex justify-between items-center bg-prizm-background/50 px-3 py-2 rounded">
                            <span className="text-[11px] text-prizm-text-muted uppercase font-bold tracking-wider">Voltage</span>
                            <div className="text-lg font-bold text-prizm-text font-mono">{sum?.bessFleetSummary?.avgCellVoltageMv != null ? \`\${sum.bessFleetSummary.avgCellVoltageMv.toFixed(1)} mV\` : "--"}</div>
                        </div>
                        <div className="flex justify-between items-center bg-prizm-background/50 px-3 py-2 rounded">
                            <span className="text-[11px] text-prizm-text-muted uppercase font-bold tracking-wider">Max Δ</span>
                            <div className="text-lg font-bold text-prizm-text font-mono">{sum?.bessFleetSummary?.maxCellVoltageDeltaMv != null ? \`Δ \${sum.bessFleetSummary.maxCellVoltageDeltaMv.toFixed(0)} mV\` : "--"}</div>
                        </div>
                    </div>
                </div>
                
                <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">
                    <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Thermometer size={14} className="text-prizm-danger"/> Thermal Average
                    </h3>
                    <div className="space-y-2 mt-4">
                        <div className="flex justify-between items-center bg-prizm-background/50 px-3 py-2 rounded">
                           <span className="text-[11px] text-prizm-text-muted uppercase font-bold tracking-wider">Cells</span>
                           <div className="text-lg font-bold text-prizm-text font-mono">{sum?.bessFleetSummary?.avgCellTempC != null ? \`\${sum.bessFleetSummary.avgCellTempC.toFixed(1)} °C\` : "--"}</div>
                        </div>
                        <div className="flex justify-between items-center bg-prizm-background/50 px-3 py-2 rounded">
                           <span className="text-[11px] text-prizm-text-muted uppercase font-bold tracking-wider">Max Δ</span>
                           <div className="text-lg font-bold text-prizm-text font-mono">{sum?.bessFleetSummary?.maxCellTempDeltaC != null ? \`Δ \${sum.bessFleetSummary.maxCellTempDeltaC.toFixed(1)} °C\` : "--"}</div>
                        </div>
                        <div className="flex justify-between items-center bg-prizm-background/50 px-3 py-2 rounded">
                           <span className="text-[11px] text-prizm-text-muted uppercase font-bold tracking-wider">HVAC Max</span>
                           <div className="text-lg font-bold text-prizm-text font-mono">{sum?.featherSummary?.maxSpaceTempC != null ? \`\${sum.featherSummary.maxSpaceTempC.toFixed(1)} °C\` : "--"}</div>
                        </div>
                    </div>
                </div>
                
                <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">
                    <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                        <BoxSelect size={14} className="text-prizm-primary"/> Topology Overview
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-mono">
                        <div className="text-prizm-text-muted uppercase pb-1 border-b border-prizm-border/50">Arrays</div>
                        <div className="text-right pb-1 border-b border-prizm-border/50 font-bold text-prizm-text">{sum?.topologyCounts?.arrayCount ?? "--"}</div>
                        
                        <div className="text-prizm-text-muted uppercase pb-1 border-b border-prizm-border/50">Strings</div>
                        <div className="text-right pb-1 border-b border-prizm-border/50 font-bold text-prizm-text">{sum?.topologyCounts?.stringCount ?? sum?.bessFleetSummary?.totalStrings ?? "--"}</div>
                        
                        <div className="text-prizm-text-muted uppercase pb-1 border-b border-prizm-border/50">PCS Units</div>
                        <div className="text-right pb-1 border-b border-prizm-border/50 font-bold text-prizm-text">{sum?.topologyCounts?.pcsCount ?? "--"}</div>
                        
                        <div className="text-prizm-text-muted uppercase pb-1 border-b border-prizm-border/50">Feather</div>
                        <div className="text-right pb-1 border-b border-prizm-border/50 font-bold text-prizm-text">{sum?.topologyCounts?.featherDeviceCount ?? "--"}</div>
                        
                        <div className="text-prizm-text-muted uppercase">AC Batts</div>
                        <div className="text-right font-bold text-prizm-text">{sum?.topologyCounts?.acBatteryCount ?? "--"}</div>
                    </div>
                </div>
            </div>

            `;

file = file.replace(kpiGridRegex, newKpiGrid);
fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', file);
console.log('Fixed syntax and restored KPI grid');
