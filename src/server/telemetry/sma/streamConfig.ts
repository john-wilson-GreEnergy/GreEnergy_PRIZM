import path from 'node:path';
import {verifyPrivateFile} from './privateStorage';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

export interface SmaStreamTarget {
  array:number; host:string; deviceId:string; fingerprint256:string;
  userLevel:0|1; password:string;
}
export interface SmaStreamConfig {version:1;stationCode:string;blockCode:string;targets:SmaStreamTarget[]}
export function validateStreamConfig(input:unknown):SmaStreamConfig {
  const c=input as SmaStreamConfig;
  if(!c || c.version!==1 || !/^[A-Z0-9_-]{1,40}$/.test(c.stationCode) || !/^B[1-9][0-9]*$/.test(c.blockCode)
    || !Array.isArray(c.targets) || !c.targets.length || c.targets.length>32)throw Error('Invalid SMA stream configuration');
  const arrays=new Set<number>();
  for(const t of c.targets){
    if(!t || !Number.isInteger(t.array) || t.array<1 || t.array>254 || arrays.has(t.array)
      || t.host!==`10.0.${t.array}.118` || !/^[0-9]{1,20}$/.test(t.deviceId)
      || !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(t.fingerprint256)
      || ![0,1].includes(t.userLevel) || typeof t.password!=='string' || !t.password.length || t.password.length>256)
      throw Error('Invalid SMA stream target');
    arrays.add(t.array);
  }
  return c;
}
// AES-GCM protects stored device passwords. Key and ciphertext must be outside
// the repository, backups and public directory, readable only by the collector.
export function sealConfig(config:SmaStreamConfig,key:Buffer):string {
  validateStreamConfig(config);if(key.length!==32)throw Error('Invalid vault key');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(config),'utf8'),cipher.final()]);
  return JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});
}
export function openConfig(envelope:string,key:Buffer):SmaStreamConfig {
  if(key.length!==32 || envelope.length>128*1024)throw Error('Invalid vault');
  const e=JSON.parse(envelope);
  if(e.version!==1 || typeof e.iv!=='string' || typeof e.tag!=='string' || typeof e.data!=='string')throw Error('Invalid vault');
  const iv=Buffer.from(e.iv,'base64'),tag=Buffer.from(e.tag,'base64');
  if(iv.length!==12 || tag.length!==16)throw Error('Invalid vault');
  const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
  return validateStreamConfig(JSON.parse(Buffer.concat([decipher.update(Buffer.from(e.data,'base64')),decipher.final()]).toString('utf8')));
}
function privateFile(file:string,max:number):Buffer {
  if(!path.isAbsolute(file))throw Error('SMA vault paths must be absolute');
  return verifyPrivateFile(file,max);
}
export function loadStreamConfig(env:NodeJS.ProcessEnv=process.env):SmaStreamConfig|null {
  if(env.PRIZM_SMA_STREAM_ENABLED!=='true')return null;
  if(!env.PRIZM_SMA_STREAM_VAULT || !env.PRIZM_SMA_STREAM_KEY_FILE)throw Error('SMA stream vault not configured');
  const key=privateFile(env.PRIZM_SMA_STREAM_KEY_FILE,32);
  try{return openConfig(privateFile(env.PRIZM_SMA_STREAM_VAULT,128*1024).toString('utf8'),key);}finally{key.fill(0);}
}
