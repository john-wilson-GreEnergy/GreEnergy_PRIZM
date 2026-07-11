import { collectTelemetrySnapshot, getTelemetryBroker } from "./telemetry/TelemetryRuntime";

type LocalStringsMetaWrapper = {
  source: string;
  staleData: boolean;
  lastUpdated: string | null;
  activeEmsBaseUrl: string | null;
  activeProfileName: string | null;
  activeProfileId: string | null;
  stationCode: string | null;
  blockIndex: number | null;
  lastError: string | null;
  cacheProfileId: string | null;
  cacheEmsBaseUrl: string | null;
  cacheCreatedAt: string | null;
  cacheLastUpdatedAt: string | null;
  data?: any[];
};

type BuildLocalStringsResponseArgs = {
  rawStringsWrapper: LocalStringsMetaWrapper;
  blockWrapper: LocalStringsMetaWrapper;
  ipMapWrapper: { data?: any[] } | null | undefined;
  snapshot: any;
  forceLegacy?: boolean;
  disableBroker?: boolean;
  brokerSnapshot?: any;
};

type NormalizedStringRow = {
  arrayIndex: number;
  stringIndex: number;
  stringKey: string;
  timestamp: string;
  datetime: string;
  connectionState: string;
  soc: number | null;
  kw: number | null;
  kwh: number | null;
  ah: number | null;
  calculatedVoltage: number | null;
  measuredVoltage: number | null;
  dcBusVoltage: number | null;
  stringCurrent: number | null;
  ctCurrent1: number | null;
  ctCurrent2: number | null;
  contactorsCloseExpected: boolean;
  positiveContactorClosed: boolean;
  negativeContactorClosed: boolean;
  contactorMismatch: boolean;
  recloseCount: number | null;
  outRotation: boolean;
  maxCellTemp: number | null;
  minCellTemp: number | null;
  avgCellTemp: number | null;
  tempDelta: number | null;
  maxCellVoltage: number | null;
  minCellVoltage: number | null;
  avgCellVoltage: number | null;
  voltageDelta: number | null;
  alarmCount: number | null;
  alarms: any[];
  warnCount: number | null;
  warns: any[];
  lastFanCommand: string;
  location: string;
  ipAddress: string;
  entityToken: string;
};

type BrokerParitySummary = {
  brokerOutputCount: number;
  legacyOutputCount: number;
  brokerUniqueStringKeyCount: number;
  legacyUniqueStringKeyCount: number;
  representativeFieldEquality: {
    connectionState: boolean;
    soc: boolean;
    measuredVoltage: boolean;
    maxCellTemp: boolean;
  };
};

function pN(val: any, def: number | null = null): number | null {
  if (val === undefined || val === null || val === "") return def;
  const n = Number(val);
  return Number.isNaN(n) ? def : n;
}

function hasUsableStringIdentity(rows: any[]): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  return rows.some((row: any) => {
    if (!row || typeof row !== "object") return false;
    return (
      row.arrayIndex != null || row.ArrayIndex != null || row.array != null || row.Array != null ||
      row.stringIndex != null || row.StringIndex != null || row.string != null || row.String != null ||
      row.stringKey != null || row.StringKey != null
    );
  });
}

