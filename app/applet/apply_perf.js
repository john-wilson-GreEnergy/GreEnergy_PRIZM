const fs = require('fs');

// File 1: App.tsx
let appStr = fs.readFileSync('src/App.tsx', 'utf8');
if (!appStr.includes('import { markPerf }')) {
    appStr = `import { markPerf } from './lib/perf';\n` + appStr;
}
appStr = appStr.replace('const fetchAllData = async (silent = false) => {', 'const fetchAllData = async (silent = false) => {\n    const t0 = performance.now();');
appStr = appStr.replace(/if \(!silent\) setLoading\(false\);\n\s*\}\n\s*};\n/, `if (!silent) setLoading(false);\n      markPerf('App fetchAllData', t0);\n    }\n  };\n`);
// Add pending indicator
if (!appStr.includes('Loading view...')) {
    appStr = appStr.replace('{/* TOP NAVIGATION BAR (DAYLIGHT DESIGN THEME) */}', `{/* TOP NAVIGATION BAR (DAYLIGHT DESIGN THEME) */}\n      {isPending && (\n        <div className="bg-prizm-bg border-b border-prizm-border px-4 py-1 text-center">\n          <span className="text-[9px] font-mono uppercase tracking-widest text-prizm-info animate-pulse">\n            Loading view...\n          </span>\n        </div>\n      )}`);
}
fs.writeFileSync('src/App.tsx', appStr);

// File 2: PcsDashboard.tsx
let pcsStr = fs.readFileSync('src/components/PcsDashboard.tsx', 'utf8');
if (!pcsStr.includes('import { markPerf }')) {
    pcsStr = `import { markPerf } from '../lib/perf';\n` + pcsStr;
}
// Add refreshing state
if (!pcsStr.includes('const [refreshing, setRefreshing]')) {
    pcsStr = pcsStr.replace('const [loading, setLoading] = useState(true);', 'const [loading, setLoading] = useState(true);\n    const [refreshing, setRefreshing] = useState(false);');
    pcsStr = pcsStr.replace('const refreshData = async () => {\n        setLoading(true);', 'const refreshData = async () => {\n        const t0 = performance.now();\n        if (pcsList.length > 0) setRefreshing(true);\n        else setLoading(true);');
    pcsStr = pcsStr.replace(/setFallbackMode\(true\);\n\s*\}\n\s*};\n/, `setFallbackMode(true);\n        }\n        setLoading(false);\n        setRefreshing(false);\n        markPerf('PCS Dashboard Refresh', t0);\n    };\n`);
    // Change refresh icon state
    pcsStr = pcsStr.replace(`<Activity size={10} className={loading ? 'animate-pulse' : ''} /> REFRESH LIVE`, `<Activity size={10} className={(refreshing || loading) ? 'animate-pulse' : ''} /> {(refreshing || loading) ? 'REFRESHING...' : 'REFRESH LIVE'}`);
}
fs.writeFileSync('src/components/PcsDashboard.tsx', pcsStr);

// File 3: SiteDistributionDashboard.tsx
let sdStr = fs.readFileSync('src/components/SiteDistributionDashboard.tsx', 'utf8');
if (!sdStr.includes('import { markPerf }')) {
    sdStr = `import { markPerf } from '../lib/perf';\n` + sdStr;
}
if (!sdStr.includes('const [refreshing, setRefreshing]')) {
    sdStr = sdStr.replace('const [loading, setLoading] = useState(true);', 'const [loading, setLoading] = useState(true);\n  const [refreshing, setRefreshing] = useState(false);');
    sdStr = sdStr.replace('const loadData = async (refresh = false) => {\n    setLoading(true);', 'const loadData = async (refresh = false) => {\n    const t0 = performance.now();\n    if (refresh) setRefreshing(true);\n    else setLoading(true);');
    sdStr = sdStr.replace(/setErrorMsg\(\`Failed to connect to Site Distribution telemetry service: \\$\\{err\.message\\}\`\);\n\s*\}\n\s*};\n/, `setErrorMsg(\`Failed to connect to Site Distribution telemetry service: \$\{err.message\}\`);\n    } finally {\n      setLoading(false);\n      setRefreshing(false);\n      markPerf('Site Distribution Refresh', t0);\n    }\n  };\n`);
    sdStr = sdStr.replace('{loading ? <RefreshCw size={10} className="animate-spin" /> : <RefreshCw size={10} />}', '{(refreshing || loading) ? <RefreshCw size={10} className="animate-spin" /> : <RefreshCw size={10} />}');
    sdStr = sdStr.replace('{(!data && loading) ? (', '{loading ? ('); // if we keep old data visible, wait we already did this?
}
fs.writeFileSync('src/components/SiteDistributionDashboard.tsx', sdStr);

// File 4: SiteSensorsDashboard.tsx -> Wait, it's actually SensorsView.tsx
let svStr = fs.readFileSync('src/components/kobold/SensorsView.tsx', 'utf8');
if (!svStr.includes('import { markPerf }')) {
    svStr = `import { markPerf } from '../../lib/perf';\n` + svStr;
}
svStr = svStr.replace('const loadData = async () => {\n    if (rows.length === 0) setLoading(true);\n    setRefreshing(true);', 'const loadData = async () => {\n    const t0 = performance.now();\n    if (rows.length === 0) setLoading(true);\n    setRefreshing(true);');
svStr = svStr.replace(/setRefreshing\(false\);\n\s*\}\n\s*};\n/, `setRefreshing(false);\n      markPerf('SensorsView Refresh', t0);\n    }\n  };\n`);
fs.writeFileSync('src/components/kobold/SensorsView.tsx', svStr);
