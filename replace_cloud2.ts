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
  { search: /externalEquivalent/g, replace: 'externalEquivalent' },
  { search: /external interaction/g, replace: 'external interaction' },
  { search: /External endpoint/g, replace: 'External endpoint' },
  { search: /External scheduler/g, replace: 'External scheduler' },
  { search: /from external/g, replace: 'from external' },
  { search: /ExternalTelemetryPacket/g, replace: 'ExternalTelemetryPacket' },
  { search: /destinationExternalEndpoint/g, replace: 'destinationExternalEndpoint' },
  { search: /setLocalWanOutageActive/g, replace: 'setLocalWanOutageActive' },
  { search: /wan_sync_state/g, replace: 'wan_sync_state' },
  { search: /bess-external-ingest/g, replace: 'bess-external-ingest' },
  { search: /setLocalWanOutage/g, replace: 'setLocalWanOutage' },
  { search: /external telemetry stream/g, replace: 'external telemetry stream' },
  { search: /to the external system/g, replace: 'to the external system' }
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
