import fs from 'fs';
import path from 'path';

let serverPath = path.join(process.cwd(), 'server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

const sIdx = content.indexOf('// API: List BESS devices');
const eIdx = content.indexOf('app.get("/api/curllogs"');

if (sIdx > -1 && eIdx > -1) {
    content = content.substring(0, sIdx) + '\n' + content.substring(eIdx);
}

// Remove seeding logic 
content = content.replace(/let devices = readJSONFile<BessDevice\[\]>\(DEVICES_FILE, initialDevices\);/g, "let devices: any[] = [];");
content = content.replace(/let logs: BessLog\[\] = \[\];/g, "let logs: any[] = [];");
content = content.replace(/let reports = readJSONFile<ReportConfig\[\]>\(REPORTS_FILE, DEFAULT_REPORTS\);/g, "let reports: any[] = [];");

content = content.replace(/const DEVICES_FILE =[^;]+;/g, '');
content = content.replace(/const REPORTS_FILE =[^;]+;/g, '');
content = content.replace(/const DEFAULT_REPORTS: ReportConfig\[\] = [^\]]+\];/g, '');
content = content.replace(/const initialDevices: BessDevice\[\] = [^\]]+\];/g, '');


fs.writeFileSync(serverPath, content);
console.log('server.ts deep cleaned!');
