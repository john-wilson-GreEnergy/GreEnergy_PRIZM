/**
 * Narrow presentation hotfix for already-deployed UI artifacts.
 * The working tree also contains an UNRELEASED navigation migration. Do not
 * ship its build for this hotfix. Instead add native disclosures at verified
 * JSX boundaries in the existing release; all original bytes remain intact.
 * Canonical source equivalents live in BpcListDisclosure and its three users.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import traversePackage from '@babel/traverse';
const traverse=traversePackage.default??traversePackage;
const hash=s=>createHash('sha256').update(s).digest('hex');
function className(n){
  const props=n?.arguments?.[1];
  return props?.type==='ObjectExpression'?props.properties.find(p=>p.key?.name==='className')?.value?.value:undefined;
}
export function patchBpc(source){
  const ast=parse(source,{sourceType:'module'}),edits=[];
  const roots=new Map();
  traverse(ast,{CallExpression(p){
    const cls=className(p.node);
    if(['bpc-review','ops-bpc-workspace','m-quantities'].includes(cls)){
      const f=p.getFunctionParent();assert(f);roots.set(f.node,cls);
    }
  }});
  for(const [fn,kind] of roots){
    const before=edits.length;
    traverse(ast,{CallExpression(p){
      if(p.getFunctionParent()?.node!==fn)return;
      const n=p.node,cls=className(n);
      const table=kind==='bpc-review'&&cls==='table-wrap'||kind==='ops-bpc-workspace'&&cls==='ops-data-scroll';
      const quantities=kind==='m-quantities'&&cls==='m-quantities';
      // Mapping callbacks retain their original keys and per-device disclosures.
      const devices=kind==='m-quantities'&&n.callee?.type==='MemberExpression'&&n.callee.property?.name==='map'&&n.callee.object?.property?.name==='devices';
      if(!table&&!quantities&&!devices)return;
      let jsx=n;
      if(devices){
        const body=n.arguments[0]?.body;assert(body?.type==='CallExpression');jsx=body;
      }
      assert(jsx.callee?.type==='MemberExpression'&&['jsx','jsxs'].includes(jsx.callee.property.name),'Expected production JSX runtime');
      const runtime=source.slice(jsx.callee.object.start,jsx.callee.object.end);
      const isInventory=quantities||table&&source.slice(n.start,n.end).includes('Charge only');
      let label=JSON.stringify(isInventory?'Balancing quantities by BPC number':'Unique BPC list');
      if(devices)label=`"Unique BPC list · "+${source.slice(n.callee.object.start,n.callee.object.end)}.length+" BPCs"`;
      // Fleet inventory total was previously only in the table footer.
      if(kind==='bpc-review'&&isInventory){
        const totals=[];
        p.traverse({MemberExpression(q){if(q.node.property?.name==='total')totals.push(q.node);}});
        assert.equal(totals.length,1);
        const inventory=source.slice(totals[0].object.start,totals[0].object.end);
        label=`"Balancing quantities · "+(${inventory}.partial?"at least ":"")+${source.slice(totals[0].start,totals[0].end)}+" unique BPCs"`;
      }
      const prefix=`${runtime}.jsxs("details",{className:"prizm-bpc-list",children:[${runtime}.jsxs("summary",{children:[${label},${runtime}.jsx("span",{className:"prizm-bpc-expand",children:"Expand"}),${runtime}.jsx("span",{className:"prizm-bpc-collapse",children:"Collapse"})]}),${runtime}.jsx("div",{className:"prizm-bpc-list-body",children:`;
      edits.push({start:n.start,end:n.end,prefix,suffix:'})]})',kind});
      p.skip();
    }});
    assert.equal(edits.length-before,2,`${kind}: expected precisely two list boundaries`);
  }
  edits.sort((a,b)=>a.start-b.start);
  for(let i=1;i<edits.length;i++)assert(edits[i].start>=edits[i-1].end,'Overlapping edit');
  let output='',cursor=0,restored='';
  for(const e of edits){
    output+=source.slice(cursor,e.start)+e.prefix+source.slice(e.start,e.end)+e.suffix;
    restored+=source.slice(cursor,e.end);cursor=e.end;
  }
  output+=source.slice(cursor);restored+=source.slice(cursor);
  assert.equal(restored,source,'Only additive wrappers permitted');
  parse(output,{sourceType:'module'});
  return {output,edits};
}
if(process.argv[2]==='--build'){
  const baseline=path.resolve(process.argv[3]),out=path.resolve(process.argv[4]);
  assert(!fs.existsSync(out),'Use a fresh output directory');
  fs.mkdirSync(out,{recursive:true});
  const manifest={schema:1,scope:'BPC display only; no navigation, server, auth, telemetry or controls',files:[]};
  const css=fs.readFileSync(new URL('../src/components/bpcListDisclosure.css',import.meta.url),'utf8');
  for(const area of ['fleet','site']){
    const dir=path.join(baseline,area,'assets');
    const names=fs.readdirSync(dir),active=new Set(),pending=fs.readdirSync(path.join(baseline,area)).filter(n=>n.endsWith('.html')).map(n=>fs.readFileSync(path.join(baseline,area,n),'utf8'));
    while(pending.length){
      const body=pending.pop();
      for(const name of names)if(!active.has(name)&&body.includes(name)){active.add(name);if(/\.(js|css)$/.test(name))pending.push(fs.readFileSync(path.join(dir,name),'utf8'));}
    }
    assert(active.size>10,'Missing entry HTML / dependency graph');
    for(const name of active){
      const source=fs.readFileSync(path.join(dir,name),'utf8');
      let result=source,wrappers=0;
      if(name.endsWith('.js')&&['bpc-review','ops-bpc-workspace','m-quantities'].some(s=>source.includes(`"${s}"`))){
        const patch=patchBpc(source);result=patch.output;wrappers=patch.edits.length;
      }else if(name.endsWith('.css')&&/^(fleet-|mobile-|workspace-)/.test(name))result=source+'\n'+css;
      if(result===source)continue;
      const file=area+'/assets/'+name;fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});
      fs.writeFileSync(path.join(out,file),result);
      manifest.files.push({file,before:hash(source),after:hash(result),bytes:Buffer.byteLength(result),wrappers});
    }
  }
  assert(manifest.files.some(f=>f.file.startsWith('site/')&&f.wrappers===2));
  for(const prefix of ['fleet/assets/fleet-','fleet/assets/mobile-','fleet/assets/LiveCorrectiveActionsWorkspace-'])
    assert(manifest.files.some(f=>f.file.startsWith(prefix)&&f.wrappers===2),prefix);
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify(manifest,null,2));
}
