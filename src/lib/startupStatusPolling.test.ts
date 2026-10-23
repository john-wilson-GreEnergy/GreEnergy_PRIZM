import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';

const source=fs.readFileSync('src/App.tsx','utf8');
const start=source.indexOf('  useEffect(() => {\n    let cancelled = false;');
assert(start>0);
const effect=source.slice(start,source.indexOf('\n\n\n  const Toolbar',start));
let now=100000,reads=0,release:()=>void=()=>{},poll:()=>Promise<void>=async()=>{},cleanup:()=>void=()=>{};
const inFlight={current:false},lastPoll={current:0};
const ctx={Date:{now:()=>now},document:{hidden:false},pollInFlightRef:inFlight,lastPollRef:lastPoll,
 connectionStatusRef:{current:{status:'LIVE',reachable:true}},diagnosticSessionRef:{current:null},
 fetchAllData:()=>{reads++;return new Promise<void>(resolve=>{release=resolve;});},
 useEffect:(fn:()=>()=>void)=>{cleanup=fn();},setInterval:(fn:()=>Promise<void>)=>{poll=fn;return 1;},clearInterval:()=>{}};
vm.runInNewContext(transformSync(effect,{loader:'tsx'}).code,ctx);
assert.equal(reads,1);assert.equal(inFlight.current,true);
for(let i=0;i<4;i++){now+=2000;await poll();}
assert.equal(reads,1,'Slow startup must not launch another status sequence every two seconds');
release();await Promise.resolve();await Promise.resolve();
assert.equal(inFlight.current,false);assert.equal(lastPoll.current,now);
now+=14000;await poll();assert.equal(reads,1);
now+=1000;const later=poll();assert.equal(reads,2);await poll();assert.equal(reads,2);
release();await later;assert.equal(inFlight.current,false);
cleanup();now+=20000;await poll();assert.equal(reads,2,'Unmounted polling stays stopped');
console.log('App status polling: slow initial read is single-flight, cadence resumes normally, cleanup stops requests.');
