import assert from 'node:assert/strict';
import { isDegradedComparedToPrevious as check } from './SiteDataContext';

const rows = Array.from({length:320}, (_,i)=>({id:i}));
const full = {normalized:{strings:rows},rollups:{arraySummary:[{arrayNumber:1}],stringSummary:{summary:{total:320}}}};
const heartbeat = {normalized:{strings:[],arrays:[]},rollups:{stringSummary:{summary:{total:320}}}};
for(const view of ['overview','pcs-dashboard','thermal-controls']) {
  assert.equal(check(heartbeat,full,view).degraded,false,view);
  assert.equal(check(heartbeat,heartbeat,view).degraded,false);
  assert.equal(check(heartbeat,full,view,false).degraded,true,'Legacy rollback reproduces prior false warning');
  assert.equal(check({warming:true},full,view).degraded,true,'Missing required containers still blocked');
  assert.equal(check({...heartbeat,rollups:{...heartbeat.rollups,arraySummary:[{arrayNumber:0,stringCount:320}]}},full,view).degraded,true,'Synthesized Array 0 remains blocked');
}
for(const view of ['arrays-strings','site-health','one-line']) {
  assert.equal(check(heartbeat,full,view).degraded,true);
  assert.equal(check({...full,normalized:{strings:rows.slice(0,20)}},full,view).degraded,true);
  assert.equal(check({...full,rollups:{...full.rollups,arraySummary:[]}},full,view).degraded,true);
  assert.equal(check(full,full,view).degraded,false);
}
assert.equal(check({...full,rollups:{...full.rollups,arraySummary:[]}},full,'advanced').degraded,true,'Non-heartbeat view retains array-row protection');
assert.equal(check(full,null,'overview').degraded,false);
console.log('View-aware snapshot quality: compact transitions, true data loss, malformed input, Array 0 and rollback passed');
