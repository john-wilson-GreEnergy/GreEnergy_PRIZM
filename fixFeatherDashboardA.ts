import fs from 'fs';

let content = fs.readFileSync('src/components/FeatherDashboard.tsx', 'utf8');

// replace imports
content = content.replace(
  `import { FeatherNormalizedStatus, ManualScanConfig } from "../server/feather/featherTypes";`,
  `import { ManualScanConfig } from "../server/feather/featherTypes";
import { FeatherHvacDevice } from "../server/feather/deviceEnrichment";
import { sortByIPv4 } from "../lib/ipUtils";`
);

// replace type Usage
content = content.replace(/FeatherNormalizedStatus/g, "FeatherHvacDevice");

// Add ipSort state
content = content.replace(
    'const [issueFilter, setIssueFilter] = useState<"all" | "warnings" | "alarms" | "any">("all");',
    'const [issueFilter, setIssueFilter] = useState<"all" | "warnings" | "alarms" | "any">("all");\n  const [ipSortDesc, setIpSortDesc] = useState<boolean>(false);'
);

// map properties
content = content.replace(/d\.deviceIp/g, "d.ip");
content = content.replace(/d\.sourceDiscoveryMethod/g, "d.discoveryMethod");
content = content.replace(/d\.entityName/g, "d.entityDescription");
content = content.replace(/d\.responseDurationMs/g, "(d.pingMs || 0)");
content = content.replace(/d\.spaceTemperature/g, "d.temperatureSupplyC");

content = content.replace(/d.lastSuccessAt/g, "d.lastSuccessUtc");
content = content.replace(/d.lastUpdatedAt/g, "d.lastCheckedUtc");

content = content.replace(/filteredDevices.length > 0 && \(/g, "sortedDevices.length > 0 && \(");
content = content.replace(/filteredDevices.map\(\(d, index\) =>/g, "sortedDevices.map((d, index) =>");

fs.writeFileSync('src/components/FeatherDashboard.tsx', content);

console.log('Replacements done');
