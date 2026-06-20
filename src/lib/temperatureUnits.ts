export type TemperatureSourceKind =
  | "deci-celsius"
  | "celsius"
  | "compact"
  | "unknown";

export function cToF(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

export function normalizeRichTemp(raw: any): {
  raw: number | null;
  celsius: number | null;
  fahrenheit: number | null;
  sourceKind: TemperatureSourceKind;
} {
  if (raw === null || raw === undefined || raw === "") {
    return {
      raw: null,
      celsius: null,
      fahrenheit: null,
      sourceKind: "unknown"
    };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return {
      raw: null,
      celsius: null,
      fahrenheit: null,
      sourceKind: "unknown"
    };
  }
  // Rough heuristic: if abs(raw) > 100 it's likely deci-celsius.
  const celsius = Math.abs(n) > 100 ? n / 10 : n;
  const sourceKind: TemperatureSourceKind =
    Math.abs(n) > 100 ? "deci-celsius" : "celsius";
  return {
    raw: n,
    celsius,
    fahrenheit: cToF(celsius),
    sourceKind
  };
}

export function formatFahrenheit(value: number | null): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "--"
    : `${value.toFixed(1)}°F`;
}

export function formatCelsius(value: number | null): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "--"
    : `${value.toFixed(1)}°C`;
}
