import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/site-monitorMonitor.tsx');
let content = fs.readFileSync(file, 'utf8');

// Replace white transparent backgrounds with black transparent (since background is light now)
content = content.replace(/bg-white\//g, 'bg-black/');
content = content.replace(/border-white\//g, 'border-black/');
content = content.replace(/text-white/g, 'text-black');
content = content.replace(/placeholder-white/g, 'placeholder-black');

fs.writeFileSync(file, content);
console.log('site-monitorMonitor.tsx cleaned');
