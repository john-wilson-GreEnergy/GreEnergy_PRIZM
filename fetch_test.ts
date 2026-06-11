import fetch from "node-fetch"; // or just global fetch

async function main() {
    const rawUrl = 'http://localhost:3000/api/local/strings/dashboard/1/1/detail/raw';
    let r = await fetch(rawUrl);
    let d = await r.json();
    console.log("Raw Output: ", JSON.stringify({
        ok: d.ok,
        topLevelKeys: d.topLevelKeys,
        modelKeys: d.modelKeys,
        balanceRelatedPaths: d.balanceRelatedPaths,
        notificationRelatedPaths: d.notificationRelatedPaths
    }, null, 2));

    const detUrl = 'http://localhost:3000/api/local/strings/dashboard/1/1/detail?refresh=true';
    r = await fetch(detUrl);
    d = await r.json();
    console.log("Detail Output: ", JSON.stringify({
        sourceViewerUsed: d.sourceViewerUsed,
        bpcCount: d.bpcs ? d.bpcs.length : 0,
        firstBpcCellGroups: d.bpcs && d.bpcs[0] ? d.bpcs[0].cellGroups.length : 0,
        balancingCount: d.balancingDetails ? d.balancingDetails.length : 0,
        balancingDetails: d.balancingDetails ? d.balancingDetails.slice(0, 14) : [],
        notificationCount: d.notifications ? d.notifications.length : 0,
        notifications: d.notifications,
        balancingDebugKeys: d.balancingDebugKeys,
        notificationDebugKeys: d.notificationDebugKeys
    }, null, 2));
}

main().catch(console.error);
