import * as fs from 'fs';
import * as path from 'path';

function walk(dir: string, callback: (path: string) => void) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === 'dist' || file === '.vite') continue;
    const filePath = path.resolve(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      walk(filePath, callback);
    } else {
      callback(filePath);
    }
  }
}

const termsToReplace = [
  { search: /externalTelemetry/g, replace: 'externalTelemetry' },
  { search: /external-telemetry/g, replace: 'external-telemetry' },
  { search: /localWanOutage/g, replace: 'localWanOutage' },
  { search: /EMS summary features/g, replace: 'EMS summary features' },
  { search: /EMS stream/g, replace: 'EMS stream' },
  { search: /to EMS:/g, replace: 'to EMS:' },
  { search: /EMS ingest/g, replace: 'EMS ingest' },
  { search: /EMS ingestion/g, replace: 'EMS ingestion' },
  { search: /intercepted_ems/g, replace: 'intercepted_ems' },
  { search: /Target System/g, replace: 'Target System' },
  { search: /EMS dashboard/g, replace: 'EMS dashboard' },
  { search: /EMS synchronizer/g, replace: 'EMS synchronizer' },
  { search: /EMS Stream/g, replace: 'EMS Stream' }
];

walk(process.cwd(), (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts') || filePath.endsWith('.md')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    for (const { search, replace } of termsToReplace) {
      if (search.test(content)) {
        content = content.replace(search, replace);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  }
});
