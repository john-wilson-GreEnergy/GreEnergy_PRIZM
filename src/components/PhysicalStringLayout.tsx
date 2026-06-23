import React, { useMemo } from "react";
import { PhysicalCellSlot } from "../lib/physicalEnergySegmentLayout";
import {
  formatTemperatureF,
  getTemperatureColorStyle,
  normalizeTemperatureToFahrenheit
} from "../utils/temperatureScale";
import { resolvePhysicalCellMetricValue } from "../utils/cellValueResolver";

type PhysicalStringLayoutProps = {
  slots: PhysicalCellSlot[];
  arrayNumber: number | string;
  stringNumber: number | string;
  metric?: "temperature" | "voltage";
  mode?: "detail" | "tile";
  showValues?: boolean;
  compactLabels?: boolean;
  tempUnit?: "C" | "F";
  title?: string;
  showMinMaxHeader?: boolean;
  stringData?: any;
};

export default function PhysicalStringLayout({
  slots = [],
  arrayNumber,
  stringNumber,
  metric = "temperature",
  mode = "detail",
  showValues = true,
  compactLabels = false,
  tempUnit = "F",
  title,
  showMinMaxHeader = true,
  stringData,
}: PhysicalStringLayoutProps) {

  const { minTemp, maxTemp, avgTemp, deltaTemp, minVolt, maxVolt, avgVolt, deltaVolt } = useMemo(() => {
    const validTemps: number[] = [];
    const validVolts: number[] = [];

    slots.forEach(s => {
      const bpcIndex = s.bpcNumber;
      const cellIndex = s.cellNumber;
      const physicalIndex = (bpcIndex - 1) * 30 + (cellIndex - 1);

      // If stringData is provided, resolve using our custom robust resolver. Otherwise, fallback to the slot values.
      let tempC = s.tempC;
      let voltageMv = s.voltageMv;

      if (stringData) {
        tempC = resolvePhysicalCellMetricValue({
          stringData,
          metric: "temperature",
          bpcIndex,
          cellIndex,
          physicalIndex,
          sourceUnit: "C"
        });
        voltageMv = resolvePhysicalCellMetricValue({
          stringData,
          metric: "voltage",
          bpcIndex,
          cellIndex,
          physicalIndex,
          sourceUnit: "C"
        });
      }

      if (tempC !== null && typeof tempC === "number" && Number.isFinite(tempC)) {
        validTemps.push(tempC);
      }
      if (voltageMv !== null && typeof voltageMv === "number" && Number.isFinite(voltageMv)) {
        validVolts.push(voltageMv);
      }
    });

    // Default values if empty
    const minC = validTemps.length > 0 ? Math.min(...validTemps) : 25;
    const maxC = validTemps.length > 0 ? Math.max(...validTemps) : 25;
    const avgC = validTemps.length > 0 ? validTemps.reduce((a, b) => a + b, 0) / validTemps.length : 25;

    const minF = normalizeTemperatureToFahrenheit(minC, "C") ?? 77;
    const maxF = normalizeTemperatureToFahrenheit(maxC, "C") ?? 77;
    const avgF = normalizeTemperatureToFahrenheit(avgC, "C") ?? 77;
    
    const minVolt = validVolts.length > 0 ? Math.min(...validVolts) : 0;
    const maxVolt = validVolts.length > 0 ? Math.max(...validVolts) : 0;
    const avgVolt = validVolts.length > 0 ? validVolts.reduce((a, b) => a + b, 0) / validVolts.length : 0;
    
    return {
      minTemp: minF,
      maxTemp: maxF,
      avgTemp: avgF,
      deltaTemp: maxF - minF,
      minVolt,
      maxVolt,
      avgVolt,
      deltaVolt: maxVolt - minVolt,
    };
  }, [slots, stringData]);

  const normalizeValue = (value: number, min: number, max: number): number => {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 0.5;
    if (max === min) return 0.5;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  };

  const getVoltGradientClass = (t: number): string => {
    if (t < 0.2) return "bg-purple-200 text-slate-900 border-purple-300";
    if (t < 0.4) return "bg-blue-200 text-slate-900 border-blue-300";
    if (t < 0.6) return "bg-emerald-200 text-slate-900 border-emerald-300";
    if (t < 0.8) return "bg-amber-200 text-slate-900 border-amber-300";
    return "bg-red-300 text-slate-950 border-red-400";
  };

  const isTileMode = mode === "tile";

  const renderModule = (bpcNumber: number, label: string, moduleCells: PhysicalCellSlot[]) => {
    const isL = isTileMode;
    return (
      <div className={`flex flex-col bg-black/20 rounded border border-prizm-border/40 ${isL ? 'p-0.5' : 'p-1'}`}>
         <div className={`font-bold text-prizm-text-muted text-center whitespace-nowrap leading-none truncate ${
           isL ? 'text-[6px] mb-0.5' : 'text-[8px] mb-1'
         }`}>
            {compactLabels ? `B${bpcNumber}-${label.substring(0, 1)}` : `BPC ${bpcNumber} ${label}`}
         </div>
         <div className="grid grid-cols-5 gap-0.5">
           {moduleCells.map((cell, idx) => {
             const bpcIndex = cell.bpcNumber;
             const cellIndex = cell.cellNumber;
             const physicalIndex = (bpcIndex - 1) * 30 + (cellIndex - 1);

             let tempC = cell.tempC;
             let voltageMv = cell.voltageMv;

             if (stringData) {
               tempC = resolvePhysicalCellMetricValue({
                 stringData,
                 metric: "temperature",
                 bpcIndex,
                 cellIndex,
                 physicalIndex,
                 sourceUnit: "C"
               });
               voltageMv = resolvePhysicalCellMetricValue({
                 stringData,
                 metric: "voltage",
                 bpcIndex,
                 cellIndex,
                 physicalIndex,
                 sourceUnit: "C"
               });
             }

             const tempDisplay = tempC !== null && tempC !== undefined && Number.isFinite(tempC)
               ? formatTemperatureF(tempC, { decimals: 1, showUnit: true, sourceUnit: "C" })
               : "—";

             const tooltip = [
               `Array ${arrayNumber} / String ${stringNumber}`,
               `BPC ${cell.bpcNumber} / Cell Group ${cell.cellNumber}`,
               `Side: ${cell.side.charAt(0).toUpperCase() + cell.side.slice(1)}`,
               `Module: ${cell.moduleLabel}`,
               `HVAC: ${cell.hvacProximity.charAt(0).toUpperCase() + cell.hvacProximity.slice(1)}`,
               `Temperature: ${tempDisplay}`,
               `Voltage: ${voltageMv !== null && voltageMv !== undefined ? voltageMv : "--"} mV`,
               `Timestamp age: ${cell.timestampAge ?? "--"}`,
               `Balancing: ${cell.balancing ?? "--"}`,
               `Source: ${cell.source}`
             ].join("\n");

             let colorClass = "bg-white/5 border-white/10 text-white/40";
             let valueLabel = "—";
             let customStyle: React.CSSProperties | undefined = undefined;

             if (metric === "temperature" && tempC !== null && tempC !== undefined && Number.isFinite(tempC)) {
                valueLabel = formatTemperatureF(tempC, { decimals: 1, showUnit: false, sourceUnit: "C" });
                customStyle = getTemperatureColorStyle(tempC, "C");
                colorClass = "";
             } else if (metric === "voltage" && voltageMv !== null && voltageMv !== undefined && Number.isFinite(voltageMv)) {
                colorClass = getVoltGradientClass(normalizeValue(voltageMv, minVolt, maxVolt));
                valueLabel = Math.round(voltageMv).toString();
             }

             return (
               <div
                 key={idx}
                 title={tooltip}
                 className={`rounded-[2px] border leading-none flex items-center justify-center font-mono font-bold cursor-help transition-all hover:scale-110 ${
                   isL ? 'h-3.5 text-[6.5px]' : 'h-6 text-[9.5px]'
                 } ${colorClass}`}
                 style={customStyle}
               >
                 {showValues ? valueLabel : ""}
               </div>
             )
           })}
           {Array.from({ length: Math.max(0, 10 - moduleCells.length) }).map((_, i) => (
             <div 
               key={`empty-${i}`} 
               className={`rounded-[2px] border border-white/5 bg-white/5 ${isL ? 'h-3.5' : 'h-6'}`}
             />
           ))}
         </div>
      </div>
    );
  };

  const rows = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className={`bg-prizm-surface border border-prizm-border/40 rounded-lg space-y-3 font-mono text-xs w-full select-none overflow-x-auto ${
      isTileMode ? 'p-2.5' : 'p-4'
    }`}>
      {showMinMaxHeader && (
        <div className="flex justify-between items-start mb-1 gap-2">
           <div className="flex flex-col min-w-0">
              <span className={`font-bold text-prizm-text tracking-wider uppercase truncate ${
                isTileMode ? 'text-[8.5px]' : 'text-[10px]'
              }`}>
                {title || `A${arrayNumber}-S${stringNumber} PHYSICAL LAYOUT`}
              </span>
              <span className="text-prizm-text-muted text-[8.5px] uppercase mt-0.5 truncate font-bold">
                Mode: {metric === "temperature" ? `Temperature °F` : "Voltage mV"} &nbsp;|&nbsp; {slots.length} cells
              </span>
              {metric === "temperature" ? (
                  <span className="text-[#10b981] text-[8px] mt-0.5 truncate font-bold animate-fade-in">
                    Min {minTemp.toFixed(1)}°F &nbsp;|&nbsp; Avg {avgTemp.toFixed(1)}°F &nbsp;|&nbsp; Max {maxTemp.toFixed(1)}°F &nbsp;|&nbsp; Δ {deltaTemp.toFixed(1)}°F
                  </span>
              ) : (
                  <span className="text-[#a855f7] text-[8px] mt-0.5 truncate font-bold">
                    Min {Math.round(minVolt)} mV &nbsp;|&nbsp; Avg {Math.round(avgVolt)} mV &nbsp;|&nbsp; Max {Math.round(maxVolt)} mV &nbsp;|&nbsp; Δ {Math.round(deltaVolt)} mV
                  </span>
              )}
           </div>
           
           <div className="flex flex-col items-end gap-1 shrink-0 font-mono text-[7px]">
             {metric === "temperature" ? (
               <div className="flex flex-col items-end gap-0.5 text-prizm-text-muted">
                 <div className="flex items-center gap-1 sm:gap-1.5 font-bold">
                   <span className="text-sky-400 font-bold">COLD ≤77°F</span>
                   <span className="text-emerald-400 font-bold">NORM 77-86°F</span>
                   <span className="text-yellow-400 font-bold">ELEV 86-104°F</span>
                   <span className="text-orange-400 font-bold">HOT 104-122°F</span>
                   <span className="text-red-500 font-bold">CRIT 122-131°F+</span>
                 </div>
                 <div className="flex gap-[1px]">
                   <div className="w-4 h-1.5 rounded-[1px] border" style={getTemperatureColorStyle(5, "C")} title="5°C / 41°F"></div>
                   <div className="w-4 h-1.5 rounded-[1px] border" style={getTemperatureColorStyle(15, "C")} title="15°C / 59°F"></div>
                   <div className="w-4 h-1.5 rounded-[1px] border" style={getTemperatureColorStyle(24.9, "C")} title="24.9°C / 76.8°F"></div>
                   <div className="w-4 h-1.5 rounded-[1px] border" style={getTemperatureColorStyle(25, "C")} title="25°C / 77°F"></div>
                   <div className="w-4 h-1.5 rounded-[1px] border" style={getTemperatureColorStyle(30, "C")} title="30°C / 86°F"></div>
                   <div className="w-4 h-1.5 rounded-[1px] border" style={getTemperatureColorStyle(35, "C")} title="35°C / 95°F"></div>
                   <div className="w-4 h-1.5 rounded-[1px] border" style={getTemperatureColorStyle(40, "C")} title="40°C / 104°F"></div>
                   <div className="w-4 h-1.5 rounded-[1px] border" style={getTemperatureColorStyle(45, "C")} title="45°C / 113°F"></div>
                   <div className="w-4 h-1.5 rounded-[1px] border" style={getTemperatureColorStyle(50, "C")} title="50°C / 122°F"></div>
                   <div className="w-4 h-1.5 rounded-[1px] border" style={getTemperatureColorStyle(55, "C")} title="55°C / 131°F"></div>
                 </div>
               </div>
             ) : (
               <div className="flex items-center gap-1 text-[7.5px] text-prizm-text-muted uppercase font-bold">
                 <span>Low</span>
                 <div className="flex gap-[1px]">
                   <div className={`w-2.5 h-1.5 rounded-[1px] ${getVoltGradientClass(0)}`}></div>
                   <div className={`w-2.5 h-1.5 rounded-[1px] ${getVoltGradientClass(0.3)}`}></div>
                   <div className={`w-2.5 h-1.5 rounded-[1px] ${getVoltGradientClass(0.5)}`}></div>
                   <div className={`w-2.5 h-1.5 rounded-[1px] ${getVoltGradientClass(0.7)}`}></div>
                   <div className={`w-2.5 h-1.5 rounded-[1px] ${getVoltGradientClass(1)}`}></div>
                 </div>
                 <span>High</span>
               </div>
             )}
           </div>
        </div>
      )}

      <div className={`mt-2 ${isTileMode ? 'min-w-[400px]' : 'min-w-[700px]'}`}>
        {/* Visual Headers */}
        <div className={`grid grid-cols-[24px_1fr_1fr_1fr_24px_1fr_1fr_1fr_24px] ${isTileMode ? 'gap-1' : 'gap-2'} mb-1 text-center font-bold text-prizm-text-muted leading-tight`}>
           <div className={`flex flex-col justify-end text-prizm-text-muted font-extrabold ${isTileMode ? 'text-[6px]' : 'text-[8.5px]'}`}>
             BPC
           </div>
           <div className={isTileMode ? 'text-[6.5px]' : 'text-[9px]'}>
             {compactLabels ? 'L.OUT' : 'LEFT OUTER'}<br/><span className={isTileMode ? 'text-[5.5px]' : 'text-[7px]'}>Cells 1-10</span>
           </div>
           <div className={isTileMode ? 'text-[6.5px]' : 'text-[9px]'}>
             {compactLabels ? 'L.MID' : 'LEFT MIDDLE'}<br/><span className={isTileMode ? 'text-[5.5px]' : 'text-[7px]'}>Cells 11-20</span>
           </div>
           <div className={isTileMode ? 'text-[6.5px]' : 'text-[9px]'}>
             {compactLabels ? 'L.INR' : 'LEFT INNER'}<br/><span className={isTileMode ? 'text-[5.5px]' : 'text-[7px]'}>Cells 21-30</span>
           </div>
           <div className={`flex flex-col justify-end text-blue-400 font-extrabold ${isTileMode ? 'text-[6px]' : 'text-[8.5px]'}`}>
             HVAC
           </div>
           <div className={isTileMode ? 'text-[6.5px]' : 'text-[9px]'}>
             {compactLabels ? 'R.INR' : 'RIGHT INNER'}<br/><span className={isTileMode ? 'text-[5.5px]' : 'text-[7px]'}>Cells 1-10</span>
           </div>
           <div className={isTileMode ? 'text-[6.5px]' : 'text-[9px]'}>
             {compactLabels ? 'R.MID' : 'RIGHT MIDDLE'}<br/><span className={isTileMode ? 'text-[5.5px]' : 'text-[7px]'}>Cells 11-20</span>
           </div>
           <div className={isTileMode ? 'text-[6.5px]' : 'text-[9px]'}>
             {compactLabels ? 'R.OUT' : 'RIGHT OUTER'}<br/><span className={isTileMode ? 'text-[5.5px]' : 'text-[7px]'}>Cells 21-30</span>
           </div>
           <div className={`flex flex-col justify-end text-prizm-text-muted font-extrabold ${isTileMode ? 'text-[6px]' : 'text-[8.5px]'}`}>
             BPC
           </div>
        </div>

        {/* Rows */}
        <div className={isTileMode ? 'space-y-1' : 'space-y-1.5'}>
          {rows.map(row => {
            const leftBpc = row;
            const rightBpc = 15 - row;
            const leftOuter = slots.filter(s => s.bpcNumber === leftBpc && s.physicalColumnGroup === "leftOuter").sort((a,b) => a.cellNumber - b.cellNumber);
            const leftMid = slots.filter(s => s.bpcNumber === leftBpc && s.physicalColumnGroup === "leftMiddle").sort((a,b) => a.cellNumber - b.cellNumber);
            const leftInner = slots.filter(s => s.bpcNumber === leftBpc && s.physicalColumnGroup === "leftInner").sort((a,b) => a.cellNumber - b.cellNumber);
            const rightInner = slots.filter(s => s.bpcNumber === rightBpc && s.physicalColumnGroup === "rightInner").sort((a,b) => a.cellNumber - b.cellNumber);
            const rightMid = slots.filter(s => s.bpcNumber === rightBpc && s.physicalColumnGroup === "rightMiddle").sort((a,b) => a.cellNumber - b.cellNumber);
            const rightOuter = slots.filter(s => s.bpcNumber === rightBpc && s.physicalColumnGroup === "rightOuter").sort((a,b) => a.cellNumber - b.cellNumber);

            return (
              <div key={`row-${row}`} className={`grid grid-cols-[24px_1fr_1fr_1fr_24px_1fr_1fr_1fr_24px] ${isTileMode ? 'gap-1' : 'gap-2'}`}>
                 {/* Left BPC index label 1-7 */}
                 <div className={`flex flex-col items-center justify-center text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 font-bold rounded-sm ${
                   isTileMode ? 'text-[7px]' : 'text-[9.5px]'
                 }`}>
                    {leftBpc}
                 </div>

                 {renderModule(leftBpc, "OUTER", leftOuter)}
                 {renderModule(leftBpc, "MID", leftMid)}
                 {renderModule(leftBpc, "INNER", leftInner)}
                 
                 <div className={`flex flex-col items-center justify-center text-blue-400 bg-blue-500/5 border-x border-blue-500/20 font-bold rounded-sm ${
                   isTileMode ? 'py-0 text-[5.5px]' : 'py-1 text-[9px]'
                 }`}>
                     <div className="leading-none">↑</div>
                     <div className={`w-px bg-blue-500/20 my-0.5 ${isTileMode ? 'h-3' : 'h-8'}`}></div>
                     <div className="leading-none">↓</div>
                 </div>

                 {renderModule(rightBpc, "INNER", rightInner)}
                 {renderModule(rightBpc, "MID", rightMid)}
                 {renderModule(rightBpc, "OUTER", rightOuter)}

                 {/* Right BPC index label 14-8 */}
                 <div className={`flex flex-col items-center justify-center text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 font-bold rounded-sm ${
                   isTileMode ? 'text-[7px]' : 'text-[9.5px]'
                 }`}>
                    {rightBpc}
                 </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
