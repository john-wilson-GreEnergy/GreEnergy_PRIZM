import path from 'node:path';
import express from 'express';
import {createMobileApp} from './mobileApp';
import {MobileHvacCache} from './mobileHvacCache';
import {passwordSetup} from './passwordSetup';
import {startRemoteMobile,type RemoteMobileConfig} from './remoteMobile';
import {createServer as httpServer} from 'node:http';
import {createServer as httpsServer} from 'node:https';
import {readPrivatePem} from './collectorTls';
import {readPrivateJson,readAccounts} from '../security/localAccounts';
import {LocalSessions} from '../security/localSessions';
import {FleetBroker} from './FleetBroker';
import {CollectorPoller,parseCollector} from './CollectorPoller';
import {createFleetApp,validateFleetOrigin} from './fleetApp';
import {parseWorkspaceEnrollments} from './workspaceAccess';
import {createWorkspaceGateway,workspaceForwarder,type WorkspaceAudit} from './workspaceGateway';
import {createWorkspaceUi} from './workspaceUi';

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
  const sessions=new LocalSessions(()=>readAccounts(accountsFile),Date.now,process.env.PRIZM_SHIFT_MONITORING!=='false',process.env.PRIZM_SHIFT_24H_ACCESS!=='false');
  const workspaces=parseWorkspaceEnrollments(config.workspaces,collectors,config.origin);
  const publicDirectory=path.resolve('dist');
  // One release owns presentation; collectors retain acquisition and command execution.
  // Explicit rollback restores legacy LAN asset forwarding without changing permissions.
  const workspaceUi=process.env.PRIZM_UNIFIED_WORKSPACE_UI==='false'?undefined:createWorkspaceUi(publicDirectory);
  const sharedIds=config.correctiveGuidanceSites??[];
  if(!Array.isArray(sharedIds)||(sharedIds.length!==0&&sharedIds.length<2)||new Set(sharedIds).size!==sharedIds.length||sharedIds.some(id=>typeof id!=='string'||!workspaces.some(w=>w.siteId===id)))throw Error('Shared guidance requires explicit enrolled site IDs');
  const sharedGuidanceSites=collectors.filter(c=>sharedIds.includes(c.siteId));
  const audit:WorkspaceAudit=async event=>{process.stdout.write(JSON.stringify({at:new Date().toISOString(),...event})+'\n');};
  const fleetApp=createFleetApp(broker,sessions,{
    origin:config.origin,allowLoopbackHttp:config.allowLoopbackHttp===true,publicDirectory,workspaceUi,
    audit,accountsFile,workspaces:workspaces.map(({siteId,origin})=>({siteId,origin})),
  });
  const mobileHvac=new MobileHvacCache(collectors,workspaces);
  const app=express();app.disable('x-powered-by');
  app.use('/mobile',createMobileApp(broker,{origin:config.origin,allowLoopbackHttp:config.allowLoopbackHttp===true,publicDirectory,workspaceUi,accounts:()=>readAccounts(accountsFile),hvac:id=>mobileHvac.view(id),audit,setup:passwordSetup(accountsFile,collectors,audit)}));
  app.use(fleetApp);
  const tls=origin.protocol==='https:';
  if(tls && (typeof config.tlsKeyFile!=='string' || typeof config.tlsCertFile!=='string' || !path.isAbsolute(config.tlsKeyFile) || !path.isAbsolute(config.tlsCertFile)))throw new Error('TLS key and certificate paths required');
  const server=tls?httpsServer({key:await readPrivatePem(config.tlsKeyFile as string),cert:await readPrivatePem(config.tlsCertFile as string),minVersion:'TLSv1.2',handshakeTimeout:5000,maxHeaderSize:8192},app):httpServer(app);
  server.requestTimeout=10000;server.headersTimeout=10000;server.maxRequestsPerSocket=100;
  server.keepAliveTimeout=5000;server.maxConnections=128;
  const bind=tls ? (typeof config.bindAddress==='string'?config.bindAddress:'127.0.0.1') : '127.0.0.1';
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(Number(origin.port || (tls?443:80)),bind,resolve);});
  const workspaceServers:ReturnType<typeof httpsServer>[]=[];
  try{
    for(const workspace of workspaces){
      const collector=collectors.find(c=>c.siteId===workspace.siteId)!;
      const gateway=createWorkspaceGateway(sessions,collector,workspace,config.origin,audit,workspaceForwarder(collector,workspace),false,sharedGuidanceSites,workspaceUi);
      const listener=httpsServer({key:await readPrivatePem(config.tlsKeyFile as string),cert:await readPrivatePem(config.tlsCertFile as string),minVersion:'TLSv1.2',handshakeTimeout:5000,maxHeaderSize:8192},gateway);
      listener.requestTimeout=60000;listener.headersTimeout=10000;listener.maxConnections=64;listener.keepAliveTimeout=5000;
      workspaceServers.push(listener);
      await new Promise<void>((resolve,reject)=>{listener.once('error',reject);listener.listen(Number(new URL(workspace.origin).port),bind,resolve);});
    }
  }catch(error){for(const s of workspaceServers){s.closeAllConnections();s.close();}server.closeAllConnections();server.close();throw error;}
  poller.start();mobileHvac.start();process.stdout.write(JSON.stringify({event:'fleet.started',origin:origin.origin,readOnly:true})+'\n');
  let remote:Awaited<ReturnType<typeof startRemoteMobile>>|undefined;
  if(process.env.PRIZM_REMOTE_CONFIG){
    try{
      const remoteConfig=await readPrivateJson(process.env.PRIZM_REMOTE_CONFIG) as RemoteMobileConfig;
      remote=await startRemoteMobile(broker,{publicDirectory,workspaceUi,adminAccountsFile:process.env.PRIZM_REMOTE_ADMIN==='false'?undefined:accountsFile,accounts:()=>readAccounts(accountsFile),hvac:id=>mobileHvac.view(id),audit,setup:passwordSetup(accountsFile,collectors,audit),desktop:workspaces.map(w=>{const collector=collectors.find(c=>c.siteId===w.siteId)!;return {collector,forward:workspaceForwarder(collector,w)};})},remoteConfig);
      process.stdout.write(JSON.stringify({event:'mobile.remote-listener.ready',controls:remoteConfig.controls==='profile'?'profile':'disabled'})+'\n');
    }catch{console.error('Remote mobile listener disabled: private configuration or socket unavailable. Local Fleet remains running.');}
  }
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;mobileHvac.stop();const deadline=setTimeout(()=>process.exit(1),10000);deadline.unref();await remote?.close();await poller.stop();for(const s of workspaceServers){s.closeAllConnections();s.close();}server.close(()=>{clearTimeout(deadline);process.exit(0);});};
  process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
}
void main().catch(()=>{console.error('Fleet startup failed. Check private enrollment, account and TLS configuration.');process.exitCode=1;});
