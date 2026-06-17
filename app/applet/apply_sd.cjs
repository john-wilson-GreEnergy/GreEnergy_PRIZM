const fs = require('fs');

// File 3: SiteDistributionDashboard.tsx
let sdStr = fs.readFileSync('src/components/SiteDistributionDashboard.tsx', 'utf8');
if (!sdStr.includes('import { markPerf }')) sdStr = "import { markPerf } from '../lib/perf';\n" + sdStr;
if (!sdStr.includes('const [refreshing, setRefreshing]')) {
  sdStr = sdStr.replace('const [loading, setLoading] = useState(true);', 'const [loading, setLoading] = useState(true);\n  const [refreshing, setRefreshing] = useState(false);');
  sdStr = sdStr.replace('const loadData = async (refresh = false) => {\n    setLoading(true);', 'const loadData = async (refresh = false) => {\n    const t0 = performance.now();\n    if (refresh) setRefreshing(true);\n    else setLoading(true);');
  sdStr = sdStr.replace(/setErrorMsg\([\s\S]*?Failed to connect to Site Distribution telemetry service[\s\S]*?\);\n\s*\}\n\s*\};\n/, "setErrorMsg(`Failed to connect to Site Distribution telemetry service: ${err.message}`);\n    } finally {\n      setLoading(false);\n      setRefreshing(false);\n      markPerf('Site Distribution Refresh', t0);\n    }\n  };\n");
  sdStr = sdStr.replace('{loading ? <RefreshCw size={10} className="animate-spin" /> : <RefreshCw size={10} />}', '{(refreshing || loading) ? <RefreshCw size={10} className="animate-spin" /> : <RefreshCw size={10} />}');
}
fs.writeFileSync('src/components/SiteDistributionDashboard.tsx', sdStr);

// File 4: SensorsView.tsx
let svStr = fs.readFileSync('src/components/kobold/SensorsView.tsx', 'utf8');
if (!svStr.includes('import { markPerf }')) {
    svStr = "import { markPerf } from '../../lib/perf';\n" + svStr;
}
svStr = svStr.replace('const loadData = async () => {\n    if (rows.length === 0) setLoading(true);\n    setRefreshing(true);', 'const loadData = async () => {\n    const t0 = performance.now();\n    if (rows.length === 0) setLoading(true);\n    setRefreshing(true);');
if (!svStr.includes('markPerf(\'SensorsView Refresh\'')) {
    svStr = svStr.replace(/setRefreshing\(false\);\n\s*\}\n\s*\};\n/, "setRefreshing(false);\n      markPerf('SensorsView Refresh', t0);\n    }\n  };\n");
}
fs.writeFileSync('src/components/kobold/SensorsView.tsx', svStr);

// App.tsx tab transition indicator
let appStr = fs.readFileSync('src/App.tsx', 'utf8');
if (!appStr.includes('import { markPerf }')) {
    appStr = `import { markPerf } from './lib/perf';\n` + appStr;
}
if (!appStr.includes('const t0 = performance.now();')) {
    appStr = appStr.replace('const fetchAllData = async (silent = false) => {', 'const fetchAllData = async (silent = false) => {\n    const t0 = performance.now();');
    appStr = appStr.replace(/if \(!silent\) setLoading\(false\);\n\s*\}\n\s*\};/, "if (!silent) setLoading(false);\n      markPerf('App fetchAllData', t0);\n    }\n  };");
}
if (!appStr.includes('Loading view...')) {
    appStr = appStr.replace('{/* TOP NAVIGATION BAR (DAYLIGHT DESIGN THEME) */}', `{/* TOP NAVIGATION BAR (DAYLIGHT DESIGN THEME) */}\n      {isPending && (\n        <div className="bg-prizm-bg border-b border-prizm-border px-4 py-1 text-center">\n          <span className="text-[9px] font-mono uppercase tracking-widest text-prizm-info animate-pulse">\n            Loading view...\n          </span>\n        </div>\n      )}`);
}
fs.writeFileSync('src/App.tsx', appStr);
