const fs = require('fs');

let siteOps = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

// PART C: Update buildStringBucketSummary
const buildStringBucketSummaryReplacement = `export function buildStringBucketSummary(stringsData: any[]) {
    const buckets = {
        online: 0,
        nearline: 0,
        offline: 0,
        notCommunicating: 0
    };
    
    let totalStrings = 0;

    const tableRows = stringsData.map(st => {
        totalStrings++;
        const communicating = 
            st.communicating === true || 
            st.Comms === true || 
            st.communication === true || 
            st.connectionState === "Online" || 
            st.connectionState === "ONLINE" || 
            st.StringConnectionState === "Online" || 
            st.LossOfComms === false || 
            st.lossOfComms === false;
            
        const rawNotComm = 
            st.communicating === false || 
            st.LossOfComms === true || 
            st.lossOfComms === true || 
            st.connectionState === "Offline" || 
            st.connectionState === "OFFLINE";
            
        const isComm = communicating || !rawNotComm; // Default to communicating if not explicitly offline and missing true flags
        const notComm = rawNotComm || !isComm;

        const inRot = 
            st.inRotation === true || 
            st.rotationEnabled === true || 
            st.outRotation === false || 
            st.OutRotation === false || 
            st.out_rotation === false || 
            st.rotation === "in" || 
            st.outOfRotation === false;

        const rawOutRot = 
            st.outRotation === true || 
            st.out_rotation === true || 
            st.OutRotation === true || 
            st.rotationEnabled === false || 
            st.outOfRotation === true ||
            st.rotation === "fault";

        const isInRot = inRot || !rawOutRot; // Default to in rotation if absent

        const contClosed = 
            st.contactorClosed === true || 
            st.contactorStatus === "CLOSED" || 
            st.contactorsClosed === true || 
            (st.positiveContactorClosed === true && st.negativeContactorClosed === true) || 
            (st.positive_contactor_closed === true && st.negative_contactor_closed === true);

        let bucket = "offline";
        if (notComm) {
            bucket = "notCommunicating";
        } else if (!isInRot) {
            bucket = "offline";
        } else if (!contClosed) {
            bucket = "nearline";
        } else {
            bucket = "online";
        }
        
        (buckets as any)[bucket]++;
        
        return {
            ...st,
            bucket,
            communicating: isComm,
            inRotation: isInRot,
            contactorsClosed: contClosed
        };
    });
    
    return { 
        buckets, 
        tableRows,
        rollups: { totalStrings } 
    };
}`;

siteOps = siteOps.replace(/export function buildStringBucketSummary\([\s\S]*?return \{ buckets, tableRows \};\n\}/, buildStringBucketSummaryReplacement);

// PART E: buildStatusCodeDescriptionMap and PART D
const statusCodeMapStr = `
function buildStatusCodeDescriptionMap(raw: any): Record<string, string> {
    const defaultMap: Record<string, string> = {
        "1004": "CellGroup Low Voltage Alarm",
        "2024": "BPC Disconnect Warning",
        "2073": "CellGroup Discharge Balancer Warning",
        "2074": "CellGroup Charge Balancer Warning",
        "2534": "Contactors Open Warning",
        "2561": "String OOR Warning"
    };
    
    if (!raw) return defaultMap;

    let target = raw.bessStatusCodes || raw.statusCodes || raw.registeredStatusCodes || raw;
    if (Array.isArray(target)) {
        for (const item of target) {
            if (typeof item === 'object' && item.code) {
                defaultMap[String(item.code)] = item.description || item.desc || \`Code \${item.code}\`;
            } else if (typeof item === 'string' && item.includes(':')) {
                 const [k, v] = item.split(':');
                 defaultMap[k.trim()] = v.trim();
            }
        }
    } else if (typeof target === 'object') {
        for (const [k, v] of Object.entries(target)) {
            defaultMap[String(k)] = String(v);
        }
    }
    return defaultMap;
}

function extractCodes(value: any): string[] {
    const codes: string[] = [];
    if (!value) return codes;
    if (Array.isArray(value)) {
        for (const v of value) {
            if (typeof v === 'object' && v.code) codes.push(String(v.code));
            else codes.push(String(v));
        }
    } else if (typeof value === 'string') {
        codes.push(...value.split(',').map(s => s.trim()).filter(Boolean));
    } else if (typeof value === 'object' && value.code) {
        codes.push(String(value.code));
    }
    return codes;
}
`;

if (!siteOps.includes("buildStatusCodeDescriptionMap")) {
    siteOps = siteOps.replace("router.get(\"/summary\"", statusCodeMapStr + "\\nrouter.get(\"/summary\"");
}

siteOps = siteOps.replace("const scMap = getEmsCachedStatusCodes().data?.bessStatusCodes || {};", "const scMap = buildStatusCodeDescriptionMap(getEmsCachedStatusCodes().data || {});");

