/** Transactional network prototype. CLI is deliberately restricted to disposable veth labs. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {open, readFile, rename, lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const exec = promisify(execFile);
const run = async (args, input) => {
  if (input !== undefined) throw new Error('Unexpected command input');
  return (await exec('ip', args, {timeout: 10000, maxBuffer: 1024 * 1024})).stdout;
};
export function validatePlan(p) {
  if (!p || p.mode !== 'disposable-veth-lab' || !/^prizm-life-[a-z0-9]+$/.test(p.prefix) ||
      p.parent !== p.prefix + '-parent' || !Array.isArray(p.ports) || p.ports.length !== 2 ||
      typeof p.stateFile !== 'string' || !path.isAbsolute(p.stateFile)) throw new Error('Disposable lab plan required; physical-port execution is not enabled');
  for (const [index, port] of p.ports.entries()) {
    if (port.name !== `port${index + 3}` || !/^02:[a-f0-9]{2}(?::[a-f0-9]{2}){4}$/.test(port.mac) ||
        port.originalAddress !== (index === 0 ? '10.0.0.15/16' : '192.168.1.16/16')) throw new Error('Invalid lab port identity');
  }
  if (p.ports[0].mac === p.ports[1].mac) throw new Error('Distinct port MACs required');
  return structuredClone(p);
}
const ns = (p, suffix) => `${p.prefix}-${suffix}`;
const inNs = (name, args) => run(['-n', name, ...args]);
const exists = async name => (JSON.parse(await run(['-j', 'netns', 'list']))).some(n => n.name === name);
const links = async name => JSON.parse(await inNs(name, ['-j', '-d', 'addr', 'show']));
async function writeState(file, state) {
  const temp = file + '.next';
  const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try {await handle.writeFile(JSON.stringify(state, null, 2));await handle.sync();} finally {await handle.close();}
  await rename(temp, file);
  const directory = await open(path.dirname(file), 'r');
  try {await directory.sync();} finally {await directory.close();}
}
async function readState(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o077) !== 0) throw new Error('Private root-owned regular journal required');
  return JSON.parse(await readFile(file, 'utf8'));
}
export async function preflight(input) {
  const p = validatePlan(input);
  if (process.platform !== 'linux' || process.getuid() !== 0) throw new Error('Linux root required');
  const directory = await lstat(path.dirname(p.stateFile));
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) !== 0 || directory.uid !== 0) throw new Error('Root-owned private journal directory required');
  if (!await exists(p.parent)) throw new Error('Owned lab parent missing');
  for (const suffix of ['ss3', 'ss4', 'fleet']) if (await exists(ns(p, suffix))) throw new Error('Target namespace already exists; refusing adoption');
  const found = await links(p.parent);
  for (const port of p.ports) {
    const link = found.find(l => l.ifname === port.name);
    if (!link || link.address !== port.mac || link.linkinfo?.info_kind !== 'veth' || link.master ||
        JSON.stringify(link.addr_info.filter(a => a.family === 'inet').map(a => `${a.local}/${a.prefixlen}`)) !== JSON.stringify([port.originalAddress]) ||
        link.addr_info.some(a => a.family === 'inet6')) throw new Error('Port type, MAC or address differs; refusing move (IPv6 is outside this lab)');
  }
  const routes = JSON.parse(await inNs(p.parent, ['-j', '-4', 'route', 'show', 'table', 'main']));
  if (routes.some(r => r.dst === 'default' ? r.dev !== 'port3' || r.gateway !== '10.0.0.1' ||
      !['boot', 'static', undefined].includes(r.protocol) || (r.metric !== undefined && !Number.isSafeInteger(r.metric)) ||
      Object.keys(r).some(k => !['dst', 'gateway', 'dev', 'protocol', 'metric', 'flags'].includes(k)) : r.protocol !== 'kernel')) throw new Error('Unsupported original routes');
  return {plan: p, originalRoutes: routes, originalLinks: found.filter(l => p.ports.some(p => p.name === l.ifname))};
}
const firewall = (p, n) => {
  const hub = n === 3 ? '172.31.250.1' : '172.31.250.5';
  return `table inet prizm_lifecycle {
chain input { type filter hook input priority 0; policy drop;
iifname "lo" accept
ct state established,related accept
iifname "port${n}" ip saddr 10.0.0.0/16 ip daddr 10.0.0.15 tcp dport 3443 accept
iifname "fleet0" ip saddr ${hub} tcp dport 9443 accept
}
chain forward { type filter hook forward priority 0; policy drop; counter drop; }
chain output { type filter hook output priority 0; policy drop;
oifname "lo" accept
ct state established,related accept
oifname "fleet0" ip daddr ${hub} tcp dport 3443 accept
oifname "port${n}" ip daddr 10.0.0.0/16 accept
}
}`;
};
async function installFirewall(name, rules) {
  // nft accepts an entire ruleset as one argv; no shell interpolation.
  await exec('ip', ['netns', 'exec', name, 'nft', rules], {timeout: 10000});
}
export async function apply(input, crashAfterMove = false) {
  const initial = await preflight(input), p = initial.plan;
  // Refuse to reuse an outstanding journal. A completed rollback may be retried.
  try {if ((await readState(p.stateFile)).phase !== 'rolled-back') throw new Error('Outstanding journal requires rollback');}
  catch (error) {if (error.code !== 'ENOENT') throw error;}
  const state = {...initial, version: 1, phase: 'applying', created: [], moved: []};
  await writeState(p.stateFile, state);
  try {
    for (const suffix of ['fleet', 'ss3', 'ss4']) {
      const name = ns(p, suffix);
      state.created.push(name); await writeState(p.stateFile, state); // intent before mutation
      await run(['netns', 'add', name]);
      await exec('ip', ['netns', 'exec', name, 'sysctl', '-q', '-w', 'net.ipv4.ip_forward=0', 'net.ipv6.conf.all.forwarding=0', 'net.ipv6.conf.all.disable_ipv6=1', 'net.ipv6.conf.default.disable_ipv6=1']);
      await inNs(name, ['link', 'set', 'lo', 'up']);
    }
    await installFirewall(ns(p, 'fleet'), `table inet prizm_lifecycle {
chain input { type filter hook input priority 0; policy drop; iifname "lo" accept; ct state established,related accept; ip saddr {172.31.250.2,172.31.250.6} tcp dport 3443 accept; }
chain forward { type filter hook forward priority 0; policy drop; counter drop; }
chain output { type filter hook output priority 0; policy drop; oifname "lo" accept; ct state established,related accept; ip daddr {172.31.250.2,172.31.250.6} tcp dport 9443 accept; }
}`);
    for (const n of [3, 4]) {
      const name = ns(p, `ss${n}`), fleet = ns(p, 'fleet');
      await installFirewall(name, firewall(p, n));
      await inNs(name, ['link', 'add', 'fleet0', 'type', 'veth', 'peer', 'name', `ss${n}`, 'netns', fleet]);
      await inNs(name, ['addr', 'add', n === 3 ? '172.31.250.2/30' : '172.31.250.6/30', 'dev', 'fleet0']);
      await inNs(fleet, ['addr', 'add', n === 3 ? '172.31.250.1/30' : '172.31.250.5/30', 'dev', `ss${n}`]);
      await inNs(name, ['link', 'set', 'fleet0', 'up']); await inNs(fleet, ['link', 'set', `ss${n}`, 'up']);
    }
    // Secondary first; firewall is in place before either port is attached.
    for (const port of [...p.ports].reverse()) {
      const name = ns(p, port.name === 'port3' ? 'ss3' : 'ss4');
      state.moved.push(port.name); await writeState(p.stateFile, state);
      await inNs(p.parent, ['link', 'set', port.name, 'netns', name]);
      if (crashAfterMove) process.kill(process.pid, 'SIGKILL');
      await inNs(name, ['-4', 'addr', 'flush', 'dev', port.name]);
      await inNs(name, ['addr', 'add', '10.0.0.15/16', 'dev', port.name]);
      await inNs(name, ['link', 'set', port.name, 'up']);
    }
    state.phase = 'active'; await writeState(p.stateFile, state);
    return state;
  } catch (error) {await rollback(p.stateFile);throw error;}
}
export async function rollback(file) {
  const state = await readState(file), p = validatePlan(state.plan);
  if (p.stateFile !== file || state.version !== 1 || !['applying', 'active', 'rolling-back', 'rolled-back'].includes(state.phase) ||
      !Array.isArray(state.created) || state.created.some(name => !['fleet', 'ss3', 'ss4'].some(s => name === ns(p, s))) ||
      !Array.isArray(state.moved) || state.moved.some(name => !p.ports.some(port => port.name === name))) throw new Error('Invalid rollback journal');
  if (state.phase === 'rolled-back') return;
  // Do not kill unknown processes. The lab stops its fixtures before rollback.
  for (const name of state.created) if (await exists(name) && (await run(['netns', 'pids', name])).trim()) throw new Error('Stop namespace services before rollback');
  state.phase = 'rolling-back';await writeState(file, state);
  for (const name of [...state.moved].reverse()) {
    const port = p.ports.find(port => port.name === name), site = ns(p, name === 'port3' ? 'ss3' : 'ss4');
    const parentLink = (await links(p.parent)).find(l => l.ifname === name);
    if (!parentLink) {
      const current = await exists(site) ? (await links(site)).find(l => l.ifname === name) : null;
      if (!current || current.address !== port.mac || current.linkinfo?.info_kind !== 'veth') throw new Error('Port ownership changed; retain namespaces for recovery');
      await inNs(site, ['link', 'set', name, 'netns', p.parent]);
    } else if (parentLink.address !== port.mac || parentLink.linkinfo?.info_kind !== 'veth') throw new Error('Original port name is occupied by another device');
    await inNs(p.parent, ['-4', 'addr', 'flush', 'dev', name]);
    await inNs(p.parent, ['addr', 'add', port.originalAddress, 'dev', name]);
    const original = state.originalLinks.find(l => l.ifname === name);
    await inNs(p.parent, ['link', 'set', name, original.flags.includes('UP') ? 'up' : 'down']);
  }
  const originalDefault = state.originalRoutes.find(r => r.dst === 'default');
  if (originalDefault) await inNs(p.parent, ['route', 'replace', 'default', 'via', originalDefault.gateway, 'dev', originalDefault.dev,
    ...(originalDefault.protocol ? ['proto', originalDefault.protocol] : []), ...(originalDefault.metric !== undefined ? ['metric', String(originalDefault.metric)] : [])]);
  for (const name of [...state.created].reverse()) if (await exists(name)) {
    const remaining = (await links(name)).filter(l => l.ifname !== 'lo');
    if (remaining.some(l => !['fleet0', 'ss3', 'ss4'].includes(l.ifname) || l.linkinfo?.info_kind !== 'veth')) throw new Error('Unknown interface present; refusing namespace deletion');
    await run(['netns', 'delete', name]);
  }
  state.phase = 'rolled-back'; await writeState(file, state);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [action, file, flag, ...extra] = process.argv.slice(2);
  const main = async () => {
    if (!file || extra.length || (flag && flag !== '--crash-after-move') || !['check', 'apply', 'rollback'].includes(action)) throw new Error('Usage: fleet-network-lifecycle.mjs check|apply LAB_PLAN_JSON [--crash-after-move] OR rollback JOURNAL_JSON');
    if (action === 'rollback') await rollback(file);
    else {
      const plan = validatePlan(JSON.parse(await readFile(file, 'utf8')));
      if (action === 'check') await preflight(plan); else await apply(plan, flag === '--crash-after-move');
    }
    console.log(`Fleet network lab ${action} complete`);
  };
  main().catch(error => {console.error(error.message);process.exitCode = 1;});
}
