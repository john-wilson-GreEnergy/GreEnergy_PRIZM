import fs from 'fs';

let content = fs.readFileSync('src/components/FeatherDashboard.tsx', 'utf8');

content = content.replace(/current\.responseDurationMs/g, "(current.pingMs || 0)");

// Add sortedDevices 
const filterStr = `    if (discoverySource === "manual" && d.discoveryMethod !== "manual") return false;

    return true;
  });`;

const newFilterStr = `    if (discoverySource === "manual" && d.discoveryMethod !== "manual") return false;

    return true;
  });

  const sortedDevices = sortByIPv4(filteredDevices, d => d.ip, ipSortDesc ? "desc" : "asc");`;

content = content.replace(filterStr, newFilterStr);

content = content.replace(/filteredDevices.map\(\(d, index\) =>/g, "sortedDevices.map((d, index) =>");

// Replace target table column header to allow toggling IP sorting
const oldTh = `<th className="p-3">Device IP</th>`;
const newTh = `<th className="p-3 cursor-pointer hover:text-prizm-primary select-none flex gap-2 items-center" onClick={() => setIpSortDesc(!ipSortDesc)}>Device IP {ipSortDesc ? "▼" : "▲"}</th>`;
content = content.replace(oldTh, newTh);

fs.writeFileSync('src/components/FeatherDashboard.tsx', content);

console.log('Replacements 2 done');
