import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// The whole mock section seems to extend very far because I didn't delete the other endpoints!
// I will just disable all remaining DEV mock API code.
content = content.replace(/let devices: any\[\] = \[\];/g, '');
content = content.replace(/let logs = readJSONFile<BessLog\[\]>\(LOGS_FILE, initialLogs\);/g, '');
content = content.replace(/let reports = readJSONFile<ReportConfig\[\]>\(REPORTS_FILE, initialReports\);/g, '');

content = content.replace(/if \(\!fs\.existsSync\(DEVICES_FILE\)\) writeJSONFile\(DEVICES_FILE, devices\);/g, '');
content = content.replace(/if \(\!fs\.existsSync\(LOGS_FILE\)\) writeJSONFile\(LOGS_FILE, logs\);/g, '');
content = content.replace(/if \(\!fs\.existsSync\(REPORTS_FILE\)\) writeJSONFile\(REPORTS_FILE, reports\);/g, '');

content = content.replace(/writeJSONFile\(DEVICES_FILE, devices\);/g, '');
content = content.replace(/writeJSONFile\(LOGS_FILE, logs\);/g, '');
content = content.replace(/writeJSONFile\(REPORTS_FILE, reports\);/g, '');

content = content.replace(/const DEVICES_FILE =[^;]+;/g, '');
content = content.replace(/const REPORTS_FILE =[^;]+;/g, '');
content = content.replace(/const LOGS_FILE =[^;]+;/g, '');

// Also delete the whole block from 1495 to 1550 - actually instead of delete, I could just make it safely not error for ts.
let toRemove = [
    `writeJSONFile(DEVICES_FILE, devices);`,
    `writeJSONFile(LOGS_FILE, logs);`,
    `writeJSONFile(REPORTS_FILE, reports);`,
    `if (!fs.existsSync(DEVICES_FILE))`,
    `if (!fs.existsSync(LOGS_FILE))`,
    `if (!fs.existsSync(REPORTS_FILE))`
];

toRemove.forEach(s => content = content.split(s).join('// removed'));

fs.writeFileSync('server.ts', content);

// And we can fix reports = [] so it doesn't fail
fs.appendFileSync('server.ts', '\nlet reports: any[] = [];\nlet logs: any[] = [];\nlet devices: any[] = [];\n');

