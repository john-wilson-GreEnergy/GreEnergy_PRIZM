import React from "react";

export const CELL_VOLTAGE_COLOR_STOPS_MV = [
  { mv: 2500, color: "#dc2626", text: "#ffffff" },
  { mv: 2700, color: "#f97316", text: "#ffffff" },
  { mv: 2900, color: "#facc15", text: "#0f172a" },
  { mv: 3000, color: "#a3e635", text: "#0f172a" },
  { mv: 3200, color: "#22c55e", text: "#ffffff" },
  { mv: 3300, color: "#16a34a", text: "#ffffff" },
  { mv: 3400, color: "#22c55e", text: "#ffffff" },
  { mv: 3500, color: "#84cc16", text: "#ffffff" },
  { mv: 3600, color: "#facc15", text: "#0f172a" },
  { mv: 3700, color: "#f59e0b", text: "#ffffff" },
  { mv: 3800, color: "#ef4444", text: "#ffffff" },
  { mv: 4000, color: "#7f1d1d", text: "#ffffff" }
];

export type VoltageScaleProfile = {
  minPlausibleMv: number;
  maxPlausibleMv: number;
  criticalLowMv: number;
  lowMv: number;
  normalLowMv: number;
  normalHighMv: number;
  elevatedHighMv: number;
  criticalHighMv: number;
};

export const DEFAULT_VOLTAGE_PROFILE: VoltageScaleProfile = {
  minPlausibleMv: 1500,
  maxPlausibleMv: 4500,
  criticalLowMv: 2700,
  lowMv: 3000,
  normalLowMv: 3000,
  normalHighMv: 3500,
  elevatedHighMv: 3700,
  criticalHighMv: 3700
};

/**
 * Normalizes any cell voltage value to mV.
 * Handles both Volts (e.g., 3.28) and mV (e.g., 3280).
 * Rejects values outside the plausible range [1500, 4500] mV.
 */
export function normalizeCellVoltageToMv(
  value: number | null | undefined,
  sourceUnit?: "mV" | "V"
): number | null {
  if (value === null || value === undefined || isNaN(value)) {
    return null;
  }

  let mv = value;
  if (sourceUnit === "V") {
    if (value < 10) {
      mv = value * 1000;
    } else {
      mv = value;
    }
  } else if (sourceUnit === "mV") {
    if (value < 10) {
      mv = value * 1000;
    } else {
      mv = value;
    }
  } else {
    if (value < 10) {
      mv = value * 1000;
    } else {
      mv = value;
    }
  }

  // Plausibility check: 1500 mV to 4500 mV
  if (mv < 1500 || mv > 4500) {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[voltageScale] Rejected invalid cell voltage value: ${value} (normalized: ${mv} mV)`);
    }
    return null;
  }

  return mv;
}

/**
 * Formats cell voltage value to a mV string.
 */
export function formatCellVoltage(
  value: number | null | undefined,
  sourceUnit?: "mV" | "V",
  options?: { decimals?: number; showUnit?: boolean }
): string {
  const mv = normalizeCellVoltageToMv(value, sourceUnit);
  if (mv === null) return "--";

  const decimals = options?.decimals !== undefined ? options.decimals : 0;
  const showUnit = options?.showUnit !== undefined ? options.showUnit : true;
  
  return `${mv.toFixed(decimals)}${showUnit ? " mV" : ""}`;
}

/**
 * Returns a simple token representing the operational band of the voltage.
 */
export function getCellVoltageColorToken(
  value: number | null | undefined,
  sourceUnit?: "mV" | "V"
): string {
  const mv = normalizeCellVoltageToMv(value, sourceUnit);
  if (mv === null) return "unknown";

  if (mv < 2700) return "critical-low";
  if (mv < 3000) return "low";
  if (mv <= 3500) return "normal";
  if (mv <= 3700) return "elevated";
  return "critical-high";
}

/**
 * Helper to parse hex colors to RGB.
 */
function hexToRgb(hex: string) {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return { r, g, b };
}

/**
 * Helper to convert RGB to hex format.
 */
function rgbToHex(r: number, g: number, b: number) {
  const toHex = (c: number) => {
    const s = Math.min(255, Math.max(0, Math.round(c))).toString(16);
    return s.length === 1 ? "0" + s : s;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Dynamically computes a darker border color based on the background color.
 */
function getDarkerColor(hex: string, percent = 0.85): string {
  const { r, g, b } = hexToRgb(hex);
  const dr = Math.max(0, Math.round(r * percent));
  const dg = Math.max(0, Math.round(g * percent));
  const db = Math.max(0, Math.round(b * percent));
  return rgbToHex(dr, dg, db);
}

/**
 * Interpolates hex text colors based on closest stop index.
 */
function getInterpolatedTextColor(mv: number): string {
  const stops = CELL_VOLTAGE_COLOR_STOPS_MV;
  if (mv <= stops[0].mv) return stops[0].text;
  if (mv >= stops[stops.length - 1].mv) return stops[stops.length - 1].text;

  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    if (mv >= s1.mv && mv <= s2.mv) {
      return (mv - s1.mv) / (s2.mv - s1.mv) < 0.5 ? s1.text : s2.text;
    }
  }
  return stops[stops.length - 1].text;
}

/**
 * Maps cell voltage values to a continuous/interpolated color gradient hex string.
 */
export function interpolateCellVoltageColorMv(mv: number): string {
  const stops = CELL_VOLTAGE_COLOR_STOPS_MV;
  if (mv <= stops[0].mv) return stops[0].color;
  if (mv >= stops[stops.length - 1].mv) return stops[stops.length - 1].color;

  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    if (mv >= s1.mv && mv <= s2.mv) {
      const t = (mv - s1.mv) / (s2.mv - s1.mv);
      const c1 = hexToRgb(s1.color);
      const c2 = hexToRgb(s2.color);
      const r = c1.r + t * (c2.r - c1.r);
      const g = c1.g + t * (c2.g - c1.g);
      const b = c1.b + t * (c2.b - c1.b);
      return rgbToHex(r, g, b);
    }
  }
  return stops[stops.length - 1].color;
}

/**
 * Returns React inline styles containing background, border, and text colors.
 */
export function getCellVoltageColorStyle(
  value: number | null | undefined,
  sourceUnit?: "mV" | "V"
): React.CSSProperties {
  const mv = normalizeCellVoltageToMv(value, sourceUnit);
  if (mv === null) {
    return {
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      borderColor: "rgba(255, 255, 255, 0.1)",
      color: "rgba(255, 255, 255, 0.4)"
    };
  }

  const bgColor = interpolateCellVoltageColorMv(mv);
  const borderCol = getDarkerColor(bgColor, 0.8);
  const textColor = getInterpolatedTextColor(mv);

  return {
    backgroundColor: bgColor,
    borderColor: borderCol,
    color: textColor
  };
}
