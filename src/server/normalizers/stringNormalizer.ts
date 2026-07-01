import { parseNullableBool } from "../../lib/nullableBool";
import {
  getNullableCommunicating,
  getNullableInRotation,
  getNullableBothContactorsClosed,
  classifyStringOperationalState
} from "../../lib/stringClassifier";
import { resolvePrioritizedContactors } from "./stringContactorResolver";

export interface CanonicalStringRow {
  id: string;
  arrayNumber: number;
  stringNumber: number;
  stringKey: string;
  arrayIndex: number;
  stringIndex: number;

  communicating: boolean | null;
  badReport: boolean | null;
  inRotation: boolean | null;
  outRotation: boolean | null;

  positiveContactorClosed: boolean | null;
  negativeContactorClosed: boolean | null;
  bothContactorsClosed: boolean | null;
  contactorsCloseExpected: boolean | null;
  commandMatchesContactors: boolean | null;
  recloseCount: number | null;

  operationalBucket: "online" | "nearline" | "offline" | "notCommunicating" | "unknown";
  bucket: "online" | "nearline" | "offline" | "notCommunicating" | "unknown";
  bucketReason: string;
  bucketSource: "canonical-string-classifier";
  rawBucket: any;

  measuredVoltageVdc: number | null;
  calculatedVoltageVdc: number | null;
  busVoltageVdc: number | null;
  stackVoltageVdc: number | null;

  currentA: number | null;
  powerKw: number | null;
  socPct: number | null;
  ampHours: number | null;
  storedKWh: number | null;

  minCellVoltageMv: number | null;
  avgCellVoltageMv: number | null;
  maxCellVoltageMv: number | null;
  cellVoltageDeltaMv: number | null;

  minCellTempC: number | null;
  avgCellTempC: number | null;
  maxCellTempC: number | null;
  cellTempDeltaC: number | null;

  warningCount: number;
  alarmCount: number;
  warnings: any[];
  alarms: any[];

  sourcePath: string;
  sourcePriority: number;
  sourceTimestampUtc: string;
  raw: any;

  // Compatibility fields
  measuredVoltage: number | null;
  calculatedVoltage: number | null;
  busVoltage: number | null;
  minCellVoltage: number | null;
  maxCellVoltage: number | null;
  avgCellVoltage: number | null;
  minCellTemperature: number | null;
  maxCellTemperature: number | null;
  avgCellTemperature: number | null;
  contactorClosed: boolean | null;
  contactorsClosed: boolean | null;

  // Custom resolved output fields
  operationalState?: string;
  stringConnectionState?: string | null;
  stringContactorState?: string | null;
  contactorStatus?: string | null;

  // Nested structures
  identity: any;
  communication: any;
  rotation: any;
  contactors: any;
  electrical: any;
  health: any;
  sourceDebug: any;
}

