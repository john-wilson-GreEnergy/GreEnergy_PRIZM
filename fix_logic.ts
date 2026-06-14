import fs from 'fs';

let file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

// 1. Correct Bucket Logic
file = file.replace(/let bucket = 'offline';[\s\S]*?bucket = 'offline';\s*\}/m, 
`let bucket = 'offline';
        const inRotation = !outRotation;
        const commFalse = row.communicating === false || row.lossComms || row.LossComms;
        
        if (connectionState.includes('LOSS') || connectionState.includes('NO_COMM') || connectionState.includes('NOT_COMM') || commFalse) {
            bucket = 'notCommunicating';
        } else if (outRotation || connectionState === 'OFFLINE') {
            bucket = 'offline';
        } else if (connectionState === 'ONLINE' && inRotation && contactorsClosed) {
            bucket = 'online';
        } else if (connectionState === 'ONLINE' && inRotation && !contactorsClosed) {
            bucket = 'nearline';
        } else if (connectionState.includes('ONLINE') && !contactorsClosed) {
            bucket = 'nearline';
        } else {
            bucket = 'offline';
        }`);

fs.writeFileSync('src/server/siteOperations.ts', file);
