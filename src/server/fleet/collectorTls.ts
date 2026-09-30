import {constants} from 'node:fs';
import {lstat, open} from 'node:fs/promises';
import {createServer, type Server} from 'node:https';
import {isIP} from 'node:net';
import path from 'node:path';
import express, {type RequestHandler} from 'express';

export interface CollectorTlsConfig {bindAddress:string; port:number; keyFile:string; certFile:string}
export function parseCollectorTls(value:unknown, origin:string):CollectorTlsConfig {
  const row=value as Record<string,unknown>, url=new URL(origin);
  const address=row?.bindAddress;
  const port=Number(url.port || 443);
  // Require a specific private IPv4 interface or loopback, never a wildcard.
  const privateAddress=typeof address==='string' && isIP(address)===4 &&
    (/^(10\.|192\.168\.|127\.)/.test(address) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(address));
  if(url.protocol!=='https:' || !row || !privateAddress || port<1 ||
    typeof row.keyFile!=='string' || !path.isAbsolute(row.keyFile) ||
    typeof row.certFile!=='string' || !path.isAbsolute(row.certFile))throw new Error('Private collector TLS configuration required');
  return {bindAddress:address as string,port,keyFile:row.keyFile,certFile:row.certFile};
}

/** Keys and certificates are provisioned, never generated or logged at startup. */
async function readPrivatePem(file:string):Promise<Buffer> {
  const parent=await lstat(path.dirname(file));
  if(!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o022)!==0)throw new Error('TLS directory must be private');
  const handle=await open(file,constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat=await handle.stat();
    if(!stat.isFile() || stat.size<1 || stat.size>65536 || (stat.mode & 0o077)!==0 ||
      (stat.uid!==process.getuid?.() && stat.uid!==0))throw new Error('TLS file must be private and owned by service account or root');
    return await handle.readFile();
  } finally {await handle.close();}
}

export async function startCollectorTls(config:CollectorTlsConfig, handler:RequestHandler):Promise<Server> {
  if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new Error('Certificate verification must remain enabled');
  const [key,cert]=await Promise.all([readPrivatePem(config.keyFile),readPrivatePem(config.certFile)]);
  const app=express();
  app.disable('x-powered-by');app.set('trust proxy',false);
  app.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next();});
  app.use('/api/fleet',handler);
  app.use((_req,res)=>res.status(403).json({error:'Collector route not enabled'}));
  const server=createServer({key,cert,minVersion:'TLSv1.2',handshakeTimeout:5000,maxHeaderSize:8192},app);
  server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=2000;
  server.maxRequestsPerSocket=32;server.maxConnections=16;
  try {
    await new Promise<void>((resolve,reject)=>{
      const failed=(error:Error)=>reject(error);
      server.once('error',failed);
      server.listen(config.port,config.bindAddress,()=>{server.removeListener('error',failed);resolve();});
    });
    return server;
  } catch(error) {server.closeAllConnections();server.close();throw error;}
}
