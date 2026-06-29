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

const commandKeywords = [
  "contains provisioning commands",
  "controlled execution",
  "sudo",
  "service tomcat8",
  "scp",
  "ssh",
  "sed",
  "cp",
  "chmod"
];

const isExpectedProvisioningCommandWarning = (validation: any) => {
  if (!validation || validation.status !== 'partial') return false;
  
  const checkText = (text: string) => {
    const lower = text.toLowerCase();
    return commandKeywords.some(kw => lower.includes(kw.toLowerCase()));
  };

  const warnings = validation.warnings || [];
  const inspectionNotes = (validation.inspections || [])
    .filter((ins: any) => ins.status === 'warn')
    .map((ins: any) => ins.notes || "");

  const allIssues = [...warnings, ...inspectionNotes];
  
  if (allIssues.length === 0) return false;

  return allIssues.every(issue => checkText(issue));
};

const getValidationDisplayStatus = (validation: any) => {
  if (isExpectedProvisioningCommandWarning(validation)) {
    return 'READY FOR PLANNING';
  }
  return validation.status.toUpperCase();
};

const getValidationStatusExplanation = (validation: any) => {
  if (isExpectedProvisioningCommandWarning(validation)) {
    return "This bundle passed file and configuration validation. The remaining warnings identify provisioning commands that PRIZM must execute in a controlled future run.";
  }
  if (validation.status === 'ready') return "READY means all required files passed validation with no warnings.";
  if (validation.status === 'partial') return "PARTIAL means the bundle is structurally usable, but PRIZM found warnings that should be reviewed before provisioning.";
  if (validation.status === 'blocked') return "BLOCKED means required files or directories are missing or invalid.";
  if (validation.status === 'invalid') return "INVALID means the selected folder could not be read or does not appear to be a provisioning bundle.";
  return "";
};

