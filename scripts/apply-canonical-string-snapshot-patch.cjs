#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'src/server/stringsDashboard.ts');
let src = fs.readFileSync(target, 'utf8');

function replaceOnce(label, from, to) {
  if (!src.includes(from)) throw new Error(`Patch anchor not found: ${label}`);
  src = src.replace(from, to);
}

function insertBefore(label, marker, insertion) {
  if (src.includes(insertion.trim())) return;
  if (!src.includes(marker)) throw new Error(`Patch anchor not found: ${label}`);
  src = src.replace(marker, `${insertion}${marker}`);
}

function insertAfter(label, marker, insertion) {
  if (src.includes(insertion.trim())) return;
  if (!src.includes(marker)) throw new Error(`Patch anchor not found: ${label}`);
  src = src.replace(marker, `${marker}${insertion}`);
}

if (!src.includes('applyCanonicalStringSnapshot')) {
  replaceOnce(
    'canonical import',
    `import { stringNumberToEnergySegment, formatStringEsLabel } from "../lib/stringToEsMapper";\n`,
    `import { stringNumberToEnergySegment, formatStringEsLabel } from "../lib/stringToEsMapper";\nimport { applyCanonicalStringSnapshot } from "./normalizers/canonicalStringSnapshot";\n`
  );
}

if (!src.includes('const canonicalStringSnapshot = applyCanonicalStringSnapshot')) {
  replaceOnce(
    'canonical snapshot application',
    `    // Recompute all summary counters from final canonical strings!\n`,
    `    const canonicalStringSnapshot = applyCanonicalStringSnapshot(strings, {\n        lastCall: lastCallWrapper.data,\n        blockviewer: blockWrapper.data\n    });\n    strings.length = 0;\n    strings.push(...canonicalStringSnapshot.strings);\n\n    // Recompute all summary counters from final canonical strings!\n`
  );
}

// Preserve debug through buildCanonicalStringState. Some branches already changed the sourceDebug
// block, so use a broad insertion before the conflicts property instead of replacing the full object.
if (!src.includes('canonicalStringSnapshot: s.sourceDebug?.canonicalStringSnapshot')) {
  const marker = `            conflicts: []`;
  insertBefore(
    'preserve canonical debug through buildCanonicalStringState',
    marker,
    `            canonicalStringSnapshot: s.sourceDebug?.canonicalStringSnapshot ?? null,\n            contactorResolution: s.sourceDebug?.contactorResolution ?? null,\n            sourceTimestamps: s.sourceDebug?.sourceTimestamps ?? null,\n`
  );
}

if (!src.includes('canonicalStringSnapshot: {')) {
  replaceOnce(
    'dashboard response debug',
    `        summary: {\n            totalArrays: new Set(strings.map(s => s.arrayNumber)).size,\n            totalStrings: finalTotalStrings,\n`,
    `        canonicalStringSnapshot: {\n            source: canonicalStringSnapshot.source,\n            rollups: canonicalStringSnapshot.rollups,\n            perArray: canonicalStringSnapshot.perArray\n        },\n        summary: {\n            totalArrays: new Set(strings.map(s => s.arrayNumber)).size,\n            totalStrings: finalTotalStrings,\n`
  );
}

fs.writeFileSync(target, src);
console.log('Patched stringsDashboard.ts to use the canonical string snapshot normalizer.');
