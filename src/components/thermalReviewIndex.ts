import type {ThermalPoint} from "../server/thermal/thermalModel";
import type {ReviewReading} from "../server/thermal/thermalReviewPresentation";
export type ReviewSample={id:string;point:ThermalPoint;review?:ReviewReading;excluded?:boolean};
export function indexReviewSamples(points:ReviewSample[]){
  const index=new Map<string,ReviewSample[]>();
  for(const sample of points){const list=index.get(sample.id)||[];list.push(sample);index.set(sample.id,list);}
  for(const list of index.values())list.sort((a,b)=>a.point.at-b.point.at);
  return index;
}
// DOM presentation lookup only: server supplies value, eligibility and expiry.
// Never select a future sample, even when it is nearer to the cursor.
export function observationAt(samples:ReviewSample[],at:number):ReviewSample|undefined{
  let low=0,high=samples.length;
  while(low<high){const mid=(low+high)>>>1;if(samples[mid].point.at<=at)low=mid+1;else high=mid;}
  return low?samples[low-1]:undefined;
}
