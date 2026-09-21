import fs from "fs";
import path from "path";
import https from "https";
import { getActiveProfile, detectMapAddressOffset, queryModbusRaw, queryModbusReal } from "./modbusProfileManager";

export type PcsSwitchState = "OPEN" | "CLOSED" | "UNKNOWN" | "UNRECOGNIZED";
export type PcsSwitchTelemetry = {
  arrayIndex: number;
  host: string;
  port: number;
  unitId: number;
  capturedAt: string | null;
  durationMs: number | null;
  stale: boolean;
  error: string | null;
  addressOffset: number | null;
  source: "SMA_WEB_PROCESS_DATA" | "SMA_MODBUS" | null;
  inverterOperatingState: string | null;
  inverterOperatingStateRaw: number | null;
  powerOffReason: string | null;
  smaProcessData: Record<string, SmaProcessPoint>;
  dcSwitch1: PcsSwitchState;
  dcSwitch2: PcsSwitchState;
  dcSwitch3: PcsSwitchState;
  acSwitch: PcsSwitchState;
  mvSwitch: PcsSwitchState;
  capacitorSwitch: PcsSwitchState;
  prechargeSwitch: PcsSwitchState;
  dcPrechargeSwitch: PcsSwitchState;
  dcHealth: "OK" | "WARNING" | "ERROR" | "UNKNOWN";
  inverterHealth: "OK" | "WARNING" | "ERROR" | "UNKNOWN";
  transformerHealth: "OK" | "WARNING" | "ERROR" | "UNKNOWN";
  gridHealth: "OK" | "WARNING" | "ERROR" | "UNKNOWN";
  raw: Record<string, number | null>;
};

type SmaProcessPoint = {
  id: number;
  value: number | string | null;
  quality: number | null;
  unitId: number | null;
  timestamp: number | null;
};

type MapRow = {
  fieldType: string;
  address: number;
  size: number;
  name: string;
  value: string;
  type: string;
  scaleRef: string;
  unit: string;
};

export type OperationalModbusSnapshot = {
  available: boolean;
  capturedAt: string | null;
  durationMs: number | null;
  host: string | null;
  port: number | null;
  addressOffset: number | null;
  stale: boolean;
  error: string | null;
  block: Record<string, number | null>;
  pcs: Array<Record<string, number | null> & { arrayIndex: number }>;
  arrays: Array<Record<string, number | null> & { arrayIndex: number }>;
  pcsSwitches: PcsSwitchTelemetry[];
};

let snapshot: OperationalModbusSnapshot = emptySnapshot();
let timer: NodeJS.Timeout | null = null;
let polling = false;
const pcsSwitchRefreshInFlight = new Set<number>();
const pcsSwitchCache = new Map<number, { attemptedAt: number; value: PcsSwitchTelemetry }>();
const PCS_SWITCH_POLL_INTERVAL_MS = Math.max(5_000, Number(process.env.PRIZM_PCS_SWITCH_POLL_MS) || 10_000);
const PCS_SWITCH_STALE_MS = Math.max(20_000, PCS_SWITCH_POLL_INTERVAL_MS * 2);

function emptySnapshot(): OperationalModbusSnapshot {
  return { available: false, capturedAt: null, durationMs: null, host: null, port: null, addressOffset: null, stale: true, error: null, block: {}, pcs: [], arrays: [], pcsSwitches: [] };
}

