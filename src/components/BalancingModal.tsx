import React, { useState, useEffect } from "react";
import { Activity, X } from "lucide-react";
import { RotationTarget } from "./RotationModal";

export interface BalancingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPreflight: (req: any) => Promise<any>;
    onConfirm: (req: any) => Promise<void>;
    targets: RotationTarget[];
    targetType: 'string' | 'array';
}

export default function BalancingModal({ isOpen, onClose, onPreflight, onConfirm, targets, targetType }: BalancingModalProps) {
    const [mode, setMode] = useState<'avg' | 'provided' | 'stop'>('avg');
    const [providedMv, setProvidedMv] = useState<number | ''>('');
    const [chargingDeadband, setChargingDeadband] = useState<number>(5);
    const [dischargingDeadband, setDischargingDeadband] = useState<number>(10);
    const [reason, setReason] = useState('Corrective Action');
    const [note, setNote] = useState('');
    
    // Workflow States
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [preflightData, setPreflightData] = useState<any>(null);
    const [showAdbPreflight, setShowAdbPreflight] = useState(false);
    const [adbConfirmation, setAdbConfirmation] = useState('');

    useEffect(() => {
        if (isOpen) {
            setMode('avg');
            setProvidedMv('');
            setChargingDeadband(5);
            setDischargingDeadband(10);
            setReason('Corrective Action');
            setNote('');
            setError('');
            setPending(false);
            setPreflightData(null);
            setShowAdbPreflight(false);
            setAdbConfirmation('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handlePreflight = async () => {
        try {
            setError('');
            if (mode === 'provided' && (typeof providedMv !== 'number' || providedMv < 2500 || providedMv > 3800)) {
                setError('Please provide a valid target millivolt value between 2500 and 3800.');
                return;
            }
            if (chargingDeadband < 0 || dischargingDeadband < 0) {
                setError('Deadbands must be non-negative.');
                return;
            }
            setPending(true);
            const req = {
                targetType,
                targets,
                mode,
                providedMv: mode === 'provided' ? providedMv : undefined,
                chargingDeadband,
                dischargingDeadband
            };
            const result = await onPreflight(req);
            setPreflightData(result);
            if (!result.okToBalanceDirectly && result.adb?.enabled) {
                setShowAdbPreflight(true);
            } else {
                // Skip directly to execute
                await proceedToExecute('balance-directly');
            }
        } catch (e: any) {
            setError(e.message || 'Failed preflight check');
        } finally {
            setPending(false);
        }
    };

    const proceedToExecute = async (choice: string) => {
        try {
            setError('');
            if (choice === 'disable-adb-then-balance' && adbConfirmation !== 'DISABLE ADB0001') {
                setError('Must type exact confirmation phrase to disable ADB.');
                return;
            }
            setPending(true);
            const req = {
                targetType,
                targets,
                mode,
                providedMv: mode === 'provided' ? providedMv : undefined,
                chargingDeadband,
                dischargingDeadband,
                reason,
                note,
                confirmed: true,
                preflightChoice: choice,
                adbConfirmationText: choice === 'disable-adb-then-balance' ? adbConfirmation : undefined
            };
            await onConfirm(req);
            onClose();
        } catch (e: any) {
            setError(e.message || 'Failed to execute balancing');
        } finally {
            setPending(false);
        }
    };

    if (showAdbPreflight) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-prizm-surface border border-prizm-border rounded shadow-xl w-full max-w-lg overflow-hidden flex flex-col relative saturate-150">
                    <button className="absolute top-4 right-4 text-prizm-text-muted hover:text-white transition-colors" onClick={onClose} disabled={pending}>
                        <X size={20} />
                    </button>
                    <div className="p-4 border-b border-prizm-border bg-prizm-surface-strong">
                        <h2 className="text-sm font-bold font-mono text-prizm-warning uppercase tracking-widest flex items-center gap-2">
                             ADB App Is Enabled
                        </h2>
                    </div>
                    <div className="p-4 flex flex-col gap-4 text-xs font-mono">
                         <div className="text-prizm-text-muted">
                            The Auto Discharge Balancer app is currently enabled. Manual balancing may be overridden while ADB is active unless selected targets are out of rotation or ADB is disabled.
                         </div>
                         
                         <div className="bg-prizm-surface-strong border border-prizm-border rounded p-3">
                             <div className="mb-2 uppercase tracking-wide font-bold">Target Rotation Status:</div>
                             <div>Total Selected: {preflightData.targetRotation.total}</div>
                             <div className="text-prizm-danger">In Rotation: {preflightData.targetRotation.inRotationCount}</div>
                             <div className="text-emerald-400">Out of Rotation: {preflightData.targetRotation.outOfRotationCount}</div>
                             {preflightData.targetRotation.unknownCount > 0 && <div className="text-prizm-warning">Unknown: {preflightData.targetRotation.unknownCount}</div>}
                         </div>

                         {error && <div className="p-2 bg-prizm-danger/10 border border-prizm-danger/30 text-prizm-danger rounded mb-2">{error}</div>}

                         <div className="flex flex-col gap-2 mt-4">
                              <button 
                                  onClick={() => proceedToExecute('move-targets-out-of-rotation-then-balance')}
                                  disabled={pending}
                                  className="w-full px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30 rounded uppercase tracking-wider font-bold"
                              >
                                  {pending ? 'Executing...' : 'Move Selected Target(s) Out of Rotation, Then Balance'}
                              </button>
                              
                              <div className="flex flex-col gap-1 border border-red-500/30 rounded p-2 bg-red-500/5 mt-2">
                                   <label className="text-prizm-text-muted uppercase font-bold tracking-wider mb-1 text-[10px]">Type <span className="text-white">DISABLE ADB0001</span> to disable app:</label>
                                   <input type="text" className="bg-black/50 border border-prizm-border text-prizm-text p-2 rounded" value={adbConfirmation} onChange={e => setAdbConfirmation(e.target.value)} disabled={pending} placeholder="DISABLE ADB0001" />
                                   <button 
                                      onClick={() => proceedToExecute('disable-adb-then-balance')}
                                      disabled={pending || adbConfirmation !== 'DISABLE ADB0001'}
                                      className="w-full px-4 py-2 bg-red-500/20 text-red-500 border border-red-500/50 hover:bg-red-500/30 rounded uppercase tracking-wider font-bold mt-2 disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                      {pending ? 'Executing...' : 'Disable ADB App, Then Balance'}
                                  </button>
                              </div>

                              <button 
                                  onClick={onClose}
                                  disabled={pending}
                                  className="w-full px-4 py-2 mt-2 bg-prizm-surface-strong text-prizm-text border border-prizm-border hover:bg-prizm-border/40 rounded uppercase tracking-wider font-bold"
                              >
                                  Cancel
                              </button>
                         </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-prizm-surface border border-prizm-border rounded shadow-xl w-full max-w-lg overflow-hidden flex flex-col relative saturate-150">
                <button className="absolute top-4 right-4 text-prizm-text-muted hover:text-white transition-colors" onClick={onClose} disabled={pending}>
                    <X size={20} />
                </button>
                <div className="p-4 border-b border-prizm-border bg-prizm-surface-strong">
                    <h2 className="text-sm font-bold font-mono text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                        Set Balancing
                    </h2>
                </div>
                
                <div className="p-4 flex flex-col gap-4 text-xs font-mono">
                    <div className="p-3 rounded border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
                        <strong>Targets ({targets.length}):</strong><br/>
                        <div className="max-h-[60px] overflow-y-auto no-scrollbar">
                        {targets.map((t, i) => (
                            <span key={i}>
                                {targetType === 'string' ? `Array ${t.array} / String ${t.string}` : `Array ${t.array} / PCS ${t.pcs}`}<br/>
                            </span>
                        ))}
                        </div>
                    </div>

                    {error && (
                        <div className="p-2 bg-prizm-danger/10 border border-prizm-danger/30 text-prizm-danger rounded flex items-center gap-2">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <label className="text-prizm-text-muted uppercase tracking-wider font-bold border-b border-prizm-border pb-1">Mode</label>
                        <div className="flex gap-4">
                             <label className="flex items-center gap-2 cursor-pointer">
                                 <input type="radio" checked={mode === 'stop'} onChange={() => setMode('stop')} disabled={pending} />
                                 Stop Balancing
                             </label>
                             <label className="flex items-center gap-2 cursor-pointer">
                                 <input type="radio" checked={mode === 'avg'} onChange={() => setMode('avg')} disabled={pending} />
                                 Average Balancing
                             </label>
                             <label className="flex items-center gap-2 cursor-pointer">
                                 <input type="radio" checked={mode === 'provided'} onChange={() => setMode('provided')} disabled={pending} />
                                 Balance to Millivolts
                             </label>
                        </div>
                    </div>

                    {mode === 'provided' && (
                        <div className="flex flex-col gap-1">
                            <label className="text-prizm-text-muted uppercase tracking-wider font-bold">Provided mV (2500 - 3800)</label>
                            <input type="number" className="bg-prizm-surface border border-prizm-border text-prizm-text p-2 rounded" value={providedMv} onChange={e => setProvidedMv(parseInt(e.target.value, 10) || '')} disabled={pending} />
                        </div>
                    )}

                    {mode !== 'stop' && (
                        <div className="flex gap-4">
                             <div className="flex flex-col gap-1 flex-1">
                                 <label className="text-prizm-text-muted uppercase tracking-wider font-bold">Charging Deadband</label>
                                 <input type="number" className="bg-prizm-surface border border-prizm-border text-prizm-text p-2 rounded" value={chargingDeadband} onChange={e => setChargingDeadband(parseInt(e.target.value, 10) || 0)} disabled={pending} />
                             </div>
                             <div className="flex flex-col gap-1 flex-1">
                                 <label className="text-prizm-text-muted uppercase tracking-wider font-bold">Discharging Deadband</label>
                                 <input type="number" className="bg-prizm-surface border border-prizm-border text-prizm-text p-2 rounded" value={dischargingDeadband} onChange={e => setDischargingDeadband(parseInt(e.target.value, 10) || 0)} disabled={pending} />
                             </div>
                        </div>
                    )}

                    <div className="flex gap-4">
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-prizm-text-muted uppercase tracking-wider font-bold">Reason</label>
                            <select className="bg-prizm-surface border border-prizm-border text-prizm-text p-2 rounded w-full" value={reason} onChange={e => setReason(e.target.value)} disabled={pending}>
                                <option value="Corrective Action">Corrective Action</option>
                                <option value="Maintenance">Maintenance</option>
                                <option value="Commissioning">Commissioning</option>
                                <option value="Troubleshooting">Troubleshooting</option>
                                <option value="Testing">Testing</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-prizm-text-muted uppercase tracking-wider font-bold">Note (Optional)</label>
                            <input type="text" className="bg-prizm-surface border border-prizm-border text-prizm-text p-2 rounded" value={note} onChange={e => setNote(e.target.value)} placeholder="Enter details..." disabled={pending} />
                        </div>
                    </div>
                    
                    <div className="text-prizm-warning font-bold mt-2">
                        This will send a live EMS command to the selected target(s).
                    </div>
                </div>

                <div className="p-4 border-t border-prizm-border bg-prizm-surface-strong flex justify-end gap-3 font-mono text-xs">
                    <button 
                        onClick={onClose} 
                        disabled={pending}
                        className="px-4 py-2 rounded text-prizm-text-muted hover:text-prizm-text transition-colors uppercase tracking-wider font-bold border border-transparent hover:border-prizm-border"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handlePreflight}
                        disabled={pending || (mode === 'provided' && providedMv === '')}
                        className="px-4 py-2 rounded flex items-center gap-2 bg-prizm-primary/20 text-prizm-primary border border-prizm-primary/50 hover:bg-prizm-primary/30 uppercase tracking-wider font-bold"
                    >
                        {pending ? <><Activity size={14} className="animate-spin" /> Checking...</> : 'Review Preflight'}
                    </button>
                </div>
            </div>
        </div>
    );
}
