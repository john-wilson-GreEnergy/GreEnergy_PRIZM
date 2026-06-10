import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/ConnectionSettings.tsx');
let content = fs.readFileSync(file, 'utf8');

// Replace white transparent backgrounds with black transparent (since background is light now)
content = content.replace(/bg-white\/5/g, 'bg-black/5');
content = content.replace(/bg-white\/10/g, 'bg-black/10');
content = content.replace(/placeholder-white\/10/g, 'placeholder-black/20');
content = content.replace(/text-white\/10/g, 'text-black/30');

// Additional cleanup
content = content.replace(/hover:bg-white\/10/g, 'hover:bg-black/10');

fs.writeFileSync(file, content);
console.log('ConnectionSettings.tsx cleaned');
