import type {ReadOnlyTelemetry} from '../core/security/readOnlyTelemetry';
import type {ContactorIntent, ContactorReview, ContactorReceipt} from '../core/security/contactorAccessModel';
import type {SavedCommandView,RecoveryReview,RecoveryIntent} from '../core/security/commandRecovery';
export interface AccessSession {email: string; csrf: string; expiresAt: number; idleExpiresAt: number; mode: 'restricted-pilot'; singleStringContactors?: boolean}
export class SignInError extends Error {
  constructor(readonly status: number, message: string) {super(message);}
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
export function credentialTransportAllowed(location: Pick<Location, 'protocol' | 'hostname'>): boolean {
  return location.protocol === 'https:' || (location.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(location.hostname));
}
async function request(path: string, body?: unknown, csrf?: string, signal?: AbortSignal, timeoutMs = 10000): Promise<unknown> {
  if (!credentialTransportAllowed(window.location)) throw new SignInError(403, 'Use the approved HTTPS address to sign in.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  if (signal?.aborted) controller.abort();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/access/'+path, {
      method: body === undefined ? 'GET' : 'POST', credentials:'same-origin', cache:'no-store', redirect:'error', signal:controller.signal,
      headers: {'Accept':'application/json', ...(body === undefined ? {} : {'Content-Type':'application/json'}), ...(csrf ? {'X-Prizm-Csrf':csrf} : {})},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new SignInError(response.status, response.status === 401 ? 'Email or password not recognized, or session expired.' : response.status === 403 ? 'Access is not permitted for this account and site.' : response.status === 409 ? (path.startsWith('recovery') ? 'Review unavailable or changed. Refresh saved commands and feedback; no target was released.' : path.startsWith('controls/') ? 'Control unavailable: site context changed or a saved command needs reconciliation. Contact your site administrator; signing in again does not clear saved commands.' : 'Site changed. Sign in again after the site is verified.') : response.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : 'Service unavailable. Contact your site administrator.');
    return await response.json() as unknown;
  } catch (error) {
    if (error instanceof SignInError) throw error;
    throw new SignInError(503,'Unable to reach the sign-in service. Check the connection and try again.');
  } finally {window.clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function accessEnabled(): Promise<boolean> {
  const config = await request('config');
  if (!object(config) || !['restricted-pilot','disabled'].includes(String(config.mode))) throw new SignInError(503,'Invalid sign-in service response.');
  return config.mode === 'restricted-pilot';
}
export async function readAccessSession(): Promise<AccessSession | null> {
  let value: unknown;
  try {value = await request('session');} catch (error) {
    if (error instanceof SignInError && error.status === 401) return null;
    throw error;
  }
  if (!object(value) || value.mode !== 'restricted-pilot' || typeof value.email !== 'string' || typeof value.csrf !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.csrf) || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt) || typeof value.idleExpiresAt !== 'number' || !Number.isFinite(value.idleExpiresAt)) throw new SignInError(503,'Invalid session response.');
  return {email:value.email,csrf:value.csrf,expiresAt:value.expiresAt,idleExpiresAt:value.idleExpiresAt,mode:'restricted-pilot',singleStringContactors:object(value.controls) && value.controls.singleStringContactors === true};
}
export async function readContactorReview(array: number, string: number, signal: AbortSignal): Promise<ContactorReview> {
  const value = await request(`controls/contactors/${array}/${string}`,undefined,undefined,signal);
  if (!object(value) || value.array !== array || value.string !== string || typeof value.topologyRevision !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.topologyRevision) ||
      typeof value.validUntil !== 'number' || !Number.isFinite(value.validUntil)) throw new SignInError(503,'Invalid control review response.');
  return value as unknown as ContactorReview;
}
export async function submitContactor(intent: ContactorIntent, csrf: string, signal: AbortSignal): Promise<ContactorReceipt> {
  // Verification can exceed the normal data-read deadline. Never retry a mutation.
  const value = await request('controls/contactors',intent,csrf,signal,90000);
  if (!object(value) || typeof value.success !== 'boolean' || !Array.isArray(value.results) || value.results.length !== 1 ||
      !['acceptedCount','verifiedCount','mismatchCount','unknownCount'].every(key=>value[key] === 0 || value[key] === 1)) throw new SignInError(503,'Command response could not be verified.');
  const row: unknown = value.results[0];
  if (!object(row) || !object(row.target) || row.target.array !== intent.array || row.target.string !== intent.string || row.action !== intent.action || typeof row.accepted !== 'boolean' ||
      ![true,false,null].includes(row.readbackConfirmed as boolean|null) || typeof row.status !== 'string' ||
      value.acceptedCount !== Number(row.accepted) || value.verifiedCount !== Number(row.readbackConfirmed === true) ||
      value.mismatchCount !== Number(row.readbackConfirmed === false) || value.unknownCount !== Number(row.readbackConfirmed === null) ||
      value.success !== (row.accepted && row.readbackConfirmed === true)) throw new SignInError(503,'Command response could not be verified.');
  return value as unknown as ContactorReceipt;
}
export async function readAccessTelemetry(signal: AbortSignal): Promise<ReadOnlyTelemetry> {
  const value = await request('telemetry',undefined,undefined,signal);
  const numeric = (v: unknown) => v === null || typeof v === 'number' && Number.isFinite(v);
  if (!object(value) || !object(value.site) || typeof value.site.name !== 'string' || typeof value.site.station !== 'string' || !Number.isSafeInteger(value.site.block) ||
      !Number.isSafeInteger(value.cycle) || !numeric(value.ageMs) || !(value.capturedAt === null || typeof value.capturedAt === 'string') || typeof value.stale !== 'boolean' ||
      !['LIVE','PARTIAL','CACHED','OFFLINE','UNKNOWN'].includes(String(value.state)) || !object(value.counts) || !['strings','arrays','warnings','alarms'].every(key=>object(value.counts) && numeric(value.counts[key])) ||
      !Array.isArray(value.strings) || value.strings.length > 10000 || value.strings.some(row=>!object(row) || !Number.isSafeInteger(row.array) || !Number.isSafeInteger(row.string) || typeof row.stale !== 'boolean' || !(row.state === null || typeof row.state === 'string') || !['soc','voltage','current','power','warnings','alarms'].every(key=>numeric(row[key]))) ||
      !Array.isArray(value.issues) || value.issues.length > 10000 || value.issues.some(row=>!object(row) || !['severity','title','location'].every(key=>typeof row[key] === 'string'))) throw new SignInError(503,'Invalid telemetry response.');
  return value as unknown as ReadOnlyTelemetry;
}
export async function signIn(email: string, password: string): Promise<AccessSession> {
  await request('login',{email,password});
  const session = await readAccessSession();
  if (!session) throw new SignInError(401,'Sign-in could not be confirmed. Please try again.');
  return session;
}
export async function signOut(csrf: string): Promise<void> {
  try {await request('logout',{},csrf);} catch (error) {
    if (!(error instanceof SignInError && error.status === 401)) throw error;
  }
}
const savedCommand=(v:unknown):v is SavedCommandView=>object(v) && typeof v.commandId==='string' && /^[A-Za-z0-9_-]{16,80}$/.test(v.commandId) &&
  Number.isSafeInteger(v.array) && Number(v.array)>0 && Number.isSafeInteger(v.string) && Number(v.string)>0 && ['open','close'].includes(String(v.action)) &&
  ['reserved','verified','unverified'].includes(String(v.state)) && typeof v.reason==='string' && Number.isSafeInteger(v.createdAt) && Number.isSafeInteger(v.updatedAt) && v.historical===true &&
  Array.isArray(v.reviews) && v.reviews.length<=20 && v.reviews.every(r=>object(r) && Number.isSafeInteger(r.at) && ['site-checked','follow-up-required'].includes(String(r.reason)) && recoveryObservation(r.observation));
const recoveryObservation=(v:unknown):boolean=>object(v) && ['open','closed'].includes(String(v.actual)) && ['open','closed','unknown'].includes(String(v.requested)) && Number.isSafeInteger(v.capturedAt);
export async function listRecovery(signal:AbortSignal):Promise<SavedCommandView[]> {
  const value=await request('recovery',undefined,undefined,signal);
  if(!Array.isArray(value) || value.length>512 || !value.every(savedCommand)) throw new SignInError(503,'Invalid saved command response');
  return value;
}
export async function reviewRecovery(id:string,signal:AbortSignal):Promise<RecoveryReview> {
  const value=await request(`recovery/${encodeURIComponent(id)}`,undefined,undefined,signal);
  if(!object(value) || !savedCommand(value.command) || value.command.commandId!==id || !recoveryObservation(value.observation) || !Number.isSafeInteger(value.validUntil)) throw new SignInError(503,'Invalid recovery feedback');
  return value as unknown as RecoveryReview;
}
export async function recordRecovery(intent:RecoveryIntent,csrf:string,signal:AbortSignal):Promise<void> {
  const value=await request('recovery',intent,csrf,signal);
  if(!object(value) || value.recorded!==true || value.targetReleased!==false) throw new SignInError(503,'Review save could not be confirmed; refresh saved commands before trying again');
}