export default function ProvisioningDashboard({ active }: ProvisioningDashboardProps) {
  const [bundlePath, setBundlePath] = useState('');
  const [validation, setValidation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentManifest, setCurrentManifest] = useState<ProvisioningBundleManifest | null>(null);

  const [targetFeatherIp, setTargetFeatherIp] = useState('');
  const [featherIndex, setFeatherIndex] = useState('');
  const [ioLogikIp, setIoLogikIp] = useState('');
  const [targetLabel, setTargetLabel] = useState('');
  const [planPreview, setPlanPreview] = useState<any>(null);

  // Auto-calculate ioLogik IP
  useEffect(() => {
    if (targetFeatherIp) {
      const parts = targetFeatherIp.split('.');
      if (parts.length === 4) {
        const last = parseInt(parts[3], 10);
        if (!isNaN(last) && last < 255) {
          setIoLogikIp(`${parts[0]}.${parts[1]}.${parts[2]}.${last + 1}`);
        } else {
          setIoLogikIp('');
        }
      }
    }
  }, [targetFeatherIp]);

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
      setPlanPreview(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGeneratePlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const bundleSource = currentManifest ? {
        mode: 'manifest' as const,
        sourceLabel: currentManifest.sourceLabel,
        bundlePath: ''
      } : {
        mode: 'server-path' as const,
        sourceLabel: bundlePath,
        bundlePath: bundlePath
      };

      const res = await fetch('/api/local/provisioning/plans/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetFeatherIp,
          featherIndex: parseInt(featherIndex, 10),
          ioLogikIp,
          targetLabel,
          bundleValidation: validation,
          bundleSource
        })
      });
      const data = await res.json();
      if (data.success) {
        setPlanPreview(data.plan);
      } else {
        setError(data.error || 'Failed to generate plan');
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
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
              className="bg-red-100 text-red-700 px-3 py-1.5 text-sm rounded hover:bg-red-200 flex items-center gap-2 transition-colors"
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
                  getValidationDisplayStatus(validation) === 'READY FOR PLANNING' ? 'bg-sky-100 text-sky-700' :
                  validation.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                  validation.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                  validation.status === 'blocked' ? 'bg-red-100 text-red-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {validation.status === 'ready' && <CheckCircle className="w-4 h-4" />}
                  {getValidationDisplayStatus(validation) === 'READY FOR PLANNING' && <CheckCircle className="w-4 h-4" />}
                  {getValidationDisplayStatus(validation) === 'PARTIAL' && <AlertTriangle className="w-4 h-4" />}
                  {(validation.status === 'blocked' || validation.status === 'invalid') && <ShieldAlert className="w-4 h-4" />}
                  {getValidationDisplayStatus(validation)}
                </div>
             </div>
             <div className="text-xs text-slate-600 mt-2">
               Validated At: {new Date(validation.validatedAt).toLocaleString()}
             </div>
             <div className="text-sm text-slate-600 mt-2">
               {getValidationStatusExplanation(validation)}
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
                  <h4 className="text-amber-800 font-medium mb-2">
                    {getValidationDisplayStatus(validation) === 'READY FOR PLANNING' ? 'Provisioning Command Review' : 'Warnings'}
                  </h4>
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
                           <td className="px-4 py-2 font-mono text-xs text-slate-800">{f.path}</td>
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
                             <td className="px-4 py-2 font-mono text-xs text-slate-800">{f.path}</td>
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
                             <td className="px-4 py-2 font-mono text-xs text-slate-800">{f.label}</td>
                             <td className={`px-4 py-2 ${f.status === 'pass' ? 'text-emerald-600' : f.status === 'warn' ? 'text-amber-600' : f.status === 'fail' ? 'text-red-600' : 'text-slate-500'}`}>{f.status} {f.notes && `(${f.notes})`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-prizm-border pt-6">
               <h4 className="font-medium text-prizm-text mb-4">Provisioning Plan Preview</h4>
               <div className="grid grid-cols-4 gap-4 mb-6">
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Target Feather IP</label>
                   <input 
                     type="text" 
                     className="w-full bg-prizm-surface border border-prizm-border rounded px-3 py-2 text-prizm-text focus:outline-none focus:border-prizm-primary text-sm"
                     placeholder="10.0.7.25"
                     value={targetFeatherIp}
                     onChange={(e) => setTargetFeatherIp(e.target.value)}
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Feather Index / Identity</label>
                   <input 
                     type="text" 
                     className="w-full bg-prizm-surface border border-prizm-border rounded px-3 py-2 text-prizm-text focus:outline-none focus:border-prizm-primary text-sm"
                     placeholder="705"
                     value={featherIndex}
                     onChange={(e) => setFeatherIndex(e.target.value)}
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">ioLogik IP</label>
                   <input 
                     type="text" 
                     className="w-full bg-prizm-surface border border-prizm-border rounded px-3 py-2 text-prizm-text focus:outline-none focus:border-prizm-primary text-sm"
                     placeholder="10.0.7.26"
                     value={ioLogikIp}
                     onChange={(e) => setIoLogikIp(e.target.value)}
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Target Label (Optional)</label>
                   <input 
                     type="text" 
                     className="w-full bg-prizm-surface border border-prizm-border rounded px-3 py-2 text-prizm-text focus:outline-none focus:border-prizm-primary text-sm"
                     placeholder="Array 7 ES 5"
                     value={targetLabel}
                     onChange={(e) => setTargetLabel(e.target.value)}
                   />
                 </div>
               </div>
               
               <div className="flex justify-end">
                 <button
                   onClick={handleGeneratePlan}
                   disabled={loading || !targetFeatherIp || !featherIndex || !ioLogikIp}
                   className="bg-prizm-surface border border-prizm-border text-prizm-text px-6 py-2 rounded hover:bg-prizm-panel flex items-center gap-2 transition-colors disabled:opacity-50"
                 >
                   <Play className="w-4 h-4" /> Generate Plan Preview
                 </button>
               </div>
            </div>

            {planPreview && (
              <div className="mt-8 border-t border-prizm-border pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium text-prizm-text text-lg">Plan Preview</h4>
                  <div className="bg-sky-100 text-sky-700 px-3 py-1 rounded text-sm font-bold flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> PREVIEW ONLY
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="bg-prizm-surface border border-prizm-border p-4 rounded-lg">
                    <h5 className="font-medium text-slate-700 mb-2">Target Summary</h5>
                    <div className="space-y-1 text-sm text-slate-600">
                      <div>Target Feather IP: <span className="font-medium text-slate-800">{planPreview.target.targetFeatherIp}</span></div>
                      <div>Feather Index: <span className="font-medium text-slate-800">{planPreview.target.featherIndex}</span></div>
                      <div>ioLogik IP: <span className="font-medium text-slate-800">{planPreview.target.ioLogikIp}</span></div>
                      {planPreview.target.targetLabel && (
                        <div>Label: <span className="font-medium text-slate-800">{planPreview.target.targetLabel}</span></div>
                      )}
                    </div>
                  </div>
                  <div className="bg-prizm-surface border border-prizm-border p-4 rounded-lg">
                    <h5 className="font-medium text-slate-700 mb-2">Bundle Summary</h5>
                    <div className="space-y-1 text-sm text-slate-600">
                      <div>Source: <span className="font-medium text-slate-800">{planPreview.bundle.sourceLabel}</span></div>
                      <div>Mode: <span className="font-medium text-slate-800">{planPreview.bundle.sourceMode}</span></div>
                      <div>Status: <span className="font-medium text-slate-800 uppercase">{planPreview.bundle.bundleStatus}</span></div>
                    </div>
                  </div>
                </div>

                {planPreview.warnings.length > 0 && (
                  <div className="mb-6 p-4 bg-amber-100 border border-amber-200 rounded">
                    <h4 className="text-amber-800 font-medium mb-2">Plan Warnings</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      {planPreview.warnings.map((w: string, i: number) => <li key={i} className="text-amber-800 text-sm">{w}</li>)}
                    </ul>
                  </div>
                )}

                <div className="space-y-4">
                  <h5 className="font-medium text-slate-700">Planned Steps (No commands have been executed)</h5>
                  {planPreview.steps.map((step: any) => (
                    <div key={step.stepId} className="border border-prizm-border rounded-lg bg-prizm-panel overflow-hidden">
                      <div className={`p-3 border-b border-prizm-border flex justify-between items-center ${
                        step.riskLevel === 'high' ? 'bg-red-50' : step.riskLevel === 'medium' ? 'bg-amber-50' : 'bg-slate-50'
                      }`}>
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                            step.riskLevel === 'high' ? 'bg-red-200 text-red-800' : step.riskLevel === 'medium' ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-800'
                          }`}>
                            {step.order}
                          </span>
                          <span className={`font-medium ${
                            step.riskLevel === 'high' ? 'text-red-900' : step.riskLevel === 'medium' ? 'text-amber-900' : 'text-slate-900'
                          }`}>
                            {step.title}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 bg-white capitalize">{step.category}</span>
                          <span className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 bg-white font-mono">{step.executionType}</span>
                        </div>
                      </div>
                      <div className="p-4 space-y-3">
                        <p className="text-sm text-slate-700">{step.description}</p>
                        
                        <div className="flex gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${step.wouldModifyTarget ? 'bg-amber-400' : 'bg-slate-300'}`}></span>
                            Modifies Target
                          </span>
                          <span className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${step.requiresCredentials ? 'bg-blue-400' : 'bg-slate-300'}`}></span>
                            Requires Credentials
                          </span>
                        </div>

                        {step.commandsPreview && step.commandsPreview.length > 0 && (
                          <div className="mt-3">
                            <div className="text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">Commands (Preview)</div>
                            <pre className="bg-slate-900 text-slate-300 p-2 rounded text-xs font-mono overflow-x-auto">
                              {step.commandsPreview.join('\n')}
                            </pre>
                          </div>
                        )}
                        
                        {step.filesWritten && step.filesWritten.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">Files Written</div>
                            <ul className="list-disc pl-5 text-sm text-slate-700 font-mono">
                              {step.filesWritten.map((f: string, i: number) => <li key={i}>{f}</li>)}
                            </ul>
                          </div>
                        )}

                        {step.validations && step.validations.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">Validations</div>
                            <ul className="list-disc pl-5 text-sm text-slate-700">
                              {step.validations.map((v: string, i: number) => <li key={i}>{v}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8 border-t border-prizm-border pt-6 flex justify-between items-center">
               <div className="text-sm text-slate-600 italic max-w-2xl">
                 Provisioning execution is disabled. Review the plan preview first; controlled execution will be enabled in a later stage.
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
