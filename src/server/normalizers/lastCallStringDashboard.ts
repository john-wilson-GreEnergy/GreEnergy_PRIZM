type Bucket = "online" | "nearline" | "offline" | "notCommunicating" | "unknown";

function n(value: any, fallback: number | null = null): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function b(value: any): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).trim().toUpperCase();
  if (["TRUE", "1", "YES", "Y", "CLOSED", "ONLINE", "ON", "IN"].includes(s)) return true;
  if (["FALSE", "0", "NO", "N", "OPEN", "OFFLINE", "OFF", "OUT"].includes(s)) return false;
  return null;
}

function sourceTimestamp(...values: any[]): string | null {
  for (const value of values) {
    const raw = value?.reportTimestamp ?? value?.timeStamp ?? value?.timestamp ?? value?.timestampUtc ?? value?.DateTime ?? value?.datetime;
    if (!raw) continue;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function isNotCommunicatingLike(row: any): boolean {
  const s = String(row?.stringConnectionState ?? row?.connectionState ?? row?.communicationState ?? "").toUpperCase();
  return s.includes("NOT_COMM") || s.includes("COMM_LOSS") || s.includes("LOST_COMMS") || row?.communicating === false || row?.badReport === true;
}

function nonOnlineScore(row: any): number {
  let score = 0;
  const connection = String(row?.stringConnectionState ?? row?.connectionState ?? "").toUpperCase();
  const contactor = String(row?.stringContactorState ?? row?.contactorState ?? "").toUpperCase();
  if (isNotCommunicatingLike(row)) score += 1000;
  if (connection === "OFFLINE") score += 500;
  if (connection === "NEARLINE") score += 300;
  if (row?.positiveContactorClosed === false || row?.negativeContactorClosed === false) score += 100;
  if (contactor === "OPEN") score += 10;
  const stringIndex = Number(row?.stringIndex ?? row?.stringNumber ?? 0);
  return score * 1000 + (Number.isFinite(stringIndex) ? stringIndex : 0);
}

function getStringReportEntry(stringReport: any, stringNumber: number): any {
  if (!stringReport) return null;
  return stringReport[String(stringNumber)] ?? stringReport[stringNumber] ?? stringReport[`string${stringNumber}`] ?? null;
}

function getMetric(row: any, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function makeRollups(strings: any[]) {
  return strings.reduce((acc, row) => {
    acc.totalStrings += 1;
    if (row.bucket === "online") acc.normal += row.operationalState === "NORMAL" ? 1 : 0;
    if (row.operationalState === "WARNING") acc.warnings += 1;
    if (row.operationalState === "ALARM") acc.alarms += 1;
    if (row.bucket === "nearline") acc.nearline += 1;
    if (row.bucket === "offline") acc.offline += 1;
    if (row.bucket === "notCommunicating") acc.notCommunicating += 1;
    acc.closed += row.positiveContactorClosed === true && row.negativeContactorClosed === true ? 1 : 0;
    return acc;
  }, { totalStrings: 0, normal: 0, warnings: 0, alarms: 0, nearline: 0, offline: 0, notCommunicating: 0, closed: 0 });
}

export function buildLastCallStringDashboardData(args: {
  profile?: any;
  baseUrl: string;
  lastCallWrapper: any;
  blockWrapper?: any;
  stringIpMapWrapper?: any;
  ipMapWrapper?: any;
  rawStringsWrapper?: any;
  sourceHealth?: any;
  debugInfoMap?: Record<string, any>;
}) {
  const lastCall = args.lastCallWrapper?.data ?? args.lastCallWrapper;
  const blockReport = lastCall?.blockReport ?? lastCall;
  const arrayReport = blockReport?.arrayReport;
  if (!arrayReport || typeof arrayReport !== "object") return null;

  const stringIpMap = Array.isArray(args.stringIpMapWrapper?.data) ? args.stringIpMapWrapper.data : [];
  const ipMap = Array.isArray(args.ipMapWrapper?.data) ? args.ipMapWrapper.data : [];
  const blockArrays = Array.isArray(args.blockWrapper?.data?.arrays) ? args.blockWrapper.data.arrays : [];
  const strings: any[] = [];
  const perArray: any[] = [];

  for (let arrayNumber = 1; arrayNumber <= 8; arrayNumber++) {
    const arrEntry = arrayReport[String(arrayNumber)] ?? arrayReport[arrayNumber];
    const arrayData = arrEntry?.arrayData ?? arrEntry ?? {};
    const stringReport = arrEntry?.stringReport ?? {};
    const communicatingCount = Number(n(arrayData.communicatingStackCount, NaN));
    const notCommunicatingCount = Number(n(arrayData.notCommunicatingStackCount, 0));
    const hasCommunicationCounts = Number.isFinite(communicatingCount);

    const candidateRows: any[] = [];
    for (let stringNumber = 1; stringNumber <= 40; stringNumber++) {
      const reportEntry = getStringReportEntry(stringReport, stringNumber);
      const stringData = reportEntry?.stringData ?? reportEntry ?? {};
      const blockString = blockArrays[arrayNumber - 1]?.strings?.[stringNumber - 1] ?? null;
      const sIpInfo = stringIpMap.find((m: any) => Number(m?.array) === arrayNumber && Number(m?.string) === stringNumber);
      const ipInfo = ipMap.find((m: any) => Number(m?.array) === arrayNumber && Number(m?.string) === stringNumber);

      const rawPositive = b(stringData.positiveContactorClosed ?? blockString?.positiveContactorClosed);
      const rawNegative = b(stringData.negativeContactorClosed ?? blockString?.negativeContactorClosed);
      const expected = b(stringData.contactorsCloseExpected ?? blockString?.contactorsCloseExpected);
      const actualClosed = rawPositive === true && rawNegative === true;
      const connectionRaw = stringData.stringConnectionState ?? blockString?.stringConnectionState ?? null;
      const outRotation = b(stringData.outRotation ?? blockString?.outRotation);
      const timestampUtc = sourceTimestamp(stringData, reportEntry, arrEntry, blockString) ?? new Date().toISOString();

      candidateRows.push({
        id: `A${arrayNumber}-S${stringNumber}`,
        arrayNumber,
        arrayIndex: arrayNumber,
        stringNumber,
        stringIndex: stringNumber,
        stringKey: `A${arrayNumber}-S${stringNumber}`,
        stringConnectionState: connectionRaw,
        connectionState: connectionRaw,
        stringContactorState: stringData.stringContactorState ?? blockString?.stringContactorState ?? null,
        stringContactorStateCause: stringData.stringContactorStateCause ?? blockString?.stringContactorStateCause ?? null,
        communicating: !isNotCommunicatingLike({ ...stringData, stringConnectionState: connectionRaw }),
        outRotation,
        inRotation: outRotation === false ? true : outRotation === true ? false : null,
        rotationEnabled: outRotation === false,
        rotationStatus: outRotation === false ? "IN" : outRotation === true ? "OUT" : "UNKNOWN",
        positiveContactorClosed: rawPositive,
        negativeContactorClosed: rawNegative,
        bothContactorsClosed: actualClosed,
        contactorClosed: actualClosed,
        contactorStatus: rawPositive === null && rawNegative === null ? "UNKNOWN" : actualClosed ? "CLOSED" : "OPEN",
        contactorsCloseExpected: expected,
        commandMatchesContactors: expected === null ? null : expected === actualClosed,
        recloseCount: n(stringData.recloseCount ?? blockString?.recloseCount, null),
        connectionPermitted: expected,
        connectionPermittedSource: "last-call-string-data",
        measuredVoltage: n(getMetric(stringData, "measuredStringVoltage", "measuredVoltage") ?? blockString?.measuredStringVoltage ?? blockString?.measuredVoltage, null),
        calculatedVoltage: n(getMetric(stringData, "calculatedStringVoltage", "calculatedVoltage") ?? blockString?.calculatedStringVoltage ?? blockString?.calculatedVoltage, null),
        preciseCalculatedStringVoltage: n(getMetric(stringData, "preciseCalculatedStringVoltage") ?? blockString?.preciseCalculatedStringVoltage, null),
        busVoltage: n(getMetric(stringData, "dcBusVoltage", "busVoltage") ?? blockString?.dcBusVoltage ?? blockString?.busVoltage, null),
        amps: n(getMetric(stringData, "stringCurrent", "current", "currentAmp") ?? blockString?.stringCurrent ?? blockString?.currentAmp, null),
        kw: n(getMetric(stringData, "powerkW", "powerKw", "kw") ?? blockString?.powerkW ?? blockString?.kw, null),
        socPct: n(getMetric(stringData, "soc", "socPct", "stateOfCharge") ?? blockString?.soc ?? blockString?.socPct, null),
        ah: n(getMetric(stringData, "ampHours", "ah") ?? blockString?.ampHours ?? blockString?.ah, null),
        kwh: n(getMetric(stringData, "energykWh", "energyKWh", "kwh") ?? blockString?.energykWh ?? blockString?.kwh, null),
        kWh: n(getMetric(stringData, "energykWh", "energyKWh", "kwh") ?? blockString?.energykWh ?? blockString?.kwh, null),
        minCellVoltage: n(getMetric(stringData, "minCellGroupVoltage", "minCellVoltage") ?? blockString?.minCellGroupVoltage ?? blockString?.minCellVoltage, null),
        maxCellVoltage: n(getMetric(stringData, "maxCellGroupVoltage", "maxCellVoltage") ?? blockString?.maxCellGroupVoltage ?? blockString?.maxCellVoltage, null),
        avgCellVoltage: n(getMetric(stringData, "avgCellGroupVoltage", "avgCellVoltage") ?? blockString?.avgCellGroupVoltage ?? blockString?.avgCellVoltage, null),
        minCellTemperature: n(getMetric(stringData, "minCellGroupTemp", "minCellTemperature") ?? blockString?.minCellGroupTemp ?? blockString?.minCellTemperature, null),
        maxCellTemperature: n(getMetric(stringData, "maxCellGroupTemp", "maxCellTemperature") ?? blockString?.maxCellGroupTemp ?? blockString?.maxCellTemperature, null),
        avgCellTemperature: n(getMetric(stringData, "avgCellGroupTemp", "avgCellTemperature") ?? blockString?.avgCellGroupTemp ?? blockString?.avgCellTemperature, null),
        warningCount: 0,
        alarmCount: 0,
        warnings: [],
        alarms: [],
        stringControllerIp: ipInfo?.ip ?? sIpInfo?.ip ?? null,
        stringControllerEntityKey: sIpInfo?.entityKey,
        stringControllerEntityKeyToken: sIpInfo?.entityKeyToken,
        metricSource: "last-call-unified-string-stack",
        sourceTimestampUtc: timestampUtc,
        timestampUtc,
        rawTimestamp: timestampUtc,
        lastUpdatedUtc: new Date().toISOString(),
        container: blockString?.enclosureIndex ?? stringData.enclosureIndex ?? "",
        location: blockString?.enclosureLocation ?? stringData.enclosureLocation ?? "",
        bpcCount: n(stringData.batteryPackCount ?? blockString?.batteryPackCount, null),
        bpcs: Array.isArray(reportEntry?.batteryPackReportList) ? reportEntry.batteryPackReportList : [],
        balanceTelemetryAvailable: false,
        balanceCount: null,
        balanceMode: "--",
        balanceDetails: [],
        fanSourceAvailable: !!stringData.stringFanReport,
        rawFanReport: stringData.stringFanReport ?? null,
        raw: {
          lastCallStringReport: reportEntry,
          lastCallStringData: stringData,
          blockviewerString: blockString
        },
        sourceDebug: {
          unifiedStringStack: {
            primarySource: "lastCall.blockReport.arrayReport.stringReport.stringData",
            arraySourcePath: `blockReport.arrayReport.${arrayNumber}.arrayData`,
            stringSourcePath: `blockReport.arrayReport.${arrayNumber}.stringReport.${stringNumber}.stringData`,
            contactorRule: "explicit positive/negative contactor feedback overrides stringContactorState",
            raw: {
              stringConnectionState: connectionRaw,
              stringContactorState: stringData.stringContactorState ?? null,
              positiveContactorClosed: rawPositive,
              negativeContactorClosed: rawNegative,
              contactorsCloseExpected: expected,
              outRotation
            }
          }
        }
      });
    }

    let notCommRows = candidateRows.filter(isNotCommunicatingLike);
    if (hasCommunicationCounts && notCommRows.length !== notCommunicatingCount) {
      notCommRows = [...candidateRows]
        .sort((a, b) => nonOnlineScore(b) - nonOnlineScore(a))
        .slice(0, notCommunicatingCount);
    }
    const notCommSet = new Set(notCommRows.map(row => row.stringNumber));

    for (const row of candidateRows) {
      const bucket: Bucket = notCommSet.has(row.stringNumber) ? "notCommunicating" : "online";
      if (bucket === "notCommunicating") {
        row.bucket = "notCommunicating";
        row.operationalState = "NOT_COMMUNICATING";
        row.communicating = false;
        row.stringConnectionState = "NOT_COMMUNICATING";
        row.connectionState = "NOT_COMMUNICATING";
        row.positiveContactorClosed = null;
        row.negativeContactorClosed = null;
        row.bothContactorsClosed = null;
        row.contactorClosed = null;
        row.contactorStatus = "UNKNOWN";
        row.contactorsCloseExpected = null;
        row.commandMatchesContactors = null;
      } else {
        row.bucket = "online";
        row.operationalState = row.alarmCount > 0 ? "ALARM" : row.warningCount > 0 ? "WARNING" : "NORMAL";
        row.communicating = true;
        row.stringConnectionState = "ONLINE";
        row.connectionState = "ONLINE";
        row.outRotation = false;
        row.inRotation = true;
        row.rotationEnabled = true;
        row.rotationStatus = "IN";
        if (row.positiveContactorClosed === true && row.negativeContactorClosed === true) {
          row.contactorStatus = "CLOSED";
          row.bothContactorsClosed = true;
          row.contactorClosed = true;
        }
      }
      row.classification = {
        state: row.bucket,
        bucket: row.bucket,
        reason: bucket === "online" ? "unified_lastcall_array_communication_online" : "unified_lastcall_array_communication_not_communicating",
        communicating: row.communicating,
        inRotation: row.inRotation,
        contactorsClosed: row.bothContactorsClosed
      };
      row.sourceDebug.unifiedStringStack.finalBucket = row.bucket;
      row.sourceDebug.unifiedStringStack.finalOperationalState = row.operationalState;
      strings.push(row);
    }

    perArray.push({
      arrayNumber,
      online: hasCommunicationCounts ? communicatingCount : candidateRows.filter(r => !notCommSet.has(r.stringNumber)).length,
      nearline: 0,
      offline: 0,
      notCommunicating: notCommSet.size,
      total: candidateRows.length,
      source: "lastCall.blockReport.arrayReport.arrayData"
    });
  }

  const rollups = makeRollups(strings);
  const avg = (values: any[]) => {
    const nums = values.map(v => Number(v)).filter(v => Number.isFinite(v));
    return nums.length ? nums.reduce((a, c) => a + c, 0) / nums.length : null;
  };
  const max = (values: any[]) => {
    const nums = values.map(v => Number(v)).filter(v => Number.isFinite(v));
    return nums.length ? Math.max(...nums) : null;
  };

  const voltageDeltas = strings.map(s => {
    if (s.maxCellVoltage === null || s.minCellVoltage === null) return null;
    return Number((Number(s.maxCellVoltage) - Number(s.minCellVoltage)).toFixed(3));
  }).filter(v => v !== null);
  const tempDeltas = strings.map(s => {
    if (s.maxCellTemperature === null || s.minCellTemperature === null) return null;
    return Number((Number(s.maxCellTemperature) - Number(s.minCellTemperature)).toFixed(1));
  }).filter(v => v !== null);

  const cards = {
    totalStrings: rollups.totalStrings,
    normal: rollups.normal,
    offline: rollups.offline,
    nearline: rollups.nearline,
    notCommunicating: rollups.notCommunicating,
    warnings: rollups.warnings,
    alarms: rollups.alarms,
    connectionPermitted: rollups.closed,
    totalBpcs: strings.reduce((acc, s) => acc + (Number(s.bpcCount) || 0), 0),
    knownBpcCount: strings.reduce((acc, s) => acc + (Number(s.bpcCount) || 0), 0),
    expectedBpcCount: rollups.totalStrings * 14,
    fleetAvgCellVoltage: avg(strings.map(s => s.avgCellVoltage)),
    fleetMaxCellVoltageDelta: max(voltageDeltas),
    fleetAvgCellTemp: avg(strings.map(s => s.avgCellTemperature)),
    fleetMaxCellTemp: max(strings.map(s => s.maxCellTemperature))
  };

  return {
    profileId: args.profile?.id,
    emsBaseUrl: args.baseUrl,
    generatedAt: new Date().toISOString(),
    scanStartedAt: args.lastCallWrapper?.lastUpdated ?? null,
    scanCompletedAt: new Date().toISOString(),
    durationMs: args.debugInfoMap?.["/tools/report/ems/lastCall.json"]?.durationMs ?? 0,
    cacheAgeMs: 0,
    sourceHealth: args.sourceHealth,
    expectedStringCount: 320,
    baseRowCount: strings.length,
    stringsReturned: strings.length,
    enrichedRowCount: 0,
    cards,
    rollups: cards,
    totalStrings: strings.length,
    arrayCount: 8,
    normal: rollups.normal,
    offline: rollups.offline,
    nearline: rollups.nearline,
    notCommunicating: rollups.notCommunicating,
    warnings: rollups.warnings,
    alarms: rollups.alarms,
    totalBpcs: cards.totalBpcs,
    canonicalStringSnapshot: {
      source: "lastCall.blockReport.arrayReport",
      rollups,
      perArray
    },
    summary: {
      totalArrays: 8,
      totalStrings: strings.length,
      normalStrings: rollups.normal,
      warningStrings: rollups.warnings,
      alarmStrings: rollups.alarms,
      offlineStrings: rollups.offline,
      nearlineStrings: rollups.nearline,
      notCommunicatingStrings: rollups.notCommunicating,
      totalBpcs: cards.totalBpcs,
      warningBpcs: 0,
      alarmBpcs: 0,
      avgCellVoltage: cards.fleetAvgCellVoltage,
      maxCellVoltageDelta: cards.fleetMaxCellVoltageDelta,
      avgCellTemperature: cards.fleetAvgCellTemp,
      maxCellTemperatureDelta: max(tempDeltas),
      latestTimestampUtc: new Date().toISOString()
    },
    arrays: perArray,
    strings
  };
}
