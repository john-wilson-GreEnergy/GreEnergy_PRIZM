import { appendEvent } from "./history/prizmHistory";
import {beginTimelineCommand} from "./history/commandTimeline";
import { ProfileStore } from './profiles/profileStore';
import { compactFullArrayStringTargets } from './controlTargetOptimizer';
import { boundedControlRequest } from './controls/boundedRequest';
import { resolveControlDestination } from './controls/controlDestination';
import { assessPcsRotation, pcsRowsFromBlock, pcsRowFromReport, rotationOutcome } from './controls/pcsRotationReadback';

async function fetchWithTimeout(url: string, timeoutMs: number = 2000): Promise<{ ok: boolean, status: number, text: string }> {
    try {
        return await boundedControlRequest(url, timeoutMs);
    } catch (e: any) {
        return { ok: false, status: 0, text: e.message };
    }
}

const ROTATION_VERIFY_INTERVAL_MS = 350;
const ROTATION_VERIFY_DEADLINE_MS = 10_000;

function strictBool(value: any): boolean | null {
    if (value === true || value === false) return value;
    if (value === null || value === undefined || value === '') return null;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'in') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'out') return false;
    return null;
}

export function rotationReadbackMatches(raw: any, action: 'in' | 'out'): boolean | null {
    const model = raw?.stringViewerDataModel ?? raw;
    const outRotation = strictBool(model?.outRotation);
    const inRotation = strictBool(model?.inRotation);
    const status = String(model?.rotationStatus ?? '').trim().toUpperCase();
    const actualIn = outRotation !== null ? !outRotation : inRotation !== null ? inRotation : status === 'IN' ? true : status === 'OUT' ? false : null;
    return actualIn === null ? null : action === 'in' ? actualIn : !actualIn;
}

async function fetchStringRotation(hostBase: string, array: number, string: number): Promise<boolean | null> {
    const url = `${hostBase}/tools/monitor/ems/stringviewer/array/${array}/${string}/data`;
    const result = await fetchWithTimeout(url, 1800);
    if (!result.ok) return null;
    try {
        return rotationReadbackMatches(JSON.parse(result.text), 'in');
    } catch {
        return null;
    }
}

async function verifyStringRotation(hostBase: string, target: any, action: 'in' | 'out'): Promise<{ confirmed: boolean | null; status: string }> {
    const strings = target.type === 'string-single'
        ? [Number(target.string)]
        : Array.from({ length: Number((ProfileStore.getActiveProfile() as any)?.stringsPerArray) || 40 }, (_, index) => index + 1);
    const deadline = Date.now() + ROTATION_VERIFY_DEADLINE_MS;
    let consecutiveMatches = 0;
    let lastMatches = 0;
    let lastKnown = 0;

    while (Date.now() < deadline) {
        const readings: Array<boolean | null> = [];
        for (let offset = 0; offset < strings.length; offset += 12) {
            readings.push(...await Promise.all(strings.slice(offset, offset + 12).map(async (string) => {
                const inMatch = await fetchStringRotation(hostBase, Number(target.array), string);
                return inMatch === null ? null : action === 'in' ? inMatch : !inMatch;
            })));
        }
        lastKnown = readings.filter((value) => value !== null).length;
        lastMatches = readings.filter((value) => value === true).length;
        const allMatch = lastKnown === strings.length && lastMatches === strings.length;
        consecutiveMatches = allMatch ? consecutiveMatches + 1 : 0;
        if (consecutiveMatches >= 2) {
            return {
                confirmed: true,
                status: target.type === 'string-single'
                    ? `Target confirmed ${action} by two fresh StringViewer readings`
                    : `All ${strings.length} array strings confirmed ${action} by two fresh StringViewer readings`
            };
        }
        await new Promise((resolve) => setTimeout(resolve, ROTATION_VERIFY_INTERVAL_MS));
    }

    if (lastKnown === 0) return { confirmed: null, status: 'Command accepted; fresh rotation telemetry remained unavailable' };
    return { confirmed: false, status: `Command accepted; ${lastMatches}/${strings.length} strings confirmed ${action} before timeout` };
}

async function readPcsRows(hostBase: string, timeoutMs: number) {
    const response = await boundedControlRequest(`${hostBase}/tools/monitor/ems/blockviewer/data?rotationVerify=${Date.now()}`, timeoutMs, {headers: {'Cache-Control': 'no-cache'}});
    if (!response.ok) throw new Error(`PCS readback unavailable (HTTP ${response.status})`);
    return pcsRowsFromBlock(JSON.parse(response.text));
}

function validateRotationTargets(targets: any[], kind: 'string' | 'pcs') {
    const stringsPerArray = Number(ProfileStore.getActiveProfile()?.stringsPerArray) || 40;
    for (const target of targets) {
        const all = kind === 'string' ? target?.allStrings : target?.allPcs;
        const id = kind === 'string' ? target?.string : target?.pcs;
        if (!target || !Number.isSafeInteger(target.array) || target.array < 1 || target.array > 8 ||
            (all !== undefined && typeof all !== 'boolean') ||
            (all !== true && (!Number.isSafeInteger(id) || id < 1 || (kind === 'string' && id > stringsPerArray)))) {
            throw new Error('Invalid rotation target; no commands were sent');
        }
    }
}