function normalizeRows(rawData: any[], ipMap: any[], metaWrapper: LocalStringsMetaWrapper): NormalizedStringRow[] {
  return rawData.map((row: any) => {
    const arrayIndex = pN(row.arrayIndex || row.ArrayIndex || row.array || row.Array || row.arrayNumber || row.ArrayNumber || row.array_number, 1) as number;
    const stringIndex = pN(row.stringIndex || row.StringIndex || row.string || row.String || row.stringNumber || row.StringNumber || row.string_number || row.segmentId, 1) as number;
    const stringKey = row.stringKey || row.StringKey || row.displayKey || row.key || `A${arrayIndex}-S${stringIndex}`;

    const ipInfo = ipMap.find((ip: any) => ip.array === arrayIndex && ip.string === stringIndex);

    let connectionState = row.connectionState || row.stringConnectionState || row.StringConnectionState || row.Status || row.status || row.state || row.contact || row.communicating || row.communicationState;
    if (connectionState === true || connectionState === "true") connectionState = "Online";
    else if (connectionState === false || connectionState === "false") connectionState = "Offline";
    else if (!connectionState) connectionState = "Unknown";
    else connectionState = String(connectionState);

    const contactorsCloseExpected = Boolean(row.contact_close_expected ?? row.contactCloseExpected ?? row.ContactorsCloseExpected ?? (connectionState === "Online"));
    const positiveContactorClosed = Boolean(row.positive_contactor_closed ?? row.positiveContactorClosed ?? row.PositiveContactorClosed ?? (connectionState === "Online"));
    const negativeContactorClosed = Boolean(row.negative_contactor_closed ?? row.negativeContactorClosed ?? row.NegativeContactorClosed ?? (connectionState === "Online"));
    const contactorMismatch = (contactorsCloseExpected !== positiveContactorClosed) || (contactorsCloseExpected !== negativeContactorClosed);

    const maxT = pN(row.cellGroupTempMax || row.MaxCellGroupTemp || row.cellTempMax);
    const minT = pN(row.cellGroupTempMin || row.MinCellGroupTemp || row.cellTempMin);
    const maxV = pN(row.cellGroupVoltageMax || row.MaxCellGroupVoltage || row.cellVoltsMax || row.maxCellVoltage);
    const minV = pN(row.cellGroupVoltageMin || row.MinCellGroupVoltage || row.cellVoltsMin || row.minCellVoltage);

    return {
      arrayIndex,
      stringIndex,
      stringKey,
      timestamp: row.timestamp || row.Timestamp || row.TimestampUtc || row.timeStamp || row.time || metaWrapper.lastUpdated || new Date().toISOString(),
      datetime: row.datetime || row.Datetime || row.dateTime || "",
      connectionState,
      soc: pN(row.soc || row.Soc || row.SoC || row.powerSoc || row.socPct || row.stateOfCharge),
      kw: pN(row.kw || row.KW || row.powerkW || row.measuredKw || row.activePowerKw || row.realPowerKw),
      kwh: pN(row.kwh || row.KWh || row.powerKwh || row.energyKwh),
      ah: pN(row.ah || row.Ah),
      calculatedVoltage: pN(row.voltageCalculated || row.CalculatedStringVoltage || row.voltageCalc || row.calculatedVoltage),
      measuredVoltage: pN(row.voltageMeasured || row.MeasuredStringVoltage || row.voltageMeas || row.measuredVoltage),
      dcBusVoltage: pN(row.voltageDcBus || row.DcBusVoltage || row.voltageBus),
      stringCurrent: pN(row.current || row.stringCurrent || row.StringCurrent),
      ctCurrent1: pN(row.ctCurrent1 || row.CtCurrent1),
      ctCurrent2: pN(row.ctCurrent2 || row.CtCurrent2),
      contactorsCloseExpected,
      positiveContactorClosed,
      negativeContactorClosed,
      contactorMismatch,
      recloseCount: pN(row.recloseCount || row.RecloseCount, 0),
      outRotation: Boolean(row.out_rotation ?? row.outRotation ?? row.OutRotation ?? (row.rotation === "fault" || row.outOfRotation)),
      maxCellTemp: maxT ?? pN(row.maxCellTemp),
      minCellTemp: minT ?? pN(row.minCellTemp),
      avgCellTemp: pN(row.cellGroupTempAvg || row.AvgCellGroupTemp || row.avgCellTemp || row.averageCellTemp),
      tempDelta: (maxT !== null && minT !== null) ? Number((maxT - minT).toFixed(1)) : null,
      maxCellVoltage: maxV ?? pN(row.maxCellVoltage),
      minCellVoltage: minV ?? pN(row.minCellVoltage),
      avgCellVoltage: pN(row.cellGroupVoltageAvg || row.AvgCellGroupVoltage || row.avgCellVoltage || row.averageCellVoltage),
      voltageDelta: (maxV !== null && minV !== null) ? Number((maxV - minV).toFixed(3)) : null,
      alarmCount: pN(row.alarmCount || row.AlarmCount || row.alarms, 0),
      alarms: row.alarmsList || row.Alarms || [],
      warnCount: pN(row.warningCount || row.WarnCount || row.warnings, 0),
      warns: row.warningsList || row.Warns || [],
      lastFanCommand: row.lastFanCommand || row.LastFanCommand || row.fanStatus || "Unknown",
      location: row.location || row.Location || `R${arrayIndex}-Rack${stringIndex}`,
      ipAddress: row.ipAddress || row.IpAddress || row.IPAddress || ipInfo?.ip || "Unknown",
      entityToken: row.entityToken || row.EntityToken || row.IdentityToken || ipInfo?.token || "N/A",
    };
  });
}

function computeBrokerParitySummary(brokerRows: NormalizedStringRow[], legacyRows: NormalizedStringRow[]): BrokerParitySummary {
  const toMap = (rows: NormalizedStringRow[]) => {
    const m = new Map<string, NormalizedStringRow>();
    rows.forEach((row) => {
      m.set(row.stringKey, row);
    });
    return m;
  };

  const brokerMap = toMap(brokerRows);
  const legacyMap = toMap(legacyRows);
  const sharedKeys = [...brokerMap.keys()].filter((key) => legacyMap.has(key));

  const representativeFieldEquality = {
    connectionState: sharedKeys.every((key) => brokerMap.get(key)?.connectionState === legacyMap.get(key)?.connectionState),
    soc: sharedKeys.every((key) => brokerMap.get(key)?.soc === legacyMap.get(key)?.soc),
    measuredVoltage: sharedKeys.every((key) => brokerMap.get(key)?.measuredVoltage === legacyMap.get(key)?.measuredVoltage),
    maxCellTemp: sharedKeys.every((key) => brokerMap.get(key)?.maxCellTemp === legacyMap.get(key)?.maxCellTemp),
  };

  return {
    brokerOutputCount: brokerRows.length,
    legacyOutputCount: legacyRows.length,
    brokerUniqueStringKeyCount: brokerMap.size,
    legacyUniqueStringKeyCount: legacyMap.size,
    representativeFieldEquality,
  };
}

