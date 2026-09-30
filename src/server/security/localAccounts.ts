import {randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
import {constants} from 'node:fs';
import {open, lstat} from 'node:fs/promises';
import path from 'node:path';
import type {Grant} from '../../core/security/controlPolicyPrototype';
import {normalizeLocalEmail} from '../../core/security/localEmail';

export interface LocalAccount {
  id: string; email: string; disabled: boolean; version: number;
  password: {algorithm: 'scrypt-v1'; salt: string; digest: string};
  grants: Grant[];
}
const capabilities = new Set(['telemetry.view','history.view','diagnostics.acquire','diagnostics.record','storage.manage',
  'controls.balancing','controls.rotation','controls.contactors','controls.ems-apps','controls.power']);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/.test(v);
export function parseAccounts(raw: unknown): LocalAccount[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 256) throw new Error('Invalid local account store');
  const ids = new Set<string>(), names = new Set<string>();
  for (const row of raw) {
    if (!object(row) || !identifier(row.id) || typeof row.email !== 'string' || !normalizeLocalEmail(row.email) || normalizeLocalEmail(row.email) !== row.email || typeof row.disabled !== 'boolean' ||
        !Number.isSafeInteger(row.version) || Number(row.version) < 1 || !object(row.password) ||
        row.password.algorithm !== 'scrypt-v1' || typeof row.password.salt !== 'string' || !/^[a-f0-9]{32}$/.test(row.password.salt) ||
        typeof row.password.digest !== 'string' || !/^[a-f0-9]{128}$/.test(row.password.digest) || !Array.isArray(row.grants) || row.grants.length > 100) throw new Error('Invalid local account');
    if (ids.has(row.id) || names.has(row.email)) throw new Error('Duplicate local identity');
    ids.add(row.id); names.add(row.email);
    for (const grant of row.grants) {
      if (!object(grant) || !capabilities.has(String(grant.capability)) || !identifier(grant.siteId) || !identifier(grant.blockId) || !object(grant.scope) ||
          (grant.scope.kind !== 'block' && (grant.scope.kind !== 'targets' || !Array.isArray(grant.scope.ids) || !grant.scope.ids.length || grant.scope.ids.length > 5000 || grant.scope.ids.some(id => !identifier(id))))) throw new Error('Invalid local grant');
    }
  }
  return structuredClone(raw) as LocalAccount[];
}

async function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve,reject) => scrypt(password, Buffer.from(salt,'hex'), 64,
    {N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024}, (error,key) => error ? reject(error) : resolve(key)));
}
export async function hashLocalPassword(password: string): Promise<LocalAccount['password']> {
  if ([...password].length < 15 || password.length > 256) throw new Error('Use a password of at least 15 characters and no more than 256 UTF-16 code units');
  const salt = randomBytes(16).toString('hex');
  return {algorithm:'scrypt-v1', salt, digest:(await derive(password,salt)).toString('hex')};
}
export async function verifyLocalPassword(password: string, record: LocalAccount['password']): Promise<boolean> {
  if (typeof password !== 'string' || password.length > 256) return false;
  return timingSafeEqual(await derive(password,record.salt),Buffer.from(record.digest,'hex'));
}

/** Administrator-owned, private file outside served directories. No auto-created accounts. */
export async function readPrivateJson(file: string): Promise<unknown> {
  if (!path.isAbsolute(file)) throw new Error('Security file path must be absolute');
  const parent = await lstat(path.dirname(file));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o022) !== 0) throw new Error('Security directory must not be writable by other accounts');
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 1024 * 1024 || (stat.mode & 0o077) !== 0 ||
        (stat.uid !== process.getuid?.() && stat.uid !== 0)) throw new Error('Security file must be private (0600) and owned by this service account or root');
    return JSON.parse(await handle.readFile('utf8')) as unknown;
  } finally {await handle.close();}
}
export const readAccounts = async (file: string) => parseAccounts(await readPrivateJson(file));
