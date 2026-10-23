import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseTunnelToken,saveTunnelToken,remoteAccountId,remoteTunnelId} from './remoteTunnelToken.mjs';
const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64');
const data={a:remoteAccountId,t:remoteTunnelId,s:'test-only-not-a-real-secret-1234567890'},token=encode(data);
for(const prefix of ['', 'sudo cloudflared service install ','cloudflared.exe service install '])assert.equal(parseTunnelToken(prefix+token),token);
for(const bad of ['', token+';echo bad',token+'\nwhoami',encode({...data,a:'wrong'}),encode({...data,t:'wrong'}),encode({...data,s:''}),'x'.repeat(8193)]){
 assert.throws(()=>parseTunnelToken(bad),error=>!error.message.includes(token)&&error.message.startsWith('Token is not valid'));
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prizm-token-test-')),file=path.join(dir,'token');
try{
 saveTunnelToken(file,token,{uid:process.getuid(),gid:process.getgid()});
 assert.equal(fs.statSync(file).mode&0o777,0o600);assert.equal(fs.readFileSync(file,'utf8'),token);
 assert.throws(()=>saveTunnelToken(file,token,{uid:process.getuid(),gid:process.getgid()}));
 fs.symlinkSync(file,path.join(dir,'link'));assert.throws(()=>saveTunnelToken(path.join(dir,'link'),token,{uid:process.getuid(),gid:process.getgid()}));
}finally{fs.rmSync(dir,{recursive:true});}
console.log('PASS pinned tunnel/account token parsing, no command execution, exclusive private storage');
