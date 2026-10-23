import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {sealConfig,validateStreamConfig,type SmaStreamConfig} from '../../src/server/telemetry/sma/streamConfig';
import {createPrivateDirectory} from '../../src/server/telemetry/sma/privateStorage';
import {collectSmaPasswords} from './smaEnrollmentPasswords';

// Local-only credential enrollment. No device/network access, passwords in
// arguments, automatic enabling, service restart, or destructive overwrite.
async function main(){
  const [manifestFile,directory,...extra]=process.argv.slice(2);
  const shared=extra.length===1&&extra[0]==='--shared-site-password';
  if(!process.stdin.isTTY || (extra.length&&!shared) || !manifestFile || !directory || !path.isAbsolute(manifestFile) || !path.isAbsolute(directory))
    throw Error('Usage: provisionSmaStream /absolute/public-manifest.json /absolute/new-private-directory [--shared-site-password] (interactive console only)');
  if(fs.existsSync(directory))throw Error('Choose a new private directory; existing enrollment is never overwritten');
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')) as SmaStreamConfig;
  if(!manifest.targets?.every(t=>!Object.hasOwn(t,'password')))throw Error('Manifest must not contain passwords');
  let config=validateStreamConfig({...manifest,targets:manifest.targets.map(t=>({...t,password:'validation-only'}))});
  if(shared&&new Set(config.targets.map(t=>t.userLevel)).size!==1)throw Error('Shared enrollment requires one login role');
  const prompt=createInterface({input:process.stdin,output:process.stdout});
  try{const reply=await prompt.question(`Enroll ${config.stationCode}/${config.blockCode}, arrays ${config.targets.map(t=>t.array).join(', ')}? Type yes: `);if(reply!=='yes')return;}finally{prompt.close();}
  const secret=createInterface({input:process.stdin,output:new Writable({write(_chunk,_enc,done){done();}}),terminal:true});
  try{
    config=await collectSmaPasswords(config,shared,async label=>{
      process.stdout.write(label);const value=await secret.question('');process.stdout.write('\n');return value;
    });
  }finally{secret.close();}
  const key=randomBytes(32);
  try{
    const sealed=sealConfig(config,key);
    createPrivateDirectory(directory);
    fs.writeFileSync(path.join(directory,'key'),key,{mode:0o600,flag:'wx'});
    fs.writeFileSync(path.join(directory,'vault.json'),sealed,{mode:0o600,flag:'wx'});
    console.log('Saved encrypted SMA credentials. Provider remains disabled until explicitly configured and restarted.');
    console.log('Grant only the intended collector account access to this private directory before enabling it.');
  }finally{key.fill(0);for(const target of config.targets)target.password='';}
}
main().catch(()=>{console.error('Enrollment stopped. Check the manifest, private destination, and matching passwords. No device settings were changed.');process.exitCode=1;});
