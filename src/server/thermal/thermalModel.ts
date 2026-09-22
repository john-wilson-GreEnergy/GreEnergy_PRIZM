// Canonical Feather fields only: no raw payload parsing or device acquisition.
export type ThermalMode = "Heating" | "Cooling" | "Idle" | "Unknown";
export type ThermalSegmentType = "CS" | "ES" | "UNKNOWN";
// Use mapped segment identity, never an IP suffix or a temperature threshold.
export function thermalSegmentType(label: string, declared?: string): ThermalSegmentType {
  if (declared === "CS" || declared === "ES") return declared;
  if (/\bCS(?:\s*\d+)?\b|\bCollection\s+Segment\b/i.test(label)) return "CS";
  if (/\bES(?:\s*\d+)?\b|\bEnergy\s+Segment\b/i.test(label)) return "ES";
  return "UNKNOWN";
}
export function applicableThermalPoint(point: ThermalPoint, segmentType = point.segmentType): ThermalPoint {
  return segmentType === "CS" ? {...point, segmentType, cell:null, cellRate:null} : {...point, segmentType};
}
export type ThermalPoint = {
  segmentType?: ThermalSegmentType;
  at: number; space: number | null; supply: number | null; current: number | null;
  cell?: number | null; control?: number | null; outside?: number | null; humidity?: number | null; cellRate?: number | null;
  rpm: number | null; cooling: number | null; heating: number | null;
  commands?: {compressor:boolean|null;electricHeat:boolean|null;reversingValve:boolean|null;fanLow:boolean|null;fanHigh:boolean|null};
  faults?: string[];
  mode: ThermalMode; quality: "Live" | "Stale" | "Unavailable";
};
export type ThermalUnit = {
  id: string; array: number; segment: string; unit: number; ip: string;
  label: string; point: ThermalPoint; faults: string[];
};
type Hvac = { controlsValid?: boolean; dataValid?: boolean; compressorOn?: boolean;
  electricHeatOn?: boolean; fanLowOn?:boolean; fanHighOn?:boolean; reversingValveOn?: boolean; currentA?: number;
  fanSpeedRpm?: number; freezeDetected?: boolean };
export type ThermalDevice = {
  topology?: {segmentType?: string}; segmentType?: string;
  ip?: string; arrayIndex?: number; segmentLabel?: string; lastSuccessUtc?: string;
  reachable?: boolean; communicating?: boolean; hvac1?: Hvac; hvac2?: Hvac;
  spaceTemperatureC?: number; supplyAirTempC?: number; coolingSetpointC?: number;
  avgCellTemperatureC?: number; controlTemperatureC?: number; outsideTemperatureC?: number;
  spaceHumidityPct?: number; avgCellTemperatureRateCPerMin?: number;
  heatingSetpointC?: number; faultMessages?: string[];
};
const finite = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
export function thermalUnits(devices: ThermalDevice[], now: number): ThermalUnit[] {
  return devices.filter(d => d.ip && d.arrayIndex && d.segmentLabel).flatMap(d => [1, 2].map(unit => {
    const h = unit === 1 ? d.hvac1 : d.hvac2;
    const segmentType = thermalSegmentType(d.segmentLabel!, d.topology?.segmentType ?? d.segmentType);
    const at = Date.parse(d.lastSuccessUtc ?? "");
    const quality: ThermalPoint["quality"] = !h || d.reachable === false || d.communicating === false || h.controlsValid === false || h.dataValid === false
      ? "Unavailable" : !Number.isFinite(at) || now - at > 120000 || at > now + 30000 ? "Stale" : "Live";
    // Only assert a thermal mode when its defining command bits are reported.
    const mode: ThermalMode = h?.electricHeatOn === true ? "Heating"
      : h?.compressorOn === true ? h.reversingValveOn === true ? "Heating" : h.reversingValveOn === false ? "Cooling" : "Unknown"
      : h?.compressorOn === false && h.electricHeatOn === false ? "Idle" : "Unknown";
    return {
      id: `${d.ip}/hvac/${unit}`, array: d.arrayIndex!, segment: d.segmentLabel!, unit, ip: d.ip!,
      label: `Array ${d.arrayIndex} · ${d.segmentLabel} · HVAC ${unit}`,
      point: { commands:{compressor:h?.compressorOn??null,electricHeat:h?.electricHeatOn??null,reversingValve:h?.reversingValveOn??null,fanLow:h?.fanLowOn??null,fanHigh:h?.fanHighOn??null}, faults:[...(h?.freezeDetected?["Freeze detected"]:[]),...(d.faultMessages??[])], at: Number.isFinite(at) ? at : now, quality, mode,
        space: finite(d.spaceTemperatureC), supply: finite(d.supplyAirTempC),
        segmentType, cell: segmentType === "CS" ? null : finite(d.avgCellTemperatureC), control: finite(d.controlTemperatureC), outside: finite(d.outsideTemperatureC),
        humidity: finite(d.spaceHumidityPct), cellRate: segmentType === "CS" ? null : finite(d.avgCellTemperatureRateCPerMin),
        current: finite(h?.currentA), rpm: finite(h?.fanSpeedRpm),
        cooling: finite(d.coolingSetpointC), heating: finite(d.heatingSetpointC) },
      faults: [...(h?.freezeDetected ? ["Freeze detected"] : []), ...(d.faultMessages ?? []).map(m => `Controller: ${m}`)]
    };
  })).sort((a,b) => a.array-b.array || a.segment.localeCompare(b.segment, undefined, {numeric:true}) || a.unit-b.unit);
}

// Ported from HVAC Intelligence's ThermalQueryService. All values are Celsius.
export function supplyResponse(point: ThermalPoint, transitionAt: number | null): string {
  if (point.quality !== "Live") return "Telemetry unavailable / stale";
  if (point.mode === "Unknown") return "Command state not reported";
  if (point.mode === "Idle") return "No active thermal demand";
  if (point.space === null || point.supply === null) return "Temperature not reported";
  if (transitionAt === null || point.at - transitionAt < 180000) return "Response stabilizing (3 minutes)";
  const delta = point.supply - point.space;
  const levels = point.mode === "Cooling" ? [-delta, 8.3, 5.6, 2.8] : [delta, 11.1, 5.6, 2.8];
  return levels[0] >= levels[1] ? "Strong response" : levels[0] >= levels[2] ? "Normal response"
    : levels[0] >= levels[3] ? "Marginal response" : levels[0] >= 0 ? "Weak response" : "Abnormal response";
}
