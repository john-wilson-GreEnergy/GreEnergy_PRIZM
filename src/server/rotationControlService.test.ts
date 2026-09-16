import assert from 'node:assert/strict';
import { rotationReadbackMatches } from './rotationControlService';

assert.equal(rotationReadbackMatches({ stringViewerDataModel: { outRotation: false } }, 'in'), true);
assert.equal(rotationReadbackMatches({ stringViewerDataModel: { outRotation: true } }, 'out'), true);
assert.equal(rotationReadbackMatches({ stringViewerDataModel: { inRotation: true } }, 'in'), true);
assert.equal(rotationReadbackMatches({ stringViewerDataModel: { rotationStatus: 'OUT' } }, 'out'), true);
assert.equal(rotationReadbackMatches({ stringViewerDataModel: {} }, 'in'), null);

console.log('rotationControlService readback tests passed');
