// Graph presentation only. These IDs never change query/recording targets.
export type TraceVisibility={hidden:string[];only:string|null};
export const allTracesVisible=():TraceVisibility=>({hidden:[],only:null});
export function traceIsVisible(state:TraceVisibility,id:string){
  return state.only!==null?state.only===id:!state.hidden.includes(id);
}
export function toggleTrace(state:TraceVisibility,id:string,targets:string[]):TraceVisibility{
  // Leaving solo mode keeps the displayed line(s), rather than unexpectedly
  // restoring every overlay when the user adds one from the legend.
  const hidden=state.only!==null?targets.filter(target=>target!==state.only):state.hidden;
  return {only:null,hidden:hidden.includes(id)?hidden.filter(target=>target!==id):[...hidden,id]};
}
export function retainTraceVisibility(state:TraceVisibility,targets:string[]):TraceVisibility{
  return {hidden:state.hidden.filter(id=>targets.includes(id)),only:state.only&&targets.includes(state.only)?state.only:null};
}
