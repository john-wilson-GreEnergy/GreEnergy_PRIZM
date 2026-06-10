import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const safetyFaultImportStr = `import SafetyFaultClearView from "./components/SafetyFaultClearView";`;
if (!content.includes('SafetyFaultClearView')) {
    content = content.replace('import {', safetyFaultImportStr + '\nimport {');
}

const tabIdsOld = `const [activeTab, setActiveTab] = useState<"overview" | "ems-health" | "arrays-strings" | "tool-dashboards" | "feather-hvac" | "settings" | "reports" | "advanced">("overview");`;
const tabIdsNew = `const [activeTab, setActiveTab] = useState<"overview" | "ems-health" | "arrays-strings" | "tool-dashboards" | "feather-hvac" | "settings" | "reports" | "advanced" | "safety-fault">("overview");`;

content = content.replace(tabIdsOld, tabIdsNew);

const tabDefOld = `{ id: "advanced", label: "Advanced / Locked", icon: Lock }`;
const tabDefNew = `{ id: "advanced", label: "Advanced / Locked", icon: Lock },\n                { id: "safety-fault", label: "Safety Fault Clear", icon: ShieldAlert }`;

content = content.replace(tabDefOld, tabDefNew);

const viewRenderStr = `{activeTab === "safety-fault" && (
              <SafetyFaultClearView />
            )}`;

if (!content.includes('SafetyFaultClearView />')) {
    const idx = content.indexOf('{activeTab === "advanced"');
    content = content.slice(0, idx) + viewRenderStr + '\n\n            ' + content.slice(idx);
}

fs.writeFileSync('src/App.tsx', content);
