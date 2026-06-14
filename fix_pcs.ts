import fs from 'fs';

let pcsFile = fs.readFileSync('src/components/PcsDashboard.tsx', 'utf8');

pcsFile = pcsFile.replace(/px-3 py-2/g, 'px-1.5 py-0.5');
pcsFile = pcsFile.replace(/px-2 py-2/g, 'px-1 py-0.5');
pcsFile = pcsFile.replace(/px-3 py-1\.5/g, 'px-1.5 py-0.5');
pcsFile = pcsFile.replace(/px-2 py-1\.5/g, 'px-1.5 py-0.5');
pcsFile = pcsFile.replace(/<table className="w-full text-left font-mono border-collapse" style={{fontSize: "10px"}}>/g, '<table className="w-full text-left text-[9px] font-mono whitespace-nowrap border-collapse">');

pcsFile = pcsFile.replace(
  /<div className="flex flex-col overflow-hidden font-sans transition-all bg-transparent text-prizm-text h-full">/g,
  '<div className="flex flex-col font-sans transition-all bg-transparent text-prizm-text h-full">'
);

pcsFile = pcsFile.replace(
  /<div className="(bg-prizm-surface border border-prizm-border rounded overflow-hidden)">/g,
  '<div className="bg-prizm-surface border-x border-b border-prizm-border rounded-b-lg relative overflow-x-auto overflow-y-visible pb-12">'
);

// sticky headers
let theadStart = pcsFile.indexOf('<thead className="bg-prizm-surface-strong shadow-sm');
if (theadStart !== -1) {
    let theadPart = pcsFile.substring(theadStart, pcsFile.indexOf('</thead>', theadStart) + 8);
    // Replace top-0 with top-[102px] but wait, in PCS dashboard, it might have top-0. Let's make sure class has sticky.
    let newTheadPart = theadPart.replace(/top-0/g, 'top-[102px]');
    
    // Ensure sticky class is present in thead if it wasn't
    if (!newTheadPart.includes('sticky')) {
        newTheadPart = newTheadPart.replace('<thead className="', '<thead className="sticky top-[102px] z-[70] ');
    }
    pcsFile = pcsFile.replace(theadPart, newTheadPart);
}

fs.writeFileSync('src/components/PcsDashboard.tsx', pcsFile);
console.log("PcsDashboard updated");
