import fs from 'fs';
let file = fs.readFileSync('src/App.tsx', 'utf8');

file = file.replace(
/const \[activeTab, setActiveTab\] = useState<"overview" \| "ems-health" \| "arrays-strings" \| "tool-dashboards" \| "feather-hvac" \| "settings" \| "reports" \| "advanced" \| "safety-fault">\("overview"\);/,
'const [activeTab, setActiveTab] = useState<"overview" | "ems-health" | "pcs-dashboard" | "arrays-strings" | "tool-dashboards" | "feather-hvac" | "settings" | "reports" | "advanced" | "safety-fault">("overview");'
);

file = file.replace(
/from '\.\/types';/, 
"from './types';"
);

// We should also remove 'as any' in onClick={() => setActiveTab('pcs-dashboard' as any)}
file = file.replace(/setActiveTab\('pcs-dashboard' as any\)/g, "setActiveTab('pcs-dashboard')");

fs.writeFileSync('src/App.tsx', file);
console.log('Fixed active tab types');
