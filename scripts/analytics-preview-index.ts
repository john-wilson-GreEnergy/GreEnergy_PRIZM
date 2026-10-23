// Development-only bridge for the not-yet-deployed metadata API.
// Reads existing SS3 filenames and one bounded identity frame. Never writes on the Dell.
export const ss3IndexReadScript = `
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const directory='/home/ebc/GreEnergy_PRIZM/.prizm-data/cell-history/e0280bc1fcc82cad736b054c512ffa488935f058d426b968b32f8eca3bcd394e';
if((await fs.lstat(directory)).isSymbolicLink())throw Error('Invalid directory');
const files=(await fs.readdir(directory,{withFileTypes:true})).filter(e=>e.isFile()&&/^\\d{13}\\.cells\\.json\\.gz$/.test(e.name)).map(e=>e.name).sort();
if(!files.length)throw Error('No identity frame available');
const filename=directory+'/'+files.at(-1),stat=await fs.lstat(filename);
if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16777216)throw Error('Invalid frame');
const frame=JSON.parse(gunzipSync(await fs.readFile(filename),{maxOutputLength:16777216}).toString());
const site=frame.site;
if(frame.schema!==1||site.stationCode!=='BHE0020'||site.blockIndex!==1||site.emsBaseUrl!=='http://10.0.0.3:8080/turtle')throw Error('Wrong site');
const key=createHash('sha256').update(JSON.stringify([site.stationCode,site.blockIndex,site.emsBaseUrl])).digest('hex');
if(!directory.endsWith('/'+key))throw Error('Wrong recorder identity');
console.log(JSON.stringify({site:'BHE0020 / Block 1',timestamps:files.map(f=>Number(f.split('.')[0]))}));
`;
export const shellQuote=(s:string)=>"'"+s.replace(/'/g,"'\\''")+"'";
