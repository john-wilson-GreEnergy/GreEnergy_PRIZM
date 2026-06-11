const fs = require('fs');
let code = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

const newFetch = `
        const fetchData = async () => {
            try {
                fetch("/api/local/site-operations/summary")
                    .then(r => r.json())
                    .then(summaryRes => {
                         if (!unmounted) setState(prev => ({ ...prev, siteSummary: summaryRes, loading: false }));
                    })
                    .catch(err => {
                         if (!unmounted) setState(prev => ({ ...prev, loading: false }));
                    });

                // Side fetches
                if (!unmounted) {
                    fetch("/api/local/cache/status").then(r => r.json()).then(v => { if(!unmounted) setState(p => ({...p, cacheStatus: v}))}).catch(()=>{});
                    fetch("/api/local/strings/dashboard?array=ALL&enrich=none&maxAgeMs=15000").then(r => r.json()).then(v => { if(!unmounted) setState(p => ({...p, stringsDashboard: v}))}).catch(()=>{});
                    fetch("/api/feather/devices").then(r => r.json()).then(v => { if(!unmounted) setState(p => ({...p, featherDevices: v}))}).catch(()=>{});
                    fetch("/api/local/safety-fault-clear/candidates").then(r => r.json()).then(v => { if(!unmounted) setState(p => ({...p, safetyFaults: v}))}).catch(()=>{});
                    fetch("/api/local/overview/discovery?fullTables=true").then(r => r.json()).then(v => { if(!unmounted) setState(p => ({...p, overviewDiscovery: v}))}).catch(()=>{});
                    fetch("/api/local/history/events?range=24h").then(r => r.json()).then(v => { if(!unmounted) setState(p => ({...p, historyEvents: v}))}).catch(()=>{});
                }
            } catch (err) {
                if (!unmounted) setState(prev => ({ ...prev, loading: false }));
            }
        };
`;

code = code.replace(/        const fetchData = async \(\) => \{[\s\S]*?        \/\/ Setup auto-refresh/, newFetch + '\n\n        // Setup auto-refresh');


// Now Part H: BESS Fleet Summary

const topCardsRepl = `
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
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

code = code.replace(/                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">[\s\S]*?<\/div>\r?\n                    <\/div>/, topCardsRepl);

fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', code);
console.log('Fixed dashboard');
