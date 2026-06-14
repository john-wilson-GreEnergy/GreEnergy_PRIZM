import fs from 'fs';
const file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

const regexActiveIssueGroups = /const activeIssueGroups = [\s\S]*?(?=const emsApps)/;
const matchActiveIssueGroups = file.match(regexActiveIssueGroups);
if (matchActiveIssueGroups) {
   console.log("\\nFound activeIssueGroups block:\\n", matchActiveIssueGroups[0]);
} else {
   console.log("Could not find activeIssueGroups block.");
}
