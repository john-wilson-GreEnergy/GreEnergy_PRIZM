import type {FeatherHvacDevice} from '../server/feather/deviceEnrichment';

// Display-only equality: never compare raw reports or history. Missing/null/false
// remain distinct so unavailable feedback cannot be hidden by a memoized cell.
function sameFields<T extends object>(a: T | undefined, b: T | undefined, keys: readonly (keyof T)[]): boolean {
  return a === b || (!!a && !!b && keys.every(key => Object.is(a[key], b[key])));
}
export function sameHvacDisplay(a: FeatherHvacDevice['hvac1'], b: FeatherHvacDevice['hvac1']): boolean {
  return sameFields(a,b,['fanLowOn','fanHighOn','compressorOn','reversingValveOn','electricHeatOn','currentA','fanSpeedRpm']);
}
export function sameSensorDisplay(a: FeatherHvacDevice, b: FeatherHvacDevice): boolean {
  return sameFields(a.fssSignals,b.fssSignals,['valid','fssAlarm','fssTrouble','fssAlarmOrTrouble','fireAlarm','fireTrouble','smokeAlarm','smokeAlarmTrouble','heatSensor','hydrogenAlarm','hydrogenFault','statXRelease','leakAlarm'])
    && sameFields(a.doors,b.doors,['lowerTopcapClosed','batteryDoorsClosed','acDoorsClosed','dcDoorsClosed'])
    && sameFields(a.doorApplicability,b.doorApplicability,['monitorsTopCap','monitorsBatteryDoors','monitorsAcDoors','monitorsDcDoors']);
}
export function sameFeatherRow(a: FeatherHvacDevice, b: FeatherHvacDevice): boolean {
  return sameFields(a,b,['ip','reachable','firmwareVersion','softwareVersion','arrayIndex','segmentLabel','entityDescription','deviceState','pingMs','thermostatStage','hvacRuntimeState','hvacMode','hvacStatus','hvacType','lastSuccessUtc'])
    && a.sourceCoverage?.directFeather === b.sourceCoverage?.directFeather
    && sameHvacDisplay(a.hvac1,b.hvac1) && sameHvacDisplay(a.hvac2,b.hvac2)
    && sameSensorDisplay(a,b);
}

// Same statistics as the prior table, with one pass instead of six filters.
export function featherTableStats(devices: readonly FeatherHvacDevice[]) {
  let reachable = 0, warnings = 0, alarms = 0, duration = 0;
  for (const device of devices) {
    if (device.reachable) {reachable++; duration += device.pingMs || 0;}
    if ((device.warningCount ?? 0) > 0) warnings++;
    if ((device.alarmCount ?? 0) > 0) alarms++;
  }
  return {total: devices.length, reachable, unreachable: devices.length - reachable, warnings, alarms, avgDuration: duration / (reachable || 1)};
}
