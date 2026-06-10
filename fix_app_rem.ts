import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const sIdx = content.indexOf('const fetchAllData = async (silent = false) => {');
const eIdx = content.indexOf('// Set up polling', sIdx);

const newFetch = `const fetchAllData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const modeRes = await fetch("/api/local/status").catch(() => null);
      if (modeRes && modeRes.ok) {
        setEmsMetadata(await modeRes.json());
      }
    } catch (err) {
      console.warn("Failed to fetch App.tsx master telemetry:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  `;

if (sIdx > -1 && eIdx > -1) {
    content = content.substring(0, sIdx) + newFetch + content.substring(eIdx);
}

// remove unused variables `devices`, `logs`, `reports`
content = content.replace(/const \[devices, setDevices\] = useState<BessDevice\[\]>\(\[\]\);\n/g, 'const [devices] = useState<BessDevice[]>([]);\n');
content = content.replace(/const \[logs, setLogs\] = useState<BessLog\[\]>\(\[\]\);\n/g, 'const [logs] = useState<BessLog[]>([]);\n');
content = content.replace(/const \[reports, setReports\] = useState<ReportConfig\[\]>\(\[\]\);\n/g, 'const [reports] = useState<ReportConfig[]>([]);\n');

fs.writeFileSync('src/App.tsx', content);

console.log('Patched App.tsx fetchAllData and unused vars.');
