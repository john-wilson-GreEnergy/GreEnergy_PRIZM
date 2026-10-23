import React,{useState} from 'react';
import {FLEET_MIN_PASSWORD_LENGTH} from '../core/security/fleetPasswordPolicy';
export function PasswordSetup({onBack,apiBase="/mobile",className="m-login"}:{onBack:()=>void;apiBase?:"/mobile"|"/fleet";className?:string}){
 const [email,setEmail]=useState(''),[token,setToken]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;if(password!==repeat){setError('Passwords do not match.');return;}
  setBusy(true);setError('');
  try{
   const r=await fetch(apiBase+'/api/fleet/setup',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,token:token.trim(),password})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Setup unavailable');setSaved(true);setToken('');
  }catch(e){setError(e instanceof Error?e.message:'Setup unavailable.');}finally{setBusy(false);setPassword('');setRepeat('');}
 };
 return <main className={className}><p className="m-eyebrow">ADMINISTRATOR-APPROVED ACCESS</p><h1>Set your password</h1>{saved?<p role="status">Your password is saved. Sign in to view your assigned sites.</p>:<><p>Use the one-time code provided privately by your administrator. Codes expire after 24 hours and can only be used once. Sign in using the email address assigned by your administrator.</p><form onSubmit={submit}><fieldset disabled={busy} style={{border:0,padding:0,margin:0}}><label>Email address<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>One-time setup code<input autoComplete="off" spellCheck={false} value={token} maxLength={64} onChange={e=>setToken(e.target.value)} required/></label><label>New password<input type="password" autoComplete="new-password" minLength={FLEET_MIN_PASSWORD_LENGTH} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} required/></label><label>Repeat password<input type="password" autoComplete="new-password" minLength={FLEET_MIN_PASSWORD_LENGTH} maxLength={256} value={repeat} onChange={e=>setRepeat(e.target.value)} required/></label><p className="m-muted">Minimum {FLEET_MIN_PASSWORD_LENGTH} characters. Use a long, unique password.</p><button className="m-primary" disabled={busy}>{busy?'Saving…':'Set password'}</button></fieldset></form></>}{error&&<p role="alert" className="m-notice">{error}</p>}<button className="m-text-button" onClick={onBack}>Back to sign in</button></main>;
}
