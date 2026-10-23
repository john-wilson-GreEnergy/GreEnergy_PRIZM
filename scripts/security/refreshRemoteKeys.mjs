import {createPublicKey} from 'node:crypto';
import {lstat,open,rename,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const issuer='https://delicate-salad-7b96.cloudflareaccess.com';
export const destination='/var/lib/prizm-remote-keys/keys.json';
export function validateKeys(raw){
 if(!raw||!Array.isArray(raw.keys)||raw.keys.length<1||raw.keys.length>16)throw Error('Invalid signing-key set');
 const ids=new Set();return raw.keys.map(k=>{
  if(!k||k.kty!=='RSA'||typeof k.kid!=='string'||!k.kid||k.kid.length>256||ids.has(k.kid)||k.d||k.p||k.q||k.use&&k.use!=='sig'||k.alg&&k.alg!=='RS256')throw Error('Invalid public signing key');
  ids.add(k.kid);const key=createPublicKey({key:k,format:'jwk'});if((key.asymmetricKeyDetails?.modulusLength??0)<2048)throw Error('Weak public signing key');
  return {...key.export({format:'jwk'}),kid:k.kid};
 });
}
export async function refresh(fetcher=fetch,file=destination){
 const dir=await lstat(path.dirname(file));if(!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==process.getuid()||(dir.mode&0o022))throw Error('Unsafe public-key directory');
 const response=await fetcher(issuer+'/cdn-cgi/access/certs',{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(response.status!==200||!response.headers.get('content-type')?.includes('application/json'))throw Error('Signing keys unavailable');
 let bytes=0,chunks=[];for await(const chunk of response.body){bytes+=chunk.length;if(bytes>65536)throw Error('Signing-key response too large');chunks.push(chunk);}
 const keys=validateKeys(JSON.parse(Buffer.concat(chunks).toString('utf8'))),temp=file+'.new';
 const handle=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o644);
 try{await handle.writeFile(JSON.stringify({fetchedAt:Date.now(),keys}));await handle.chmod(0o644);await handle.sync();await handle.close();await rename(temp,file);}catch(e){await handle.close().catch(()=>{});await unlink(temp).catch(()=>{});throw e;}
 return keys.length;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{console.log('Refreshed '+await refresh()+' public verification keys.');}catch{console.error('Public signing-key refresh failed; previous cache retained, remote access fails closed when expired.');process.exitCode=1;}
}