const SMA_SWITCH_ENUM: Record<number, PcsSwitchState> = { 51: "CLOSED", 311: "OPEN", 973: "UNKNOWN" };
const SMA_OPERATING_STATES = [
  "---", "Unknown", "Bootloader", "Defect", "Init", "Stop", "Error", "Update", "Reset",
  "WaitAC", "ConnectAC", "WaitDC", "ConnectDC", "GridFeed", "FRT", "Standby", "QonDemand",
  "RampDown", "ShutDown", "Self-test", "Ctl", "Vloop", "IOTest", "DCSource", "GridFaultStandby",
  "ChkGri", "Reserve 26", "Reserve 27", "Reserve 28", "GridForm", "AcRampUp", "BatOnly",
  "StopSafe", "HumidityMng"
] as const;
const SMA_POWER_OFF_REASONS = [
  "---", "No Power Off Reason", "Critical error / ProErr active", "Error", "Init: Wait Buffer Voltage",
  "Stop: Key Switch", "Stop: Inverter operating-mode parameter", "Stop: External X440:3",
  "Stop: SCADA, PPC, or Modbus", "Stop: Unspecified", "Stop: Battery System Controller",
  "Standby: SCADA, PPC, or Modbus", "Standby: AC synchronization", "Standby: Low DC Power",
  "Standby: External Grid Error", "Standby: Power Monitoring Module", "Standby: RemRdy parameter",
  "Standby: External X440:7", "Standby: Unspecified", "Standby: Grid Fault", "WaitAC",
  "WaitDC: DC Voltage", "WaitDC: Bender", "WaitDC: DC precharge waiting period", "Self-test active",
  "I/O test active", "Reserve 26", "Low Power Setpoint", "Battery", "Stop: Safe Electrolyzer",
  "Electrolyzer: Open DC Switches", "No license for selected mode"
] as const;
const SMA_EXTENDED_PROCESS_POINTS: Record<string, number> = {
  powerOffReason: 7221, availableActivePowerPu: 7632, availableReactivePowerPu: 7633,
  ratedActivePowerKw: 318, ratedReactivePowerKvar: 319,
  dcVoltageDynamicMaxV: 7272, dcVoltageDynamicMinV: 7273,
  dcCurrentDynamicMaxA: 7274, dcCurrentDynamicMinA: 7275,
  insulationResistanceKOhm: 6644, maxPcbTemperatureC: 6099, maxIgbtTemperatureC: 6100,
  inverterFaultNumber: 823, smaFaultNumber: 927, gridWaitSeconds: 614, errorRemainingSeconds: 7114,
  powerFactor: 404, apparentPowerKva: 401, uptimeSeconds: 4852, communicationFirmwareRaw: 4853,
  acEnergyTodayMwh: 6767, acEnergyYesterdayMwh: 7073, acEnergyTotalMwh: 7118,
  dcEnergyTotalMwh: 7300, dcEnergyTodayMwh: 7302, dcEnergyYesterdayMwh: 9082,
  dcCouplerStatusMask: 3630, batteryStatusMask: 3632, inverterOperatingMode: 329
};
const smaExtendedCache = new Map<string, { attemptedAt: number; value: Record<string, SmaProcessPoint> }>();
const smaExtendedRefreshInFlight = new Set<string>();
const SMA_EXTENDED_POLL_MS = Math.max(30_000, Number(process.env.PRIZM_PCS_EXTENDED_POLL_MS) || 60_000);
const SMA_EXTENDED_STALE_MS = Math.max(120_000, SMA_EXTENDED_POLL_MS * 2);
let smaReadsActive = 0;
const smaReadWaiters: Array<() => void> = [];
const SMA_READ_CONCURRENCY = Math.max(2, Number(process.env.PRIZM_PCS_WEB_CONCURRENCY) || 6);

async function withSmaReadSlot<T>(work: () => Promise<T>): Promise<T> {
  if (smaReadsActive >= SMA_READ_CONCURRENCY) await new Promise<void>((resolve) => smaReadWaiters.push(resolve));
  smaReadsActive++;
  try { return await work(); }
  finally {
    smaReadsActive--;
    smaReadWaiters.shift()?.();
  }
}

