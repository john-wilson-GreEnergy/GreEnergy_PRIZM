import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlan} from './fleet-network-lifecycle.mjs';
const plan = () => ({mode:'disposable-veth-lab',prefix:'prizm-life-123',parent:'prizm-life-123-parent',stateFile:'/tmp/private-lab/journal.json',ports:[
  {name:'port3',mac:'02:00:00:00:00:03',originalAddress:'10.0.0.15/16'},
  {name:'port4',mac:'02:00:00:00:00:04',originalAddress:'192.168.1.16/16'}]});
test('accepts only the explicit disposable fixture plan and returns a copy', () => {
  const p=plan(); assert.deepEqual(validatePlan(p),p); assert.notEqual(validatePlan(p),p);
});
test('rejects production interfaces, non-lab names and wrong original addresses', () => {
  for (const change of [p=>p.mode='production',p=>p.prefix='prizm',p=>p.parent='host',p=>p.stateFile='relative.json',
    p=>p.ports[0].name='eno8303',p=>p.ports[0].mac='c4:5a:b1:c9:2e:03',p=>p.ports[1].originalAddress='10.0.0.15/16',
    p=>p.ports[1].mac=p.ports[0].mac,p=>p.ports.pop()]) {
    const p=plan();change(p);assert.throws(()=>validatePlan(p));
  }
});
