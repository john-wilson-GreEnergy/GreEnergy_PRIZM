const fs = require('fs');

let code = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

const replacement = `export function buildStringBucketSummary(stringsData: any[]) {
    const buckets = {
        online: 0,
        nearline: 0,
        offline: 0,
        notCommunicating: 0
    };
    
    function bool(v: any): boolean {
        return v === true || String(v).toLowerCase() === "true";
    }

    function num(v: any): number | null {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    let totalStrings = 0;

    const tableRows = stringsData.map(row => {
        totalStrings++;

        const arrayNumber = num(row.ArrayIndex ?? row.arrayIndex ?? row.arrayNumber);
        const stringNumber = num(row.StringIndex ?? row.stringIndex ?? row.stringNumber);
        const connectionState = String(row.StringConnectionState ?? row.stringConnectionState ?? row.connectionState ?? "").toUpperCase();
        const outRotation = bool(row.OutRotation ?? row.outRotation ?? row.outOfRotation);
        const posClosed = bool(row.PositiveContactorClosed ?? row.positiveContactorClosed);
        const negClosed = bool(row.NegativeContactorClosed ?? row.negativeContactorClosed);
        const contactorsClosed = posClosed && negClosed;

        let bucket = "offline";
        if (connectionState.includes("LOSS") || connectionState.includes("NO_COMM") || connectionState.includes("NOT_COMM")) {
            bucket = "notCommunicating";
        } else if (connectionState === "OFFLINE" || outRotation) {
            bucket = "offline";
        } else if (connectionState === "ONLINE" && !outRotation && contactorsClosed) {
            bucket = "online";
        } else if (connectionState === "ONLINE" && !outRotation && !contactorsClosed) {
            bucket = "nearline";
        } else {
            bucket = "offline";
        }

        (buckets as any)[bucket]++;

        return {
            ...row,
            arrayNumber,
            stringNumber,
            bucket,
            communicating: bucket !== "notCommunicating",
            inRotation: !outRotation,
            contactorsClosed
        };
    });
    
    return { 
        buckets, 
        tableRows,
        rollups: { totalStrings } 
    };
}`;

const startIndex = code.indexOf('export function buildStringBucketSummary');
const endIndex = code.indexOf('function buildStatusCodeDescriptionMap');

code = code.substring(0, startIndex) + replacement + '\n\n\n' + code.substring(endIndex);

fs.writeFileSync('src/server/siteOperations.ts', code);
