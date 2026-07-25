import React, { useEffect, useState } from 'react';
import { ArrowLeft, Moon, RefreshCw, Sun, UserCog, Wrench, Workflow } from 'lucide-react';
import App from '../App';
import { SiteDataProvider } from '../context/SiteDataContext';
import { EngineeringWorkspace } from './EngineeringWorkspace';
import { OperatorWorkspace } from './OperatorWorkspace';
import { TechnicianWorkspace } from './TechnicianWorkspace';
import type { WorkspaceRole, WorkspaceTheme } from './types';
import { useWorkspacePreviewData } from './useWorkspacePreviewData';
import { workspaceRoleFromLocation } from './workspaceModels';

const roles = [{ id: 'operator', label: 'Operator', icon: UserCog }, { id: 'technician', label: 'Technician', icon: Wrench }, { id: 'engineering', label: 'Engineering', icon: Workflow }] as const;

function chooseInitialRole(): WorkspaceRole { return workspaceRoleFromLocation(window.location.search, window.localStorage.getItem('prizm_workspace_preview')); }

export function WorkspacePreviewShell() {
  const [role, setRoleState] = useState<WorkspaceRole>(chooseInitialRole);
  const [theme, setTheme] = useState<WorkspaceTheme>(() => window.localStorage.getItem('prizm_workspace_theme') === 'dark' ? 'dark' : 'daylight');
  const data = useWorkspacePreviewData(role);
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); window.localStorage.setItem('prizm_workspace_theme', theme); }, [theme]);
  useEffect(() => { const update = () => setRoleState(chooseInitialRole()); window.addEventListener('popstate', update); return () => window.removeEventListener('popstate', update); }, []);

  const setRole = (next: WorkspaceRole, legacyTab?: string) => {
    window.localStorage.setItem('prizm_workspace_preview', next);
    const query = new URLSearchParams(window.location.search); query.set('workspace', next); if (legacyTab) query.set('legacyTab', legacyTab); else query.delete('legacyTab');
    window.history.pushState({}, '', `${window.location.pathname}?${query.toString()}${window.location.hash}`); setRoleState(next);
  };
  if (role === 'legacy') return <SiteDataProvider><div className="fixed bottom-4 right-4 z-[100] flex flex-wrap justify-end gap-2 rounded-xl border border-slate-300 bg-white/95 p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900/95" aria-label="Workspace previews">{roles.map((item) => <button key={item.id} onClick={() => setRole(item.id)} className="min-h-11 rounded-lg px-3 text-xs font-black hover:bg-sky-500/10">Preview {item.label}</button>)}</div><App/></SiteDataProvider>;

  return <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <header className="sticky top-0 z-50 border-b border-slate-300 bg-white/95 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"><div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-2 px-3 py-2 sm:px-5"><div className="mr-auto"><p className="font-mono text-[10px] font-black uppercase tracking-[.2em] text-emerald-600">GreEnergy PRIZM · preview</p><h1 className="text-sm font-black">{role[0].toUpperCase() + role.slice(1)} Workspace</h1></div><nav className="flex flex-wrap gap-1" aria-label="Workspace profile">{roles.map((item) => { const Icon = item.icon; return <button key={item.id} aria-pressed={role === item.id} onClick={() => setRole(item.id)} className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-black ${role === item.id ? 'bg-sky-500 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}><Icon size={14}/>{item.label}</button>; })}</nav><button onClick={data.refresh} disabled={data.loading} className="grid h-11 w-11 place-items-center rounded-lg border border-slate-300 disabled:opacity-50 dark:border-slate-700" title="Refresh stable preview data"><RefreshCw size={15} className={data.loading ? 'animate-spin' : ''}/></button><button onClick={() => setTheme((value) => value === 'dark' ? 'daylight' : 'dark')} className="grid h-11 w-11 place-items-center rounded-lg border border-slate-300 dark:border-slate-700" title="Toggle theme">{theme === 'dark' ? <Sun size={15}/> : <Moon size={15}/>}</button><button onClick={() => setRole('legacy')} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-black dark:border-slate-700"><ArrowLeft size={14}/>Existing UI</button></div></header>
    <main className="mx-auto max-w-[1800px] p-3 sm:p-5">{role === 'operator' ? <OperatorWorkspace data={data}/> : role === 'technician' ? <TechnicianWorkspace data={data} openLegacyTool={(tab) => setRole('legacy', tab)}/> : <EngineeringWorkspace data={data}/>}</main>
  </div>;
}
