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

  const getTempColor = (tempF: number | null) => {
    if (tempF === null) return "bg-white/5 border-white/10";
    if (tempF < 50) return "bg-blue-500/20 border-blue-500/40 text-blue-300";
    if (tempF <= 85) return "bg-emerald-500/20 border-emerald-500/40 text-emerald-300";
    if (tempF <= 100) return "bg-yellow-500/20 border-yellow-500/40 text-yellow-300";
    return "bg-red-500/20 border-red-500/40 text-red-300";
  };

  const getVoltageColor = (mv: number | null) => {
    if (mv === null) return "bg-white/5 border-white/10";
    if (mv >= 3100 && mv <= 3450) return "bg-emerald-500/20 border-emerald-500/40 text-emerald-300";
    if (mv < 3100) return "bg-yellow-500/20 border-yellow-500/40 text-yellow-300";
    return "bg-red-500/20 border-red-500/40 text-red-300"; // high
  };

  const renderModule = (bpcNumber: number, label: string, moduleCells: PhysicalCellSlot[]) => {
    return (
      <div className="flex flex-col bg-black/20 p-1 rounded border border-prizm-border/40">
         <div className="text-[8px] font-bold text-prizm-text-muted mb-1 text-center whitespace-nowrap">
            BPC {bpcNumber} {label.toUpperCase()}
         </div>
         <div className="grid grid-cols-5 gap-0.5">
           {moduleCells.map((cell, idx) => {
             const title = mode === "temperature" ? 
`Array ${arrayNumber} / String ${stringNumber}
BPC ${cell.bpcNumber} / Cell Group ${cell.cellNumber}
Side: ${cell.side.charAt(0).toUpperCase() + cell.side.slice(1)}
Module: ${cell.moduleLabel}
HVAC Proximity: ${cell.hvacProximity.charAt(0).toUpperCase() + cell.hvacProximity.slice(1)}
Temperature: ${formatFahrenheit(cell.tempF)}
Celsius: ${formatCelsius(cell.tempC)}
Raw: ${cell.tempRaw ?? "--"} ${cell.tempSourceKind === "deci-celsius" ? "deci-celsius" : ""}
Voltage: ${cell.voltageMv ?? "--"} mV
Source: ${cell.source}` :
`Array ${arrayNumber} / String ${stringNumber}
BPC ${cell.bpcNumber} / Cell Group ${cell.cellNumber}
Side: ${cell.side.charAt(0).toUpperCase() + cell.side.slice(1)}
Module: ${cell.moduleLabel}
HVAC Proximity: ${cell.hvacProximity.charAt(0).toUpperCase() + cell.hvacProximity.slice(1)}
Voltage: ${cell.voltageMv ?? "--"} mV
Temperature: ${formatFahrenheit(cell.tempF)} / ${formatCelsius(cell.tempC)}
Source: ${cell.source}`;

             const colorClass = mode === "temperature" ? getTempColor(cell.tempF) : getVoltageColor(cell.voltageMv);
             return (
               <div
                 key={idx}
                 title={title}
                 className={`w-full aspect-square border text-[7px] flex items-center justify-center font-bold cursor-help ${colorClass}`}
               ></div>
             )
           })}
           {Array.from({ length: Math.max(0, 10 - moduleCells.length) }).map((_, i) => (
             <div key={`empty-${i}`} className="w-full aspect-square border border-white/5 bg-white/5"></div>
           ))}
         </div>
      </div>
    );
  };

  const rows = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="bg-prizm-surface border border-prizm-border/40 p-4 rounded-lg space-y-4 font-mono text-xs w-full select-none overflow-x-auto">
      <div className="flex justify-between items-center mb-2">
         <div className="flex flex-col">
            <span className="font-bold text-prizm-text tracking-wider uppercase text-[10px]">
              PHYSICAL ENERGY SEGMENT LAYOUT
            </span>
            <span className="text-prizm-text-muted text-[9px] uppercase mt-0.5">
              Array {arrayNumber} / String {stringNumber} &nbsp;|&nbsp; Source: Rich String Detail &nbsp;|&nbsp; {slots.length} cells
            </span>
         </div>
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
      </div>

      <div className="min-w-[700px]">
        {/* Visual Headers */}
        <div className="grid grid-cols-[1fr_1fr_1fr_48px_1fr_1fr_1fr] gap-2 mb-2 text-center text-[9px] font-bold text-prizm-text-muted">
           <div>LEFT OUTER<br/><span className="text-[7px]">Cells 1-10</span></div>
           <div>LEFT MIDDLE<br/><span className="text-[7px]">Cells 11-20</span></div>
           <div>LEFT INNER<br/><span className="text-[7px]">Cells 21-30</span></div>
           <div className="flex flex-col justify-end text-blue-400">HVAC</div>
           <div>RIGHT INNER<br/><span className="text-[7px]">Cells 1-10</span></div>
           <div>RIGHT MIDDLE<br/><span className="text-[7px]">Cells 11-20</span></div>
           <div>RIGHT OUTER<br/><span className="text-[7px]">Cells 21-30</span></div>
        </div>

        {/* Rows */}
        <div className="space-y-1">
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
              <div key={`row-${row}`} className="grid grid-cols-[1fr_1fr_1fr_48px_1fr_1fr_1fr] gap-2">
                 {renderModule(leftBpc, "OUTER", leftOuter)}
                 {renderModule(leftBpc, "MID", leftMid)}
                 {renderModule(leftBpc, "INNER", leftInner)}
                 
                 <div className="flex items-center justify-center text-blue-400/50 bg-blue-500/5 border-x border-blue-500/20 text-[10px] font-bold">
                    ←
                    <div className="w-px h-full bg-blue-500/20 mx-1"></div>
                    →
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
