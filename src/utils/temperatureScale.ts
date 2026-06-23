import React from "react";

export type TemperatureUnit = "C" | "F";

/**
 * Converts Celsius to Fahrenheit.
 */
export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

/**
 * Converts Fahrenheit to Celsius.
 */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

/**
 * Normalize an input temperature (which can be raw Celsius or Fahrenheit) to Celsius.
 * Defaults to Celsius sourceUnit unless sourceUnit is explicitly "F".
 */
export function normalizeTemperatureToCelsius(
  value: number | null | undefined,
  sourceUnit?: TemperatureUnit
): number | null {
  if (value === null || value === undefined || isNaN(value)) return null;
  // Assume Celsius raw source values unless sourceUnit is F
  if (sourceUnit === "F") {
    return fahrenheitToCelsius(value);
  }
  return value;
}

/**
 * Normalize an input temperature to Fahrenheit.
 * Defaults to Celsius sourceUnit unless sourceUnit is explicitly "F".
 */
export function normalizeTemperatureToFahrenheit(
  value: number | null | undefined,
  sourceUnit?: TemperatureUnit
): number | null {
  if (value === null || value === undefined || isNaN(value)) return null;
  if (sourceUnit === "F") {
    return value;
  }
  return celsiusToFahrenheit(value);
}

/**
 * Formats a temperature value into Fahrenheit string.
 * It normalizes the value from its source unit (defaults to 'C' if not specified) to Fahrenheit first.
 */
export function formatTemperatureF(
  value: number | null | undefined,
  options?: { decimals?: number; showUnit?: boolean; sourceUnit?: TemperatureUnit }
): string {
  if (value === null || value === undefined || isNaN(value)) return "--";
  const sourceUnit = options?.sourceUnit ?? "C";
  const fValue = normalizeTemperatureToFahrenheit(value, sourceUnit);
  if (fValue === null) return "--";

  const decimals = options?.decimals !== undefined ? options.decimals : 1;
  const showUnit = options?.showUnit !== undefined ? options.showUnit : true;
  return `${fValue.toFixed(decimals)}${showUnit ? "°F" : ""}`;
}

interface ColorAnchor {
  tempC: number;
  r: number;
  g: number;
  b: number;
  textCol: string;
  borderR: number;
  borderG: number;
  borderB: number;
}

// Stated anchors from instructions:
// 5°C / 41°F: coldest endpoint -> light blue
// 15°C / 59°F: blue
// 24.9°C / 76.8°F: darker blue / teal transition
// 25°C / 77°F: green normal
// 30°C / 86°F: green normal upper boundary
// 35°C / 95°F: yellow
// 40°C / 104°F: orange
// 45°C / 113°F: orange-red
// 50°C / 122°F: red
// 55°C / 131°F: deep red / max hot endpoint
const scaleAnchors: ColorAnchor[] = [
  { tempC: 5, r: 147, g: 197, b: 253, textCol: "#0f172a", borderR: 125, borderG: 175, borderB: 235 }, // light blue
  { tempC: 15, r: 59, g: 130, b: 246, textCol: "#ffffff", borderR: 39, borderG: 110, borderB: 226 }, // blue
  { tempC: 24.9, r: 13, g: 148, b: 136, textCol: "#ffffff", borderR: 3, borderG: 128, borderB: 116 }, // teal transition
  { tempC: 25, r: 16, g: 185, b: 129, textCol: "#ffffff", borderR: 6, borderG: 165, borderB: 109 }, // green
  { tempC: 30, r: 16, g: 185, b: 129, textCol: "#ffffff", borderR: 6, borderG: 165, borderB: 109 }, // green upper limit
  { tempC: 35, r: 234, g: 179, b: 8, textCol: "#0f172a", borderR: 214, borderG: 159, borderB: 0 }, // yellow
  { tempC: 40, r: 249, g: 115, b: 22, textCol: "#ffffff", borderR: 229, borderG: 95, borderB: 2 }, // orange
  { tempC: 45, r: 239, g: 68, b: 68, textCol: "#ffffff", borderR: 219, borderG: 48, borderB: 48 }, // orange-red
  { tempC: 50, r: 185, g: 28, b: 28, textCol: "#ffffff", borderR: 165, borderG: 8, borderB: 8 }, // red
  { tempC: 55, r: 127, g: 29, b: 29, textCol: "#ffffff", borderR: 107, borderG: 9, borderB: 9 } // deep red / max hot
];

/**
 * Computes interpolated rgb value, text color, and border rgb value for a Celsius temperature.
 */
function interpolateColor(tempC: number) {
  if (tempC <= 5) {
    return scaleAnchors[0];
  }
  if (tempC >= 55) {
    return scaleAnchors[scaleAnchors.length - 1];
  }
  for (let i = 0; i < scaleAnchors.length - 1; i++) {
    const start = scaleAnchors[i];
    const end = scaleAnchors[i + 1];
    if (tempC >= start.tempC && tempC <= end.tempC) {
      const ratio = (tempC - start.tempC) / (end.tempC - start.tempC);
      const r = Math.round(start.r + (end.r - start.r) * ratio);
      const g = Math.round(start.g + (end.g - start.g) * ratio);
      const b = Math.round(start.b + (end.b - start.b) * ratio);
      const borderR = Math.round(start.borderR + (end.borderR - start.borderR) * ratio);
      const borderG = Math.round(start.borderG + (end.borderG - start.borderG) * ratio);
      const borderB = Math.round(start.borderB + (end.borderB - start.borderB) * ratio);
      const textCol = ratio < 0.5 ? start.textCol : end.textCol;
      return { tempC, r, g, b, textCol, borderR, borderG, borderB };
    }
  }
  return scaleAnchors[scaleAnchors.length - 1];
}

/**
 * Returns a bucket token name for a temperature based on its Celsius-equivalent value.
 */
export function getTemperatureColorToken(
  value: number | null | undefined,
  sourceUnit?: TemperatureUnit
): string {
  const tempC = normalizeTemperatureToCelsius(value, sourceUnit);
  if (tempC === null || tempC === undefined || isNaN(tempC)) return "unknown";
  if (tempC <= 5) return "coldest";
  if (tempC <= 15) return "cold";
  if (tempC < 25) return "cool-normal";
  if (tempC <= 30) return "normal";
  if (tempC <= 35) return "elevated";
  if (tempC <= 40) return "orange";
  if (tempC <= 45) return "orange-red";
  if (tempC <= 50) return "red";
  return "critical";
}

/**
 * Returns a CSS style object containing background, border, and text colors corresponding to the standardized scale.
 */
export function getTemperatureColorStyle(
  value: number | null | undefined,
  sourceUnit?: TemperatureUnit
): React.CSSProperties {
  const tempC = normalizeTemperatureToCelsius(value, sourceUnit);
  if (tempC === null || tempC === undefined || isNaN(tempC)) {
    return {
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      borderColor: "rgba(255, 255, 255, 0.1)",
      color: "rgba(255, 255, 255, 0.4)"
    };
  }
  const color = interpolateColor(tempC);
  return {
    backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})`,
    borderColor: `rgb(${color.borderR}, ${color.borderG}, ${color.borderB})`,
    color: color.textCol
  };
}
