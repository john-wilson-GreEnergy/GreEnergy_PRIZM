import assert from 'node:assert/strict';
import {buildEngineeringAnalyticsSnapshot,buildEngineeringCellSnapshot,buildEngineeringEnvironmentalSnapshot,buildEngineeringIndex,buildEngineeringNotificationSnapshot,buildEngineeringPcsSnapshot} from './engineeringSnapshot';

const files=buildEngineeringCellSnapshot({schema:1,site:{stationCode:'BHE0021',blockIndex:1,emsBaseUrl:'http://fixture'},acquiredAt:1790593203000,reportAt:null,issues:[],strings:[
  {array:1,string:1,bpcCount:1,groupsPerBpc:2,observedAt:[1790593203000,1790593203000],millivolts:[3490,3491],temperatureF:[75.2,77],ignoredTemperatures:[]},
  {array:2,string:1,bpcCount:1,groupsPerBpc:1,observedAt:[1790593203000],millivolts:[3488],temperatureF:[null],ignoredTemperatures:[0]},
]});
assert.deepEqual(files.map(f=>f.name),['csv/cells_array_1.csv','html/cells_array_1.html','csv/cells_array_2.csv','html/cells_array_2.html','index.html']);
assert.match(files[0].body,/3490/);assert.match(files[1].body,/Cell voltage by string/);assert.match(files.at(-1)!.body,/BHE0021-1 Site Snapshot/);
const analytics=buildEngineeringAnalyticsSnapshot({site:'BHE0021-1',preparedAt:1790593203000,historical:false,metrics:[{id:'pcs-power',label:'PCS power',unit:'kW',rows:[{array:1,target:'PCS 1',position:1,value:123,low:null,high:null,observedAt:1790593203000,quality:'fresh',source:'fixture'}]}]});
assert.deepEqual(analytics.map(f=>f.name),['csv/site_metrics.csv','html/site_metrics.html']);assert.match(analytics[0].body,/pcs-power/);assert.match(analytics[1].body,/123 kW/);
const pcs=buildEngineeringPcsSnapshot({pcs:[{arrayIndex:1,pcsIndex:1,acCmdRealPowerKW:100,acRealPowerSettingKW:98,acRealPowerKW:97,electronicsAreaHumidityPct:34,dehumidificationStatus:'ON'}]});
assert.match(pcs[0].body,/command_real_kw/);assert.match(pcs[0].body,/"100","98","97"/);assert.match(pcs[1].body,/Dehumidification/iu);
assert.match(buildEngineeringEnvironmentalSnapshot({feather:[{arrayIndex:1,humidity:45}]})[0].body,/humidity/);
assert.match(buildEngineeringNotificationSnapshot({notifications:[{severity:'warning',code:'2001',name:'Fixture',source:{arrayIndex:1}}]})[0].body,/warning/);
assert.match(buildEngineeringIndex('BHE0021-1',1790593203000,[1,2]).body,/html\/pcs\.html/);
console.log('Engineering Site Snapshot cell, analytics, PCS, environmental, notification, CSV and offline HTML package passed');
