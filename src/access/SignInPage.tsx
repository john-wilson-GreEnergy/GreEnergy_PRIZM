import React, {useCallback, useEffect, useRef, useState} from 'react';
import {LockKeyhole, Eye, EyeOff, ArrowRight} from 'lucide-react';
import {accessEnabled, readAccessSession, signIn, signOut, type AccessSession} from './accessClient';
import {normalizeLocalEmail} from '../core/security/localEmail';
import ReadOnlyWorkspace from './ReadOnlyWorkspace';

export function SignInForm({onSubmit, busy, enabled, error}: {
  onSubmit: (email: string, password: string) => Promise<void>; busy: boolean; enabled: boolean; error: string;
}) {
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [visible,setVisible] = useState(false);
  const [validation,setValidation] = useState('');
  return <form onSubmit={event => {
    event.preventDefault();
    if (busy || !enabled) return;
    const normalized = normalizeLocalEmail(email);
    if (!normalized || !password) {setValidation('Enter your account email and password.');return;}
    setValidation('');setPassword('');setVisible(false);
    void onSubmit(normalized,password);
  }} className="space-y-5">
    <label className="block text-sm font-semibold" htmlFor="email">Email
      <input id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} disabled={!enabled || busy} value={email} onChange={event => setEmail(event.target.value)} className="mt-2 block min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 disabled:bg-slate-100"/>
    </label>
    <div>
      <label className="block text-sm font-semibold" htmlFor="password">Password</label>
      <div className="relative mt-2">
        <input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={256} disabled={!enabled || busy} value={password} onChange={event => setPassword(event.target.value)} className="block min-h-12 w-full rounded-lg border border-slate-300 bg-white pl-3 pr-12 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 disabled:bg-slate-100"/>
        <button type="button" onClick={() => setVisible(value => !value)} disabled={!enabled || busy} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded text-slate-600 focus:ring-2 focus:ring-emerald-600">{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
      </div>
    </div>
    {(error || validation) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error || validation}</p>}
    <button type="submit" disabled={!enabled || busy} aria-busy={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 font-semibold text-white hover:bg-emerald-800 focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}{!busy && <ArrowRight size={18}/>}</button>
  </form>;
}

export default function SignInPage() {
  const [state,setState] = useState<'checking'|'enabled'|'disabled'|'unavailable'>('checking');
  const [session,setSession] = useState<AccessSession | null>(null);
  const [busy,setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error,setError] = useState('');
  const message = (error: unknown) => error instanceof Error ? error.message : 'Sign-in unavailable.';
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const enabled = await accessEnabled();
      const current = enabled ? await readAccessSession() : null;
      if (!cancelled) {setState(enabled ? 'enabled' : 'disabled');setSession(current);}
    })().catch(error => {if (!cancelled) {setState('unavailable');setError(message(error));}});
    return () => {cancelled = true;};
  }, []);
  useEffect(() => {
    if (!session) return;
    // Background telemetry never extends the server's idle deadline.
    const timer = window.setTimeout(() => {setSession(null);setError('Session expired. Sign in again.');}, Math.max(0,Math.min(session.idleExpiresAt,session.expiresAt)-Date.now()));
    return () => window.clearTimeout(timer);
  }, [session]);
  const submit = async (email: string, password: string) => {
    if (inFlight.current) return;
    inFlight.current = true;setBusy(true);setError('');
    try {setSession(await signIn(email,password));} catch (error) {setError(message(error));}
    finally {inFlight.current = false;setBusy(false);}
  };
  const logout = async () => {
    if (!session || inFlight.current) return;
    inFlight.current = true;setBusy(true);setError('');
    try {await signOut(session.csrf);setSession(null);} catch (error) {setError(message(error));}
    finally {inFlight.current = false;setBusy(false);}
  };
  const expired = useCallback(()=>{setSession(null);setError('Session expired or revoked. Sign in again.');},[]);
  if (session) return <ReadOnlyWorkspace session={session} onExpired={expired} onLogout={()=>void logout()} busy={busy} error={error}/>;
  return <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-10 font-sans text-slate-900">
    <section className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg" aria-labelledby="signin-heading">
      <div className="border-b border-slate-200 px-8 py-7">
        <div className="flex items-center gap-3"><img src="/logo-transparent.svg" alt="GreEnergy" className="h-10 w-10"/><span className="text-xl font-bold tracking-tight">PRIZM</span></div>
        <h1 id="signin-heading" className="mt-7 text-2xl font-semibold">Sign in to PRIZM</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Use your site account. No internet connection required.</p>
      </div>
      <div className="p-8">
          {state !== 'enabled' && <p role="status" className="mb-5 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{state === 'checking' ? 'Checking sign-in availability…' : state === 'disabled' ? 'Sign-in has not been enabled on this deployment. Contact your site administrator.' : 'Sign-in is unavailable. Reload to check again.'}</p>}
          <SignInForm onSubmit={submit} enabled={state === 'enabled'} busy={busy} error={error}/>
          <p className="mt-5 text-sm leading-6 text-slate-500">Need access or a password reset? Contact your site administrator.</p>
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 px-8 py-4 text-xs text-slate-500"><LockKeyhole size={14}/>Local accounts · Authorized site personnel only</div>
    </section>
  </main>;
}
