import * as fs from 'fs';

function processFile(path) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(/bg-\[#12141C\](\/[0-9]*)?/g, 'bg-prizm-surface');
  content = content.replace(/bg-\[#[a-fA-F0-9]{6}\](\/[0-9]*)?/g, 'bg-prizm-surface-strong');
  content = content.replace(/bg-black(\/[0-9]*)?/g, 'bg-prizm-surface-strong');
  
  content = content.replace(/text-white\/[0-9]{1,2}/g, 'text-prizm-text-muted');
  content = content.replace(/text-white([^a-zA-Z0-9\-])/g, 'text-prizm-text$1');
  
  content = content.replace(/border-white\/[0-9]{1,2}/g, 'border-prizm-border');
  
  content = content.replace(/text-cyan-400/g, 'text-prizm-primary');
  content = content.replace(/text-cyan-500/g, 'text-prizm-primary-strong');
  content = content.replace(/border-cyan-[0-9]{3}(\/[0-9]*)?/g, 'border-prizm-primary');
  content = content.replace(/bg-cyan-500\/[0-9]{1,2}/g, 'bg-prizm-info/10');
  
  // replace #5CF2A5 with var
  content = content.replace(/text-\[#5CF2A5\]/g, 'text-prizm-primary');
  content = content.replace(/bg-\[#5CF2A5\](\/[0-9]*)?/g, 'bg-prizm-primary');
  content = content.replace(/border-\[#5CF2A5\](\/[0-9]*)?/g, 'border-prizm-primary');

  // replace rose/amber
  content = content.replace(/bg-rose-500\/[0-9]{1,2}/g, 'bg-prizm-danger/10');
  content = content.replace(/border-rose-500\/[0-9]{1,2}/g, 'border-prizm-danger/20');
  content = content.replace(/text-rose-400/g, 'text-prizm-danger');
  content = content.replace(/text-rose-[0-9]{3}/g, 'text-prizm-danger');
  
  content = content.replace(/bg-amber-500\/[0-9]{1,2}/g, 'bg-prizm-warning/10');
  content = content.replace(/border-amber-500\/[0-9]{1,2}/g, 'border-prizm-warning/20');
  content = content.replace(/text-amber-400/g, 'text-prizm-warning');
  content = content.replace(/text-amber-[0-9]{3}/g, 'text-prizm-warning');
  content = content.replace(/bg-amber-[0-9]{3}(\/[0-9]*)?/g, 'bg-prizm-warning');

  fs.writeFileSync(path, content);
}

processFile('src/components/ToolDashboards.tsx');
processFile('src/components/KoboldMonitor.tsx');
processFile('src/components/FeatherDashboard.tsx');
processFile('src/components/ConnectionSettings.tsx');
processFile('src/components/Dashboard.tsx');
console.log('done');