async function readPcsRotationReports(hostBase: string, array: number, ids: number[], deadline: number) {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; offset < ids.length && Date.now() < deadline; offset += 4) {
        const batch = await Promise.all(ids.slice(offset, offset + 4).map(async pcs => {
            try {
                const response = await boundedControlRequest(`${hostBase}/tools/report/ems/array/${array}/pcs/${pcs}/report.json`, Math.max(1, Math.min(1800, deadline - Date.now())), {headers: {'Cache-Control': 'no-cache'}});
                return response.ok ? pcsRowFromReport(JSON.parse(response.text), array, pcs) : null;
            } catch { return null; }
        }));
        rows.push(...batch.filter((row): row is Record<string, unknown> => row !== null));
    }
    return rows;
}

export async function executeRotationCommand(target: any, action: 'in' | 'out', pinnedDestination?: ReturnType<typeof resolveControlDestination>): Promise<any> {
    if (action !== 'in' && action !== 'out') throw new Error('Invalid rotation action');
    if (!['string-array', 'string-single', 'pcs-array', 'pcs-single'].includes(target?.type)) throw new Error('Invalid target type');
    validateRotationTargets([{...target, allStrings: target.type === 'string-array', allPcs: target.type === 'pcs-array'}], target.type.startsWith('string') ? 'string' : 'pcs');
    const destination = pinnedDestination ?? resolveControlDestination();
    destination.assertCurrent();
    const hostBase = destination.baseUrl;

    let url = '';
    
    if (target.type === 'string-array') {
        url = `${hostBase}/tools/controls/ems/array/${target.array}/rotate/strings/${action}`;
    } else if (target.type === 'string-single') {
        url = `${hostBase}/tools/controls/ems/array/${target.array}/string/${target.string}/rotate/strings/${action}`;
    } else if (target.type === 'pcs-array') {
        url = `${hostBase}/tools/controls/ems/array/${target.array}/rotate/arrayPcses/${action}`;
    } else if (target.type === 'pcs-single') {
        url = `${hostBase}/tools/controls/ems/array/${target.array}/arrayPcs/${target.pcs}/rotate/arrayPcses/${action}`;
    } else {
        throw new Error("Invalid target type");
    }

    // Freeze the IDs returned by a new EMS inventory read before an array command.
    // If inventory is unavailable, do not dispatch a broad command with unknowable coverage.
    let expectedPcsIds: number[] = [];
    if (target.type.startsWith('pcs')) {
        const inventory = await readPcsRows(hostBase, 2000);
        const ids = inventory.filter(row => Number(row.arrayIndex ?? row.arrayNumber) === Number(target.array))
            .map(row => Number(row.pcsIndex ?? row.arrayPcsIndex));
        if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length ||
            (target.type === 'pcs-single' && !ids.includes(target.pcs))) throw new Error('PCS inventory is missing, ambiguous, or does not include the target; no command was sent');
        expectedPcsIds = target.type === 'pcs-single' ? [target.pcs] : ids;
    }
    destination.assertCurrent();
    const timelineCommand = beginTimelineCommand(hostBase, {
        array: Number(target.array),
        string: target.type === 'string-single' ? Number(target.string) : undefined,
        pcs: target.type === 'pcs-single' ? Number(target.pcs) : undefined,
        allStrings: target.type === 'string-array',
        allPcs: target.type === 'pcs-array'
    }, `Rotation ${action.toUpperCase()}`);
    const dispatchedAt = Date.now();
    const result = await fetchWithTimeout(url, 2000);
    
    // Always attempt a readback
    let readbackConfirmed = null;
    let readbackStatus = 'Readback not checked or unavailable';

    const accepted = result.ok;
    if (accepted) {
        try {
            if (target.type.startsWith('string')) {
                const verification = await verifyStringRotation(hostBase, target, action);
                destination.assertCurrent();
                readbackConfirmed = verification.confirmed;
                readbackStatus = verification.status;
            } else if (target.type.startsWith('pcs')) {
                const deadline = Date.now() + ROTATION_VERIFY_DEADLINE_MS;
                let consecutiveMatches = 0;
                const verifiedTimestamps = new Map<number, string>();
                while (Date.now() < deadline) {
                    destination.assertCurrent();
                    let match: boolean | null = null;
                    try {
                        const rows = await readPcsRotationReports(hostBase, Number(target.array), expectedPcsIds, deadline);
                        destination.assertCurrent();
                        match = assessPcsRotation(rows, Number(target.array), expectedPcsIds, action, dispatchedAt);
                        if (match === true) {
                            const newer = rows.every(row => !verifiedTimestamps.has(Number(row.pcsIndex)) || String(row.sourceTimestampUtc) > verifiedTimestamps.get(Number(row.pcsIndex))!);
                            if (!newer) {
                                // Re-reading the same controller report is not independent confirmation.
                                await new Promise(resolve => setTimeout(resolve, Math.min(ROTATION_VERIFY_INTERVAL_MS, Math.max(0, deadline - Date.now()))));
                                continue;
                            }
                            rows.forEach(row => verifiedTimestamps.set(Number(row.pcsIndex), String(row.sourceTimestampUtc)));
                        } else verifiedTimestamps.clear();
                    } catch { /* Unknown never confirms a command. */ }
                    readbackConfirmed = match === false ? false : null;
                    consecutiveMatches = match === true ? consecutiveMatches + 1 : 0;
                    if (consecutiveMatches >= 2) { readbackConfirmed = true; break; }
                    if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, Math.min(ROTATION_VERIFY_INTERVAL_MS, deadline - Date.now())));
                }
                readbackStatus = readbackConfirmed === true
                    ? `${expectedPcsIds.length} EMS-listed PCS confirmed ${action} by two advancing PCS report timestamps`
                    : 'Command accepted; fresh PCS rotation readback was not confirmed';
            }
        } catch(e) {}
    }

    timelineCommand.result({accepted, readbackConfirmed});
    return {
        target,
        requestedAction: action,
        turtleUrl: url,
        accepted,
        responseStatus: result.status,
        responseText: result.text,
        readbackConfirmed,
        readbackStatus,
        error: !result.ok ? result.text : undefined
    };
}

