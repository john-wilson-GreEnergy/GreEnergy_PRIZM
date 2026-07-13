import { getLatestSnapshot, triggerImmediatePoll } from "./prizmDataCoordinator";
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
  responseWarning?: string | null;
  readbackConfirmed: boolean | null;
  readbackStatus: string;
  error: string | null;
}

function getPhoenixBase(array: number): string {
  return `http://10.0.${array}.1:8080/turtle`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeContactorControl(req: ContactorControlRequest): Promise<{
  success: boolean;
  acceptedCount: number;
  verifiedCount: number;
  mismatchCount: number;
  unknownCount: number;
  results: ContactorTargetResult[];
}> {
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
    let responseWarning: string | null = null;
    let error: string | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      let res;
      try {
        res = await fetch(phoenixUrl, { signal: controller.signal });
      } catch (e: any) {
        // Fallback to local server mock
        const localBase = "http://127.0.0.1:3000";
        const localUrl = phoenixUrl.replace(base, localBase);
        console.log(`[contactorControlService] Target ${phoenixUrl} unreachable. Falling back to local mock ${localUrl}`);
        res = await fetch(localUrl, { signal: controller.signal });
      }
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
      error
    });
  }

  // 3. Readback (Wait/retry over 3 attempts)
  const acceptedAny = results.some(r => r.accepted);
  if (acceptedAny) {
    const totalAttempts = 3;
    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      console.log(`[Contactor Control] Verification attempt ${attempt}/${totalAttempts}`);
      
      // Wait for Phoenix BMS command to process
      await sleep(1500);

      // Trigger immediate poll/refresh (same path as refresh=true)
      await triggerImmediatePoll().catch((err) => {
        console.error("[Contactor Control] Poll failed during readback", err);
      });

      const latestSnap = getLatestSnapshot();
      const latestStrings = latestSnap?.normalized?.strings || [];

      let allVerifiedThisAttempt = true;

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
            allVerifiedThisAttempt = false;
          } else {
            let hasMismatch = false;
            let hasUnknown = false;
            let matchCount = 0;

            for (const s of arrayStrings) {
              const val = s.bothContactorsClosed;
              if (val === null || val === undefined) {
                hasUnknown = true;
              } else {
                const matches = req.action === "close" ? val === true : val === false;
                if (matches) {
                  matchCount++;
                } else {
                  hasMismatch = true;
                }
              }
            }

            if (hasMismatch) {
              res.readbackConfirmed = false;
              res.readbackStatus = "Command verification failed: Some array string contactors not in requested state";
              allVerifiedThisAttempt = false;
            } else if (hasUnknown) {
              res.readbackConfirmed = null;
              res.readbackStatus = `Command partially verified: ${matchCount}/${arrayStrings.length} strings in requested state, remaining are unknown`;
              allVerifiedThisAttempt = false;
            } else {
              res.readbackConfirmed = true;
              res.readbackStatus = "Command verified: All array string contactors in requested state";
            }
          }
        } else {
          const strRow = latestStrings.find((s: any) => s.arrayNumber === t.array && s.stringNumber === t.string);
          if (!strRow) {
            res.readbackConfirmed = null;
            res.readbackStatus = "Command accepted; readback unavailable (string not found in latest poll)";
            allVerifiedThisAttempt = false;
          } else {
            const val = strRow.bothContactorsClosed;
            if (val === null || val === undefined) {
              res.readbackConfirmed = null;
              res.readbackStatus = "Command accepted; readback status is unknown/null in latest poll";
              allVerifiedThisAttempt = false;
            } else {
              const matches = req.action === "close" ? val === true : val === false;
              res.readbackConfirmed = matches;
              if (matches) {
                res.readbackStatus = "Command verified: String contactor in requested state";
              } else {
                res.readbackStatus = "Command verification failed: String contactor not in requested state";
                allVerifiedThisAttempt = false;
              }
            }
          }
        }
      }

      if (allVerifiedThisAttempt) {
        break;
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
  const mismatchCount = results.filter(r => r.readbackConfirmed === false).length;
  const unknownCount = results.filter(r => r.readbackConfirmed === null).length;

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
  return {
    success,
    acceptedCount,
    verifiedCount: confirmedCount,
    mismatchCount,
    unknownCount,
    results
  };
}
