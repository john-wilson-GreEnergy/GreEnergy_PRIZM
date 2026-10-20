import {FleetBroker} from './FleetBroker';
import {buildSiteSummary,parseCollectorIdentity} from './siteSummary';
import {object} from './detailProjection';
import type {SitePowerFlow} from '../../core/fleet/powerFlow';

/** Reuse Fleet's canonical projection and freshness rules, not a second UI
 * interpretation. Only the small power/array fields are needed here. */
export function buildBlockPowerFlow(view:unknown,now=Date.now()):SitePowerFlow|undefined {
 if(process.env.PRIZM_FLEET_POWER_FLOW==='false')return undefined;
 const data=object(view),identity=object(data.siteIdentity);
 try{
  const enrollment=parseCollectorIdentity({
   siteId:'block-power-flow',blockId:`b${identity.blockIndex}`,name:String(identity.stationCode),
   stationCode:identity.stationCode,blockIndex:identity.blockIndex,
   profileId:identity.activeProfileId,emsBaseUrl:identity.emsBaseUrl
  });
  const compact={
   siteIdentity:data.siteIdentity,liveStatus:data.liveStatus,
   blockOperatingSummary:data.blockOperatingSummary,modbusTelemetry:data.modbusTelemetry,
   arraySummary:data.arraySummary,pcsSummary:data.pcsSummary,sourceHealth:data.sourceHealth
  };
  const broker=new FleetBroker([enrollment],()=>now);
  broker.accept(enrollment.siteId,buildSiteSummary(compact,enrollment));
  return broker.view(new Set([enrollment.siteId])).sites[0].powerFlow;
 }catch{
  // Invalid identity/future publication must never present an active flow.
  return undefined;
 }
}
