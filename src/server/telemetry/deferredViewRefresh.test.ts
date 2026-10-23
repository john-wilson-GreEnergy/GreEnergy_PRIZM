import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {gzipSync,gunzipSync} from 'node:zlib';

// Run the real route and scheduler without importing any acquisition modules.
const source=fs.readFileSync('src/server/siteDataRoutes.ts','utf8');
const scheduler=source.slice(source.indexOf('function deferPublishedViewRefresh'),source.indexOf('const demandedViewKeys'));
const route=source.slice(source.indexOf('siteDataRouter.get("/snapshot",'),source.indexOf('siteDataRouter.get("/published-views/status",'));
for(const legacy of [false,true]) {
 let action:Function|undefined,pending:Function|undefined,scheduled=0,work=0;const order:string[]=[];
 const snapshot={cycleId:2},body=JSON.stringify({cycleId:1,normalized:{strings:[{socPct:0,alarms:['keep']}]}});
 const cached={source:{cycleId:1},json:body,gzip:gzipSync(body),etag:'"old"',publishedAt:'2026-10-21T00:00:00Z'};
 const ctx:any={process:{env:{PRIZM_DEFER_VIEW_REFRESH:legacy?'false':'true'}},console,Buffer,Date,
  deferredPublishedViewRefresh:null,publishedViewBuildInProgress:false,
  setImmediate:(fn:Function)=>{pending=fn;scheduled++;return {unref(){}};},
  publishBrowserViews:()=>{work++;order.push('prepare');return Promise.resolve(true);},
  getSnapshotOrNull:()=>snapshot,demandedViewKeys:new Map(),cachedBrowserSnapshots:new Map([['string-context-v1',cached]]),
  siteDataRouter:{get:(_path:string,fn:Function)=>{action=fn;}}};
 vm.createContext(ctx);
 vm.runInContext(transformSync(scheduler+'\n'+route,{loader:'ts'}).code,ctx);
 const headers:Record<string,string>={};let sent:Buffer|undefined,status=200;
 const response={setHeader:(k:string,v:string)=>headers[k]=v,status:(s:number)=>{status=s;return response;},end:(b?:Buffer)=>{sent=b;order.push('sent');},json:()=>assert.fail('Unexpected route fallback')};
 await action!({query:{view:'arrays-strings',shape:'list-context'},headers:{'accept-encoding':'gzip'}},response);
 assert.equal(gunzipSync(sent!).toString(),body);assert.equal(headers.ETag,'"old"');
 assert.deepEqual(order,legacy?['prepare','sent']:['sent']);
 await action!({query:{view:'arrays-strings',shape:'list-context'},headers:{'if-none-match':'"old"'}},response);
 assert.equal(status,304,'Conditional replies retain their original ETag semantics');
 if(!legacy){assert.equal(scheduled,1,'Concurrent demand coalesces into one scheduled refresh');assert.equal(work,0);pending!();assert.equal(work,1);}
}
console.log('Published view route: cached gzip and 304 respond before deferred work, demand coalesces, rollback preserved.');
