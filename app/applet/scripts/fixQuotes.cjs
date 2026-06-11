const fs = require('fs');
let code = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

code = code.replace('import { pollEmsTurtle } from ./emsTurtleClient;', 'import { pollEmsTurtle } from "./emsTurtleClient";');
code = code.replace('router.get(/summary, async (req, res) => {', 'router.get("/summary", async (req, res) => {');
code = code.replace(/cacheState = \(siteOpsInFlight \|\| shouldRefresh\) \? \\STALE\\ : \\LIVE\\;/, 'cacheState = (siteOpsInFlight || shouldRefresh) ? "STALE" : "LIVE";');
code = code.replace(/if \(responseData\) cacheState = \\LIVE\\;/, 'if (responseData) cacheState = "LIVE";');
code = code.replace(/cacheState = \\UNAVAILABLE\\;/, 'cacheState = "UNAVAILABLE";');
code = code.replace(/if \(cachedEntry\) cacheState = \\CACHED\\;/, 'if (cachedEntry) cacheState = "CACHED";');
code = code.replace(/if \(forceRefresh \|\| shouldRefresh\) cacheState = \\REFRESHING\\;/, 'if (forceRefresh || shouldRefresh) cacheState = "REFRESHING";');

fs.writeFileSync('src/server/siteOperations.ts', code);
console.log('Fixed quotes');
