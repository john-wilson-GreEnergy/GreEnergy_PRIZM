import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {CollectorPoller, type Collector} from './CollectorPoller';
import {CollectorExport} from './collectorExport';
import {FleetBroker} from './FleetBroker';
import {FleetStore} from '../../fleet/FleetStore';

const site = {siteId:'test',blockId:'1',stationCode:'TEST',blockIndex:1,name:'Fixture'};
const collector:Collector = {...site,url:'https://example.invalid/api/fleet/site-summary',token:'x'.repeat(43)};
const flush = async () => { for(let i=0;i<30;i++) await Promise.resolve(); };
mock.timers.enable({apis:['setTimeout','setInterval']});
const original = process.env.PRIZM_FLEET_REFRESH_MS;
try {
  process.env.PRIZM_FLEET_REFRESH_MS='1000';
  const broker = new FleetBroker([site]);
  let calls=0, release!:()=>void;
  const poller = new CollectorPoller(broker,[collector],async()=>{
    calls++;
    await new Promise<void>(resolve=>{release=resolve;});
    throw Error('fixture unavailable');
  });
  poller.start(); mock.timers.tick(0); await flush();
  mock.timers.tick(2000); await flush(); assert.equal(calls,1,'slow reads cannot overlap');
  release(); await flush();
  mock.timers.tick(999); await flush(); assert.equal(calls,1);
  mock.timers.tick(1); await flush(); assert.equal(calls,2,'configured one-second collector cadence');
  release(); await flush(); await poller.stop();
  mock.timers.tick(10000); await flush(); assert.equal(calls,2,'stop cancels subsequent reads');

  let preparations=0;
  const exporter=new CollectorExport({identity:{...site,profileId:'fixture',emsBaseUrl:'http://127.0.0.1'},token:collector.token,host:'localhost',allowLoopbackHttp:true},()=>{preparations++;return {};},()=>true);
  exporter.start();assert.equal(preparations,1);
  mock.timers.tick(1000);assert.equal(preparations,2,'configured projection cadence');
  exporter.stop();mock.timers.tick(1000);assert.equal(preparations,2);

  let summaries=0, finish!:(response:Response)=>void;
  const store=new FleetStore(async url=>String(url).endsWith('/session')
    ? Response.json({email:'test@example.test',csrf:'fixture',refreshIntervalMs:1000})
    : new Promise<Response>(resolve=>{summaries++;finish=resolve;}));
  await store.start();mock.timers.tick(2000);await flush();assert.equal(summaries,1);
  finish(Response.json(broker.view(new Set(['test']))));await flush();
  mock.timers.tick(999);await flush();assert.equal(summaries,1);
  mock.timers.tick(1);await flush();assert.equal(summaries,2,'server-selected browser cadence');
  store.stop();finish(Response.json(broker.view(new Set(['test']))));await flush();
  mock.timers.tick(10000);await flush();assert.equal(summaries,2);
} finally {
  mock.timers.reset();
  if(original===undefined)delete process.env.PRIZM_FLEET_REFRESH_MS;else process.env.PRIZM_FLEET_REFRESH_MS=original;
}
console.log('Fleet cadence: one-second delivery, non-overlap and shutdown passed');
