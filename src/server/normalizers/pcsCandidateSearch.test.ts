import assert from 'node:assert/strict';
import {findPcsCandidates} from './pcsCandidateSearch';
const candidate={arrayIndex:1,pcsIndex:1,soc:0,alarm:true};
const shared={pcs:[candidate],scalarPcs:false,unknownConverter:null};
for (const source of [null,0,[],[null,1,{INVERTER:shared}],{first:shared,second:shared},
  {scalarPCS:'offline',unrelated:{deep:{pcs:[null,false,candidate]}}}]) {
  assert.deepEqual(findPcsCandidates({block:source},true),findPcsCandidates({block:source},false));
}
const root={block:{a:shared,b:shared}};
const result=findPcsCandidates(root,true);
assert.equal(result.pcsCandidates.length,2);
assert.equal(result.pcsCandidates[0],candidate,'Candidates retain source identity and order');
assert.equal(result.pcsCandidates[1],candidate,'Repeated source references are not deduplicated');
assert.deepEqual(findPcsCandidates(root,true),findPcsCandidates(root,false));
console.log('PASS PCS discovery: legacy parity, nested objects/arrays, primitive diagnostics, repeated references, original source identity');
