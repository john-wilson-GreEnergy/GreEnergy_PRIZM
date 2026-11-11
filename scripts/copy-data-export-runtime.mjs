import fs from 'node:fs';
import path from 'node:path';

const repo=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
for(const name of ['data-export.cjs','data-export-worker.cjs']){
  const source=path.join(repo,'runtime','data-export',name);
  const target=path.join(repo,'dist',name);
  if(!fs.existsSync(source))throw new Error(`Missing required data export runtime: ${source}`);
  fs.copyFileSync(source,target);
  fs.chmodSync(target,0o644);
}
