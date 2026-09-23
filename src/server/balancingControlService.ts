import { getEmsConnectionStatus, getEmsCachedRawStrings, getEmsCachedBlock } from "./emsTurtleClient";
import { setEmsApplicationEnabledStatus } from "./ems/dragonAppControl";
import { fetchLiveEmsApps } from "./ems/emsAppsService";
import { setStringRotation } from "./rotationControlService";
import { appendEvent } from "./history/prizmHistory";
import { ProfileStore } from "./profiles/profileStore";
import {getStringsView} from "./prizmDataCoordinator";
import { buildBalancingCommand } from "./balancingCommandProto";
import {assessBalancingReport, runBalancingVerification, summarizeBalancingVerification, type BalancingVerificationJob, type StringVerification} from "./balancingVerification";

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

function prepareBalancingCommands(req: BalancingExecuteRequest): Buffer[] {
    const active = ProfileStore.getActiveProfile();
    const cached = getEmsCachedBlock()?.data;
    const block = cached?.blockReport ?? cached;
    const topology = block?.topology ?? {};
    const stationCode = String(active?.stationCode || "").trim();
    const blockIndex = Number(active?.blockIndex);
    if (!stationCode || !Number.isSafeInteger(blockIndex) || blockIndex < 1
        || String(topology.stationCode ?? block?.stationCode ?? "").trim() !== stationCode
        || Number(topology.blockIndex ?? block?.blockIndex) !== blockIndex) {
        throw new Error("Native balancing blocked: active profile and live EMS block identity do not match");
    }
    return req.targets.map((target) => buildBalancingCommand({
        stationCode, blockIndex, array: Number(target.array),
        string: target.allStrings === true ? undefined : Number(target.string),
        mode: req.mode as "avg" | "provided", providedMv: req.providedMv,
        chargingDeadband: Number(req.chargingDeadband),
        dischargingDeadband: Number(req.dischargingDeadband),
        requestedBy: req.requestedBy
    }).buffer);
}

async function postBalancingCommand(hostBase: string, buffer: Buffer) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
        const response = await fetch(`${hostBase}/tools/controls/ems/command`, {
            method: "POST", headers: { "Content-Type": "application/octet-stream" },
            body: buffer as any, signal: controller.signal
        });
        return { ok: response.ok, status: response.status, text: await response.text() };
    } finally {
        clearTimeout(timeout);
    }
}

const BALANCING_VERIFY_DEADLINE_MS = Number(process.env.PRIZM_BALANCING_VERIFY_DEADLINE_MS) || 15_000;
const BALANCING_VERIFY_INTERVAL_MS = 750;
const balancingVerificationJobs = new Map<string, BalancingVerificationJob>();
export {extractBpcBalancingSettings, bpcSettingsMatchRequest} from "./balancingVerification";

async function readStringSettings(hostBase: string, req: BalancingPreflightRequest, row: StringVerification) {
    const result = await fetchWithTimeout(`${hostBase}/tools/report/ems/array/${row.array}/string/${row.string}/report.json`, 5000);
    if (!result.ok) return {status: "unavailable" as const, detail: `BPC report unavailable (HTTP ${result.status})`};
    try {return assessBalancingReport(JSON.parse(result.text), req, row, Date.now());}
    catch {return {status: "unavailable" as const, detail: "Invalid BPC settings report"};}
}

function expectedBpcs(array: number, string: number): number {
    const rows = getStringsView()?.strings ?? [];
    const row = rows.find((r: any) => Number(r.arrayNumber) === array && Number(r.stringNumber) === string);
    // Do not infer complete coverage from the same potentially partial readback.
    const count = Number(row?.bpcs?.expectedCount ?? row?.bpcCount);
    return Number.isInteger(count) && count > 0 ? count : 0;
}

