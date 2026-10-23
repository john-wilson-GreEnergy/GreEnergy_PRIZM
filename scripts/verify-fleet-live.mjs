/** Read-only deployment verification. Tokens stay in memory; print only bounded quality/metrics. */
import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile('/etc/prizm-fleet/fleet/fleet.json','utf8'));
for(const c of config.collectors) {
  const r=await fetch(c.url,{headers:{authorization:'Bearer '+c.token},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error(c.siteId+' summary HTTP '+r.status);
  const data=await r.json();
  if(data.stationCode!==c.stationCode||data.siteId!==c.siteId)throw Error('Collector identity mismatch');
  console.log(JSON.stringify({site:data.siteId,station:data.stationCode,observedAt:data.observedAt,stale:data.stale,metrics:data.metrics,detailKeys:Object.keys(data.details||{}),arrays:data.details?.arrays?.length}));
  const unauth=await fetch(c.url,{signal:AbortSignal.timeout(10000)});
  if(unauth.status!==401)throw Error('Missing-token request not denied');
  const forbidden=await fetch(c.url.replace('/api/fleet/site-summary','/api/ems/control'),{headers:{authorization:'Bearer '+c.token},signal:AbortSignal.timeout(10000)});
  if(forbidden.status!==403)throw Error('Unknown route not denied');
  console.log('PASS '+c.siteId+' verified TLS, identity, missing-token denial and unrelated-route denial');
}
