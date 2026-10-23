import assert from 'node:assert/strict';
import {initializeFleetWorkspace} from './fleetWorkspace';

// Browser boundary fixture: fetch is an in-memory recorder, never a network call.
const origin='https://prizm.example.test',calls:Request[]=[];
const context={siteId:'ss3',siteName:'SS3',stationCode:'LAB',blockIndex:1,email:'operator@example.test',csrf:'a'.repeat(43),fullControl:true,remoteReadOnly:false,remoteAccess:true,fleetUrl:origin+'/fleet/'};
const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
const mockWindow={location:{origin,href:origin+'/desktop/ss3/',pathname:'/desktop/ss3/',port:''},
 fetch:async(input:RequestInfo|URL,init?:RequestInit)=>{
  const req=new Request(typeof input==='string'?new URL(input,origin):input,init);
  if(req.url===origin+'/desktop/ss3/api/fleet/workspace-context')return Response.json(context);
  calls.push(req);return Response.json({synthetic:true});
 },addEventListener(){},dispatchEvent(){return true;}};
Object.defineProperty(globalThis,'window',{value:mockWindow,configurable:true});
Object.defineProperty(globalThis,'document',{value:{documentElement:{dataset:{}}},configurable:true});
try{
 await initializeFleetWorkspace();
 const body=JSON.stringify({synthetic:true});
 await mockWindow.fetch(new Request(origin+'/api/local/ems-apps/power-control',{method:'POST',headers:{'Content-Type':'application/json'},body}));
 assert.equal(calls[0].url,origin+'/desktop/ss3/api/local/ems-apps/power-control');
 assert.equal(calls[0].method,'POST');assert.equal(await calls[0].text(),body);
 assert.equal(calls[0].headers.get('X-Prizm-Csrf'),context.csrf);
 assert.equal(calls[0].headers.get('Content-Type'),'application/json');
 await mockWindow.fetch('/api/local/site-data/snapshot?refresh=true');
 assert.equal(calls[1].url,origin+'/desktop/ss3/api/local/site-data/snapshot');
 await mockWindow.fetch('https://unrelated.example.test/public');
 assert.equal(calls[2].headers.get('X-Prizm-Csrf'),null);
 assert.equal(calls.length,3,'One fetch per submission; no client retry');
 console.log('PASS remote request rewriting: method/body/headers preserved, published read does not force refresh, no off-origin CSRF, no retries');
}finally{
 if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');
 if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document');
}
