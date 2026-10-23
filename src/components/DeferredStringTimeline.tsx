import React, {lazy, Suspense, useState} from 'react';

const Timeline=lazy(()=>import('./PcsOperationalTimeline'));
class HistoryBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<p role="alert" className="text-xs mt-3">History tools could not be loaded. Live string updates continue above. Reload this page to retry the history tools.</p>:this.props.children;}
}

/** Do not download history charts on the live string list's critical path.
 * Once opened, retain the review state when the operator collapses the panel. */
export default function DeferredStringTimeline({arrays}:{arrays:number[]}) {
  const [activated,setActivated]=useState(false);
  return <details className="rounded border border-prizm-border bg-white p-4 mb-5"
    onToggle={event=>{if(event.currentTarget.open)setActivated(true);}}>
    <summary className="cursor-pointer font-bold text-sm">Operational history &amp; incident timeline</summary>
    {activated&&<HistoryBoundary><Suspense fallback={<p role="status" className="text-xs mt-3">Loading history tools… Live string updates continue above.</p>}>
      <Timeline arrays={arrays} embedded/>
    </Suspense></HistoryBoundary>}
  </details>;
}
