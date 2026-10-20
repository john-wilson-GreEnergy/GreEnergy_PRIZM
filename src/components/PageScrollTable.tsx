import React, {Children, cloneElement, isValidElement, useLayoutEffect, useRef, useState} from 'react';
import type {ReactElement} from 'react';
import './pageScrollTable.css';

type TableElement = ReactElement<React.ComponentProps<'table'>>;
type Geometry = {left:number;width:number;top:number;tableWidth:number;columns:number[]}|null;

/** Keep the real table in page flow; mirror its React header only while it is above the viewport. */
export function PageScrollTable({children,className='',id}:{children:TableElement;className?:string;id?:string}) {
  const scrollRef=useRef<HTMLDivElement>(null);
  const headerRef=useRef<HTMLDivElement>(null);
  const [geometry,setGeometry]=useState<Geometry>(null);
  const geometryRef=useRef<Geometry>(null);
  useLayoutEffect(()=>{
    const scroll=scrollRef.current;
    const table=scroll?.querySelector('table');
    if(!scroll||!table||!scroll.closest('.ops-shell'))return;
    let frame=0;
    const measure=()=>{
      frame=0;
      const head=table.tHead;
      if(!head)return;
      const rect=scroll.getBoundingClientRect();
      const tableRect=table.getBoundingClientRect();
      const headRect=head.getBoundingClientRect();
      const shellHeader=document.querySelector('.ops-header');
      const top=Math.max(0,shellHeader?.getBoundingClientRect().bottom??0);
      const visible=headRect.top<top&&tableRect.bottom>top+headRect.height&&rect.right>0&&rect.left<window.innerWidth;
      const next:Geometry=visible?{left:rect.left,width:rect.width,top,tableWidth:tableRect.width,
        columns:Array.from(head.rows[0]?.cells??[]).map(cell=>cell.getBoundingClientRect().width)}:null;
      if(JSON.stringify(next)!==JSON.stringify(geometryRef.current)){geometryRef.current=next;setGeometry(next);}
      if(headerRef.current)headerRef.current.scrollLeft=scroll.scrollLeft;
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    const observer=new ResizeObserver(schedule);
    observer.observe(table);observer.observe(scroll);
    const shellHeader=document.querySelector('.ops-header');if(shellHeader)observer.observe(shellHeader);
    window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
    measure();
    return()=>{observer.disconnect();window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);if(frame)cancelAnimationFrame(frame);};
  },[children]);
  useLayoutEffect(()=>{if(headerRef.current&&scrollRef.current)headerRef.current.scrollLeft=scrollRef.current.scrollLeft;},[geometry]);
  const head=Children.toArray(children.props.children).find(child=>isValidElement(child)&&child.type==='thead');
  return <div id={id} data-header-pinned={geometry ? "true" : "false"} className={`${className} ops-page-scroll-table`}>
    {geometry&&<div ref={headerRef} className="ops-page-table-heading" style={{position:'fixed',left:geometry.left,top:geometry.top,width:geometry.width}}>
      {cloneElement(children,{'aria-label':'Pinned string list column headings',style:{width:geometry.tableWidth,tableLayout:'fixed'} },
        <colgroup>{geometry.columns.map((width,index)=><col key={index} style={width?{width}:{display:'none'}}/>)}</colgroup>,head)}
    </div>}
    <div ref={scrollRef} className="ops-page-table-horizontal">{children}</div>
  </div>;
}
