import { triggerImmediatePoll } from "./prizmDataCoordinator";
import { appendEvent } from "./history/prizmHistory";
import { getContactorStateForString, getContactorStatesForAllStrings, type NormalizedContactorState } from "./contactorStateEngine";
import { ProfileStore } from "./profiles/profileStore";
import { publishBusVoltageToStringBroker, publishContactorStateToStringBroker } from "./domainBrokers/stringDomainBroker";
import { compactFullArrayStringTargets } from "./controlTargetOptimizer";
import { readModbusStringContactorState } from "./telemetry/modbusStringTelemetry";

export interface ContactorTarget {
  array: number;
  string?: number;
  allStrings?: boolean;
}

export interface ContactorControlRequest {
  commandId?: string;
  action: "open" | "close";
  targets: ContactorTarget[];
  ignoreLowCgVoltAlarm: boolean;
  ignoreHighCgVoltAlarm: boolean;
  ignoreStringDcBusVoltageDeltaLimit?: boolean;
  recloseCount?: number;
  confirmed: boolean;
  reason: string;
  note?: string;
}

type ContactorControlResponse = {
  success: boolean;
  acceptedCount: number;
  verifiedCount: number;
  mismatchCount: number;
  unknownCount: number;
  results: ContactorTargetResult[];
};

const recentCommands = new Map<string, Promise<ContactorControlResponse>>();
const lockedTargets = new Map<string, string>();
const IDEMPOTENCY_WINDOW_MS = 30_000;

function commandTargetKeys(targets: ContactorTarget[]): string[] {
  return [...new Set(targets.map((target) => target.allStrings === true
    ? `array:${Number(target.array)}:*`
    : `array:${Number(target.array)}:string:${Number(target.string)}`))];
}

export function contactorTargetKeysOverlap(left: string, right: string): boolean {
  const leftArray = left.split(":").slice(0, 2).join(":");
  const rightArray = right.split(":").slice(0, 2).join(":");
  return left === right || (leftArray === rightArray && (left.endsWith(":*") || right.endsWith(":*")));
}

function findTargetConflict(keys: string[]): string | null {
  for (const key of keys) {
    for (const lockedKey of lockedTargets.keys()) {
      if (contactorTargetKeysOverlap(key, lockedKey)) {
        return lockedKey;
      }
    }
  }
  return null;
}

export function buildEmsContactorUrl(
  baseUrl: string,
  target: ContactorTarget,
  req: Pick<ContactorControlRequest, "action" | "ignoreLowCgVoltAlarm" | "ignoreHighCgVoltAlarm" | "ignoreStringDcBusVoltageDeltaLimit" | "recloseCount">
): string {
  const base = baseUrl.replace(/\/$/, "");
  const actionPath = target.allStrings === true
    ? `/tools/controls/ems/array/${target.array}/contactors/${req.action}`
    : `/tools/controls/ems/array/${target.array}/string/${target.string}/contactors/${req.action}`;
  // Match Kobold's working string-permission payload. This stack type does not
  // support the legacy cell-group voltage alarm flags; including them causes
  // Turtle to take its compatibility branch and can leave closeExpected
  // unchanged even though the HTTP request is acknowledged.
  const query = new URLSearchParams({
    closeExpected: String(req.action === "close"),
    recloseCount: String(req.recloseCount ?? 6),
    ignoreStringDcBusVoltageDeltaLimit: String(req.action === "close" && req.ignoreStringDcBusVoltageDeltaLimit === true)
  });
  return `${base}${actionPath}?${query.toString()}`;
}

export interface ContactorTargetResult {
  target: ContactorTarget;
  action: "open" | "close";
  phoenixUrl: string;
  accepted: boolean;
  responseStatus: number;
  responseText: string;
  responseWarning?: string | null;
  readbackConfirmed: boolean | null;
  readbackStatus: string;
  readbackState?: NormalizedContactorState | null;
  error: string | null;
}

