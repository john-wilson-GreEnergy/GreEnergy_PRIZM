import React,{useState} from 'react';
import type {NotificationGroup,NotificationReview} from '../server/notifications/notificationReview';
import {packetCsv,type CorrectivePacket} from '../lib/correctivePacket';
import {downloadText} from '../lib/correctiveWorklist';
import {getFleetWorkspace} from '../lib/fleetWorkspace';
import {CorrectiveExportSelection,type CorrectiveExportDraft} from './CorrectiveExportSelection';

async function logoPng(){const image=new Image();image.src='/logo-transparent.svg';await image.decode();const c=document.createElement('canvas');c.width=160;c.height=160;c.getContext('2d')!.drawImage(image,0,0,160,160);return c.toDataURL('image/png');}
export function CorrectiveExportMenu({review,groups,array,query,stale,filters={}}:{review:NotificationReview;groups:NotificationGroup[];array:string;query:string;stale:boolean;filters?:Record<string,string>}){
  const [format,setFormat]=useState('pdf'),[draft,setDraft]=useState<CorrectiveExportDraft|null>(null);
  const choose=()=>{
    const workspace=getFleetWorkspace(),site=workspace?workspace.siteName+' / '+workspace.stationCode+' / Block '+workspace.blockIndex:Array.from(document.querySelector('.ops-site')?.children??[]).map(e=>e.textContent?.trim()).filter(Boolean).join(' / ')||'Site identity not supplied';
    const frozen=structuredClone(review),ids=new Set(groups.map(g=>g.id));
    setDraft({review:frozen,groups:frozen.groups.filter(g=>ids.has(g.id)),array,query,site,stale,filters:{...filters}});
  };
  const run=async(p:CorrectivePacket)=>{
    p={...p,generatedAt:new Date().toISOString()};
    const name='PRIZM-selected-worklist-'+new Date().toISOString().replace(/[^0-9]/g,'').slice(0,17);
    if(!p.targets.length)throw Error('No affected targets match the export filters');
    if(format==='csv')downloadText(name+'.csv',packetCsv(p));
    else{const writers=await import('../lib/correctivePacketFiles');
      if(format==='pdf')writers.packetPdf(p,await logoPng()).save(name+'.pdf');
      else{const XLSX=await import('xlsx');XLSX.writeFile(writers.packetWorkbook(p),name+'.xlsx');}
    }
  };
  return <div><div className="ca-export-options"><label>Export <select aria-label="Corrective export format" value={format} onChange={e=>setFormat(e.target.value)}><option value="pdf">PDF field tickets</option><option value="csv">CSV target worklist</option><option value="xlsx">Excel work package</option></select></label><button disabled={!groups.length} onClick={choose}>Choose export targets</button></div>{draft&&<CorrectiveExportSelection draft={draft} format={format} onClose={()=>setDraft(null)} onExport={run}/>}</div>;
}
