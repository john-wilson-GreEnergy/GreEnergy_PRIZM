import fs from 'fs';
let file = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

file = file.replace(
/className=\{activeIssueGroups\.length > 0 \? "text-prizm-warning" : "text-prizm-primary"\}/,
'className={((sum?.bessFleetSummary?.warningStrings || 0) + (sum?.bessFleetSummary?.alarmStrings || 0)) > 0 ? "text-prizm-warning" : "text-prizm-primary"}'
);

fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', file);
