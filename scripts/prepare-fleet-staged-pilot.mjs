/** Explicit Dell staging installer. Installs files only; does not start services or move NICs. */
import {cp,mkdir,writeFile,readFile,lstat,symlink,chown,chmod} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {productionPlan} from './fleet-pilot-network.mjs';
const exec=promisify(execFile);
const stage='/home/ebc/prizm-fleet-stage-20260930.xSfgtv4a';
const release='/opt/prizm-fleet/releases/pilot-20261001';
if(process.getuid?.()!==0||process.argv[2]!=='--prepare-reviewed-dell-pilot')throw Error('Explicit Dell root preparation required');
for(const target of [release,'/etc/prizm-fleet','/etc/systemd/system/prizm-fleet-network.service']) {
  try{await lstat(target);throw Error('Refusing to overwrite '+target);}catch(e){if(e.code!=='ENOENT')throw e;}
}
const backup='/var/lib/prizm-fleet-backups/pilot-20261001';
await mkdir(backup,{recursive:true,mode:0o700});
await cp('/etc/netplan',backup+'/netplan',{recursive:true});
await cp('/etc/systemd/system/prizm.service',backup+'/prizm.service');
await cp('/etc/systemd/system/prizm.service.d',backup+'/prizm.service.d',{recursive:true});
await writeFile(backup+'/network-before.json',(await exec('ip',['-j','-d','addr'])).stdout,{mode:0o600});
await writeFile(backup+'/routes-before.json',(await exec('ip',['-j','route','show','table','all'])).stdout,{mode:0o600});
await mkdir(release,{recursive:true,mode:0o755});
for(const part of ['dist','node_modules'])await cp(await (await import('node:fs/promises')).realpath(stage+'/'+part),release+'/'+part,{recursive:true});
await mkdir(release+'/scripts',{mode:0o755});
for(const name of ['fleet-pilot-network.mjs','fleet-pilot-rollback.mjs'])await cp(stage+'/scripts/'+name,release+'/scripts/'+name);
await exec('chown',['-R','root:root',release]);
await symlink(release,'/opt/prizm-fleet/current');
for(const user of ['prizm-fleet','prizm-ss4','prizm-entry-ss3','prizm-entry-ss4']) {
  try{await exec('id',[user]);throw Error('Service account already exists: '+user);}catch(e){if(!e.code)throw e;}
  await exec('useradd',['--system','--no-create-home','--shell','/usr/sbin/nologin',user]);
}
const uid=async user=>Number((await exec('id',['-u',user])).stdout.trim());
const gid=async user=>Number((await exec('id',['-g',user])).stdout.trim());
const own=async(file,user)=>{await chown(file,await uid(user),await gid(user));};
await mkdir('/etc/prizm-fleet',{mode:0o755});
for(const [name,user] of [['fleet','prizm-fleet'],['ss3','ebc'],['ss4','prizm-ss4'],['entry-ss4','prizm-entry-ss4']]) {
  const dir='/etc/prizm-fleet/'+name;await mkdir(dir,{mode:0o700});await own(dir,user);
  if(name.startsWith('entry'))continue;
  const pki='/home/ebc/prizm-fleet-pki-20261001/'+name;
  // Copy only leaf keys/certificates and the PUBLIC CA. Never copy authority/.
  const files=await (await import('node:fs/promises')).readdir(pki);
  for(const file of files){await cp(pki+'/'+file,dir+'/'+file);await chmod(dir+'/'+file,0o600);await own(dir+'/'+file,user);}
  await cp('/home/ebc/prizm-fleet-pki-20261001/ca-cert.pem',dir+'/ca-cert.pem');await chmod(dir+'/ca-cert.pem',0o600);await own(dir+'/ca-cert.pem',user);
}
await mkdir('/var/lib/prizm-sites',{recursive:true,mode:0o755});
await mkdir('/var/lib/prizm-sites/ss4',{mode:0o700});await own('/var/lib/prizm-sites/ss4','prizm-ss4');
await mkdir('/var/lib/prizm-fleet/accounts',{recursive:true,mode:0o700});
await own('/var/lib/prizm-fleet','prizm-fleet');await own('/var/lib/prizm-fleet/accounts','prizm-fleet');
await symlink(release+'/dist','/var/lib/prizm-sites/ss4/dist');
await mkdir('/run/prizm-fleet-pilot',{recursive:true,mode:0o700});
await writeFile('/etc/prizm-fleet/network-plan.json',JSON.stringify(productionPlan()),{mode:0o600});
for(const unit of ['prizm-fleet-network.service','prizm-fleet.service','prizm-site@.service','prizm-fleet-entry@.service','prizm-fleet-entry-ss3.service']) {
  await cp(stage+'/deployment/linux/fleet/'+unit,'/etc/systemd/system/'+unit);await chmod('/etc/systemd/system/'+unit,0o644);
}
await exec('systemctl',['daemon-reload']);
console.log('Prepared protected release, service accounts, leaf certificates, units and backup. No service started or NIC moved.');
console.log('Backup: '+backup);
