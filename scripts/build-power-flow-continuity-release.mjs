/** Presentation-only follow-up to the now-active profile-controls release. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
const [base,reviewed,out]=process.argv.slice(2).map(p=>path.resolve(p));
assert(base&&reviewed&&out&&!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const[k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else{assert(s.isFile());r[n]=sha(fs.readFileSync(p));}}return r;}
const baseline=JSON.parse(fs.readFileSync(path.dirname(base)+'/profiles-manifest.json'));
assert.equal(sha(fs.readFileSync(path.dirname(base)+'/profiles-manifest.json')),'e671a922c6f897eecf629f3580dd2f1229b13e17188e355a7c5b73f8a2b0b452');
const reviewedManifest=JSON.parse(fs.readFileSync(path.dirname(reviewed)+'/profiles-manifest.json'));
assert.equal(sha(fs.readFileSync(path.dirname(reviewed)+'/profiles-manifest.json')),'d42147ad7090a35cf7735818a7577bf809bbda41a102a63c25e3f1fddb48854c');
const before=tree(base);assert.deepEqual(before,baseline.after);fs.cpSync(base,out,{recursive:true});
const entries=['index.html','fleet.html','mobile.html','signin.html'],all=fs.readdirSync(base+'/assets'),active=new Set(),queue=entries.map(f=>fs.readFileSync(base+'/'+f,'utf8'));
while(queue.length){const s=queue.pop();for(const n of all)if(!active.has(n)&&s.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(base+'/assets/'+n,'utf8'));}}
const flow=baseline.assets.flow;assert(active.has(flow));
const replacement=fs.readFileSync(reviewed+'/assets/'+reviewedManifest.assets.flow);
assert.equal(sha(replacement),reviewedManifest.after['assets/'+reviewedManifest.assets.flow]);
const texts=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,n===flow?replacement.toString():fs.readFileSync(base+'/assets/'+n,'utf8')]));
const rename=new Map([...texts.keys()].map(n=>[n,n.replace(/\.js$/,'-continuity21.js')]));
const rewrite=s=>{for(const[a,b]of rename)s=s.replaceAll(a,b);return s;};
for(const[old,next]of rename){const s=rewrite(texts.get(old));parse(s,{sourceType:'module'});fs.writeFileSync(out+'/assets/'+next,s);}
const css=reviewedManifest.assets.flowCss,cssBytes=fs.readFileSync(reviewed+'/assets/'+css);assert.equal(sha(cssBytes),reviewedManifest.after['assets/'+css]);fs.writeFileSync(out+'/assets/'+css,cssBytes);
for(const f of entries){const html=rewrite(fs.readFileSync(base+'/'+f,'utf8'));assert.equal(html.split('</head>').length,2);fs.writeFileSync(out+'/'+f,html.replace('</head>',`<link rel="stylesheet" href="/assets/${css}">\n</head>`));}
const after=tree(out),changed=Object.keys(after).filter(p=>before[p]!==after[p]).sort();
assert(changed.every(p=>entries.includes(p)||p==='assets/'+css||p.startsWith('assets/')&&p.endsWith('-continuity21.js')));
for(const p of Object.keys(before).filter(p=>!entries.includes(p)))assert.equal(after[p],before[p],'Existing file preserved: '+p);
const manifest={schema:1,scope:'Animation presentation only; no backend, permissions, acquisition or control changes',before,after,changed,assets:{flow:rename.get(flow),flowCss:css}};
fs.writeFileSync(path.dirname(out)+'/continuity-manifest.json',JSON.stringify(manifest,null,2));
// Alias lets the same synthetic browser fixture inspect the exact component.
fs.writeFileSync(path.dirname(out)+'/profiles-manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({changed:changed.length,manifest:sha(fs.readFileSync(path.dirname(out)+'/continuity-manifest.json')),allExistingScriptsPreserved:true}));
