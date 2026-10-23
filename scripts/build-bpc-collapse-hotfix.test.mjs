import assert from 'node:assert/strict';
import * as j from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {patchBpc} from './build-bpc-collapse-hotfix.mjs';
function render(source,data){return renderToStaticMarkup(Function('j','data',source+';return View(data)')(j,data));}
const fleet=`function View(d){return j.jsxs("div",{className:"bpc-review",children:[
 j.jsx("p",{children:"Coverage warning remains visible"}),
 j.jsx("div",{className:"table-wrap",children:j.jsxs("table",{children:["Charge only",d.total]})}),
 j.jsx("div",{className:"table-wrap",children:j.jsx("table",{children:"BPC 3"})})]})}`;
const corrective=`function View(d){return j.jsxs("div",{className:"ops-bpc-workspace",children:[
 j.jsx("strong",{children:d.total+" unique BPC candidates"}),
 j.jsx("div",{className:"ops-data-scroll",children:j.jsx("table",{children:"Charge only"})}),
 j.jsx("div",{className:"ops-data-scroll",children:j.jsx("table",{children:"BPC 3"})})]})}`;
const mobile=`function View(s){return j.jsxs("div",{children:[
 j.jsx("strong",{children:"Count and coverage"}),
 j.jsx("div",{className:"m-quantities",children:"BPC 3 quantity"}),
 s.bpcReview==null?void 0:s.bpcReview.devices.map(d=>j.jsx("details",{className:"m-card m-finding",children:d.id},d.id))]})}`;
for(const source of [fleet,corrective,mobile]){
 const {output,edits}=patchBpc(source);assert.equal(edits.length,2);
 const html=render(output,{total:2,bpcReview:{devices:[{id:'one'},{id:'two'}]}});
 assert.equal((html.match(/<details class="prizm-bpc-list">/g)||[]).length,2);
 assert(!html.includes(' open'));
 assert(html.includes('Expand'));assert(html.includes('Collapse'));
 // Removing only our newly inserted bytes restores the deployed file exactly.
 let restored=output;
 for(const e of [...edits].reverse()){
  const offset=edits.filter(other=>other.start<e.start).reduce((sum,other)=>sum+other.prefix.length+other.suffix.length,0);
  const start=e.start+offset;
  restored=restored.slice(0,start)+restored.slice(start+e.prefix.length,start+e.prefix.length+e.end-e.start)+restored.slice(start+e.prefix.length+e.end-e.start+e.suffix.length);
 }
 assert.equal(restored,source);
}
assert(render(patchBpc(mobile).output,{}).includes('Count and coverage'),'Missing BPC review safely preserved');
assert.throws(()=>patchBpc(fleet.replace('className:"table-wrap"','className:"changed"')),'Unknown layout fails closed');
console.log('PASS deployed UI-only patch: native collapsed lists, missing-data guards, original bytes preserved, layout mismatch rejected');
