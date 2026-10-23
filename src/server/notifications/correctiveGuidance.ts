import fs from 'node:fs';
import path from 'node:path';
import {Router} from 'express';
import {correctiveGuidanceKey,emptyCorrectiveGuidance,type CorrectiveGuidanceState,type CorrectiveGuidanceEntry} from '../../core/correctiveGuidance';
import type {NotificationReview} from './notificationReview';
import {emptyTroubleshooting} from './notificationTroubleshooting';

export class GuidanceConflict extends Error {}
const text=(v:unknown,max:number,label:string)=>{if(typeof v!=='string'||v.trim().length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw Error(`Invalid ${label}`);return v.trim();};
export function validateGuidance(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Guidance fields required');
  const p=value as Record<string,unknown>;
  if(Object.keys(p).sort().join(',')!=='actions,category,clearing,key,reason,reference,validation')throw Error('Only presentation guidance fields can be changed');
  const key=text(p.key,600,'key');const identity=JSON.parse(key);
  if(!Array.isArray(identity)||identity.length!==2||identity.some(v=>typeof v!=='string'||!v.trim())||JSON.stringify(identity)!==key)throw Error('Exact fault identity required');
  const lines=(v:unknown,label:string)=>{if(!Array.isArray(v)||v.length>30)throw Error(`Invalid ${label}`);return v.map(t=>text(t,2000,label)).filter(Boolean);};
  const category=text(p.category,80,'category'),reason=text(p.reason,1000,'reason'),reference=text(p.reference,500,'reference');
  if(!category||!reason||!reference)throw Error('Category, reference and change reason are required');
  return {key,category,reason,reference,actions:lines(p.actions,'actions'),validation:lines(p.validation,'validation'),clearing:lines(p.clearing,'clearing')};
}
export class CorrectiveGuidanceStore {
  private cached?:{fingerprint:string;state:CorrectiveGuidanceState};
  constructor(readonly file:string,readonly shared=false){}
  read():CorrectiveGuidanceState {
    if(!fs.existsSync(this.file)){this.cached=undefined;return emptyCorrectiveGuidance();}
    const stat=fs.statSync(this.file),fingerprint=[stat.ino,stat.mtimeMs,stat.size].join(':');
    if(stat.size>16*1024*1024)throw Error('Guidance file exceeds supported size');
    if(this.cached?.fingerprint===fingerprint)return this.cached.state;
    const state=JSON.parse(fs.readFileSync(this.file,'utf8')) as CorrectiveGuidanceState;
    if(state.version!==1||!Number.isSafeInteger(state.revision)||!state.entries||!Array.isArray(state.history))throw Error('Invalid guidance storage');
    for(const e of Object.values(state.entries))validateGuidance({key:e.key,category:e.category,reason:e.reason,reference:e.reference,actions:e.actions,validation:e.validation,clearing:e.clearing});
    this.cached={fingerprint,state};return state;
  }
  save(revision:number,patch:unknown,actor:string,reset=false){
    // Multiple collectors can share this catalog. Lock before the revision read;
    // a crashed writer leaves a visible, fail-closed lock for administrator review.
    fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:this.shared?0o770:0o700});
    const lock=this.file+'.lock';
    try{fs.mkdirSync(lock,{mode:0o700});}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw new GuidanceConflict('Guidance is being updated or a prior writer was interrupted. Retry; ask an administrator to review a persistent lock.');throw e;}
    try{return this.saveLocked(revision,patch,actor,reset);}finally{fs.rmdirSync(lock);}
  }
  private saveLocked(revision:number,patch:unknown,actor:string,reset:boolean){
    const value=validateGuidance(patch),state=structuredClone(this.read());
    if(revision!==state.revision)throw new GuidanceConflict('Guidance changed since you opened it. Reload before saving.');
    const at=new Date().toISOString(),previous=state.entries[value.key]??null;
    const next:CorrectiveGuidanceEntry|null=reset?null:{...value,updatedAt:at,updatedBy:actor};
    if(next)state.entries[value.key]=next;else delete state.entries[value.key];
    state.revision++;state.history.push({revision:state.revision,at,actor,key:value.key,reason:value.reason,previous,next});
    const body=JSON.stringify(state);if(Buffer.byteLength(body)>16*1024*1024)throw Error('Guidance audit storage is full; archive it before editing');
    fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
    const tmp=this.file+'.tmp';
    // Never follow an existing temporary file or silently replace a crash remnant.
    fs.writeFileSync(tmp,body,{mode:this.shared?0o660:0o600,flag:'wx'});
    fs.chmodSync(tmp,this.shared?0o660:0o600);fs.renameSync(tmp,this.file);
    return state;
  }
}
export function applyCorrectiveGuidance(review:NotificationReview,state:CorrectiveGuidanceState,shared?:CorrectiveGuidanceState):NotificationReview {
  return {...review,guidanceRevision:state.revision,guidanceSharedRevision:shared?.revision??0,groups:review.groups.map(group=>{
    const key=correctiveGuidanceKey(group),local=state.entries[key],override=local??shared?.entries[key];if(!override)return group;
    const scope=local?'site':'shared',revision=local?state.revision:shared!.revision;
    const targetIds=group.targets.map(t=>t.id),base=group.troubleshooting??emptyTroubleshooting();
    const lines=(values:string[])=>values.map(text=>({text,targetIds,advisory:false}));
    return {...group,displayCategory:override.category,guidanceOverride:override,guidanceScope:scope as 'site'|'shared',
      troubleshooting:{...base,actions:lines(override.actions),validation:lines(override.validation),clearing:lines(override.clearing),
        sources:[...base.sources,{label:`${scope==='shared'?'Shared':'Site-specific'} administrator guidance: ${override.reference} · revision ${revision} · ${override.updatedAt}`,entryId:null,advisory:false,targetIds}]}};
  })};
}
export const correctiveGuidanceStore=new CorrectiveGuidanceStore(path.resolve(process.cwd(),'.prizm-data/corrective-guidance.json'));
export type SharedGuidance={store:CorrectiveGuidanceStore;sites:string[]};
function configuredShared():SharedGuidance|undefined {
  const file=process.env.PRIZM_CORRECTIVE_SHARED_FILE;
  if(!file)return undefined;
  if(!path.isAbsolute(file))throw Error('Shared corrective catalog requires an absolute path');
  const sites=(process.env.PRIZM_CORRECTIVE_SHARED_SITES??'').split(',').map(s=>s.trim()).filter(Boolean);
  if(sites.length<2||sites.length>20||new Set(sites).size!==sites.length)throw Error('Explicit shared guidance site labels required');
  return {store:new CorrectiveGuidanceStore(file,true),sites};
}
export const sharedCorrectiveGuidance=configuredShared();
export function createCorrectiveGuidanceRouter(store=correctiveGuidanceStore,shared=sharedCorrectiveGuidance){
  const router=Router();
  router.get('/',(_req,res)=>{try{
    const local=store.read(),catalog=shared?.store.read(),canEdit=process.env.PRIZM_CORRECTIVE_GUIDANCE!=='false'&&!!res.locals.prizmGuidanceActor;
    res.json({revision:local.revision,canEdit,sharedRevision:catalog?.revision??0,
      sharedSites:shared?.sites??[],canEditShared:canEdit&&!!shared&&res.locals.prizmGuidanceShared===true,
      ...(canEdit?{localKeys:Object.keys(local.entries),sharedKeys:Object.keys(catalog?.entries??{})}:{})});
  }catch{res.status(503).json({error:'Guidance storage needs review; edits are disabled'});}});
  router.put('/',(req,res)=>{
    if(process.env.PRIZM_CORRECTIVE_GUIDANCE==='false')return res.status(503).json({error:'Corrective guidance editing is disabled'});
    const actor=res.locals.prizmGuidanceActor;
    if(typeof actor!=='string'||!actor)return res.status(403).json({error:'A local administrator workspace is required'});
    try{
      const keys=req.body&&Object.keys(req.body).sort().join(',');
      if(!['entry,reset,revision','entry,reset,revision,scope'].includes(keys)||typeof req.body.reset!=='boolean'||!['site','shared'].includes(req.body.scope??'site'))throw Error('Invalid save request');
      const scope=req.body.scope??'site';
      if(scope==='shared'&&(!shared||res.locals.prizmGuidanceShared!==true))return res.status(403).json({error:'Local administrator access to every shared site is required'});
      (scope==='shared'?shared!.store:store).save(req.body.revision,req.body.entry,actor,req.body.reset);
      res.json({revision:store.read().revision,sharedRevision:shared?.store.read().revision??0,saved:true,scope});
    }catch(error){res.status(error instanceof GuidanceConflict?409:400).json({error:error instanceof Error?error.message:'Unable to save guidance'});}
  });return router;
}
