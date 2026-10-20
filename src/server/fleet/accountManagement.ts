import {lstat, open, rename, unlink} from 'node:fs/promises';
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {hashLocalPassword, parseAccounts, readAccounts, type LocalAccount} from '../security/localAccounts';
import {normalizeLocalEmail} from '../../core/security/localEmail';
import type {SiteEnrollment} from '../../core/fleet/model';
import {parseEnrollment} from './FleetBroker';
import {FLEET_MIN_PASSWORD_LENGTH} from '../../core/security/fleetPasswordPolicy';

export type FleetAccountAction =
  | {kind: 'add'; email: string; password: string; siteIds: string[]; workspaceIds?:string[]; remoteAccess?:boolean}
  | {kind: 'invite'; email:string; siteIds:string[]; workspaceIds?:string[]; remoteAccess?:boolean}
  | {kind: 'setup'; email:string}
  | {kind: 'redeem'; email:string; token:string; password:string}
  | {kind: 'access'; email: string; siteIds: string[]; workspaceIds?:string[]; remoteAccess?:boolean}
  | {kind: 'workspace'; email: string; siteIds: string[]}
  | {kind: 'password'; email: string; password: string}
  | {kind: 'administrator'; email:string; enabled:boolean}
  | {kind: 'remote'; email:string; remoteAccess:boolean}
  | {kind: 'enable' | 'disable'; email: string};

