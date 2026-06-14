import fs from 'fs';
let file = fs.readFileSync('src/App.tsx', 'utf8');

file = file.replace(
/onClick=\{\(\) => setActiveTab\(tab\.id as any\)\}/g,
"onClick={() => setActiveTab(tab.id as any)}"
);

// Actually, wait, since the array has `tab.id` as strings, TS complains if we don't cast or type the array. Let's fix the array type instead.
file = file.replace(
/\{\[\s*\{ id: "overview", label: "Block Summary", icon: Activity \},/g,
`{( [
                { id: "overview", label: "Block Summary", icon: Activity },`
);

file = file.replace(
/\]\.map\(tab => \(/g,
`] as const ).map(tab => (`
);

file = file.replace(
/onClick=\{\(\) => setActiveTab\(tab\.id as any\)\}/g,
"onClick={() => setActiveTab(tab.id)}"
);

fs.writeFileSync('src/App.tsx', file);
console.log('Fixed as any array types');
