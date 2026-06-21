const http = require('http');

http.get('http://localhost:3000/api/local/debug/strings/1/1/cell-telemetry-source-scan', (res) => {
  let data = '';
  console.log('STATUS: ' + res.statusCode);
  console.log('HEADERS: ' + JSON.stringify(res.headers));
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(data);
  });
});