/** Web callers supply a reauthenticated actor; CLI callers remain host administrators. */
export async function manageFleetAccount(file: string, sites: SiteEnrollment[], action: FleetAccountAction, actor?:{id:string;version:number}) {
  if (!path.isAbsolute(file)) throw new Error('Absolute account path required');
  const directory = path.dirname(file), parent = await lstat(directory);
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0 ||
    (parent.uid !== process.getuid?.() && parent.uid !== 0)) throw new Error('Use a private account directory owned by this service user or root');
  const enrolled = sites.map(parseEnrollment);
  if (!enrolled.length || new Set(enrolled.map(s => s.siteId)).size !== enrolled.length) throw new Error('Unique enrolled sites required');
  const email = normalizeLocalEmail(action.email);
  if (!email) throw new Error('Valid email required');
  if('remoteAccess' in action && typeof action.remoteAccess!=='boolean')throw Error('Invalid remote access flag');
  if(actor && action.kind==='redeem')throw Error('Use the password setup endpoint');
  const selected = 'siteIds' in action ? action.siteIds : [];
  const workspaceIds='workspaceIds' in action ? action.workspaceIds ?? [] : [];
  if(new Set(workspaceIds).size!==workspaceIds.length || workspaceIds.some(id=>!selected.includes(id)))throw Error('Full workspaces must also have site visibility');
  if ('siteIds' in action && ((!selected.length && action.kind!=='workspace') || new Set(selected).size !== selected.length ||
    selected.some(id => !enrolled.some(s => s.siteId === id)))) throw new Error('Select one or more distinct enrolled site IDs');
  // Share the provisioning lock with the existing local-account tool.
  const lockFile = path.join(directory, 'provision.lock');
  const lock = await open(lockFile, 'wx', 0o600);
  let temporary: string | undefined;
  try {
    let accounts: LocalAccount[];
    try { accounts = await readAccounts(file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; accounts = []; }
    if(actor){
      if(action.kind==='administrator'||action.kind==='remote')throw Error('Account operation must be managed from the server console');
      const current=accounts.find(a=>a.id===actor.id);
      if(!current || current.disabled || current.fleetAdmin!==true || current.version!==actor.version)throw Error('Administrator access changed; sign in again');
      const target=accounts.find(a=>a.email===email);
      if(target?.id===actor.id || target?.fleetAdmin)throw Error('Administrator accounts must be managed from the server console');
    }
    // Fleet stores must be separate from standalone control accounts.
    if (accounts.some(a => a.grants.some(g => !['telemetry.view', 'history.view','workspace.full'].includes(g.capability)))) throw new Error('Refusing a non-Fleet account store');
    let account = accounts.find(a => a.email === email);
    if(action.kind==='redeem'){
      const setup=account?.passwordSetup;
      const supplied=typeof action.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(action.token)?createHash('sha256').update(action.token).digest():null;
      if(!account||account.disabled||account.fleetAdmin||!setup||setup.expiresAt<=Date.now()||!supplied||!timingSafeEqual(supplied,Buffer.from(setup.digest,'hex')))throw Error('Setup code is invalid or expired');
    }
    let setupToken:string|undefined;
    if (action.kind === 'add' || action.kind==='invite') {
      if (account) throw new Error('Account already exists; use password or access to change it');
      account = {id: randomUUID(), email, disabled: false, version: 1, password: await hashLocalPassword(action.kind==='add'?action.password:randomBytes(32).toString('base64url'),FLEET_MIN_PASSWORD_LENGTH), grants: []};
      accounts.push(account);
    } else {
      if (!account) throw new Error('Account not found');
      if (account.version >= Number.MAX_SAFE_INTEGER) throw new Error('Account version exhausted');
      account.version++;
      if (action.kind === 'password') account.password = await hashLocalPassword(action.password,FLEET_MIN_PASSWORD_LENGTH);
      if(action.kind==='redeem')account.password=await hashLocalPassword(action.password,FLEET_MIN_PASSWORD_LENGTH);
      if(action.kind==='password'||action.kind==='redeem'||action.kind==='disable')delete account.passwordSetup;
      if (action.kind === 'disable' || action.kind === 'enable') account.disabled = action.kind === 'disable';
      if (action.kind === 'administrator') account.fleetAdmin=action.enabled;
    }
    if(action.kind==='invite'||action.kind==='setup'){
      if(account.disabled||account.fleetAdmin)throw Error('Cannot issue setup for a disabled or administrator account');
      setupToken=randomBytes(32).toString('base64url');
      account.passwordSetup={digest:createHash('sha256').update(setupToken).digest('hex'),expiresAt:Date.now()+86400000};
    }
    if('remoteAccess' in action)account.remoteAccess=action.remoteAccess;
    if((action.kind==='disable'||(action.kind==='administrator'&&!action.enabled)) &&
      !(accounts.some(a=>a.fleetAdmin&&!a.disabled)) &&
      (await readAccounts(file)).some(a=>a.fleetAdmin&&!a.disabled))throw Error('Cannot remove the last active administrator');
    if (action.kind==='workspace') {
      if(selected.some(id=>!account.grants.some(g=>g.siteId===id && g.blockId===enrolled.find(s=>s.siteId===id)!.blockId && g.capability==='telemetry.view' && g.scope.kind==='block')))throw Error('Workspace access requires existing site telemetry access');
      account.grants=account.grants.filter(g=>g.capability!=='workspace.full');
      for(const site of enrolled.filter(s=>selected.includes(s.siteId)))account.grants.push({capability:'workspace.full',siteId:site.siteId,blockId:site.blockId,scope:{kind:'block'}});
    }else if ('siteIds' in action) account.grants = enrolled.filter(s => selected.includes(s.siteId)).map(s => ({
      capability: 'telemetry.view', siteId: s.siteId, blockId: s.blockId, scope: {kind: 'block'},
    }));
    if(action.kind==='add'||action.kind==='invite'||action.kind==='access')for(const site of enrolled.filter(s=>workspaceIds.includes(s.siteId)))account.grants.push({capability:'workspace.full',siteId:site.siteId,blockId:site.blockId,scope:{kind:'block'}});
    const validated = parseAccounts(accounts);
    temporary = path.join(directory, randomUUID() + '.accounts.tmp');
    const output = await open(temporary, 'wx', 0o600);
    try { await output.writeFile(JSON.stringify(validated, null, 2)); await output.sync(); }
    finally { await output.close(); }
    await rename(temporary, file); temporary = undefined;
    return {action: action.kind, email, version: account.version, disabled: account.disabled,
      administrator:account.fleetAdmin===true,
      remoteAccess:account.remoteAccess===true,pendingSetup:!!account.passwordSetup,
      ...(setupToken?{setupToken,setupExpiresAt:account.passwordSetup!.expiresAt}:{}),
      sites: account.grants.filter(g => g.capability === 'telemetry.view').map(g => g.siteId),workspaces:account.grants.filter(g=>g.capability==='workspace.full').map(g=>g.siteId)};
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    await lock.close(); await unlink(lockFile);
  }
}

export async function listFleetAccounts(file: string) {
  const accounts = await readAccounts(file);
  return accounts.map(a => ({email: a.email, disabled: a.disabled, version: a.version,
    administrator:a.fleetAdmin===true,
    remoteAccess:a.remoteAccess===true,pendingSetup:!!a.passwordSetup,
    sites: a.grants.filter(g => g.capability === 'telemetry.view').map(g => g.siteId),workspaces:a.grants.filter(g=>g.capability==='workspace.full').map(g=>g.siteId)}));
}
