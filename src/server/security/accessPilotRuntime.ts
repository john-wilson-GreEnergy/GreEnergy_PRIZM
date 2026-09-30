import type {RequestHandler} from 'express';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {readAccounts, readPrivateJson} from './localAccounts';
import {LocalSessions} from './localSessions';
import {OwnedJobs} from './ownedJobs';
import {createLocalAccessPilot, type PilotPorts} from './localAccessPilot';
import {readOnlyTelemetry,recoveryObservation} from './readOnlyTelemetryService';
import {CommandRecovery} from './commandRecovery';
import {ContactorAccess, contactorPolicyContext} from './contactorAccess';
import {ContactorReceipts} from './contactorReceipts';
import {recoveryTelemetrySource} from '../domainBrokers/recoveryTelemetry';

/** No credentials or file reads unless the operator explicitly enables the pilot. */
export function accessPilotFromEnvironment(): RequestHandler | null {
  const mode = process.env.PRIZM_ACCESS_MODE;
  if (!mode) return null; // Existing deployment unchanged, NOT authenticated.
  if (mode !== 'pilot') throw new Error('Unknown PRIZM_ACCESS_MODE; refusing startup');
  const directory = process.env.PRIZM_ACCESS_DIRECTORY;
  if (!directory || !path.isAbsolute(directory)) throw new Error('Pilot requires an absolute PRIZM_ACCESS_DIRECTORY');
  const ready = (async () => {
    const config = await readPrivateJson(path.join(directory,'pilot.json')) as Record<string,unknown>;
    const fields = ['origin','siteId','blockId','profileId','stationCode','emsBaseUrl'];
    if (!config || fields.some(key => typeof config[key] !== 'string' || !config[key] || String(config[key]).length > 256) ||
        !Number.isSafeInteger(config.blockIndex) || Number(config.blockIndex) < 1 ||
        (config.allowLoopbackHttp !== undefined && typeof config.allowLoopbackHttp !== 'boolean') ||
        (config.allowSingleStringContactors !== undefined && typeof config.allowSingleStringContactors !== 'boolean')) throw new Error('Invalid pilot enrollment');
    const origin = String(config.origin), siteId = String(config.siteId), blockId = String(config.blockId);
    const accountFile = path.join(directory,'accounts.json');
    await readAccounts(accountFile); await readPrivateJson(path.join(directory,'owners.json'));
    const sessions = new LocalSessions(() => readAccounts(accountFile));
    const jobs = new OwnedJobs(path.join(directory,'owners.json'));
    const {ProfileStore} = await import('../profiles/profileStore');
    const {buildEmsBaseUrl} = await import('../profiles/profileManager');
    const scope = () => {
      const profile = ProfileStore.getActiveProfile();
      if (!profile || profile.id !== config.profileId || profile.stationCode !== config.stationCode || profile.blockIndex !== config.blockIndex || buildEmsBaseUrl(profile) !== config.emsBaseUrl) throw new Error('Active site does not match pilot enrollment');
      return {siteId,blockId};
    };
    const canonicalSiteId = JSON.stringify([config.stationCode,config.blockIndex,config.emsBaseUrl]);
    const readTelemetry: NonNullable<PilotPorts['readTelemetry']> = async () => {
      // Read the already-built canonical snapshot only; never publish/rebuild or acquire here.
      const {getWorkspaceProjectionSource} = await import('../prizmDataCoordinator');
      return readOnlyTelemetry(getWorkspaceProjectionSource(),{
        profileId:String(config.profileId),stationCode:String(config.stationCode),blockIndex:Number(config.blockIndex),emsBaseUrl:String(config.emsBaseUrl),
      });
    };
    const audit: PilotPorts['audit'] = async event => {
      const handle = await open(path.join(directory,'access-audit.jsonl'),constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 16*1024*1024) throw new Error('Private access audit unavailable or full');
        await handle.writeFile(JSON.stringify({at:new Date().toISOString(),...event})+'\n'); await handle.sync();
      } finally {await handle.close();}
    };
    const receipts=new ContactorReceipts(path.join(directory,'contactor-receipts.json'));
    const enrolled = {profileId:String(config.profileId),stationCode:String(config.stationCode),blockIndex:Number(config.blockIndex),emsBaseUrl:String(config.emsBaseUrl)};
    const readRecoverySource = async () => {
      scope();
      const {getWorkspaceProjectionSource} = await import('../prizmDataCoordinator');
      return recoveryTelemetrySource(process.env.PRIZM_RECOVERY_EARLY_TELEMETRY,enrolled,getWorkspaceProjectionSource);
    };
    if(config.allowSingleStringContactors === true) await receipts.validate(); // Never silently recreate lost state.
    const contactors = config.allowSingleStringContactors === true ? new ContactorAccess({
      receipts,
      context:async () => {
        scope();
        const telemetry = await readTelemetry();
        return contactorPolicyContext(scope(),telemetry);
      },
      execute:async (request,guard) => (await import('../contactorControlService')).executeContactorControl(request,guard),
      audit,
    }) : undefined;
    return createLocalAccessPilot(sessions,jobs,{
      scope,
      readTelemetry,
      contactors,
      recovery:contactors ? new CommandRecovery({receipts,scope,audit,
        context:async()=>contactorPolicyContext(scope(),readOnlyTelemetry(await readRecoverySource(),enrolled)),
        observe:async(array,string)=>{
          return recoveryObservation(await readRecoverySource(),enrolled,array,string);
        },
      }) : undefined,
      readJob: async (kind,id) => {
        if (kind === 'balancing') return (await import('../balancingControlService')).getBalancingVerificationJob(id);
        if (kind === 'thermal-recording') {
          const view = await (await import('../thermal/thermalService')).thermalService().view();
          return view.sessions.find(row => row.id === id && row.securitySiteId === canonicalSiteId) ?? null;
        }
        // Singleton reviews have no stable, owned lifecycle yet; never expose the legacy report.
        return null;
      },
      startRecording: async (targets,hours) => (await import('../thermal/thermalService')).thermalService().start(targets,hours,canonicalSiteId),
      stopRecording: async id => (await import('../thermal/thermalService')).thermalService().stop(id),
      audit,
    },{origin,allowLoopbackHttp:config.allowLoopbackHttp === true});
  })();
  // Observe startup rejection; all API requests still fail closed, never to legacy routes.
  void ready.catch(() => console.error('[AccessPilot] Private enrollment unavailable; API access blocked'));
  return (req,res,next) => {void ready.then(handler => handler(req,res,next)).catch(() => res.status(503).json({error:'Local access pilot unavailable'}));};
}
