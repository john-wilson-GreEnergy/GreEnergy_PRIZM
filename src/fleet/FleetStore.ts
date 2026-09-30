import type {FleetView} from '../core/fleet/model';
type Session={email:string;csrf:string;idleExpiresAt:number;simulated:boolean};
export interface FleetState {session:Session|null;view:FleetView|null;loading:boolean;error:string|null;checking:boolean}
/** One browser subscriber service; components never poll and no credentials are persisted. */
export class FleetStore {
  private state:FleetState={session:null,view:null,loading:false,error:null,checking:true};
  private listeners=new Set<()=>void>();
  private timer:ReturnType<typeof setTimeout>|undefined;
  private abort:AbortController|undefined;
  private generation=0;
  private lastTouch=0;
  constructor(private request:typeof fetch=(input,init)=>fetch(input,init)){}
  getSnapshot=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  private publish(patch:Partial<FleetState>){this.state={...this.state,...patch};for(const listener of this.listeners)listener();}
  private async json(path:string,options:RequestInit={},signal?:AbortSignal){
    const response=await this.request('/api/fleet/'+path,{...options,signal,credentials:'same-origin',cache:'no-store'});
    if(response.status===401)throw new Error('SIGN_IN');
    if(!response.ok)throw new Error('Request unavailable. Please try again.');
    return response.json();
  }
  async start(){
    this.stop();const generation=this.generation;
    try{const session=await this.json('session') as Session;if(generation!==this.generation)return;this.publish({session,checking:false,error:null});void this.poll(generation);}
    catch{if(generation===this.generation)this.publish({session:null,view:null,checking:false});}
  }
  stop(){this.generation++;clearTimeout(this.timer);this.abort?.abort();}
  async login(email:string,password:string){
    this.publish({loading:true,error:null});
    try{await this.json('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});await this.start();}
    catch{this.publish({error:'Sign-in unsuccessful. Check your credentials or try again shortly.'});}
    finally{this.publish({loading:false});}
  }
  async logout(){
    const csrf=this.state.session?.csrf;this.stop();
    this.publish({session:null,view:null,checking:false,error:null});
    try{await this.json('logout',{method:'POST',headers:{'X-Prizm-Csrf':csrf ?? ''}});}catch{/* Local data stays cleared. */}
  }
  activity=()=>{
    if(!this.state.session || Date.now()-this.lastTouch<60000)return;this.lastTouch=Date.now();
    void this.json('touch',{method:'POST',headers:{'X-Prizm-Csrf':this.state.session.csrf}}).catch(()=>{});
  };
  private async poll(generation:number){
    const controller=new AbortController();this.abort=controller;const timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const view=await this.json('summary',{},controller.signal) as FleetView;
      if(generation!==this.generation)return;
      if(view.schema!=='prizm-fleet-v1' || view.readOnly!==true || !Array.isArray(view.sites))throw new Error('Invalid fleet response');
      this.publish({view,error:null});
    }catch(error){
      if(generation!==this.generation)return;
      // Do not keep showing a green/current cached total after a transport failure.
      if(error instanceof Error && error.message==='SIGN_IN'){this.stop();this.publish({session:null,view:null,error:'Your session ended. Sign in again.'});return;}
      this.publish({view:null,error:'Fleet connection unavailable. Current totals are withheld until it recovers.'});
    }finally{clearTimeout(timeout);}
    if(generation===this.generation)this.timer=setTimeout(()=>void this.poll(generation),4000);
  }
}
export const fleetStore=new FleetStore();
