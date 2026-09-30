import {constants} from 'node:fs';
import {lstat,open,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {readPrivateJson} from './localAccounts';
import {AccessError} from './localSessions';
import type {ContactorReceipt} from '../../core/security/contactorAccessModel';
import type {RecoveryRecord} from '../../core/security/commandRecovery';

export interface CommandReservation {
  commandId:string; subject:string; sessionId:string; siteId:string; blockId:string;
  array:number; string:number; action:'open'|'close'; reason:string; topologyRevision:string;
}
export interface SavedContactorCommand extends CommandReservation {
  state:'reserved'|'verified'|'unverified'; createdAt:number; updatedAt:number; result:ContactorReceipt|null;
  reviews?:RecoveryRecord[];
}
interface Ledger {version:1; entries:SavedContactorCommand[]}
const object=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
const only=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).every(key=>keys.includes(key));
const reservationKeys=['commandId','subject','sessionId','siteId','blockId','array','string','action','reason','topologyRevision'];
const nonempty=(v:unknown,max=128):v is string=>typeof v==='string' && v.length>0 && v.length<=max && !/[\x00-\x1f\x7f]/.test(v);
const commandKey=(v:CommandReservation)=>JSON.stringify([v.siteId,v.blockId,v.subject,v.commandId]);
const sameTarget=(a:CommandReservation,b:Pick<CommandReservation,'siteId'|'blockId'|'array'|'string'>)=>a.siteId===b.siteId && a.blockId===b.blockId && a.array===b.array && a.string===b.string;
const validReservation=(v:unknown):v is CommandReservation=>object(v) && nonempty(v.commandId,80) && /^[A-Za-z0-9_-]{16,80}$/.test(v.commandId) &&
  ['subject','sessionId','siteId','blockId','topologyRevision'].every(key=>nonempty(v[key])) && nonempty(v.reason,160) &&
  (v.action==='open'||v.action==='close') && Number.isSafeInteger(v.array) && Number(v.array)>0 && Number.isSafeInteger(v.string) && Number(v.string)>0;

function validResult(value:unknown,entry:CommandReservation):value is ContactorReceipt {
  if(!object(value) || !only(value,['success','acceptedCount','verifiedCount','mismatchCount','unknownCount','results']) || typeof value.success!=='boolean' || !Array.isArray(value.results) || value.results.length!==1) return false;
  const row:unknown=value.results[0];
  if(!object(row) || !only(row,['target','action','accepted','readbackConfirmed','status']) || !object(row.target) || !only(row.target,['array','string']) || row.target.array!==entry.array || row.target.string!==entry.string || row.action!==entry.action ||
    typeof row.accepted!=='boolean' || ![true,false,null].includes(row.readbackConfirmed as boolean|null) || !nonempty(row.status,256)) return false;
  return value.acceptedCount===Number(row.accepted) && value.verifiedCount===Number(row.readbackConfirmed===true) &&
    value.mismatchCount===Number(row.readbackConfirmed===false) && value.unknownCount===Number(row.readbackConfirmed===null) && value.success===(row.accepted && row.readbackConfirmed===true);
}
function parseLedger(raw:unknown):Ledger {
  if(!object(raw) || !only(raw,['version','entries']) || raw.version!==1 || !Array.isArray(raw.entries) || raw.entries.length>512) throw new Error('Invalid command ledger');
  const keys=new Set<string>(),unresolved=new Set<string>();
  for(const entry of raw.entries) {
    if(!validReservation(entry) || !object(entry) || !only(entry,[...reservationKeys,'state','createdAt','updatedAt','result','reviews']) || !['reserved','verified','unverified'].includes(String(entry.state)) ||
      !Number.isSafeInteger(entry.createdAt) || Number(entry.createdAt)<0 || !Number.isSafeInteger(entry.updatedAt) || Number(entry.updatedAt)<Number(entry.createdAt) ||
      (entry.state==='reserved' ? entry.result!==null : !validResult(entry.result,entry) || (entry.state==='verified')!==entry.result.success)) throw new Error('Invalid command receipt');
    if(entry.reviews!==undefined && (!Array.isArray(entry.reviews) || entry.reviews.length>20 || entry.reviews.some(review=>
      !object(review) || !only(review,['at','subject','reason','observation']) || review.subject!==entry.subject || !Number.isSafeInteger(review.at) || Number(review.at)<Number(entry.createdAt) || Number(review.at)>Number(entry.updatedAt) ||
      !['site-checked','follow-up-required'].includes(String(review.reason)) || !object(review.observation) || !only(review.observation,['actual','requested','capturedAt']) ||
      !['open','closed'].includes(String(review.observation.actual)) || !['open','closed','unknown'].includes(String(review.observation.requested)) ||
      !Number.isSafeInteger(review.observation.capturedAt) || Number(review.observation.capturedAt)<0 || Number(review.observation.capturedAt)>Number(review.at)))) throw new Error('Invalid recovery review');
    const key=commandKey(entry),target=JSON.stringify([entry.siteId,entry.blockId,entry.array,entry.string]);
    if(keys.has(key) || entry.state!=='verified' && unresolved.has(target)) throw new Error('Ambiguous command ledger');
    keys.add(key);if(entry.state!=='verified') unresolved.add(target);
  }
  return raw as unknown as Ledger;
}