export function getBalancingVerificationJob(id: string) {
    const job = balancingVerificationJobs.get(id);
    return job ? {...job, summary: summarizeBalancingVerification(job)} : null;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateTargets(req: BalancingPreflightRequest): void {
    if (!req.targets || !Array.isArray(req.targets) || req.targets.length === 0) throw new Error("No targets specified");
    const seen = new Set<string>();
    for (const target of req.targets) {
        const array = Number(target.array);
        if (!Number.isInteger(array) || array < 1 || array > 8) throw new Error(`Invalid array target: ${target.array}`);
        const isArray = target.allStrings === true;
        if (!isArray) {
            const string = Number(target.string);
            const stringsPerArray = Number((ProfileStore.getActiveProfile() as any)?.stringsPerArray) || 40;
            if (!Number.isInteger(string) || string < 1 || string > stringsPerArray) throw new Error(`Invalid string target: A${array}-S${target.string}`);
        }
        const key = isArray ? `A${array}:*` : `A${array}:S${Number(target.string)}`;
        if (seen.has(key)) throw new Error(`Duplicate balancing target: ${key}`);
        seen.add(key);
    }
}

export function countActiveBalancingCells(payload: any): number | null {
    const model = payload?.stringViewerDataModel ?? payload;
    const packs = model?.balancingMap?.batteryPacks;
    if (!packs || typeof packs !== "object") return null;
    let active = 0;
    for (const pack of Object.values(packs) as any[]) {
        const groups = pack?.cellGroups;
        if (!groups || typeof groups !== "object") continue;
        for (const group of Object.values(groups) as any[]) {
            const value = String(group?.value ?? "").trim();
            if (value && value !== "---" && value !== "--") active += 1;
        }
    }
    return active;
}

async function fetchBalancingActivity(hostBase: string, array: number, string: number) {
    const url = `${hostBase}/tools/monitor/ems/stringviewer/array/${array}/${string}/data`;
    const result = await fetchWithTimeout(url, 2500);
    if (!result.ok) return { array, string, available: false, activeCells: null as number | null };
    try {
        const payload = JSON.parse(result.text);
        const activeCells = countActiveBalancingCells(payload);
        return { array, string, available: activeCells !== null, activeCells };
    } catch {
        return { array, string, available: false, activeCells: null as number | null };
    }
}

async function verifyBalancingTarget(hostBase: string, req: BalancingPreflightRequest, target: BalancingPreflightRequest["targets"][number]) {
    const stringsPerArray = Number((ProfileStore.getActiveProfile() as any)?.stringsPerArray) || 40;
    const strings = target.allStrings === true
        ? Array.from({ length: stringsPerArray }, (_, index) => index + 1)
        : [Number(target.string)];
    const deadline = Date.now() + BALANCING_VERIFY_DEADLINE_MS;
    let lastReadings: Awaited<ReturnType<typeof fetchBalancingActivity>>[] = [];

    while (Date.now() < deadline) {
        lastReadings = [];
        for (let offset = 0; offset < strings.length; offset += 12) {
            lastReadings.push(...await Promise.all(strings.slice(offset, offset + 12).map((string) =>
                fetchBalancingActivity(hostBase, Number(target.array), string)
            )));
        }
        const available = lastReadings.filter((reading) => reading.available);
        const activeCells = available.reduce((sum, reading) => sum + Number(reading.activeCells || 0), 0);
        if (req.mode === "stop" && available.length === strings.length && activeCells === 0) {
            return { confirmed: true, state: "stopped", status: `Balancing stopped on ${available.length}/${strings.length} reporting string(s)`, activeCells, availableStrings: available.length, totalStrings: strings.length };
        }
        if (req.mode !== "stop" && activeCells > 0) {
            return { confirmed: true, state: "active", status: `Balancing activity confirmed on ${activeCells} cell group(s)`, activeCells, availableStrings: available.length, totalStrings: strings.length };
        }
        await sleep(BALANCING_VERIFY_INTERVAL_MS);
    }

    const available = lastReadings.filter((reading) => reading.available);
    const activeCells = available.reduce((sum, reading) => sum + Number(reading.activeCells || 0), 0);
    if (req.mode !== "stop" && available.length > 0 && activeCells === 0) {
        return { confirmed: null, state: "idle-within-deadband", status: `Command accepted; ${available.length}/${strings.length} string(s) reported no active shunts. Cells may already be within the requested deadband.`, activeCells, availableStrings: available.length, totalStrings: strings.length };
    }
    return { confirmed: null, state: "telemetry-unavailable", status: `Command accepted; balancing telemetry available on ${available.length}/${strings.length} string(s)`, activeCells, availableStrings: available.length, totalStrings: strings.length };
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

export function buildBalancingCommandUrl(hostBase: string, req: BalancingPreflightRequest, target: BalancingPreflightRequest["targets"][number]): string {
    const isArrayTarget = req.targetType === "array" || target.allStrings === true;
    const targetPath = isArrayTarget
        ? `/tools/controls/ems/array/${target.array}`
        : `/tools/controls/ems/array/${target.array}/string/${target.string}`;

    if (req.mode === "stop") return `${hostBase}${targetPath}/balance/stop`;
    throw new Error("Legacy balancing URLs discard deadbands; use native protobuf delivery");
}

export async function getBalancingCapabilities() {
    const nativeEnabled = process.env.PRIZM_BALANCING_PROTO_ENABLED === "true";
    return {
        strings: {
            avg: nativeEnabled,
            providedMv: nativeEnabled,
            stop: true,
            highest: false,
            lowest: false
        },
        arrays: {
            avg: nativeEnabled,
            providedMv: nativeEnabled,
            stop: true,
            highest: false,
            lowest: false
        },
        adbPreflight: true,
        executor: nativeEnabled ? "turtle-native-protobuf" : "native-balancing-disabled",
        method: "POST-binary-command-for-active-balancing; legacy-GET-for-stop"
    };
}

function getEmsBaseUrl(): string {
    const active = ProfileStore.getActiveProfile();
    const status = getEmsConnectionStatus();
    if (status.source === "offline" || !active) throw new Error("EMS Connection not available");
    return `http://${active.emsHost}:${active.emsPort}${active.turtlePath.replace(/\/$/, '')}`;
}

export async function executePreflightCheck(req: BalancingPreflightRequest) {
    validateTargets(req);
    if (req.mode !== "stop") {
        if (!Number.isFinite(req.chargingDeadband) || Number(req.chargingDeadband) < 0) throw new Error("A non-negative charging deadband is required");
        if (!Number.isFinite(req.dischargingDeadband) || Number(req.dischargingDeadband) < 0) throw new Error("A non-negative discharging deadband is required");
    }

    const emsUrl = getEmsBaseUrl();

    // Check ADB Status
    let adbEnabled: boolean | null = null;
    let statusKnown = false;
    let warnings: string[] = [];
    
    try {
        // EMS exposes app state through BlockViewer. The former
        // /tools/controls/ems/apps lookup is not a readable endpoint on this
        // Turtle version and returns 404.
        const appsRes = await fetchWithTimeout(`${emsUrl}/tools/monitor/ems/blockviewer/data`, 5000);
        if (appsRes.ok && appsRes.text) {
            const root = JSON.parse(appsRes.text);
            const appsJSON = root?.dragonApps ?? root?.apps ?? root?.emsApps ?? root?.data?.dragonApps ?? root?.data?.apps ?? root?.data?.emsApps ?? [];
            if (Array.isArray(appsJSON)) {
                const adb = appsJSON.find((a: any) => String(a.appCode ?? a.applicationTypeCode ?? "").trim() === "ADB0001");
                if (adb) {
                    const health = String(adb.health ?? "").toUpperCase();
                    adbEnabled = adb.enabled === true ? true : adb.enabled === false ? false : health.includes("NOT_ENABLED") || health.includes("DISABLED") ? false : health.includes("HEALTHY") ? true : null;
                    statusKnown = adbEnabled !== null;
                } else warnings.push("ADB0001 app not found in EMS BlockViewer data.");
            }
        } else warnings.push(`EMS BlockViewer app lookup failed (HTTP ${appsRes.status || "unavailable"}).`);
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
    
    const enrichedTargets = req.targets.flatMap<BalancingPreflightRequest["targets"][number] & {rotationStatus: "IN" | "OUT" | "UNKNOWN"}>(t => {
        const candidateRows = t.allStrings === true
            ? rawData.filter((r: any) => Number(r.arrayIndex ?? r.array) === Number(t.array))
            : [rawData.find((r: any) => Number(r.arrayIndex ?? r.array) === Number(t.array) && Number(r.stringIndex ?? r.string) === Number(t.string))].filter(Boolean);
        const expectedCount = t.allStrings === true ? Number((ProfileStore.getActiveProfile() as any)?.stringsPerArray) || 40 : 1;
        const rows = candidateRows.slice(0, expectedCount);
        const enriched = rows.map((stringMeta: any) => {
            const rawOut = stringMeta.out_rotation ?? stringMeta.outRotation ?? stringMeta.outOfRotation;
            const isOut = rawOut === true || rawOut === 1 || String(rawOut).toLowerCase() === "true" || String(stringMeta.rotation || "").toLowerCase() === "fault";
            if (isOut) outOfRotationCount++; else inRotationCount++;
            return { array: Number(t.array), string: Number(stringMeta.stringIndex ?? stringMeta.string), allStrings: false, rotationStatus: isOut ? "OUT" as const : "IN" as const };
        });
        for (let missing = rows.length; missing < expectedCount; missing++) unknownCount++;
        if (enriched.length === 0 && expectedCount === 1) return [{ ...t, rotationStatus: "UNKNOWN" as const }];
        return enriched;
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
            total: inRotationCount + outOfRotationCount + unknownCount,
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
    validateTargets(req);
    if (req.mode !== "stop" && process.env.PRIZM_BALANCING_PROTO_ENABLED !== "true") {
        throw new Error("Balancing is blocked: native deadband command delivery has not been enabled for this deployment");
    }
    
    // conservative range is 2500 - 3800
    if (req.mode === "provided" && req.providedMv !== undefined && (req.providedMv < 2500 || req.providedMv > 3800)) {
        throw new Error("providedMv is outside conservative range of 2500-3800 mV");
    }

    const hostBase = getEmsBaseUrl();
    // Check identity and encode every command before ADB or rotation can change.
    const preparedCommands = req.mode === "stop" ? [] : prepareBalancingCommands(req);

    // Repeat preflight at execution time so a stale or hand-crafted client
    // cannot bypass the ADB/rotation checks performed by the dialog.
    const livePreflight = await executePreflightCheck(req);
    if (!livePreflight.adb.statusKnown) throw new Error("ADB status is unknown; balancing is blocked until EMS app state can be verified");
    if (req.preflightChoice === "balance-directly" && livePreflight.adb.enabled === true && (livePreflight.targetRotation.inRotationCount > 0 || livePreflight.targetRotation.unknownCount > 0)) {
        throw new Error("ADB0001 is enabled and one or more targets are in rotation or unknown; move targets out of rotation or disable ADB first");
    }

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
        const rotationResult = await setStringRotation({
            targets: req.targets,
            action: 'out',
            reason: req.reason || 'Balancing Preflight',
            note: req.note,
            confirmed: true
        });
        const rotationVerified = Array.isArray(rotationResult?.results) && rotationResult.results.length > 0 && rotationResult.results.every((result: any) => result.accepted === true && result.readbackConfirmed === true);
        if (!rotationVerified) throw new Error("Balancing blocked because out-of-rotation preparation was not fully verified");
        rotationActionTaken = true;
    }

    const results = [];
    let successes = 0;
    let failures = 0;

    for (const [index, target] of req.targets.entries()) {
        try {
            const response = req.mode === "stop"
                ? await fetchWithTimeout(buildBalancingCommandUrl(hostBase, req, target), 15000)
                : await postBalancingCommand(hostBase, preparedCommands[index]);
            
            if (response.ok) {
                // Acceptance is not application. Active commands get a read-only
                // background job; do not block dispatch behind every array's reads.
                const verification = req.mode === "stop" ? await verifyBalancingTarget(hostBase, req, target) : null;
                const verified = verification?.confirmed === true;
                results.push({target, success: verified, accepted: true, acceptedAt: Date.now(),
                    responseStatus: response.status, chargingDeadband: req.chargingDeadband,
                    dischargingDeadband: req.dischargingDeadband, readbackConfirmed: req.mode === "stop" ? verified : null,
                    readbackState: verification?.state ?? "pending", readbackStatus: verification?.status ?? "Accepted; waiting for fresh BPC settings"});
                if (verified) successes++; else if (req.mode === "stop") failures++;
            } else {
                 results.push({ target, success: false, accepted: false, responseStatus: response.status, responseText: response.text, error: response.text });
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

    const acceptedTargets = results.filter(result => result.accepted === true);
    const verificationId = acceptedTargets.length && req.mode !== "stop" ? crypto.randomUUID() : null;
    if (verificationId) {
        const createdAt = Date.now();
        const strings: StringVerification[] = results.flatMap(result => {
            const target = result.target;
            const count = Number(ProfileStore.getActiveProfile()?.stringsPerArray) || 40;
            const numbers = target.allStrings ? Array.from({length: count}, (_, i) => i + 1) : [Number(target.string)];
            return numbers.map(string => ({array: Number(target.array), string, expectedBpcs: expectedBpcs(Number(target.array), string),
                acceptedAt: result.acceptedAt ?? createdAt, status: result.accepted === true ? "pending" as const : "not-accepted" as const,
                detail: result.accepted === true ? "EMS accepted; waiting for settings to propagate" : "EMS acceptance not confirmed; not automatically retried"}));
        });
        const job: BalancingVerificationJob = {id: verificationId, status: "pending", createdAt, updatedAt: createdAt,
            request: {mode: req.mode, chargingDeadband: req.chargingDeadband, dischargingDeadband: req.dischargingDeadband, providedMv: req.providedMv}, strings};
        balancingVerificationJobs.set(verificationId, job);
        // Keep pending jobs; prune only completed ones.
        for (const [id, old] of balancingVerificationJobs) {
            if (balancingVerificationJobs.size <= 100) break;
            if (old.status === "complete") balancingVerificationJobs.delete(id);
        }
        void runBalancingVerification(job, row => readStringSettings(hostBase, req, row)).catch(() => {
            for (const row of job.strings) if (row.status === "pending" || row.status === "matched") {
                row.status = "unavailable"; row.detail = "Verification interrupted; do not assume failure or resend";
            }
            job.status = "complete"; job.updatedAt = Date.now();
        });
    }

    return {
        success: successes === req.targets.length && failures === 0,
        results,
        verificationId,
        verification: verificationId ? getBalancingVerificationJob(verificationId) : null,
        accepted: results.every(result => result.accepted === true),
        readbackConfirmed: results.length > 0 && results.every((result: any) => result.readbackConfirmed === true)
    };
}
