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

function outOfRotationScore(row: any): number {
  let score = 0;
  const rotation = String(row?.rotationStatus ?? row?.rotationState ?? row?.rotation?.displayState ?? "").trim().toUpperCase();
  if (row?.outRotation === true || row?.outOfRotation === true || row?.inRotation === false) score += 1000;
  if (rotation === "OUT" || rotation === "OUT_OF_ROTATION" || rotation === "OUT OF ROTATION") score += 900;
  if (String(row?.bucket ?? row?.operationalState ?? "").toUpperCase() === "OFFLINE") score += 300;
  if (row?.positiveContactorClosed === false && row?.negativeContactorClosed === false) score += 50;
  return score;
}

function nearlineScore(row: any): number {
  let score = 0;
  if (String(row?.bucket ?? row?.operationalState ?? "").toUpperCase() === "NEARLINE") score += 500;
  if (row?.inRotation === true && (row?.positiveContactorClosed === false || row?.negativeContactorClosed === false)) score += 250;
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
    .filter((row): row is PerArrayCounts => !!row && row.arrayNumber >= 1);

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
    .filter((row): row is PerArrayCounts => !!row && row.arrayNumber >= 1);

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
    .filter((row: PerArrayCounts) => row.arrayNumber >= 1);
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


function setOffline(row: any, countSource: PerArrayCounts) {
  row.communicating = true;
  row.stringConnectionState = "OFFLINE";
  row.connectionState = "OFFLINE";
  row.outRotation = true;
  row.inRotation = false;
  row.rotationEnabled = false;
  row.rotationStatus = "OUT";
  row.bucket = "offline";
  row.operationalState = "OFFLINE";
  row.rotation = {
    ...(row.rotation ?? {}),
    normalizedState: "OUT OF ROTATION",
    displayState: "OUT",
    inRotation: false,
    outOfRotation: true,
    source: row.rotation?.source ?? "canonical-array-counts"
  };
  row.classification = {
    ...(row.classification ?? {}),
    state: "offline",
    bucket: "offline",
    reason: "canonical_array_count_offline",
    communicating: true,
    inRotation: false,
    contactorsClosed: row.bothContactorsClosed ?? null
  };
  row.sourceDebug = {
    ...(row.sourceDebug ?? {}),
    canonicalStringSnapshot: {
      finalBucket: "offline",
      finalSource: countSource.source,
      finalSourcePath: countSource.sourcePath,
      reason: "array state count assigned this row offline/out of rotation"
    }
  };
}

function setNearline(row: any, countSource: PerArrayCounts) {
  row.communicating = true;
  row.stringConnectionState = "NEARLINE";
  row.connectionState = "NEARLINE";
  row.outRotation = false;
  row.inRotation = true;
  row.rotationEnabled = true;
  row.rotationStatus = "IN";
  row.bucket = "nearline";
  row.operationalState = "NEARLINE";
  row.classification = {
    ...(row.classification ?? {}),
    state: "nearline",
    bucket: "nearline",
    reason: "canonical_array_count_nearline",
    communicating: true,
    inRotation: true,
    contactorsClosed: row.bothContactorsClosed ?? false
  };
  row.sourceDebug = {
    ...(row.sourceDebug ?? {}),
    canonicalStringSnapshot: {
      finalBucket: "nearline",
      finalSource: countSource.source,
      finalSourcePath: countSource.sourcePath,
      reason: "array state count assigned this row nearline"
    }
  };
}

function applyLastCallStringTelemetry(rows: any[], lastCall: any): void {
  const arrayReport = lastCall?.blockReport?.arrayReport ?? lastCall?.arrayReport;
  if (!arrayReport || typeof arrayReport !== "object") return;

  for (const row of rows) {
    const arrayNumber = rowArray(row);
    const stringNumber = rowString(row);
    const arrayEntry = arrayReport?.[arrayNumber] ?? arrayReport?.[String(arrayNumber)];
    const stringReport = arrayEntry?.stringReport;
    const stringEntry = stringReport?.[stringNumber] ?? stringReport?.[String(stringNumber)] ?? stringReport?.[`string${stringNumber}`];
    const data = stringEntry?.stringData ?? stringEntry;
    if (!data || typeof data !== "object") continue;

    // Array totals cannot override an explicitly reported string rotation bit.
    // In particular, aggregate communication reconciliation may have cleared it.
    if (typeof data.outRotation === "boolean") {
      row.outRotation = data.outRotation;
      row.inRotation = !data.outRotation;
      row.rotationEnabled = !data.outRotation;
      row.rotationStatus = data.outRotation ? "OUT" : "IN";
      row.rotation = {
        ...(row.rotation ?? {}),
        inRotation: !data.outRotation,
        outOfRotation: data.outRotation,
        displayState: row.rotationStatus,
        normalizedState: data.outRotation ? "OUT OF ROTATION" : "IN ROTATION",
        rawValue: data.outRotation,
        source: "last-call-explicit-rotation",
        sourcePath: `blockReport.arrayReport.${arrayNumber}.stringReport.${stringNumber}.stringData.outRotation`
      };
    }

    const positive = typeof data.positiveContactorClosed === "boolean" ? data.positiveContactorClosed : null;
    const negative = typeof data.negativeContactorClosed === "boolean" ? data.negativeContactorClosed : null;
    const expected = typeof data.contactorsCloseExpected === "boolean" ? data.contactorsCloseExpected : null;
    const recloseCount = Number(data.recloseCount);

    if (positive !== null) row.positiveContactorClosed = positive;
    if (negative !== null) row.negativeContactorClosed = negative;
    if (expected !== null) row.contactorsCloseExpected = expected;
    if (Number.isFinite(recloseCount)) row.recloseCount = recloseCount;

    if (positive !== null && negative !== null) {
      const bothClosed = positive && negative;
      row.bothContactorsClosed = bothClosed;
      row.contactorsClosed = bothClosed;
      row.contactorClosed = bothClosed;
      row.contactorStatus = bothClosed ? "CLOSED" : "OPEN";
      row.contactorState = bothClosed ? "CLOSED" : "OPEN";
      row.stringContactorState = bothClosed ? "CLOSED" : "OPEN";
      row.contactorMismatch = expected === null ? positive !== negative : expected !== bothClosed || positive !== negative;
      row.commandMatchesContactors = expected === null ? null : expected === bothClosed && positive === negative;
      row.actualContactorStateSource = "last-call-explicit-polarity";
    }

    row.sourceDebug = {
      ...(row.sourceDebug ?? {}),
      lastCallStringTelemetryApplied: {
        source: `blockReport.arrayReport.${arrayNumber}.stringReport.${stringNumber}.stringData`,
        positiveContactorClosed: positive,
        negativeContactorClosed: negative,
        contactorsCloseExpected: expected,
        recloseCount: Number.isFinite(recloseCount) ? recloseCount : null
      }
    };
  }
}

export function applyCanonicalStringSnapshot(
  inputRows: any[],
  sources: { lastCall?: any; blockviewer?: any } = {}
): CanonicalStringSnapshotResult {
  const rows = inputRows.map(row => ({ ...row, sourceDebug: { ...(row?.sourceDebug ?? {}) } }));
  const perArray = extractCanonicalArrayCounts(sources);
  const perArrayByNumber = new Map(perArray.map(row => [row.arrayNumber, row]));

  for (const arrayNumber of perArray.map((row) => row.arrayNumber)) {
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

    const communicatingRows = arrayRows.filter(row => !notCommSet.has(rowString(row)));
    const offlineCount = Math.max(0, Math.min(countSource.offline, communicatingRows.length));
    const offlineRows = [...communicatingRows]
      .sort((a, b) => {
        const scoreDiff = outOfRotationScore(b) - outOfRotationScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        return rowString(b) - rowString(a);
      })
      .slice(0, offlineCount);
    const offlineSet = new Set(offlineRows.map(row => rowString(row)));

    const rotationEligibleRows = communicatingRows.filter(row => !offlineSet.has(rowString(row)));
    const nearlineCount = Math.max(0, Math.min(countSource.nearline, rotationEligibleRows.length));
    const nearlineRows = [...rotationEligibleRows]
      .sort((a, b) => {
        const scoreDiff = nearlineScore(b) - nearlineScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        return rowString(b) - rowString(a);
      })
      .slice(0, nearlineCount);
    const nearlineSet = new Set(nearlineRows.map(row => rowString(row)));

    for (const row of arrayRows) {
      if (notCommSet.has(rowString(row))) setNotCommunicating(row, countSource);
      else if (offlineSet.has(rowString(row))) setOffline(row, countSource);
      else if (nearlineSet.has(rowString(row))) setNearline(row, countSource);
      else setOnline(row, countSource);
    }
  }

  // Restore explicit per-string rotation and contactor feedback after aggregate
  // assignment. Counts do not identify a specific string's rotation state.
  applyLastCallStringTelemetry(rows, sources.lastCall);

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
