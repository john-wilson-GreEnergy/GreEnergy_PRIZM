const fs = require('fs');

let code = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

const targetOld = `                    <div className="bg-prizm-surface p-4 border-t border-prizm-border sm:border-x sm:border-y-0">
                        <div className="text-[10px] text-prizm-danger uppercase font-bold tracking-wider mb-1">Offline Strings</div>
                        <div className="text-xl font-bold text-prizm-danger font-mono">{rollups.offlineStrings !== undefined ? rollups.offlineStrings : "--"}</div>
                    </div>
                    <div className="bg-prizm-surface p-4 border-t border-prizm-border sm:border-t-0 sm:border-r">
                        <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Not Comm Strings</div>
                        <div className="text-xl font-bold text-prizm-text-muted font-mono">{rollups.notCommStrings !== undefined ? rollups.notCommStrings : "--"}</div>
                    </div>
                    <div className="bg-prizm-surface p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-prizm-warning uppercase font-bold tracking-wider mb-1">Warn / Alm Strings</div>
                        <div className="text-xl font-bold text-prizm-warning font-mono">
                            {rollups.warnings !== undefined ? rollups.warnings : "--"} <span className="text-prizm-text-muted">/</span> <span className="text-prizm-danger">{rollups.alarms !== undefined ? rollups.alarms : "--"}</span>
                        </div>
                    </div>
                    <div className="bg-prizm-surface-strong p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Avg Cell V</div>
                        <div className="text-xl font-bold text-prizm-text font-mono">{rollups.fleetAvgCellVoltage !== undefined && rollups.fleetAvgCellVoltage !== null ? \`\${rollups.fleetAvgCellVoltage.toFixed(1)} mV\` : "--"}</div>
                    </div>
                    <div className="bg-prizm-surface-strong p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Max Cell Δ</div>
                        <div className="text-xl font-bold text-prizm-text font-mono">{rollups.fleetMaxCellVoltageDelta !== undefined && rollups.fleetMaxCellVoltageDelta !== null ? \`Δ \${rollups.fleetMaxCellVoltageDelta.toFixed(0)} mV\` : "--"}</div>
                    </div>
                    <div className="bg-prizm-surface-strong p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Avg Cell Temp</div>
                        <div className="text-xl font-bold text-prizm-text font-mono">{rollups.fleetAvgCellTemp !== undefined && rollups.fleetAvgCellTemp !== null ? \`\${rollups.fleetAvgCellTemp.toFixed(1)} °C\` : "--"}</div>
                    </div>
                    <div className="bg-prizm-surface-strong p-4 border-t border-prizm-border sm:border-t-0">
                        <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">Expected BPCs</div>
                        <div className="text-xl font-bold text-prizm-text font-mono">{rollups.expectedBpcCount !== undefined ? rollups.expectedBpcCount : "--"}</div>
                    </div>
                 </div>`;


const targetStart = `                 <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 lg:divide-x divide-prizm-border rounded-lg overflow-hidden border border-prizm-border shadow-sm">
                    <div className="bg-prizm-surface p-4">
                        <div className="text-[10px] text-prizm-text uppercase font-bold tracking-wider mb-1">Total Strings</div>
                        <div className="text-xl font-bold text-prizm-text font-mono">{rollups.totalStrings !== undefined ? rollups.totalStrings : "--"}</div>
                    </div>
                    <div className="bg-prizm-surface p-4 border-l border-prizm-border sm:border-l-0">
                        <div className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider mb-1">Online Strings</div>
                        <div className="text-xl font-bold text-emerald-400 font-mono">{rollups.onlineStrings !== undefined ? rollups.onlineStrings : "--"}</div>
                    </div>`;

