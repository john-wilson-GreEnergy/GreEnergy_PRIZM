import type { HeatMapPoint } from './types';

export const DEMO_FAN_RESULTS = Object.freeze([
  { stringIndex: 1, requested: 'ON', feedback: 'ON', result: 'PASS' },
  { stringIndex: 2, requested: 'ON', feedback: 'ON', result: 'PASS' },
  { stringIndex: 3, requested: 'ON', feedback: 'UNAVAILABLE', result: 'UNKNOWN' },
]);

export const DEMO_HVAC_SIMULATION = Object.freeze({ controller: 'DEMO-FEATHER', currentValue: '24.2 °C', simulatedValue: '31.0 °C', expectedResponse: 'Cooling demand', observedResponse: 'Preview only', result: 'NOT RUN' });

export const DEMO_HEAT_POINTS: readonly HeatMapPoint[] = Object.freeze(Array.from({ length: 12 }, (_, index) => ({
  id: `demo-string-${index + 1}`, arrayIndex: 1, stringIndex: index + 1, energySegmentIndex: Math.ceil((index + 1) / 2),
  canonicalKey: `DEMO:A1:S${index + 1}`, value: 23 + (index % 6), threshold: 'Demo threshold', warningCount: index === 8 ? 1 : 0,
  alarmCount: 0, communicating: true, stale: false, source: 'isolated-preview-fixture', demo: true, raw: {},
})));
