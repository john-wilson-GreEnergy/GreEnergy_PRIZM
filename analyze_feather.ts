import fs from 'fs';
const file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

const regexFeather = /const featherSummary = \{[\s\S]*?(?=const pcsSummary)/;
const matchFeather = file.match(regexFeather);

if (matchFeather) {
  console.log("Found featherSummary block:\\n", matchFeather[0]);
}

const regexPcs = /const pcsSummary = [\s\S]*?(?=const topologyCounts)/;
const matchPcs = file.match(regexPcs);
if (matchPcs) console.log("\\nFound pcsSummary block:\\n", matchPcs[0].substring(0, 300));

const regexActiveIssueGroups = /const activeIssueGroups = [\s\S]*?(?=const emsApps)/;
const matchActiveIssueGroups = file.match(regexActiveIssueGroups);
if (matchActiveIssueGroups) console.log("\\nFound activeIssueGroups block:\\n", matchActiveIssueGroups[0].substring(0, 300));
