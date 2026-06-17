const fs = require('fs');

function findFetches() {
  const fetchRegex = /fetch(?:JsonWithTimeout)?\(\s*[`'"](\/[^`'"]+)[`'"]/g;
  let matches = [];
  
  const files = require('child_process').execSync('find src -type f -name "*.ts*"').toString().split('\n').filter(x => x);
  
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = fetchRegex.exec(code)) !== null) {
      matches.push(m[1]);
    }
  }
  
  // Deduplicate
  matches = [...new Set(matches)];
  console.log(matches.join('\n'));
}

findFetches();
