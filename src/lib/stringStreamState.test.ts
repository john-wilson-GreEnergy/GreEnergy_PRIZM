import assert from 'node:assert/strict';
import {StringStreamState} from './stringStreamState';
const row = (state = 'OPEN') => ({arrayNumber:1,stringNumber:2,contactorStatus:state,timestampUtc:'source-time',amps:0});
const snap = (version: number, epoch='one', cycleId=1) => ({transportEpoch:epoch,brokerVersion:version,cycleId,strings:[row()]});
const delta = (version: number, epoch='one') => ({transportEpoch:epoch,version,capturedAt:'publication-time',changes:[{key:'1:2',row:row('CLOSED')}]});
const state = new StringStreamState(2);
state.ready('one',10);
assert.equal(state.snapshot(snap(9)),false);
assert.equal(state.delta(delta(11)),false);
assert.equal(state.snapshot(snap(10)),true);
assert.equal(state.view?.brokerVersion,11);
assert.equal(state.view?.strings[0].contactorStatus,'CLOSED');
assert.equal(state.view?.strings[0].timestampUtc,'source-time');
const current=state.view;
assert.equal(state.snapshot(snap(10)),true);
assert.equal(state.view,current); // Old HTTP never rolls command feedback back.
assert.equal(state.delta(delta(11)),true);
assert.equal(state.view,current);
assert.equal(state.delta(delta(13)),false); // Missed version forces bootstrap.
assert.equal(state.snapshot(snap(11)),false);
assert.equal(state.snapshot(snap(12)),true);
assert.equal(state.view?.brokerVersion,13);
assert.equal(state.snapshot(snap(13,'one',2)),true); // Same broker version, fresh cycle metadata.
assert.equal(state.view?.cycleId,2);
state.ready('two',0); // Restart permits lower revision, but not an old process response.
assert.equal(state.snapshot(snap(99)),false);
assert.equal(state.snapshot(snap(1,'two')),true);
assert.equal(state.view?.transportEpoch,'two');
assert.equal(state.delta(delta(2,'one')),false);
state.disconnected();
state.delta(delta(2,'two'));state.delta(delta(3,'two'));state.delta(delta(4,'two'));
assert.equal(state.snapshot(snap(1,'two')),false); // Bounded-buffer overflow requires newer snapshot.
assert.equal(state.snapshot(snap(4,'two')),true);
assert.equal(state.delta({}),false);
assert.equal(state.recovering,true);
assert.equal(state.snapshot({...snap(5,'two'),strings:[]}),false);
assert.equal(state.snapshot(snap(5,'two')),true);
assert.throws(()=>state.ready('two',NaN));
console.log('String stream ordering, gaps, bounded buffering, restart, same-cycle metadata and command preservation passed');
