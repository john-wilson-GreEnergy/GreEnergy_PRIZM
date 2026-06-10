import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/ToolDashboards.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/bg-white\//g, 'bg-black/');

fs.writeFileSync(file, content);
console.log('ToolDashboards.tsx cleaned');
