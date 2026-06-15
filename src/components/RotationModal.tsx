import React, { useState } from 'react';
import { TriangleAlert, X, Activity } from 'lucide-react';

export interface RotationTarget {
    array: number;
    string?: number;
    pcs?: number;
    allStrings?: boolean;
    allPcs?: boolean;
}

interface RotationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (req: { 
        targets: RotationTarget[]; 
        action: 'in' | 'out'; 
        reason: string; 
        note: string; 
        confirmed: boolean;
    }) => Promise<void>;
    targets: RotationTarget[];
    action: 'in' | 'out';
    targetType: 'string' | 'pcs';
}

export default function RotationModal({ isOpen, onClose, onConfirm, targets, action, targetType }: RotationModalProps) {
    const [reason, setReason] = useState('Maintenance');
    const [note, setNote] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleConfirm = async () => {
        try {
            setError('');
            setPending(true);
            await onConfirm({ targets, action, reason, note, confirmed: true });
        } catch (e: any) {
            setError(e.message || 'Failed to execute');
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
            <div className="bg-prizm-background border border-prizm-border rounded-lg shadow-xl max-w-md w-full overflow-hidden flex flex-col">
                <div className="p-4 border-b border-prizm-border flex items-center justify-between bg-black/40">
                    <h2 className="text-sm font-bold text-prizm-text uppercase tracking-widest flex items-center gap-2">
                        <TriangleAlert size={16} className="text-prizm-warning" /> Confirm Rotation Control
                    </h2>
                    <button onClick={onClose} disabled={pending} className="text-prizm-text-muted hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>
                
                <div className="p-4 flex flex-col gap-4 text-xs font-mono">
                    <div className={`p-3 rounded border ${action === 'in' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                        <strong>Action:</strong> Set Rotation: {action === 'in' ? 'IN' : 'OUT'}<br/>
                        <strong>Targets:</strong><br/>
                        {targets.map((t, i) => {
                            if (targetType === 'string') {
                                return <span key={i}>Array {t.array} / {t.allStrings ? 'All Strings' : `String ${t.string}`}<br/></span>;
                            } else {
                                return <span key={i}>Array {t.array} / {t.allPcs ? 'All PCS' : `PCS ${t.pcs}`}<br/></span>;
                            }
                        })}
                    </div>

                    {error && (
                        <div className="p-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded font-bold">
                            {error}
                        </div>
                   )}

                    <div className="flex flex-col gap-1">
                        <label className="text-prizm-text-muted uppercase tracking-wider font-bold">Reason</label>
                        <select className="bg-prizm-surface border border-prizm-border text-prizm-text p-2 rounded" value={reason} onChange={e => setReason(e.target.value)} disabled={pending}>
                            <option value="Maintenance">Maintenance</option>
                            <option value="Commissioning">Commissioning</option>
                            <option value="Troubleshooting">Troubleshooting</option>
                            <option value="Corrective Action">Corrective Action</option>
                            <option value="Testing">Testing</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-1 mt-1">
                        <label className="text-prizm-text-muted uppercase tracking-wider font-bold">Note (Optional)</label>
                        <textarea className="bg-prizm-surface border border-prizm-border text-prizm-text p-2 rounded no-scrollbar min-h-[60px]" value={note} onChange={e => setNote(e.target.value)} placeholder="Enter details..." disabled={pending} />
                    </div>

                    <div className="text-prizm-warning font-bold mt-2">
                        This will send a live EMS command to the selected target(s).
                    </div>
                </div>

                <div className="p-4 border-t border-prizm-border bg-black/40 flex justify-end gap-3 text-xs font-mono uppercase tracking-widest font-bold">
                    <button onClick={onClose} disabled={pending} className="px-4 py-2 text-prizm-text-muted hover:text-white transition-colors">Cancel</button>
                    <button 
                        onClick={handleConfirm} 
                        disabled={pending}
                        className={`px-4 py-2 rounded flex items-center gap-2 ${action === 'in' ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/50 hover:bg-emerald-500/30' : 'bg-red-500/20 text-red-500 border border-red-500/50 hover:bg-red-500/30'}`}
                    >
                        {pending ? <><Activity size={14} className="animate-spin" /> Executing...</> : `Confirm Rotation`}
                    </button>
                </div>
            </div>
        </div>
    );
}