function readSmaProcessPoint(host: string, id: number, timeoutMs = 5000): Promise<SmaProcessPoint> {
  return withSmaReadSlot(() => new Promise((resolve, reject) => {
    const body = JSON.stringify({ uniqueId: id });
    const request = https.request({ host, port: 443, path: "/home/getSingleData", method: "POST",
      rejectUnauthorized: false, timeout: timeoutMs,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Accept: "application/json" }
    }, (response) => {
      let payload = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { payload += chunk; });
      response.on("end", () => {
        try {
          if ((response.statusCode || 500) >= 400) throw new Error(`HTTP ${response.statusCode}`);
          const point = JSON.parse(payload)?.data;
          if (!point || Array.isArray(point)) throw new Error("point unavailable");
          resolve({ id, value: point.quality === undefined || point.quality === null || point.quality === 0 ? point.value ?? null : null,
            quality: Number.isFinite(Number(point.quality)) ? Number(point.quality) : null,
            unitId: Number.isFinite(Number(point.unitId)) ? Number(point.unitId) : null,
            timestamp: Number.isFinite(Number(point.timestamp)) ? Number(point.timestamp) : null });
        } catch (error: any) { reject(new Error(`SMA point ${id}: ${error?.message || error}`)); }
      });
    });
    request.on("timeout", () => request.destroy(new Error(`SMA point ${id} timeout`)));
    request.on("error", reject);
    request.end(body);
  }));
}

async function readSmaExtendedProcessData(host: string): Promise<Record<string, SmaProcessPoint>> {
  const cached = smaExtendedCache.get(host);
  if (cached && Date.now() - cached.attemptedAt < SMA_EXTENDED_POLL_MS) return cached.value;
  const entries = await Promise.all(Object.entries(SMA_EXTENDED_PROCESS_POINTS).map(async ([key, id]) => {
    try { return [key, await readSmaProcessPoint(host, id)] as const; }
    catch {
      try { return [key, await readSmaProcessPoint(host, id, 6500)] as const; }
      catch { return [key, { id, value: null, quality: null, unitId: null, timestamp: null }] as const; }
    }
  }));
  const value = Object.fromEntries(entries);
  smaExtendedCache.set(host, { attemptedAt: Date.now(), value });
  return value;
}

function refreshSmaExtendedProcessData(host: string): Record<string, SmaProcessPoint> {
  const cached = smaExtendedCache.get(host);
  if (!smaExtendedRefreshInFlight.has(host) && (!cached || Date.now() - cached.attemptedAt >= SMA_EXTENDED_POLL_MS)) {
    smaExtendedRefreshInFlight.add(host);
    void readSmaExtendedProcessData(host)
      .catch((error: any) => console.warn(`[SMA ${host}] Extended process data refresh failed:`, error?.message || error))
      .finally(() => smaExtendedRefreshInFlight.delete(host));
  }
  return cached && Date.now() - cached.attemptedAt <= SMA_EXTENDED_STALE_MS ? cached.value : {};
}
const decodeSmaEnum = (registers: number[], index: number): number | null =>
  index + 1 < registers.length ? (((registers[index] << 16) | registers[index + 1]) >>> 0) : null;
const switchState = (raw: number | null): PcsSwitchState => raw === null ? "UNKNOWN" : (SMA_SWITCH_ENUM[raw] || "UNRECOGNIZED");

function bitfieldSwitch(value: number, closedBit: number, openBit: number): PcsSwitchState {
  if ((value >>> closedBit) & 1) return "CLOSED";
  if ((value >>> openBit) & 1) return "OPEN";
  return "UNKNOWN";
}

function bitfieldHealth(value: number, baseBit: number): "OK" | "WARNING" | "ERROR" | "UNKNOWN" {
  if ((value >>> (baseBit + 2)) & 1) return "ERROR";
  if ((value >>> (baseBit + 1)) & 1) return "WARNING";
  if ((value >>> baseBit) & 1) return "OK";
  return "UNKNOWN";
}

type SmaAuxiliarySwitchRead = {
  addressOffset: 0 | -1;
  capacitorSwitch: PcsSwitchState;
  prechargeSwitch: PcsSwitchState;
  dcPrechargeSwitch: PcsSwitchState;
  raw: {
    capacitorSwitch: number | null;
    prechargeSwitch: number | null;
    dcPrechargeSwitch: number | null;
  };
};

