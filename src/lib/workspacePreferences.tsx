import React,{createContext,useContext,useState,useLayoutEffect,useEffect,useRef} from 'react';

/** Presentation preferences only. Never store authentication, telemetry or command selections. */
export function workspaceScope(identity:{stationCode?:string;blockIndex?:number;activeProfileId?:string}|null|undefined,account='local'){
  return identity?.stationCode&&Number.isInteger(identity.blockIndex)?JSON.stringify([account,identity.stationCode,identity.blockIndex,identity.activeProfileId||'default']):null;
}
export const PreferenceScope=createContext<string|null>(null);
export function preferenceKey(scope:string,name:string){return `prizm.presentation.v1:${scope}:${name}`;}
function compatible(value:unknown,fallback:unknown):boolean{
  if(fallback===null)return value===null||typeof value==='string'||typeof value==='number'&&Number.isFinite(value);
  if(Array.isArray(fallback))return Array.isArray(value)&&value.length<=512&&value.every(v=>typeof v==='string'&&v.length<1000);
  if(typeof fallback==='object')return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(fallback).every(([k,v])=>compatible((value as Record<string,unknown>)[k],v));
  return typeof value===typeof fallback&&(typeof value!=='number'||Number.isFinite(value))&&(typeof value!=='string'||value.length<=2000);
}
export function readPreference<T>(storage:Pick<Storage,'getItem'>,scope:string|null,name:string,fallback:T):T{
  if(!scope)return fallback;
  try{const raw=storage.getItem(preferenceKey(scope,name));if(!raw||raw.length>64000)return fallback;const value=JSON.parse(raw);return compatible(value,fallback)?value:fallback;}catch{return fallback;}
}
export function useScopedPreference<T>(scope:string|null,name:string,fallback:T):[T,React.Dispatch<React.SetStateAction<T>>]{
  const key=scope?preferenceKey(scope,name):null;
  const read=()=>{try{return typeof window==='undefined'?fallback:readPreference(window.localStorage,scope,name,fallback);}catch{return fallback;}};
  const [state,setState]=useState(()=>({key,value:read()}));
  const value=state.key===key?state.value:read();
  if(state.key!==key)setState({key,value}); // Identity change never copies preferences into another site.
  useEffect(()=>{
    const refresh=(event:Event)=>{if(event instanceof CustomEvent&&event.detail?.key===key)setState({key,value:event.detail.value});};
    window.addEventListener('prizm-presentation',refresh);
    return ()=>window.removeEventListener('prizm-presentation',refresh);
  },[key]);
  const set:React.Dispatch<React.SetStateAction<T>>=next=>setState(previous=>{
    const before=previous.key===key?previous.value:read();
    const value=typeof next==='function'?(next as (v:T)=>T)(before):next;
    try{if(key&&JSON.stringify(value).length<=64000)window.localStorage.setItem(key,JSON.stringify(value));}catch{/* Storage unavailable: keep working in memory. */}
    if(key&&typeof window!=='undefined')queueMicrotask(()=>window.dispatchEvent(new CustomEvent('prizm-presentation',{detail:{key,value}})));
    return {key,value};
  });
  return [value,set];
}
export function usePresentation<T>(name:string,fallback:T){return useScopedPreference(useContext(PreferenceScope),name,fallback);}

/** Restore only display position. Stop restoring as soon as the operator interacts. */
export function WorkspaceScroll({page}:{page:string}){
  const scope=useContext(PreferenceScope),last=useRef(0);
  useLayoutEffect(()=>{
    if(!scope)return;
    const name=`scroll:${page}`;let saved=0;try{saved=readPreference(window.sessionStorage,scope,name,0);}catch{}
    let restoring=true,frame=0;
    const store=()=>{if(restoring)return;last.current=window.scrollY;try{sessionStorage.setItem(preferenceKey(scope,name),String(last.current));}catch{}};
    const cancel=()=>{restoring=false;observer.disconnect();};
    const restore=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!restoring)return;window.scrollTo(0,saved);last.current=window.scrollY;if(document.documentElement.scrollHeight-window.innerHeight>=saved)cancel();});};
    const observer=new ResizeObserver(restore);observer.observe(document.body);restore();
    const timeout=window.setTimeout(cancel,5000);
    window.addEventListener('scroll',store,{passive:true});window.addEventListener('wheel',cancel,{passive:true});window.addEventListener('touchstart',cancel,{passive:true});window.addEventListener('keydown',cancel);
    return ()=>{window.clearTimeout(timeout);cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',store);window.removeEventListener('wheel',cancel);window.removeEventListener('touchstart',cancel);window.removeEventListener('keydown',cancel);};
  },[scope,page]);
  return null;
}

export interface ReviewTarget {array:number;string?:number;bpc?:number}
export function targetLink(href:string,scope:string,tab:'arrays-strings'|'cell-history'|'pcs-dashboard',target:ReviewTarget){
  const url=new URL(href);url.searchParams.set('tab',tab);url.searchParams.set('targetSite',scope);
  for(const key of ['array','string','bpc'] as const){url.searchParams.delete('target'+key);if(target[key])url.searchParams.set('target'+key,String(target[key]));}
  url.searchParams.set('returnTo','corrective-actions');return url.pathname+url.search;
}
export function readReviewTarget(search:string,scope:string|null):ReviewTarget|null{
  const q=new URLSearchParams(search);if(!scope||q.get('targetSite')!==scope)return null;
  const number=(key:string)=>{const v=q.get('target'+key);return v&&/^\d{1,4}$/.test(v)&&Number(v)>0?Number(v):undefined;};
  const array=number('array');return array?{array,string:number('string'),bpc:number('bpc')}:null;
}
export function useReviewTarget(){const scope=useContext(PreferenceScope);return typeof window==='undefined'?null:readReviewTarget(window.location.search,scope);}
export function TargetNavigation({target}:{target:ReviewTarget}){
  const scope=useContext(PreferenceScope);if(!scope||typeof window==='undefined')return null;
  return <div className="ops-target-links"><a href={targetLink(window.location.href,scope,'arrays-strings',target)}>Equipment details ↗</a><a href={targetLink(window.location.href,scope,'cell-history',target)}>Cell snapshot & history ↗</a></div>;
}
export function ReturnToResults(){
  const target=useReviewTarget();if(!target||new URLSearchParams(window.location.search).get('returnTo')!=='corrective-actions')return null;
  const url=new URL(window.location.href);url.searchParams.set('tab','corrective-actions');for(const k of ['targetSite','targetarray','targetstring','targetbpc','returnTo'])url.searchParams.delete(k);
  return <div className="ops-return"><a href={url.pathname+url.search}>← Back to corrective-action results</a><span>Array {target.array}{target.string?` · String ${target.string}`:''}{target.bpc?` · BPC ${target.bpc}`:''} · Review context only; no control targets selected</span></div>;
}
