export const powerKeys=['commandKw','actualKw','commandKvar','actualKvar'] as const;
export type PowerKey=typeof powerKeys[number];
export type PowerValues=Record<PowerKey,number|null>;
export interface PowerSample extends PowerValues {
  at:number; observedAt:number|null; expected:number; reporting:Record<PowerKey,number>;
}
export interface DistributionPoint {
  array:number; string:number; label:string; observedAt:number|null;
  voltageMv:number|null; temperatureF:number|null; currentA:number|null; powerKw:number|null;
  socPct:number|null; stringVoltageV:number|null; busVoltageV:number|null; energyKwh:number|null;
}
export interface OperatingCharts {
  version:1; site:string; capturedAt:number; power:PowerSample[]; distribution:DistributionPoint[];
  intervalMs:number; retentionMs:number; recordingError:string|null;
}
export const operatingChartLimits={points:2880,strings:2560,intervalMs:30000,retentionMs:86400000} as const;
