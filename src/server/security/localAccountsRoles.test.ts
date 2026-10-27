import assert from 'node:assert/strict';
import {parseAccounts, parseCollectorAccounts} from './localAccounts';

// Synthetic parser fixtures only. No password verification, files or requests.
const account = () => ({
  id: 'fixture-admin', email: 'admin@example.test', disabled: false, version: 1,
  password: {algorithm: 'scrypt-v1', salt: '0'.repeat(32), digest: '0'.repeat(128)},
  grants: [], fleetAdmin: true, remoteAccess: true, remoteControlSites: ['fixture-site'],
});
assert.deepEqual(parseAccounts([account()]), parseCollectorAccounts([account()]));
for (const remoteControlSites of ['fixture-site', ['bad site'], ['same', 'same'], Array(17).fill('site')]) {
  const fixture = [{...account(), remoteControlSites}];
  assert.throws(() => parseAccounts(fixture), /Invalid remote control sites/);
  // This field is interpreted/authorized by Fleet, not the deployed collector parser.
  assert.deepEqual(parseCollectorAccounts(fixture), fixture);
}
for (const parser of [parseAccounts, parseCollectorAccounts]) {
  assert.throws(() => parser([]), /Invalid local account store/);
  assert.throws(() => parser([{...account(), remoteAccess: 'true'}]), /Invalid remote access flag/);
  assert.throws(() => parser([{...account(), fleetAdmin: 'true'}]), /Invalid administrator flag/);
  assert.throws(() => parser([{...account(), grants: [{capability: 'unknown'}]}]), /Invalid local grant/);
  assert.throws(() => parser([account(), account()]), /Duplicate local identity/);
  assert.throws(() => parser([{...account(), password: {algorithm: 'plaintext'}}]), /Invalid local account/);
  const fixture = [account()];
  const copy = parser(fixture);
  copy[0].disabled = true;
  assert.equal(fixture[0].disabled, false);
}
console.log('Collector/Fleet account-role parser regression tests passed (synthetic, offline).');
