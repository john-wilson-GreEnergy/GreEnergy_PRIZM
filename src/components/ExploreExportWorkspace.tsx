import React,{useState} from "react";
import {BarChart3,Download} from "lucide-react";
import DataExportWorkspace from "./DataExportWorkspace";
import SiteAnalyticsWorkspace from "./SiteAnalyticsWorkspace";
import "./siteAnalytics.css";

/** Hybrid consolidation: one operator entry point while the proven live and
 * retained-data implementations remain isolated and independently reversible. */
export default function ExploreExportWorkspace(){
  const [mode,setMode]=useState<"explore"|"live">("explore");
  return <section className="site-analytics">
    <div className="analytics-tabs" role="group" aria-label="Explore and export mode">
      <button aria-pressed={mode==="explore"} onClick={()=>setMode("explore")}><Download size={14}/> Historical explorer & export</button>
      <button aria-pressed={mode==="live"} onClick={()=>setMode("live")}><BarChart3 size={14}/> Live analytics & cell replay</button>
    </div>
    {mode==="explore"?<DataExportWorkspace/>:<SiteAnalyticsWorkspace/>}
  </section>;
}
