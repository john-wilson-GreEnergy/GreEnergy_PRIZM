import React,{useEffect,useState} from 'react';
import './shiftSession.css';
export interface ShiftStatus {shiftMonitoring?:boolean;continuousControlAccess?:boolean;maximumAgeMs?:number;expiresAt?:number;controlExpiresAt?:number;serverTime?:number}
/** Session heartbeat only; hidden pages never renew monitoring. */
export function ShiftSessionBanner({csrf,workspace=false,onExpired}:{csrf:string;workspace?:boolean;onExpired:()=>void}){
  const [status,setStatus]=useState<ShiftStatus|null>(null),[offset,setOffset]=useState(0),[now,setNow]=useState(Date.now());
  const [password,setPassword]=useState(''),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [connectionError,setConnectionError]=useState('');
  const prefix=workspace?'/api/fleet/workspace-':'/api/fleet/';
  useEffect(()=>{
    let stopped=false,running=false,last=0;const abort=new AbortController();
    const update=async()=>{
      setNow(Date.now());
      if(document.visibilityState!=='visible'||running||Date.now()-last<60000)return;
      running=true;last=Date.now();
      try{
        const r=await fetch(prefix+'monitor',{method:'POST',headers:{'X-Prizm-Csrf':csrf},credentials:'same-origin',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});
        if(stopped)return;
        if(r.status===401){onExpired();return;}
        if(!r.ok)throw Error('Session verification unavailable.');
        const value=await r.json() as ShiftStatus;if(stopped)return;
        setStatus(value);setOffset((value.serverTime??Date.now())-Date.now());setNow(Date.now());setConnectionError('');
      }catch{if(!stopped)setConnectionError('Session verification unavailable. Monitoring access may expire; check the connection.');}
      finally{running=false;}
    };
    const locked=()=>{setOpen(true);setError('Controls locked. Confirm your password, then review and submit your action again. No automatic retry.');};
    void update();const timer=setInterval(()=>void update(),15000);
    document.addEventListener('visibilitychange',update);window.addEventListener('prizm-workspace-controls-locked',locked);
    return()=>{stopped=true;abort.abort();clearInterval(timer);document.removeEventListener('visibilitychange',update);window.removeEventListener('prizm-workspace-controls-locked',locked);};
  },[csrf,prefix,onExpired]);
  const locked=!!status?.shiftMonitoring && now+offset>=(status.controlExpiresAt??Infinity);
  const expiring=!!status?.expiresAt && status.expiresAt-(now+offset)<=5*60000;
  const unlock=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    try{
      const r=await fetch(prefix+'reauthenticate',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Prizm-Csrf':csrf},body:JSON.stringify({password})});
      if(r.status===401){onExpired();return;}
      const data=await r.json();if(!r.ok)throw Error(data.error||'Password confirmation failed.');
      setStatus(data);setOffset((data.serverTime??Date.now())-Date.now());setNow(Date.now());setOpen(false);
    }catch(e){setError(e instanceof Error?e.message:'Unable to confirm password.');}
    finally{setPassword('');setBusy(false);}
  };
  if(!status?.shiftMonitoring&&!error&&!connectionError&&!open)return null;
  return <section className="shift-session" aria-label="Monitoring session">
    <span>{locked?(status?.continuousControlAccess?'Session access expired':'Monitoring active · Controls locked'):status?.continuousControlAccess?'24-hour session · Monitoring and controls available until sign-out or session expiry':'Shift monitoring active · Controls require confirmation after 15 minutes idle'}</span>
    {!status?.continuousControlAccess&&<button type="button" onClick={()=>{setOpen(v=>!v);setPassword('');}}>Confirm control access</button>}
    {expiring&&<p role="alert">Your session ends in {Math.max(0,Math.ceil((status!.expiresAt!-now-offset)/60000))} minutes. Sign in again when it ends; your selected view will be retained.</p>}
    {error&&<p role="alert">{error}</p>}
    {connectionError&&<p role="alert">{connectionError}</p>}
    {open&&<form onSubmit={unlock}><label>Your password <input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label><button disabled={busy} type="submit">{busy?'Confirming…':'Unlock controls'}</button><button type="button" onClick={()=>{setOpen(false);setPassword('');}} disabled={busy}>Cancel</button><p>This only unlocks access. It does not submit or retry equipment commands.</p></form>}
  </section>;
}
