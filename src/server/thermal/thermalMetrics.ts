import type { ThermalPoint } from "./thermalModel";

// Legacy HVAC Intelligence metric map, using PRIZM's canonical readings only.
export const thermalMetrics = {
  space: { label: "Enclosure temperature", unit: "°F", min: 14, max: 104 },
  supply: { label: "Supply-air temperature", unit: "°F", min: 14, max: 104 },
  cell: { label: "Average cell temperature", unit: "°F", min: 14, max: 104 },
  control: { label: "Control temperature", unit: "°F", min: 14, max: 104 },
  outside: { label: "Outside temperature", unit: "°F", min: 14, max: 104 },
  current: { label: "HVAC amperage", unit: "A", min: 0, max: 20 },
  rpm: { label: "Fan speed", unit: "RPM", min: 0, max: 3000 },
  cooling: { label: "Cooling setpoint", unit: "°F", min: 14, max: 104 },
  heating: { label: "Heating setpoint", unit: "°F", min: 14, max: 104 },
  humidity: { label: "Enclosure humidity", unit: "%", min: 0, max: 100 },
  cellRate: { label: "Cell temperature rate", unit: "°F/min", min: -1.8, max: 1.8 },
} as const;
export type ThermalMetric = keyof typeof thermalMetrics;
export type ThermalReading = { value: number | null; text: string; color: string; state: string };
export type ThermalReadings = Record<ThermalMetric, ThermalReading>;
export type ThermalDisplayValues = Record<ThermalMetric, number | null>;
// Canonical/history storage remains Celsius; only the page projection uses Fahrenheit.
export function thermalDisplayValues(point: ThermalPoint): ThermalDisplayValues {
  return Object.fromEntries(Object.entries(thermalMetrics).map(([key, definition])=>{
    const raw=point[key as ThermalMetric];
    const value=typeof raw!=="number"||!Number.isFinite(raw)?null
      : definition.unit==="°F"?raw*9/5+32:definition.unit==="°F/min"?raw*9/5:raw;
    return [key,value];
  })) as ThermalDisplayValues;
}
export function thermalReadings(point: ThermalPoint): ThermalReadings {
  const values=thermalDisplayValues(point);
  return Object.fromEntries(Object.entries(thermalMetrics).map(([key, definition]) => {
    const value = values[key as ThermalMetric];
    const state = point.quality !== "Live" ? point.quality : value === null ? "Not reported" : "Live";
    let color = "#f1f5f9";
    if (state === "Live" && value !== null) {
      if (key === "space") {
        const bands = [70, 75, 80, 85, 90];
        const colors = ["#9dc9ec", "#8fd4cc", "#a8d99b", "#f0dc7d", "#efaa68", "#e77b72"];
        const index = bands.findIndex(limit => value < limit);
        color = colors[index < 0 ? 5 : index];
      } else {
        const fraction = Math.max(0, Math.min(1, (value - definition.min) / (definition.max - definition.min)));
        color = `hsl(${145 - fraction * 105} 52% ${92 - fraction * 28}%)`;
      }
    }
    return [key, {value, state, color, text: state === "Live" ? `${value!.toFixed(key === "cellRate" ? 2 : 1)} ${definition.unit}` : state}];
  })) as ThermalReadings;
}
