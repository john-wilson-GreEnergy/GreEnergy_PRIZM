type Bucket = "online" | "nearline" | "offline" | "notCommunicating" | "unknown";

type PerArrayCounts = {
  arrayNumber: number;
  online: number;
  nearline: number;
  offline: number;
  notCommunicating: number;
  total: number;
  source: string;
  sourcePath: string;
};

export type CanonicalStringSnapshotResult = {
  strings: any[];
  perArray: PerArrayCounts[];
  rollups: {
    total: number;
    online: number;
    nearline: number;
    offline: number;
    notCommunicating: number;
  };
  source: string;
};

function n(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rowArray(row: any): number {
  return n(row?.arrayNumber ?? row?.arrayIndex ?? row?.array, 0);
}

function rowString(row: any): number {
  return n(row?.stringNumber ?? row?.stringIndex ?? row?.string, 0);
}

function hasNotCommSignal(row: any): boolean {
  const state = String(row?.stringConnectionState ?? row?.connectionState ?? row?.bucket ?? row?.operationalState ?? "").toUpperCase();
  return row?.communicating === false || state.includes("NOT_COMM") || state.includes("COMM_LOSS") || state.includes("LOST_COMMS");
}

function nonOnlineScore(row: any): number {
  let score = 0;
  const bucket = String(row?.bucket ?? "").toLowerCase();
  const op = String(row?.operationalState ?? "").toUpperCase();
  const conn = String(row?.stringConnectionState ?? row?.connectionState ?? "").toUpperCase();

  if (hasNotCommSignal(row)) score += 1000;
  if (bucket === "notcommunicating") score += 900;
  if (op === "NOT_COMMUNICATING") score += 900;
  if (conn === "OFFLINE" || bucket === "offline" || op === "OFFLINE") score += 250;
  if (conn === "NEARLINE" || bucket === "nearline" || op === "NEARLINE") score += 100;
  if (row?.positiveContactorClosed === false || row?.negativeContactorClosed === false) score += 50;
  if (row?.sourceDebug?.stale === true || row?.stale === true) score += 25;
  return score;
}

function extractArrayCommunicationCounts(lastCall: any): PerArrayCounts[] | null {
  const arrayReport = lastCall?.blockReport?.arrayReport ?? lastCall?.arrayReport;
  if (!arrayReport || typeof arrayReport !== "object") return null;

  const rows = Object.entries(arrayReport)
    .map(([key, value]: [string, any]) => {
      const arrayData = value?.arrayData ?? value;
      const communicatingRaw = arrayData?.communicatingStackCount;
      const notCommRaw = arrayData?.notCommunicatingStackCount;
      if (communicatingRaw === undefined && notCommRaw === undefined) return null;
      const arrayNumber = n(arrayData?.arrayIndex ?? arrayData?.arrayNumber ?? key, 0);
      const online = n(communicatingRaw, 0);
      const notCommunicating = n(notCommRaw, 0);
      return {
        arrayNumber,
        online,
        nearline: 0,
        offline: 0,
        notCommunicating,
        total: online + notCommunicating,
        source: "last-call-array-communication-counts",
        sourcePath: `blockReport.arrayReport.${key}.arrayData`
      };
    })
    .filter((row): row is PerArrayCounts => !!row && row.arrayNumber >= 1 && row.arrayNumber <= 8);

  return rows.length ? rows : null;
}

function extractDcBatteryCounts(lastCall: any): PerArrayCounts[] | null {
  const dcBatteryReport = lastCall?.blockReport?.dcBatteryReport ?? lastCall?.dcBatteryReport;
  if (!dcBatteryReport || typeof dcBatteryReport !== "object") return null;

  const rows = Object.entries(dcBatteryReport)
    .map(([key, value]: [string, any]) => {
      const socData = value?.dcBatteryData?.socData ?? value?.socData;
      if (!socData) return null;
      const online = n(socData.onlineStackCount, 0);
      const nearline = n(socData.nearlineStackCount, 0);
      const offline = n(socData.offlineStackCount, 0);
      const arrayNumber = n(key, 0);
      return {
        arrayNumber,
        online,
        nearline,
        offline,
        notCommunicating: 0,
        total: online + nearline + offline,
        source: "last-call-dc-battery-soc-counts",
        sourcePath: `blockReport.dcBatteryReport.${key}.dcBatteryData.socData`
      };
    })
    .filter((row): row is PerArrayCounts => !!row && row.arrayNumber >= 1 && row.arrayNumber <= 8);

  return rows.length ? rows : null;
}

function extractBlockViewerCounts(blockviewer: any): PerArrayCounts[] | null {
  const arrays = blockviewer?.arrays;
  if (!Array.isArray(arrays)) return null;
  const rows = arrays
    .map((arr: any, index: number) => {
      const arrayNumber = n(arr?.arrayIndex ?? arr?.arrayNumber ?? index + 1, 0);
      const online = n(arr?.onlineStringCount ?? arr?.onlineCount, 0);
      const nearline = n(arr?.nearlineStringCount ?? arr?.nearlineCount, 0);
      const offline = n(arr?.offlineStringCount ?? arr?.offlineCount, 0);
      const notCommunicating = n(arr?.notCommunicationStringCount ?? arr?.notCommunicatingCount, 0);
      return {
        arrayNumber,
        online,
        nearline,
        offline,
        notCommunicating,
        total: n(arr?.stringCount, online + nearline + offline + notCommunicating),
        source: "blockviewer-array-counts-fallback",
        sourcePath: `arrays[${index}]`
      };
    })
    .filter((row: PerArrayCounts) => row.arrayNumber >= 1 && row.arrayNumber <= 8);
  return rows.length ? rows : null;
}

export function extractCanonicalArrayCounts(sources: { lastCall?: any; blockviewer?: any }): PerArrayCounts[] {
  return (
    extractArrayCommunicationCounts(sources.lastCall) ??
    extractDcBatteryCounts(sources.lastCall) ??
    extractBlockViewerCounts(sources.blockviewer) ??
    []
  );
}

function setOnline(row: any, countSource: PerArrayCounts) {
  row.communicating = true;
  row.stringConnectionState = "ONLINE";
  row.connectionState = "ONLINE";
  row.outRotation = false;
  row.inRotation = true;
  row.rotationEnabled = true;
  row.rotationStatus = "IN";
  row.positiveContactorClosed = true;
  row.negativeContactorClosed = true;
  row.contactorClosed = true;
  row.bothContactorsClosed = true;
  row.contactorStatus = "CLOSED";
  row.contactorsCloseExpected = true;
  row.commandMatchesContactors = true;
  row.bucket = "online";
  row.operationalState = "NORMAL";
  row.classification = {
    ...(row.classification ?? {}),
    state: "online",
    bucket: "online",
    reason: "canonical_array_count_online",
    communicating: true,
    inRotation: true,
    contactorsClosed: true
  };
  row.sourceDebug = {
    ...(row.sourceDebug ?? {}),
    canonicalStringSnapshot: {
      finalBucket: "online",
      finalSource: countSource.source,
      finalSourcePath: countSource.sourcePath,
      reason: "array communication count assigned this row online"
    }
  };
}

function setNotCommunicating(row: any, countSource: PerArrayCounts) {
  row.communicating = false;
  row.stringConnectionState = "NOT_COMMUNICATING";
  row.connectionState = "NOT_COMMUNICATING";
  row.outRotation = null;
  row.inRotation = null;
  row.rotationEnabled = false;
  row.rotationStatus = "UNKNOWN";
  row.positiveContactorClosed = null;
  row.negativeContactorClosed = null;
  row.contactorClosed = null;
  row.bothContactorsClosed = null;
  row.contactorStatus = "UNKNOWN";
  row.contactorsCloseExpected = null;
  row.commandMatchesContactors = null;
  row.bucket = "notCommunicating";
  row.operationalState = "NOT_COMMUNICATING";
  row.classification = {
    ...(row.classification ?? {}),
    state: "notCommunicating",
    bucket: "notCommunicating",
    reason: "canonical_array_count_not_communicating",
    communicating: false,
    inRotation: null,
    contactorsClosed: null
  };
  row.sourceDebug = {
    ...(row.sourceDebug ?? {}),
    canonicalStringSnapshot: {
      finalBucket: "notCommunicating",
      finalSource: countSource.source,
      finalSourcePath: countSource.sourcePath,
      reason: "array communication count assigned this row not communicating"
    }
  };
}

export function applyCanonicalStringSnapshot(
  inputRows: any[],
  sources: { lastCall?: any; blockviewer?: any } = {}
): CanonicalStringSnapshotResult {
  const rows = inputRows.map(row => ({ ...row, sourceDebug: { ...(row?.sourceDebug ?? {}) } }));
  const perArray = extractCanonicalArrayCounts(sources);
  const perArrayByNumber = new Map(perArray.map(row => [row.arrayNumber, row]));

  for (let arrayNumber = 1; arrayNumber <= 8; arrayNumber++) {
    const countSource = perArrayByNumber.get(arrayNumber);
    if (!countSource) continue;

    const arrayRows = rows
      .filter(row => rowArray(row) === arrayNumber)
      .sort((a, b) => rowString(a) - rowString(b));
    if (!arrayRows.length) continue;

    const notCommCount = Math.max(0, Math.min(countSource.notCommunicating, arrayRows.length));
    const notCommRows = [...arrayRows]
      .sort((a, b) => {
        const scoreDiff = nonOnlineScore(b) - nonOnlineScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        return rowString(b) - rowString(a);
      })
      .slice(0, notCommCount);
    const notCommSet = new Set(notCommRows.map(row => rowString(row)));

    for (const row of arrayRows) {
      if (notCommSet.has(rowString(row))) setNotCommunicating(row, countSource);
      else setOnline(row, countSource);
    }
  }

  const rollups = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      const bucket: Bucket = row.bucket ?? "unknown";
      if (bucket === "online") acc.online += 1;
      else if (bucket === "nearline") acc.nearline += 1;
      else if (bucket === "offline") acc.offline += 1;
      else if (bucket === "notCommunicating") acc.notCommunicating += 1;
      return acc;
    },
    { total: 0, online: 0, nearline: 0, offline: 0, notCommunicating: 0 }
  );

  return {
    strings: rows,
    perArray,
    rollups,
    source: perArray[0]?.source ?? "canonical-row-fallback"
  };
}
