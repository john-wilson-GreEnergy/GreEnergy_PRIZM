import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parsePlan,productionPlan,hostRules,siteRules,fleetRules,parseNamespaceList} from './fleet-pilot-network.mjs';
assert.deepEqual(parseNamespaceList(''),[]);
assert.deepEqual(parseNamespaceList(' \n'),[]);
assert.deepEqual(parseNamespaceList('[]'),[]);
assert.deepEqual(parseNamespaceList('[{"name":"prizm-ss4"}]'),[{name:'prizm-ss4'}]);
assert.throws(()=>parseNamespaceList('{invalid'));
assert.throws(()=>parseNamespaceList('{}'));
const p=productionPlan();
assert.equal(p.port,'eno8403');assert.equal(p.parent,null);
for(const change of [p=>p.port='eno8303',p=>p.mac='c4:5a:b1:c9:2e:03',p=>p.prefix='other',p=>p.hostLink='eno8303',p=>p.journal='/etc/passwd']){
  const v=structuredClone(p);change(v);assert.throws(()=>parsePlan(v));
}
assert.match(hostRules(p),/iifname "prizm-hub" counter drop/);
assert.match(hostRules(p),/oifname "prizm-hub" counter drop/);
assert.match(siteRules(p),/eno8403/);assert.doesNotMatch(siteRules(p),/eno8303/);
assert.match(fleetRules,/chain forward.*policy drop; counter drop/);
console.log('PASS staged network locks the SS4 physical identity and scopes host firewall rules to the dedicated virtual link');
const rollback=await readFile(new URL('./fleet-pilot-rollback.mjs',import.meta.url),'utf8');
assert.match(rollback,/\['disable',\.\.\.units,'prizm-fleet-network\.service'\]/);
assert.ok(rollback.indexOf("['disable'")<rollback.indexOf("['stop'"),'Disable boot activation before stopping services');
const network=await readFile(new URL('./fleet-pilot-network.mjs',import.meta.url),'utf8');
assert.match(network,/realpathSync\(process\.argv\[1\]\)/,'Release symlink must execute the CLI');
assert.match(network,/await chmod\(unmanaged,0o644\)/,'networkd must read the non-secret runtime override despite private service umask');
console.log('PASS persistent rollback and release-symlink/network-manager regression guards');
