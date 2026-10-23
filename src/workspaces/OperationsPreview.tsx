import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {OperationsShell,operationsNavigation} from './OperationsShell';
import {CorrectiveActionsWorkspace} from '../components/CorrectiveActionsWorkspace';
import type {NotificationReview} from '../server/notifications/notificationReview';
import '../index.css';

function Preview(){
  const [active,setActive]=useState('corrective-actions');
  const [review,setReview]=useState<NotificationReview>();
  const [mode,setMode]=useState('normal');
  const [error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();void fetch('/preview/notification-review',{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('Preview fixture unavailable');return r.json();}).then(setReview).catch(e=>{if(e.name!=='AbortError')setError('Sample data could not be loaded.');});return()=>controller.abort();},[]);
  return <OperationsShell activeTab={active} onNavigate={setActive} siteName="Solar Star 3" siteDetail="BHE0020 · Block 1" status="Sample data · not live" preview>
    <div className="ops-demo-notice"><span><strong>Review workspace</strong> · Sample data only. No live equipment or account access. Other pages have not been redesigned.</span><label>Preview state<select aria-label="Preview data state" value={mode} onChange={e=>setMode(e.target.value)}><option value="normal">Populated</option><option value="stale">Stale / source warning</option><option value="empty">No findings</option><option value="loading">Unavailable</option></select></label></div>
    {active==='corrective-actions'?<CorrectiveActionsWorkspace review={mode==='loading'?undefined:mode==='empty'&&review?{...review,groups:[],totals:{groups:0,targets:0,occurrences:0,alarm:0,warning:0,unknown:0}}:mode==='stale'&&review?{...review,sourceWarnings:['Sample source warning: latest collector response was incomplete. Retained evidence is shown.']}:review} stale={mode==='stale'} error={error||undefined} loading={!review}/>:<section className="ops-placeholder"><div className="ops-breadcrumb">Navigation preview</div><h1>{operationsNavigation.flatMap(g=>[...g.items]).find(i=>i.id===active)?.label}</h1><p>This destination is included to review the shared navigation. Its existing PRIZM screen will remain unchanged until this design is approved. No live controls are connected in this preview.</p><button className="ops-primary-button" onClick={()=>setActive('corrective-actions')}>Return to Corrective actions</button></section>}
  </OperationsShell>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
