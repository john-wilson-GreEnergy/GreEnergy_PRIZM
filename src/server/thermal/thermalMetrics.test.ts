import assert from "node:assert/strict";
import {thermalUnits, type ThermalDevice} from "./thermalModel";
import {thermalReadings,thermalDisplayValues} from "./thermalMetrics";
const now=Date.now();
const device:ThermalDevice={ip:"10.0.0.1",arrayIndex:1,segmentLabel:"ES1",lastSuccessUtc:new Date(now).toISOString(),
  spaceTemperatureC:30,avgCellTemperatureC:27.4,controlTemperatureC:28,outsideTemperatureC:-5,spaceHumidityPct:0,avgCellTemperatureRateCPerMin:-0.02,
  hvac1:{currentA:0},hvac2:{currentA:8}};
const units=thermalUnits([device],now);
assert.equal(units[0].point.cell,27.4);
assert.equal(units[1].point.cell,27.4); // segment reading shared; amperage remains per unit
assert.equal(thermalReadings(units[0].point).current.text,"0.0 A");
assert.equal(thermalReadings(units[1].point).current.text,"8.0 A");
assert.equal(thermalReadings(units[0].point).cellRate.text,"-0.04 °F/min");
assert.equal(thermalReadings(units[0].point).humidity.text,"0.0 %");
assert.equal(thermalReadings(units[0].point).supply.state,"Not reported");
assert.equal(thermalReadings({...units[0].point,cell:NaN}).cell.state,"Not reported");
assert.equal(thermalReadings({...units[0].point,quality:"Stale"}).current.text,"Stale");
assert.equal(thermalReadings({...units[0].point,quality:"Unavailable"}).cell.color,"#f1f5f9");
assert.equal(thermalReadings({...units[0].point,cell:undefined}).cell.text,"Not reported"); // old recordings
assert.equal(thermalReadings(units[0].point).space.color,"#efaa68");
console.log("Thermal metric quality and legacy scale tests passed");

assert.equal(thermalReadings(units[0].point).space.text,"86.0 °F");
assert.equal(thermalReadings(units[0].point).outside.text,"23.0 °F");
assert.equal(thermalDisplayValues({...units[0].point,space:0,cooling:100,cellRate:1}).space,32);
assert.equal(thermalDisplayValues({...units[0].point,cooling:100}).cooling,212);
assert.equal(thermalDisplayValues({...units[0].point,cellRate:1}).cellRate,1.8);
assert.equal(thermalReadings({...units[0].point,space:0}).space.value,32);
assert.equal(units[0].point.space,30, "Display conversion must not mutate stored Celsius");
