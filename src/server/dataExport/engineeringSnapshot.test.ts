import assert from 'node:assert/strict';
import {buildEngineeringCellSnapshot} from './engineeringSnapshot';

const files=buildEngineeringCellSnapshot({schema:1,site:{stationCode:'BHE0021',blockIndex:1,emsBaseUrl:'http://fixture'},acquiredAt:1790593203000,reportAt:null,issues:[],strings:[
  {array:1,string:1,bpcCount:1,groupsPerBpc:2,observedAt:[1790593203000,1790593203000],millivolts:[3490,3491],temperatureF:[75.2,77],ignoredTemperatures:[]},
  {array:2,string:1,bpcCount:1,groupsPerBpc:1,observedAt:[1790593203000],millivolts:[3488],temperatureF:[null],ignoredTemperatures:[0]},
]});
assert.deepEqual(files.map(f=>f.name),['csv/cells_array_1.csv','html/cells_array_1.html','csv/cells_array_2.csv','html/cells_array_2.html','index.html']);
assert.match(files[0].body,/3490/);assert.match(files[1].body,/Cell voltage by string/);assert.match(files.at(-1)!.body,/BHE0021-1 Site Snapshot/);
console.log('Engineering point-in-time cell matrix, CSV and offline HTML package passed');
