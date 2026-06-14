import fs from 'fs';

let file = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

// The replacement was messed up for Cell Metrics Average. Let's fix line 416-455
// Find the exact block.
const blockToReplace = /<div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">\s*<h3 className="text-prizm-text-muted text-\[10px\] font-bold uppercase tracking-wider mb-3 flex items-center gap-2">\s*<Activity size=\{14\} className="text-prizm-primary"\/> Cell Metrics Average[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">/;

const newBlock = `<div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">
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

                <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">`;

file = file.replace(blockToReplace, newBlock);
fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', file);
console.log('Fixed block summary metric cards part 2');
