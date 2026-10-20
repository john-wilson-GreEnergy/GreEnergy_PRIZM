import React, {useEffect, useState} from 'react';
import {OperatingCharts} from '../components/OperatingCharts';

/** Keep axes and legends legible above navigation on a rotated phone. */
export function mobileChartHeight(width:number,height:number):number|undefined {
  return width>=600&&width>height?Math.max(240,Math.min(300,height-130)):undefined;
}

export function MobileCharts(props:React.ComponentProps<typeof OperatingCharts>) {
  const [height,setHeight]=useState<number|undefined>();
  useEffect(()=>{
    const resize=()=>setHeight(mobileChartHeight(window.innerWidth,window.innerHeight));
    resize();
    window.addEventListener('resize',resize);
    return ()=>window.removeEventListener('resize',resize);
  },[]);
  return <OperatingCharts {...props} chartHeight={height}/>;
}
