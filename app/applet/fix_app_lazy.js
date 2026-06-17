import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace('import React, { useState, useEffect }', 'import React, { useState, useEffect, Suspense, useTransition, useRef }');

const lazyReplace = [
  'SiteOperationsDashboard',
  'StringDashboard',
  'SiteDistributionDashboard',
  'PcsDashboard',
  'Reporting',
  'FeatherDashboard',
  'HvacSimulationDashboard',
  'LineupLightbarControl',
  'SiteConfigurationDashboard',
  'SafetyAdvancedDashboard'
];

for (const name of lazyReplace) {
  content = content.replace(
    new RegExp(`import ${name} from "./components/${name}";`, 'g'),
    `const ${name} = React.lazy(() => import("./components/${name}"));`
  );
}

// Ensure Suspense and DashboardLoadingSkeleton is imported
if (!content.includes('DashboardLoadingSkeleton')) {
  content = content.replace('import { form', 'import DashboardLoadingSkeleton from "./components/common/DashboardLoadingSkeleton";\nimport { form');
}

fs.writeFileSync('src/App.tsx', content);
