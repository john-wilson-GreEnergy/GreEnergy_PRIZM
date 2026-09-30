import assert from 'node:assert/strict';
import {buildArrayCellMetrics} from './arrayCellMetrics';

const first = {arrayNumber:1,stringNumber:1,minCellTempC:0,avgCellTempC:2,maxCellTempC:4,minCellVoltageMv:3200,avgCellVoltageMv:3210,maxCellVoltageMv:3220,deltaCellVoltageMv:20};
const second = {...first,stringNumber:2,minCellTempC:10,avgCellTempC:12,maxCellTempC:14,minCellVoltageMv:3300,avgCellVoltageMv:3310,maxCellVoltageMv:3320};
const [full] = buildArrayCellMetrics([first,second,first], [{arrayIndex:1,stringCount:2}]);
assert.deepEqual(full.temperatureC, {minimum:0,maximum:14,average:7,delta:14,reportingStrings:2,expectedStrings:2,partial:false});
assert.equal(full.voltageMv.delta,120); // NOT the maximum within-string delta (20).
assert.equal(full.voltageMv.average,3260);
assert.equal(full.averageBasis,'mean-of-string-averages');
const [partial,empty] = buildArrayCellMetrics([first,{...second,communicating:false},{...second,stringNumber:3,stalePreserved:true},{...second,stringNumber:4,badReport:true}], [{arrayNumber:1,stringCount:5},{arrayNumber:2,stringCount:40}]);
assert.equal(partial.voltageMv.reportingStrings,1);
assert.equal(partial.voltageMv.expectedStrings,5);
assert.equal(partial.voltageMv.partial,true);
assert.equal(empty.voltageMv.average,null);
assert.equal(empty.temperatureC.delta,null);
const [invalid] = buildArrayCellMetrics([{...first,minCellTempC:false,avgCellVoltageMv:null},{...second,minCellTempC:20,avgCellVoltageMv:Infinity}],[]);
assert.equal(invalid.temperatureC.reportingStrings,0);
assert.equal(invalid.voltageMv.delta,null);
assert.deepEqual(buildArrayCellMetrics(null,null),[]);
assert.equal(buildArrayCellMetrics([{...first,arrayNumber:2},{...second,rotationStatus:'OUT',positiveContactorClosed:false}],[]).length,2);
console.log('Array-wide cell metrics: extrema across strings, mean, coverage, missing values and identity passed');
