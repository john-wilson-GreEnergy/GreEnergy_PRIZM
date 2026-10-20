import React from 'react';

/** Presentation only: counts and coverage warnings belong outside this disclosure. */
export function BpcListDisclosure({label,children}:{label:string;children:React.ReactNode}){
  return <details className="prizm-bpc-list"><summary>{label}<span className="prizm-bpc-expand">Expand</span><span className="prizm-bpc-collapse">Collapse</span></summary><div className="prizm-bpc-list-body">{children}</div></details>;
}