async function readSmaAuxiliarySwitches(host: string): Promise<SmaAuxiliarySwitchRead> {
  let primary: Awaited<ReturnType<typeof queryModbusRaw>> | null = null;
  let addressOffset: 0 | -1 = 0;
  for (const candidate of [0, -1] as const) {
    try {
      const result = await queryModbusRaw(host, 502, 3, candidate, 56, 14, 1200, 4);
      const first = decodeSmaEnum(result.registers, 0);
      if (first !== null && SMA_SWITCH_ENUM[first]) {
        primary = result;
        addressOffset = candidate;
        break;
      }
    } catch { /* try the documented alternate address basis */ }
  }
  if (!primary) throw new Error("SMA Modbus auxiliary-switch profile is not exposed by this PCS");

  const precharge = await queryModbusRaw(host, 502, 3, addressOffset, 304, 2, 1200, 4);
  const raw = {
    capacitorSwitch: decodeSmaEnum(primary.registers, 10),
    prechargeSwitch: decodeSmaEnum(primary.registers, 12),
    dcPrechargeSwitch: decodeSmaEnum(precharge.registers, 0)
  };
  return {
    addressOffset,
    capacitorSwitch: switchState(raw.capacitorSwitch),
    prechargeSwitch: switchState(raw.prechargeSwitch),
    dcPrechargeSwitch: switchState(raw.dcPrechargeSwitch),
    raw
  };
}

function readSmaDiagramBitfield(host: string, timeoutMs = 4000): Promise<number> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ uniqueId: 6070 });
    const request = https.request({
      host, port: 443, path: "/home/getSingleData", method: "POST", rejectUnauthorized: false,
      timeout: timeoutMs,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Accept: "application/json" }
    }, (response) => {
      let payload = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { payload += chunk; });
      response.on("end", () => {
        if ((response.statusCode || 500) >= 400) return reject(new Error(`SMA web telemetry HTTP ${response.statusCode}`));
        try {
          const parsed = JSON.parse(payload);
          const value = Number(parsed?.data?.value);
          if (!Number.isFinite(value) || parsed?.data?.quality !== 0) throw new Error("SMA diagram bitfield is unavailable or stale");
          resolve(value >>> 0);
        } catch (error: any) { reject(new Error(error?.message || "Invalid SMA web telemetry response")); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("SMA web telemetry timeout")));
    request.on("error", reject);
    request.end(body);
  });
}

function readSmaOperatingState(host: string, timeoutMs = 4000): Promise<{ raw: number; label: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ uniqueId: 332 });
    const request = https.request({
      host, port: 443, path: "/home/getSingleData", method: "POST", rejectUnauthorized: false,
      timeout: timeoutMs,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Accept: "application/json" }
    }, (response) => {
      let payload = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { payload += chunk; });
      response.on("end", () => {
        if ((response.statusCode || 500) >= 400) return reject(new Error(`SMA operating-state HTTP ${response.statusCode}`));
        try {
          const parsed = JSON.parse(payload);
          const raw = Number(parsed?.data?.value);
          if (!Number.isInteger(raw) || parsed?.data?.quality !== 0) throw new Error("SMA operating state is unavailable or stale");
          resolve({ raw, label: SMA_OPERATING_STATES[raw] || `State ${raw}` });
        } catch (error: any) { reject(new Error(error?.message || "Invalid SMA operating-state response")); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("SMA operating-state timeout")));
    request.on("error", reject);
    request.end(body);
  });
}