/** Single-host durable journal. No automatic initialization, replay, expiry, unlock or pruning. */
export class ContactorReceipts {
  constructor(private readonly file:string,private readonly clock=Date.now) {}
  private async directory() {
    if(!path.isAbsolute(this.file)) throw new Error('Absolute receipt path required');
    const directory=path.dirname(this.file),stat=await lstat(directory);
    if(!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode&0o077)!==0 || (stat.uid!==process.getuid?.() && stat.uid!==0)) throw new Error('Private command directory required');
    return directory;
  }
  private async syncDirectory() {
    const handle=await open(await this.directory(),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try {await handle.sync();} finally {await handle.close();}
  }
  private async load():Promise<Ledger> {
    await this.directory();
    const raw=await readPrivateJson(this.file);
    const stat=await lstat(this.file);
    if(stat.nlink!==1 || stat.isSymbolicLink()) throw new Error('Command ledger links are not permitted');
    return parseLedger(raw);
  }
  async validate() {await this.load();}
  private async mutate<T>(change:(ledger:Ledger)=>T|Promise<T>):Promise<T> {
    await this.directory();
    const lockPath=this.file+'.lock';
    let lock;
    try {lock=await open(lockPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}
    catch {throw new AccessError(503,'Command ledger is locked or unavailable; supervised recovery required');}
    const identity=await lock.stat();
    try {
      const ledger=await this.load(),result=await change(ledger);
      parseLedger(ledger);
      const encoded=JSON.stringify(ledger);
      if(Buffer.byteLength(encoded)>1024*1024) throw new AccessError(503,'Command ledger capacity reached');
      const temporary=this.file+'.'+randomUUID()+'.tmp';
      const output=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try {await output.writeFile(encoded);await output.sync();} finally {await output.close();}
      await rename(temporary,this.file);await this.syncDirectory();
      return result;
    } finally {
      await lock.close();
      const current=await lstat(lockPath);
      if(current.ino!==identity.ino || current.dev!==identity.dev) throw new Error('Command lock changed; refusing cleanup');
      await unlink(lockPath);await this.syncDirectory(); // Only this invocation's exact lock.
    }
  }
  async assertTargetClear(target:Pick<CommandReservation,'siteId'|'blockId'|'array'|'string'>) {
    if((await this.load()).entries.some(entry=>sameTarget(entry,target) && entry.state!=='verified')) throw new AccessError(409,'A saved command for this target requires reconciliation; no new command sent');
  }
  reserve(reservation:CommandReservation):Promise<void> {
    if(!validReservation(reservation) || !only(reservation as unknown as Record<string,unknown>,reservationKeys)) return Promise.reject(new Error('Invalid command reservation'));
    return this.mutate(ledger=>{
      if(ledger.entries.some(entry=>commandKey(entry)===commandKey(reservation))) throw new AccessError(409,'Command ID already recorded; inspect its saved receipt. No command resent');
      if(ledger.entries.some(entry=>sameTarget(entry,reservation) && entry.state!=='verified')) throw new AccessError(409,'A saved command for this target requires reconciliation; no new command sent');
      if(ledger.entries.length>=512) throw new AccessError(503,'Command ledger capacity reached');
      const now=this.clock();ledger.entries.push({...reservation,state:'reserved',createdAt:now,updatedAt:now,result:null});
    });
  }
  finish(reservation:CommandReservation,result:ContactorReceipt):Promise<void> {
    if(!validResult(result,reservation)) return Promise.reject(new Error('Invalid command result; reservation remains unresolved'));
    return this.mutate(ledger=>{
      const entry=ledger.entries.find(row=>commandKey(row)===commandKey(reservation));
      if(!entry || entry.state!=='reserved' || Object.entries(reservation).some(([key,value])=>entry[key as keyof CommandReservation]!==value)) throw new Error('Reservation does not match completion');
      entry.result=structuredClone(result);entry.state=result.success?'verified':'unverified';entry.updatedAt=Math.max(this.clock(),entry.createdAt);
    });
  }
  async readOwned(subject:string,scope:{siteId:string;blockId:string},commandId:string):Promise<SavedContactorCommand> {
    const entry=(await this.load()).entries.find(row=>row.commandId===commandId && row.subject===subject && row.siteId===scope.siteId && row.blockId===scope.blockId);
    if(!entry) throw new AccessError(404,'Saved command unavailable');
    return structuredClone(entry);
  }
  async listOwned(subject:string,scope:{siteId:string;blockId:string}):Promise<SavedContactorCommand[]> {
    return structuredClone((await this.load()).entries.filter(row=>row.subject===subject && row.siteId===scope.siteId && row.blockId===scope.blockId).sort((a,b)=>b.updatedAt-a.updatedAt));
  }
  recordReview(subject:string,scope:{siteId:string;blockId:string},commandId:string,expectedUpdatedAt:number,review:RecoveryRecord,authorize:()=>Promise<void>) {
    return this.mutate(async ledger=>{
      const entry=ledger.entries.find(row=>row.subject===subject && row.siteId===scope.siteId && row.blockId===scope.blockId && row.commandId===commandId);
      if(!entry) throw new AccessError(404,'Saved command unavailable');
      if(entry.updatedAt!==expectedUpdatedAt) throw new AccessError(409,'Saved command changed; refresh its review');
      if(entry.state==='verified' || (entry.reviews?.length ?? 0)>=20) throw new AccessError(409,'Review unavailable or capacity reached');
      await authorize(); // Recheck after lock acquisition and disk reads, before saving evidence.
      entry.reviews=[...(entry.reviews ?? []),structuredClone(review)];
      entry.updatedAt=Math.max(this.clock(),entry.updatedAt+1,review.at);
      // Deliberately retain reserved/unverified state: recording evidence never releases a target.
    });
  }
}
