import type {CellSnapshotIndex} from '../../core/cellHistory';
export interface SnapshotIndexQuery {from?:number; to?:number; after?:number; limit?:number}
export function validateSnapshotIndexQuery(input:SnapshotIndexQuery): Required<Pick<SnapshotIndexQuery,'limit'>> & SnapshotIndexQuery {
  for(const key of ['from','to','after'] as const){
    const value=input[key];
    if(value!==undefined&&(!Number.isSafeInteger(value)||value<0))throw new Error('Invalid snapshot timestamp');
  }
  if(input.from!==undefined&&input.to!==undefined&&input.from>input.to)throw new Error('Invalid snapshot range');
  const limit=input.limit??500;
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('Choose a snapshot page size from 1 to 1000');
  return {...input,limit};
}
/** Metadata only. No frame decompression, sampling, acquisition or reconstructed timestamps. */
export function selectSnapshotIndex(timestamps:number[],site:string|null,input:SnapshotIndexQuery):CellSnapshotIndex {
  const q=validateSnapshotIndexQuery(input);
  const all=[...new Set(timestamps)].sort((a,b)=>a-b).filter(at=>(q.from===undefined||at>=q.from)&&(q.to===undefined||at<=q.to));
  const remaining=all.filter(at=>q.after===undefined||at>q.after);
  const page=remaining.slice(0,q.limit);
  return {site,timestamps:page,total:all.length,oldestAt:all[0]??null,newestAt:all.at(-1)??null,nextAfter:remaining.length>page.length?page.at(-1)!:null,sampled:false};
}
