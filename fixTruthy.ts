import fs from 'fs';

let content = fs.readFileSync('src/components/FeatherDashboard.tsx', 'utf8');

content = content.replace(
  /\(d\.raw\?\.directFeather as any\)\?\.hydrogen1PPM \?\? "N\/A"/g,
  '(d.raw?.directFeather as any)?.hydrogen1PPM || "N/A"'
);

content = content.replace(
  / \?\? "N\/A"/g,
  ' || "N/A"'
);

// State: Normal / Warning / Alarm / Offline / Not reporting based on merged health
content = content.replace(
  /\(d\.reachable \? \(d\.alarmCount \? 'ALARM' : d\.warningCount \? 'WARNING' : 'NORMAL'\) : \(d\.sourceCoverage\.directFeather \? 'OFFLINE' : 'Not reporting'\)\) \|\| "N\/A"/g,
  "(d.reachable ? (d.alarmCount ? 'ALARM' : d.warningCount ? 'WARNING' : 'NORMAL') : (d.sourceCoverage?.directFeather ? 'OFFLINE' : 'Not reporting'))"
);

fs.writeFileSync('src/components/FeatherDashboard.tsx', content);

console.log('Fixed truthiness errors');
