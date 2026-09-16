import { getEmsConnectionStatus } from './emsTurtleClient';
import { appendEvent } from "./history/prizmHistory";
import { getEmsCachedBlock } from './emsTurtleClient';
import { ProfileStore } from './profiles/profileStore';
import { compactFullArrayStringTargets } from './controlTargetOptimizer';

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

export async function executeRotationCommand(target: any, action: 'in' | 'out'): Promise<any> {
    const conn = getEmsConnectionStatus();
    let hostBase = conn.activeEmsBaseUrl || "http://10.0.0.3:8080/turtle";
    if (hostBase.endsWith('/')) hostBase = hostBase.slice(0, -1);

    const isDemo = getEmsConnectionStatus().isDemoFallback;
    if (isDemo) {
        throw new Error("Rotation controls are disabled in Demo mode");
    }

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

    const result = await fetchWithTimeout(url, 2000);
    
    // Always attempt a readback
    let readbackConfirmed = null;
    let readbackStatus = 'Readback not checked or unavailable';

    const accepted = result.ok && result.text.toUpperCase().includes('OK');
    if (accepted) {
        try {
            if (target.type.startsWith('string')) {
                const verification = await verifyStringRotation(hostBase, target, action);
                readbackConfirmed = verification.confirmed;
                readbackStatus = verification.status;
            } else if (target.type.startsWith('pcs')) {
                 const blockRes = getEmsCachedBlock();
                 if (blockRes && blockRes.data && blockRes.data.arrayPcsList) {
                    if (target.type === 'pcs-single') {
                         const pcsMatch = blockRes.data.arrayPcsList.find((p:any) => 
                             String(p.arrayIndex) === String(target.array) && String(p.pcsIndex) === String(target.pcs)
                         );
                         if (pcsMatch) {
                             const rot = String(pcsMatch.rotation).toUpperCase();
                             if ((action === 'in' && rot === 'IN') || (action === 'out' && rot === 'OUT')) {
                                  readbackConfirmed = true;
                             }
                             readbackStatus = readbackConfirmed ? `Target confirmed ${action}` : 'Readback could not be definitively confirmed';
                         }
                    }
                 }
            }
        } catch(e) {}
    }

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

    const stringsPerArray = Number((ProfileStore.getActiveProfile() as any)?.stringsPerArray) || 40;
    const optimizedTargets = compactFullArrayStringTargets(req.targets, stringsPerArray);
    const results = [];
    let successes = 0;

    for (const t of optimizedTargets) {
        if (!t.array) continue;
        if (t.allStrings) {
            const res = await executeRotationCommand({ type: 'string-array', ...t }, req.action);
            results.push(res);
            if (res.accepted) successes++;
        } else if (t.string) {
            const res = await executeRotationCommand({ type: 'string-single', ...t }, req.action);
            results.push(res);
            if (res.accepted) successes++;
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

    return { success: successes > 0, results };
}

export async function setPcsRotation(req: any) {
    if (!req.targets || !Array.isArray(req.targets) || req.targets.length === 0) throw new Error("No targets specified");
    if (req.action !== 'in' && req.action !== 'out') throw new Error("Invalid action");
    
    if (req.confirmed !== true) throw new Error("Explicit confirmation is required");

    const results = [];
    let successes = 0;

    for (const t of req.targets) {
        if (!t.array) continue;
        if (t.allPcs) {
            const res = await executeRotationCommand({ type: 'pcs-array', ...t }, req.action);
            results.push(res);
            if (res.accepted) successes++;
        } else if (t.pcs) {
            const res = await executeRotationCommand({ type: 'pcs-single', ...t }, req.action);
            results.push(res);
            if (res.accepted) successes++;
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

    return { success: successes > 0, results };
}
