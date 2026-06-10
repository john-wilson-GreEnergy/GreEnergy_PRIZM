import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const strReplacement = `
// Optional Helper for safely parsing numbers
function pN(val: any, def: number | null = null): number | null {
  if (val === undefined || val === null || val === "") return def;
  const n = Number(val);
  return isNaN(n) ? def : n;
}

// 5. GET /api/local/strings: Derived from tools/report/ems/strings.csv or fallback to blockviewer
app.get("/api/local/strings", (req, res) => {
  const rawStringsWrapper = getEmsCachedRawStrings();
  const blockWrapper = getEmsCachedBlock();
  const ipMapWrapper = getEmsStringIpMap();
  
  let rawData = [];
  let metaWrapper = rawStringsWrapper;
  if (rawStringsWrapper.data && rawStringsWrapper.data.length > 0) {
    rawData = rawStringsWrapper.data;
  } else {
    rawData = blockWrapper.data?.strings || [];
    metaWrapper = blockWrapper;
  }
  
  let ipMap: any[] = [];
  if (ipMapWrapper && Array.isArray(ipMapWrapper.data)) {
    ipMap = ipMapWrapper.data;
  }

  const normalizedRows = rawData.map((row: any) => {
    const arrayIndex = pN(row.arrayIndex || row.array, 1)!;
    const stringIndex = pN(row.stringIndex || row.string, 1)!;
    const stringKey = \`A\${arrayIndex}-S\${stringIndex}\`;
    
    // Look up ipMap
    const ipInfo = ipMap.find((ip: any) => ip.array === arrayIndex && ip.string === stringIndex);

    let connectionState = row.connectionState || row.contact || row.communicating;
    if (connectionState === true || connectionState === "true") connectionState = "Online";
    else if (connectionState === false || connectionState === "false") connectionState = "Offline";
    else if (!connectionState) connectionState = "Unknown";
    else connectionState = String(connectionState);

    const contactorsCloseExpected = Boolean(row.contact_close_expected ?? row.contactCloseExpected ?? (connectionState === "Online"));
    const positiveContactorClosed = Boolean(row.positive_contactor_closed ?? row.positiveContactorClosed ?? (connectionState === "Online"));
    const negativeContactorClosed = Boolean(row.negative_contactor_closed ?? row.negativeContactorClosed ?? (connectionState === "Online"));
    
    const contactorMismatch = (contactorsCloseExpected !== positiveContactorClosed) || (contactorsCloseExpected !== negativeContactorClosed);

    const maxT = pN(row.cellGroupTempMax || row.cellTempMax);
    const minT = pN(row.cellGroupTempMin || row.cellTempMin);
    const maxV = pN(row.cellGroupVoltageMax || row.cellVoltsMax || row.maxCellVoltage);
    const minV = pN(row.cellGroupVoltageMin || row.cellVoltsMin || row.minCellVoltage);

    return {
      arrayIndex,
      stringIndex,
      stringKey,
      timestamp: row.timestamp || metaWrapper.lastUpdated || new Date().toISOString(),
      datetime: row.datetime || "",
      connectionState,
      soc: pN(row.soc || row.powerSoc),
      kw: pN(row.kw || row.powerkW || row.measuredKw),
      kwh: pN(row.kwh || row.powerKwh),
      ah: pN(row.ah),
      calculatedVoltage: pN(row.voltageCalculated || row.voltageCalc),
      measuredVoltage: pN(row.voltageMeasured || row.voltageMeas),
      dcBusVoltage: pN(row.voltageDcBus || row.voltageBus),
      stringCurrent: pN(row.current || row.stringCurrent),
      ctCurrent1: pN(row.ctCurrent1),
      ctCurrent2: pN(row.ctCurrent2),
      contactorsCloseExpected,
      positiveContactorClosed,
      negativeContactorClosed,
      contactorMismatch,
      recloseCount: pN(row.recloseCount, 0),
      outRotation: Boolean(row.out_rotation ?? row.outRotation ?? (row.rotation === "fault" || row.outOfRotation)),
      maxCellTemp: maxT,
      minCellTemp: minT,
      avgCellTemp: pN(row.cellGroupTempAvg || row.avgCellTemp),
      tempDelta: (maxT !== null && minT !== null) ? Number((maxT - minT).toFixed(1)) : null,
      maxCellVoltage: maxV,
      minCellVoltage: minV,
      avgCellVoltage: pN(row.cellGroupVoltageAvg || row.avgCellVoltage),
      voltageDelta: (maxV !== null && minV !== null) ? Number((maxV - minV).toFixed(3)) : null,
      alarmCount: pN(row.alarmCount || row.alarms, 0),
      alarms: row.alarmsList || [],
      warnCount: pN(row.warningCount || row.warnings, 0),
      warns: row.warningsList || [],
      lastFanCommand: row.lastFanCommand || row.fanStatus || "Unknown",
      location: row.location || \`R\${arrayIndex}-Rack\${stringIndex}\`,
      ipAddress: row.ipAddress || ipInfo?.ip || "Unknown",
      entityToken: row.entityToken || ipInfo?.token || "N/A"
    };
  });

  res.json({
    source: metaWrapper.source,
    staleData: metaWrapper.staleData,
    lastUpdated: metaWrapper.lastUpdated,
    activeEmsBaseUrl: metaWrapper.activeEmsBaseUrl,
    activeProfileName: metaWrapper.activeProfileName,
    activeProfileId: metaWrapper.activeProfileId,
    stationCode: metaWrapper.stationCode,
    blockIndex: metaWrapper.blockIndex,
    lastError: metaWrapper.lastError,
    cacheProfileId: metaWrapper.cacheProfileId,
    cacheEmsBaseUrl: metaWrapper.cacheEmsBaseUrl,
    cacheCreatedAt: metaWrapper.cacheCreatedAt,
    cacheLastUpdatedAt: metaWrapper.cacheLastUpdatedAt,
    data: normalizedRows
  });
});
`;

let target = `// 5. GET /api/local/strings: Derived from tools/report/ems/strings.csv or fallback to blockviewer
app.get("/api/local/strings", (req, res) => {
  const rawStrings = getEmsCachedRawStrings();
  if (rawStrings.data && rawStrings.data.length > 0) {
    res.json(rawStrings);
  } else {
    // Fallback/derive from blockviewer
    const block = getEmsCachedBlock();
    res.json({
      source: block.source,
      staleData: block.staleData,
      lastUpdated: block.lastUpdated,
      activeEmsBaseUrl: block.activeEmsBaseUrl,
      activeProfileName: block.activeProfileName,
      activeProfileId: block.activeProfileId,
      stationCode: block.stationCode,
      blockIndex: block.blockIndex,
      lastError: block.lastError,
      cacheProfileId: block.cacheProfileId,
      cacheEmsBaseUrl: block.cacheEmsBaseUrl,
      cacheCreatedAt: block.cacheCreatedAt,
      cacheLastUpdatedAt: block.cacheLastUpdatedAt,
      data: block.data?.strings || []
    });
  }
});`;

content = content.replace(target, strReplacement);

fs.writeFileSync('server.ts', content);
console.log('patched /api/local/strings');
