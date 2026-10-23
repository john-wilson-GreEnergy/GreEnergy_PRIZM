import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyRemoteToken} from './remoteIdentity';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const key={...publicKey.export({format:'jwk'}),kid:'fixture-key'};
const config={issuer:'https://fixture.cloudflareaccess.com',audience:'a'.repeat(64)},now=Date.now(),sec=Math.floor(now/1000);
const payload={iss:config.issuer,aud:[config.audience],type:'app',email:'tech@example.test',iat:sec-5,exp:sec+60};
function token(claims:unknown,header:unknown={alg:'RS256',kid:key.kid}){const data=[header,claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');}
assert.equal(verifyRemoteToken(token(payload),config,[key],now),'tech@example.test');
for(const change of [{iss:'https://evil.test'},{aud:['other']},{type:'service'},{exp:sec},{iat:sec+120},{nbf:sec+120},{email:null}])assert.throws(()=>verifyRemoteToken(token({...payload,...change}),config,[key],now));
for(const header of [{alg:'none',kid:key.kid},{alg:'HS256',kid:key.kid},{alg:'RS256',kid:'unknown'},{alg:'RS256',kid:key.kid,crit:['x']}])assert.throws(()=>verifyRemoteToken(token(payload,header),config,[key],now));
assert.throws(()=>verifyRemoteToken(token(payload),config,[key,key],now));
assert.throws(()=>verifyRemoteToken('x'.repeat(20000),config,[key],now));
assert.throws(()=>verifyRemoteToken(token(payload).slice(0,-20)+'AAAAAAAAAAAAAAAAAAAA',config,[key],now));
console.log('PASS remote JWT signature, key selection, issuer, audience, identity, expiry, algorithm and service-token rejection');
