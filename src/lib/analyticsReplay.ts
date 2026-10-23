import type {CellSnapshotIndex} from '../core/cellHistory';
/** Fetch every metadata page; freeze the upper bound so new writes do not move the finish line. */
export async function loadSnapshotTimes(read:(query:URLSearchParams)=>Promise<CellSnapshotIndex>,from?:number,to=Date.now()):Promise<{times:number[];site:string|null}> {
  const times:number[]=[];let after:number|undefined,site:string|null=null;
  for(let page=0;page<100;page++){
    const q=new URLSearchParams({to:String(to),limit:'1000'});
    if(from!==undefined)q.set('from',String(from));if(after!==undefined)q.set('after',String(after));
    const result=await read(q);
    if(page&&result.site!==site)throw Error('Site changed while reading recorded timestamps');
    site=result.site;
    if(result.sampled!==false)throw Error('Snapshot list must not be sampled');
    for(const t of result.timestamps){if(!Number.isSafeInteger(t)||t>to||(from!==undefined&&t<from)||(times.length&&t<=times[times.length-1]))throw Error('Invalid snapshot sequence');times.push(t);}
    if(result.nextAfter===null)return {times,site};
    if(!result.timestamps.length||result.nextAfter!==times.at(-1)||(after!==undefined&&result.nextAfter<=after))throw Error('Snapshot cursor did not advance');
    after=result.nextAfter;
  }
  throw Error('Snapshot index exceeds the review limit; choose a shorter window');
}
export function frameAtOrAfter(times:number[],at:number):number|null {return times.find(t=>t>=at)??null;}
