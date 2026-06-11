const fs = require('fs');

let c = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');
c = c.replace(/    const siteState = sum\?\.site\?\.connectionState === "disconnected" \? "OFFLINE" : "LIVE";/g, '    let siteState: string = sum?.site?.connectionState === "disconnected" ? "OFFLINE" : "LIVE";');
c = c.replace(/    const siteState: string = sum\?\.site\?\.connectionState === "disconnected" \? "OFFLINE" : "LIVE";/g, '    let siteState: string = sum?.site?.connectionState === "disconnected" ? "OFFLINE" : "LIVE";');
fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', c);

let pc = fs.readFileSync('src/server/cache/prizmCache.ts', 'utf8');
pc = pc.replace("if (options.rawExt === '.json' && typeof data !== 'string') outData = JSON.stringify(data, null, 2);", "if (options.rawExt === '.json' && typeof data !== 'string') (outData as any) = JSON.stringify(data, null, 2);");
fs.writeFileSync('src/server/cache/prizmCache.ts', pc);
