import fs from 'fs';
const file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

const regexFeatherIssues = /function formatFeatherIssue[\s\S]*?(?=const sourceHealth)/;
const matchFeatherIssues = file.match(regexFeatherIssues);

if (matchFeatherIssues) {
  console.log("Found issue processing:\\n", matchFeatherIssues[0].substring(0, 1500));
}
