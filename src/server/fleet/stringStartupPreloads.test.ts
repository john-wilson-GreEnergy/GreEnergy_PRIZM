import assert from 'node:assert/strict';
import {isStringStartupRequest,stringStartupHtml} from './stringStartupPreloads';
const html='<html><head><script type="module" src="/assets/workspace-a.js"></script><link rel="modulepreload" href="/assets/react-a.js"></head><body></body></html>';
const modules=new Map([
 ['workspace-a.js','const lazy=()=>import("./StringDashboard-a.js");'],
 ['StringDashboard-a.js','import {a} from "./react-a.js";import "./rows-a.js";import {b} from "./history-toggle-a.js";'],
 ['react-a.js','export const a=1;'],['rows-a.js','import {a} from "./react-a.js";'],
 ['history-toggle-a.js','const lazy=()=>import("./HistoryChart-a.js");'],
 ['HistoryChart-a.js','throw new Error("must stay lazy")'],
]);
const result=stringStartupHtml(html,modules)!;
assert(result.includes('href="/assets/StringDashboard-a.js"'));
assert(result.includes('href="/assets/rows-a.js"'));
assert(result.includes('href="/assets/history-toggle-a.js"'));
assert(!result.includes('HistoryChart-a.js'));
assert.equal(result.match(/href="\/assets\/react-a.js"/g)?.length,1);
assert.equal(stringStartupHtml('<body>legacy</body>',modules),null);
assert.equal(stringStartupHtml(html,new Map()),null);
assert.equal(stringStartupHtml(html,new Map([...modules].filter(([name])=>name!=='rows-a.js'))),null);
assert.equal(stringStartupHtml(html,new Map([...modules,['workspace-a.js','"StringDashboard-a.js";"StringDashboard-b.js"']])) ,null);
assert.equal(isStringStartupRequest('/?tab=arrays-strings'),true);
assert.equal(isStringStartupRequest('/desktop/solar-star-4/?tab=arrays-strings'),true);
for(const url of ['/?tab=overview','/','/?tab=arrays-strings&tab=overview','/?tab=arrays-strings-more'])assert.equal(isStringStartupRequest(url),false);
console.log('PASS string startup static graph: bounded, missing/ambiguous fallback, cycle dedupe, history stays lazy, exact view selection');
