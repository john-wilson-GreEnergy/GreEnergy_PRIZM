import { pollEmsTurtle } from "./emsTurtleClient";
import { getLatestSnapshot } from "./prizmDataCoordinator";
import { appendEvent } from "./history/prizmHistory";

export interface ContactorTarget {
  array: number;
  string?: number;
  allStrings?: boolean;
}

export interface ContactorControlRequest {
  action: "open" | "close";
  targets: ContactorTarget[];
  ignoreLowCgVoltAlarm: boolean;
  ignoreHighCgVoltAlarm: boolean;
  confirmed: boolean;
  reason: string;
  note?: string;
}

export interface ContactorTargetResult {
  target: ContactorTarget;
  action: "open" | "close";
  phoenixUrl: string;
  accepted: boolean;
  responseStatus: number;
  responseText: string;
  readbackConfirmed: boolean | null;
  readbackStatus: string;
  error: string | null;
}

function getPhoenixBase(array: number): string {
  return `http://10.0.${array}.1:8080/turtle`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeContactorControl(req: ContactorControlRequest): Promise<{ success: boolean; results: ContactorTargetResult[] }> {
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

  const results: ContactorTargetResult[] = [];

  // 2. Loop and execute targets
  for (const t of req.targets) {
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

    const base = getPhoenixBase(array);
    const phoenixUrl = isAll
      ? `${base}/tools/controls/bms/array/${array}/contactors/${req.action}?ignoreLowCgVoltAlarm=${ignoreLow}&ignoreHighCgVoltAlarm=${ignoreHigh}`
      : `${base}/tools/controls/bms/array/${array}/string/${stringNum}/contactors/${req.action}?ignoreLowCgVoltAlarm=${ignoreLow}&ignoreHighCgVoltAlarm=${ignoreHigh}`;

    let accepted = false;
    let responseStatus = 0;
    let responseText = "";
    let error: string | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(phoenixUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      responseStatus = res.status;
      responseText = await res.text();
      accepted = res.ok;
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
      readbackConfirmed: null,
      readbackStatus: "Pending readback",
      error
    });
  }

  // 3. Readback (Wait, immediate poll, verify)
  const acceptedAny = results.some(r => r.accepted);
  if (acceptedAny) {
    // Wait 1500 ms for Phoenix BMS command to process
    await sleep(1500);

    // Trigger immediate PRIZM poll/refresh
    await pollEmsTurtle().catch(() => {});

    // Compare with latest snapshot
    const latestSnap = getLatestSnapshot();
    const latestStrings = latestSnap?.normalized?.strings || [];

    for (const res of results) {
      if (!res.accepted) {
        res.readbackConfirmed = false;
        res.readbackStatus = "Command not accepted; skipping readback";
        continue;
      }

      const t = res.target;
      const isAll = t.allStrings === true;

      if (isAll) {
        const arrayStrings = latestStrings.filter((s: any) => s.arrayNumber === t.array);
        if (arrayStrings.length === 0) {
          res.readbackConfirmed = null;
          res.readbackStatus = "Command accepted; readback unavailable (no strings found in latest poll)";
        } else {
          const allMatch = arrayStrings.every((s: any) => {
            const val = s.bothContactorsClosed;
            if (val === null || val === undefined) return false;
            return req.action === "close" ? val === true : val === false;
          });

          res.readbackConfirmed = allMatch;
          res.readbackStatus = allMatch
            ? "Command verified: All array string contactors in requested state"
            : "Command verification failed: Some array string contactors not in requested state";
        }
      } else {
        const strRow = latestStrings.find((s: any) => s.arrayNumber === t.array && s.stringNumber === t.string);
        if (!strRow) {
          res.readbackConfirmed = null;
          res.readbackStatus = "Command accepted; readback unavailable (string not found in latest poll)";
        } else {
          const val = strRow.bothContactorsClosed;
          if (val === null || val === undefined) {
            res.readbackConfirmed = null;
            res.readbackStatus = "Command accepted; readback status is unknown/null in latest poll";
          } else {
            const matches = req.action === "close" ? val === true : val === false;
            res.readbackConfirmed = matches;
            res.readbackStatus = matches
              ? "Command verified: String contactor in requested state"
              : "Command verification failed: String contactor not in requested state";
          }
        }
      }
    }
  } else {
    for (const res of results) {
      res.readbackConfirmed = false;
      res.readbackStatus = "Command not accepted; skipping readback";
    }
  }

  const acceptedCount = results.filter(r => r.accepted).length;
  const confirmedCount = results.filter(r => r.readbackConfirmed === true).length;

  // 4. Log to PRIZM history
  appendEvent({
    entityKey: "prizm-core-control",
    timestampUtc: new Date().toISOString(),
    action: `String Contactor ${req.action.toUpperCase()}`,
    level: "warning",
    category: "Control",
    details: `Requested contactor ${req.action.toUpperCase()} for ${req.targets.length} target(s). Alarms ignored - Low: ${ignoreLow}, High: ${ignoreHigh}. Reason: ${req.reason}. Note: ${req.note || 'None'}. Accepted: ${acceptedCount}/${req.targets.length}, Confirmed: ${confirmedCount}/${req.targets.length}.`,
    user: "LocalOperator",
    metadata: {
      request: req,
      results
    }
  });

  const success = acceptedCount > 0;
  return { success, results };
}
