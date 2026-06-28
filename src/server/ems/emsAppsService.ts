import { ProfileStore } from "../profiles/profileStore";
import { buildEmsBaseUrl } from "../profiles/profileManager";
import { isDemoActive, getEmsCachedBlock } from "../emsTurtleClient";
import { EMS_APP_INTERACTION_REGISTRY, DRAGON_APP_CODE_NAME_MAP, getAppInteraction } from "./emsAppInteractionRegistry";

export async function fetchLiveEmsApps(fast = false): Promise<{ apps: any[], status: string, rawLastCall: any, cacheEntry: any }> {
    const blockCache = getEmsCachedBlock();
    const blockData = blockCache?.data;

    let dragonApps: any[] = [];
    if (blockData && Array.isArray(blockData.dragonApps)) {
        dragonApps = blockData.dragonApps;
    }

    const apps = dragonApps.map((app: any) => {
        const appCode = app.appCode ? String(app.appCode).trim() : (app.applicationTypeCode ? String(app.applicationTypeCode).trim() : null);
        const resolvedNameFromMap = appCode ? DRAGON_APP_CODE_NAME_MAP[appCode] : null;
        const appName = app.appName || app.applicationName || app.application || app.name || resolvedNameFromMap || appCode || "Unknown App";

        const healthRaw = app.health ?? null;
        const healthUpper = String(healthRaw || "").toUpperCase();
        
        const enabled = app.enabled === true ? true : (app.enabled === false ? false : (app.health === "HEALTH_NOT_ENABLED" ? false : null));

        let status = "Unknown";
        if (enabled === true) status = "Enabled";
        if (enabled === false) status = "Not Enabled";
        if (healthUpper.includes("HEALTH_HEALTHY") && enabled !== false) {
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
            appName: appName,
            configName: app.configName ?? app.applicationConfigurationName ?? null,
            configVersionId: app.configVersionId ?? app.configVersionid ?? app.applicationConfigurationVersionid ?? null,
            enabled: enabled,
            enabledRaw: app.enabled ?? null,
            canDisable: app.canDisable ?? null,
            status,
            health: healthRaw,
            healthRaw,
            shortAppStatus: app.shortAppStatus ?? null,
            hasShortAppStatus: app.hasShortAppStatus ?? null,
            appStatus: app.appStatus ?? app.healthMessage ?? null,
            healthMessage: app.healthMessage ?? "",
            reportValues: app.reportValues ?? null,
            hasEditor: app.hasEditor ?? null,
            sourceEndpoint: "/tools/monitor/ems/blockviewer/data",
            sourcePath: "dragonApps[]",
            interaction: interactionMeta.interaction,
            supportedLocally: interactionMeta.supportedLocally,
            safetyLevel: interactionMeta.safetyLevel,
            reason: interactionMeta.reason,
            externalEquivalent: interactionMeta.externalEquivalent ?? null,
            confirmationEnable: interactionMeta.confirmationEnable ?? null,
            confirmationDisable: interactionMeta.confirmationDisable ?? null,
            fields: interactionMeta.fields ?? null,
            raw: app
        };
    });

    return {
        apps,
        status: blockCache?.staleData ? "cached_timeout" : "ok",
        rawLastCall: blockData,
        cacheEntry: blockCache
    };
}
