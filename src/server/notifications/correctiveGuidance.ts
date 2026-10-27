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
  constructor(readonly file:string){}
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
    const value=validateGuidance(patch),state=structuredClone(this.read());
    if(revision!==state.revision)throw new GuidanceConflict('Guidance changed since you opened it. Reload before saving.');
    const at=new Date().toISOString(),previous=state.entries[value.key]??null;
    const next:CorrectiveGuidanceEntry|null=reset?null:{...value,updatedAt:at,updatedBy:actor};
    if(next)state.entries[value.key]=next;else delete state.entries[value.key];
    state.revision++;state.history.push({revision:state.revision,at,actor,key:value.key,reason:value.reason,previous,next});
    const body=JSON.stringify(state);if(Buffer.byteLength(body)>16*1024*1024)throw Error('Guidance audit storage is full; archive it before editing');
    fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
    const tmp=this.file+'.tmp';fs.writeFileSync(tmp,body,{mode:0o600});fs.renameSync(tmp,this.file);
    return state;
  }
}
export function applyCorrectiveGuidance(review:NotificationReview,state:CorrectiveGuidanceState):NotificationReview {
  return {...review,guidanceRevision:state.revision,groups:review.groups.map(group=>{
    const override=state.entries[correctiveGuidanceKey(group)];if(!override)return group;
    const targetIds=group.targets.map(t=>t.id),base=group.troubleshooting??emptyTroubleshooting();
    const lines=(values:string[])=>values.map(text=>({text,targetIds,advisory:false}));
    return {...group,displayCategory:override.category,guidanceOverride:override,
      troubleshooting:{...base,actions:lines(override.actions),validation:lines(override.validation),clearing:lines(override.clearing),
        sources:[...base.sources,{label:`Local administrator guidance: ${override.reference} · revision ${state.revision} · ${override.updatedAt}`,entryId:null,advisory:false,targetIds}]}};
  })};
}
export const correctiveGuidanceStore=new CorrectiveGuidanceStore(path.resolve(process.cwd(),'.prizm-data/corrective-guidance.json'));
export function createCorrectiveGuidanceRouter(store=correctiveGuidanceStore){
  const router=Router();
  router.get('/',(_req,res)=>{try{res.json({revision:store.read().revision,canEdit:process.env.PRIZM_CORRECTIVE_GUIDANCE!=='false'&&!!res.locals.prizmGuidanceActor});}catch{res.status(503).json({error:'Guidance storage needs review; edits are disabled'});}});
  router.put('/',(req,res)=>{
    if(process.env.PRIZM_CORRECTIVE_GUIDANCE==='false')return res.status(503).json({error:'Corrective guidance editing is disabled'});
    const actor=res.locals.prizmGuidanceActor;
    if(typeof actor!=='string'||!actor)return res.status(403).json({error:'A local administrator workspace is required'});
    try{
      if(!req.body||Object.keys(req.body).sort().join(',')!=='entry,reset,revision'||typeof req.body.reset!=='boolean')throw Error('Invalid save request');
      const state=store.save(req.body.revision,req.body.entry,actor,req.body.reset);
      res.json({revision:state.revision,saved:true});
    }catch(error){res.status(error instanceof GuidanceConflict?409:400).json({error:error instanceof Error?error.message:'Unable to save guidance'});}
  });return router;
}
