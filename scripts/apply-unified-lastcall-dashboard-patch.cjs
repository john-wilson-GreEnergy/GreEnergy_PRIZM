#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'src/server/stringsDashboard.ts');
let src = fs.readFileSync(target, 'utf8');

function replaceOnce(label, from, to) {
  if (!src.includes(from)) throw new Error(`Patch anchor not found: ${label}`);
  src = src.replace(from, to);
}

function insertAfter(label, marker, insertion) {
  if (src.includes(insertion.trim())) return;
  if (!src.includes(marker)) throw new Error(`Patch anchor not found: ${label}`);
  src = src.replace(marker, `${marker}${insertion}`);
}

if (!src.includes('buildLastCallStringDashboardData')) {
  replaceOnce(
    'unified lastcall import',
    `import { stringNumberToEnergySegment, formatStringEsLabel } from "../lib/stringToEsMapper";\n`,
    `import { stringNumberToEnergySegment, formatStringEsLabel } from "../lib/stringToEsMapper";\nimport { buildLastCallStringDashboardData } from "./normalizers/lastCallStringDashboard";\n`
  );
}

insertAfter(
  'unified lastcall early return',
  `    const arrayReports = getEmsCachedArrayReports() || {};\n`,
  `\n    const unifiedLastCallDashboard = buildLastCallStringDashboardData({\n        profile,\n        baseUrl,\n        lastCallWrapper,\n        blockWrapper,\n        stringIpMapWrapper,\n        ipMapWrapper,\n        rawStringsWrapper,\n        sourceHealth,\n        debugInfoMap\n    });\n    if (unifiedLastCallDashboard) {\n        return unifiedLastCallDashboard;\n    }\n`
);

fs.writeFileSync(target, src);
console.log('Patched stringsDashboard.ts to return the unified lastCall dashboard source first.');
