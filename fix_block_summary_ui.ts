import fs from 'fs';
let file = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

file = file.replace(
/const sum = state\.siteSummary;\n\s*let siteState = "UNAVAILABLE";\n\s*if \(sum\?\.site\?\.connectionState === "disconnected"\) \{\n\s*siteState = "OFFLINE";\n\s*\} else if \(sum\?\.site\?\.source === "partial" \|\| sum\?\.cacheMeta\?\.cacheState === "STALE"\) \{\n\s*siteState = "PARTIAL";\n\s*\} else if \(sum\?\.site\?\.connectionState \|\| sum\?\.site\?\.source \|\| sum\?\.cacheMeta\?\.cacheState\) \{\n\s*siteState = "LIVE";\n\s*\}/,
`const sum = state.siteSummary;
    let siteState = "UNAVAILABLE";
    
    if (sum) {
       // Check if critical source health failed
       const criticalFailed = sum.sourceHealth ? sum.sourceHealth.some((s: any) => s.error && s.error !== "NONE") : false;
       
       if (sum.site?.connectionState === "disconnected" && !sum.cacheUsed) {
           siteState = "OFFLINE";
       } else if ((sum.source === "live-ems" || sum.liveSucceeded === true) && !sum.stale && (!sum.cacheUsed || sum.liveSucceeded)) {
           if (sum.source === "partial") {
               siteState = "PARTIAL";
           } else if (criticalFailed) {
               siteState = "PARTIAL";
           } else {
               siteState = "LIVE";
           }
       } else if (sum.liveAttempted && !sum.liveSucceeded) {
           if (sum.cacheUsed) siteState = "CACHED";
           else siteState = "PARTIAL";
       } else if (sum.stale) {
           siteState = "PARTIAL";
       } else if (sum.cacheUsed) {
           siteState = "CACHED";
       } else if (sum.source === "partial" || sum.site?.source === "partial" || sum.cacheMeta?.cacheState === "STALE") {
           siteState = "PARTIAL";
       } else if (sum.site?.connectionState || sum.site?.source || sum.cacheMeta?.cacheState) {
           siteState = "LIVE";
       }
    }`);

file = file.replace(
/siteState === "LIVE"\s*\?\s*"bg-emerald-500\/10 border-emerald-500\/30"\s*:\s*siteState === "PARTIAL"\s*\?\s*"bg-prizm-warning\/10 border-prizm-warning\/30"\s*:\s*"bg-prizm-danger\/10 border-prizm-danger\/30"/g,
`siteState === "LIVE" ? "bg-emerald-500/10 border-emerald-500/30" : siteState === "PARTIAL" ? "bg-prizm-warning/10 border-prizm-warning/30" : siteState === "CACHED" ? "bg-amber-500/10 border-amber-500/30" : "bg-prizm-danger/10 border-prizm-danger/30"`
);

file = file.replace(
/siteState === "LIVE"\s*\?\s*"bg-emerald-500\/20 text-emerald-500"\s*:\s*siteState === "PARTIAL"\s*\?\s*"bg-prizm-warning\/20 text-prizm-warning"\s*:\s*"bg-prizm-danger\/20 text-prizm-danger"/g,
`siteState === "LIVE" ? "bg-emerald-500/20 text-emerald-500" : siteState === "PARTIAL" ? "bg-prizm-warning/20 text-prizm-warning" : siteState === "CACHED" ? "bg-amber-500/20 text-amber-500" : "bg-prizm-danger/20 text-prizm-danger"`
);


fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', file);
console.log('Fixed block summary UI state logic');
