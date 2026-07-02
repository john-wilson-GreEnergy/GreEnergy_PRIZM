#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'src/server/prizmDataCoordinator.ts');
let src = fs.readFileSync(target, 'utf8');

function replaceAllExact(label, from, to) {
  const count = src.split(from).length - 1;
  if (count === 0) throw new Error(`Patch anchor not found: ${label}`);
  src = src.split(from).join(to);
  console.log(`${label}: replaced ${count} occurrence(s)`);
}

// The coordinator was still checking blockviewer/native block before lastCall. That lets
// blockviewer summary rows beat the richer last-call array/string report and causes the
// Block Summary tab to disagree with the unified String Dashboard. Prefer lastCall first
// everywhere this coordinator scans raw sources for string state/counts.
replaceAllExact(
  'raw source priority',
  `  const candidates = [\n    rawSources.nativeBlockSummary,\n    rawSources.blockviewerRaw,\n    rawSources.nativeEmsBlock,\n    rawSources.block,\n    rawSources.status,\n    rawSources.lastCall\n  ].filter(c => c !== undefined && c !== null);`,
  `  const candidates = [\n    rawSources.lastCall,\n    rawSources.nativeBlockSummary,\n    rawSources.blockviewerRaw,\n    rawSources.nativeEmsBlock,\n    rawSources.block,\n    rawSources.status\n  ].filter(c => c !== undefined && c !== null);`
);

// If this marker exists, the function still checks arrays[].strings[] before the
// last-call arrayReport shape. The reordered candidate list helps, but arrayReport
// needs to be treated as the explicit source when present.
const marker = `    // 1. Check arrays[].strings[]\n`;
if (src.includes(marker) && !src.includes('PRIZM_LASTCALL_ARRAY_REPORT_PRIORITY_INSERT')) {
  const insertion = `    // PRIZM_LASTCALL_ARRAY_REPORT_PRIORITY_INSERT\n    // Prefer blockReport.arrayReport.<array>.stringReport.<string>.stringData when available.\n    // This is the unified last-call string source and includes the explicit contactor feedback.\n    {\n      const blockReport = src.blockReport || src;\n      const arrayReport = blockReport.arrayReport;\n      if (arrayReport && typeof arrayReport === "object") {\n        const arrayKeys = Object.keys(arrayReport).filter(k => !isNaN(Number(k)));\n        if (arrayKeys.length > 0) {\n          const allStrings: any[] = [];\n          let foundAny = false;\n          arrayKeys.sort((a, b) => Number(a) - Number(b)).forEach(k => {\n            const stringReport = arrayReport[k]?.stringReport;\n            if (stringReport && typeof stringReport === "object") {\n              const stringKeys = Object.keys(stringReport).filter(sk => !isNaN(Number(sk)));\n              if (stringKeys.length > 0) {\n                foundAny = true;\n                stringKeys.sort((a, b) => Number(a) - Number(b)).forEach(sk => {\n                  const stringData = stringReport[sk]?.stringData;\n                  if (stringData) {\n                    allStrings.push({\n                      arrayNumber: Number(k),\n                      stringNumber: Number(sk),\n                      stringConnectionState: stringData.stringConnectionState ?? null,\n                      contactorsCloseExpected: stringData.contactorsCloseExpected !== undefined ? (stringData.contactorsCloseExpected === true || stringData.contactorsCloseExpected === "true" || stringData.contactorsCloseExpected === 1) : null,\n                      positiveContactorClosed: stringData.positiveContactorClosed !== undefined ? (stringData.positiveContactorClosed === true || stringData.positiveContactorClosed === "true" || stringData.positiveContactorClosed === 1) : null,\n                      negativeContactorClosed: stringData.negativeContactorClosed !== undefined ? (stringData.negativeContactorClosed === true || stringData.negativeContactorClosed === "true" || stringData.negativeContactorClosed === 1) : null\n                    });\n                  }\n                });\n              }\n            }\n          });\n\n          if (foundAny && allStrings.length > 0) {\n            return {\n              strings: allStrings,\n              sourcePath: "blockReport.arrayReport.*.stringReport.*.stringData"\n            };\n          }\n        }\n      }\n    }\n\n`;
  src = src.replace(marker, insertion + marker);
  console.log('inserted explicit last-call per-string priority block');
}

fs.writeFileSync(target, src);
console.log('Patched prizmDataCoordinator.ts to prefer lastCall string state/counts.');
