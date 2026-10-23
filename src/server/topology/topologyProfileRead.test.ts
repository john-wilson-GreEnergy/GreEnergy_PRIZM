import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {test} from 'node:test';
import {monitoringWorkspaceRequest} from '../fleet/workspaceAccess';
import {remoteDesktopRead} from '../fleet/remoteDesktop';

// Exercise the actual route without starting providers or touching equipment.
const source=readFileSync(new URL('./topologyRoutes.ts',import.meta.url),'utf8');
const start=source.indexOf('topologyRouter.get("/topology/active",');
const end=source.indexOf('// POST /api/local/topology/active/validate',start);
const code=transformSync(source.slice(start,end),{loader:'ts'}).code;
test('both sites retain exact profile parity without invoking discovery; legacy report remains available',()=>{
 for(const stationCode of ['BHE0020','BHE0021']){
  const profile={id:'configured',stationCode,blockIndex:1,layoutFamily:'stack750_800',uiMode:'lineup',assumptions:{arrayCount:8,energySegmentsPerArray:20,stringsPerEnergySegment:2},ipPlan:{customDevices:[]}};
  let handler:any,merges=0,body:any,status=200;const headers=new Map();
  const normalized={devices:['original report']};
  vm.runInNewContext(code,{topologyRouter:{get(_path:string,fn:any){handler=fn;}},getActiveTopologyProfile:()=>profile,mergeLiveDiscoveryIntoTopology:(p:unknown)=>{assert.equal(p,profile);merges++;return normalized;}});
  const res={json(value:unknown){body=value;},setHeader(k:string,v:string){headers.set(k,v);},status(value:number){status=value;return this;}};
  handler({query:{view:'profile'}},res);
  assert.equal(body.profile,profile);assert.equal(body.normalized,undefined);assert.equal(merges,0);assert.equal(status,200);assert.equal(headers.get('Cache-Control'),'no-store');
  const compactBytes=JSON.stringify(body).length;
  handler({query:{}},res);assert.equal(body.profile,profile);assert.equal(body.normalized,normalized);assert.equal(merges,1);assert(compactBytes<2000);
  profile.assumptions.arrayCount=4;handler({query:{view:'profile'}},res);assert.equal(body.profile.assumptions.arrayCount,4,'explicit refresh sees current configuration');
 }
});
test('passive layout read is permitted without a control unlock; no writes or new query variants admitted remotely',()=>{
 assert(monitoringWorkspaceRequest('GET','/api/local/topology/active'));
 assert(!monitoringWorkspaceRequest('POST','/api/local/topology/active'));
 assert.equal(remoteDesktopRead('GET','/api/local/topology/active?view=profile'),'/api/local/topology/active?view=profile');
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(remoteDesktopRead(method,'/api/local/topology/active?view=profile'),null);
 for(const query of ['?view=full','?refresh=true','?view=profile&view=profile'])assert.equal(remoteDesktopRead('GET','/api/local/topology/active'+query),null);
});
