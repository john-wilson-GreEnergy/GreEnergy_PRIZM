import type {ReadOnlyTelemetry} from '../core/security/readOnlyTelemetry';
import {SignInError} from './accessClient';

export interface AccessTelemetryView {data: ReadOnlyTelemetry | null; error: string; stale: boolean; loading: boolean; blocked: boolean}
/** One session-scoped refresh loop. No device acquisition and no idle-session keepalive. */
export class AccessTelemetryStore {
  private view: AccessTelemetryView = {data:null,error:'',stale:true,loading:true,blocked:false};
  private listeners = new Set<()=>void>();
  private generation = 0;
  private running = false;
  private request: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private freshnessTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(private read: (signal: AbortSignal)=>Promise<ReadOnlyTelemetry>,private expired: ()=>void,private visible: ()=>boolean = ()=>true) {}
  getSnapshot = () => this.view;
  subscribe = (listener: ()=>void) => {this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  private emit(view: AccessTelemetryView) {this.view=view;for (const listener of this.listeners) listener();}
  start() {if (this.running) return;this.running=true;this.generation++;void this.refresh();}
  stop() {
    this.running=false;this.generation++;this.request?.abort();this.request=null;
    if (this.timer) clearTimeout(this.timer);this.timer=null;
    if (this.freshnessTimer) clearTimeout(this.freshnessTimer);this.freshnessTimer=null;
    this.emit({data:null,error:'',stale:true,loading:false,blocked:false});
  }
  refresh = async () => {
    if (!this.running || this.request || this.view.blocked) return;
    if (this.timer) clearTimeout(this.timer);this.timer=null;
    const generation = this.generation;
    try {
      if (!this.visible()) {this.emit({...this.view,stale:true});return;}
      const controller = new AbortController();this.request=controller;
      const data = await this.read(controller.signal);
      if (generation !== this.generation) return;
      this.emit({data,error:'',stale:data.stale,loading:false,blocked:false});
      if (this.freshnessTimer) clearTimeout(this.freshnessTimer);
      if (!data.stale) this.freshnessTimer=setTimeout(()=>{
        if (generation===this.generation) this.emit({...this.view,stale:true});
      },Math.max(0,15000-(data.ageMs ?? 15000)));
    } catch (error) {
      if (generation !== this.generation) return;
      const blocked = error instanceof SignInError && [401,403,409].includes(error.status);
      this.emit({data:blocked ? null : this.view.data,error:error instanceof Error ? error.message : 'Telemetry unavailable',stale:true,loading:false,blocked});
      if (error instanceof SignInError && error.status === 401) this.expired();
    } finally {
      if (generation === this.generation) {
        this.request=null;
        if (this.running && !this.view.blocked) this.timer=setTimeout(()=>void this.refresh(),4000);
      }
    }
  };
}
