import React, { useState } from 'react';
import { TriangleAlert, X, Activity, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';

export interface ContactorTarget {
  array: number;
  string?: number;
  allStrings?: boolean;
}

interface ContactorControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (req: {
    action: "open" | "close";
    targets: ContactorTarget[];
    ignoreLowCgVoltAlarm: boolean;
    ignoreHighCgVoltAlarm: boolean;
    confirmed: boolean;
    reason: string;
    note?: string;
  }) => Promise<{ success: boolean; results: any[] }>;
  targets: ContactorTarget[];
  action: "open" | "close";
}

export default function ContactorControlModal({ isOpen, onClose, onConfirm, targets, action }: ContactorControlModalProps) {
  const [reason, setReason] = useState('Maintenance');
  const [note, setNote] = useState('');
  const [ignoreLow, setIgnoreLow] = useState(false);
  const [ignoreHigh, setIgnoreHigh] = useState(false);
  const [explicitConfirm, setExplicitConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<any[] | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!explicitConfirm) {
      setError('You must check the explicit confirmation checkbox to proceed.');
      return;
    }
    if (!reason || reason.trim() === '') {
      setError('A reason is required to execute this operation.');
      return;
    }

    try {
      setError('');
      setPending(true);
      const res = await onConfirm({
        action,
        targets,
        ignoreLowCgVoltAlarm: ignoreLow,
        ignoreHighCgVoltAlarm: ignoreHigh,
        confirmed: true,
        reason,
        note
      });
      setResults(res.results || []);
    } catch (e: any) {
      setError(e.message || 'Failed to execute contactor control');
    } finally {
      setPending(false);
    }
  };

  const handleCloseModal = () => {
    // Reset state on close
    setReason('Maintenance');
    setNote('');
    setIgnoreLow(false);
    setIgnoreHigh(false);
    setExplicitConfirm(false);
    setError('');
    setResults(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-prizm-background border border-prizm-border rounded-lg shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-prizm-border flex items-center justify-between bg-black/40">
          <h2 className="text-sm font-bold text-prizm-text uppercase tracking-widest flex items-center gap-2">
            <ShieldAlert size={16} className={action === 'open' ? 'text-prizm-warning' : 'text-prizm-info'} />
            Phoenix BMS Contactor Control
          </h2>
          <button onClick={handleCloseModal} disabled={pending} className="text-prizm-text-muted hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {results === null ? (
          /* Form Screen */
          <div className="p-5 flex flex-col gap-4 text-xs font-mono">
            {/* Action and Targets Preview */}
            <div className={`p-4 rounded border ${action === 'open' ? 'bg-prizm-warning/10 border-prizm-warning/30 text-prizm-warning' : 'bg-prizm-info/10 border-prizm-info/30 text-prizm-info'}`}>
              <div className="font-bold text-sm uppercase mb-2">
                Action: {action.toUpperCase()} CONTACTORS
              </div>
              <div className="mb-1 text-prizm-text-muted uppercase text-[10px] tracking-wider font-bold">Targets:</div>
              <div className="max-h-[80px] overflow-y-auto no-scrollbar flex flex-col gap-0.5 text-prizm-text pl-2">
                {targets.map((t, i) => (
                  <span key={i}>
                    • Array {t.array} {t.allStrings ? '/ All Strings (Whole Array)' : `/ String ${t.string}`}
                  </span>
                ))}
              </div>
            </div>

            {/* Warn Label */}
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded leading-relaxed text-[11px]">
              <div className="font-bold flex items-center gap-1.5 mb-1 text-red-400">
                <TriangleAlert size={14} /> WARNING: DIRECT PHOENIX BMS COMMAND
              </div>
              This sends a direct Phoenix BMS contactor command to the selected array Phoenix endpoint, for example <code className="bg-black/40 px-1 py-0.5 rounded text-white">http://10.0.3.1:8080/turtle</code>. This is not the same as EMS rotation.
            </div>

            {error && (
              <div className="p-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded font-bold">
                {error}
              </div>
            )}

            {/* Alarm Override Toggles */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-prizm-surface/40 border border-prizm-border rounded">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ignoreLow}
                  onChange={(e) => setIgnoreLow(e.target.checked)}
                  disabled={pending}
                  className="rounded border-prizm-border bg-prizm-surface text-prizm-info focus:ring-0 focus:ring-offset-0"
                />
                <div className="flex flex-col">
                  <span className="font-bold text-prizm-text uppercase text-[10px]">Ignore Low Cg Volt Alarm</span>
                  <span className="text-[9px] text-prizm-text-muted">Bypass low voltage thresholds</span>
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ignoreHigh}
                  onChange={(e) => setIgnoreHigh(e.target.checked)}
                  disabled={pending}
                  className="rounded border-prizm-border bg-prizm-surface text-prizm-info focus:ring-0 focus:ring-offset-0"
                />
                <div className="flex flex-col">
                  <span className="font-bold text-prizm-text uppercase text-[10px]">Ignore High Cg Volt Alarm</span>
                  <span className="text-[9px] text-prizm-text-muted">Bypass high voltage thresholds</span>
                </div>
              </label>
            </div>

            {/* Reason Select/Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-prizm-text-muted uppercase tracking-wider font-bold text-[10px]">Reason for Contactor Relay Action *</label>
              <select
                className="bg-prizm-surface border border-prizm-border text-prizm-text p-2 rounded text-xs"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={pending}
              >
                <option value="Maintenance">Maintenance</option>
                <option value="Commissioning">Commissioning</option>
                <option value="Troubleshooting">Troubleshooting</option>
                <option value="Corrective Action">Corrective Action</option>
                <option value="Testing">Testing</option>
                <option value="Emergency Relief">Emergency Relief</option>
                <option value="Manual Override">Manual Override</option>
              </select>
            </div>

            {/* Note Textarea */}
            <div className="flex flex-col gap-1.5">
              <label className="text-prizm-text-muted uppercase tracking-wider font-bold text-[10px]">Note (Optional)</label>
              <textarea
                className="bg-prizm-surface border border-prizm-border text-prizm-text p-2 rounded no-scrollbar min-h-[50px] text-xs"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Enter technical details, technician logs..."
                disabled={pending}
              />
            </div>

            {/* Explicit Confirmation Checkbox */}
            <div className="mt-2 p-3 bg-prizm-warning/5 border border-prizm-warning/20 rounded">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={explicitConfirm}
                  onChange={(e) => setExplicitConfirm(e.target.checked)}
                  disabled={pending}
                  className="mt-0.5 rounded border-prizm-border bg-prizm-surface text-prizm-warning focus:ring-0 focus:ring-offset-0"
                />
                <div className="flex flex-col gap-0.5 text-prizm-text">
                  <span className="font-bold uppercase text-[10px] text-prizm-warning">Explicit Operation Acknowledgment</span>
                  <p className="text-[10px] text-prizm-text-muted leading-relaxed">
                    I confirm that I have verified voltages and that this operation is authorized. I acknowledge that direct contactor command bypasses automatic safety algorithms.
                  </p>
                </div>
              </label>
            </div>
          </div>
        ) : (
          /* Results Screen */
          <div className="p-5 flex flex-col gap-4 text-xs font-mono max-h-[450px] overflow-y-auto no-scrollbar">
            <div className="text-sm font-bold text-prizm-text uppercase tracking-wider border-b border-prizm-border pb-2 mb-1">
              Execution & Readback Results
            </div>

            <div className="flex flex-col gap-3">
              {results.map((res, i) => {
                const isAll = res.target?.allStrings === true;
                const accepted = res.accepted;
                const verified = res.readbackConfirmed === true;

                return (
                  <div key={i} className="p-3 bg-prizm-surface/60 border border-prizm-border rounded flex flex-col gap-2">
                    <div className="flex items-center justify-between border-b border-prizm-border/40 pb-1.5">
                      <span className="font-bold text-prizm-text">
                        Array {res.target?.array} {isAll ? '/ All Strings' : `/ String ${res.target?.string}`}
                      </span>
                      <span className="text-[9px] text-prizm-text-muted lowercase truncate max-w-[200px]" title={res.phoenixUrl}>
                        {res.phoenixUrl}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-[11px] mt-1">
                      {/* Phoenix BMS Response */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] text-prizm-text-muted uppercase font-bold tracking-wider">Phoenix Response</span>
                        <div className="flex items-center gap-1.5">
                          {accepted ? (
                            <>
                              <CheckCircle2 size={14} className="text-emerald-400" />
                              <span className="text-emerald-400 font-bold">ACCEPTED (HTTP {res.responseStatus})</span>
                            </>
                          ) : (
                            <>
                              <XCircle size={14} className="text-prizm-danger" />
                              <span className="text-prizm-danger font-bold">FAILED ({res.error || `HTTP ${res.responseStatus}`})</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* State Verification (Readback) */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] text-prizm-text-muted uppercase font-bold tracking-wider">PRIZM Verification</span>
                        <div className="flex items-center gap-1.5">
                          {res.readbackConfirmed === true ? (
                            <>
                              <CheckCircle2 size={14} className="text-emerald-400 font-bold" />
                              <span className="text-emerald-400 font-bold">VERIFIED</span>
                            </>
                          ) : res.readbackConfirmed === false ? (
                            <>
                              <XCircle size={14} className="text-prizm-danger animate-pulse" />
                              <span className="text-prizm-danger font-bold">MISMATCH</span>
                            </>
                          ) : (
                            <>
                              <TriangleAlert size={14} className="text-prizm-warning" />
                              <span className="text-prizm-warning font-bold">UNVERIFIED</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-[10px] bg-black/30 p-1.5 rounded text-prizm-text-muted mt-1 break-all">
                      <strong className="text-prizm-text">Status: </strong>{res.readbackStatus}<br/>
                      {res.responseText && (
                        <span className="block mt-1 border-t border-prizm-border/10 pt-1 font-mono text-[9px] text-prizm-text-muted">
                          <strong>Response body:</strong> {res.responseText.slice(0, 150)}{res.responseText.length > 150 ? "..." : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 border-t border-prizm-border bg-black/40 flex justify-end gap-3 text-xs font-mono uppercase tracking-widest font-bold">
          {results === null ? (
            <>
              <button onClick={handleCloseModal} disabled={pending} className="px-4 py-2 text-prizm-text-muted hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={pending || !explicitConfirm}
                className={`px-4 py-2 rounded flex items-center gap-2 ${
                  action === 'open'
                    ? 'bg-prizm-warning/20 text-prizm-warning border border-prizm-warning/50 hover:bg-prizm-warning/30 disabled:opacity-40 disabled:hover:bg-prizm-warning/20'
                    : 'bg-prizm-info/20 text-prizm-info border border-prizm-info/50 hover:bg-prizm-info/30 disabled:opacity-40 disabled:hover:bg-prizm-info/20'
                }`}
              >
                {pending ? (
                  <>
                    <Activity size={14} className="animate-spin" /> Executing...
                  </>
                ) : (
                  `Execute Contactor ${action}`
                )}
              </button>
            </>
          ) : (
            <button
              onClick={handleCloseModal}
              className="px-4 py-2 bg-prizm-surface border border-prizm-border text-prizm-text hover:bg-white/5 rounded"
            >
              Done & Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
