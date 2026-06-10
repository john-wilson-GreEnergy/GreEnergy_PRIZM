import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/App.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import Dashboard from "./components/Dashboard";',
  'import SiteTelemetryDashboard from "./components/SiteTelemetryDashboard";'
);

// We'll regex replace to catch multiple lines safely
content = content.replace(
  /{activeTab === "overview" && \([\s\S]*?<Dashboard[\s\S]*?\/>[\s\S]*?\)}/,
  '{activeTab === "overview" && (\n              <SiteTelemetryDashboard />\n            )}'
);

fs.writeFileSync(file, content);
console.log('App.tsx patched');
// delete Dashboard and KoboldMonitor
if (fs.existsSync(path.join(process.cwd(), 'src/components/Dashboard.tsx'))) {
  fs.unlinkSync(path.join(process.cwd(), 'src/components/Dashboard.tsx'));
}
if (fs.existsSync(path.join(process.cwd(), 'src/components/KoboldMonitor.tsx'))) {
  fs.unlinkSync(path.join(process.cwd(), 'src/components/KoboldMonitor.tsx'));
}

