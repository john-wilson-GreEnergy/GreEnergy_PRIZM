import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function tree(root){
 const result={};
 for(const n of fs.readdirSync(root).sort()){
  const file=path.join(root,n),stat=fs.lstatSync(file);
  assert(!stat.isSymbolicLink(),'Symlinks are not portable baseline files: '+file);
  if(stat.isDirectory())for(const[k,v]of Object.entries(tree(file)))result[n+'/'+k]=v;
  else{assert(stat.isFile());result[n]=hash(fs.readFileSync(file));}
 }
 return result;
}
export function verify(root,expected){assert.deepEqual(tree(root),expected,'Baseline files differ: '+root);}
export function sourceFiles(root){
 const files=[];
 const extensions=/\.(?:ts|tsx|js|jsx|mjs|cjs|css|scss|html|svg|png|jpg|jpeg|webp|ico|sh|py|ps1|bat|cmd|service|socket|timer|sudoers)$/;
 function scan(relative){for(const name of fs.readdirSync(path.join(root,relative)).sort()){
  if(name.startsWith('.')||['node_modules','dist','build','data','site-files','__fixtures__','fixtures','artifacts','production-baselines'].includes(name))continue;
  const r=path.join(relative,name),stat=fs.lstatSync(path.join(root,r));
  if(stat.isSymbolicLink())continue;
  if(stat.isDirectory())scan(r);else if(stat.isFile()&&extensions.test(name))files.push(r);
 }}
 for(const dir of ['src','scripts','public','assets','provisioning/templates','deployment/linux','app/applet'])if(fs.existsSync(path.join(root,dir)))scan(dir);
 for(const n of fs.readdirSync(root).sort())if(/^(?:package(?:-lock)?\.json|tsconfig(?:\.[\w-]+)?\.json|.*\.config\.(?:ts|js|mjs|cjs)|server\.ts|index\.html|fleet\.html|signin\.html|mobile\.html|AGENTS\.md|README\.md|\.gitignore|\.npmrc)$/.test(n)&&n!=='.npmrc')files.push(n);
 return [...new Set(files)].sort();
}
