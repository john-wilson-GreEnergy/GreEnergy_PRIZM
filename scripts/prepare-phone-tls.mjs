// Temporary, dedicated preview CA. Never imports trust or touches the production CA.
import {mkdtemp,chmod} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {isIP} from 'node:net';
import {networkInterfaces} from 'node:os';
const ip=process.argv[2];
if(isIP(ip)!==4||!Object.values(networkInterfaces()).flat().some(v=>v?.address===ip))throw Error('Supply a currently assigned local IPv4 address');
if(!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip))throw Error('Private LAN address required');
const dir=await mkdtemp('/private/tmp/prizm-phone-');await chmod(dir,0o700);
const run=args=>execFileSync('openssl',args,{stdio:['ignore','pipe','pipe']});
run(['req','-x509','-newkey','rsa:3072','-nodes','-keyout',dir+'/ca.key','-out',dir+'/ca.pem','-days','7','-sha256','-subj','/C=US/ST=Oklahoma/L=Ardmore/O=GreEnergy Resources LLC/OU=GreEnergy OT Operations/CN=PRIZM Temporary Phone Preview CA','-addext','basicConstraints=critical,CA:TRUE,pathlen:0','-addext','keyUsage=critical,keyCertSign,cRLSign']);
run(['req','-new','-newkey','rsa:2048','-nodes','-keyout',dir+'/server.key','-out',dir+'/server.csr','-subj','/C=US/ST=Oklahoma/L=Ardmore/O=GreEnergy Resources LLC/OU=GreEnergy OT Operations/CN=PRIZM Local Phone Preview','-addext','subjectAltName=IP:'+ip,'-addext','basicConstraints=critical,CA:FALSE','-addext','keyUsage=critical,digitalSignature,keyEncipherment','-addext','extendedKeyUsage=serverAuth']);
run(['x509','-req','-in',dir+'/server.csr','-CA',dir+'/ca.pem','-CAkey',dir+'/ca.key','-CAcreateserial','-out',dir+'/server.pem','-days','7','-sha256','-copy_extensions','copy']);
run(['x509','-in',dir+'/ca.pem','-outform','DER','-out',dir+'/prizm-phone-ca.cer']);
await chmod(dir+'/ca.key',0o600);await chmod(dir+'/server.key',0o600);
console.log('Temporary certificate directory: '+dir);
console.log(run(['x509','-in',dir+'/ca.pem','-noout','-fingerprint','-sha256','-dates']).toString());
