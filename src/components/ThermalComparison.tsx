import React from "react";
import {observationAt,type ReviewSample} from "./thermalReviewIndex";
type Props={at:number|null;ids:string[];index:Map<string,ReviewSample[]>;label:(id:string)=>string;summarized:boolean;compact?:boolean};
export default function ThermalComparison({at,ids,index,label,summarized,compact=false}:Props){
  return <section aria-label="Time-aligned readings" className="my-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs">
    <h3 className="font-bold">Time-aligned readings{at!==null?` · ${new Date(at).toLocaleString()}`:""}</h3>
    <p className="my-2">{compact?"Last observation at/before cursor · click chart to pin details.":"Hover over the chart, or pin a time. Last observation at or before that time; no interpolation or future readings. Age is relative to the cursor, not now."} {summarized?"Summarized history is sparse; missing coverage is not proof of a device outage.":"Readings expire after two minutes."}</p>
    {at===null?<p>Move over a plotted time to compare visible overlays.</p>:<div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{(compact?["Target","Reading","Coverage","Age"]:["Target","Reading","Coverage","Sample time / age","Recorded commands"]).map(h=><th className="px-2 py-1" key={h}>{h}</th>)}</tr></thead><tbody>{ids.map(id=>{
      const sample=observationAt(index.get(id)||[],at),r=sample?.review,expired=r&&at>r.validUntil;
      const age=sample?(at===sample.point.at?"0s":at-sample.point.at<1000?"<1s":`${Math.floor((at-sample.point.at)/1000)}s`):"—";
      return <tr key={id} className="border-t border-sky-100"><td className="px-2 py-1 font-semibold">{label(id)}</td><td className="px-2 py-1 tabular-nums">{!expired&&r?r.valueText:"—"}</td><td className="px-2 py-1">{!sample?"No earlier sample":!r?"Review data unavailable":expired?"Gap / older than 2 min":r.status}</td><td className="px-2 py-1">{sample?`${compact?"":`${new Date(sample.point.at).toLocaleTimeString()} · `}${age} earlier`:"—"}</td>{!compact&&<td className="px-2 py-1" title={r?.commandText}>{!expired&&r?`${r.command} · ${r.commandText}`:"Unknown"}</td>}</tr>;
    })}</tbody></table></div>}
  </section>;
}
