import {createPublicKey,verify,type JsonWebKey} from 'node:crypto';
import {normalizeLocalEmail} from '../../core/security/localEmail';
import {constants} from 'node:fs';
import {lstat,open} from 'node:fs/promises';
import path from 'node:path';

type Key=JsonWebKey&{kid:string};
export interface RemoteIdentityConfig {issuer:string;audience:string;keysFile:string;keysOwnerUid:number}
/** Public keys have a dedicated unprivileged writer, distinct from Fleet and
 * the tunnel. Ownership is pinned by the root-owned deployment configuration. */
async function readPublicKeys(config:RemoteIdentityConfig):Promise<unknown>{
 if(!path.isAbsolute(config.keysFile)||!Number.isSafeInteger(config.keysOwnerUid)||config.keysOwnerUid<0)throw Error('Pinned public-key owner required');
 const dir=await lstat(path.dirname(config.keysFile));
 if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o022)!==0||dir.uid!==config.keysOwnerUid)throw Error('Untrusted public-key directory');
 const file=await open(config.keysFile,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await file.stat();if(!s.isFile()||s.size>65536||(s.mode&0o022)!==0||s.uid!==config.keysOwnerUid)throw Error('Untrusted public-key file');return JSON.parse(await file.readFile('utf8'));}finally{await file.close();}
}
/** Offline verification in the Fleet namespace. A separate host-side service
 * refreshes PUBLIC signing keys over verified HTTPS; no cloud credentials here. */
export function verifyRemoteToken(token:unknown,config:Pick<RemoteIdentityConfig,'issuer'|'audience'>,keys:Key[],now=Date.now()):string{
 if(typeof token!=='string'||token.length>16384||!/^([A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+$/.test(token))throw Error('Remote identity required');
 const [h,p,s]=token.split('.');
 const header=JSON.parse(Buffer.from(h,'base64url').toString('utf8')),claims=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));
 if(!header||header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256||header.crit!==undefined)throw Error('Unsupported remote signature');
 const matches=keys.filter(k=>k.kid===header.kid&&k.kty==='RSA');if(matches.length!==1)throw Error('Unknown remote signing key');
 const key=createPublicKey({key:matches[0],format:'jwk'});
 if((key.asymmetricKeyDetails?.modulusLength??0)<2048||!verify('RSA-SHA256',Buffer.from(h+'.'+p),key,Buffer.from(s,'base64url')))throw Error('Invalid remote signature');
 const sec=Math.floor(now/1000),email=normalizeLocalEmail(claims?.email);
 if(!claims||claims.iss!==config.issuer||!Array.isArray(claims.aud)||!claims.aud.includes(config.audience)||claims.type!=='app'||!email||
  !Number.isSafeInteger(claims.exp)||claims.exp<=sec||!Number.isSafeInteger(claims.iat)||claims.iat>sec+30||claims.exp<=claims.iat||
  claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>sec+30))throw Error('Expired or invalid remote identity');
 return email;
}
export function remoteVerifier(config:RemoteIdentityConfig){
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(config.issuer)||!/^[a-f0-9]{64}$/.test(config.audience))throw Error('Exact Cloudflare issuer and application audience required');
 return async(token:unknown)=>{
  const raw=await readPublicKeys(config) as {fetchedAt:number;keys:Key[]};
  if(!raw||!Number.isSafeInteger(raw.fetchedAt)||raw.fetchedAt>Date.now()+30000||Date.now()-raw.fetchedAt>6*3600000||!Array.isArray(raw.keys)||raw.keys.length<1||raw.keys.length>16)throw Error('Remote verification keys unavailable or expired');
  return verifyRemoteToken(token,config,raw.keys);
 };
}
