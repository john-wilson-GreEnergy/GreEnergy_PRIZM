import fs from 'fs';

let file = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

file = file.replace(
/(\{\/\* KPI CARD GRID \*\/\}\s*)<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">/s,
`$1<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">`
);

let thermalAvgStr = `<h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
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
                    </div>`;

file = file.replace(/<Thermometer size=\{14\} className="text-prizm-danger"\/.*?(?=<\/div>\s*<\/div>\s*<div className="bg-prizm-surface)/s, thermalAvgStr + '\n                ');

let voltageMetricsStr = `<Activity size={14} className="text-prizm-primary"/> Cell Metrics Average
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
                    </div>`;

file = file.replace(/<Activity size=\{14\} className="text-prizm-primary"\/> Cell Metrics Average.*?(?=<\/div>\s*<\/div>\s*<div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border">\s*<h3 className="text-prizm-text-muted text-\[10px\] font-bold uppercase tracking-wider mb-3 flex items-center gap-2">\s*<Thermometer)/s, voltageMetricsStr + '\n                ');


fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', file);
console.log('Fixed block summary metric cards');
