import React from "react";
import type {ReviewSample} from "./thermalReviewIndex";
const colors={Cooling:"#0284c7",Heating:"#c2410c",Idle:"#64748b",Unknown:"#e2e8f0"};
type Props={ids:string[];index:Map<string,ReviewSample[]>;start:number;end:number;label:(id:string)=>string;summarized:boolean};
export default function ThermalCommandBands({ids,index,start,end,label,summarized}:Props){
  if(end<=start)return null;
  return <section aria-label="Recorded command bands" className="mt-3 rounded-lg border border-slate-200 p-3 text-xs">
    <h3 className="font-bold">Recorded thermal commands alongside amperage</h3>
    <p className="my-2">Blue: cooling · Orange: heating · Slate: idle (fans may still run) · Pale: unknown · Blank: no coverage. Commands are not proof of operation. {summarized?"Summarized history: markers show sampled commands only; intermediate transitions are not available.":"Bands carry each observed command forward to the next sample, capped at two minutes."}</p>
    <div className="pr-[18px] pl-[70px]">{ids.map(id=><div key={id} className="mb-2"><div className="mb-1 font-semibold">{label(id)}</div><div className="relative h-4 rounded border border-slate-200 bg-white">{(index.get(id)||[]).map((sample,i,list)=>{
      if(sample.point.at<start||sample.point.at>end||!sample.review||sample.excluded)return null;
      const stop=Math.min(end,sample.review.validUntil,list[i+1]?.point.at??sample.point.at);
      const left=(sample.point.at-start)/(end-start)*100,width=summarized?0:Math.max(0,(stop-sample.point.at)/(end-start)*100);
      return <span key={`${sample.point.at}-${i}`} title={`${label(id)} · ${new Date(sample.point.at).toLocaleString()} · ${sample.review.command} · ${sample.review.commandText}`} className="absolute top-0 h-full" style={{left:`${left}%`,width:width?`${width}%`:"2px",maxWidth:`${100-left}%`,backgroundColor:colors[sample.review.command]}}/>;
    })}</div></div>)}</div>
  </section>;
}
