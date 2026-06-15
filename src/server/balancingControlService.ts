import { getEmsConnectionStatus, getEmsCachedRawStrings, getEmsCachedBlock } from "./emsTurtleClient";
import { setEmsApplicationEnabledStatus } from "./ems/dragonAppControl";
import { fetchLiveEmsApps } from "./ems/emsAppsService";
import { setStringRotation } from "./rotationControlService";
import { appendEvent } from "./history/prizmHistory";
import { ProfileStore } from "./profiles/profileStore";

async function fetchWithTimeout(url: string, timeoutMs: number = 2000): Promise<{ ok: boolean, status: number, text: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        return { ok: response.ok, status: response.status, text: await response.text() };
    } catch (e: any) {
        clearTimeout(timeout);
        return { ok: false, status: 0, text: e.message };
    }
}

export type BalancingPreflightRequest = {
  targetType: "string" | "array";
  targets: Array<{
    array: number;
    string?: number;
    allStrings?: boolean;
  }>;
  mode: "avg" | "provided" | "stop";
  providedMv?: number;
  chargingDeadband?: number;
  dischargingDeadband?: number;
};

export type BalancingExecuteRequest = BalancingPreflightRequest & {
  reason?: string;
  note?: string;
  confirmed: boolean;
  preflightChoice:
    | "balance-directly"
    | "move-targets-out-of-rotation-then-balance"
    | "disable-adb-then-balance";
  adbConfirmationText?: string;
  requestedBy?: string;
};

export async function getBalancingCapabilities() {
    return {
        strings: {
            avg: true,
            providedMv: true,
            stop: true,
            highest: false,
            lowest: false
        },
        arrays: {
            avg: true,
            providedMv: true,
            stop: true,
            highest: false,
            lowest: false
        },
        adbPreflight: true,
        executor: "turtle-controls-ems",
        method: "GET-wrapped-by-local-POST"
    };
}

function getEmsBaseUrl(): string {
    const active = ProfileStore.getActiveProfile();
    const status = getEmsConnectionStatus();
    if (!status.available || !active) throw new Error("EMS Connection not available");
    return `http://${active.emsHost}:${active.emsPort}${active.turtlePath.replace(/\/$/, '')}`;
}

export async function executePreflightCheck(req: BalancingPreflightRequest) {
    if (!req.targets || !Array.isArray(req.targets) || req.targets.length === 0) {
        throw new Error("No targets specified");
    }

    const emsUrl = getEmsBaseUrl();

    // Check ADB Status
    let adbEnabled: boolean | null = null;
    let statusKnown = false;
    let warnings: string[] = [];
    
    try {
        const appsRes = await fetchWithTimeout(`${emsUrl}/tools/controls/ems/apps`, 3000);
        if (appsRes.ok && appsRes.text) {
            const appsJSON = JSON.parse(appsRes.text);
            if (Array.isArray(appsJSON)) {
                const adb = appsJSON.find((a: any) => a.appCode === "ADB0001");
                if (adb) {
                    adbEnabled = adb.enabled;
                    statusKnown = true;
                } else {
                    warnings.push("ADB0001 app not found in EMS list.");
                }
            }
        }
    } catch (e: any) {
        warnings.push(`Failed to fetch EMS apps: ${e.message}`);
    }

    // Check rotation status of targets
    const rawStringsWrapper = getEmsCachedRawStrings();
    const blockWrapper = getEmsCachedBlock();
    
    let rawData = [];
    if (rawStringsWrapper.data && rawStringsWrapper.data.length > 0) {
        rawData = rawStringsWrapper.data;
    } else {
        rawData = blockWrapper.data?.strings || [];
    }

    let inRotationCount = 0;
    let outOfRotationCount = 0;
    let unknownCount = 0;
    
    const enrichedTargets = req.targets.map(t => {
        let rotationStatus: "IN" | "OUT" | "UNKNOWN" = "UNKNOWN";
        const stringMeta = rawData.find((r: any) => {
            const arr = Number(r.arrayIndex || r.array);
            const str = Number(r.stringIndex || r.string);
             if (req.targetType === "array" || t.allStrings) {
                 return arr === t.array;
             }
             return arr === t.array && str === t.string;
        });
        
        if (stringMeta) {
            const isOut = Boolean(stringMeta.out_rotation ?? stringMeta.outRotation ?? (stringMeta.rotation === "fault" || stringMeta.outOfRotation));
            rotationStatus = isOut ? "OUT" : "IN";
            if (isOut) {
                outOfRotationCount++;
            } else {
                inRotationCount++;
            }
        } else {
            unknownCount++;
        }

        return {
            ...t,
            rotationStatus
        };
    });

    let recommendedAction: "balance-directly" | "move-targets-out-of-rotation" | "disable-adb" | "warn-unknown" = "balance-directly";
    let okToBalanceDirectly = true;

    if (!statusKnown) {
         recommendedAction = "warn-unknown";
         warnings.push("ADB status is unknown. Manual balancing may be overridden.");
    } else if (adbEnabled === true) {
        if (inRotationCount > 0 || unknownCount > 0) {
            okToBalanceDirectly = false;
            recommendedAction = "move-targets-out-of-rotation";
        }
    }

    return {
        okToBalanceDirectly,
        adb: {
            statusKnown,
            enabled: adbEnabled,
            appCode: "ADB0001",
            appName: "Auto Discharge Balancer"
        },
        targetRotation: {
            total: req.targets.length,
            inRotationCount,
            outOfRotationCount,
            unknownCount,
            targets: enrichedTargets
        },
        recommendedAction,
        warnings
    };
}

