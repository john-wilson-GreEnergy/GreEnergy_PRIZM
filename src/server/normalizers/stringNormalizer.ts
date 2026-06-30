import { parseNullableBool } from "../../lib/nullableBool";

export interface CanonicalStringRow {
  id: string;
  arrayNumber: number;
  stringNumber: number;
  stringKey: string;

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

  // Communicating
  let communicating: boolean | null = null;
  if (rawRow.communicating !== undefined && rawRow.communicating !== null && rawRow.communicating !== "") {
    communicating = parseNullableBool(rawRow.communicating);
  } else if (rawRow.lossComms !== undefined && rawRow.lossComms !== null && rawRow.lossComms !== "") {
    const lc = parseNullableBool(rawRow.lossComms);
    if (lc !== null) communicating = !lc;
  } else if (rawRow.LossComms !== undefined && rawRow.LossComms !== null && rawRow.LossComms !== "") {
    const lc = parseNullableBool(rawRow.LossComms);
    if (lc !== null) communicating = !lc;
  } else if (rawRow.loss_comms !== undefined && rawRow.loss_comms !== null && rawRow.loss_comms !== "") {
    const lc = parseNullableBool(rawRow.loss_comms);
    if (lc !== null) communicating = !lc;
  } else {
    const connectionState = String(rawRow.StringConnectionState ?? rawRow.stringConnectionState ?? rawRow.connectionState ?? '').toUpperCase();
    if (connectionState) {
      if (connectionState.includes('LOSS') || connectionState.includes('NO_COMM') || connectionState.includes('NOT_COMM') || connectionState.includes('OFFLINE') || connectionState.includes('DISCONNECTED')) {
        communicating = false;
      } else if (connectionState.includes('ONLINE') || connectionState.includes('CONNECTED') || connectionState.includes('OK')) {
        communicating = true;
      }
    }
  }

  // Rotation
  let outRotation: boolean | null = null;
  if (rawRow.OutRotation !== undefined && rawRow.OutRotation !== null && rawRow.OutRotation !== "") {
    outRotation = parseNullableBool(rawRow.OutRotation);
  } else if (rawRow.outRotation !== undefined && rawRow.outRotation !== null && rawRow.outRotation !== "") {
    outRotation = parseNullableBool(rawRow.outRotation);
  } else if (rawRow.outOfRotation !== undefined && rawRow.outOfRotation !== null && rawRow.outOfRotation !== "") {
    outRotation = parseNullableBool(rawRow.outOfRotation);
  } else if (rawRow.OutOfRotation !== undefined && rawRow.OutOfRotation !== null && rawRow.OutOfRotation !== "") {
    outRotation = parseNullableBool(rawRow.OutOfRotation);
  } else if (rawRow.out_rotation !== undefined && rawRow.out_rotation !== null && rawRow.out_rotation !== "") {
    outRotation = parseNullableBool(rawRow.out_rotation);
  } else if (rawRow.outrotation !== undefined && rawRow.outrotation !== null && rawRow.outrotation !== "") {
    outRotation = parseNullableBool(rawRow.outrotation);
  } else if (typeof rawRow.rotation === 'string') {
    const rot = rawRow.rotation.toUpperCase();
    if (rot.includes('OUT')) {
      outRotation = true;
    } else if (rot.includes('IN')) {
      outRotation = false;
    }
  }

  let inRotation: boolean | null = null;
  if (rawRow.InRotation !== undefined && rawRow.InRotation !== null && rawRow.InRotation !== "") {
    inRotation = parseNullableBool(rawRow.InRotation);
  } else if (rawRow.inRotation !== undefined && rawRow.inRotation !== null && rawRow.inRotation !== "") {
    inRotation = parseNullableBool(rawRow.inRotation);
  } else if (outRotation !== null) {
    inRotation = !outRotation;
  }

  if (outRotation === null && inRotation !== null) {
    outRotation = !inRotation;
  }

