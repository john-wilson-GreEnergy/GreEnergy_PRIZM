import React, {useState} from 'react';
import {Activity, ArrowLeft, BarChart3, BookOpen, ChevronLeft, ChevronRight, Cpu, FileText, Gauge, LayoutGrid, Menu, Network, Settings, Shield, ShieldAlert, Sliders, Zap} from 'lucide-react';
import {GreEnergyLogo} from '../components/GreEnergyLogo';
import './operations.css';
import {PreferenceScope,WorkspaceScroll,usePresentation,ReturnToResults} from '../lib/workspacePreferences';

/** Shared navigation only: visibility is not an authorization boundary. */
export const operationsNavigation = [
  {label:'Monitor',items:[{id:'overview',label:'Block summary',icon:LayoutGrid},{id:'one-line',label:'One-line',icon:Network},{id:'site-health',label:'Site health',icon:Activity}]},
  {label:'Equipment',items:[{id:'arrays-strings',label:'Strings & arrays',icon:Cpu},{id:'pcs-dashboard',label:'Inverters / PCS',icon:Zap},{id:'feather-hvac',label:'Feather / HVAC',icon:Network},{id:'thermal-controls',label:'Thermal controls',icon:Sliders},{id:'lightbar-control',label:'Lineup lightbar',icon:Sliders}]},
  {label:'Maintenance',items:[{id:'corrective-actions',label:'Corrective actions',icon:ShieldAlert},{id:'balancer-test',label:'BPC balance test',icon:Gauge},{id:'troubleshooting-library',label:'Troubleshooting',icon:BookOpen}]},
  {label:'History & reports',items:[{id:'site-analytics',label:'Site analytics',icon:BarChart3},{id:'cell-history',label:'Cell history',icon:BarChart3},{id:'reports',label:'Reports & exports',icon:FileText}]},
  {label:'Administration',items:[{id:'site-configuration',label:'Site configuration',icon:Settings},{id:'safety-fault',label:'Safety clear',icon:ShieldAlert},{id:'advanced',label:'Safety / advanced',icon:Shield}]},
] as const;

export function OperationsShell({children,activeTab,onNavigate,siteName,siteDetail,status,statusTone='neutral',fleetUrl,preview=false,readOnly=false,visibleTabs}: {
  children:React.ReactNode;activeTab:string;onNavigate:(id:string)=>void;siteName:string;siteDetail:string;
  status:string;statusTone?:'neutral'|'warning'|'danger';fleetUrl?:string;preview?:boolean;readOnly?:boolean;visibleTabs?:string[];
}) {
  const [collapsed,setCollapsed]=usePresentation('navigation-collapsed',false);
  const [density]=usePresentation('table-density','compact');
  const [mobileOpen,setMobileOpen]=useState(false);
  return <div className={`ops-shell${collapsed?' ops-collapsed':''}`} data-density={density}>
    <WorkspaceScroll page={activeTab}/>
    <a className="ops-skip" href="#operations-content">Skip to workspace</a>
    <header className="ops-header">
      <button className="ops-icon-button ops-mobile-menu" aria-label="Toggle navigation" aria-expanded={mobileOpen} aria-controls="operations-navigation" onClick={()=>setMobileOpen(!mobileOpen)}><Menu size={19}/></button>
      <div className="ops-brand"><GreEnergyLogo className="ops-logo"/><div><strong>PRIZM</strong><span>GreEnergy Resources</span></div></div>
      <div className="ops-site"><strong>{siteName}</strong><span>{siteDetail}</span></div>
      <div className={`ops-connection ops-tone-${statusTone}`}><span className="ops-status-dot"/>{status}</div>
      {preview?<span className="ops-preview-tag">Design preview</span>:fleetUrl?<a className="ops-fleet-link" href={fleetUrl}><ArrowLeft size={14}/>Fleet overview</a>:null}
    </header>
    <div className="ops-body">
      {mobileOpen&&<button className="ops-nav-scrim" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}/>}
      <aside id="operations-navigation" className={`ops-sidebar${mobileOpen?' is-open':''}`}>
        <div className="ops-nav-heading"><span>Site workspace</span><button className="ops-icon-button ops-collapse" aria-label={collapsed?'Expand navigation':'Collapse navigation'} aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}>{collapsed?<ChevronRight size={16}/>:<ChevronLeft size={16}/>}</button></div>
        <nav aria-label="PRIZM workspace">{operationsNavigation.map(group=>{
          const items=group.items.filter(item=>!visibleTabs||visibleTabs.includes(item.id));
          return items.length?<div className="ops-nav-group" key={group.label}><h2>{group.label}</h2>{items.map(item=><button key={item.id} className={activeTab===item.id?'is-active':''} aria-current={activeTab===item.id?'page':undefined} title={item.label} onClick={()=>{onNavigate(item.id);setMobileOpen(false);}}><item.icon size={17}/><span>{item.label}</span></button>)}</div>:null;
        })}</nav>
        <div className="ops-nav-foot"><Shield size={15}/><span>{preview?'No equipment connected':readOnly?'Live review · controls blocked':'Site-scoped workspace'}</span></div>
      </aside>
      <main id="operations-content" className="ops-main" tabIndex={-1}><ReturnToResults/>{children}</main>
    </div>
  </div>;
}

export function OperationsFrame({enabled,children,scopeKey=null,...props}:React.ComponentProps<typeof OperationsShell>&{enabled:boolean;scopeKey?:string|null}){
  return enabled?<PreferenceScope.Provider value={scopeKey}><OperationsShell {...props}>{children}</OperationsShell></PreferenceScope.Provider>:<>{children}</>;
}
