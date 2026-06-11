const fs = require('fs');
let content = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

const targetFeatherObj = `    // Feather Summary
    const featherTotal = state.featherDevices?.devices?.length || 0;
    let featherLostComms = 0;
    let featherFssInvalid = 0;
    let featherDoorsInvalid = 0;
    if (state.featherDevices?.devices) {
        state.featherDevices.devices.forEach((d: any) => {
             if (d.devicesWithLostComms?.length > 0 || d.warnInfo?.some((w:string) => w.includes("Lost Comms"))) featherLostComms++;
             if (d.fssValid === false) featherFssInvalid++;
             if (d.doorsValid === false) featherDoorsInvalid++;
        });
    }

    // Source health
    const buildSourceHealth = () => {
        const sources = [];
        if (state.stringsDashboard?.sourceHealth) {
           Object.entries(state.stringsDashboard.sourceHealth).forEach(([k, v]: any) => {
               sources.push({ name: k, ok: v.ok, error: v.error, type: "Strings" });
           });
        }
        if (state.overviewDiscovery?.sourceHealth) {
           Object.entries(state.overviewDiscovery.sourceHealth).forEach(([k, v]: any) => {
               sources.push({ name: k, ok: v.ok, error: v.error, type: "Overview" });
           });
        }
        return sources;
    };
    const combinedSources = buildSourceHealth();`;

const replFeather = `    // Feather Summary
    const featherTotal = sum?.featherSummary?.totalDevices || 0;
    let featherLostComms = sum?.featherSummary?.lostCommsCount || 0;
    let featherFssInvalid = sum?.featherSummary?.fssInvalidCount || 0;
    let featherDoorsInvalid = sum?.featherSummary?.doorsInvalidCount || 0;
`;

if (content.includes("    // Feather Summary")) {
    content = content.replace(targetFeatherObj, replFeather);
}

content = content.replace(/{state\.featherDevices === null \? \(/g, "{!sum?.featherSummary ? (");

// fix clearable
content = content.replace(/state\.safetyFaults\.eligible/g, "clearableFaults");
content = content.replace(/state\.safetyFaults === null/g, "clearableFaults.length === 0");

fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', content);
console.log('Successfully updated component rendering logic for feather and safety');
