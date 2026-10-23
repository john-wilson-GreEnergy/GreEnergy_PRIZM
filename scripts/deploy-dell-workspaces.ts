import {readFile,writeFile,lstat,mkdir,copyFile,chown,chmod,rename,symlink,readlink,unlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {parseAccounts} from '../src/server/security/localAccounts';
import {parseWorkspaceEnrollments} from '../src/server/fleet/workspaceAccess';
import type {Collector} from '../src/server/fleet/CollectorPoller';
const release='/opt/prizm-fleet/releases/workspaces-20261001';
const backup='/var/lib/prizm-fleet/workspace-backup-20261001';
const fleetFile='/etc/prizm-fleet/fleet/fleet.json';
const units=['prizm-workspace-network','prizm-workspace-entry@ss3-3444','prizm-workspace-entry@ss3-3445','prizm-workspace-entry@ss4-3444','prizm-workspace-entry@ss4-3445'];
const run=(...args:string[])=>execFileSync('systemctl',args,{stdio:'inherit',timeout:120000});
const user=(name:string)=>({uid:Number(execFileSync('id',['-u',name])),gid:Number(execFileSync('id',['-g',name]))});
type FileRecord={path:string;existed:boolean;uid:number;gid:number;mode:number};
const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
async function writePrivate(file:string,text:string,owner:{uid:number;gid:number},mode=0o600){
  const parent=file.slice(0,file.lastIndexOf('/'));await mkdir(parent,{recursive:true,mode:0o755});
  await writeFile(file+'.workspace-next',text,{mode,flag:'wx'});await chown(file+'.workspace-next',owner.uid,owner.gid);await chmod(file+'.workspace-next',mode);await rename(file+'.workspace-next',file);
}
async function switchRelease(target:string){await symlink(target,'/opt/prizm-fleet/current-workspace-next');await rename('/opt/prizm-fleet/current-workspace-next','/opt/prizm-fleet/current');}
async function main(){
 if(process.getuid?.()!==0)throw Error('Root required');
 const action=process.argv[2];
 if(action==='prepare'){
  const fleet=await json(fleetFile),accountFile=fleet.accountsFile;
  if(fleet.workspaces?.length || accountFile!=='/var/lib/prizm-fleet/accounts/accounts.json')throw Error('Unexpected existing enrollment');
  const accounts=parseAccounts(await json(accountFile)),account=accounts.find(a=>a.email==='john.wilson@greenergyresources.com');
  if(!account||account.disabled||account.grants.some(g=>g.capability==='workspace.full'))throw Error('Unexpected account state');
  const records:FileRecord[]=[];
  await mkdir(backup,{mode:0o700});
  const planned:{path:string;text:string;uid:number;gid:number;mode:number}[]=[];
  const add=async(path:string,text:string,owner?:{uid:number;gid:number},mode=0o600)=>{
   let stat;try{stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe target');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   const i=records.length;records.push({path,existed:!!stat,uid:stat?.uid??owner?.uid??0,gid:stat?.gid??owner?.gid??0,mode:stat?stat.mode&0o777:mode});
   if(stat)await copyFile(path,backup+'/'+i+'.before');
   planned.push({path,text,uid:owner?.uid??stat?.uid??0,gid:owner?.gid??stat?.gid??0,mode});
  };
  fleet.workspaces=[];
  for(const [i,site] of ['ss3','ss4'].entries()){
   const collector=fleet.collectors.find((c:Collector)=>c.siteId==='solar-star-'+(i+3));
   if(collector?.stationCode!==['BHE0020','BHE0021'][i])throw Error('Site identity changed');
   if(!account.grants.some(g=>g.siteId===collector.siteId&&g.blockId===collector.blockId&&g.capability==='telemetry.view'))throw Error('Missing telemetry grant');
   const file='/etc/prizm-fleet/'+site+'/export.json',config=await json(file);
   if(config.identity.siteId!==collector.siteId||config.workspaceToken)throw Error('Collector enrollment changed');
   const token=randomBytes(32).toString('base64url');config.workspaceToken=token;
   fleet.workspaces.push({siteId:collector.siteId,origin:'https://10.0.0.15:'+String(3444+i),token});
   account.grants.push({capability:'workspace.full',siteId:collector.siteId,blockId:collector.blockId,scope:{kind:'block'}});
   await add(file,JSON.stringify(config));
  }
  account.version++;parseAccounts(accounts);parseWorkspaceEnrollments(fleet.workspaces,fleet.collectors,fleet.origin);
  await add(fleetFile,JSON.stringify(fleet));await add(accountFile,JSON.stringify(accounts));
  const root={uid:0,gid:0};
  await add('/etc/systemd/system/prizm.service.d/95-workspace.conf','[Service]\nExecStart=\nExecStart=/usr/bin/node /opt/prizm-fleet/current/dist/server.cjs\nEnvironment=PRIZM_PUBLIC_DIRECTORY=/opt/prizm-fleet/current/dist\n',root,0o644);
  await add('/etc/systemd/system/prizm-site@ss4.service.d/workspace.conf','[Service]\nEnvironment=PRIZM_PUBLIC_DIRECTORY=/opt/prizm-fleet/current/dist\n',root,0o644);
  for(const name of ['prizm-workspace-network.service','prizm-workspace-entry@.service'])await add('/etc/systemd/system/'+name,await readFile(release+'/deployment/linux/fleet/'+name,'utf8'),root,0o644);
  for(const site of ['ss3','ss4'])for(const port of [3444,3445]){
   const owner=user('prizm-entry-'+site),id=site+'-'+port;
   await add('/etc/prizm-fleet/workspace-entry-'+id+'.json',JSON.stringify({bindAddress:'10.0.0.15',port,upstreamAddress:site==='ss3'?'172.31.250.1':'172.31.250.5',upstreamPort:port,workspaceEntry:true}),owner);
   await add('/etc/systemd/system/prizm-workspace-entry@'+id+'.service.d/site.conf','[Service]\nUser=prizm-entry-'+site+'\nGroup=prizm-entry-'+site+'\n'+(site==='ss4'?'NetworkNamespacePath=/run/netns/prizm-ss4\n':''),root,0o644);
  }
  await writeFile(backup+'/manifest.json',JSON.stringify({records,oldRelease:await readlink('/opt/prizm-fleet/current')}),{mode:0o600,flag:'wx'});
  await writeFile(backup+'/planned.json',JSON.stringify(planned),{mode:0o600,flag:'wx'});
  console.log('Prepared private backups and two fixed workspaces; no active configuration changed');return;
 }
 if(action==='apply'){
  const planned=await json(backup+'/planned.json');
  for(const f of planned)await writePrivate(f.path,f.text,f,f.mode);
  await switchRelease(release);run('daemon-reload');run('start','prizm-workspace-network');
  run('restart','prizm');run('restart','prizm-site@ss4');run('restart','prizm-fleet');
  run('enable','--now',...units);console.log('Workspace rollout applied');return;
 }
 if(action==='rollback'){
  run('disable','--now',...units.slice(1));run('disable','--now',units[0]);
  const manifest=await json(backup+'/manifest.json');
  for(const [i,f] of manifest.records.entries()){
   if(f.existed)await writePrivate(f.path,await readFile(backup+'/'+i+'.before','utf8'),f,f.mode);
   else {try{await unlink(f.path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
  }
  await switchRelease(manifest.oldRelease);run('daemon-reload');run('restart','prizm','prizm-site@ss4','prizm-fleet');console.log('Workspace rollout rolled back; saved data retained');return;
 }
 throw Error('Use prepare|apply|rollback');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
