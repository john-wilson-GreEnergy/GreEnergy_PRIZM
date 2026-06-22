import React, { useState, useMemo } from "react";
import { Info, Layers } from "lucide-react";
import { cToF } from "../lib/temperatureUnits";

type ArrayCellHeatmapGridProps = {
  arrayDetailsByArray: Record<string, any>;
};

export default function ArrayCellHeatmapGrid({ arrayDetailsByArray = {} }: ArrayCellHeatmapGridProps) {
  const [mode, setMode] = useState<"voltage" | "temperature">("voltage");
  const [tempUnit, setTempUnit] = useState<"C" | "F">("F");
  const [selectedArray, setSelectedArray] = useState<string | "all">("all");

  const arrayKeys = useMemo(() => {
    return Object.keys(arrayDetailsByArray).sort((a, b) => Number(a) - Number(b));
  }, [arrayDetailsByArray]);

  const arraysToRender = useMemo(() => {
    if (selectedArray === "all") {
      return arrayKeys.map((k) => arrayDetailsByArray[k]).filter(Boolean);
    }
    return [arrayDetailsByArray[selectedArray]].filter(Boolean);
  }, [selectedArray, arrayKeys, arrayDetailsByArray]);

  const getCompactCell = (bpc: number, cg: number, voltsArr: any[], tempsArr: any[]) => {
    const idx = (bpc - 1) * 30 + (cg - 1);
    const voltage = voltsArr[idx] !== undefined && voltsArr[idx] !== null ? Number(voltsArr[idx]) : null;
    const temperature = tempsArr[idx] !== undefined && tempsArr[idx] !== null ? Number(tempsArr[idx]) : null;
    
    return {
      bpc,
      cellNumber: cg,
      voltage,
      temperature
    };
  };

  const renderCompactModuleInCard = (
    moduleCells: any[], 
    sMin: number, 
    sMax: number,
    arrayIndex: number,
    stringIndex: number,
    rowNum: number,
    bpc: number,
    moduleNum: number
  ) => {
    const cellsToRender = [...moduleCells];
    while (cellsToRender.length < 10) {
      cellsToRender.push({ bpc, cellNumber: cellsToRender.length + 1, voltage: null, temperature: null });
    }

    return (
      <div className="grid grid-cols-5 gap-[1.5px] p-0.5 bg-slate-950/40 rounded border border-slate-800/10">
        {cellsToRender.map((cell, idx) => {
          const val = mode === "voltage" ? cell.voltage : cell.temperature;
          const displayVal = mode === "voltage" ? val : (tempUnit === "F" && val !== null ? cToF(val) : val);

          let valDisp = "--";
          // Detailed physical label format: Array X - String Y - ES Z
          let titleStr = `Array ${arrayIndex} - String ${stringIndex} - ES ${rowNum}\nBPC ${bpc} Module ${moduleNum} Cell ${cell.cellNumber}\nNo telemetry reported`;
          let colorStyle: React.CSSProperties = { backgroundColor: "rgba(255,255,255,0.03)" };

          if (displayVal !== null && displayVal !== undefined && !Number.isNaN(displayVal)) {
            if (mode === "voltage") {
              const valNum = Number(displayVal);
              valDisp = `${Math.round(valNum)} mV`;
              titleStr = `Array ${arrayIndex} - String ${stringIndex} - ES ${rowNum}\nBPC ${bpc} Module ${moduleNum} Cell ${cell.cellNumber}\nVoltage: ${valDisp}`;
              
              let opacity = 0.25;
              if (sMax > sMin) {
                opacity = 0.15 + 0.85 * ((valNum - sMin) / (sMax - sMin));
              }
              colorStyle = { backgroundColor: `rgba(16, 185, 129, ${opacity})` };
            } else {
              const valNum = Number(displayVal);
              valDisp = `${valNum.toFixed(1)}°${tempUnit}`;
              titleStr = `Array ${arrayIndex} - String ${stringIndex} - ES ${rowNum}\nBPC ${bpc} Module ${moduleNum} Cell ${cell.cellNumber}\nTemp: ${valDisp}`;

              const sMinDisp = tempUnit === "F" && sMin !== null ? cToF(sMin) : sMin;
              const sMaxDisp = tempUnit === "F" && sMax !== null ? cToF(sMax) : sMax;

              let opacity = 0.25;
              if (sMaxDisp > sMinDisp) {
                opacity = 0.15 + 0.85 * ((valNum - sMinDisp) / (sMaxDisp - sMinDisp));
              }
              colorStyle = { backgroundColor: `rgba(2, 132, 199, ${opacity})` };
            }
          }

          return (
            <div
              key={idx}
              title={titleStr}
              style={colorStyle}
              className="w-[7px] h-[7px] min-w-[7px] min-h-[7px] max-w-[7px] max-h-[7px] rounded-sm transition-transform duration-75 hover:scale-130 hover:border hover:border-white/35 cursor-crosshair"
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 font-mono text-[9px] w-full select-none" id="array-cell-heatmap-grid">
      {/* Header Controls Bar */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-[#10b981] font-bold uppercase tracking-wider block text-[10px] flex items-center gap-1.5">
            <Layers size={14} className="text-[#10b981]" />
            Site Cell Telemetry Heatmap Windows
          </span>
          <span className="text-prizm-text-muted mt-0.5 block text-[8.5px]">
            Windowed granular physical alignment layout cards grouped by Array and String
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Active Mode Selector */}
          <div className="flex bg-prizm-surface p-0.5 rounded border border-prizm-border/40">
            <button
              onClick={() => setMode("voltage")}
              className={`px-3 py-1 rounded text-[8.5px] font-bold uppercase transition-colors ${
                mode === "voltage"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "text-prizm-text-muted hover:text-white"
              }`}
            >
              Voltage Compact
            </button>
            <button
              onClick={() => setMode("temperature")}
              className={`px-3 py-1 rounded text-[8.5px] font-bold uppercase transition-colors ${
                mode === "temperature"
                  ? "bg-prizm-primary/20 text-prizm-primary border border-prizm-primary/40"
                  : "text-prizm-text-muted hover:text-white"
              }`}
            >
              Temp Compact
            </button>
          </div>

          {/* Temperature Unit Toggle */}
          {mode === "temperature" && (
            <div className="flex bg-prizm-surface p-0.5 rounded border border-prizm-border/40">
              <button
                onClick={() => setTempUnit("C")}
                className={`px-2 py-1 rounded text-[8px] font-bold uppercase transition-colors ${
                  tempUnit === "C"
                    ? "bg-sky-500/20 text-sky-450 border border-sky-500/30"
                    : "text-prizm-text-muted hover:text-white"
                }`}
              >
                °C
              </button>
              <button
                onClick={() => setTempUnit("F")}
                className={`px-2 py-1 rounded text-[8px] font-bold uppercase transition-colors ${
                  tempUnit === "F"
                    ? "bg-sky-500/20 text-sky-450 border border-sky-500/30"
                    : "text-prizm-text-muted hover:text-white"
                }`}
              >
                °F
              </button>
            </div>
          )}

          {/* Array Dropdown Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-prizm-text-muted text-[8px] uppercase font-bold">Filter:</span>
            <select
              value={selectedArray}
              onChange={(e) => setSelectedArray(e.target.value)}
              className="bg-prizm-surface-strong text-prizm-text border border-prizm-border rounded px-2.5 py-1 text-[8.5px] font-bold uppercase cursor-pointer outline-none focus:border-prizm-primary text-center"
            >
              <option value="all">All Arrays</option>
              {arrayKeys.map((k) => (
                <option key={k} value={k}>
                  Array {k}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Caution Box */}
      <div className="bg-amber-500/10 border border-amber-500/30 text-amber-500/90 p-3 rounded-lg text-[8.5px] leading-relaxed flex items-start gap-2 sm:gap-3">
        <Info size={14} className="shrink-0 mt-0.5 text-amber-500" />
        <p className="normal-case">
          <strong>Site-Wide Physical Layout:</strong> This view generates exact physical alignment tables mapping modules to environmental slots. Use toggles above to switch modes and display units dynamically.
        </p>
      </div>

      {/* Stacked Arrays List */}
      <div className="space-y-8">
        {arraysToRender.map((arr) => {
          const stringsList = Array.isArray(arr.strings) ? arr.strings : [];
          const sortedStrings = [...stringsList].sort((a, b) => {
            const numA = Number(a.stringNumber ?? a.stringIndex ?? 0);
            const numB = Number(b.stringNumber ?? b.stringIndex ?? 0);
            return numA - numB;
          });

          return (
            <div key={arr.arrayNumber} className="space-y-3">
              <div className="border-b border-prizm-border/40 pb-1.5">
                <h3 className="text-prizm-text font-bold text-[9.5px] uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-3 bg-prizm-primary rounded-sm inline-block"></span>
                  ARRAY {arr.arrayNumber} PHYSICAL TIMELINE HEATMAPS
                  <span className="text-prizm-text-muted font-normal text-[8px] tracking-normal normal-case">
                    ({sortedStrings.length} strings mapped)
                  </span>
                </h3>
              </div>

              {sortedStrings.length === 0 ? (
                <div className="text-prizm-text-muted italic p-4 text-center border border-dashed border-prizm-border/20 rounded bg-prizm-surface-strong">
                  No active string data reported in Array {arr.arrayNumber}
                </div>
              ) : (
                /* Balanced 4-column physical layout card structure */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {sortedStrings.map((str) => {
                    const stringIndex = str.stringNumber ?? str.stringIndex ?? 1;
                    const stringKey = str.id || `Array ${arr.arrayNumber} - String ${stringIndex}`;
                    const volts = Array.isArray(str.millivolts) ? str.millivolts : [];
                    const temps = Array.isArray(str.temperatures) ? str.temperatures : [];
                    const vals = mode === "voltage" ? volts : temps;

                    const validValues = vals.map(Number).filter((v) => !Number.isNaN(v) && v !== null && v !== undefined);
                    const sMin = validValues.length ? Math.min(...validValues) : 0;
                    const sMax = validValues.length ? Math.max(...validValues) : 0;

                    return (
                      <div
                        key={stringKey}
                        className="bg-[#0f172a] border border-slate-800 rounded-xl p-3.5 space-y-4 flex flex-col justify-between"
                      >
                        {/* Title block with Array, String, and Category */}
                        <div className="flex justify-between items-start border-b border-slate-800 pb-2">
                          <div>
                            <span className="text-slate-100 text-[10px] font-bold uppercase tracking-wider block">
                              {stringKey}
                            </span>
                            <span className="text-slate-400 text-[8px] tracking-wider uppercase mt-0.5 block">
                              Station {arr.stationCode || "BESS"} · Array {arr.arrayNumber}
                            </span>
                          </div>
                          <span className="bg-slate-800 text-slate-300 text-[6.5px] font-bold px-1.5 py-0.5 rounded border border-slate-700/50 uppercase tracking-widest leading-none">
                            PHYSICAL
                          </span>
                        </div>

                        {/* Relative Ranges Bar (Slate style) */}
                        {validValues.length > 0 && (
                          <div className="flex justify-between items-center text-[7.5px] bg-slate-950/50 border border-slate-800/30 p-1.5 rounded-lg select-none font-semibold font-mono">
                            <span className="text-emerald-400 flex items-center gap-1">
                              MIN: {mode === "voltage" ? `${Math.round(sMin)}mV` : `${(tempUnit === "F" ? cToF(sMin) : sMin).toFixed(1)}°${tempUnit}`}
                            </span>
                            <span className="text-slate-500 font-bold tracking-tighter text-[7px]">RANGE LIMITS</span>
                            <span className="text-sky-400 flex items-center gap-1">
                              MAX: {mode === "voltage" ? `${Math.round(sMax)}mV` : `${(tempUnit === "F" ? cToF(sMax) : sMax).toFixed(1)}°${tempUnit}`}
                            </span>
                          </div>
                        )}

                        {/* Miniature Physical Rack Layout */}
                        {vals.length === 0 ? (
                          <div className="h-[120px] flex items-center justify-center text-prizm-text-muted text-[8px] border border-dashed border-prizm-border/10 rounded bg-prizm-surface p-2 text-center italic">
                            No active telemetry reported
                          </div>
                        ) : (
                          <div className="flex flex-col space-y-1">
                            {/* Column alignment labels */}
                            <div className="grid grid-cols-7 text-[6.5px] text-slate-500 font-bold uppercase text-center tracking-tighter pb-0.5">
                              <div>L.OUT</div>
                              <div>L.MID</div>
                              <div>L.INR</div>
                              <div className="text-sky-405/60 text-[6px]">HVAC</div>
                              <div>R.INR</div>
                              <div>R.MID</div>
                              <div>R.OUT</div>
                            </div>

                            {/* Row 1 to 7 corresponding to environmental layouts */}
                            {Array.from({ length: 7 }, (_, rIdx) => {
                              const rowNum = rIdx + 1;
                              const bpcLeft = rowNum;
                              const bpcRight = 15 - rowNum;

                              // Slice the 10 cells corresponding to Module 1, Module 2, Module 3 per BPC
                              const leftOuterCells = Array.from({ length: 10 }, (_, ci) => getCompactCell(bpcLeft, ci + 1, volts, temps));
                              const leftMidCells = Array.from({ length: 10 }, (_, ci) => getCompactCell(bpcLeft, ci + 11, volts, temps));
                              const leftInnerCells = Array.from({ length: 10 }, (_, ci) => getCompactCell(bpcLeft, ci + 21, volts, temps));

                              const rightInnerCells = Array.from({ length: 10 }, (_, ci) => getCompactCell(bpcRight, ci + 1, volts, temps));
                              const rightMidCells = Array.from({ length: 10 }, (_, ci) => getCompactCell(bpcRight, ci + 11, volts, temps));
                              const rightOuterCells = Array.from({ length: 10 }, (_, ci) => getCompactCell(bpcRight, ci + 21, volts, temps));

                              return (
                                <div key={rowNum} className="grid grid-cols-7 items-center gap-1">
                                  {/* Left Module 1 (Outer), 2 (Middle), 3 (Inner) */}
                                  {renderCompactModuleInCard(leftOuterCells, sMin, sMax, arr.arrayNumber, stringIndex, rowNum, bpcLeft, 1)}
                                  {renderCompactModuleInCard(leftMidCells, sMin, sMax, arr.arrayNumber, stringIndex, rowNum, bpcLeft, 2)}
                                  {renderCompactModuleInCard(leftInnerCells, sMin, sMax, arr.arrayNumber, stringIndex, rowNum, bpcLeft, 3)}

                                  {/* Center Column: ES / Row tag */}
                                  <div className="flex flex-col items-center justify-center bg-slate-950/85 border border-slate-800 rounded-[2px] py-1 h-full select-none">
                                    <span className="text-[5.5px] scale-90 text-slate-500 font-bold leading-none tracking-tighter mb-[1px]">ES</span>
                                    <span className="text-sky-400 font-extrabold leading-none text-[8px]">{rowNum}</span>
                                  </div>

                                  {/* Right Module 1 (Inner), 2 (Middle), 3 (Outer) */}
                                  {renderCompactModuleInCard(rightInnerCells, sMin, sMax, arr.arrayNumber, stringIndex, rowNum, bpcRight, 1)}
                                  {renderCompactModuleInCard(rightMidCells, sMin, sMax, arr.arrayNumber, stringIndex, rowNum, bpcRight, 2)}
                                  {renderCompactModuleInCard(rightOuterCells, sMin, sMax, arr.arrayNumber, stringIndex, rowNum, bpcRight, 3)}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