export async function readSmaPcsSwitchTelemetry(arrayIndex: number, host = `10.0.${arrayIndex}.118`): Promise<PcsSwitchTelemetry> {
  const cached = pcsSwitchCache.get(arrayIndex);
  if (cached && Date.now() - cached.attemptedAt < PCS_SWITCH_POLL_INTERVAL_MS) return cached.value;
  const started = Date.now();
  const base = { arrayIndex, host, port: 502, unitId: 3 };
  let webError: unknown = null;
  try {
    const [diagram, operatingState] = await Promise.all([
      readSmaDiagramBitfield(host),
      readSmaOperatingState(host).catch(() => null)
    ]);
    // The extended point sweep can take many seconds across eight devices.
    // Keep the switch/status snapshot independent of that background work.
    const smaProcessData = refreshSmaExtendedProcessData(host);
    let auxiliary: SmaAuxiliarySwitchRead | null = null;
    try {
      auxiliary = await readSmaAuxiliarySwitches(host);
    } catch { /* the verified GUI one-line remains usable without auxiliary Modbus */ }
    const value: PcsSwitchTelemetry = {
      ...base, capturedAt: new Date().toISOString(), durationMs: Date.now() - started, stale: false,
      error: null, addressOffset: auxiliary?.addressOffset ?? null, source: "SMA_WEB_PROCESS_DATA",
      inverterOperatingState: operatingState?.label ?? null,
      inverterOperatingStateRaw: operatingState?.raw ?? null,
      powerOffReason: (() => { const raw = Number(smaProcessData.powerOffReason?.value); return Number.isInteger(raw) ? (SMA_POWER_OFF_REASONS[raw] || `Reason ${raw}`) : null; })(),
      smaProcessData,
      dcSwitch1: bitfieldSwitch(diagram, 17, 16), dcSwitch2: bitfieldSwitch(diagram, 20, 19),
      dcSwitch3: bitfieldSwitch(diagram, 23, 22), acSwitch: bitfieldSwitch(diagram, 26, 25),
      mvSwitch: bitfieldSwitch(diagram, 29, 28),
      capacitorSwitch: auxiliary?.capacitorSwitch ?? "UNKNOWN",
      prechargeSwitch: auxiliary?.prechargeSwitch ?? "UNKNOWN",
      dcPrechargeSwitch: auxiliary?.dcPrechargeSwitch ?? "UNKNOWN",
      dcHealth: bitfieldHealth(diagram, 0), inverterHealth: bitfieldHealth(diagram, 4),
      transformerHealth: bitfieldHealth(diagram, 8), gridHealth: bitfieldHealth(diagram, 12),
      raw: { diagramStatus: diagram, inverterOperatingState: operatingState?.raw ?? null, ...(auxiliary?.raw || {}) }
    };
    pcsSwitchCache.set(arrayIndex, { attemptedAt: Date.now(), value });
    return value;
  } catch (error) {
    webError = error;
    // Fall back to the documented SMA Modbus profile when the GUI process-data endpoint is unavailable.
  }
  try {
    const auxiliary = await readSmaAuxiliarySwitches(host);
    const primary = await queryModbusRaw(host, 502, 3, auxiliary.addressOffset, 56, 14, 1200, 4);
    const raw = { dcSwitch1: decodeSmaEnum(primary.registers, 0), dcSwitch2: decodeSmaEnum(primary.registers, 2),
      dcSwitch3: decodeSmaEnum(primary.registers, 4), acSwitch: decodeSmaEnum(primary.registers, 6), ...auxiliary.raw };
    const value: PcsSwitchTelemetry = {
      ...base, capturedAt: new Date().toISOString(), durationMs: Date.now() - started, stale: false,
      error: null, addressOffset: auxiliary.addressOffset, source: "SMA_MODBUS",
      inverterOperatingState: null, inverterOperatingStateRaw: null,
      powerOffReason: null, smaProcessData: {},
      dcSwitch1: switchState(raw.dcSwitch1), dcSwitch2: switchState(raw.dcSwitch2), dcSwitch3: switchState(raw.dcSwitch3),
      acSwitch: switchState(raw.acSwitch), mvSwitch: "UNKNOWN", capacitorSwitch: switchState(raw.capacitorSwitch),
      prechargeSwitch: switchState(raw.prechargeSwitch), dcPrechargeSwitch: switchState(raw.dcPrechargeSwitch),
      dcHealth: "UNKNOWN", inverterHealth: "UNKNOWN", transformerHealth: "UNKNOWN", gridHealth: "UNKNOWN", raw
    };
    pcsSwitchCache.set(arrayIndex, { attemptedAt: Date.now(), value });
    return value;
  } catch (error: any) {
    const value: PcsSwitchTelemetry = {
      ...base, capturedAt: null, durationMs: Date.now() - started, stale: true,
      error: `SMA web telemetry: ${webError instanceof Error ? webError.message : String(webError)}; Modbus fallback: ${error?.message || String(error)}`,
      addressOffset: null, source: null,
      inverterOperatingState: null, inverterOperatingStateRaw: null,
      powerOffReason: null, smaProcessData: {},
      dcSwitch1: "UNKNOWN", dcSwitch2: "UNKNOWN", dcSwitch3: "UNKNOWN", acSwitch: "UNKNOWN",
      mvSwitch: "UNKNOWN",
      capacitorSwitch: "UNKNOWN", prechargeSwitch: "UNKNOWN", dcPrechargeSwitch: "UNKNOWN",
      dcHealth: "UNKNOWN", inverterHealth: "UNKNOWN", transformerHealth: "UNKNOWN", gridHealth: "UNKNOWN", raw: {}
    };
    pcsSwitchCache.set(arrayIndex, { attemptedAt: Date.now(), value });
    return value;
  }
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(cell.trim()); cell = ""; }
    else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

