import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Check actual built imports, not just React source: bundling can otherwise
// accidentally pull the history chart dependency back onto the startup path.
const directory=path.resolve(process.argv[2]||'dist','assets');
const files=fs.readdirSync(directory);
const entry=files.filter(file=>/^StringDashboard-.*\.js$/.test(file));
assert.equal(entry.length,1,'One string-list entry in a fresh build');
const seen=new Set();
function visit(file){
  if(seen.has(file))return;
  seen.add(file);
  const source=fs.readFileSync(path.join(directory,file),'utf8');
  for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*)["']\.\/([^"']+\.js)["']/g))visit(match[1]);
}
visit(entry[0]);
assert(![...seen].some(file=>/PcsOperationalTimeline|CartesianChart|LineChart/.test(file)),'Closed history must not load chart code');
const source=fs.readFileSync(path.join(directory,entry[0]),'utf8');
assert.match(source,/import\(["']\.\/PcsOperationalTimeline-/,'History remains dynamically available');
console.log(JSON.stringify({stringEntry:entry[0],initialModules:seen.size,uncompressedBytes:[...seen].reduce((total,file)=>total+fs.statSync(path.join(directory,file)).size,0),historyChartsDeferred:true}));
