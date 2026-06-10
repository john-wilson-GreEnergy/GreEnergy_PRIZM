import http from 'http';

http.get('http://127.0.0.1:3000', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('HTML STATUS:', res.statusCode, '\nBODY LENGTH:', data.length));
});

http.get('http://127.0.0.1:3000/src/index.css', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('CSS STATUS:', res.statusCode, '\nBODY LENGTH:', data.length));
});
