/** Development review only. Explicit passive reads; never a general-purpose tunnel. */
const reads=new Map<string,string[]>([
  ...['snapshot','block-summary','strings','strings-fast','pcs','feather','arrays','source-health','sensors','status','corrective-actions','notifications/rollups'].map(path=>[`/api/local/site-data/${path}`,path==='snapshot'?['view','shape']:path==='strings-fast'?['shape']:[]] as [string,string[]]),
  ...['topology/active','snapshot/topology','system/boot-status','ems/connection-status','diagnostic-session/status','capabilities','cache/status','corrective-actions/matrix','settings/site-health-visual-thresholds'].map(path=>[`/api/local/${path}`,[]] as [string,string[]]),
  ['/api/local/troubleshooting/library',[]],
  ['/api/local/topology/active',['view']],
  ['/api/local/corrective-guidance',[]],
  ['/api/local/history/events',['range']],
  ['/api/local/site-data/cells',['metric','array']],
  ['/api/local/site-data/cells/snapshot',['metric','array','at']],
  ['/api/local/site-data/cells/history',['metric','array','from','to','ids']],
  ['/api/local/site-data/cells/index',['from','to','after','limit']],
  ['/api/local/site-data/analytics',[]],
]);
export const reviewOrigin='http://127.0.0.1:3205';
export function trustedReviewRequest(host:string|undefined,origin:string|undefined,fetchSite:string|undefined){
  return host==='127.0.0.1:3205'&&(!origin||origin===reviewOrigin)&&(!fetchSite||fetchSite==='same-origin'||fetchSite==='none');
}
export function reviewReadPath(method:string,raw:string):string|null{
  if(method!=='GET'||!raw.startsWith('/api/')||raw.includes('\\')||raw.includes('#'))return null;
  const url=new URL(raw,reviewOrigin);
  // Reject normalization, encoded path separators, traversal, and arbitrary destinations.
  if(url.origin!==reviewOrigin||raw.split('?')[0]!==url.pathname||/%|\/\//.test(url.pathname))return null;
  const keys=reads.get(url.pathname);
  if(!keys)return null;
  for(const [key,value] of url.searchParams){
    if(!keys.includes(key)||url.searchParams.getAll(key).length!==1)return null;
    if(url.pathname==='/api/local/topology/active'&&value!=='profile')return null;
    if(url.pathname.startsWith('/api/local/site-data/cells')){
      if(key==='metric'&&!['millivolts','temperatureF'].includes(value))return null;
      if(key==='array'&&(!/^\d{1,2}$/.test(value)||Number(value)<1||Number(value)>64))return null;
      if(['from','to','at','after'].includes(key)&&!/^\d{13}$/.test(value))return null;
      if(key==='limit'&&(!/^\d{1,4}$/.test(value)||Number(value)<1||Number(value)>1000))return null;
      if(key==='ids'&&value!==''&&(!/^(A\d{1,2}-S\d{1,3}-B\d{1,2}-C\d{1,3})(,A\d{1,2}-S\d{1,3}-B\d{1,2}-C\d{1,3}){0,7}$/.test(value)))return null;
    }else if(!/^[-a-z0-9]{1,64}$/.test(value))return null;
  }
  if(url.pathname.endsWith('/cells/history')){const from=Number(url.searchParams.get('from')),to=Number(url.searchParams.get('to'));if(!from||!to||to<from||to-from>7*86400000)return null;}
  return url.pathname+(url.searchParams.size?'?'+url.searchParams.toString():'');
}
export function assertReviewSite(value:unknown){
  const data=value as {siteIdentity?:{stationCode?:string;blockIndex?:number};warming?:boolean};
  if(data?.warming||data?.siteIdentity?.stationCode!=='BHE0020'||data.siteIdentity.blockIndex!==1)throw new Error('Solar Star 3 identity could not be verified.');
}
