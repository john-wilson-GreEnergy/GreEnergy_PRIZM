import fs from 'fs';

let content = fs.readFileSync('src/components/FeatherDashboard.tsx', 'utf8');

const oldSetCache = `        setCacheDetails({
          createdAt: data.createdAt,
          lastUpdatedAt: data.lastUpdatedAt,
          activeProfileId: data.activeProfileId,
          activeProfileName: data.activeProfileName,
          activeEmsBaseUrl: data.activeEmsBaseUrl,
          isStale: data.isStale
        });`;

const newSetCache = `        setCacheDetails({
          createdAt: data.createdAt || data.generatedAt,
          lastUpdatedAt: data.lastUpdatedAt || data.generatedAt,
          activeProfileId: data.activeProfileId || data.profileId,
          activeProfileName: data.activeProfileName || "Active Profile",
          activeEmsBaseUrl: data.activeEmsBaseUrl || data.emsBaseUrl,
          isStale: !!data.isStale
        });`;

content = content.replace(oldSetCache, newSetCache);

fs.writeFileSync('src/components/FeatherDashboard.tsx', content);

console.log('Fixed cache details payload mapping');