function getEmsBase(): string {
  return (process.env.PRIZM_EMS_TURTLE_BASE || "http://10.0.0.3:8080/turtle").replace(/\/$/, "");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// EMS can accept the mutation immediately while StringViewer continues to
// publish the previous state for more than ten seconds. Keep polling the
// targeted endpoint only; this does not resend or mutate the command.
const FAST_VERIFY_INTERVAL_MS = 500;
const FAST_VERIFY_DEADLINE_MS = Number(process.env.PRIZM_CONTACTOR_VERIFY_DEADLINE_MS) || 30_000;
const ARRAY_VERIFY_DEADLINE_MS = Number(process.env.PRIZM_ARRAY_CONTACTOR_VERIFY_DEADLINE_MS) || 60_000;
const STRINGVIEWER_READ_TIMEOUT_MS = 3_000;

async function refreshArrayBusVoltages(arrayNumbers: number[]): Promise<void> {
  const stringsPerArray = Number((ProfileStore.getActiveProfile() as any)?.stringsPerArray) || 40;
  const arrays = [...new Set(arrayNumbers.filter((array) => Number.isInteger(array) && array > 0))];
  if (arrays.length === 0) return;

  const sample = await getContactorStatesForAllStrings({
    refresh: true,
    arrays,
    // Deliberately use the configured topology, never the number of strings
    // present in the latest bulk poll. A partial poll must not truncate this.
    stringsPerArray,
    concurrency: 16,
    timeoutMs: STRINGVIEWER_READ_TIMEOUT_MS,
    onState: (state) => {
      if (state.quality === "live" && Number.isFinite(Number(state.dcBusVoltage))) {
        publishBusVoltageToStringBroker(state);
      }
    }
  });
  // The callback above publishes incrementally. Retain the completed sample so
  // the contactor engine cache still represents the whole configured array.
  void sample;
}

function normalizedReadbackMatches(row: NormalizedContactorState, action: "open" | "close"): boolean | null {
  if (row.quality !== "live") return null;
  return contactorReadbackMatches(row, action);
}

async function verifyTargetFromStringviewer(
  target: ContactorTarget,
  action: "open" | "close"
): Promise<{ confirmed: boolean | null; status: string; state?: NormalizedContactorState | null }> {
  const deadline = Date.now() + (target.allStrings === true ? ARRAY_VERIFY_DEADLINE_MS : FAST_VERIFY_DEADLINE_MS);
  let consecutiveMatches = 0;
  let lastResult: boolean | null = null;
  let lastMatchCount = 0;
  let lastTotal = 0;
  let lastLiveCount = 0;
  let lastMismatchCount = 0;
  let lastUnavailableCount = 0;
  let lastState: NormalizedContactorState | null = null;

  while (Date.now() < deadline) {
    if (target.allStrings === true) {
      const stringsPerArray = Number((ProfileStore.getActiveProfile() as any)?.stringsPerArray) || 40;
      const sample = await getContactorStatesForAllStrings({
        refresh: true,
        arrays: [Number(target.array)],
        stringsPerArray,
        concurrency: 12,
        timeoutMs: STRINGVIEWER_READ_TIMEOUT_MS,
        onState: (state) => {
          if (state.quality === "live" && Number.isFinite(Number(state.dcBusVoltage))) {
            publishBusVoltageToStringBroker(state);
          }
        }
      });
      const live = sample.states.filter((state) => state.quality === "live");
      const matches = live.filter((state) => normalizedReadbackMatches(state, action) === true).length;
      const mismatches = live.filter((state) => normalizedReadbackMatches(state, action) === false).length;
      lastMatchCount = matches;
      lastTotal = sample.states.length;
      lastLiveCount = live.length;
      lastMismatchCount = mismatches;
      lastUnavailableCount = sample.states.length - live.length;
      lastResult = live.length === sample.states.length && mismatches === 0 && matches === sample.states.length
        ? true
        : mismatches > 0
          ? false
          : null;
    } else {
      // The EMS Modbus map provides direct two-pole contactor feedback. It is
      // substantially smaller and faster than StringViewer, so use two fresh
      // matching reads as the fast verification path. Any mismatch or read
      // failure falls through to the established StringViewer verifier.
      try {
        const modbusState = await readModbusStringContactorState(Number(target.array), Number(target.string));
        const modbusMatches = action === "close"
          ? modbusState.actualState === "closed"
          : modbusState.actualState === "open";
        if (modbusMatches) {
          consecutiveMatches += 1;
          publishContactorStateToStringBroker({
            arrayNumber: modbusState.arrayNumber,
            stringNumber: modbusState.stringNumber,
            positiveContactorClosed: modbusState.positiveContactorClosed,
            negativeContactorClosed: modbusState.negativeContactorClosed,
            contactorsCloseExpected: action === "close",
            fetchedAt: modbusState.fetchedAt,
          });
          if (consecutiveMatches >= 2) {
            return {
              confirmed: true,
              status: `Command verified by two fresh Modbus reads on port ${modbusState.port}: both contactor poles in requested state`,
              state: null,
            };
          }
          await sleep(FAST_VERIFY_INTERVAL_MS);
          continue;
        }
      } catch {
        // StringViewer remains the authoritative fallback when Modbus is not
        // mapped, unavailable, or not yet reporting the requested state.
      }
      const state = await getContactorStateForString(Number(target.array), Number(target.string), {
        refresh: true,
        timeoutMs: STRINGVIEWER_READ_TIMEOUT_MS
      });
      lastState = state;
      lastResult = normalizedReadbackMatches(state, action);
      lastMatchCount = lastResult === true ? 1 : 0;
      lastTotal = 1;
    }

    if (lastResult === true) {
      consecutiveMatches += 1;
      if (consecutiveMatches >= 2) {
        return {
          confirmed: true,
          status: target.allStrings === true
            ? `Command verified by two fresh StringViewer readings: ${lastMatchCount}/${lastTotal} strings physically in requested state`
            : "Command verified by two fresh StringViewer readings: both contactor poles in requested state",
          state: lastState
        };
      }
    } else {
      consecutiveMatches = 0;
    }

    await sleep(FAST_VERIFY_INTERVAL_MS);
  }

  if (lastResult === false) {
    if (target.allStrings === true) {
      return {
        confirmed: false,
        status: `EMS accepted the command; physical verification is incomplete: ${lastMatchCount}/${lastLiveCount} reporting strings matched, ${lastMismatchCount} mismatched${lastUnavailableCount > 0 ? `, ${lastUnavailableCount} unavailable` : ""}`,
        state: lastState
      };
    }
    const observed = lastState
      ? `EMS request remained ${lastState.requestedState.toUpperCase()}; contactors remained ${lastState.actualState.toUpperCase()}`
      : "fresh StringViewer feedback did not reach the requested state";
    return { confirmed: false, status: `Command accepted, but ${observed}`, state: lastState };
  }
  return {
    confirmed: null,
    status: target.allStrings === true
      ? `EMS accepted the command; physical verification timed out: ${lastMatchCount}/${lastLiveCount || lastTotal} reporting strings matched${lastUnavailableCount > 0 ? `, ${lastUnavailableCount} unavailable` : ""}`
      : "Command accepted; fresh StringViewer contactor feedback remained unavailable",
    state: lastState
  };
}

export function contactorReadbackMatches(row: any, action: "open" | "close"): boolean | null {
  const positive = typeof row?.positiveContactorClosed === "boolean" ? row.positiveContactorClosed : null;
  const negative = typeof row?.negativeContactorClosed === "boolean" ? row.negativeContactorClosed : null;

  // Explicit pole feedback is authoritative and prevents a partially-open pair
  // from being reported as a successful OPEN operation.
  if (positive !== null && negative !== null) {
    return action === "close" ? positive && negative : !positive && !negative;
  }

  // A combined true value proves both poles closed. A combined false value does
  // not prove both poles open, so it is unknown for OPEN verification.
  if (action === "close" && typeof row?.bothContactorsClosed === "boolean") {
    return row.bothContactorsClosed;
  }
  return null;
}

async function executeContactorControlOnce(req: ContactorControlRequest): Promise<ContactorControlResponse> {
  // 1. Validation
  if (!req.action || (req.action !== "open" && req.action !== "close")) {
    throw new Error("Action must be 'open' or 'close'");
  }
  if (!req.targets || !Array.isArray(req.targets) || req.targets.length === 0) {
    throw new Error("Targets must be a non-empty array");
  }
  if (req.confirmed !== true) {
    throw new Error("Explicit confirmation is required");
  }
  if (!req.reason || req.reason.trim() === "") {
    throw new Error("A reason is required");
  }

  const ignoreLow = req.ignoreLowCgVoltAlarm === true;
  const ignoreHigh = req.ignoreHighCgVoltAlarm === true;
  const ignoreVoltageDelta = req.ignoreStringDcBusVoltageDeltaLimit === true;
  const recloseCount = Number(req.recloseCount ?? 6);
  if (!Number.isInteger(recloseCount) || recloseCount < 0 || recloseCount > 20) {
    throw new Error("Reclose count must be a whole number between 0 and 20");
  }

  const stringsPerArray = Number((ProfileStore.getActiveProfile() as any)?.stringsPerArray) || 40;
  const optimizedTargets = compactFullArrayStringTargets(req.targets, stringsPerArray) as ContactorTarget[];
  const results: ContactorTargetResult[] = [];

  // 2. Loop and execute targets
  for (const t of optimizedTargets) {
    const array = Number(t.array);
    if (isNaN(array) || array < 1 || array > 8) {
      throw new Error(`Invalid array: ${t.array}. Array must be between 1 and 8.`);
    }

    const isAll = t.allStrings === true;
    let stringNum: number | undefined;

    if (!isAll) {
      stringNum = Number(t.string);
      if (isNaN(stringNum) || stringNum < 1 || stringNum > 40) {
        throw new Error(`Invalid string: ${t.string}. String must be between 1 and 40 for single string target.`);
      }
    }

    // Contactor requests must go through EMS. Calling Phoenix/BMS directly can
    // momentarily actuate the device while leaving EMS's requested state open;
    // EMS then immediately wins and the close never persists. This is the same
    // control authority used by the legacy EMS tools and Kobold workflow.
    const base = getEmsBase();
    const phoenixUrl = buildEmsContactorUrl(base, { ...t, array, string: stringNum }, {
      action: req.action,
      ignoreLowCgVoltAlarm: ignoreLow,
      ignoreHighCgVoltAlarm: ignoreHigh,
      ignoreStringDcBusVoltageDeltaLimit: ignoreVoltageDelta,
      recloseCount
    });

    let accepted = false;
    let responseStatus = 0;
    let responseText = "";
    let responseWarning: string | null = null;
    let error: string | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(phoenixUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      responseStatus = res.status;
      responseText = await res.text();
      const lowerBody = responseText.toLowerCase();

      accepted = res.ok ||
                 res.status === 200 ||
                 lowerBody.includes("setting contactor state without flags") ||
                 lowerBody.includes("does not support voltage alarm flags") ||
                 lowerBody.includes("ok");

      if (lowerBody.includes("does not support voltage alarm flags")) {
        responseWarning = responseText;
      }
    } catch (err: any) {
      error = err.message || "Timeout or network failure";
      responseText = error;
    }

    results.push({
      target: t,
      action: req.action,
      phoenixUrl,
      accepted,
      responseStatus,
      responseText,
      responseWarning,
      readbackConfirmed: null,
      readbackStatus: "Pending readback",
      readbackState: null,
      error
    });
  }

  // 3. Fast-path readback. Query only the commanded StringViewer endpoint(s)
  // instead of waiting for the multi-megabyte full-site lastCall refresh.
  const acceptedAny = results.some(r => r.accepted);
  if (acceptedAny) {
    // Begin the array-wide voltage sweep immediately after EMS acceptance.
    // Do not make its first visible update wait for command verification.
    const affectedArrays = results
      .filter((result) => result.accepted)
      .map((result) => Number(result.target.array));
    void refreshArrayBusVoltages(affectedArrays).catch((err) => {
      console.error("[Contactor Control] Array bus-voltage refresh failed", err);
    });

    await Promise.all(results.map(async (res) => {
      if (!res.accepted) {
        res.readbackConfirmed = false;
        res.readbackStatus = "Command not accepted; skipping readback";
        return;
      }
      const verification = await verifyTargetFromStringviewer(res.target, req.action);
      res.readbackConfirmed = verification.confirmed;
      res.readbackStatus = verification.status;
      res.readbackState = verification.state ?? null;
      if (verification.state?.quality === "live") {
        publishContactorStateToStringBroker(verification.state);
      }
    }));

    // Reconcile the broader dashboards asynchronously after the targeted rows
    // have already received authoritative readback.
    void triggerImmediatePoll().catch((err) => {
      console.error("[Contactor Control] Background reconciliation poll failed", err);
    });
  } else {
    for (const res of results) {
      res.readbackConfirmed = false;
      res.readbackStatus = "Command not accepted; skipping readback";
    }
  }

  const acceptedCount = results.filter(r => r.accepted).length;
  const confirmedCount = results.filter(r => r.readbackConfirmed === true).length;
  const mismatchCount = results.filter(r => r.readbackConfirmed === false).length;
  const unknownCount = results.filter(r => r.readbackConfirmed === null).length;

  // 4. Log to PRIZM history
  appendEvent({
    entityKey: "prizm-core-control",
    timestampUtc: new Date().toISOString(),
    action: `String Contactor ${req.action.toUpperCase()}`,
    level: "warning",
    category: "Control",
    details: `Requested contactor ${req.action.toUpperCase()} for ${req.targets.length} selected target(s), optimized to ${optimizedTargets.length} EMS command target(s). Reclose count: ${recloseCount}. Voltage-delta limit ignored: ${ignoreVoltageDelta}. Alarms ignored - Low: ${ignoreLow}, High: ${ignoreHigh}. Reason: ${req.reason}. Note: ${req.note || 'None'}. Accepted: ${acceptedCount}/${optimizedTargets.length}, Confirmed: ${confirmedCount}/${optimizedTargets.length}.`,
    user: "LocalOperator",
    metadata: {
      request: req,
      results
    }
  });

  // "Accepted" only proves that the HTTP request reached the controller. A
  // control operation is successful only when every target is confirmed by
  // fresh telemetry; never show a green success message for failed readback.
  const success = acceptedCount === results.length && confirmedCount === results.length;
  return {
    success,
    acceptedCount,
    verifiedCount: confirmedCount,
    mismatchCount,
    unknownCount,
    results
  };
}

export function executeContactorControl(req: ContactorControlRequest): Promise<ContactorControlResponse> {
  const commandId = String(req.commandId || "").trim();
  if (commandId && recentCommands.has(commandId)) {
    return recentCommands.get(commandId)!;
  }

  const keys = commandTargetKeys(Array.isArray(req.targets) ? req.targets : []);
  const conflict = findTargetConflict(keys);
  if (conflict) {
    return Promise.reject(new Error(`A contactor command is already in progress for ${conflict.replaceAll(":", " ")}. Wait for verification before sending another command.`));
  }

  const lockOwner = commandId || `server-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  keys.forEach((key) => lockedTargets.set(key, lockOwner));
  const operation = executeContactorControlOnce(req).finally(() => {
    keys.forEach((key) => {
      if (lockedTargets.get(key) === lockOwner) lockedTargets.delete(key);
    });
  });
  if (commandId) {
    recentCommands.set(commandId, operation);
    const timer = setTimeout(() => recentCommands.delete(commandId), IDEMPOTENCY_WINDOW_MS);
    timer.unref?.();
  }
  return operation;
}
