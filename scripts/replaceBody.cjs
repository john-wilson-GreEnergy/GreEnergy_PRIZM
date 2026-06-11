const fs = require('fs');

let content = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

// I will just replace the *entire* render body from "// Determine Global Site Status" to "const navigate = (tab: string) => {"
const startIdx = content.indexOf('    // Determine Global Site Status');
const endIdx = content.indexOf('    const navigate = (tab: string) => {');

if (startIdx === -1 || endIdx === -1) {
    console.error("COULD NOT FIND START OR END");
    process.exit(1);
}

const replData = `    const sum = state.siteSummary;
    const siteState = sum?.site?.connectionState === "disconnected" ? "OFFLINE" : "LIVE";
    
    const stationCode = sum?.site?.stationCode || "UNKNOWN";
    const emsBaseUrl = sum?.site?.emsBaseUrl || "--";
    const blockIndex = sum?.site?.blockIndex || "--";
    const profileId = sum?.site?.profileId || "--";

    const emsAppsData = sum?.emsApps || [];
    const pcsData = sum?.pcsSummary || [];
    const htsData = sum?.humidityTemperatureSensors || [];
    const featherSummary = sum?.featherSummary || {};
    
    const arraySummaryData = sum?.arraySummary || [];
    const stringBuckets = sum?.stringSummary?.buckets || { online: 0, nearline: 0, offline: 0, notCommunicating: 0 };
    const onlineStats = { count: stringBuckets.online };
    const nearlineStats = { count: stringBuckets.nearline };
    const offlineStats = { count: stringBuckets.offline };
    const notCommStats = { count: stringBuckets.notCommunicating };
    const rollups = { totalStrings: (stringBuckets.online + stringBuckets.nearline + stringBuckets.offline + stringBuckets.notCommunicating) || 0 };

    const activeIssues = sum?.activeIssueGroups || [];
    activeIssues.sort((a: any, b: any) => {
        const severityRank: Record<string, number> = { "ALARM": 1, "WARNING": 2, "STALE": 3, "INFO": 4 };
        return (severityRank[a.severity] || 5) - (severityRank[b.severity] || 5);
    });

    const clearableFaults = sum?.safetySummary?.clearableFaults || [];
    const safetyEligible = sum?.safetySummary?.clearableCount || 0;
    const safetyNotEligible = 0; // Not eligible faults no longer primarily tracked here

    const combinedSources = sum?.sourceHealth || [];
    const featherTotal = sum?.featherSummary?.totalDevices || 0;
    const featherLostComms = sum?.featherSummary?.lostCommsCount || 0;
    const featherFssInvalid = sum?.featherSummary?.fssInvalidCount || 0;
    const featherDoorsInvalid = sum?.featherSummary?.doorsInvalidCount || 0;

`;

content = content.substring(0, startIdx) + replData + content.substring(endIdx);

fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', content);
console.log("Successfully replaced huge chunk of UI logic");