function getLegacyRawRows(rawStringsWrapper: LocalStringsMetaWrapper, blockWrapper: LocalStringsMetaWrapper, snapshot: any): { rawData: any[]; metaWrapper: LocalStringsMetaWrapper } {
  const snapshotRawStrings = Array.isArray(snapshot?.rawSources?.strings) ? snapshot.rawSources.strings : [];

  let rawData: any[] = [];
  let metaWrapper = rawStringsWrapper;
  if (snapshotRawStrings.length > 0) {
    rawData = snapshotRawStrings;
  } else if (rawStringsWrapper.data && rawStringsWrapper.data.length > 0) {
    rawData = rawStringsWrapper.data;
  } else {
    rawData = (blockWrapper as any)?.data?.strings || [];
    metaWrapper = blockWrapper;
  }

  if (!hasUsableStringIdentity(rawData)) {
    const snapRows = Array.isArray(snapshot?.rawSources?.strings) ? snapshot.rawSources.strings : [];
    if (hasUsableStringIdentity(snapRows)) {
      rawData = snapRows;
      metaWrapper = rawStringsWrapper;
    }
  }

  return { rawData, metaWrapper };
}

function getBrokerRawRowsFromSnapshot(snapshot: any): { rawData: any[]; authority: any | null } {
  const authority = snapshot?.authorities?.["string-telemetry"] || null;
  const stringRows = snapshot?.unified?.stringTelemetry?.rows;
  const rawRows = Array.isArray(stringRows)
    ? stringRows.map((row: any) => row?.raw ?? row).filter((row: any) => !!row)
    : [];

  return { rawData: rawRows, authority };
}

export function getStringsTelemetryBroker() {
  return getTelemetryBroker();
}

export async function buildLocalStringsResponse(args: BuildLocalStringsResponseArgs): Promise<{ response: any; parity: BrokerParitySummary | null; usingBroker: boolean }> {
  const { rawStringsWrapper, blockWrapper, ipMapWrapper, snapshot, forceLegacy = false, disableBroker = false, brokerSnapshot } = args;

  const ipMap = Array.isArray(ipMapWrapper?.data) ? ipMapWrapper!.data! : [];
  const legacySelection = getLegacyRawRows(rawStringsWrapper, blockWrapper, snapshot);
  const legacyRows = normalizeRows(legacySelection.rawData, ipMap, legacySelection.metaWrapper);

  let selectedRawRows = legacySelection.rawData;
  let selectedMeta = legacySelection.metaWrapper;
  let parity: BrokerParitySummary | null = null;
  let usingBroker = false;

  if (!forceLegacy && !disableBroker) {
    try {
      const bSnapshot = brokerSnapshot ?? await collectTelemetrySnapshot();
      const { rawData: brokerRawRows, authority } = getBrokerRawRowsFromSnapshot(bSnapshot);
      const brokerRows = normalizeRows(brokerRawRows, ipMap, rawStringsWrapper);
      parity = computeBrokerParitySummary(brokerRows, legacyRows);

      const brokerStale = Boolean(authority?.stale);
      const brokerFallbackUsed = Boolean(authority?.fallbackUsed);
      const brokerUsable = hasUsableStringIdentity(brokerRawRows);

      if (brokerUsable && !brokerStale && !brokerFallbackUsed) {
        selectedRawRows = brokerRawRows;
        selectedMeta = rawStringsWrapper;
        usingBroker = true;
      }
    } catch {
      // Preserve route behavior by silently rolling back to legacy source.
    }
  }

  const normalizedRows = normalizeRows(selectedRawRows, ipMap, selectedMeta);
  const response = {
    source: selectedMeta.source,
    staleData: selectedMeta.staleData,
    lastUpdated: selectedMeta.lastUpdated,
    activeEmsBaseUrl: selectedMeta.activeEmsBaseUrl,
    activeProfileName: selectedMeta.activeProfileName,
    activeProfileId: selectedMeta.activeProfileId,
    stationCode: selectedMeta.stationCode,
    blockIndex: selectedMeta.blockIndex,
    lastError: selectedMeta.lastError,
    cacheProfileId: selectedMeta.cacheProfileId,
    cacheEmsBaseUrl: selectedMeta.cacheEmsBaseUrl,
    cacheCreatedAt: selectedMeta.cacheCreatedAt,
    cacheLastUpdatedAt: selectedMeta.cacheLastUpdatedAt,
    data: normalizedRows,
  };

  return { response, parity, usingBroker };
}

export { computeBrokerParitySummary, normalizeRows as normalizeLocalStringRows };
