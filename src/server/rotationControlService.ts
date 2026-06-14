import { getEmsConnectionStatus } from './emsTurtleClient';
import { appendEvent } from "./history/prizmHistory";
import { getEmsCachedRawStrings, getEmsCachedBlock } from './emsTurtleClient';

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

    if (result.ok && result.text.includes('OK')) {
        // Simple artificial delay before readback check
        await new Promise(r => setTimeout(r, 600));

        try {
            if (target.type.startsWith('string')) {
                const stringsRes = getEmsCachedRawStrings();
                if (stringsRes.success && stringsRes.data) {
                    if (target.type === 'string-single') {
                        const sMatch = stringsRes.data.find((s:any) => 
                            (String(s.ArrayNum || s.ArrayNumber) === String(target.array) && String(s.StringNum || s.StringNumber) === String(target.string))
                        );
                        if (sMatch) {
                            const isOut = sMatch.InRotation === false || String(sMatch.InRotation) === "false" || sMatch.RotationStatus === 'OUT';
                            const isIn = sMatch.InRotation === true || String(sMatch.InRotation) === 'true' || sMatch.RotationStatus === 'IN';
                            if (action === 'in' && isIn) readbackConfirmed = true;
                            if (action === 'out' && isOut) readbackConfirmed = true;
                            readbackStatus = readbackConfirmed ? `Target confirmed ${action}` : 'Readback could not be definitively confirmed';
                        }
                    } else {
                        readbackStatus = 'Whole array readback queued for dashboard refresh';
                    }
                }
            } else if (target.type.startsWith('pcs')) {
                 const blockRes = getEmsCachedBlock();
                 if (blockRes.success && blockRes.data && blockRes.data.arrayPcsList) {
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
        accepted: result.ok && result.text.includes('OK'),
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
    
    if (!req.confirmation) throw new Error("Explicit confirmation phrase is required");

    const results = [];
    let successes = 0;

    for (const t of req.targets) {
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
        details: `Requested rotation ${req.action} for ${req.targets.length} target arrays/strings. Successful executions: ${successes}`,
        user: "LocalOperator",
        metadata: { request: req, results }
    });

    return { success: successes > 0, results };
}

export async function setPcsRotation(req: any) {
    if (!req.targets || !Array.isArray(req.targets) || req.targets.length === 0) throw new Error("No targets specified");
    if (req.action !== 'in' && req.action !== 'out') throw new Error("Invalid action");
    
    if (!req.confirmation) throw new Error("Explicit confirmation phrase is required");

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
        details: `Requested rotation ${req.action} for ${req.targets.length} target PCS. Successful executions: ${successes}`,
        user: "LocalOperator",
        metadata: { request: req, results }
    });

    return { success: successes > 0, results };
}