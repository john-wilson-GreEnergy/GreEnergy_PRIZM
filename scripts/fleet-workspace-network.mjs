/** Add/remove only authenticated workspace entry ports; never move interfaces or enable forwarding. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {realpathSync} from 'node:fs';
const exec=promisify(execFile);
const tag='prizm-workspace-https';
export function additions(scope) {
  const ports='tcp dport { 3444, 3445 }';
  const comment=`comment "${tag}"`;
  if(scope==='host')return [{chain:'output',rule:`oifname "prizm-hub" ip saddr 172.31.250.2 ip daddr 172.31.250.1 ${ports} accept ${comment}`}];
  if(scope==='ss4')return [
    {chain:'input',rule:`iifname "eno8403" ip saddr 10.0.0.0/16 ip daddr 10.0.0.15 ${ports} accept ${comment}`},
    {chain:'output',rule:`oifname "fleet0" ip saddr 172.31.250.6 ip daddr 172.31.250.5 ${ports} accept ${comment}`},
  ];
  if(scope==='fleet')return [
    {chain:'input',rule:`iifname "ss3" ip saddr 172.31.250.2 ip daddr 172.31.250.1 ${ports} accept ${comment}`},
    {chain:'input',rule:`iifname "ss4" ip saddr 172.31.250.6 ip daddr 172.31.250.5 ${ports} accept ${comment}`},
  ];
  throw Error('Unknown workspace network scope');
}
export function removalRules(inventory){
  return inventory.nftables.filter(item=>item.rule?.comment===tag).map(({rule})=>{
    if(rule.family!=='inet'||rule.table!=='prizm_fleet_pilot'||!['input','output'].includes(rule.chain)||!Number.isSafeInteger(rule.handle))throw Error('Unexpected workspace rule');
    return `delete rule inet prizm_fleet_pilot ${rule.chain} handle ${rule.handle}`;
  });
}
export async function run(action,labPrefix){
  if(process.platform!=='linux'||process.getuid()!==0||!['start','stop','check'].includes(action))throw Error('Linux root and start|stop|check required');
  if(labPrefix && !/^prizm-workspace-lab-[0-9]+$/.test(labPrefix))throw Error('Invalid disposable lab prefix');
  const scopes=[['host',labPrefix?`${labPrefix}-host`:null],['ss4',labPrefix?`${labPrefix}-ss4`:'prizm-ss4'],['fleet',labPrefix?`${labPrefix}-fleet`:'prizm-fleet']];
  const nft=async(ns,args)=>JSON.parse((await exec(ns?'ip':'nft',ns?['netns','exec',ns,'nft',...args]:args,{timeout:10000,maxBuffer:1024*1024})).stdout||'null');
  // Require all base tables before modifying any rule. No blanket flushes.
  const inventories=await Promise.all(scopes.map(([,ns])=>nft(ns,['-j','list','table','inet','prizm_fleet_pilot'])));
  if(action==='stop'){
    for(const [i,[,ns]] of scopes.entries())for(const line of removalRules(inventories[i]))await nft(ns,[line]);
    return;
  }
  if(inventories.some(i=>removalRules(i).length))throw Error('Workspace rules already installed; stop before replacing');
  for(const [scope,ns] of scopes)for(const {chain,rule} of additions(scope))await nft(ns,['-c',`insert rule inet prizm_fleet_pilot ${chain} ${rule}`]);
  if(action==='check')return;
  try {for(const [scope,ns] of scopes)for(const {chain,rule} of additions(scope))await nft(ns,[`insert rule inet prizm_fleet_pilot ${chain} ${rule}`]);}
  catch(error){await run('stop',labPrefix);throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href){
  const [action,labPrefix,...extra]=process.argv.slice(2);
  if(extra.length)throw Error('Unexpected arguments');
  await run(action,labPrefix);
  console.log(`Workspace firewall ${action} complete`);
}
