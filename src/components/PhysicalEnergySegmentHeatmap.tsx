import React, { useState } from "react";
import { PhysicalCellSlot } from "../lib/physicalEnergySegmentLayout";
import PhysicalStringLayout from "./PhysicalStringLayout";

type PhysicalEnergySegmentHeatmapProps = {
  slots: PhysicalCellSlot[];
  arrayNumber: number | string;
  stringNumber: number | string;
  defaultMode?: "temperature" | "voltage";
  mode?: "temperature" | "voltage";
  hideToggle?: boolean;
  title?: string;
};

export default function PhysicalEnergySegmentHeatmap({
  slots,
  arrayNumber,
  stringNumber,
  defaultMode = "temperature",
  mode: propMode,
  hideToggle = false,
  title
}: PhysicalEnergySegmentHeatmapProps) {
  const [internalMode, setInternalMode] = useState<"temperature" | "voltage">(defaultMode);
  const mode = propMode !== undefined ? propMode : internalMode;

  return (
    <div className="space-y-2 w-full">
      {!hideToggle && (
        <div className="flex justify-end">
          <div className="flex border border-prizm-border/40 rounded overflow-hidden text-[9px] uppercase font-bold tracking-wider">
            <button 
              onClick={() => setInternalMode("temperature")}
              className={`px-3 py-1 ${mode === "temperature" ? "bg-prizm-primary text-prizm-bg" : "bg-black/20 text-prizm-text-muted"}`}
            >
              Temperature
            </button>
            <button 
              onClick={() => setInternalMode("voltage")}
              className={`px-3 py-1 ${mode === "voltage" ? "bg-prizm-primary text-prizm-bg" : "bg-black/20 text-prizm-text-muted"}`}
            >
              Voltage
            </button>
          </div>
        </div>
      )}
      <PhysicalStringLayout
        slots={slots}
        arrayNumber={arrayNumber}
        stringNumber={stringNumber}
        metric={mode}
        mode="detail"
        showValues={true}
        compactLabels={false}
        tempUnit="F"
        title={title}
        showMinMaxHeader={true}
      />
    </div>
  );
}
