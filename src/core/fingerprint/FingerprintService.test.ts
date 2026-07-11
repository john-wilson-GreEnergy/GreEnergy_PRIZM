import assert from 'node:assert/strict';
import { FingerprintError } from './FingerprintError';
import { FingerprintService } from './FingerprintService';

const first = FingerprintService.fingerprint('hello');
const second = FingerprintService.fingerprint('hello');
assert.equal(first.digest, second.digest);
assert.equal(first.algorithm, 'sha256');
assert.equal(first.encoding, 'hex');
assert.equal(first.inputType, 'string');

const orderedA = { b: 2, a: 1 };
const orderedB = { a: 1, b: 2 };
assert.equal(
  FingerprintService.fingerprint(orderedA).digest,
  FingerprintService.fingerprint(orderedB).digest,
);

try {
  FingerprintService.fingerprint(undefined as never);
  assert.fail('Expected undefined input to throw');
} catch (error) {
  assert.ok(error instanceof FingerprintError);
  assert.equal(error.code, 'INVALID_INPUT');
}

console.log('Fingerprint service tests passed');
