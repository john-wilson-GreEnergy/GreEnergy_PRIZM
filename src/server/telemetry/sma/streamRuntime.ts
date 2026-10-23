import {loadStreamConfig,type SmaStreamConfig,type SmaStreamTarget} from './streamConfig';
import {StreamPoints} from './streamProtocol';
import {SmaSessionError,SmaStreamSession} from './streamSession';

type Site={stationCode:string;blockCode:string};
type Worker={target:SmaStreamTarget;points:StreamPoints;session:SmaStreamSession|null;attempts:number;nextAt:number;blocked:boolean;status:string};
export const reconnectDelay=(attempt:number)=>Math.min(300_000,5000*2**Math.min(6,Math.max(0,attempt-1)));
export const matchesStreamSite=(config:Site,site:Site|null|undefined)=>!!site && config.stationCode===site.stationCode && config.blockCode===site.blockCode;
export class SmaStreamRuntime {
  private workers:Worker[];
  private stopped=false;
  private bound=false;
  constructor(private config:SmaStreamConfig,private factory=(t:SmaStreamTarget,p:StreamPoints)=>new SmaStreamSession(t,p)){
    this.workers=config.targets.map(target=>({target,points:new StreamPoints(target.deviceId),session:null,attempts:0,nextAt:0,blocked:false,status:'pending'}));
  }
  tick(site:Site|null|undefined,now=Date.now()){
    if(this.stopped)return;
    this.bound=matchesStreamSite(this.config,site);
    for(const w of this.workers){
      if(!this.bound){w.session?.stop();w.points.end();continue;}
      if(w.session || w.blocked || now<w.nextAt)continue;
      const session=this.factory(w.target,w.points);w.session=session;w.status='connecting';w.attempts++;
      void session.run().catch(e=>{
        const code=e instanceof SmaSessionError?e.code:'transport';
        w.status=code;w.blocked=['authentication','certificate','subscription','protocol'].includes(code);
        // Never log upstream response bodies, cookies, passwords, or config.
        const diagnostic=e instanceof SmaSessionError?` stage=${e.stage} reason=${e.reason}${Number.isFinite(e.detail)?' detail='+e.detail:''}`:'';
        console.warn(`[SMA stream] Array ${w.target.array}: ${code}${diagnostic}${w.blocked?'; stopped until configuration/restart':' ; reconnect delayed'}`);
      }).finally(()=>{w.session=null;w.points.end();w.nextAt=Date.now()+reconnectDelay(w.attempts);});
      // Stagger initial/reconnect logins across configured devices.
      break;
    }
  }
  snapshots(site:Site|null|undefined){
    if(this.stopped || !this.bound || !matchesStreamSite(this.config,site))return [];
    return this.workers.map(w=>({array:w.target.array,host:w.target.host,points:w.points.snapshot(),status:w.points.connected?'connected':w.status}));
  }
  stop(){this.stopped=true;for(const w of this.workers){w.session?.stop();w.points.end();w.target.password='';}}
}
let runtime:SmaStreamRuntime|null=null,loaded=false;
export function tickSmaStreams(site:Site|null|undefined){
  if(!loaded){loaded=true;try{const config=loadStreamConfig();if(config)runtime=new SmaStreamRuntime(config);}catch{console.error('[SMA stream] Disabled: invalid configuration, key, or private-file permissions');}}
  runtime?.tick(site);
}
export function getSmaStreams(site:Site|null|undefined){return runtime?.snapshots(site)??[];}
export function stopSmaStreams(){runtime?.stop();runtime=null;}
