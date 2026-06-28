import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, AlertTriangle, FileBox, Play, Search, Trash2 } from 'lucide-react';

const Card = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-prizm-panel border border-prizm-border rounded-lg shadow-sm ${className}`}>
    {children}
  </div>
);

const CardHeader = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`p-4 border-b border-prizm-border ${className}`}>
    {children}
  </div>
);

const CardTitle = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <h3 className={`font-bold text-lg text-white ${className}`}>
    {children}
  </h3>
);

const CardContent = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`p-4 ${className}`}>
    {children}
  </div>
);

interface ProvisioningDashboardProps {
  active: boolean;
}

export default function ProvisioningDashboard({ active }: ProvisioningDashboardProps) {
  const [bundlePath, setBundlePath] = useState('');
  const [validation, setValidation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSelectedBundle = async () => {
    try {
      const res = await fetch('/api/local/provisioning/bundles/latest');
      const data = await res.json();
      if (data.success && data.validation) {
        setValidation(data.validation);
        setBundlePath(data.validation.bundlePath);
      } else {
        setValidation(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (active) {
      fetchSelectedBundle();
    }
  }, [active]);

  const handleValidate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/local/provisioning/bundles/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundlePath })
      });
      const data = await res.json();
      if (data.success) {
        setValidation(data.validation);
      } else {
        setError(data.error || 'Validation failed');
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleSelect = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/local/provisioning/bundles/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundlePath })
      });
      const data = await res.json();
      if (data.success) {
        setValidation(data.validation);
      } else {
        setError(data.error || 'Select failed');
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleClear = async () => {
    try {
      await fetch('/api/local/provisioning/bundles/selected', { method: 'DELETE' });
      setValidation(null);
      setBundlePath('');
    } catch (e) {
      console.error(e);
    }
  };

  if (!active) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <FileBox className="text-prizm-primary h-6 w-6" />
            Feather Provisioning
          </h2>
          <p className="text-prizm-text-muted text-sm mt-1">
            Validate and stage Feather provisioning bundles.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bundle Selection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <input
              type="text"
              className="flex-1 bg-prizm-panel border border-prizm-border rounded px-4 py-2 text-white"
              placeholder="Local Bundle Path (e.g. /home/john/hatchery)"
              value={bundlePath}
              onChange={(e) => setBundlePath(e.target.value)}
            />
            <button
              onClick={handleValidate}
              disabled={loading || !bundlePath}
              className="bg-prizm-surface border border-prizm-border text-white px-4 py-2 rounded hover:bg-prizm-panel flex items-center gap-2"
            >
              <Search className="w-4 h-4" /> Validate Bundle
            </button>
            <button
              onClick={handleSelect}
              disabled={loading || !bundlePath || validation?.status === 'invalid'}
              className="bg-prizm-primary text-black px-4 py-2 rounded hover:brightness-110 font-medium flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" /> Select Bundle
            </button>
            <button
              onClick={handleClear}
              className="bg-red-500/10 text-red-400 px-4 py-2 rounded hover:bg-red-500/20 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Clear
            </button>
          </div>
          {error && <div className="text-red-400 mt-4 text-sm">{error}</div>}
        </CardContent>
      </Card>

      {validation && (
        <Card>
          <CardHeader>
             <div className="flex items-center justify-between">
                <CardTitle>Validation Results</CardTitle>
                <div className={`px-3 py-1 rounded text-sm font-bold flex items-center gap-2 ${
                  validation.status === 'ready' ? 'bg-emerald-500/20 text-emerald-400' :
                  validation.status === 'partial' ? 'bg-amber-500/20 text-amber-400' :
                  validation.status === 'blocked' ? 'bg-red-500/20 text-red-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {validation.status === 'ready' && <CheckCircle className="w-4 h-4" />}
                  {validation.status === 'partial' && <AlertTriangle className="w-4 h-4" />}
                  {(validation.status === 'blocked' || validation.status === 'invalid') && <ShieldAlert className="w-4 h-4" />}
                  {validation.status.toUpperCase()}
                </div>
             </div>
             <div className="text-xs text-prizm-text-muted mt-1">
               Validated At: {new Date(validation.validatedAt).toLocaleString()}
             </div>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {validation.errors.length > 0 && (
               <div className="p-4 bg-red-500/10 border border-red-500/20 rounded">
                  <h4 className="text-red-400 font-medium mb-2">Errors</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    {validation.errors.map((e: string, i: number) => <li key={i} className="text-red-300 text-sm">{e}</li>)}
                  </ul>
               </div>
            )}
            
            {validation.warnings.length > 0 && (
               <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded">
                  <h4 className="text-amber-400 font-medium mb-2">Warnings</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    {validation.warnings.map((w: string, i: number) => <li key={i} className="text-amber-300 text-sm">{w}</li>)}
                  </ul>
               </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-white mb-3">Required Files</h4>
                <div className="border border-prizm-border rounded overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-prizm-surface text-prizm-text-muted">
                      <tr>
                        <th className="px-4 py-2">Path</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-prizm-border bg-prizm-panel">
                      {validation.requiredFiles.map((f: any, i: number) => (
                        <tr key={i}>
                           <td className="px-4 py-2 font-mono text-xs">{f.path}</td>
                           <td className={`px-4 py-2 ${f.status === 'present' ? 'text-emerald-400' : 'text-red-400'}`}>{f.status} {f.notes && `(${f.notes})`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-white mb-3">Required Directories</h4>
                  <div className="border border-prizm-border rounded overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-prizm-surface text-prizm-text-muted">
                        <tr>
                          <th className="px-4 py-2">Path</th>
                          <th className="px-4 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-prizm-border bg-prizm-panel">
                        {validation.requiredDirectories.map((f: any, i: number) => (
                          <tr key={i}>
                             <td className="px-4 py-2 font-mono text-xs">{f.path}</td>
                             <td className={`px-4 py-2 ${f.status === 'present' ? 'text-emerald-400' : 'text-red-400'}`}>{f.status} {f.notes && `(${f.notes})`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-white mb-3">Inspections</h4>
                  <div className="border border-prizm-border rounded overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-prizm-surface text-prizm-text-muted">
                        <tr>
                          <th className="px-4 py-2">Check</th>
                          <th className="px-4 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-prizm-border bg-prizm-panel">
                        {validation.inspections.map((f: any, i: number) => (
                          <tr key={i}>
                             <td className="px-4 py-2 font-mono text-xs">{f.label}</td>
                             <td className={`px-4 py-2 ${f.status === 'pass' ? 'text-emerald-400' : f.status === 'warn' ? 'text-amber-400' : f.status === 'fail' ? 'text-red-400' : 'text-gray-400'}`}>{f.status} {f.notes && `(${f.notes})`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-prizm-border pt-6 flex justify-end">
               <button disabled className="bg-prizm-surface text-prizm-text-muted px-6 py-2 rounded flex items-center gap-2 cursor-not-allowed" title="Provisioning execution is disabled until bundle validation and run planning are complete.">
                 <Play className="w-4 h-4" /> Run Provisioning
               </button>
            </div>
            
          </CardContent>
        </Card>
      )}
    </div>
  );
}
