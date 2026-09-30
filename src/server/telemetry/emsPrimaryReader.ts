import {RestProvider} from '../../acquisition/providers/RestProvider';
import type {EnrolledTelemetrySite} from '../../core/security/readOnlyTelemetry';
import {recoveryTelemetryBroker} from '../domainBrokers/recoveryTelemetry';
import {PrimaryTelemetryReader, type PrimarySample} from './PrimaryTelemetryReader';
import type {TelemetryMetricsRegistry} from './metrics/TelemetryMetricsRegistry';

export const primaryReaderEnabled = (): boolean => process.env.PRIZM_PRIMARY_EMS_READER === 'true';
const endpoint='/tools/report/ems/lastCall.json';
const scopeOf=(site:EnrolledTelemetrySite|null):string|null=>site?JSON.stringify(site):null;

/** Uses the existing GET provider, but deliberately has no local mock fallback. */
export function createEmsPrimaryReader(currentSite:()=>EnrolledTelemetrySite|null, onSample:(sample:PrimarySample<unknown>)=>void=()=>{}, registry?:()=>Pick<TelemetryMetricsRegistry,'beginEndpoint'>) {
  const provider=new RestProvider();
  const reader=new PrimaryTelemetryReader<unknown>(
    ()=>scopeOf(currentSite()),
    async scope=>{
      const site=JSON.parse(scope) as EnrolledTelemetrySite;
      const metric=registry?.().beginEndpoint('ems-turtle-primary',endpoint);
      let bytes=0;
      try {
        const response=await provider.acquire({name:endpoint,kind:'rest',url:site.emsBaseUrl+endpoint,timeoutMs:15000});
        const payload=response.payload;
        if(!response.success || !payload?.bodyIsJson) throw new Error(response.error || 'Primary EMS response is not JSON');
        bytes=Buffer.byteLength(payload.body);
        const data:unknown=JSON.parse(payload.body);
        metric?.finish({success:true,responseBytes:bytes,acquisitionTimestamp:new Date(),stale:false});
        return data;
      } catch(error) {
        metric?.finish({success:false,responseBytes:bytes,acquisitionTimestamp:new Date(),stale:true});
        throw error;
      }
    },
    sample=>{
      const site=JSON.parse(sample.scope) as EnrolledTelemetrySite;
      const published=recoveryTelemetryBroker.publish({cycleId:sample.sequence,startedAt:sample.startedAt,
        acquiredAt:sample.acquiredAt,site,success:sample.success,fallbackUsed:false,
        attemptUrl:site.emsBaseUrl+endpoint,data:sample.data},currentSite());
      onSample(sample.success && !published?{...sample,success:false,error:'Invalid primary EMS recovery projection'}:sample);
      if(sample.success && !published) throw new Error('Invalid primary EMS recovery projection');
    },
  );
  return {
    async read() {const scope=scopeOf(currentSite());if(!scope)throw new Error('Primary EMS site unavailable');return reader.read(scope);},
    start:()=>reader.start(),stop:()=>reader.stop(),drain:()=>reader.drain(),diagnostics:()=>reader.diagnostics(),
  };
}
