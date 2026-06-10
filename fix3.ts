import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/const \[devices\] = useState<BessDevice\[\]>\(\[\]\);\n/g, 'const [devices, setDevices] = useState<BessDevice[]>([]);\n');
content = content.replace(/const \[logs\] = useState<BessLog\[\]>\(\[\]\);\n/g, 'const [logs, setLogs] = useState<BessLog[]>([]);\n');
content = content.replace(/const \[reports\] = useState<ReportConfig\[\]>\(\[\]\);\n/g, 'const [reports, setReports] = useState<ReportConfig[]>([]);\n');

fs.writeFileSync('src/App.tsx', content);
