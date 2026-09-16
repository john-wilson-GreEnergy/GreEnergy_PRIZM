export interface FeatherTrendSample {
  timestamp: string;
  timeLabel: string;
  deviceIp?: string;
  reachable?: boolean;
  hvac1Current: number;
  hvac2Current: number;
  hvac1Rpm: number;
  hvac2Rpm: number;
  spaceTemp: number | null;
  cellTemp: number | null;
  supplyTemp: number | null;
  returnTemp: number | null;
  outsideTemp: number | null;
  hvac1: Record<string, unknown>;
  hvac2: Record<string, unknown>;
  temperatures: Record<string, unknown>;
  sensors: Record<string, unknown>;
  raw: unknown;
}

const toFahrenheit = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value * 1.8 + 32 : null;

const firstNumber = (...values: unknown[]): number | null => {
  const value = values.find(candidate => typeof candidate === "number" && Number.isFinite(candidate));
  return typeof value === "number" ? value : null;
};

const getHvacSampleDetails = (hvac: any): Record<string, unknown> => {
  const unit = hvac || {};
  const hasCommand = !!(unit.fanLowOn || unit.fanHighOn || unit.compressorOn || unit.electricHeatOn || unit.reversingValveOn);
  const hasActivity = Number(unit.currentA || 0) > 0.2 || Number(unit.fanSpeedRpm || 0) > 0;
  return {
    fanLowCommanded: unit.fanLowOn ?? null,
    fanLowCurrent: unit.fanLowOn == null ? null : (unit.fanLowOn ? hasActivity : hasActivity && !hasCommand),
    fanHighCommanded: unit.fanHighOn ?? null,
    fanHighCurrent: unit.fanHighOn == null ? null : (unit.fanHighOn ? hasActivity : hasActivity && !hasCommand),
    compressorCommanded: unit.compressorOn ?? null,
    compressorCurrent: unit.compressorOn == null ? null : (unit.compressorOn ? Number(unit.currentA || 0) > 8 : hasActivity && !hasCommand),
    reversingValveCommanded: unit.reversingValveOn ?? null,
    reversingValveCurrent: unit.reversingValveOn == null ? null : (unit.reversingValveOn ? hasActivity : hasActivity && !hasCommand),
    electricHeatCommanded: unit.electricHeatOn ?? null,
    electricHeatCurrent: unit.electricHeatOn == null ? null : (unit.electricHeatOn ? hasActivity : hasActivity && !hasCommand),
    currentA: unit.currentA ?? null,
    fanSpeedRpm: unit.fanSpeedRpm ?? null,
    mode: unit.mode ?? null,
    responding: unit.dataValid ?? false
  };
};

export function createFeatherTrendSample(device: any, capturedAt: string): FeatherTrendSample {
  const thermal = device?.thermal || {};
  const spaceC = firstNumber(device?.spaceTemperatureC, thermal.spaceTemperature);
  const cellC = firstNumber(device?.avgCellTemperatureC, device?.temperatureCellC, thermal.avgCellTemperature);
  const supplyC = firstNumber(device?.supplyAirTempC, device?.temperatureSupplyC, thermal.supplyAirTemp);
  const returnC = firstNumber(device?.returnAirTempC, device?.temperatureReturnC, thermal.returnAirTemp);
  const outsideC = firstNumber(device?.outsideTemperatureC, thermal.outsideTemperature);
  const date = new Date(capturedAt);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return {
    timestamp: safeDate.toISOString(),
    timeLabel: safeDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    deviceIp: device?.ip || device?.deviceIp,
    reachable: !!device?.reachable,
    hvac1Current: device?.hvac1?.currentA ?? 0,
    hvac2Current: device?.hvac2?.currentA ?? 0,
    hvac1Rpm: device?.hvac1?.fanSpeedRpm ?? 0,
    hvac2Rpm: device?.hvac2?.fanSpeedRpm ?? 0,
    spaceTemp: toFahrenheit(spaceC),
    cellTemp: toFahrenheit(cellC),
    supplyTemp: toFahrenheit(supplyC),
    returnTemp: toFahrenheit(returnC),
    outsideTemp: toFahrenheit(outsideC),
    hvac1: getHvacSampleDetails(device?.hvac1),
    hvac2: getHvacSampleDetails(device?.hvac2),
    temperatures: { spaceTempC: spaceC, cellTempC: cellC, supplyAirTempC: supplyC, returnAirTempC: returnC, outsideTempC: outsideC },
    sensors: { doors: device?.doors ?? null, fssSignals: device?.fssSignals ?? null },
    raw: device?.raw ?? null
  };
}

export function appendSharedFeatherSample(samples: FeatherTrendSample[], device: any, capturedAt: string, limit = 300): FeatherTrendSample[] {
  const next = createFeatherTrendSample(device, capturedAt);
  const last = samples[samples.length - 1];
  if (last?.timestamp === next.timestamp && last?.deviceIp === next.deviceIp) return samples;
  return [...samples, next].slice(-limit);
}
