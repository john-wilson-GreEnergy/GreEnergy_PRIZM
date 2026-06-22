import React, { useMemo } from "react";
import { formatCelsius, formatFahrenheit } from "../lib/temperatureUnits";
import { PhysicalCellSlot } from "../lib/physicalEnergySegmentLayout";

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
}: PhysicalStringLayoutProps) {

  const { minTemp, maxTemp, avgTemp, deltaTemp, minVolt, maxVolt, avgVolt, deltaVolt } = useMemo(() => {
    const validTemps = slots.map(s => s.tempC).filter(v => typeof v === 'number' && Number.isFinite(v)) as number[];
    const validTempsF = slots.map(s => s.tempF).filter(v => typeof v === 'number' && Number.isFinite(v)) as number[];
    const validVolts = slots.map(s => s.voltageMv).filter(v => typeof v === 'number' && Number.isFinite(v)) as number[];
    
    // Default values if empty
    const minC = validTemps.length > 0 ? Math.min(...validTemps) : 0;
    const maxC = validTemps.length > 0 ? Math.max(...validTemps) : 0;
    const avgC = validTemps.length > 0 ? validTemps.reduce((a, b) => a + b, 0) / validTemps.length : 0;

    const minF = validTempsF.length > 0 ? Math.min(...validTempsF) : 32;
    const maxF = validTempsF.length > 0 ? Math.max(...validTempsF) : 32;
    const avgF = validTempsF.length > 0 ? validTempsF.reduce((a, b) => a + b, 0) / validTempsF.length : 32;
    
    const minVolt = validVolts.length > 0 ? Math.min(...validVolts) : 0;
    const maxVolt = validVolts.length > 0 ? Math.max(...validVolts) : 0;
    const avgVolt = validVolts.length > 0 ? validVolts.reduce((a, b) => a + b, 0) / validVolts.length : 0;
    
    return {
      minTemp: tempUnit === "F" ? minF : minC,
      maxTemp: tempUnit === "F" ? maxF : maxC,
      avgTemp: tempUnit === "F" ? avgF : avgC,
      deltaTemp: (tempUnit === "F" ? maxF - minF : maxC - minC),
      minVolt,
      maxVolt,
      avgVolt,
      deltaVolt: maxVolt - minVolt,
    };
  }, [slots, tempUnit]);

  const normalizeValue = (value: number, min: number, max: number): number => {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 0.5;
    if (max === min) return 0.5;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  };

  const getTempGradientClass = (t: number): string => {
    if (t < 0.2) return "bg-sky-200 text-slate-900 border-sky-300";
    if (t < 0.4) return "bg-cyan-200 text-slate-900 border-cyan-300";
    if (t < 0.6) return "bg-emerald-200 text-slate-900 border-emerald-300";
    if (t < 0.8) return "bg-amber-200 text-slate-900 border-amber-300";
    return "bg-red-300 text-slate-950 border-red-400";
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
             const tooltip = [
               `Array ${arrayNumber} / String ${stringNumber}`,
               `BPC ${cell.bpcNumber} / Cell Group ${cell.cellNumber}`,
               `Side: ${cell.side.charAt(0).toUpperCase() + cell.side.slice(1)}`,
               `Module: ${cell.moduleLabel}`,
               `HVAC: ${cell.hvacProximity.charAt(0).toUpperCase() + cell.hvacProximity.slice(1)}`,
               `Temperature: ${formatFahrenheit(cell.tempF)} / ${formatCelsius(cell.tempC)}`,
               `Voltage: ${cell.voltageMv ?? "--"} mV`,
               `Timestamp age: ${cell.timestampAge ?? "--"}`,
               `Balancing: ${cell.balancing ?? "--"}`,
               `Source: ${cell.source}`
             ].join("\n");

             let colorClass = "bg-white/5 border-white/10 text-white/40";
             let valueLabel = "--";

             const currentTemp = tempUnit === "F" ? cell.tempF : cell.tempC;

             if (metric === "temperature" && currentTemp !== null && Number.isFinite(currentTemp)) {
                colorClass = getTempGradientClass(normalizeValue(currentTemp, minTemp, maxTemp));
                const digits = currentTemp < 100 && currentTemp > -10 ? 1 : 0;
                valueLabel = currentTemp.toFixed(digits);
             } else if (metric === "voltage" && cell.voltageMv !== null && Number.isFinite(cell.voltageMv)) {
                colorClass = getVoltGradientClass(normalizeValue(cell.voltageMv, minVolt, maxVolt));
                valueLabel = Math.round(cell.voltageMv).toString();
             }

             return (
               <div
                 key={idx}
                 title={tooltip}
                 className={`rounded-[2px] border leading-none flex items-center justify-center font-mono font-bold cursor-help transition-all hover:scale-110 ${
                   isL ? 'h-3.5 text-[6.5px]' : 'h-6 text-[9.5px]'
                 } ${colorClass}`}
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
              <span className="text-prizm-text-muted text-[8.5px] uppercase mt-0.5 truncate">
                Mode: {metric === "temperature" ? `Temperature °${tempUnit}` : "Voltage mV"} &nbsp;|&nbsp; {slots.length} cells
              </span>
              {metric === "temperature" ? (
                  <span className="text-prizm-text-muted text-[8px] mt-0.5 truncate font-semibold">
                    Min {minTemp.toFixed(1)}°{tempUnit} &nbsp;|&nbsp; Avg {avgTemp.toFixed(1)}°{tempUnit} &nbsp;|&nbsp; Max {maxTemp.toFixed(1)}°{tempUnit} &nbsp;|&nbsp; Δ {deltaTemp.toFixed(1)}°{tempUnit}
                  </span>
              ) : (
                  <span className="text-prizm-text-muted text-[8px] mt-0.5 truncate font-semibold">
                    Min {Math.round(minVolt)} mV &nbsp;|&nbsp; Avg {Math.round(avgVolt)} mV &nbsp;|&nbsp; Max {Math.round(maxVolt)} mV &nbsp;|&nbsp; Δ {Math.round(deltaVolt)} mV
                  </span>
              )}
           </div>
           
           <div className="flex flex-col items-end gap-1 shrink-0">
             <div className="flex items-center gap-1 text-[7.5px] text-prizm-text-muted uppercase font-bold">
               <span>Low</span>
               <div className="flex gap-[1px]">
                 {metric === "temperature" ? (
                   <>
                     <div className={`w-2.5 h-1.5 rounded-[1px] ${getTempGradientClass(0)}`}></div>
                     <div className={`w-2.5 h-1.5 rounded-[1px] ${getTempGradientClass(0.3)}`}></div>
                     <div className={`w-2.5 h-1.5 rounded-[1px] ${getTempGradientClass(0.5)}`}></div>
                     <div className={`w-2.5 h-1.5 rounded-[1px] ${getTempGradientClass(0.7)}`}></div>
                     <div className={`w-2.5 h-1.5 rounded-[1px] ${getTempGradientClass(1)}`}></div>
                   </>
                 ) : (
                   <>
                     <div className={`w-2.5 h-1.5 rounded-[1px] ${getVoltGradientClass(0)}`}></div>
                     <div className={`w-2.5 h-1.5 rounded-[1px] ${getVoltGradientClass(0.3)}`}></div>
                     <div className={`w-2.5 h-1.5 rounded-[1px] ${getVoltGradientClass(0.5)}`}></div>
                     <div className={`w-2.5 h-1.5 rounded-[1px] ${getVoltGradientClass(0.7)}`}></div>
                     <div className={`w-2.5 h-1.5 rounded-[1px] ${getVoltGradientClass(1)}`}></div>
                   </>
                 )}
               </div>
               <span>High</span>
             </div>
           </div>
        </div>
      )}

      <div className={`mt-2 ${isTileMode ? 'min-w-[400px]' : 'min-w-[700px]'}`}>
        {/* Visual Headers */}
        <div className={`grid grid-cols-[1fr_1fr_1fr_24px_1fr_1fr_1fr] ${isTileMode ? 'gap-1' : 'gap-2'} mb-1 text-center font-bold text-prizm-text-muted leading-tight`}>
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
              <div key={`row-${row}`} className={`grid grid-cols-[1fr_1fr_1fr_24px_1fr_1fr_1fr] ${isTileMode ? 'gap-1' : 'gap-2'}`}>
                 {renderModule(leftBpc, "OUTER", leftOuter)}
                 {renderModule(leftBpc, "MID", leftMid)}
                 {renderModule(leftBpc, "INNER", leftInner)}
                 
                 <div className={`flex flex-col items-center justify-center text-blue-400 bg-blue-500/5 border-x border-blue-500/20 font-bold rounded-sm ${
                   isTileMode ? 'py-0 text-[5.5px]' : 'py-1 text-[9px]'
                 }`}>
                     <div className="leading-none">↑</div>
                     <div className={`w-px bg-blue-500/20 my-0.5 ${isTileMode ? 'h-2' : 'h-5'}`}></div>
                     <span className={`leading-none font-extrabold ${isTileMode ? 'text-[7px]' : 'text-[9.5px]'}`}>{row}</span>
                     <div className={`w-px bg-blue-500/20 my-0.5 ${isTileMode ? 'h-2' : 'h-5'}`}></div>
                     <div className="leading-none">↓</div>
                 </div>

                 {renderModule(rightBpc, "INNER", rightInner)}
                 {renderModule(rightBpc, "MID", rightMid)}
                 {renderModule(rightBpc, "OUTER", rightOuter)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
