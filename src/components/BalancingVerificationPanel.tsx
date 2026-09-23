import React from "react";
import type {VerificationView} from "../lib/balancingVerificationClient";
export default function BalancingVerificationPanel({job, error, onDismiss}: {job: VerificationView | null; error: string; onDismiss: () => void}) {
  if (!job && !error) return null;
  return <section aria-label="Balancing command verification" className="mb-6 rounded-lg border border-prizm-border bg-prizm-surface p-4 text-xs">
    <div className="flex justify-between gap-3"><h2 className="font-bold">Balancing command verification</h2>
      {(error || job?.status === "complete") && <button onClick={onDismiss}>Dismiss results</button>}</div>
    {error && <p role="alert" className="mt-2 text-prizm-warning">{error}</p>}
    {job && <>
      <p className="mt-2" role="status">{job.summary.verified}/{job.summary.total} settings verified · {job.summary.pending} pending · {job.summary.unresolved} unresolved · {job.summary.persisted} persistence confirmed</p>
      <p className="mt-1 text-prizm-text-muted">Requested {job.request.mode === "avg" ? "Average Balancing" : "Provided voltage"} · Charge {job.request.chargingDeadband} mV / Discharge {job.request.dischargingDeadband} mV. {job.status === "pending" ? "Read-only checks running; allow up to three minutes for propagation, then 65 seconds for persistence." : "Read-only checks finished."} Settings do not prove active shunting. No automatic command retries.</p>
      <details className="mt-3"><summary className="cursor-pointer">Per-string results ({job.summary.total})</summary>
        <table className="mt-2 w-full text-left"><thead><tr><th>Target</th><th>Readback</th><th>Detail</th></tr></thead>
          <tbody>{job.strings.map(row => <tr key={`${row.array}:${row.string}`} className="border-t border-prizm-border"><td className="py-2">Array {row.array} / String {row.string}</td><td>{row.status}</td><td>{row.detail}</td></tr>)}</tbody></table>
      </details>
      {job.summary.unresolved > 0 && <p className="mt-2 text-prizm-warning">Unresolved: {job.strings.filter(row => ["mismatch", "changed", "unavailable", "not-accepted"].includes(row.status)).map(row => `Array ${row.array} / String ${row.string}`).join("; ")}</p>}
    </>}
  </section>;
}