export function normalizeCellVoltageMv(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Values like 3.272 are volts-per-cell and should become 3272 mV.
  if (n > 0 && n < 10) return Math.round(n * 1000);
  // Values like 3272 are already mV.
  if (n >= 1000 && n <= 5000) return Math.round(n);
  // Values like 3272000 are accidentally over-scaled display artifacts.
  // Convert back to mV when clearly over-scaled.
  if (n >= 1000000 && n <= 5000000) return Math.round(n / 1000);
  return Math.round(n);
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeStringRow(rawRow: any, context?: any): CanonicalStringRow {
  if (!rawRow) {
    throw new Error("Cannot normalize null rawRow in normalizeStringRow");
  }

  // Get raw properties with priority over case-insensitivity
  let arrayNumber = num(rawRow.arrayNumber ?? rawRow.arrayIndex ?? rawRow.array ?? rawRow.ArrayNumber ?? rawRow.ArrayIndex) ?? context?.arrayNumber ?? 0;
  let stringNumber = num(rawRow.stringNumber ?? rawRow.stringIndex ?? rawRow.string ?? rawRow.StringNumber ?? rawRow.StringIndex) ?? context?.stringNumber ?? 0;

  // Try parsing from stringKey/id if index/number are not available or are 0
  if (arrayNumber === 0 || stringNumber === 0) {
    const keyStr = rawRow.stringKey ?? rawRow.id ?? "";
    const m = keyStr.match(/^A([1-8])[-_]S([0-9]+)/i);
    if (m) {
      if (arrayNumber === 0) arrayNumber = parseInt(m[1], 10);
      if (stringNumber === 0) stringNumber = parseInt(m[2], 10);
    }
  }

  const id = rawRow.id || `A${arrayNumber}-S${stringNumber}`;
  const stringKey = rawRow.stringKey || `A${arrayNumber}-S${stringNumber}`;

  // Communicating baseline
  const communicating = getNullableCommunicating(rawRow);

  // Rotation baseline
  const inRotation = getNullableInRotation(rawRow);
  const outRotation = inRotation === null ? null : !inRotation;

  // Contactors
  const contactorRes = resolvePrioritizedContactors(arrayNumber, stringNumber, rawRow);
  const positiveContactorClosed = contactorRes.positiveContactorClosed;
  const negativeContactorClosed = contactorRes.negativeContactorClosed;
  const bothContactorsClosed = contactorRes.bothContactorsClosed;
  const contactorFeedbackKnown = (positiveContactorClosed !== null || negativeContactorClosed !== null || bothContactorsClosed !== null);
  const contactorsCloseExpected = contactorRes.contactorsCloseExpected;

  // Connection State Overrides based on prioritized contactorRes
  let finalComm = communicating;
  if (contactorRes.stringConnectionState) {
    const s = contactorRes.stringConnectionState.toUpperCase().trim();
    if (s === "ONLINE" || s === "CONNECTED" || s === "TRUE") {
      finalComm = true;
    } else if (s === "OFFLINE" || s === "DISCONNECTED" || s === "FALSE") {
      finalComm = false;
    }
  }

  // Rotation Overrides based on prioritized contactorRes
  // If contactors are closed, we must be in rotation!
  let finalInRotation = inRotation;
  if (bothContactorsClosed === true) {
    finalInRotation = true;
  }
  const finalOutRotation = finalInRotation === null ? null : !finalInRotation;

  let commandMatchesContactors: boolean | null = null;
  if (contactorsCloseExpected === true && bothContactorsClosed === true) {
    commandMatchesContactors = true;
  } else if (contactorsCloseExpected === false && bothContactorsClosed === false) {
    commandMatchesContactors = true;
  } else if (typeof contactorsCloseExpected === "boolean" && typeof bothContactorsClosed === "boolean") {
    commandMatchesContactors = false;
  }

  const badReport = rawRow.badReport !== undefined ? parseNullableBool(rawRow.badReport) : false;
  const recloseCount = num(rawRow.RecloseCount ?? rawRow.recloseCount ?? null);

  // Build corrected Row with prioritized fields for stable classification
  const correctedRow = {
    ...rawRow,
    communicating: finalComm,
    inRotation: finalInRotation,
    outRotation: finalOutRotation,
    positiveContactorClosed,
    negativeContactorClosed,
    bothContactorsClosed,
    contactorsClosed: bothContactorsClosed,
    contactorClosed: bothContactorsClosed,
    contactorsCloseExpected
  };

  // String classification rules
  let operationalBucket = rawRow.bucket ?? rawRow.operationalBucket;
  let bucketReason = rawRow.bucketReason;
  if (rawRow.classificationSource !== "stable-canonical-string-state" || !operationalBucket) {
    const classification = classifyStringOperationalState(correctedRow);
    operationalBucket = classification.bucket;
    bucketReason = classification.reason;
  }

  const rawBucket = rawRow.bucket ?? rawRow.operationalBucket ?? null;

  // Voltage and power measurements
  const measuredVoltageVdc = num(rawRow.measuredVoltageVdc ?? rawRow.MeasuredStringVoltage ?? rawRow.measuredStringVoltage ?? rawRow.measuredVoltage ?? rawRow.voltageMeasured ?? rawRow.voltageMeas);
  const calculatedVoltageVdc = num(rawRow.calculatedVoltageVdc ?? rawRow.CalculatedStringVoltage ?? rawRow.calculatedStringVoltage ?? rawRow.calculatedVoltage ?? rawRow.voltageCalculated ?? rawRow.voltageCalc);
  const busVoltageVdc = num(rawRow.busVoltageVdc ?? rawRow.DcBusVoltage ?? rawRow.dcBusVoltage ?? rawRow.DcBusVolt ?? rawRow.dcBusVolt ?? rawRow.busVoltage ?? rawRow.voltageBus);
  const stackVoltageVdc = num(rawRow.stackVoltageVdc) ?? (measuredVoltageVdc !== null
      ? measuredVoltageVdc
      : (calculatedVoltageVdc !== null
          ? calculatedVoltageVdc
          : (busVoltageVdc !== null ? busVoltageVdc : null)));

  const currentA = num(rawRow.currentA ?? rawRow.StringCurrent ?? rawRow.stringCurrent ?? rawRow.CtCurrent1 ?? rawRow.ctCurrent1 ?? rawRow.amps ?? rawRow.current ?? rawRow.Amps);
  const powerKw = num(rawRow.powerKw ?? rawRow.KW ?? rawRow.kw ?? rawRow.PowerKW ?? rawRow.powerKw ?? rawRow.power_kw ?? rawRow.measuredKw);
  const socPct = num(rawRow.socPct ?? rawRow.Soc ?? rawRow.soc);
  const ampHours = num(rawRow.ampHours ?? rawRow.Ah ?? rawRow.ah ?? rawRow.CapacityAh ?? rawRow.capacityAh);
  const storedKWh = num(rawRow.storedKWh ?? rawRow.kWh ?? rawRow.kwh ?? rawRow.KWh);

  // Cell voltages
  const minCellVoltageMv = normalizeCellVoltageMv(rawRow.minCellVoltageMv ?? rawRow.minCellVoltage ?? rawRow.MinCellGroupVoltage ?? rawRow.minCellGroupVoltage ?? rawRow.cellVoltageMin);
  const maxCellVoltageMv = normalizeCellVoltageMv(rawRow.maxCellVoltageMv ?? rawRow.maxCellVoltage ?? rawRow.MaxCellGroupVoltage ?? rawRow.maxCellGroupVoltage ?? rawRow.cellVoltageMax);
  const avgCellVoltageMv = normalizeCellVoltageMv(rawRow.avgCellVoltageMv ?? rawRow.avgCellVoltage ?? rawRow.AvgCellGroupVoltage ?? rawRow.avgCellGroupVoltage ?? rawRow.cellVoltageAvg);
  const cellVoltageDeltaMv = (maxCellVoltageMv !== null && minCellVoltageMv !== null)
      ? (maxCellVoltageMv - minCellVoltageMv)
      : null;

  // Cell temperatures (divide by 10 when raw is greater than 90)
  function parseTemp(v: any): number | null {
    const val = num(v);
    if (val === null) return null;
    return val > 90 ? val / 10 : val;
  }
  const minCellTempC = parseTemp(rawRow.minCellTempC ?? rawRow.minCellTemperature ?? rawRow.MinCellGroupTemp ?? rawRow.minCellGroupTemp ?? rawRow.minCellTemp ?? rawRow.cellTempMin);
  const maxCellTempC = parseTemp(rawRow.maxCellTempC ?? rawRow.maxCellTemperature ?? rawRow.MaxCellGroupTemp ?? rawRow.maxCellGroupTemp ?? rawRow.maxCellTemp ?? rawRow.cellTempMax);
  const avgCellTempC = parseTemp(rawRow.avgCellTempC ?? rawRow.avgCellTemperature ?? rawRow.AvgCellGroupTemp ?? rawRow.avgCellGroupTemp ?? rawRow.avgCellTemp ?? rawRow.cellTempAvg);
  const cellTempDeltaC = (maxCellTempC !== null && minCellTempC !== null)
      ? Number((maxCellTempC - minCellTempC).toFixed(1))
      : null;

  const warningCount = num(rawRow.warningCount ?? rawRow.WarningCount ?? 0) ?? 0;
  const alarmCount = num(rawRow.alarmCount ?? rawRow.AlarmCount ?? 0) ?? 0;
  const warnings = Array.isArray(rawRow.warnings) ? rawRow.warnings : [];
  const alarms = Array.isArray(rawRow.alarms) ? rawRow.alarms : [];

  const sourcePath = rawRow.sourcePath ?? context?.sourcePath ?? "unknown";
  const sourcePriority = num(rawRow.sourcePriority) ?? context?.sourcePriority ?? 0;
  
  function safeParseDate(val: any): string {
      if (!val) return new Date().toISOString();
      const ts = new Date(val);
      if (isNaN(ts.getTime())) {
          return new Date().toISOString();
      }
      return ts.toISOString();
  }
  const sourceTimestampUtc = safeParseDate(rawRow.sourceTimestampUtc ?? rawRow.TimestampUtc ?? rawRow.timestampUtc ?? rawRow.Timestamp ?? rawRow.timestamp ?? rawRow.DateTime ?? rawRow.datetime);

  const localEsNumber = Math.ceil(stringNumber / 2);
  const pairedStringNumber = (stringNumber % 2 === 1) ? (stringNumber + 1) : (stringNumber - 1);
  const featherLastOctet = 10 + (localEsNumber - 1) * 5;
  const featherIp = `10.0.${arrayNumber}.${featherLastOctet}`;

  // Nested structured state
  const identity = {
    siteId: rawRow.identity?.siteId ?? context?.siteId ?? null,
    stationCode: rawRow.identity?.stationCode ?? context?.stationCode ?? null,
    blockIndex: num(rawRow.identity?.blockIndex ?? context?.blockIndex ?? rawRow.blockIndex),
    arrayIndex: arrayNumber,
    stringNumber: stringNumber,
    stringKey: `array:${arrayNumber}:string:${stringNumber}`,
    label: `Array ${arrayNumber} ES${localEsNumber} String ${stringNumber}`,
    displayName: `Array ${arrayNumber} String ${stringNumber}`,
    localEsNumber,
    pairedStringNumber,
    featherIp,
    sourceStringId: rawRow.identity?.sourceStringId ?? rawRow.id ?? null,
    sourcePath
  };

  const communication = {
    rawValue: rawRow.communicating ?? rawRow.StringConnectionState ?? rawRow.stringConnectionState ?? rawRow.connectionState ?? null,
    normalizedState: finalComm === null ? "UNKNOWN" : (finalComm ? "COMMUNICATING" : "NOT COMMUNICATING"),
    communicating: finalComm,
    source: rawRow.communicating !== undefined ? "direct" : "derived",
    sourcePath,
    confidence: finalComm === null ? "LOW" : "HIGH",
    updatedAt: sourceTimestampUtc
  };

  const rotation = {
    rawValue: rawRow.inRotation ?? rawRow.outRotation ?? rawRow.outOfRotation ?? null,
    normalizedState: finalInRotation === null ? "UNKNOWN" : (finalInRotation ? "IN ROTATION" : "OUT OF ROTATION"),
    inRotation: finalInRotation,
    outOfRotation: finalOutRotation,
    source: rawRow.inRotation !== undefined || rawRow.outRotation !== undefined ? "direct" : "derived",
    sourcePath,
    confidence: finalInRotation === null ? "LOW" : "HIGH",
    updatedAt: sourceTimestampUtc
  };

  const contactors = {
    positiveContactorClosed,
    negativeContactorClosed,
    bothContactorsClosed,
    contactorFeedbackKnown,
    expectedClosed: contactorsCloseExpected,
    commandMatchesContactors,
    recloseCount,
    source: positiveContactorClosed !== null ? "direct" : "derived",
    sourcePath,
    updatedAt: sourceTimestampUtc
  };

  const electrical = {
    voltage: stackVoltageVdc,
    current: currentA,
    soc: socPct,
    soh: null,
    maxCellVoltage: maxCellVoltageMv,
    minCellVoltage: minCellVoltageMv,
    avgCellVoltage: avgCellVoltageMv,
    maxCellTemp: maxCellTempC,
    minCellTemp: minCellTempC,
    avgCellTemp: avgCellTempC,
    source: stackVoltageVdc !== null ? "direct" : "derived",
    sourcePath,
    updatedAt: sourceTimestampUtc
  };

  const severity = alarmCount > 0 ? "ALARM" : (warningCount > 0 ? "WARNING" : "NORMAL");
  const healthy = (alarmCount === 0 && operationalBucket !== "notCommunicating" && operationalBucket !== "unknown");

  const health = {
    operationalBucket,
    severity,
    healthy,
    warningCount,
    faultCount: alarmCount,
    activeFaults: alarms,
    activeWarnings: warnings,
    findings: []
  };

  const sourceDebug = {
    primarySource: sourcePath,
    sourcePriorityUsed: sourcePriority,
    sourcePaths: [sourcePath],
    rawCandidates: [],
    conflicts: [],
    staleSources: [],
    generatedAt: new Date().toISOString(),
    canonicalKey: `array:${arrayNumber}:string:${stringNumber}`,
    rawCommunicationValue: rawRow.communicating ?? null,
    rawRotationValue: rawRow.inRotation ?? rawRow.outRotation ?? null,
    rawPositiveContactorValue: rawRow.positiveContactorClosed ?? null,
    rawNegativeContactorValue: rawRow.negativeContactorClosed ?? null,
    normalizedCommunication: finalComm,
    normalizedRotation: finalInRotation,
    normalizedContactors: bothContactorsClosed,
    operationalBucket,
    classifierInputs: {
      communicating: finalComm,
      inRotation: finalInRotation,
      contactorsClosed: bothContactorsClosed
    },
    classifierReason: bucketReason,
    sourceFreshnessMs: null,
    contactorResolution: contactorRes.sourceDebug.contactorResolution
  };

  // Derive explicit strings fields
  let operationalState = "UNKNOWN";
  if (operationalBucket === "online") {
    if (alarmCount > 0) operationalState = "ALARM";
    else if (warningCount > 0) operationalState = "WARNING";
    else operationalState = "NORMAL";
  } else if (operationalBucket === "nearline") {
    if (alarmCount > 0) operationalState = "ALARM";
    else if (warningCount > 0) operationalState = "WARNING";
    else operationalState = "NEARLINE";
  } else if (operationalBucket === "offline") {
    operationalState = "OFFLINE";
  } else if (operationalBucket === "notCommunicating") {
    operationalState = "NOT_COMMUNICATING";
  } else {
    operationalState = "UNKNOWN";
  }

  const stringConnectionState = finalComm === true ? "ONLINE" : (finalComm === false ? "OFFLINE" : "UNKNOWN");
  const stringContactorState = contactorRes.stringContactorState ?? (bothContactorsClosed === true ? "CLOSED" : (bothContactorsClosed === false ? "OPEN" : "UNKNOWN"));
  const contactorStatus = bothContactorsClosed === true ? "CLOSED" : (bothContactorsClosed === false ? "OPEN" : "UNKNOWN");

  return {
    id,
    arrayNumber,
    stringNumber,
    stringKey,
    arrayIndex: arrayNumber,
    stringIndex: stringNumber,

    communicating: finalComm,
    badReport,
    inRotation: finalInRotation,
    outRotation: finalOutRotation,

    positiveContactorClosed,
    negativeContactorClosed,
    bothContactorsClosed,
    contactorsCloseExpected,
    commandMatchesContactors,
    recloseCount,

    operationalBucket,
    bucket: operationalBucket,
    bucketReason,
    bucketSource: "canonical-string-classifier",
    rawBucket,

    measuredVoltageVdc,
    calculatedVoltageVdc,
    busVoltageVdc,
    stackVoltageVdc,

    currentA,
    powerKw,
    socPct,
    ampHours,
    storedKWh,

    minCellVoltageMv,
    avgCellVoltageMv,
    maxCellVoltageMv,
    cellVoltageDeltaMv,

    minCellTempC,
    avgCellTempC,
    maxCellTempC,
    cellTempDeltaC,

    warningCount,
    alarmCount,
    warnings,
    alarms,

    sourcePath,
    sourcePriority,
    sourceTimestampUtc,
    raw: rawRow,

    // Compatibility fields
    measuredVoltage: measuredVoltageVdc,
    calculatedVoltage: calculatedVoltageVdc,
    busVoltage: busVoltageVdc,
    minCellVoltage: minCellVoltageMv !== null ? minCellVoltageMv / 1000 : null,
    maxCellVoltage: maxCellVoltageMv !== null ? maxCellVoltageMv / 1000 : null,
    avgCellVoltage: avgCellVoltageMv !== null ? avgCellVoltageMv / 1000 : null,
    minCellTemperature: minCellTempC,
    maxCellTemperature: maxCellTempC,
    avgCellTemperature: avgCellTempC,
    contactorClosed: bothContactorsClosed,
    contactorsClosed: bothContactorsClosed,

    // Custom resolved fields
    operationalState,
    stringConnectionState,
    stringContactorState,
    contactorStatus,

    // Nested structures
    identity,
    communication,
    rotation,
    contactors,
    electrical,
    health,
    sourceDebug
  };
}
