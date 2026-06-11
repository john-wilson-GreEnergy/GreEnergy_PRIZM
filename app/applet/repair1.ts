const fs = require('fs');
let code = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

const stringBucketRegex = /export function buildStringBucketSummary[\s\S]*?\}\n\}\n/;
const newStringBucket = `export function buildStringBucketSummary(stringsData: any[]) {
    const buckets = {
        online: 0,
        nearline: 0,
        offline: 0,
        notCommunicating: 0
    };
    
    function bool(v: any) {
        if (v === true || v === false) return v;
        if (typeof v === 'string') return v.toLowerCase() === 'true' || v.toLowerCase() === '1' || v.toLowerCase() === 'yes';
        if (typeof v === 'number') return v === 1;
        return false;
    }

    function num(v: any) {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    let totalStrings = 0;

    const tableRows = stringsData.map(row => {
        totalStrings++;

        const arrayNumber = num(row.ArrayIndex ?? row.arrayIndex ?? row.arrayNumber);
        const stringNumber = num(row.StringIndex ?? row.stringIndex ?? row.stringNumber);
        const connectionState = String(row.StringConnectionState ?? row.stringConnectionState ?? row.connectionState ?? '').toUpperCase();
        const outRotation = bool(row.OutRotation ?? row.outRotation ?? row.outOfRotation);
        const posClosed = bool(row.PositiveContactorClosed ?? row.positiveContactorClosed);
        const negClosed = bool(row.NegativeContactorClosed ?? row.negativeContactorClosed);
        const contactorsClosed = posClosed && negClosed;

        let bucket = 'offline';
        if (connectionState.includes('LOSS') || connectionState.includes('NO_COMM') || connectionState.includes('NOT_COMM')) {
            bucket = 'notCommunicating';
        } else if (connectionState === 'OFFLINE' || outRotation) {
            bucket = 'offline';
        } else if (connectionState === 'ONLINE' && !outRotation && contactorsClosed) {
            bucket = 'online';
        } else if (connectionState === 'ONLINE' && !outRotation && !contactorsClosed) {
            bucket = 'nearline';
        } else {
            bucket = 'offline';
        }

        (buckets as Record<string, number>)[bucket]++;

        return {
            ...row,
            arrayNumber,
            stringNumber,
            bucket,
            communicating: bucket !== 'notCommunicating',
            inRotation: !outRotation,
            contactorsClosed
        };
    });
    
    return { 
        buckets, 
        tableRows,
        rollups: { totalStrings } 
    };
}
`;
code = code.replace(stringBucketRegex, newStringBucket);
fs.writeFileSync('src/server/siteOperations.ts', code);
