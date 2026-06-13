import { ProfileStore } from "../profiles/profileStore";
import { buildEmsBaseUrl } from "../profiles/profileManager";
import { isDemoActive } from "../emsTurtleClient";

let cachedEmsApps: any[] = [];
let cachedRawLastCall: any = null;

let lastFetchTime = 0;
let fetchPromise: Promise<any> | null = null;
let lastFetchStatus = "ok"; // "ok", "cached_timeout", "error"

export async function fetchLiveEmsApps(fast = false): Promise<{ apps: any[], status: string, rawLastCall: any }> {
    if (fast && cachedEmsApps.length > 0) {
        // Just return cache immediately, trigger background refresh if old?
        // Actually, if we return cache quickly, we meet "fast and cached-first"
        return { apps: cachedEmsApps, status: lastFetchStatus, rawLastCall: cachedRawLastCall };
    }

    const now = Date.now();
    // Cache for at least 5 seconds to avoid spamming
    if (now - lastFetchTime < 5000 && cachedEmsApps.length > 0) {
        return { apps: cachedEmsApps, status: lastFetchStatus, rawLastCall: cachedRawLastCall };
    }

    if (fetchPromise) {
        return fetchPromise;
    }

    fetchPromise = (async () => {
        try {
            if (isDemoActive()) {
                 // Return empty or dummy
                 lastFetchStatus = "ok";
                 return { apps: cachedEmsApps, status: lastFetchStatus, rawLastCall: cachedRawLastCall };
            }

            const profile = ProfileStore.getActiveProfile();
            if (!profile) {
                 lastFetchStatus = "error";
                 return { apps: cachedEmsApps, status: lastFetchStatus, rawLastCall: cachedRawLastCall };
            }
            const baseUrl = buildEmsBaseUrl(profile);
            const targetUrl = `${baseUrl}/tools/report/ems/lastCall.json`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            try {
                const res = await fetch(targetUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const data = await res.json();
                cachedRawLastCall = data;

                const extracted = extractDragonApps(data);
                cachedEmsApps = extracted;
                lastFetchStatus = "ok";
                lastFetchTime = Date.now();

            } catch (err: any) {
                clearTimeout(timeoutId);
                // If its an abort error, we treat it as timeout
                if (err.name === 'AbortError') {
                    lastFetchStatus = "cached_timeout";
                } else {
                    // generic error, if it's connect timeout Node might throw standard error like ENOTFOUND or ETIMEDOUT
                    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED' || err.message.includes('timeout') || err.message.includes('fetch failed')) {
                         lastFetchStatus = "cached_timeout";
                    } else {
                         lastFetchStatus = "error";
                    }
                }
            }
            return { apps: cachedEmsApps, status: lastFetchStatus, rawLastCall: cachedRawLastCall };
        } finally {
            fetchPromise = null;
        }
    })();

    return fetchPromise;
}