const newCode = `                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                        <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">
                            <h3 className="text-prizm-text-muted text-sm font-bold uppercase tracking-wider mb-2">Fleet Total Strings</h3>
                            <div className="flex items-baseline gap-2">
                                <div className="text-3xl font-bold text-prizm-text font-mono">{sum?.bessFleetSummary?.totalStrings ?? rollups.totalStrings ?? "--"}</div>
                                <div className="text-sm text-prizm-text-muted">expected {sum?.bessFleetSummary?.expectedBpcs ?? rollups.expectedBpcs ?? "--"}</div>
                            </div>
                        </div>

                        <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">
                            <h3 className="text-prizm-text-muted text-sm font-bold uppercase tracking-wider mb-2">Warnings & Alarms</h3>
                            <div className="grid grid-cols-2 gap-2 mt-4">
                                <div>
                                     <div className="text-xl font-bold text-prizm-warning font-mono">{sum?.bessFleetSummary?.warningStrings ?? rollups.warningStrings ?? "--"}</div>
                                     <div className="text-xs text-prizm-text-muted uppercase">Strings Warn</div>
                                </div>
                                <div>
                                     <div className="text-xl font-bold text-red-400 font-mono">{sum?.bessFleetSummary?.alarmStrings ?? rollups.alarmingStrings ?? "--"}</div>
                                     <div className="text-xs text-prizm-text-muted uppercase">Strings Alarm</div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">
                            <h3 className="text-prizm-text-muted text-sm font-bold uppercase tracking-wider mb-2">Cell Metrics avg</h3>
                            <div className="space-y-2 max-w-[200px] mt-4">
                                <div className="flex justify-between items-center bg-prizm-background/50 px-2 py-1 rounded">
                                    <span className="text-xs text-prizm-text-muted">Voltage</span>
                                    <div className="text-xl font-bold text-prizm-text font-mono">{sum?.bessFleetSummary?.avgCellVoltageMv != null ? \`\${sum.bessFleetSummary.avgCellVoltageMv.toFixed(1)} mV\` : (rollups.fleetAvgCellVoltage != null ? \`\${rollups.fleetAvgCellVoltage.toFixed(1)} mV\` : "--")}</div>
                                </div>
                                <div className="flex justify-between items-center bg-prizm-background/50 px-2 py-1 rounded">
                                    <span className="text-xs text-prizm-text-muted">Max Δ</span>
                                    <div className="text-xl font-bold text-prizm-text font-mono">{sum?.bessFleetSummary?.maxCellVoltageDeltaMv != null ? \`Δ \${sum.bessFleetSummary.maxCellVoltageDeltaMv.toFixed(0)} mV\` : (rollups.fleetMaxCellVoltageDelta != null ? \`Δ \${rollups.fleetMaxCellVoltageDelta.toFixed(0)} mV\` : "--")}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">
                            <h3 className="text-prizm-text-muted text-sm font-bold uppercase tracking-wider mb-2">Thermal avg</h3>
                            <div className="mt-4 flex flex-col gap-2">
                                <div className="flex justify-between items-center bg-prizm-background/50 px-2 py-1 rounded">
                                   <span className="text-xs text-prizm-text-muted">Cells</span>
                                   <div className="text-xl font-bold text-prizm-text font-mono">{sum?.bessFleetSummary?.avgCellTempC != null ? \`\${sum.bessFleetSummary.avgCellTempC.toFixed(1)} °C\` : (rollups.fleetAvgCellTemp != null ? \`\${rollups.fleetAvgCellTemp.toFixed(1)} °C\` : "--")}</div>
                                </div>
                                <div className="flex justify-between items-center bg-prizm-background/50 px-2 py-1 rounded">
                                   <span className="text-xs text-prizm-text-muted">HVAC Max</span>
                                   <div className="text-xl font-bold text-prizm-text font-mono">{sum?.featherSummary?.maxSpaceTempC != null ? \`\${sum.featherSummary.maxSpaceTempC.toFixed(1)} °C\` : "--"}</div>
                                </div>
                            </div>
                        </div>
                    </div>`;


const sIDX = code.indexOf(targetStart);
if (sIDX >= 0) {
    const eIDX = code.indexOf(targetOld) + targetOld.length;
    code = code.substring(0, sIDX) + newCode + code.substring(eIDX);
} else {
    // maybe it was replaced partially?
    console.log("NOT FOUND!");
}

fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', code);
console.log('Fixed 2');
