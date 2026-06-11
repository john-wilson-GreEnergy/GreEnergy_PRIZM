const fs = require('fs');
let code = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

code = code.replace(
    \`    if (state.loading && !state.stringsDashboard && !state.overviewDiscovery) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
                <Activity size={48} className="animate-spin text-prizm-primary mb-4" />
                <h2 className="text-xl font-bold uppercase tracking-widest text-prizm-text mb-2">LOADING SITE OPERATIONS...</h2>
            </div>
        );
    }\`,
    ''
);

code = code.replace(
    '<span className={\`px-2 py-0.5 rounded font-bold \${siteState === "LIVE" ? "bg-emerald-500/20 text-emerald-500" : siteState === "PARTIAL" ? "bg-prizm-warning/20 text-prizm-warning" : "bg-prizm-danger/20 text-prizm-danger"}\`}>\\n                         {siteState}\\n                      </span>',
    \`{sum?.cacheMeta?.cacheState && sum.cacheMeta.cacheState !== "LIVE" && (
                         <span className="px-2 py-0.5 rounded font-bold bg-amber-500/20 text-amber-500 mr-2">
                             {sum.cacheMeta.cacheState}
                         </span>
                      )}
                      <span className={\\\`px-2 py-0.5 rounded font-bold \\\${siteState === "LIVE" ? "bg-emerald-500/20 text-emerald-500" : siteState === "PARTIAL" ? "bg-prizm-warning/20 text-prizm-warning" : "bg-prizm-danger/20 text-prizm-danger"}\\\`}>\n                         {siteState}\n                      </span>\`
);

fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', code);
console.log('Fixed dash');
