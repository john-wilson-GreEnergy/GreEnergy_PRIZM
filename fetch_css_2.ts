import http from 'http';
import fs from 'fs';

http.get('http://127.0.0.1:3000/src/index.css', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => fs.writeFileSync('test.css', data));
});
