import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const detailRoute = `
// Optional Helper for safely parsing numbers
// (Ensure we don't declare pN again if it already exists, let's just make it local)
app.get("/api/local/strings/:arrayIndex/:stringIndex/detail", (req, res) => {
  function getNum(val: any, def: number | null = null): number | null {
    if (val === undefined || val === null || val === "") return def;
    const n = Number(val);
    return isNaN(n) ? def : n;
  }

  const arrayIndex = getNum(req.params.arrayIndex);
  const stringIndex = getNum(req.params.stringIndex);

  const rawStringsWrapper = getEmsCachedRawStrings();
  const blockWrapper = getEmsCachedBlock();
  const ipMapWrapper = getEmsStringIpMap();
  const lastCallWrapper = getEmsCachedLastCall();

  let metaWrapper = rawStringsWrapper;

  // 1. Find summary row
  let rawData: any[] = [];
  if (rawStringsWrapper.data && rawStringsWrapper.data.length > 0) {
    rawData = rawStringsWrapper.data;
  } else {
    rawData = blockWrapper.data?.strings || [];
    if (rawData.length > 0) {
      metaWrapper = blockWrapper;
    }
  }

  // Find exact string
  const stringSummaryMatches = rawData.filter((row: any) => 
     getNum(row.arrayIndex || row.array) === arrayIndex &&
     getNum(row.stringIndex || row.string) === stringIndex
  );
  let summary = stringSummaryMatches.length > 0 ? stringSummaryMatches[0] : null;

  // Enhance summary like the /api/local/strings route
  if (summary) {
    let ipMap: any[] = [];
    if (ipMapWrapper && Array.isArray(ipMapWrapper.data)) {
      ipMap = ipMapWrapper.data;
    }
    const ipInfo = ipMap.find((ip: any) => ip.array === arrayIndex && ip.string === stringIndex);

    let connectionState = summary.connectionState || summary.contact || summary.communicating;
    if (connectionState === true || connectionState === "true") connectionState = "Online";
    else if (connectionState === false || connectionState === "false") connectionState = "Offline";
    else if (!connectionState) connectionState = "Unknown";
    else connectionState = String(connectionState);

    const contactorsCloseExpected = Boolean(summary.contact_close_expected ?? summary.contactCloseExpected ?? (connectionState === "Online"));
    const positiveContactorClosed = Boolean(summary.positive_contactor_closed ?? summary.positiveContactorClosed ?? (connectionState === "Online"));
    const negativeContactorClosed = Boolean(summary.negative_contactor_closed ?? summary.negativeContactorClosed ?? (connectionState === "Online"));
    
    const contactorMismatch = (contactorsCloseExpected !== positiveContactorClosed) || (contactorsCloseExpected !== negativeContactorClosed);

    const maxT = getNum(summary.cellGroupTempMax || summary.cellTempMax);
    const minT = getNum(summary.cellGroupTempMin || summary.cellTempMin);
    const maxV = getNum(summary.cellGroupVoltageMax || summary.cellVoltsMax || summary.maxCellVoltage);
    const minV = getNum(summary.cellGroupVoltageMin || summary.cellVoltsMin || summary.minCellVoltage);

    summary = {
      arrayIndex,
      stringIndex,
      stringKey: \`A\${arrayIndex}-S\${stringIndex}\`,
      timestamp: summary.timestamp || metaWrapper.lastUpdated || new Date().toISOString(),
      datetime: summary.datetime || "",
      connectionState,
      soc: getNum(summary.soc || summary.powerSoc),
      kw: getNum(summary.kw || summary.powerkW || summary.measuredKw),
      kwh: getNum(summary.kwh || summary.powerKwh),
      ah: getNum(summary.ah),
      calculatedVoltage: getNum(summary.voltageCalculated || summary.voltageCalc),
      measuredVoltage: getNum(summary.voltageMeasured || summary.voltageMeas),
      dcBusVoltage: getNum(summary.voltageDcBus || summary.voltageBus),
      stringCurrent: getNum(summary.current || summary.stringCurrent),
      ctCurrent1: getNum(summary.ctCurrent1),
      ctCurrent2: getNum(summary.ctCurrent2),
      contactorsCloseExpected,
      positiveContactorClosed,
      negativeContactorClosed,
      contactorMismatch,
      recloseCount: getNum(summary.recloseCount, 0),
      outRotation: Boolean(summary.out_rotation ?? summary.outRotation ?? (summary.rotation === "fault" || summary.outOfRotation)),
      maxCellTemp: maxT,
      minCellTemp: minT,
      avgCellTemp: getNum(summary.cellGroupTempAvg || summary.avgCellTemp),
      tempDelta: (maxT !== null && minT !== null) ? Number((maxT - minT).toFixed(1)) : null,
      maxCellVoltage: maxV,
      minCellVoltage: minV,
      avgCellVoltage: getNum(summary.cellGroupVoltageAvg || summary.avgCellVoltage),
      voltageDelta: (maxV !== null && minV !== null) ? Number((maxV - minV).toFixed(3)) : null,
      alarmCount: getNum(summary.alarmCount || summary.alarms, 0),
      alarms: summary.alarmsList || [],
      warnCount: getNum(summary.warningCount || summary.warnings, 0),
      warns: summary.warningsList || [],
      lastFanCommand: summary.lastFanCommand || summary.fanStatus || "Unknown",
      location: summary.location || \`R\${arrayIndex}-Rack\${stringIndex}\`,
      ipAddress: summary.ipAddress || ipInfo?.ip || "Unknown",
      entityToken: summary.entityToken || ipInfo?.token || "N/A"
    };
  }

  // 2. Explore deeper data from blockviewer or lastCall
  // Because we don't know the precise shape of lastCall or blockviewer trees for Turtle EMS,
  // we will try some intuitive paths: block.data.arrays[arrayIndex].strings[stringIndex] etc.
  let stringBlockDetail: any = null;
  if (blockWrapper.data && Array.isArray(blockWrapper.data)) {
    // If it's an array of strings directly
    const possibleStr = blockWrapper.data.find((s: any) => getNum(s.array) === arrayIndex && getNum(s.string) === stringIndex);
    if (possibleStr) stringBlockDetail = possibleStr;
  } else if (blockWrapper.data && blockWrapper.data.arrays) {
    const arr = blockWrapper.data.arrays.find((a: any) => getNum(a.index) === arrayIndex || getNum(a.arrayIndex) === arrayIndex);
    if (arr && arr.strings) {
      stringBlockDetail = arr.strings.find((s: any) => getNum(s.index) === stringIndex || getNum(s.stringIndex) === stringIndex);
    }
  }

  let stringLastCallDetail: any = null;
  if (lastCallWrapper.data && Array.isArray(lastCallWrapper.data.strings)) {
     stringLastCallDetail = lastCallWrapper.data.strings.find((s: any) => getNum(s.array) === arrayIndex && getNum(s.string) === stringIndex);
  }

  // 3. Normalization for UI Matrices
  // Merge detail from block or lastCall
  const detailSource = stringLastCallDetail || stringBlockDetail || {};

  // Extract cellVoltageMatrix and cellTemperatureMatrix
  // They might be arrays of arrays: [[v1, v2..], [v1, v2..]] or flattened arrays, or objects
  let voltageMatrix: any[] = [];
  let temperatureMatrix: any[] = [];
  let notificationMatrix: any[] = [];
  let balancingDetails: any[] = [];
  let notifications: any[] = [];
  let eventLogs: any[] = [];

  // Very defensive parsing for voltage
  if (detailSource.cellVoltages) {
      // Assuming arrays of packs -> arrays of cells
      if (Array.isArray(detailSource.cellVoltages)) {
          voltageMatrix = detailSource.cellVoltages;
      }
  } else if (detailSource.packs) {
      // iterate packs
      if (Array.isArray(detailSource.packs)) {
          voltageMatrix = detailSource.packs.map((p: any) => p.cellVoltages || p.voltages || []);
          temperatureMatrix = detailSource.packs.map((p: any) => p.cellTemperatures || p.temperatures || p.temps || []);
          notificationMatrix = detailSource.packs.map((p: any) => p.notifications || p.cgStatus || []);
      }
  }

  // Balancing details
  if (detailSource.balancing || detailSource.balanceDetails) {
     balancingDetails = Array.isArray(detailSource.balancing || detailSource.balanceDetails) 
        ? (detailSource.balancing || detailSource.balanceDetails)
        : [];
  }

  // General string notifications
  if (detailSource.notifications || detailSource.alarmsList || summary?.alarms || summary?.warns) {
     notifications = [
         ...(summary?.alarms || []).map((a: any) => ({ code: "ALARM", message: String(a), timestamp: new Date().toISOString() })),
         ...(summary?.warns || []).map((w: any) => ({ code: "WARNING", message: String(w), timestamp: new Date().toISOString() })),
         ...(Array.isArray(detailSource.notifications) ? detailSource.notifications : [])
     ];
  }

  if (detailSource.events || detailSource.eventLogs) {
     eventLogs = Array.isArray(detailSource.events || detailSource.eventLogs) ? (detailSource.events || detailSource.eventLogs) : [];
  }

  res.json({
    source: metaWrapper.source,
    staleData: metaWrapper.staleData,
    lastUpdated: metaWrapper.lastUpdated,
    activeEmsBaseUrl: metaWrapper.activeEmsBaseUrl,
    activeProfileName: metaWrapper.activeProfileName,
    activeProfileId: metaWrapper.activeProfileId,
    stationCode: metaWrapper.stationCode,
    blockIndex: metaWrapper.blockIndex,
    arrayIndex,
    stringIndex,
    summary,
    voltageMatrix,
    temperatureMatrix,
    notificationMatrix,
    balancingDetails,
    notifications,
    eventLogs,
    debug: {
      block: stringBlockDetail,
      lastCall: stringLastCallDetail
    }
  });
});
`;

// Insert it somewhere safe, e.g. before /api/local/status-codes
const idxParam = content.indexOf('app.get("/api/local/status-codes",');
if (idxParam > -1) {
    content = content.substring(0, idxParam) + detailRoute + "\n\n" + content.substring(idxParam);
}

fs.writeFileSync('server.ts', content);

