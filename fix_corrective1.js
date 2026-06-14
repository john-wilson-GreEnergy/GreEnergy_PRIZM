const fs = require('fs');
let file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

file = file.replace(/const ignoredRegex = \/oor\|out of rotation\|outrotation\|contactor open\|contactors open\/i;\n\s*\/\/ Process activeIssueGroups\n\s*activeIssueGroups\.forEach\(\(g: any\) => \{\n\s*if \(ignoredRegex\.test\(g\.faultName\) \|\| ignoredRegex\.test\(String\(g\.faultId\)\)\) return;\n\s*if \(String\(g\.faultId\) === "2534" || String\(g\.faultId\) === "2561"\) return;/m,
`const ignoredRegex = /oor|out of rotation|outrotation|contactor open|contactors open/i;

        // Process activeIssueGroups
        activeIssueGroups.forEach((g: any) => {
            const faultName = g.faultName || g.displayText || g.message || "";
            const faultId = g.faultId || g.code || "";
            if (ignoredRegex.test(faultName) || ignoredRegex.test(String(faultId))) return;
            if (String(faultId) === "2534" || String(faultId) === "2561") return;`);

file = file.replace(/else if \(\\\/high cell temp\\\|thermal\\\/i\.test\(g\.faultName\)\)/,
`else if (/high cell temp|thermal/i.test(faultName))`);
file = file.replace(/else if \(\\\/cell voltage\\\|imbalance\\\/i\.test\(g\.faultName\)\)/,
`else if (/cell voltage|imbalance/i.test(faultName))`);
file = file.replace(/else if \(g\.source === "BPC" || \\\/string\\\/i\.test\(g\.faultName\)\)/,
`else if (g.source === "BPC" || /string/i.test(faultName))`);

file = file.replace(/fault: g\.faultName,/, `fault: faultName,`);

file = file.replace(/else if \(/g, 'else if ('); // just to fix the previous file.replace errors if any... Wait, I should just use multi_edit_file or standard string replace.

fs.writeFileSync('src/server/siteOperations.ts', file);
