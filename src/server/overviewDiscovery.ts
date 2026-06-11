import { Router } from "express";
import { 
    pollEmsTurtle, 
    getEmsCachedBlock, 
    getEmsCachedStatus, 
    getEmsCachedLastCall, 
    getEmsCachedControllerStatistics, 
    getEmsCachedStatusCodes, 
    getEmsCachedRawStrings, 
    getEmsIpMap, 
    getEmsStringIpMap, 
    getEmsCachedFirstResponder,
    getEmsSourcesDebugInfo,
    getEmsConnectionStatus
} from "./emsTurtleClient";

const router = Router();

function walkObjectForDiscovery(obj: any, collected: any, maxDepth = 10, currentDepth = 0) {
    if (currentDepth > maxDepth) return;
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
        for (const item of obj) {
            walkObjectForDiscovery(item, collected, maxDepth, currentDepth + 1);
        }
        return;
    }

    // Process object
    const keys = Object.keys(obj);
    for (const key of keys) {
        collected.addKey(key);
        const val = obj[key];
        
        // Category detection
        const keyLower = key.toLowerCase();
        
        // Block Topology indicators
        if (keyLower === 'entitytype' || keyLower === 'entitysubtype') {
            if (obj.entitySubType) collected.addTopologySubtype(obj.entitySubType);
            collected.blockTopologyCandidates.push(obj);
        }
        
        // EMS Apps indicators
        if (keyLower === 'appcode' || keyLower === 'application' || (keyLower === 'priority' && obj.appCode)) {
            collected.emsAppsCandidates.push(obj);
        }
        
        // PCS
        if (keyLower === 'pcsindex' || keyLower === 'pcs') {
            collected.pcsCandidates.push(obj);
        }
        
        // HVAC / Centipede
        if (keyLower === 'hvacindex' || keyLower === 'centipede' || keyLower === 'ctc' || (keyLower.includes('thermal') && keyLower.includes('control'))) {
            collected.hvacCandidates.push(obj);
        }
        
        // HTS
        if (keyLower === 'htsindex' || keyLower === 'humidity' && obj.temperature !== undefined) {
             collected.htsCandidates.push(obj);
        }
        
        // UPS
        if (keyLower === 'upsindex' || (keyLower === 'ups' && typeof val === 'object')) {
             collected.upsCandidates.push(obj);
        }
        
        // Array Summary
        if (keyLower === 'arrayindex' && (obj.stackCount || obj.nearlineSoc !== undefined)) {
             collected.arrayCandidates.push(obj);
        }

        // Descend
        if (typeof val === 'object' && val !== null) {
            walkObjectForDiscovery(val, collected, maxDepth, currentDepth + 1);
        }
    }
}

function processSource(data: any, collected: any) {
    if (!data || !data.data) return { objectCount: 0, keys: [] };
    const tempKeys = new Set<string>();
    const originalAddKey = collected.addKey;
    collected.addKey = (k: string) => { tempKeys.add(k); originalAddKey.call(collected, k); };
    let count = 0;
    
    // Quick object counter
    function countObj(o: any) {
        if (!o || typeof o !== 'object') return;
        count++;
        if (Array.isArray(o)) { o.forEach(countObj); }
        else { Object.values(o).forEach(countObj); }
    }
    countObj(data.data);
    
    walkObjectForDiscovery(data.data, collected);
    
    collected.addKey = originalAddKey;
    return { objectCount: count, keys: Array.from(tempKeys).slice(0, 15) };
}

