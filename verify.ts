const getSummary = async () => {
    const resSnap = await fetch("http://localhost:3000/api/local/site-data/snapshot");
    const snapJson = await resSnap.json();
    console.log("Snapshot Status:", resSnap.status);
    console.log("Snapshot Warming state:", snapJson.warming);
    
    const res = await fetch("http://localhost:3000/api/local/site-operations/summary?noCache=true");
    const json = await res.json();
    console.log(JSON.stringify({
      source: json.source,
      liveSucceeded: json.liveSucceeded,
      stale: json.stale,
      cacheUsed: json.cacheUsed,
      stationCode: json.stationCode,
      fleet: json.bessFleetSummary,
      buckets: json.stringSummary?.buckets,
      rollups: json.stringSummary?.rollups,
      arraySummarySource: json.debug?.arraySummarySource,
      normalizedStringRowCount: json.debug?.normalizedStringRowCount,
      arraySummaryCount: json.arraySummary?.length,
      firstArray: json.arraySummary?.[0],
      correctiveActionsCount: json.correctiveActions?.length,
      correctiveActionsSample: json.correctiveActions?.slice(0, 5),
      featherExcludedCS: json.debug?.featherCellTempExcludedCollectionSegments
    }, null, 2));
}

getSummary().catch(console.error);
