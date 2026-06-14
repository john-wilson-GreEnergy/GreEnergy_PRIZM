import { ProfileStore } from "../profiles/profileStore";
import { buildEmsBaseUrl } from "../profiles/profileManager";
import { isDemoActive } from "../emsTurtleClient";
import { EMS_APP_INTERACTION_REGISTRY, DRAGON_APP_CODE_NAME_MAP, getAppInteraction } from "./emsAppInteractionRegistry";

let cachedEmsApps: any[] = [];
let cachedRawLastCall: any = null;
let lastFetchTime = 0;

import { getEmsCachedLastCall } from "../emsTurtleClient";

export async function fetchLiveEmsApps(fast = false): Promise<{ apps: any[], status: string, rawLastCall: any, cacheEntry: any }> {
    const lastCallCache = getEmsCachedLastCall();
    const lastCallData = lastCallCache?.data;

    let apps: any[] = [];
    if (lastCallData) {
        apps = extractDragonApps(lastCallData);
    }
    
    return {
        apps,
        status: lastCallCache?.staleData ? "cached_timeout" : "ok",
        rawLastCall: lastCallData,
        cacheEntry: lastCallCache
    };
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
        
        const interactionMeta = getAppInteraction(appCode);
        
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
           interaction: interactionMeta.interaction,
           supportedLocally: interactionMeta.supportedLocally,
           safetyLevel: interactionMeta.safetyLevel,
           reason: interactionMeta.reason,
           cloudEquivalent: interactionMeta.cloudEquivalent ?? null,
           confirmationEnable: interactionMeta.confirmationEnable ?? null,
           confirmationDisable: interactionMeta.confirmationDisable ?? null,
           fields: interactionMeta.fields ?? null,
           raw: app
        };
    });
}
