import fs from 'fs';
let content = fs.readFileSync('src/server/safetyFaultClear.ts', 'utf8');

// Update imports
if (!content.includes('buildEmsBaseUrl')) {
   content = content.replace('import { ProfileStore } from "./profiles/profileStore";', 'import { ProfileStore } from "./profiles/profileStore";\nimport { buildEmsBaseUrl } from "./profiles/profileManager";');
}

// Replace url generation and fetch calls
content = content.replace(/const url = profile\.emsBaseUrl\.replace\(\/\\\/\\$\/, ''\) \+ "\/tools\/monitor\/ems\/blockviewer\/data";/g, 'const url = buildEmsBaseUrl(profile) + "/tools/monitor/ems/blockviewer/data";');

content = content.replace(/const topoRes = await fetch\(url, \{ headers: \{ "Authorization": \`Bearer \$\{profile.emsAuthToken || ''\}\` \}\}\);/g, 'const topoRes = await fetch(url);');
content = content.replace(/const postTopoRes = await fetch\(url, \{ headers: \{ "Authorization": \`Bearer \$\{profile.emsAuthToken || ''\}\` \}\}\);/g, 'const postTopoRes = await fetch(url);');

content = content.replace(/emsBaseUrl: profile.emsBaseUrl,/g, 'emsBaseUrl: buildEmsBaseUrl(profile),');

content = content.replace(/const postUrl = profile\.emsBaseUrl\.replace\(\/\\\/\\$\/, ''\) \+ "\/tools\/controls\/ems\/command";/g, 'const postUrl = buildEmsBaseUrl(profile) + "/tools/controls/ems/command";');

const fetchBodyOld = `        const cmdRes = await fetch(postUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/octet-stream",
                "Authorization": \`Bearer \${profile.emsAuthToken || ''}\`
            },
            body: buffer
        });`;

const fetchBodyNew = `        const cmdRes = await fetch(postUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/octet-stream"
            },
            body: Buffer.from(buffer) as any
        });`;

content = content.replace(fetchBodyOld, fetchBodyNew);

fs.writeFileSync('src/server/safetyFaultClear.ts', content);
