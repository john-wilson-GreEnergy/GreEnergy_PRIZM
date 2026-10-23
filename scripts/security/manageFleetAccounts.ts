/** Interactive host-admin provisioning and protected administrator role management. No default credentials. */
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {readPrivateJson} from '../../src/server/security/localAccounts';
import {parseCollector} from '../../src/server/fleet/CollectorPoller';
import {listFleetAccounts, manageFleetAccount, type FleetAccountAction} from '../../src/server/fleet/accountManagement';
import path from 'node:path';
import {FLEET_MIN_PASSWORD_LENGTH} from '../../src/core/security/fleetPasswordPolicy';

async function main() {
  const [configFile, kind, email, selection, ...extra] = process.argv.slice(2);
  if (!configFile || extra.length || !['sites', 'list', 'add', 'access', 'workspace', 'remote-controls', 'disable', 'enable', 'password','administrator'].includes(kind) ||
    (['sites', 'list'].includes(kind) ? email !== undefined : !email) ||
    (kind==='administrator' ? !['true','false'].includes(selection) : ['add', 'access','workspace','remote-controls'].includes(kind) ? !selection : selection !== undefined)) {
    throw new Error('Usage: manageFleetAccounts.ts /absolute/fleet.json sites|list OR add|access|workspace|remote-controls email siteId[,siteId] OR disable|enable|password email OR administrator email true|false; workspace or remote-controls email - revokes that permission for every site');
  }
  const config = await readPrivateJson(configFile) as Record<string, unknown>;
  if (!config || !Array.isArray(config.collectors) || typeof config.accountsFile !== 'string' || !path.isAbsolute(config.accountsFile)) throw new Error('Invalid Fleet config');
  const sites = config.collectors.map(c => parseCollector(c, config.allowLoopbackHttp === true));
  if (kind === 'sites') { console.table(sites.map(s => ({siteId: s.siteId, name: s.name, station: s.stationCode, block: s.blockIndex}))); return; }
  if (kind === 'list') { console.table(await listFleetAccounts(config.accountsFile)); return; }
  if (!process.stdin.isTTY) throw new Error('Use an interactive admin terminal');
  const prompt = createInterface({input: process.stdin, output: process.stdout});
  try {
    if(kind==='workspace')console.log('FULL WORKSPACE ACCESS includes the legacy equipment controls and maintenance tools for the selected sites. It is not read-only.');
    if(kind==='remote-controls')console.log('REMOTE CONTROLS grants equipment-control access for the selected sites when the remote profile policy is enabled. LAN grants are unchanged. Use - to lock every remote site.');
    const approved = await prompt.question(`${kind} Fleet account ${email}${selection ? ' for sites ' + selection : ''}? Type yes: `);
    if (approved !== 'yes') { console.log('Cancelled; no changes.'); return; }
  } finally { prompt.close(); }
  let password = '';
  if (kind === 'add' || kind === 'password') {
    const muted = new Writable({write(_chunk, _encoding, done) { done(); }});
    const secret = createInterface({input: process.stdin, output: muted, terminal: true});
    try {
      process.stdout.write(`New password (hidden, at least ${FLEET_MIN_PASSWORD_LENGTH} characters): `); password = await secret.question('');
      process.stdout.write('\nRepeat password (hidden): '); const repeated = await secret.question(''); process.stdout.write('\n');
      if (password !== repeated) throw new Error('Passwords differ; no changes');
    } finally { secret.close(); }
  }
  const action = {kind, email, ...(['add', 'access','workspace','remote-controls'].includes(kind) ? {siteIds: ['workspace','remote-controls'].includes(kind)&&selection==='-'?[]:selection.split(',')} : {}),
    ...(kind==='administrator'?{enabled:selection==='true'}:{}),
    ...(['add', 'password'].includes(kind) ? {password} : {})} as FleetAccountAction;
  const result = await manageFleetAccount(config.accountsFile, sites, action); password = '';
  console.log(JSON.stringify({event: 'fleet.account.changed', ...result}));
  console.log('Saved. Existing sessions for this user are revoked on the next request. Full workspace access is listed separately from telemetry access.');
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Account update failed'); process.exitCode = 1; });
