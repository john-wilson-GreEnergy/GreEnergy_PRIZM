/** Disposable Linux namespaces only; validates actual nft parser, opt-in and exact rollback. */
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {run} from './fleet-workspace-network.mjs';
import {productionPlan,hostRules,siteRules,fleetRules} from './fleet-pilot-network.mjs';
if(process.platform!=='linux'||process.getuid()!==0||process.argv[2]!=='--disposable-lab')throw Error('Explicit Linux root disposable lab required');
const prefix=`prizm-workspace-lab-${process.pid}`,owned=[];
const cmd=(bin,args)=>execFileSync(bin,args,{encoding:'utf8',timeout:15000});
const nft=(ns,args)=>cmd('ip',['netns','exec',ns,'nft',...args]);
const normalize=s=>s.replace(/# handle \d+/g,'');
try{
  for(const [scope,rules] of [['host',hostRules(productionPlan())],['ss4',siteRules(productionPlan())],['fleet',fleetRules]]){
    const ns=prefix+'-'+scope;cmd('ip',['netns','add',ns]);owned.push(ns);nft(ns,[rules]);
  }
  const before=owned.map(n=>normalize(nft(n,['-s','list','ruleset'])));
  await run('check',prefix);
  assert.deepEqual(owned.map(n=>normalize(nft(n,['-s','list','ruleset']))),before);
  await run('start',prefix);
  await assert.rejects(run('start',prefix),/already installed/);
  for(const n of owned){
    const inventory=JSON.parse(nft(n,['-j','list','ruleset']));
    const changes=inventory.nftables.filter(x=>x.rule?.comment==='prizm-workspace-https');
    assert.ok(changes.length>=1);
    assert.ok(changes.every(x=>x.rule.chain!=='forward'));
  }
  await run('stop',prefix);await run('stop',prefix);
  assert.deepEqual(owned.map(n=>normalize(nft(n,['-s','list','ruleset']))),before);
  console.log('PASS Linux nft dry-run, install, duplicate refusal, forwarding untouched, exact rollback and idempotent stop');
}finally{for(const ns of owned.reverse())cmd('ip',['netns','delete',ns]);}
