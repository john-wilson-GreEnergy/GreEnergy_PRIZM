import React, { useMemo, useState } from "react";
import { formatCelsius, formatFahrenheit } from "../lib/temperatureUnits";
import { PhysicalCellSlot } from "../lib/physicalEnergySegmentLayout";

type PhysicalEnergySegmentHeatmapProps = {
  slots: PhysicalCellSlot[];
  arrayNumber: number | string;
  stringNumber: number | string;
  defaultMode?: "temperature" | "voltage";
};

export default function PhysicalEnergySegmentHeatmap({
  slots,
  arrayNumber,
  stringNumber,
  defaultMode = "temperature"
}: PhysicalEnergySegmentHeatmapProps) {
  const [mode, setMode] = useState<"temperature" | "voltage">(defaultMode);

  const { minTemp, maxTemp, avgTemp, deltaTemp, minVolt, maxVolt, avgVolt, deltaVolt } = useMemo(() => {
    const validTemps = slots.map(s => s.tempF).filter(v => typeof v === 'number' && Number.isFinite(v)) as number[];
    const validVolts = slots.map(s => s.voltageMv).filter(v => typeof v === 'number' && Number.isFinite(v)) as number[];
    
    const minTemp = validTemps.length > 0 ? Math.min(...validTemps) : 0;
    const maxTemp = validTemps.length > 0 ? Math.max(...validTemps) : 0;
    const avgTemp = validTemps.length > 0 ? validTemps.reduce((a, b) => a + b, 0) / validTemps.length : 0;
    
    const minVolt = validVolts.length > 0 ? Math.min(...validVolts) : 0;
    const maxVolt = validVolts.length > 0 ? Math.max(...validVolts) : 0;
    const avgVolt = validVolts.length > 0 ? validVolts.reduce((a, b) => a + b, 0) / validVolts.length : 0;
    
    return {
      minTemp, maxTemp, avgTemp, deltaTemp: maxTemp - minTemp,
      minVolt, maxVolt, avgVolt, deltaVolt: maxVolt - minVolt
    };
  }, [slots]);

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

  const renderModule = (bpcNumber: number, label: string, moduleCells: PhysicalCellSlot[]) => {
    return (
      <div className="flex flex-col bg-black/20 p-1 rounded border border-prizm-border/40">
         <div className="text-[8px] font-bold text-prizm-text-muted mb-0.5 text-center whitespace-nowrap">
            BPC {bpcNumber} {label.toUpperCase()}
         </div>
         <div className="grid grid-cols-5 gap-0.5">
           {moduleCells.map((cell, idx) => {
             const title = `Array ${arrayNumber} / String ${stringNumber}\nBPC ${cell.bpcNumber} / Cell Group ${cell.cellNumber}\nSide: ${cell.side.charAt(0).toUpperCase() + cell.side.slice(1)}\nModule: ${cell.moduleLabel}\nHVAC: ${cell.hvacProximity.charAt(0).toUpperCase() + cell.hvacProximity.slice(1)}\nTemperature: ${formatFahrenheit(cell.tempF)} / ${formatCelsius(cell.tempC)}\nVoltage: ${cell.voltageMv ?? "--"} mV\nSource: ${cell.source}`;

             let colorClass = "bg-white/5 border-white/10 text-white/40";
             let valueLabel = "--";

             if (mode === "temperature" && cell.tempF !== null && Number.isFinite(cell.tempF)) {
                colorClass = getTempGradientClass(normalizeValue(cell.tempF, minTemp, maxTemp));
                const digits = cell.tempF < 100 && cell.tempF > -10 ? 1 : 0;
                valueLabel = cell.tempF.toFixed(digits);
             } else if (mode === "voltage" && cell.voltageMv !== null && Number.isFinite(cell.voltageMv)) {
                colorClass = getVoltGradientClass(normalizeValue(cell.voltageMv, minVolt, maxVolt));
                valueLabel = Math.round(cell.voltageMv).toString();
             }

             return (
               <div
                 key={idx}
                 title={title}
                 className={`h-6 rounded-[2px] border text-[9.5px] leading-none flex items-center justify-center font-mono font-bold cursor-help ${colorClass}`}
               >
                 {valueLabel}
               </div>
             )
           })}
           {Array.from({ length: Math.max(0, 10 - moduleCells.length) }).map((_, i) => (
             <div key={`empty-${i}`} className="h-6 rounded-[2px] border border-white/5 bg-white/5"></div>
           ))}
         </div>
      </div>
    );
  };

  const rows = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="bg-prizm-surface border border-prizm-border/40 p-4 rounded-lg space-y-3 font-mono text-xs w-full select-none overflow-x-auto">
      <div className="flex justify-between items-start mb-1">
         <div className="flex flex-col">
            <span className="font-bold text-prizm-text tracking-wider uppercase text-[10px]">
              PHYSICAL ENERGY SEGMENT LAYOUT
            </span>
            <span className="text-prizm-text-muted text-[10px] uppercase mt-1">
              Mode: {mode === "temperature" ? "Temperature °F" : "Voltage mV"} &nbsp;|&nbsp; Source: Rich String Detail &nbsp;|&nbsp; {slots.length} cells
            </span>
            {mode === "temperature" ? (
                <span className="text-prizm-text-muted text-[10px] mt-0.5">
                  Min {minTemp.toFixed(1)}°F &nbsp;|&nbsp; Avg {avgTemp.toFixed(1)}°F &nbsp;|&nbsp; Max {maxTemp.toFixed(1)}°F &nbsp;|&nbsp; Δ {deltaTemp.toFixed(1)}°F
                </span>
            ) : (
                <span className="text-prizm-text-muted text-[10px] mt-0.5">
                  Min {Math.round(minVolt)} mV &nbsp;|&nbsp; Avg {Math.round(avgVolt)} mV &nbsp;|&nbsp; Max {Math.round(maxVolt)} mV &nbsp;|&nbsp; Δ {Math.round(deltaVolt)} mV
                </span>
            )}
         </div>
         <div className="flex flex-col items-end gap-2">
           <div className="flex border border-prizm-border/40 rounded overflow-hidden text-[9px] uppercase font-bold tracking-wider">
             <button 
               onClick={() => setMode("temperature")}
               className={`px-3 py-1 ${mode === "temperature" ? "bg-prizm-primary text-prizm-bg" : "bg-black/20 text-prizm-text-muted hover:bg-prizm-surface-strong"}`}
             >
               Temperature °F
             </button>
             <button 
               onClick={() => setMode("voltage")}
               className={`px-3 py-1 ${mode === "voltage" ? "bg-prizm-primary text-prizm-bg" : "bg-black/20 text-prizm-text-muted hover:bg-prizm-surface-strong"}`}
             >
               Voltage mV
             </button>
           </div>
           
           <div className="flex items-center gap-1 text-[8px] text-prizm-text-muted uppercase font-bold">
             <span>Low</span>
             <div className="flex gap-[1px]">
               {mode === "temperature" ? (
                 <>
                   <div className={`w-3 h-2 rounded-[1px] ${getTempGradientClass(0)}`}></div>
                   <div className={`w-3 h-2 rounded-[1px] ${getTempGradientClass(0.3)}`}></div>
                   <div className={`w-3 h-2 rounded-[1px] ${getTempGradientClass(0.5)}`}></div>
                   <div className={`w-3 h-2 rounded-[1px] ${getTempGradientClass(0.7)}`}></div>
                   <div className={`w-3 h-2 rounded-[1px] ${getTempGradientClass(1)}`}></div>
                 </>
               ) : (
                 <>
                   <div className={`w-3 h-2 rounded-[1px] ${getVoltGradientClass(0)}`}></div>
                   <div className={`w-3 h-2 rounded-[1px] ${getVoltGradientClass(0.3)}`}></div>
                   <div className={`w-3 h-2 rounded-[1px] ${getVoltGradientClass(0.5)}`}></div>
                   <div className={`w-3 h-2 rounded-[1px] ${getVoltGradientClass(0.7)}`}></div>
                   <div className={`w-3 h-2 rounded-[1px] ${getVoltGradientClass(1)}`}></div>
                 </>
               )}
             </div>
             <span>High</span>
           </div>
         </div>
      </div>

      <div className="min-w-[700px] mt-2">
        {/* Visual Headers */}
        <div className="grid grid-cols-[1fr_1fr_1fr_32px_1fr_1fr_1fr] gap-2 mb-1.5 text-center text-[9px] font-bold text-prizm-text-muted">
           <div>LEFT OUTER<br/><span className="text-[7px]">Cells 1-10</span></div>
           <div>LEFT MIDDLE<br/><span className="text-[7px]">Cells 11-20</span></div>
           <div>LEFT INNER<br/><span className="text-[7px]">Cells 21-30</span></div>
           <div className="flex flex-col justify-end text-blue-400">HVAC</div>
           <div>RIGHT INNER<br/><span className="text-[7px]">Cells 1-10</span></div>
           <div>RIGHT MIDDLE<br/><span className="text-[7px]">Cells 11-20</span></div>
           <div>RIGHT OUTER<br/><span className="text-[7px]">Cells 21-30</span></div>
        </div>

        {/* Rows */}
        <div className="space-y-1.5">
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
              <div key={`row-${row}`} className="grid grid-cols-[1fr_1fr_1fr_32px_1fr_1fr_1fr] gap-2">
                 {renderModule(leftBpc, "OUTER", leftOuter)}
                 {renderModule(leftBpc, "MID", leftMid)}
                 {renderModule(leftBpc, "INNER", leftInner)}
                 
                 <div className="flex items-center justify-center text-blue-400/50 bg-blue-500/5 border-x border-blue-500/20 text-[10px] font-bold h-full rounded-sm">
                    {/* HVAC symbol or directional arrows */}
                    <div className="flex flex-col items-center">
                        <div>↑</div>
                        <div className="w-px h-6 bg-blue-500/20 my-1"></div>
                        <div>↓</div>
                    </div>
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

