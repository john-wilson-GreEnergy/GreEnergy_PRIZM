import React, { useState, useEffect } from 'react';
import { Camera, FileText, Download, Trash2, CheckCircle, AlertTriangle, FileJson, RefreshCw, FileArchive, Activity, Layers } from 'lucide-react';

export default function SiteDataExport() {
  const [reports, setReports] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState({
    refresh: true,
    includeSourceHealth: true,
    includeBranding: true,
    includeRawAppendix: false,
    includeTechnicianNotes: true,
    includeInactiveDevices: true,
    onlyActiveFaults: false,
    saveJson: true,
    generateCsv: true
  });
  const [techNotes, setTechNotes] = useState('');
  
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [snapshotNotes, setSnapshotNotes] = useState('');
  
  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const [comparisonTitle, setComparisonTitle] = useState('');

  const [message, setMessage] = useState<{text: string, type: 'info'|'error'} | null>(null);

  const showMsg = (text: string, type: 'info'|'error' = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const fetchHistory = async () => {
    try {
      const [repRes, snapRes] = await Promise.all([
        fetch('/api/local/reports'),
        fetch('/api/local/reports/snapshots')
      ]);
      if (repRes.ok) {
        const d = await repRes.json();
        setReports(d.reports || []);
      }
      if (snapRes.ok) {
        const d = await snapRes.json();
        setSnapshots(d.snapshots || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleGenerate = async (type: string, format: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/local/reports/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          notes: options.includeTechnicianNotes ? techNotes : undefined,
          ...options
        })
      });
      const data = await res.json();
      if (data.success) {
        showMsg(`Report generated successfully: ${data.reportId}`, 'info');
        if (data.pdfUrl) {
          const a = document.createElement('a');
          a.href = data.pdfUrl;
          a.download = data.reportId + '.pdf';
          a.click();
        }
        fetchHistory();
      } else {
        showMsg(data.error || 'Failed to generate report', 'error');
      }
    } catch (e: any) {
      showMsg(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCapture = async (labelPrefix: string) => {
    setLoading(true);
    try {
      const label = snapshotLabel || `${labelPrefix} - ${new Date().toLocaleTimeString()}`;
      const res = await fetch('/api/local/reports/snapshots/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, notes: snapshotNotes, refresh: options.refresh })
      });
      const data = await res.json();
      if (data.success) {
        showMsg(`Snapshot captured: ${data.snapshotId}`, 'info');
        fetchHistory();
        setSnapshotLabel('');
        setSnapshotNotes('');
      } else {
        showMsg(data.error, 'error');
      }
    } catch (e: any) {
      showMsg(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (!confirm('Delete this report permanently?')) return;
    try {
      await fetch(`/api/local/reports/${id}`, { method: 'DELETE' });
      fetchHistory();
    } catch (e) {}
  };

  const handleDeleteSnapshot = async (id: string) => {
    if (!confirm('Delete this snapshot permanently?')) return;
    try {
      await fetch(`/api/local/reports/snapshots/${id}`, { method: 'DELETE' });
      fetchHistory();
    } catch (e) {}
  };

  const handleGenerateComparison = async () => {
    if (!beforeId || !afterId) {
      showMsg('Select both Before and After snapshots', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/local/reports/comparison`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotIds: [beforeId, afterId],
          titleOverride: comparisonTitle,
          notes: techNotes
        })
      });
      const data = await res.json();
      if (data.success) {
        showMsg('Comparison report generated', 'info');
        if (data.pdfUrl) {
          const a = document.createElement('a');
          a.href = data.pdfUrl;
          a.download = data.reportId + '.pdf';
          a.click();
        }
        fetchHistory();
      } else {
        showMsg(data.error, 'error');
      }
    } catch (e: any) {
      showMsg(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pt-4 border-t border-prizm-border mt-4 w-full">
      <div className="flex items-center gap-2">
        <FileText className="text-cyan-400" size={20} />
        <h2 className="text-lg font-black uppercase tracking-wider text-prizm-text">Site Data Export</h2>
      </div>

      {message && (
        <div className={`p-3 rounded text-xs font-bold border ${message.type === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'}`}>
          {message.text}
        </div>
      )}

      {/* Export Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { type: 'site-snapshot', title: 'Full Site Snapshot', desc: 'Complete site status capture including energy, thermal, controls, communications, and corrective actions.' },
          { type: 'thermal-health', title: 'Thermal Health', desc: 'Focused HVAC, environmental, detector, and cell temperature report.' },
          { type: 'energy-health', title: 'Energy / Electrical', desc: 'Focused string availability, SOC, kWh, PCS, and cell voltage report.' },
          { type: 'corrective-actions', title: 'Corrective Actions', desc: 'Focused active alarm/warning export with affected targets and suggested actions.' }
        ].map(t => (
          <div key={t.type} className="bg-prizm-surface-strong border border-prizm-border p-4 rounded flex flex-col gap-2">
            <h3 className="text-sm font-bold text-prizm-primary">{t.title}</h3>
            <p className="text-[10px] text-prizm-text-muted flex-1">{t.desc}</p>
            <div className="flex gap-2 mt-2">
              <button 
                onClick={() => handleGenerate(t.type, 'pdf')}
                disabled={loading}
                className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-black text-[10px] font-bold rounded w-full disabled:opacity-50"
              >
                Generate PDF
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Options Panel */}
        <div className="bg-prizm-surface-strong border border-prizm-border p-4 rounded space-y-4 lg:col-span-1">
          <h3 className="text-xs font-bold uppercase text-prizm-text border-b border-white/5 pb-2">Export Options</h3>
          
          <div className="space-y-2 text-[10px] text-prizm-text">
            {Object.keys(options).map(key => {
               if (key === 'refresh' || key.startsWith('include') || key === 'onlyActiveFaults' || key === 'saveJson' || key === 'generateCsv') {
                 return (
                   <label key={key} className="flex items-center gap-2 cursor-pointer">
                     <input 
                       type="checkbox" 
                       checked={(options as any)[key]} 
                       onChange={(e) => setOptions({...options, [key]: e.target.checked})}
                       className="rounded border-prizm-border bg-black/20"
                     />
                     <span className="uppercase">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                   </label>
                 )
               }
               return null;
            })}
          </div>

          <div className="pt-2">
             <label className="text-[10px] uppercase font-bold text-prizm-text-muted">Technician Notes</label>
             <textarea 
               value={techNotes}
               onChange={e => setTechNotes(e.target.value)}
               className="w-full mt-1 bg-black/20 border border-prizm-border rounded p-2 text-xs text-prizm-text outline-none focus:border-cyan-500 min-h-[80px]"
               placeholder="Optional notes appended to PDF..."
             />
          </div>
        </div>

        {/* Snapshot Capture */}
        <div className="bg-prizm-surface-strong border border-prizm-border p-4 rounded space-y-4 lg:col-span-1">
          <h3 className="text-xs font-bold uppercase text-prizm-text border-b border-white/5 pb-2">Snapshot Capture</h3>
          <p className="text-[10px] text-prizm-text-muted">Save a point-in-time snapshot of the site to compare later.</p>
          
          <div>
            <label className="text-[10px] uppercase font-bold text-prizm-text-muted">Snapshot Label</label>
            <input 
              type="text" 
              value={snapshotLabel}
              onChange={e => setSnapshotLabel(e.target.value)}
              className="w-full mt-1 bg-black/20 border border-prizm-border rounded p-2 text-xs text-prizm-text outline-none"
              placeholder="e.g. Before string repair"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-prizm-text-muted">Notes</label>
            <input 
              type="text" 
              value={snapshotNotes}
              onChange={e => setSnapshotNotes(e.target.value)}
              className="w-full mt-1 bg-black/20 border border-prizm-border rounded p-2 text-xs text-prizm-text outline-none"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={() => handleCapture('Snapshot')} disabled={loading} className="px-3 py-1.5 bg-prizm-primary/20 text-prizm-primary border border-prizm-primary/30 text-[10px] font-bold rounded flex-1">Capture</button>
            <button onClick={() => handleCapture('Before Repair')} disabled={loading} className="px-3 py-1.5 bg-prizm-surface text-prizm-text border border-prizm-border text-[10px] font-bold rounded flex-1">Before</button>
            <button onClick={() => handleCapture('After Repair')} disabled={loading} className="px-3 py-1.5 bg-prizm-surface text-prizm-text border border-prizm-border text-[10px] font-bold rounded flex-1">After</button>
          </div>
        </div>

        {/* Comparison */}
        <div className="bg-prizm-surface-strong border border-prizm-border p-4 rounded space-y-4 lg:col-span-1">
          <h3 className="text-xs font-bold uppercase text-prizm-text border-b border-white/5 pb-2">Before / After Comparison</h3>
          
          <div>
            <label className="text-[10px] uppercase font-bold text-prizm-text-muted">Before Snapshot</label>
            <select value={beforeId} onChange={e => setBeforeId(e.target.value)} className="w-full mt-1 bg-black/20 border border-prizm-border rounded p-2 text-xs text-prizm-text outline-none">
              <option value="">-- Select --</option>
              {snapshots.map(s => <option key={s.snapshotId} value={s.snapshotId}>{s.label} ({new Date(s.capturedAt).toLocaleTimeString()})</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-prizm-text-muted">After Snapshot</label>
            <select value={afterId} onChange={e => setAfterId(e.target.value)} className="w-full mt-1 bg-black/20 border border-prizm-border rounded p-2 text-xs text-prizm-text outline-none">
              <option value="">-- Select --</option>
              {snapshots.map(s => <option key={s.snapshotId} value={s.snapshotId}>{s.label} ({new Date(s.capturedAt).toLocaleTimeString()})</option>)}
            </select>
          </div>

          <button onClick={handleGenerateComparison} disabled={loading || !beforeId || !afterId} className="w-full px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 text-[10px] font-bold uppercase rounded disabled:opacity-50 mt-2">
            Generate Comparison PDF
          </button>
        </div>
      </div>

      {/* Report History */}
      <div className="bg-prizm-surface-strong border border-prizm-border rounded">
        <div className="p-3 border-b border-white/5 flex justify-between items-center">
          <h3 className="text-xs font-bold uppercase text-prizm-text">Generated Reports & Snapshots</h3>
          <button onClick={fetchHistory} className="text-prizm-text-muted hover:text-cyan-400"><RefreshCw size={14} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[10px]">
            <thead className="bg-black/20 text-prizm-text-muted uppercase">
              <tr>
                <th className="p-2">Type</th>
                <th className="p-2">Name / Title</th>
                <th className="p-2">Date</th>
                <th className="p-2">Assets</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map(s => (
                <tr key={s.snapshotId} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="p-2 text-purple-400 font-bold uppercase">Snapshot</td>
                  <td className="p-2 font-bold text-prizm-text">{s.label}</td>
                  <td className="p-2 text-prizm-text-muted">{new Date(s.capturedAt).toLocaleString()}</td>
                  <td className="p-2">-</td>
                  <td className="p-2 text-right">
                    <button onClick={() => handleDeleteSnapshot(s.snapshotId)} className="p-1 text-red-400/50 hover:text-red-400"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
              {reports.map(r => (
                <tr key={r.reportId} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="p-2 text-cyan-400 font-bold uppercase">{r.reportType}</td>
                  <td className="p-2 font-bold text-prizm-text">{r.title}</td>
                  <td className="p-2 text-prizm-text-muted">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="p-2 flex gap-2">
                    {r.pdfPath && <a href={`/api/local/reports/download/${r.reportId}/report.pdf`} download className="text-cyan-400 hover:underline">PDF</a>}
                    {r.jsonPath && <a href={`/api/local/reports/download/${r.reportId}/report.json`} download className="text-cyan-400 hover:underline">JSON</a>}
                    {r.csvPaths?.length > 0 && <span className="text-cyan-400 cursor-help" title="CSV available via direct download">CSV</span>}
                  </td>
                  <td className="p-2 text-right">
                    <button onClick={() => handleDeleteReport(r.reportId)} className="p-1 text-red-400/50 hover:text-red-400"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
              {reports.length === 0 && snapshots.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-prizm-text-muted italic">No reports or snapshots found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