router.get("/discovery", async (req, res) => {
    try {
        if (req.query.refresh === 'true') {
            await pollEmsTurtle();
        }

        const debugInfo = getEmsSourcesDebugInfo();
        const connectionStatus = getEmsConnectionStatus();

        const collected = {
            allKeys: new Set<string>(),
            topologySubtypes: new Set<string>(),
            blockTopologyCandidates: [] as any[],
            emsAppsCandidates: [] as any[],
            pcsCandidates: [] as any[],
            hvacCandidates: [] as any[],
            htsCandidates: [] as any[],
            upsCandidates: [] as any[],
            arrayCandidates: [] as any[],
            
            addKey(k: string) { this.allKeys.add(k); },
            addTopologySubtype(s: string) { this.topologySubtypes.add(s); }
        };

        const blockData = getEmsCachedBlock();
        const blockSummary = processSource(blockData, collected);
        
        const statusData = getEmsCachedStatus();
        const statusSummary = processSource(statusData, collected);
        
        const lastCallData = getEmsCachedLastCall();
        const lastCallSummary = processSource(lastCallData, collected);
        
        const ctrlStatsData = getEmsCachedControllerStatistics();
        const ctrlStatsSummary = processSource(ctrlStatsData, collected);
        
        const bessStatusCodesData = getEmsCachedStatusCodes();
        const bessStatusCodesSummary = processSource(bessStatusCodesData, collected);
        
        const stringsData = getEmsCachedRawStrings();
        // Strings are simple array of objects
        
        const ipMapData = getEmsIpMap();
        const stringIpMapData = getEmsStringIpMap();
        
        const firstResponderDataStr = getEmsCachedFirstResponder();
        const firstResponderData = typeof firstResponderDataStr.data === 'string' ? { data: JSON.parse(firstResponderDataStr.data || "{}") } : firstResponderDataStr;
        
        const sourcesMap: Record<string, any> = {};
        debugInfo.forEach((d: any) => {
            const keyMap: Record<string, string> = {
               '/tools/monitor/ems/blockviewer/data': 'blockviewer',
               '/tools/report/ems/status.json': 'status',
               '/tools/report/ems/lastCall.json': 'lastCall',
               '/tools/report/ems/controllerStatistics.json': 'controllerStatistics',
               '/tools/report/ems/bessStatusCodes.json': 'bessStatusCodes',
               '/tools/report/ems/strings.csv': 'stringsCsv',
               '/tools/report/ems/ipMap.json': 'ipMap',
               '/tools/report/ems/stringIPMap.json': 'stringIpMap',
               '/firstresponder/data': 'firstResponder',
               '/v2/firstresponder/data': 'firstResponderV2'
            };
            const k = keyMap[d.endpoint];
            if (k) {
               sourcesMap[k] = {
                   ok: d.success,
                   url: d.activeEmsBaseUrl + d.endpoint,
                   httpStatus: d.statusCode,
                   durationMs: d.durationMs,
                   error: d.lastError === "NONE" ? undefined : d.lastError
               };
            }
        });
        
        const getSampleItems = (candidates: any[]) => candidates.slice(0, req.query.fullTables === 'true' ? undefined : req.query.includeRawPreview === 'true' ? 2 : 0);

        const mkSection = (candidates: any[]) => ({
            available: candidates.length > 0,
            sourceCandidates: candidates.length > 0 ? ['blockviewer', 'lastCall', 'status'] : [],
            count: candidates.length,
            fieldsObserved: candidates.length > 0 ? Object.keys(candidates[0]).slice(0, 10) : [],
            sampleItems: getSampleItems(candidates)
        });

        const resetEligible = collected.blockTopologyCandidates.filter(c => c.allowFaultReset === true);

        // Analyze arrays and strings from stringsCsv + block
        const arraySummariesFromBlock = blockData.data?.arrays || [];

        res.json({
            profileId: connectionStatus.activeProfileId,
            emsBaseUrl: connectionStatus.activeEmsBaseUrl,
            stationCode: connectionStatus.stationCode,
            blockIndex: connectionStatus.blockIndex,
            generatedAt: new Date().toISOString(),
            durationMs: 0,
            sourceHealth: sourcesMap,
            discoveredSections: {
               emsApps: mkSection(collected.emsAppsCandidates),
               blockTopology: {
                   available: collected.blockTopologyCandidates.length > 0,
                   sourceCandidates: ['blockviewer'],
                   count: collected.blockTopologyCandidates.length,
                   subtypes: Array.from(collected.topologySubtypes),
                   entityTypes: [],
                   resetEligibleCount: resetEligible.length,
                   fieldsObserved: collected.blockTopologyCandidates.length > 0 ? Object.keys(collected.blockTopologyCandidates[0]).slice(0, 5) : [],
                   sampleItems: getSampleItems(collected.blockTopologyCandidates)
               },
               pcs: mkSection(collected.pcsCandidates),
               hvacCentipede: mkSection(collected.hvacCandidates),
               humidityTemperatureSensors: mkSection(collected.htsCandidates),
               ups: mkSection(collected.upsCandidates),
               arraySummary: mkSection(arraySummariesFromBlock),
               stringSummary: {
                   available: stringsData.data && stringsData.data.length > 0,
                   sourceCandidates: ['stringsCsv'],
                   count: stringsData.data?.length || 0,
                   fieldsObserved: stringsData.data && stringsData.data.length > 0 ? Object.keys(stringsData.data[0]) : [],
                   sampleItems: stringsData.data ? getSampleItems(stringsData.data) : []
               },
               safetyResetCandidates: mkSection(resetEligible)
            },
            actionDiscovery: {
               emsApplicationActions: {
                   discoveredButtonsOrLinks: [],
                   discoveredCommandEndpoints: [],
                   discoveredPayloadHints: [],
                   safeToExposeActions: false,
                   notes: "No command endpoints safely validated for EMS Apps in this pass."
               },
               topologyActions: {
                   discoveredButtonsOrLinks: [],
                   discoveredCommandEndpoints: ["/tools/command/ems/ManualClearDeviceFault"],
                   discoveredPayloadHints: [],
                   safeToExposeActions: false,
                   notes: "Safety Fault Clear runs through existing specialized flow."
               }
            },
            recommendedOverviewMapping: {
               sections: ["emsApps", "blockTopology", "pcs", "hvacCentipede", "ups", "arraySummary"],
               notes: ["Data discovered locally maps accurately to cloud summary features."]
            }
        });

    } catch (err: any) {
        console.error("Overview discovery error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
