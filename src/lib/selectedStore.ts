/** Subscribers receive only changes to fields they actually use. */
export class SelectedStore<T extends object> {
  private listeners = new Set<()=>void>();
  constructor(private value: T) {}
  get = () => this.value;
  subscribe = (listener:()=>void) => {this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  publish(value:T) {this.value=value;this.listeners.forEach(listener=>listener());}
  select<K extends keyof T>(keys: readonly K[]) {
    let selected:Pick<T,K> | undefined;
    const get=()=>{
      if(!selected || keys.some(key=>!Object.is(selected![key],this.value[key]))) {
        selected=Object.fromEntries(keys.map(key=>[key,this.value[key]])) as Pick<T,K>;
      }
      return selected;
    };
    return {get,subscribe:(listener:()=>void)=>{
      let previous=get();
      return this.subscribe(()=>{const next=get();if(next!==previous){previous=next;listener();}});
    }};
  }
}
