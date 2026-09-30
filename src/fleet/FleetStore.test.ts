import assert from 'node:assert/strict';
import {FleetStore} from './FleetStore';
import {FleetBroker} from '../server/fleet/FleetBroker';
const broker=new FleetBroker([{siteId:'test',blockId:'1',stationCode:'TEST',blockIndex:1,name:'Fixture'}]);
let resolveSummary:((response:Response)=>void)|undefined;
const store=new FleetStore(async url=>{
  if(String(url).endsWith('/session'))return Response.json({email:'test@example.test',csrf:'fixture',simulated:true});
  if(String(url).endsWith('/summary'))return new Promise<Response>(resolve=>{resolveSummary=resolve;});
  return Response.json({authenticated:false});
});
await store.start();assert(store.getSnapshot().session);assert(resolveSummary);
await store.logout();
resolveSummary!(Response.json(broker.view(new Set(['test']))));
await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(store.getSnapshot().view,null,'Late pre-logout response must not reintroduce telemetry');
assert.equal(store.getSnapshot().session,null);store.stop();
const failed=new FleetStore(async url=>String(url).endsWith('/session')?Response.json({email:'test@example.test',csrf:'fixture'}):new Response('',{status:503}));
await failed.start();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(failed.getSnapshot().view,null);assert.match(failed.getSnapshot().error!,/withheld/);failed.stop();
console.log('Fleet browser store session isolation and failure visibility tests passed');
const originalFetch=globalThis.fetch;
try{
  globalThis.fetch=async function(){assert.equal(this,undefined,'Native browser fetch must not receive the store as its receiver');return new Response('',{status:401});};
  const native=new FleetStore();await native.start();native.stop();assert.equal(native.getSnapshot().session,null);
}finally{globalThis.fetch=originalFetch;}
