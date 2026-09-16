import React from "react";
import type { ThermalUnit } from "../server/thermal/thermalModel";
import { thermalMetrics, type ThermalMetric, type ThermalReadings } from "../server/thermal/thermalMetrics";

type Props = {
  units: (ThermalUnit & {readings: ThermalReadings})[];
  metric: ThermalMetric;
  selected: string[];
  onChoose: (id: string) => void;
  sort: string;
  onSort: (value: string) => void;
};
export default function ThermalResults({units,metric,selected,onChoose,sort,onSort}:Props) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-bold">Filtered results · {units.length} HVAC units</h2>
      <select aria-label="Results order" className="rounded border p-2 text-xs" value={sort} onChange={e=>onSort(e.target.value)}>
        <option value="topology">Topology order</option><option value="descending">Highest reading first</option><option value="ascending">Lowest reading first</option>
      </select>
    </div>
    <div className="max-h-80 overflow-auto"><table className="w-full text-left text-xs">
      <thead className="sticky top-0 bg-slate-100"><tr>{["Equipment",thermalMetrics[metric].label,"Reading state","Mode","Faults","Last success"].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead>
      <tbody>{units.map(unit=><tr key={unit.id} className={`border-t ${selected.includes(unit.id)?"bg-sky-50":""}`}>
        <td className="p-2"><button className="text-left font-semibold text-sky-800 underline" aria-pressed={selected.includes(unit.id)} onClick={()=>onChoose(unit.id)}>{unit.label}</button><div className="text-slate-500">{unit.ip}</div></td>
        <td className="p-2"><span className="rounded px-2 py-1" style={{backgroundColor:unit.readings[metric].color}}>{unit.readings[metric].text}</span></td>
        <td className="p-2">{unit.readings[metric].state}</td><td className="p-2">{unit.point.mode}</td>
        <td className="p-2">{unit.faults.length?<span className="text-amber-900">{unit.faults.join("; ")}</span>:"None reported"}</td>
        <td className="p-2">{new Date(unit.point.at).toLocaleString()}</td>
      </tr>)}</tbody>
    </table></div>
    {!units.length&&<p className="py-5 text-sm text-slate-500">No equipment matches these filters.</p>}
  </section>;
}
