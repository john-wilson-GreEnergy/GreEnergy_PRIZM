import assert from 'node:assert/strict';
import router, {buildSafetyFaultCandidateSnapshot} from './safetyFaultClear';
import {ProfileStore} from './profiles/profileStore';

// Invoke the actual route with an injected transport; never open a socket or start the collector.
const handler = router.stack.find(layer => layer.route?.path === '/execute')!.route!.stack[0].handle;
const getProfile = ProfileStore.getActiveProfile;
ProfileStore.getActiveProfile = () => ({id:'fixture',emsHost:'equipment.invalid',emsPort:8080,turtlePath:'/turtle',stationCode:'TEST',blockIndex:1}) as ReturnType<typeof getProfile>;
const entity = {entityKey:'SK-ST:TEST-B:1-A:4-S:5',displayKey:'String 5',statusMessage:'Door fault',allowFaultReset:true,enabled:true,communicating:true};
const candidate = buildSafetyFaultCandidateSnapshot({}, {topology:[entity]}).eligible[0];
assert.equal(candidate.equipment?.array,'Array 4'); assert.equal(candidate.equipment?.segment,'ES3 / String 5');
const originalFetch = globalThis.fetch;
async function invoke(body: object, before = entity, after: typeof entity | null = entity,
  options: {block?: unknown; lastCall?: unknown; failedFeed?: 'block'|'lastCall'; failAfter?: boolean} = {}) {
  let posts = 0; let responseStatus = 200; let result: Record<string, any> = {};
  globalThis.fetch = async (url, init) => {
    assert(String(url).startsWith('http://equipment.invalid:8080/turtle/'));
    if (init?.method === 'POST') {posts++; return new Response('Queued');}
    const feed = String(url).endsWith('/lastCall.json') ? 'lastCall' : 'block';
    if (options.failedFeed === feed && (!options.failAfter || posts > 0)) return new Response('Unavailable',{status:503});
    if (feed === 'lastCall') return new Response(JSON.stringify(options.lastCall ?? {topology:(posts ? after : before) ? [posts ? after : before] : []}));
    return new Response(JSON.stringify(options.block ?? {}));
  };
  const res = {status(n:number){responseStatus=n;return this;},json(value:Record<string, any>){result=value;return this;}};
  await handler({body:{profileId:'fixture',entityKeyToken:candidate.entityKeyToken,confirmationText:'CLEAR FAULT',...body}} as never,res as never,()=>{});
  return {posts,responseStatus,result};
}
try {
  for (const body of [{profileId:'other'},{confirmationText:'bad'},{expectedStatusMessage:'Changed'},{expectedDisplayKey:'Wrong target'},{expectedResetEntityKey:'Other device'}]) {
    const result = await invoke(body); assert.equal(result.posts,0); assert(result.responseStatus>=400);
  }
  for (const before of [{...entity,allowFaultReset:false},{...entity,enabled:false},{...entity,communicating:false}]) {
    assert.equal((await invoke({},before)).posts,0);
  }
  for (const options of [
    {block:{nested:{...entity,allowFaultReset:false}}},
    {lastCall:{nested:[entity,{...entity,allowFaultReset:false}]}},
    {lastCall:{nested:[{...entity,allowFaultReset:false},entity]}},
    {block:{nested:{...entity,entityKeyToken:'WRONG_ID'}}},
    {failedFeed:'block' as const}, {failedFeed:'lastCall' as const},
  ]) {
    const rejected = await invoke({},entity,entity,options);
    assert.equal(rejected.posts,0); assert.equal(rejected.responseStatus,409);
  }
  const disappeared = await invoke({},entity,null);
  assert.equal(disappeared.posts,1); assert.equal(disappeared.result.queued,true); assert.equal(disappeared.result.verification.appearsCleared,false);
  const cleared = await invoke({},entity,{...entity,allowFaultReset:false});
  assert.equal(cleared.result.verification.appearsCleared,true);
  const offline = await invoke({},entity,{...entity,allowFaultReset:false,communicating:false});
  assert.equal(offline.result.verification.appearsCleared,false);
  const partial = await invoke({},entity,{...entity,allowFaultReset:false},{failedFeed:'block',failAfter:true});
  assert.equal(partial.result.verification.appearsCleared,false);
  console.log('Actual safety route: target/status checks and clearance evidence passed; every equipment request was mocked.');
} finally {globalThis.fetch=originalFetch;ProfileStore.getActiveProfile=getProfile;}