export function parseOperationalMap(csv: string): MapRow[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvRow(lines[0]).map((value) => value.toUpperCase());
  const at = (name: string) => headers.indexOf(name);
  return lines.slice(1).map(parseCsvRow).map((row) => ({
    fieldType: row[at("FIELDTYPE")] || "",
    address: Number(row[at("MODBUSADDRESS")]),
    size: Number(row[at("FIELDSIZE")]) || 1,
    name: row[at("FIELDNAME")] || "",
    value: row[at("VALUE")] || "",
    type: (row[at("TYPE")] || "uint16").toLowerCase(),
    scaleRef: row[at("SF")] || "",
    unit: row[at("UNIT")] || ""
  })).filter((row) => Number.isInteger(row.address));
}

function signed16(value: number): number {
  return value & 0x8000 ? value - 0x10000 : value;
}

function rawValue(row: MapRow, registers: number[], start: number): number | null {
  const index = row.address - start;
  if (index < 0 || index >= registers.length) return null;
  if (row.size === 2 && index + 1 < registers.length) {
    const unsigned = ((registers[index] << 16) | registers[index + 1]) >>> 0;
    return row.type.includes("sint") || row.type.includes("acc") ? (unsigned | 0) : unsigned;
  }
  return row.type.includes("sint") || row.type.includes("scalefactor") ? signed16(registers[index]) : registers[index];
}

function decodeModel(rows: MapRow[], registers: number[], start: number, names: string[]): Record<string, number | null> {
  const byName = new Map(rows.map((row) => [row.name, row]));
  const result: Record<string, number | null> = {};
  for (const name of names) {
    const row = byName.get(name);
    if (!row) { result[name] = null; continue; }
    const raw = rawValue(row, registers, start);
    const scaleRow = row.scaleRef ? byName.get(row.scaleRef) : undefined;
    const scale = scaleRow ? rawValue(scaleRow, registers, start) : 0;
    result[name] = raw === null || scale === null ? null : raw * Math.pow(10, scale);
  }
  return result;
}

function sourceMapPath(): string | null {
  const profile = getActiveProfile() as any;
  if (!profile?.stationCode || profile?.blockCode === undefined) return null;
  const candidate = path.join(process.cwd(), "data", "modbus-profiles", `${profile.stationCode}_B${profile.blockCode}`, "source_modbus_map.csv");
  return fs.existsSync(candidate) ? candidate : null;
}

type ModelRead = { address: number; quantity: number };
type ModelReadGroup = { address: number; quantity: number; indexes: number[] };

// Nearby SunSpec models can be read in one Modbus transaction. Keep the
// register limit and a small gap limit so unrelated models are not swept in.
export function groupOperationalModelReads(reads: ModelRead[]): ModelReadGroup[] {
  const groups: ModelReadGroup[] = [];
  reads.forEach((read, index) => {
    if (!Number.isInteger(read.address) || !Number.isInteger(read.quantity) || read.quantity < 1 || read.quantity > 125) {
      throw new Error(`Invalid Modbus model read at index ${index}`);
    }
    const previous = groups[groups.length - 1];
    const end = read.address + read.quantity;
    const previousEnd = previous ? previous.address + previous.quantity : 0;
    if (previous && read.address >= previous.address && read.address <= previousEnd + 2 && end - previous.address <= 125) {
      previous.quantity = Math.max(previousEnd, end) - previous.address;
      previous.indexes.push(index);
    } else {
      groups.push({ address: read.address, quantity: read.quantity, indexes: [index] });
    }
  });
  return groups;
}

