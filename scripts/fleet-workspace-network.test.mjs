import assert from 'node:assert/strict';
import {additions,removalRules} from './fleet-workspace-network.mjs';
for(const scope of ['host','ss4','fleet'])for(const item of additions(scope)){
  assert.ok(['input','output'].includes(item.chain));
  assert.match(item.rule,/tcp dport \{ 3444, 3445 \}/);
  assert.doesNotMatch(item.rule,/3000|forward|masquerade|dnat|snat/);
}
assert.throws(()=>additions('ss3'));
assert.match(additions('ss4')[0].rule,/iifname "eno8403" ip saddr 10.0.0.0\/16 ip daddr 10.0.0.15/);
const rule={family:'inet',table:'prizm_fleet_pilot',chain:'input',handle:9,comment:'prizm-workspace-https'};
assert.deepEqual(removalRules({nftables:[{rule:{...rule,comment:'keep'}},{rule}]}),['delete rule inet prizm_fleet_pilot input handle 9']);
assert.throws(()=>removalRules({nftables:[{rule:{...rule,chain:'forward'}}]}));
console.log('PASS fixed workspace ports, interface/source scope, no forwarding and exact tagged rollback');
