import fs from 'node:fs';
export const remoteTunnelId='9268a0e8-3b64-4bad-808c-64fa9084b23f';
export const remoteAccountId='f60bd010425a1114820c59f44e65c933';
/** Accept a token or the single install command copied from Cloudflare.
 * Never execute that command, log the input, or include it in an exception. */
export function parseTunnelToken(input){
 try{
  if(typeof input!=='string'||input.length>8192)throw Error();
  const match=input.trim().match(/^(?:(?:sudo )?cloudflared(?:\.exe)? service install )?([A-Za-z0-9+/]+={0,2})$/);
  if(!match)throw Error();
  const token=match[1],raw=Buffer.from(token,'base64');
  if(raw.toString('base64').replace(/=+$/,'')!==token.replace(/=+$/,''))throw Error();
  const value=JSON.parse(raw.toString('utf8'));
  if(value.a!==remoteAccountId||value.t!==remoteTunnelId||typeof value.s!=='string'||value.s.length<32||value.s.length>512)throw Error();
  return token;
 }catch{throw Error('Token is not valid for the approved PRIZM tunnel; nothing was executed.');}
}
export function saveTunnelToken(file,token,owner){
 const validated=parseTunnelToken(token);
 const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{fs.fchownSync(fd,owner.uid,owner.gid);fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,validated);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
