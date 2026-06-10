const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/Reporting.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/bg-\[#12141C\]/g, 'bg-prizm-surface');
content = content.replace(/bg-\[#0F1117\]/g, 'bg-prizm-surface-strong');
content = content.replace(/bg-\[#161922\]/g, 'bg-prizm-surface-strong');

content = content.replace(/border-white\/5/g, 'border-prizm-border');
content = content.replace(/border-white\/10/g, 'border-prizm-border');
content = content.replace(/border-white\/20/g, 'border-prizm-border');

content = content.replace(/text-white\/30/g, 'text-prizm-text-muted');
content = content.replace(/text-white\/40/g, 'text-prizm-text-muted');
content = content.replace(/text-white\/60/g, 'text-prizm-text-muted');
content = content.replace(/text-white\/90/g, 'text-prizm-text');

// Note: text-white might replace things that are already correct but it's safe to do if properly bounded
content = content.replace(/text-white /g, 'text-prizm-text ');
content = content.replace(/text-white"/g, 'text-prizm-text"');

fs.writeFileSync(file, content);
console.log('Reporting.tsx cleaned');
