import path from 'node:path';
import {createServer as httpServer} from 'node:http';
import {createServer as httpsServer} from 'node:https';
import {readFile} from 'node:fs/promises';
import {readPrivateJson,readAccounts} from '../security/localAccounts';
import {LocalSessions} from '../security/localSessions';
import {FleetBroker} from './FleetBroker';
import {CollectorPoller,parseCollector} from './CollectorPoller';
import {createFleetApp,validateFleetOrigin} from './fleetApp';

async function main(){
  if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new Error('Fleet requires certificate verification');
  const config=await readPrivateJson(process.env.PRIZM_FLEET_CONFIG ?? '') as Record<string,unknown>;
  if(!config || typeof config.origin!=='string' || typeof config.accountsFile!=='string' || !path.isAbsolute(config.accountsFile) ||
    !Array.isArray(config.collectors))throw new Error('Invalid fleet configuration');
  const origin=validateFleetOrigin(config.origin,config.allowLoopbackHttp===true);
  const collectors=config.collectors.map(value=>parseCollector(value,config.allowLoopbackHttp===true));
  const broker=new FleetBroker(collectors),poller=new CollectorPoller(broker,collectors);
  const accountsFile=config.accountsFile;
  await readAccounts(accountsFile);
  const app=createFleetApp(broker,new LocalSessions(()=>readAccounts(accountsFile)),{
    origin:config.origin,allowLoopbackHttp:config.allowLoopbackHttp===true,publicDirectory:path.resolve('dist'),
    audit:async event=>{process.stdout.write(JSON.stringify({at:new Date().toISOString(),...event})+'\n');},
  });
  const tls=origin.protocol==='https:';
  if(tls && (typeof config.tlsKeyFile!=='string' || typeof config.tlsCertFile!=='string' || !path.isAbsolute(config.tlsKeyFile) || !path.isAbsolute(config.tlsCertFile)))throw new Error('TLS key and certificate paths required');
  const server=tls?httpsServer({key:await readFile(config.tlsKeyFile as string),cert:await readFile(config.tlsCertFile as string),minVersion:'TLSv1.2'},app):httpServer(app);
  server.requestTimeout=10000;server.headersTimeout=10000;server.maxRequestsPerSocket=100;
  const bind=tls ? (typeof config.bindAddress==='string'?config.bindAddress:'127.0.0.1') : '127.0.0.1';
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(Number(origin.port || (tls?443:80)),bind,resolve);});
  poller.start();process.stdout.write(JSON.stringify({event:'fleet.started',origin:origin.origin,readOnly:true})+'\n');
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>process.exit(1),10000);deadline.unref();await poller.stop();server.close(()=>{clearTimeout(deadline);process.exit(0);});};
  process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
}
void main().catch(()=>{console.error('Fleet startup failed. Check private enrollment, account and TLS configuration.');process.exitCode=1;});
