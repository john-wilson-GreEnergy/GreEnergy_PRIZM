import fs from 'fs';

let stringFile = fs.readFileSync('src/components/StringDashboard.tsx', 'utf8');

// 1. Condense layout: px-3 py-2 -> px-1.5 py-0.5, px-2 py-2 -> px-1 py-0.5
stringFile = stringFile.replace(/px-3 py-2/g, 'px-1.5 py-0.5');
stringFile = stringFile.replace(/px-2 py-2/g, 'px-1 py-0.5');
stringFile = stringFile.replace(/px-3 py-1\.5/g, 'px-1.5 py-0.5');
stringFile = stringFile.replace(/px-2 py-1\.5/g, 'px-1.5 py-0.5');

// For denser fonts on table headers
stringFile = stringFile.replace(/<table className="w-full text-left text-\[10px\]/g, '<table className="w-full text-left text-[9px]');

// 2. Remove the "closed window" constraints
stringFile = stringFile.replace(
  /<div className="flex flex-col overflow-hidden font-sans transition-all bg-transparent pb-20" style={{ height: 'calc\(100vh - 150px\)' }}>/,
  '<div className="flex flex-col font-sans transition-all bg-transparent pb-24">'
);

// Table wrapper: remove overflow-y-auto no-scrollbar relative min-h-0
stringFile = stringFile.replace(
  /<div className="(flex-1 bg-prizm-surface border-x border-b border-prizm-border rounded-b-lg) overflow-y-auto no-scrollbar relative min-h-0"/,
  '<div className="$1 relative overflow-x-auto overflow-y-visible pb-12"'
);

// 3. Make all top-0 in the table sticky headers become top-[102px]
let theadStart = stringFile.indexOf('<thead className="sticky top-0 z-[70]');
if (theadStart !== -1) {
    let theadPart = stringFile.substring(theadStart, stringFile.indexOf('</thead>', theadStart) + 8);
    let newTheadPart = theadPart.replace(/top-0/g, 'top-[102px]'); // Adjust offset for App header+tabs
    stringFile = stringFile.replace(theadPart, newTheadPart);
}

// 4. Reduce whitespace, etc. maybe change border sizes or roundings? The user wants 'emulate data concentration'.
// Using text-[9px] in the table helps. We already replaced px/pys.

fs.writeFileSync('src/components/StringDashboard.tsx', stringFile);
console.log("StringDashboard headers and layout condensed.");