  // Contactors
  let positiveContactorClosed: boolean | null = null;
  if (rawRow.PositiveContactorClosed !== undefined && rawRow.PositiveContactorClosed !== null && rawRow.PositiveContactorClosed !== "") {
    positiveContactorClosed = parseNullableBool(rawRow.PositiveContactorClosed);
  } else if (rawRow.positiveContactorClosed !== undefined && rawRow.positiveContactorClosed !== null && rawRow.positiveContactorClosed !== "") {
    positiveContactorClosed = parseNullableBool(rawRow.positiveContactorClosed);
  } else if (rawRow.positive_contactor_closed !== undefined && rawRow.positive_contactor_closed !== null && rawRow.positive_contactor_closed !== "") {
    positiveContactorClosed = parseNullableBool(rawRow.positive_contactor_closed);
  } else if (rawRow.positivecontactorclosed !== undefined && rawRow.positivecontactorclosed !== null && rawRow.positivecontactorclosed !== "") {
    positiveContactorClosed = parseNullableBool(rawRow.positivecontactorclosed);
  }

  let negativeContactorClosed: boolean | null = null;
  if (rawRow.NegativeContactorClosed !== undefined && rawRow.NegativeContactorClosed !== null && rawRow.NegativeContactorClosed !== "") {
    negativeContactorClosed = parseNullableBool(rawRow.NegativeContactorClosed);
  } else if (rawRow.negativeContactorClosed !== undefined && rawRow.negativeContactorClosed !== null && rawRow.negativeContactorClosed !== "") {
    negativeContactorClosed = parseNullableBool(rawRow.negativeContactorClosed);
  } else if (rawRow.negative_contactor_closed !== undefined && rawRow.negative_contactor_closed !== null && rawRow.negative_contactor_closed !== "") {
    negativeContactorClosed = parseNullableBool(rawRow.negative_contactor_closed);
  } else if (rawRow.negativecontactorclosed !== undefined && rawRow.negativecontactorclosed !== null && rawRow.negativecontactorclosed !== "") {
    negativeContactorClosed = parseNullableBool(rawRow.negativecontactorclosed);
  }

  let bothContactorsClosed: boolean | null = null;
  if (rawRow.BothContactorsClosed !== undefined && rawRow.BothContactorsClosed !== null && rawRow.BothContactorsClosed !== "") {
    bothContactorsClosed = parseNullableBool(rawRow.BothContactorsClosed);
  } else if (rawRow.bothContactorsClosed !== undefined && rawRow.bothContactorsClosed !== null && rawRow.bothContactorsClosed !== "") {
    bothContactorsClosed = parseNullableBool(rawRow.bothContactorsClosed);
  } else if (positiveContactorClosed !== null && negativeContactorClosed !== null) {
    bothContactorsClosed = positiveContactorClosed && negativeContactorClosed;
  } else if (rawRow.ContactorsClosed !== undefined && rawRow.ContactorsClosed !== null && rawRow.ContactorsClosed !== "") {
    bothContactorsClosed = parseNullableBool(rawRow.ContactorsClosed);
  } else if (rawRow.contactorsClosed !== undefined && rawRow.contactorsClosed !== null && rawRow.contactorsClosed !== "") {
    bothContactorsClosed = parseNullableBool(rawRow.contactorsClosed);
  } else if (rawRow.contactorClosed !== undefined && rawRow.contactorClosed !== null && rawRow.contactorClosed !== "") {
    bothContactorsClosed = parseNullableBool(rawRow.contactorClosed);
  } else if (typeof rawRow.contactorStatus === 'string') {
    const status = rawRow.contactorStatus.toUpperCase();
    if (status === 'CLOSED') {
      bothContactorsClosed = true;
    } else if (status === 'OPEN') {
      bothContactorsClosed = false;
    }
  } else if (typeof rawRow.contactor_closed === 'boolean') {
    bothContactorsClosed = rawRow.contactor_closed;
  }

  let contactorsCloseExpected: boolean | null = null;
  if (rawRow.ContactorsCloseExpected !== undefined && rawRow.ContactorsCloseExpected !== null && rawRow.ContactorsCloseExpected !== "") {
    contactorsCloseExpected = parseNullableBool(rawRow.ContactorsCloseExpected);
  } else if (rawRow.contactorsCloseExpected !== undefined && rawRow.contactorsCloseExpected !== null && rawRow.contactorsCloseExpected !== "") {
    contactorsCloseExpected = parseNullableBool(rawRow.contactorsCloseExpected);
  } else if (rawRow.CloseExpected !== undefined && rawRow.CloseExpected !== null && rawRow.CloseExpected !== "") {
    contactorsCloseExpected = parseNullableBool(rawRow.CloseExpected);
  } else if (rawRow.closeExpected !== undefined && rawRow.closeExpected !== null && rawRow.closeExpected !== "") {
    contactorsCloseExpected = parseNullableBool(rawRow.closeExpected);
  }

