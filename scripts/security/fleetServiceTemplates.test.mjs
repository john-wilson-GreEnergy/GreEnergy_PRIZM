import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const folder = new URL('../../deployment/linux/fleet/', import.meta.url);
for (const name of ['prizm-fleet.service', 'prizm-fleet-entry@.service', 'prizm-site@.service']) {
  const unit = await readFile(new URL(name, folder), 'utf8');
  for (const required of ['BindsTo=prizm-fleet-network.service', 'NetworkNamespacePath=/run/netns/prizm-', 'NoNewPrivileges=yes', 'ProtectSystem=strict', 'ProtectHome=yes', 'CapabilityBoundingSet=\n', 'MemoryMax=', 'UMask=0077']) assert.ok(unit.includes(required), `${name}: ${required}`);
  assert.doesNotMatch(unit, /^User=root$/m);
  assert.doesNotMatch(unit, /NODE_TLS_REJECT_UNAUTHORIZED|allowLoopback|ExecStart=.*(?:sudo|ip netns|bash -c)|EnvironmentFile=-/);
  assert.match(unit, /^ExecStart=\/usr\/bin\/node \/opt\/prizm-fleet\/current\/dist\//m);
  assert.doesNotMatch(unit, /^WorkingDirectory="/m);
  if (name === 'prizm-site@.service') assert.match(unit, /^ReadWritePaths=\/var\/lib\/prizm-sites\/%i$/m);
  else assert.doesNotMatch(unit, /^ReadWritePaths=/m);
}
console.log('Fleet templates: namespace dependency, separate users, private files, bounded resources and restricted write paths passed');
const admin = await readFile(new URL('prizm-fleet-admin.service', folder), 'utf8');
assert.match(admin, /^NetworkNamespacePath=\/run\/netns\/prizm-ss3$/m);
assert.match(admin, /^BindsTo=prizm-fleet-network.service$/m);
const ssh = await readFile(new URL('admin-sshd.conf', folder), 'utf8');
for (const setting of ['ListenAddress 10.0.0.15', 'AuthenticationMethods publickey', 'PasswordAuthentication no', 'KbdInteractiveAuthentication no', 'PermitRootLogin no', 'AllowUsers ebc', 'DisableForwarding yes']) assert.ok(ssh.includes(setting));
assert.doesNotMatch(ssh, /^Include /m);
console.log('Fleet admin template: SS3-only, dedicated key file, ebc-only and forwarding disabled passed');