export async function setStringRotation(req: any) {
    if (!req.targets || !Array.isArray(req.targets) || req.targets.length === 0) throw new Error("No targets specified");
    if (req.action !== 'in' && req.action !== 'out') throw new Error("Invalid action");
    
    if (req.confirmed !== true) throw new Error("Explicit confirmation is required");
    validateRotationTargets(req.targets, 'string');
    const destination = resolveControlDestination();

    const stringsPerArray = Number((ProfileStore.getActiveProfile() as any)?.stringsPerArray) || 40;
    const optimizedTargets = compactFullArrayStringTargets(req.targets, stringsPerArray);
    const results = [];
    let successes = 0;

    for (const t of optimizedTargets) {
      try {
        if (!t.array) continue;
        if (t.allStrings) {
            const res = await executeRotationCommand({ ...t, type: 'string-array' }, req.action, destination);
            results.push(res);
            if (res.accepted) successes++;
        } else if (t.string) {
            const res = await executeRotationCommand({ ...t, type: 'string-single' }, req.action, destination);
            results.push(res);
            if (res.accepted) successes++;
        }
      } catch (error) {
        results.push({target: t, accepted: false, readbackConfirmed: null, error: String(error), readbackStatus: 'Not dispatched; pre-dispatch validation or inventory failed'});
      }
    }

    appendEvent({ entityKey: "prizm-core-control", timestampUtc: new Date().toISOString(), 
        action: `String Rotation ${req.action.toUpperCase()}`,
        level: "warning",
        category: "Control",
        details: `Requested rotation ${req.action} for ${req.targets.length} selected targets, optimized to ${optimizedTargets.length} EMS command targets. Reason: ${req.reason || 'None'}. Note: ${req.note || 'None'}. Successful executions: ${successes}`,
        user: "LocalOperator",
        metadata: { request: req, results, confirmed: req.confirmed, reason: req.reason, note: req.note }
    });

    return rotationOutcome(results);
}

export async function setPcsRotation(req: any) {
    if (!req.targets || !Array.isArray(req.targets) || req.targets.length === 0) throw new Error("No targets specified");
    if (req.action !== 'in' && req.action !== 'out') throw new Error("Invalid action");
    
    if (req.confirmed !== true) throw new Error("Explicit confirmation is required");
    validateRotationTargets(req.targets, 'pcs');
    const destination = resolveControlDestination();

    const results = [];
    let successes = 0;

    for (const t of req.targets) {
      try {
        if (!t.array) continue;
        if (t.allPcs) {
            const res = await executeRotationCommand({ ...t, type: 'pcs-array' }, req.action, destination);
            results.push(res);
            if (res.accepted) successes++;
        } else if (t.pcs) {
            const res = await executeRotationCommand({ ...t, type: 'pcs-single' }, req.action, destination);
            results.push(res);
            if (res.accepted) successes++;
        }
      } catch (error) {
        results.push({target: t, accepted: false, readbackConfirmed: null, error: String(error), readbackStatus: 'Not dispatched; pre-dispatch validation or inventory failed'});
      }
    }

    appendEvent({ entityKey: "prizm-core-control", timestampUtc: new Date().toISOString(), 
        action: `PCS Rotation ${req.action.toUpperCase()}`,
        level: "warning",
        category: "Control",
        details: `Requested rotation ${req.action} for ${req.targets.length} target PCS. Reason: ${req.reason || 'None'}. Note: ${req.note || 'None'}. Successful executions: ${successes}`,
        user: "LocalOperator",
        metadata: { request: req, results, confirmed: req.confirmed, reason: req.reason, note: req.note }
    });

    return rotationOutcome(results);
}
