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
        action: "in" | "out"; 
        reason: string; 
        excused: boolean; 
        explanation: string; 
        confirmation: string;
    }) => Promise<void>;
    targets: RotationTarget[];
    action: "in" | "out";
    targetType: "string" | "pcs";
}

export default function RotationModal({ isOpen, onClose, onConfirm, targets, action, targetType }: RotationModalProps) {
    const [reason, setReason] = useState("Maintenance");
    const [excused, setExcused] = useState(false);
    const [explanation, setExplanation] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    if (!isOpen) return null;

    let expectedCount = 0;
    if (targets.length === 1 && (targets[0].allStrings || targets[0].allPcs)) {
        expectedCount = 1; // e.g. OUT ARRAY 1 STRINGS
    } else {
        expectedCount = targets.length;
    }

    let confirmationHint = "";
    if (targets.length === 1 && targets[0].allStrings) {
        confirmationHint = `${action.toUpperCase()} ARRAY ${targets[0].array} STRINGS`;
    } else if (targets.length === 1 && targets[0].allPcs) {
        confirmationHint = `${action.toUpperCase()} ARRAY ${targets[0].array} PCS`;
    } else if (targetType === "string") {
        confirmationHint = `${action.toUpperCase()} ${targets.length} STRINGS`;
    } else {
        confirmationHint = `${action.toUpperCase()} ${targets.length} PCS`;
    }

    const handleConfirm = async () => {
        try {
            setError("");
            
            // Basic frontend side check for exact or case-insensitive match (backend will strictly validate)
            const cleanedConf = confirmation.trim().toUpperCase();
            if (cleanedConf !== confirmationHint.toUpperCase() && cleanedConf !== confirmationHint.toUpperCase() + "ES") {
                setError(`Confirmation phrase must be exactly: "${confirmationHint}"`);
                return;
            }

            setPending(true);
            await onConfirm({ targets, action, reason, excused, explanation, confirmation });
        } catch (e: any) {
            setError(e.message || "Failed to execute");
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
                        <strong>Action:</strong> {action === 'in' ? "IN ROTATION" : "OUT OF ROTATION"}<br/>
                        <strong>Target(s):</strong> {targets.length} {targetType.toUpperCase()}(S)
                    </div>

                    {error && (
                        <div className="p-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded font-bold">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <label className="text-prizm-text-muted uppercase tracking-wider font-bold">Reason Code</label>
                        <select className="bg-prizm-surface border border-prizm-border text-prizm-text p-2 rounded" value={reason} onChange={e => setReason(e.target.value)} disabled={pending}>
                            <option value="Maintenance">Maintenance</option>
                            <option value="Testing">Testing</option>
                            <option value="Fault">Fault/Issue</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                        <input type="checkbox" id="excusedToggle" checked={excused} onChange={e => setExcused(e.target.checked)} disabled={pending} />
                        <label htmlFor="excusedToggle" className="text-prizm-text uppercase tracking-wider cursor-pointer">Mark as Excused Availability</label>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-prizm-text-muted uppercase tracking-wider font-bold">Explanation</label>
                        <textarea className="bg-prizm-surface border border-prizm-border text-prizm-text p-2 rounded no-scrollbar min-h-[60px]" value={explanation} onChange={e => setExplanation(e.target.value)} placeholder="Enter details..." disabled={pending} />
                    </div>

                    <div className="flex flex-col gap-1 mt-2">
                        <label className="text-prizm-text-muted uppercase tracking-wider font-bold">Type to confirm: <span className="text-white">{confirmationHint}</span></label>
                        <input type="text" className="bg-prizm-surface border border-prizm-border text-prizm-text p-2 rounded" value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder={confirmationHint} disabled={pending} />
                    </div>
                </div>

                <div className="p-4 border-t border-prizm-border bg-black/40 flex justify-end gap-3 text-xs font-mono uppercase tracking-widest font-bold">
                    <button onClick={onClose} disabled={pending} className="px-4 py-2 text-prizm-text-muted hover:text-white transition-colors">Cancel</button>
                    <button 
                        onClick={handleConfirm} 
                        disabled={pending}
                        className={`px-4 py-2 rounded flex items-center gap-2 ${action === 'in' ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/50 hover:bg-emerald-500/30' : 'bg-red-500/20 text-red-500 border border-red-500/50 hover:bg-red-500/30'}`}
                    >
                        {pending ? <><Activity size={14} className="animate-spin" /> Executing...</> : "Execute"}
                    </button>
                </div>
            </div>
        </div>
    );
}