function extractDragonApps(lastCallData: any): any[] {
    let rawApps: any[] = [];
    let pathFound = "";

    // 1. Try exact path: dragonAppReport.dragonAppData.dragonAppSlotData[]
    if (lastCallData?.dragonAppReport?.dragonAppData?.dragonAppSlotData) {
         const slotData = lastCallData.dragonAppReport.dragonAppData.dragonAppSlotData;
         if (Array.isArray(slotData)) {
             rawApps = slotData;
             pathFound = "dragonAppReport.dragonAppData.dragonAppSlotData";
         } else if (typeof slotData === 'object') {
             rawApps = [slotData];
             pathFound = "dragonAppReport.dragonAppData.dragonAppSlotData";
         }
    } 
    // Fallbacks if not found at exact path
    else if (lastCallData?.blockReport?.dragonAppReport?.dragonAppData?.dragonAppSlotData) {
         const slotData = lastCallData.blockReport.dragonAppReport.dragonAppData.dragonAppSlotData;
         if (Array.isArray(slotData)) {
             rawApps = slotData;
             pathFound = "blockReport.dragonAppReport.dragonAppData.dragonAppSlotData";
         } else if (typeof slotData === 'object') {
             rawApps = [slotData];
             pathFound = "blockReport.dragonAppReport.dragonAppData.dragonAppSlotData";
         }
    }

    if (rawApps.length === 0) {
        // Fallback: Recursive search inside lastCall.json
        function searchApps(obj: any, currentPath: string = "") {
            if (!obj || typeof obj !== "object") return;
            if (Array.isArray(obj)) {
                for (let i = 0; i < obj.length; i++) searchApps(obj[i], `${currentPath}[${i}]`);
            } else {
                if (obj.applicationTypeCode || obj.appCode) {
                    if (obj.appName !== undefined || obj.priority !== undefined || obj.applicationPriority !== undefined || obj.configName !== undefined || obj.health !== undefined) {
                        rawApps.push({ ...obj, sourcePath: currentPath || "recursive_fallback" });
                        return; // Found an app, don't recurse deeper in this object
                    }
                }
                for (const [key, value] of Object.entries(obj)) {
                    searchApps(value, currentPath ? `${currentPath}.${key}` : key);
                }
            }
        }
        searchApps(lastCallData);
    } else {
        // tag the source path
        rawApps = rawApps.map(a => ({ ...a, sourcePath: pathFound }));
    }

    // Normalize apps
    const unknownDragonAppCodes: string[] = [];
    const DRAGON_APP_CODE_NAME_MAP: Record<string, string> = {
        ES00001: "E-Stop Response v1.0",
        BSF0001: "Battery Safety v1.0",
        BP00001: "Block Power",
        HCP0001: "High Current Protection App v1.0",
        CAL001: "CAL001",
        CAL0001: "Critical Aux Load v1.0",
        PC00001: "Power Control v1.0",
        SSPC001: "Sunspec Power Command v1.0",
        BOP0001: "Basic Op v1.0",
        SCHED001: "Scheduler v1.0",
        FD00001: "Frequency Droop v1.0",
        AVR0001: "Automatic Voltage Regulation v1.0",
        ETC0001: "Enclosure Control v1.0",
        PCOMP001: "Power Compensator v1.0",
        ADB0001: "Auto Discharge Balancer v1.0",
        SLOW001: "Slow Charge v1.0",
        CTC0001: "Centipede Thermal Control v1.0",
        BS00001: "Backstop v1.0"
    };

    const dedupedApps = rawApps.filter((v,i,a) => a.findIndex(t => (t.appCode || t.applicationTypeCode) === (v.appCode || v.applicationTypeCode) && (t.appName || t.applicationName) === (v.appName || v.applicationName)) === i);

    return dedupedApps.map((app: any) => {
        const appCode = app.appCode ? String(app.appCode).trim() : (app.applicationTypeCode ? String(app.applicationTypeCode).trim() : null);
        let resolvedNameFromMap = null;
        if (appCode) {
            resolvedNameFromMap = DRAGON_APP_CODE_NAME_MAP[appCode];
            if (!resolvedNameFromMap && !unknownDragonAppCodes.includes(appCode)) {
                unknownDragonAppCodes.push(appCode);
            }
        }
        const appName =
            app.appName ||
            app.applicationName ||
            app.application ||
            app.name ||
            resolvedNameFromMap ||
            appCode ||
            "Unknown App";

        const healthRaw = app.health ?? null;
        const healthUpper = String(healthRaw || "").toUpperCase();
        let status = "Unknown";
        if (app.enabled === true) status = "Enabled";
        if (app.enabled === false) status = "Not Enabled";
        if (healthUpper.includes("HEALTH_HEALTHY") && app.enabled !== false) {
            status = "Enabled";
        }
        if (healthUpper.includes("NOT_ENABLED") || healthUpper.includes("DISABLED")) {
            status = "Not Enabled";
        }
        if (healthUpper.includes("FAULT")) {
            status = "Faulted";
        }
        if (healthUpper.includes("WARN")) {
            status = "Warning";
        }
        
        return {
           priority: app.priority ?? app.applicationPriority ?? null,
           appCode: appCode,
           appName,
           configName: app.configName ?? app.applicationConfigurationName ?? null,
           configVersionId: app.configVersionId ?? app.configVersionid ?? app.applicationConfigurationVersionid ?? null,
           enabled: app.enabled ?? null,
           canDisable: app.canDisable ?? null,
           status,
           healthRaw,
           shortAppStatus: app.shortAppStatus ?? null,
           hasShortAppStatus: app.hasShortAppStatus ?? null,
           appStatus: app.appStatus ?? null,
           healthMessage: app.healthMessage ?? null,
           hasEditor: app.hasEditor ?? null,
           sourcePath: app.sourcePath || "discovered",
           raw: app
        };
    });
}
