const fs = require('fs');
let c = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

const badStr = `
                     groupMap.get(key).occurrences.push({ arrayNumber: st.arrayNumber, stringNumber: st.stringNumber, bpcNumber: st.bpcNumber, enclosureLabel: \`Array \${st.arrayNumber} ES\${st.stringNumber}\`, sourcePath: "stringsCsv" });
                 });
             }
        });`;

c = c.replace(badStr, '');

fs.writeFileSync('src/server/siteOperations.ts', c);
console.log("Fixed brackets");