  let commandMatchesContactors: boolean | null = null;
  if (contactorsCloseExpected !== null && bothContactorsClosed !== null) {
    commandMatchesContactors = contactorsCloseExpected === bothContactorsClosed;
  }

  const badReport = rawRow.badReport !== undefined ? parseNullableBool(rawRow.badReport) : false;
  const recloseCount = num(rawRow.RecloseCount ?? rawRow.recloseCount ?? null);

  // String classification rules
  let operationalBucket: "online" | "nearline" | "offline" | "notCommunicating" | "unknown" = "unknown";
  let bucketReason = "";

  if (communicating === false) {
    operationalBucket = "notCommunicating";
    bucketReason = "not_communicating";
  } else if (communicating === true) {
    if (inRotation === false) {
      operationalBucket = "offline";
      bucketReason = "out_of_rotation";
    } else if (inRotation === true) {
      if (bothContactorsClosed === true) {
        operationalBucket = "online";
        bucketReason = "communicating_in_rotation_contactors_closed";
      } else if (bothContactorsClosed === false) {
        operationalBucket = "nearline";
        bucketReason = "communicating_in_rotation_contactors_open";
      } else {
        if (context?.compatMissingContactorAsNearline) {
          operationalBucket = "nearline";
          bucketReason = "communicating_in_rotation_contactors_open_compat";
        } else {
          operationalBucket = "unknown";
          bucketReason = "missing_contactor_feedback";
        }
      }
    } else {
      operationalBucket = "unknown";
      bucketReason = "missing_rotation_feedback";
    }
  } else {
    operationalBucket = "unknown";
    bucketReason = "missing_communication_feedback";
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
  const minCellVoltageMv = normalizeCellVoltageMv(rawRow.minCellVoltageMv ?? rawRow.minCellVoltage ?? rawRow.MinCellGroupVoltage ?? rawRow.minCellGroupVoltage);
  const maxCellVoltageMv = normalizeCellVoltageMv(rawRow.maxCellVoltageMv ?? rawRow.maxCellVoltage ?? rawRow.MaxCellGroupVoltage ?? rawRow.maxCellGroupVoltage);
  const avgCellVoltageMv = normalizeCellVoltageMv(rawRow.avgCellVoltageMv ?? rawRow.avgCellVoltage ?? rawRow.AvgCellGroupVoltage ?? rawRow.avgCellGroupVoltage);
  const cellVoltageDeltaMv = (maxCellVoltageMv !== null && minCellVoltageMv !== null)
      ? (maxCellVoltageMv - minCellVoltageMv)
      : null;

  // Cell temperatures (divide by 10 when raw is greater than 90)
  function parseTemp(v: any): number | null {
    const val = num(v);
    if (val === null) return null;
    return val > 90 ? val / 10 : val;
  }
  const minCellTempC = parseTemp(rawRow.minCellTempC ?? rawRow.minCellTemperature ?? rawRow.MinCellGroupTemp ?? rawRow.minCellGroupTemp ?? rawRow.minCellTemp);
  const maxCellTempC = parseTemp(rawRow.maxCellTempC ?? rawRow.maxCellTemperature ?? rawRow.MaxCellGroupTemp ?? rawRow.maxCellGroupTemp ?? rawRow.maxCellTemp);
  const avgCellTempC = parseTemp(rawRow.avgCellTempC ?? rawRow.avgCellTemperature ?? rawRow.AvgCellGroupTemp ?? rawRow.avgCellGroupTemp ?? rawRow.avgCellTemp);
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

  return {
    id,
    arrayNumber,
    stringNumber,
    stringKey,

    communicating,
    badReport,
    inRotation,
    outRotation,

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
    contactorsClosed: bothContactorsClosed
  };
}
