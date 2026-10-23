/** Add remote administration to the exact deployed baseline, not a dirty-tree build. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {transform} from 'esbuild';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default??traverseModule;
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg);assert(!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const result={};for(const n of fs.readdirSync(dir).sort()){const f=dir+'/'+n,s=fs.lstatSync(f);assert(!s.isSymbolicLink());if(s.isDirectory())for(const[k,v]of Object.entries(tree(f)))result[n+'/'+k]=v;else{assert(s.isFile());result[n]=sha(fs.readFileSync(f));}}return result;}
function once(s,a,b){assert.equal(s.split(a).length,2,'Unique boundary: '+a.slice(0,90));return s.replace(a,b);}
function functions(s,ts=false){return new Map(parse(s,{sourceType:'unambiguous',plugins:ts?['typescript']:[]}).program.body.map(n=>n.type==='ExportNamedDeclaration'?n.declaration:n).filter(n=>n?.type==='FunctionDeclaration').map(n=>[n.id.name,s.slice(n.start,n.end)]));}
const before=tree(base);
assert.equal(before['fleet-server.cjs'],'ca494e7e49d86f633a5828691e40350d47c53256ef2c8e7c762eed9d999301b7','Pinned live animation-continuity Fleet');
const selected={'src/server/fleet/mobileApp.ts':['createMobileApp'],'src/server/fleet/adminRoutes.ts':['fleetAdminRouter']};
const names=Object.values(selected).flat();
const definitions=Object.entries(selected).flatMap(([file,chosen])=>{const f=functions(fs.readFileSync(file,'utf8'),true);return chosen.map(n=>{assert(f.has(n));return f.get(n);});}).join('\n');
const deps=['validateFleetOrigin','LocalSessions','AccessError','allowedFetchSite','allowedSiteIds','unavailableHvac','normalizeLocalEmail','mobileSessionToken','fleetSessionToken','manageFleetAccount','listFleetAccounts','parseAdminAction'];
const factory=`module.exports=function(deps){const {${deps.join(',')}}=deps;const express=require('express'),{Router}=express,path=require('node:path'),{readFile}=require('node:fs/promises');const tokenOf=mobileSessionToken,cookieName='prizm_mobile_session';${definitions}\nreturn {${names.join(',')}};};`;
const compiled=(await transform(factory,{loader:'ts',format:'cjs',target:'node24'})).code;
const free=new Set();traverse(parse(compiled),{ReferencedIdentifier(p){if(!p.scope.hasBinding(p.node.name))free.add(p.node.name);}});
assert.deepEqual([...free].filter(n=>!['module','require','Map','Set','WeakMap','Date'].includes(n)).sort(),[],'All factory dependencies bound');
fs.cpSync(base,out,{recursive:true});fs.writeFileSync(out+'/remote-admin.cjs',compiled);
let server=fs.readFileSync(base+'/fleet-server.cjs','utf8');
for(const name of names){const old=functions(server).get(name);assert(old);server=once(server,old,`function ${name}(...args){return __remoteAdmin().${name}(...args);}`);}
const startupBefore='remote = await startRemoteMobile(broker, { publicDirectory: import_node_path9.default.resolve("dist"), workspaceUi, accounts:';
const startupAfter=startupBefore.replace('workspaceUi, accounts:','workspaceUi, adminAccountsFile: process.env.PRIZM_REMOTE_ADMIN === "false" ? undefined : accountsFile, accounts:');
server=once(server,startupBefore,startupAfter);
server+=`\nvar __remoteAdminInstance;function __remoteAdmin(){return __remoteAdminInstance??=(require('./remote-admin.cjs')({${deps.join(',')}}));}\n`;
parse(server);fs.writeFileSync(out+'/fleet-server.cjs',server);
const html=fs.readFileSync(base+'/fleet.html','utf8');
const fleet=/src="\/assets\/(fleet-[^"]+\.js)"/.exec(html)?.[1];assert(fleet);
let fleetSource=fs.readFileSync(base+'/assets/'+fleet,'utf8');
const oldAdmin=/import \{AdminUsers as __ProfileAdminUsers\} from '\.\/([^']+)'/.exec(fleetSource)?.[1];assert(oldAdmin);
const client=/from["']\.\/(client-[^"']+\.js)["']/.exec(fleetSource)?.[1];assert(client);
let admin=fs.readFileSync('src/fleet/AdminUsers.tsx','utf8');
admin=once(admin,"import React,{useEffect,useState} from 'react';",`import {r as React} from './${client}';const {useEffect,useState}=React;`);
assert(server.includes('var FLEET_MIN_PASSWORD_LENGTH = 6;'));
admin=once(admin,"import {FLEET_MIN_PASSWORD_LENGTH} from '../core/security/fleetPasswordPolicy';",'const FLEET_MIN_PASSWORD_LENGTH=6;');
const adminName='AdminUsers-remoteadmin21.js',fleetName='fleet-remoteadmin21.js';
fs.writeFileSync(out+'/assets/'+adminName,(await transform(admin,{loader:'tsx',format:'esm',jsx:'transform',minify:true})).code);
fleetSource=once(fleetSource,oldAdmin,adminName);
fleetSource=once(fleetSource,'return __ProfileAdminUsers(props);','return __ProfileAdminUsers({...props,apiBase:window.location.pathname.startsWith("/fleet/")?"/fleet":""});');
fleetSource=once(fleetSource,'User administration is available through LAN.','Administrators can manage users here with password confirmation.');
parse(fleetSource,{sourceType:'module'});fs.writeFileSync(out+'/assets/'+fleetName,fleetSource);
fs.writeFileSync(out+'/fleet.html',once(html,fleet,fleetName));
const after=tree(out),changed=Object.keys(after).filter(p=>before[p]!==after[p]).sort();
assert.deepEqual(changed,['assets/'+adminName,'assets/'+fleetName,'fleet-server.cjs','fleet.html','remote-admin.cjs'].sort());
assert(Object.keys(before).every(p=>p in after));
for(const file of ['server.cjs','profile-controls.cjs','fleet-entry.cjs','workspace-ui.cjs','snapshot-cache-worker.cjs','index.html','mobile.html'])assert.equal(before[file],after[file],file+' unchanged');
const manifest={schema:1,scope:'Remote User administration only; no telemetry, latency, animation, account grants or equipment changes',before,after,changed,functions:[...names,'main'],startupBefore,startupAfter,assets:{fleet:fleetName,admin:adminName}};
fs.writeFileSync(path.dirname(out)+'/remote-admin-manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({out,changed,collectorAndAnimationFilesUnchanged:true}));
