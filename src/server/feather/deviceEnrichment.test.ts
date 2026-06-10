import * as assert from 'assert';
import { normalizeDirectFeatherStatus } from './deviceEnrichment';

console.log("Running Feather Enrichment Tests...");

function runTests() {
  const suppliedFeatherJson = {
    healthy: true,
    operationalState: "NORMAL",
    thermalData: {
      spaceTemperature: 28.7,
      spaceHumidity: 29.4,
      avgCellTemperature: 99.9,
      supplyAirTemp: 18.7,
      outsideTemperature: 36.6,
      hydrogen1PPM: 5e-324,
      thermostatStage: "LdCool_LgCoolChk2",
      running: true,
      enabled: true,
      HVAC1Data: { valid: true, hvacCurrent: 15.4 },
      HVAC2Data: { valid: true, hvacCurrent: 16.0 },
      HVAC1Controls: { valid: true },
      HVAC2Controls: { valid: true },
      fssSignals: {
        valid: true,
        fssAlarm: false,
        fssTrouble: false,
        fssAlarmOrTrouble: false,
        statXRelease: false,
        hydrogenAlarm: false,
        fireAlarm: false,
        vesdaAlarm: false,
        h2Ppm: 0
      },
      doors: {
        valid: true,
        batteryDoorsClosed: true
      }
    }
  };

  const d = normalizeDirectFeatherStatus('10.0.0.99', suppliedFeatherJson);

  assert.strictEqual(d.deviceState, "NORMAL", "State should be NORMAL");
  assert.strictEqual(d.hydrogen1PPM, 5e-324, "Hydrogen PPM should be preserved exactly");
  assert.strictEqual(d.fssSignals?.valid, true, "FSS signals should be valid");
  assert.strictEqual(d.doors?.valid, true, "Doors should be valid");
  
  // Verify derived alarms logic manually as done by component
  const warnInfo: string[] = [];
  const alarmFaults: string[] = [];
  
  if (d.fssSignals) {
    const fss = d.fssSignals;
    if (fss.fssAlarm) alarmFaults.push("FSS Alarm");
    if (fss.fssTrouble) alarmFaults.push("FSS Trouble");
    if (fss.fssAlarmOrTrouble) alarmFaults.push("FSS Alarm or Trouble");
    if (fss.statXRelease) alarmFaults.push("StatX Release");
    if (fss.hydrogenAlarm) alarmFaults.push("H2 Alarm");
    if (fss.hydrogenFault) alarmFaults.push("H2 Fault");
    if (fss.smokeAlarm) alarmFaults.push("Smoke Alarm");
    if (fss.smokeAlarmTrouble) alarmFaults.push("Smoke Alarm Trouble");
    if (fss.heatSensor) alarmFaults.push("Heat Sensor");
    if (fss.fireAlarm) alarmFaults.push("Fire Alarm");
    if (fss.fireTrouble) alarmFaults.push("Fire Trouble");
    if (fss.leakAlarm) alarmFaults.push("Leak Alarm");
    if (fss.louverOpen === false) warnInfo.push("Louver Closed");
  }
  
  assert.ok(!alarmFaults.includes("H2 Alarm"), "H2 Alarm should not be present");
  assert.ok(!alarmFaults.includes("Fire Alarm"), "Fire Alarm should not be present");
  assert.strictEqual(alarmFaults.length, 0, "No alarm faults should be present");

  console.log("Feather Enrichment tests passed!");
}

runTests();