export async function pollOperationalModbus(): Promise<OperationalModbusSnapshot> {
  if (polling) return snapshot;
  polling = true;
  const started = Date.now();
  try {
    const mapPath = sourceMapPath();
    if (!mapPath) throw new Error("Active Modbus map is not ready");
    const csv = fs.readFileSync(mapPath, "utf8");
    const rows = parseOperationalMap(csv);
    const profile = getActiveProfile() as any;
    const host = profile?.modbusHost || profile?.emsHost || "10.0.0.3";
    const addressOffset = await detectMapAddressOffset(host, csv);
    const headers = rows.filter((row) => row.fieldType.toLowerCase() === "header" && row.name.startsWith("ID "));
    const inverterHeaders = headers.filter((row) => row.name.includes("InverterThreePhase"));
    const pcsExtensionHeaders = headers.filter((row) => row.name.includes("PowinPCSExtensionReport"));
    const arrayExtensionHeaders = headers.filter((row) => row.name.includes("PowinArrayExtensionReport"));
    const blockHeader = headers.find((row) => row.name.replace(/["']/g, "") === "ID Powin");
    if (!blockHeader || inverterHeaders.length === 0) throw new Error("Required block or PCS models are absent from the Modbus map");

    const pcsNames = ["Amps", "PhaseVoltageAB", "PhaseVoltageBC", "PhaseVoltageCA", "Watts", "Hz", "VAr", "PF", "DCAmps", "DCVoltage", "DCWatts", "CabinetTemperature", "HeatSinkTemperature", "OperatingState", "VendorOperatingState"];
    const blockNames = ["BlockMaxChargeRate", "BlockMaxDischargeRate", "BlockTotalSOC", "BlockTotalStoredWh", "BlockTotalCapacityWh", "BlockW", "BlockVA", "BlockVAr", "BasicOpTargetSOC", "BasicOpTargetPower", "AvailableChargePowerCapacity", "AvailableDischargePowerCapacity", "BasicOpStatus", "InstantaneousSystemAvailabilityPercentage", "SiteEStopStatus", "StackCount", "StackWithOpenContactorsCount", "StackWithClosedContactorsCount", "StackInRotationCount", "StackOutOfRotationCount"];
    const pcsExtensionNames = ["RotationState", "FaultCode", "TotalEnergy", "ImportedEnergy", "ExportedEnergy"];
    const arrayNames = ["StackCount", "StackWithOpenContactorsCount", "StackWithClosedContactorsCount", "StackInRotationCount", "StackOutOfRotationCount", "CellTmpMax", "CellTmpMin", "CellTmpAvg", "CellVoltageMax", "CellVoltageMin", "CellVoltageAvg", "StackVoltageMax", "StackVoltageMin", "StackVoltageAvg", "DcBusVoltageMax", "DcBusVoltageMin", "DcBusVoltageAvg", "ChargeThroughputWh", "DischargeThroughputWh"];

    const modelReads: ModelRead[] = [
      { address: blockHeader.address, quantity: 100 },
      ...inverterHeaders.map((header) => ({ address: header.address, quantity: 50 })),
      ...pcsExtensionHeaders.map((header) => ({ address: header.address, quantity: 12 })),
      ...arrayExtensionHeaders.map((header) => ({ address: header.address, quantity: 32 }))
    ];
    const groups = groupOperationalModelReads(modelReads);
    const groupReads = await Promise.all(groups.map((group) => queryModbusReal(host, group.address, group.quantity, 1, addressOffset)));
    const reads: Array<{ registers: number[]; port: number }> = new Array(modelReads.length);
    groups.forEach((group, groupIndex) => {
      group.indexes.forEach((index) => {
        const model = modelReads[index];
        const offset = model.address - group.address;
        reads[index] = { registers: groupReads[groupIndex].registers.slice(offset, offset + model.quantity), port: groupReads[groupIndex].port };
      });
    });
    const blockRows = rows.filter((row) => row.address >= blockHeader.address && row.address < blockHeader.address + 100);
    const block = decodeModel(blockRows, reads[0].registers, blockHeader.address, blockNames);
    const pcsExtensionReadOffset = 1 + inverterHeaders.length;
    const pcs = inverterHeaders.map((header, index) => {
      const modelRows = rows.filter((row) => row.address >= header.address && row.address < header.address + 50);
      const values = decodeModel(modelRows, reads[index + 1].registers, header.address, pcsNames);
      const extensionHeader = pcsExtensionHeaders[index];
      const extensionRows = extensionHeader
        ? rows.filter((row) => row.address >= extensionHeader.address && row.address < extensionHeader.address + 12)
        : [];
      const extension = extensionHeader
        ? decodeModel(extensionRows, reads[pcsExtensionReadOffset + index].registers, extensionHeader.address, pcsExtensionNames)
        : {};
      return { arrayIndex: index + 1, ...values, ...extension };
    });
    const arrayReadOffset = pcsExtensionReadOffset + pcsExtensionHeaders.length;
    const arrays = arrayExtensionHeaders.map((header, index) => {
      const modelRows = rows.filter((row) => row.address >= header.address && row.address < header.address + 32);
      const values = decodeModel(modelRows, reads[arrayReadOffset + index].registers, header.address, arrayNames);
      return { arrayIndex: index + 1, ...values };
    });
    // Publish the EMS Modbus registers immediately. PCS switch enrichment can
    // involve eight independent HTTPS/Modbus device reads and must never make
    // otherwise-fresh block telemetry appear stale.
    snapshot = {
      available: true,
      capturedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      host,
      port: reads[0].port,
      addressOffset,
      stale: false,
      error: null,
      block,
      pcs,
      arrays,
      pcsSwitches: snapshot.pcsSwitches
    };

    inverterHeaders.forEach((_header, index) => {
      const arrayIndex = index + 1;
      const cached = pcsSwitchCache.get(arrayIndex);
      if (pcsSwitchRefreshInFlight.has(arrayIndex) || (cached && Date.now() - cached.attemptedAt < PCS_SWITCH_POLL_INTERVAL_MS)) return;
      pcsSwitchRefreshInFlight.add(arrayIndex);
      void readSmaPcsSwitchTelemetry(arrayIndex)
        .then((value) => {
          const updated = [...snapshot.pcsSwitches];
          updated[index] = value;
          snapshot = { ...snapshot, pcsSwitches: updated };
        })
        .catch((error: any) => console.warn(`[Operational Modbus] PCS ${arrayIndex} status refresh failed`, error?.message || error))
        .finally(() => pcsSwitchRefreshInFlight.delete(arrayIndex));
    });
  } catch (error: any) {
    snapshot = { ...snapshot, available: snapshot.available, durationMs: Date.now() - started, stale: true, error: error?.message || String(error) };
  } finally {
    polling = false;
  }
  return snapshot;
}

export function isPcsSwitchReadingStale(reading: Pick<PcsSwitchTelemetry, "stale" | "capturedAt">, nowMs = Date.now()): boolean {
  if (reading.stale || !reading.capturedAt) return true;
  const capturedAtMs = Date.parse(reading.capturedAt);
  return !Number.isFinite(capturedAtMs) || nowMs - capturedAtMs > PCS_SWITCH_STALE_MS;
}

export function getOperationalModbusSnapshot(): OperationalModbusSnapshot {
  const ageMs = snapshot.capturedAt ? Date.now() - Date.parse(snapshot.capturedAt) : Infinity;
  return {
    ...snapshot,
    stale: snapshot.stale || ageMs > 15_000,
    pcsSwitches: snapshot.pcsSwitches.map((row) => row && ({
      ...row,
      stale: isPcsSwitchReadingStale(row)
    }))
  };
}

export function startOperationalModbusPolling(intervalMs = 1000): void {
  if (timer) return;
  void pollOperationalModbus();
  timer = setInterval(() => void pollOperationalModbus(), Math.max(500, intervalMs));
  timer.unref?.();
}
