import React from "react";
import {CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import type {BalancingProgressReport} from "../server/history/balancingProgress";
const number = (value: number | null | undefined, unit: string) => value == null ? "Unknown" : `${value} ${unit}`;
export default function BalancingProgressReview({report, selectedString}: {report: BalancingProgressReport; selectedString?: number | null}) {
  return <section className="border border-prizm-border rounded p-3 my-4" aria-label="Balancing progress review">
    <h3 className="font-bold text-sm">Balancing progress · observed evidence</h3>
    <p className="text-xs text-prizm-text-muted my-2">Reported settings below are not proof they match a requested command. Request, acceptance and command-service readback results remain in the command timeline below. Average balancing may be reported by the controller as Provided.</p>
    <p className="text-xs my-2">Last recorded ADB state: <strong>{report.adb}</strong>. Enabled ADB with a string IN rotation can supersede manual balancing. No settings are changed by this review.</p>
    {!report.rows.length && <p className="text-xs p-3 bg-amber-50 text-amber-900">No balancing progress observations yet. Earlier history is not backfilled.</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-xs text-left"><thead><tr>
      {['String', 'Last observed', 'Spread / trend', 'Reported settings', 'Activity / rotation', 'Cell voltages / current'].map(label => <th className="p-2" key={label}>{label}</th>)}
    </tr></thead><tbody>{report.rows.map(row => <tr key={row.string} className="border-t border-prizm-border align-top">
      <td className="p-2 whitespace-nowrap">String {row.string}</td><td className="p-2">{row.at ? new Date(row.at).toLocaleString() : "Unknown"}{!row.fresh && <div className="text-amber-800">Stale / unavailable</div>}</td>
      <td className="p-2"><strong>{number(row.sample?.spreadMv, "mV")}</strong><div>{row.trend}</div>{row.changeMv !== null && <div>{row.changeMv > 0 ? "+" : ""}{row.changeMv} mV from {number(row.baselineMv, "mV")} at {new Date(row.baselineAt!).toLocaleTimeString()}</div>}</td>
      <td className="p-2">Mode: {row.fresh ? row.mode : "Unknown"}<div>Target: {row.sample?.target ?? "Unknown"}</div><div>Charge deadband: {row.sample?.chargeDeadband ?? "Unknown"}</div><div>Discharge deadband: {row.sample?.dischargeDeadband ?? "Unknown"}</div></td>
      <td className="p-2">{row.sample?.activity ?? "Telemetry unavailable"}<div>Rotation: {row.fresh ? row.rotation : "Unknown"}</div></td>
      <td className="p-2">Min: {number(row.sample?.minMv, "mV")}<div>Average: {number(row.sample?.averageMv, "mV")}</div><div>Max: {number(row.sample?.maxMv, "mV")}</div><div>Current: {number(row.sample?.currentA, "A")}</div></td>
    </tr>)}</tbody></table></div>
    <p className="text-xs text-prizm-text-muted my-2">Trend compares at least three observations over two minutes in the latest continuous run with unchanged reported mode, target, deadbands and rotation. Gaps reset the comparison. A decreasing spread does not prove balancing caused it; load and cell conditions also matter. Zero active BPCs is not a failure, and does not by itself prove cells are within deadband.</p>
    {!selectedString && <p className="text-xs my-2">Select a recorded string above and refresh to see its spread chart and active-cell details.</p>}
    {selectedString && report.rows.map(row => <details key={row.string} className="text-xs my-3"><summary className="cursor-pointer font-bold">String {row.string} · last observed active cells</summary><p className="my-2 leading-6">{row.sample?.activeCells ?? "Unavailable"}</p><p className="text-prizm-text-muted">Active-cell voltage is shown only when supplied by the canonical feed. A target or string average is never substituted.</p></details>)}
    {selectedString && report.points.length > 0 && <><p className="text-xs my-2">String {selectedString} cell-voltage spread (mV) · last saved observation per minute; points only, no interpolation across gaps.</p>
      <div className="h-56 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={report.points} margin={{left: 12, right: 20, top: 8, bottom: 8}}>
        <CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="at" type="number" domain={["dataMin", "dataMax"]} tickFormatter={at => new Date(at).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}/><YAxis domain={[0, "auto"]}/><Tooltip labelFormatter={at => new Date(Number(at)).toLocaleString()}/>
        <Line dataKey="spreadMv" name="Cell-voltage spread (mV)" stroke="#0284c7" strokeWidth={0} dot={{r: 2}} activeDot={{r: 5}} isAnimationActive={false} connectNulls={false}/>
      </LineChart></ResponsiveContainer></div></>}
  </section>;
}
