import fs from 'fs';
const file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

const regexIterateFeather = /let fOnline = 0[\s\S]*?devicesWithIssues\.push\(f\);\n\s*\}\n\s*\}\);\n\n\s*const totalFeather = fDevices\.length;/;
const matchIterateFeather = file.match(regexIterateFeather);

if (matchIterateFeather) {
  console.log("Found iterateFeather:\\n", matchIterateFeather[0]);
} else {
  console.log("Could not find iterateFeather.");
}

const regexActiveIssueGroupsPush = /activeIssueGroups\.push\(g\);/;
const matchActiveIssueGroupsPush = file.match(regexActiveIssueGroupsPush);
if (matchActiveIssueGroupsPush) {
  const fileLines = file.split('\\n');
  const index = fileLines.findIndex(l => l.includes('activeIssueGroups.push(g)'));
  console.log("activeIssueGroups logic:\\n", fileLines.slice(index - 20, index + 2).join('\\n'));
}