const stringWarnReplace = `
        stringsData.forEach((st: any) => {
             const alarms = extractCodes(st.alarmCodes || st.alarms || st.alarmsList || st.alarmCount);
             const warnings = extractCodes(st.warningCodes || st.warnCodes || st.warnings || st.warns || st.warningsList || st.warningCount);
             
             const enclosureLabel = \`Array \${st.arrayNumber || st.array || st.arrayIndex || st.Array || '?'} ES\${st.stringNumber || st.string || st.stringIndex || st.String || '?'}\`;
             
             alarms.forEach(ac => {
                 const codeDesc = scMap[ac] || \`Alarm Code \${ac}\`;
                 const key = \`string_alarm_\${ac}\`;
                 if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'ALARM', source: 'String Controller', code: \`\${ac}\`, message: codeDesc, displayText: codeDesc, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                 groupMap.get(key).occurrences.push({ arrayNumber: st.arrayNumber, stringNumber: st.stringNumber, bpcNumber: st.bpcNumber, enclosureLabel, sourcePath: "stringsCsv" });
             });
             
             warnings.forEach(wc => {
                 const codeDesc = scMap[wc] || \`Warning Code \${wc}\`;
                 const key = \`string_warn_\${wc}\`;
                 if (!groupMap.has(key)) groupMap.set(key, { id: key, severity: 'WARNING', source: 'String Controller', code: \`\${wc}\`, message: codeDesc, displayText: codeDesc, occurrenceCount: 0, affectedEnclosureCount: 0, occurrences: [] });
                 groupMap.get(key).occurrences.push({ arrayNumber: st.arrayNumber, stringNumber: st.stringNumber, bpcNumber: st.bpcNumber, enclosureLabel, sourcePath: "stringsCsv" });
             });
        });
`;

siteOps = siteOps.replace(/stringsData\.forEach\(\(st: any\) => \{[\s\S]*?\}\);/m, stringWarnReplace);

// PART F: Feather Summary
siteOps = siteOps.replace(/if \(f\.reachable\)/, "if (f.reachable || f.online || f.sourceOk)");
siteOps = siteOps.replace(/if \(f\.lostComms\)/g, "if (f.lostComms || f.devicesWithLostComms?.length > 0 || f.lostCommsDevices?.length > 0 || f.deviceStatusComms?.includes('Lost'))");
siteOps = siteOps.replace(/f\.fssValid === false/g, "f.fssValid === false || f.thermalData?.fssSignals?.valid === false");
siteOps = siteOps.replace(/f\.doorsValid === false/g, "f.doorsValid === false || f.doors?.valid === false");
siteOps = siteOps.replace(/f\.mioValid === false/g, "f.mioValid === false || f.hvacDataValid === false || f.hvacValid === false");
siteOps = siteOps.replace(/warningCount \|\| 0/g, "warningCount || f.warningMessages?.length || f.warnInfo?.length || f.activeWarningInterlocks?.length || 0");
siteOps = siteOps.replace(/alarmCount \|\| 0/g, "alarmCount || f.faultMessages?.length || f.activeTripFaultLog?.length || f.activeAlarms?.length || 0");
siteOps = siteOps.replace(/f\.hydrogen1PPM/g, "(f.hydrogen1PPM ?? f.thermalData?.hydrogen1PPM)");

// PART H: PCS 
siteOps = siteOps.replace('dig(status, "status");', 'dig(status, "status");\\n        dig(lastCall, "lastCall");');

const pcsPushReplace = `const pcsCnds = [
            ...(block.arrays || []).flatMap((a:any) => a.pcs || a.arrayPcs || []),
            ...(status.arrays || []).flatMap((a:any) => a.pcs || a.arrayPcs || []),
            ...(lastCall.arrays || []).flatMap((a:any) => a.pcs || a.arrayPcs || []),
            ...pcsCandidates
        ];
        function numOrNull(v: any): number | null {
            if (v === null || v === undefined) return null;
            const n = Number(v);
            return isNaN(n) ? null : n;
        }
        const pcsSummary = pcsCnds.map((p: any) => {
             return {
                 arrayIndex: p.arrayIndex ?? p.arrayNumber ?? null,
                 pcsIndex: p.pcsIndex ?? p.index ?? null,
                 dcVoltage: numOrNull(p.dcVoltage ?? p.dcVolt ?? p.dcV ?? p.dc_volt),
                 dcCurrent: numOrNull(p.dcCurrent ?? p.dcCurr ?? p.dcA ?? p.dc_current),
                 acVoltage: numOrNull(p.acVoltage ?? p.acVolt ?? p.acV ?? p.ac_voltage),
                 acCurrent: numOrNull(p.acCurrent ?? p.acCurr ?? p.acA ?? p.ac_current),
                 acRealPowerKw: numOrNull(p.acRealPowerKw ?? p.acRealPower ?? p.realPowerKw ?? p.kw ?? p.kW),
                 acReactivePowerKvar: numOrNull(p.acReactivePowerKvar ?? p.acReactPower ?? p.reactivePowerKvar ?? p.kvar ?? p.kVAr),
                 frequencyHz: numOrNull(p.frequencyHz ?? p.freq ?? p.hz),
                 rotation: p.rotation ?? p.rotationStatus ?? null,
                 sourcePath: p.sourcePath || "discovered",
                 raw: p
             };
        }).filter((v:any,i:any,a:any) => a.findIndex((t: any) =>(t.arrayIndex === v.arrayIndex && t.pcsIndex === v.pcsIndex && v.arrayIndex != null))===i);
`;

siteOps = siteOps.replace(/const pcsSummary = pcsCandidates\.map\([\s\S]*?\)===i\);/, pcsPushReplace);

fs.writeFileSync('src/server/siteOperations.ts', siteOps);
console.log("Updated siteOperations.ts");
