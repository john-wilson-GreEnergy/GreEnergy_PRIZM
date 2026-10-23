/** One-time configuration after the approved SS4 move and live identity checks. */
import {readFile,writeFile,mkdir,chown,lstat} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
if(process.getuid?.()!==0||process.argv[2]!=='--enroll-verified-sites')throw Error('Explicit root enrollment required');
async function verifySite(ns,expected) {
  const args=['--noproxy','*','-fsS','--connect-timeout','3','--max-time','15','http://10.0.0.3:8080/turtle/tools/report/ems/strings.csv'];
  const csv=(await exec(ns?'ip':'curl',ns?['netns','exec',ns,'curl',...args]:args,{maxBuffer:2*1024*1024,timeout:20000})).stdout;
  const matches=[...csv.matchAll(/S\[ST:([A-Z0-9_-]+),B:(\d+),A:(\d+),S:(\d+)\]/g)];
  const keys=new Set(matches.map(m=>m[0]));
  if(keys.size!==320||matches.some(m=>m[1]!==expected||m[2]!=='1')||new Set(matches.map(m=>m[3])).size!==8)throw Error('Unexpected live site identity or geometry: '+expected);
  return {stationCode:expected,blockIndex:1,strings:keys.size,arrays:8,verifiedAt:new Date().toISOString()};
}
const evidence=[await verifySite(null,'BHE0020'),await verifySite('prizm-ss4','BHE0021')];
const profiles=JSON.parse(await readFile('/home/ebc/GreEnergy_PRIZM/data/prizm_connection_profiles.json','utf8'));
const ss3=profiles.find(p=>p.isActive);
if(!ss3||ss3.stationCode!=='BHE0020'||ss3.emsHost!=='10.0.0.3'||ss3.blockIndex!==1)throw Error('Active SS3 profile needs review');
const ss4=structuredClone(ss3);
Object.assign(ss4,{id:'fleet-ss4-20261001',profileName:'Solar Star 4',siteName:'Solar Star 4',stationCode:'BHE0021',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),lastTestedAt:null,lastTestResult:null,notes:'Enrolled after isolated live BHE0021 Block 1 identity verification. No runtime control state copied.'});
if(ss4.topologyModel?.blocks){if(ss4.topologyModel.blocks.length!==1)throw Error('Unexpected multi-block profile');ss4.topologyModel.blocks[0].stationCode='BHE0021';}
const users={ss3:'ebc',ss4:'prizm-ss4',fleet:'prizm-fleet',entry3:'prizm-entry-ss3',entry4:'prizm-entry-ss4'};
async function save(file,value,user,mode=0o600) {
  await writeFile(file,typeof value==='string'?value:JSON.stringify(value,null,2),{flag:'wx',mode});
  const uid=Number((await exec('id',['-u',user])).stdout),gid=Number((await exec('id',['-g',user])).stdout);
  await chown(file,uid,gid);
}
await mkdir('/var/lib/prizm-sites/ss4/data',{mode:0o700});
await exec('chown',['prizm-ss4:prizm-ss4','/var/lib/prizm-sites/ss4/data']);
await save('/var/lib/prizm-sites/ss4/data/prizm_connection_profiles.json',[ss4],users.ss4);
const collectors=[];
for(const n of [3,4]) {
  const key='ss'+n,profile=n===3?ss3:ss4,ip=n===3?'172.31.250.2':'172.31.250.6';
  const identity={siteId:'solar-star-'+n,blockId:'block-1',stationCode:profile.stationCode,blockIndex:1,name:'Solar Star '+n,profileId:profile.id,emsBaseUrl:'http://10.0.0.3:8080/turtle'};
  const token=randomBytes(32).toString('base64url');
  const origin='https://'+ip+':9443';
  await save('/etc/prizm-fleet/'+key+'/export.json',{identity,token,origin,tls:{bindAddress:ip,keyFile:'/etc/prizm-fleet/'+key+'/key.pem',certFile:'/etc/prizm-fleet/'+key+'/cert.pem'}},users[key]);
  collectors.push({...identity,token,url:origin+'/api/fleet/site-summary'});
}
await save('/etc/prizm-fleet/fleet/fleet.json',{origin:'https://10.0.0.15:3443',bindAddress:'0.0.0.0',accountsFile:'/var/lib/prizm-fleet/accounts/accounts.json',tlsKeyFile:'/etc/prizm-fleet/fleet/key.pem',tlsCertFile:'/etc/prizm-fleet/fleet/cert.pem',collectors},users.fleet);
await save('/etc/prizm-fleet/entry-ss3.json',{bindAddress:'10.0.0.15',port:3443,upstreamAddress:'172.31.250.1',upstreamPort:3443},users.entry3);
await save('/etc/prizm-fleet/entry-ss4/entry.json',{bindAddress:'10.0.0.15',port:3443,upstreamAddress:'172.31.250.5',upstreamPort:3443},users.entry4);
await save('/etc/prizm-fleet/ss4/collector.env','PRIZM_AUTO_COMMISSION=false\nPRIZM_COLLECTOR_ONLY=true\n',users.ss4);
await save('/var/lib/prizm-fleet-backups/pilot-20261001/live-identities.json',evidence,'root');
await save('/usr/local/sbin/prizm-fleet-setup','#!/bin/sh\nset -eu\nexec /usr/sbin/runuser -u prizm-fleet -- /usr/bin/node /opt/prizm-fleet/current/dist/fleet-accounts.cjs /etc/prizm-fleet/fleet/fleet.json add john.wilson@greenergyresources.com solar-star-3,solar-star-4\n','root',0o755);
// This is only a prepared file; install the service override separately at the approved restart.
await save('/etc/prizm-fleet/ss3-export-dropin.conf','# PRIZM reviewed staged Fleet export\n[Unit]\nAfter=prizm-fleet-network.service\n[Service]\nEnvironment=PRIZM_FLEET_EXPORT_CONFIG=/etc/prizm-fleet/ss3/export.json\n','root');
console.log(JSON.stringify({identities:evidence,message:'Enrolled two distinct live sites; configured read-only Fleet. No services restarted.'}));
