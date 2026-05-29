import fs from 'fs';
import path from 'path';

const pathsToClean = ['dist', 'server.js'];

pathsToClean.forEach(p => {
  const fullPath = path.resolve(p);
  if (fs.existsSync(fullPath)) {
    console.log(`Cleaning ${p}...`);
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } catch (err) {
      console.error(`Failed to clean ${p}: ${err.message}`);
    }
  }
});
