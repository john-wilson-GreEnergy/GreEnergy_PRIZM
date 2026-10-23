import {AccessError} from '../security/localSessions';
import {normalizeLocalEmail} from '../../core/security/localEmail';
import {manageFleetAccount} from './accountManagement';
import type {SiteEnrollment} from '../../core/fleet/model';

/** Redeem an administrator-issued secret, never a public registration/reset flow.
 * Fixed global budget and one writer prevent unbounded scrypt work. */
export function passwordSetup(file:string,sites:SiteEnrollment[],audit:(event:{action:string;outcome:string})=>Promise<void>){
 let windowAt=0,attempts=0,busy=false;
 return async(body:unknown,verifiedEmail?:string)=>{
  const now=Date.now();if(now-windowAt>=60000){windowAt=now;attempts=0;}
  if(++attempts>12||busy)throw new AccessError(429,'Setup temporarily limited; try again later');
  if(!body||typeof body!=='object'||Array.isArray(body))throw new AccessError(400,'Invalid setup request');
  const b=body as Record<string,unknown>,email=normalizeLocalEmail(b.email);
  if(Object.keys(b).sort().join(',')!=='email,password,token'||!email||typeof b.password!=='string'||typeof b.token!=='string'||b.password.length>256||b.token.length!==43||verifiedEmail&&email!==verifiedEmail)throw new AccessError(400,'Invalid setup request');
  busy=true;
  try{
   await audit({action:'mobile.password-setup',outcome:'attempt'});
   try{await manageFleetAccount(file,sites,{kind:'redeem',email,token:b.token,password:b.password});}
   catch{throw new AccessError(400,'Setup could not complete. Check the code, expiry and password requirements.');}
   // A committed password cannot be reported as rolled back if logging fails.
   await audit({action:'mobile.password-setup',outcome:'saved'}).catch(()=>{});
   return {saved:true};
  }finally{busy=false;}
 };
}
