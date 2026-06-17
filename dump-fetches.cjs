const fs = require('fs');
const files = require('child_process').execSync('find src -type f -name "*.ts*"').toString().split('\n').filter(x => x);

for(const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if(content.includes('fetch(') || content.includes('fetchJsonWithTimeout(')) {
    const lines = content.split('\n');
    for(let i=0; i<lines.length; i++) {
        if(lines[i].includes('fetch(') || lines[i].includes('fetchJsonWithTimeout(')) {
            console.log(file + ':' + (i+1) + ': ' + lines[i].trim());
        }
    }
  }
}