export async function executeBalancingWorkflow(req: BalancingExecuteRequest) {
    if (req.confirmed !== true) throw new Error("Explicit confirmation is required");
    if (!req.targets || !Array.isArray(req.targets) || req.targets.length === 0) throw new Error("No targets specified");
    if (!["avg", "provided", "stop"].includes(req.mode)) throw new Error("Invalid balancing mode");
    if (req.mode === "provided" && typeof req.providedMv !== "number") throw new Error("Numeric providedMv required for provided mode");
    
    // conservative range is 2500 - 3800
    if (req.mode === "provided" && req.providedMv !== undefined && (req.providedMv < 2500 || req.providedMv > 3800)) {
        throw new Error("providedMv is outside conservative range of 2500-3800 mV");
    }

    const hostBase = getEmsBaseUrl();

    let rotationActionTaken = false;
    let adbDisableActionTaken = false;

    if (req.preflightChoice === "disable-adb-then-balance") {
        if (req.adbConfirmationText !== "DISABLE ADB0001") {
            throw new Error("Incorrect confirmation text for ADB disable");
        }
        
        // Find priority and block info
        const appsResult = await fetchLiveEmsApps(true);
        const adbApp = appsResult.apps.find((a: any) => a.appCode === 'ADB0001');
        const block = getEmsCachedBlock();
        const stationCode = block.stationCode || 'BHE0021';
        const blockIndex = block.blockIndex || 1;
        const priority = adbApp?.priority !== undefined ? adbApp.priority : (adbApp?.applicationPriority !== undefined ? adbApp.applicationPriority : 0);
        
        const adbRes = await setEmsApplicationEnabledStatus({
            stationCode,
            blockIndex,
            appCode: "ADB0001",
            priority,
            enabled: false,
            confirmationText: "DISABLE ADB0001",
            requestedBy: req.requestedBy || "LocalOperator"
        });
        
        if (!adbRes.success) throw new Error("Failed to disable ADB0001 app: " + (adbRes.message || adbRes.error));
        adbDisableActionTaken = true;
    } else if (req.preflightChoice === "move-targets-out-of-rotation-then-balance") {
        await setStringRotation({
            targets: req.targets,
            action: 'out',
            reason: req.reason || 'Balancing Preflight',
            note: req.note,
            confirmed: true
        });
        rotationActionTaken = true;
    }

    const results = [];
    let successes = 0;
    let failures = 0;

    for (const target of req.targets) {
        try {
            let url = "";
            let queryParams = "";
            
            if (req.mode !== "stop") {
                const cDb = req.chargingDeadband !== undefined ? req.chargingDeadband : 5;
                const dDb = req.dischargingDeadband !== undefined ? req.dischargingDeadband : 10;
                queryParams = `?dischargingDeadband=${dDb}&chargingDeadband=${cDb}`;
            }

            if (req.targetType === "array" || target.allStrings) {
                if (req.mode === "avg") url = `${hostBase}/tools/controls/ems/array/${target.array}/balance/avg${queryParams}`;
                else if (req.mode === "stop") url = `${hostBase}/tools/controls/ems/array/${target.array}/balance/stop`;
                else url = `${hostBase}/tools/controls/ems/array/${target.array}/balance/provided/${req.providedMv}${queryParams}`;
            } else {
                if (req.mode === "avg") url = `${hostBase}/tools/controls/ems/array/${target.array}/string/${target.string}/balance/avg${queryParams}`;
                else if (req.mode === "stop") url = `${hostBase}/tools/controls/ems/array/${target.array}/string/${target.string}/balance/stop`;
                else url = `${hostBase}/tools/controls/ems/array/${target.array}/string/${target.string}/balance/provided/${req.providedMv}${queryParams}`;
            }

            const response = await fetchWithTimeout(url, 15000);
            
            if (response.ok && response.text.includes("OK")) {
                results.push({ target, success: true });
                successes++;
            } else {
                 results.push({ target, success: false, error: !response.ok ? response.text : "Response did not contain OK" });
                 failures++;
            }

        } catch (e: any) {
             results.push({ target, success: false, error: e.message });
             failures++;
        }
    }

    appendEvent({
        entityKey: "prizm-core-control",
        timestampUtc: new Date().toISOString(),
        action: `Balancing Execution: ${req.mode.toUpperCase()}`,
        level: "warning",
        category: "Control",
        details: `Balancing requested for ${req.targets.length} targets. Successes: ${successes}, Failures: ${failures}`,
        user: req.requestedBy || "LocalOperator",
        metadata: { request: req, results, rotationActionTaken, adbDisableActionTaken }
    });

    return {
        success: successes > 0,
        results,
        readbackConfirmed: null 
    };
}
