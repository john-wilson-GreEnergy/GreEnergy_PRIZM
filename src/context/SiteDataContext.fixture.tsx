// Manual browser acceptance fixture. Built separately; never imported by PRIZM.
// All acquisition is mocked: no requests can reach equipment or the real API.
import React, {useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SiteDataProvider, useSiteDataFields} from './SiteDataContext';
let revision=1;
let release: (()=>void) | undefined;
window.fetch=async(input,init)=>{
  const url=String(input);
  if(url==='/api/local/topology/active') {
    await new Promise<void>((resolve,reject)=>{
      release=resolve;
      init?.signal?.addEventListener('abort',()=>reject(new Error('Fixture topology timeout')),{once:true});
    });
    return new Response(JSON.stringify({success:true,profile:{id:'fixture-layout'}}),{headers:{'content-type':'application/json'}});
  }
  if(!url.startsWith('/api/local/site-data/snapshot?'))throw new Error('Fixture blocks all other requests');
  if(new Headers(init?.headers).get('If-None-Match')===`revision-${revision}`)return new Response(null,{status:304});
  return new Response(JSON.stringify({normalized:{},rollups:{},power:revision}),{headers:{'content-type':'application/json',etag:`revision-${revision}`}});
};
const Page=React.memo(function Page(){
  const {snapshot}=useSiteDataFields(['snapshot']);const renders=useRef(0);renders.current++;
  return <section><p>Telemetry: {snapshot?.power ?? 'pending'}</p><p>Heavy page renders: {renders.current}</p></section>;
});
function Shell(){
  const {activeTopologyProfile,topologyError,isInitialLoading,refreshNow,consecutiveFailureCount}=useSiteDataFields(['activeTopologyProfile','topologyError','isInitialLoading','refreshNow','consecutiveFailureCount']);
  const [ticks,setTicks]=useState(0);
  return <main><h1>Isolated PRIZM loading test</h1><p>No equipment access</p>
    <p>Topology: {topologyError?'unavailable':activeTopologyProfile?'ready':'pending'}</p>
    <p>Telemetry loading: {String(isInitialLoading)} · failures: {consecutiveFailureCount}</p>
    <Page/>
    <button onClick={()=>release?.()}>Release topology</button>
    <button onClick={()=>setTicks(n=>n+1)}>Tick shell clock</button><span>Shell ticks: {ticks}</span>
    <button onClick={()=>void refreshNow()}>Refresh unchanged telemetry</button>
    <button onClick={()=>{revision++;void refreshNow();}}>Publish changed telemetry</button>
  </main>;
}
createRoot(document.getElementById('root')!).render(<SiteDataProvider><Shell/></SiteDataProvider>);
