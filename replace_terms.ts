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
  { search: /site-monitor/gi, replace: 'site-monitor' },
  { search: /site-monitor/g, replace: 'SiteMonitor' },
  { search: /site-monitor/g, replace: 'SITE_MONITOR' },
  { search: /EMS report/gi, replace: 'EMS report' },
  { search: /EMS/gi, replace: 'EMS' },
  { search: //gi, replace: '' }, // remove entirely
  { search: //gi, replace: '' },
  { search: /external reference system/gi, replace: 'external reference system' },
  { search: /EMS snapshot/gi, replace: 'EMS snapshot' },
  { search: /EMS report coverage/gi, replace: 'EMS report coverage' },
  { search: /workbook-style export/gi, replace: 'workbook-style export' },
  { search: /EMS report/gi, replace: 'EMS report' },
  { search: /full site snapshot/gi, replace: 'full site snapshot' },
  { search: /full site snapshot/gi, replace: 'full site snapshot' }
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
