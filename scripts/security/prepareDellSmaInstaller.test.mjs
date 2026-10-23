import assert from 'node:assert/strict';
import {sites,installerManifest} from './prepareDellSmaInstaller.mjs';
for(const p of sites){
  const original={version:1,stationCode:p.station,blockCode:'B1',targets:p.arrays.map(array=>({array,host:`10.0.${array}.118`,deviceId:String(100+array),fingerprint256:Array(32).fill('AA').join(':'),userLevel:0}))};
  const copy=structuredClone(original),next=installerManifest(p,original);
  assert.deepEqual(original,copy);assert(next.targets.every(t=>t.userLevel===1));
  assert.deepEqual(next.targets.map(({userLevel,...t})=>t),original.targets.map(({userLevel,...t})=>t));
  for(const alter of [m=>m.stationCode='wrong',m=>m.targets[0].password='not-allowed',m=>m.targets[0].host='10.0.99.118',m=>m.targets[0].userLevel=1,m=>m.targets.pop(),m=>m.targets[1].deviceId=m.targets[0].deviceId]){
    const bad=structuredClone(original);alter(bad);assert.throws(()=>installerManifest(p,bad));
  }
}
assert.deepEqual(sites.map(p=>p.arrays),[[2,3,4,5,6,7,8],[1,2,3,4,5,6,7]]);
console.log('PASS Installer-only role correction, pinned identities, fixed 14-target scope, deferred units, no manifest secrets, prior manifest preservation');
