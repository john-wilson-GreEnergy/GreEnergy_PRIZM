import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, AlertTriangle, FileBox, Play, Search, Trash2, FolderSearch, HardDrive } from 'lucide-react';

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
  <h3 className={`font-bold text-lg text-prizm-text ${className}`}>
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

type ProvisioningBundleManifest = {
  sourceLabel: string;
  files: Array<{
    path: string;
    name: string;
    sizeBytes: number;
    kind: "text" | "binary";
    contentPreview?: string;
    truncated?: boolean;
  }>;
  directories: string[];
};

export default function ProvisioningDashboard({ active }: ProvisioningDashboardProps) {
  const [bundlePath, setBundlePath] = useState('');
  const [validation, setValidation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentManifest, setCurrentManifest] = useState<ProvisioningBundleManifest | null>(null);

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

  const handleValidatePath = async () => {
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

  const handleSelectPath = async () => {
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

  const handleBrowseFolder = async () => {
    if (!('showDirectoryPicker' in window)) {
       setError("Folder browsing is not supported by this browser. Use Manual Server Path instead.");
       return;
    }
    setLoading(true);
    setError(null);
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      const manifest: ProvisioningBundleManifest = {
        sourceLabel: dirHandle.name,
        files: [],
        directories: []
      };

      const MAX_PREVIEW_SIZE = 250 * 1024; // 250KB
      const MAX_TOTAL_PREVIEW = 2 * 1024 * 1024; // 2MB
      let totalPreviewRead = 0;

      const isTextFile = (name: string) => {
         return /\.(sh|json|xml|csv)$/i.test(name) || name === 'README' || name === 'README.md' || name === 'bundle.json' || name === 'provisioning-profile.json' || name === 'checksums.json';
      };

      async function walkDir(handle: any, currentPath: string) {
        for await (const entry of handle.values()) {
          const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
          if (entry.kind === 'file') {
             const file = await entry.getFile();
             const isText = isTextFile(entry.name);
             const fileInfo: any = {
                path: relativePath,
                name: entry.name,
                sizeBytes: file.size,
                kind: isText ? 'text' : 'binary'
             };

             if (isText && totalPreviewRead < MAX_TOTAL_PREVIEW) {
                let textToRead = file.size;
                let truncated = false;
                if (textToRead > MAX_PREVIEW_SIZE) {
                   textToRead = MAX_PREVIEW_SIZE;
                   truncated = true;
                }
                if (totalPreviewRead + textToRead > MAX_TOTAL_PREVIEW) {
                   textToRead = MAX_TOTAL_PREVIEW - totalPreviewRead;
                   truncated = true;
                }
                
                if (textToRead > 0) {
                   const blob = file.slice(0, textToRead);
                   const text = await blob.text();
                   fileInfo.contentPreview = text;
                   fileInfo.truncated = truncated;
                   totalPreviewRead += textToRead;
                }
             }

             manifest.files.push(fileInfo);
          } else if (entry.kind === 'directory') {
             manifest.directories.push(relativePath);
             await walkDir(entry, relativePath);
          }
        }
      }

      await walkDir(dirHandle, "");
      setCurrentManifest(manifest);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e.message);
      }
    }
    setLoading(false);
  };

  const handleValidateManifest = async () => {
    if (!currentManifest) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/local/provisioning/bundles/validate-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentManifest)
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

  const handleClear = async () => {
    try {
      await fetch('/api/local/provisioning/bundles/selected', { method: 'DELETE' });
      setValidation(null);
      setBundlePath('');
      setCurrentManifest(null);
    } catch (e) {
      console.error(e);
    }
  };

  if (!active) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-prizm-text flex items-center gap-2">
            <FileBox className="text-prizm-primary h-6 w-6" />
            Feather Provisioning
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Validate and stage Feather provisioning bundles.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Bundle Selection</CardTitle>
            <button
              onClick={handleClear}
              className="bg-red-500/10 text-red-400 px-3 py-1.5 text-sm rounded hover:bg-red-500/20 flex items-center gap-2 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Clear
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          
          {/* Browse Local Folder Section */}
          <div className="space-y-4">
             <div className="flex items-center gap-2 text-prizm-text font-medium">
                <FolderSearch className="w-5 h-5 text-prizm-primary" />
                Browse Local Folder
             </div>
             <p className="text-sm text-slate-600">
                Uses your browser to select a local provisioning bundle folder. No scripts are run.
             </p>
             <div className="flex items-center gap-4">
                <button
                   onClick={handleBrowseFolder}
                   disabled={loading}
                   className="bg-prizm-surface border border-prizm-border text-prizm-text px-4 py-2 rounded hover:bg-prizm-panel flex items-center gap-2 transition-colors"
                >
                   <FolderSearch className="w-4 h-4" /> Browse Folder
                </button>
                {currentManifest && (
                   <div className="flex-1 flex items-center justify-between bg-prizm-surface border border-prizm-border px-4 py-2 rounded">
                      <div>
                         <span className="text-prizm-text font-medium">{currentManifest.sourceLabel}</span>
                         <span className="text-slate-600 text-sm ml-2">({currentManifest.files.length} files)</span>
                      </div>
                      <button
                         onClick={handleValidateManifest}
                         disabled={loading}
                         className="bg-prizm-primary text-black px-4 py-1.5 rounded text-sm hover:brightness-110 font-medium flex items-center gap-2 transition-colors"
                      >
                         <CheckCircle className="w-4 h-4" /> Validate Selected Folder
                      </button>
                   </div>
                )}
             </div>
          </div>

          <div className="border-t border-prizm-border" />

          {/* Manual Server Path Section */}
          <div className="space-y-4">
             <div className="flex items-center gap-2 text-prizm-text font-medium">
                <HardDrive className="w-5 h-5 text-prizm-primary" />
                Manual Server Path
             </div>
             <div className="flex items-center gap-4">
               <input
                 type="text"
                 className="flex-1 bg-prizm-surface border border-prizm-border rounded px-4 py-2 text-prizm-text focus:outline-none focus:border-prizm-primary"
                 placeholder="Server Bundle Path (e.g. /home/john/hatchery)"
                 value={bundlePath}
                 onChange={(e) => setBundlePath(e.target.value)}
               />
               <button
                 onClick={handleValidatePath}
                 disabled={loading || !bundlePath}
                 className="bg-prizm-surface border border-prizm-border text-prizm-text px-4 py-2 rounded hover:bg-prizm-panel flex items-center gap-2 transition-colors disabled:opacity-50"
               >
                 <Search className="w-4 h-4" /> Validate Path
               </button>
               <button
                 onClick={handleSelectPath}
                 disabled={loading || !bundlePath || validation?.status === 'invalid'}
                 className="bg-prizm-primary text-black px-4 py-2 rounded hover:brightness-110 font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
               >
                 <CheckCircle className="w-4 h-4" /> Select Bundle
               </button>
             </div>
          </div>

          {error && <div className="text-red-700 mt-4 text-sm bg-red-100 p-3 rounded border border-red-200">{error}</div>}
        </CardContent>
      </Card>


      {validation && (
        <Card>
          <CardHeader>
             <div className="flex items-center justify-between">
                <CardTitle>Validation Results</CardTitle>
                <div className={`px-3 py-1 rounded text-sm font-bold flex items-center gap-2 ${
                  validation.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                  validation.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                  validation.status === 'blocked' ? 'bg-red-100 text-red-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {validation.status === 'ready' && <CheckCircle className="w-4 h-4" />}
                  {validation.status === 'partial' && <AlertTriangle className="w-4 h-4" />}
                  {(validation.status === 'blocked' || validation.status === 'invalid') && <ShieldAlert className="w-4 h-4" />}
                  {validation.status.toUpperCase()}
                </div>
             </div>
             <div className="text-xs text-slate-600 mt-2">
               Validated At: {new Date(validation.validatedAt).toLocaleString()}
             </div>
             <div className="text-sm text-slate-600 mt-2">
               {validation.status === 'ready' && "READY means all required files passed validation with no warnings."}
               {validation.status === 'partial' && "PARTIAL means the bundle is structurally usable, but PRIZM found warnings that should be reviewed before provisioning."}
               {validation.status === 'blocked' && "BLOCKED means required files or directories are missing or invalid."}
               {validation.status === 'invalid' && "INVALID means the selected folder could not be read or does not appear to be a provisioning bundle."}
             </div>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {validation.errors.length > 0 && (
               <div className="p-4 bg-red-100 border border-red-200 rounded">
                  <h4 className="text-red-700 font-medium mb-2">Errors</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    {validation.errors.map((e: string, i: number) => <li key={i} className="text-red-700 text-sm">{e}</li>)}
                  </ul>
               </div>
            )}
            
            {validation.warnings.length > 0 && (
               <div className="p-4 bg-amber-100 border border-amber-200 rounded">
                  <h4 className="text-amber-800 font-medium mb-2">Warnings</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    {validation.warnings.map((w: string, i: number) => <li key={i} className="text-amber-800 text-sm">{w}</li>)}
                  </ul>
               </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-prizm-text mb-3">Required Files</h4>
                <div className="border border-prizm-border rounded overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-prizm-surface text-slate-700">
                      <tr>
                        <th className="px-4 py-2">Path</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-prizm-border bg-prizm-panel">
                      {validation.requiredFiles.map((f: any, i: number) => (
                        <tr key={i}>
                           <td className="px-4 py-2 font-mono text-xs">{f.path}</td>
                           <td className={`px-4 py-2 ${f.status === 'present' ? 'text-emerald-600' : 'text-red-600'}`}>{f.status} {f.notes && `(${f.notes})`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-prizm-text mb-3">Required Directories</h4>
                  <div className="border border-prizm-border rounded overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-prizm-surface text-slate-700">
                        <tr>
                          <th className="px-4 py-2">Path</th>
                          <th className="px-4 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-prizm-border bg-prizm-panel">
                        {validation.requiredDirectories.map((f: any, i: number) => (
                          <tr key={i}>
                             <td className="px-4 py-2 font-mono text-xs">{f.path}</td>
                             <td className={`px-4 py-2 ${f.status === 'present' ? 'text-emerald-600' : 'text-red-600'}`}>{f.status} {f.notes && `(${f.notes})`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-prizm-text mb-3">Inspections</h4>
                  <div className="border border-prizm-border rounded overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-prizm-surface text-slate-700">
                        <tr>
                          <th className="px-4 py-2">Check</th>
                          <th className="px-4 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-prizm-border bg-prizm-panel">
                        {validation.inspections.map((f: any, i: number) => (
                          <tr key={i}>
                             <td className="px-4 py-2 font-mono text-xs">{f.label}</td>
                             <td className={`px-4 py-2 ${f.status === 'pass' ? 'text-emerald-600' : f.status === 'warn' ? 'text-amber-600' : f.status === 'fail' ? 'text-red-600' : 'text-slate-500'}`}>{f.status} {f.notes && `(${f.notes})`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-prizm-border pt-6 flex justify-between items-center">
               <div className="text-sm text-slate-600 italic max-w-2xl">
                 Provisioning execution is currently disabled. 
                 {validation.bundlePath && !validation.bundlePath.startsWith('/') ? 
                   " Note: You validated a local browser folder. Actual provisioning execution will require either selecting the same folder again during the run, or using a Manual Server Path when PRIZM runs on the same local machine." :
                   " Execution will be enabled once run planning is complete."}
               </div>
               <button disabled className="bg-prizm-surface text-slate-500 px-6 py-2 rounded flex items-center gap-2 cursor-not-allowed flex-shrink-0">
                 <Play className="w-4 h-4" /> Run Provisioning
               </button>
            </div>
            
          </CardContent>
        </Card>
      )}
    </div>
  );
}
