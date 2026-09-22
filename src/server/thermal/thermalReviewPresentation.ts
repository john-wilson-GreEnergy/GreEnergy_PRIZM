import type {ThermalPoint, ThermalMode} from "./thermalModel";
import {thermalDisplayValues, thermalMetrics, type ThermalMetric} from "./thermalMetrics";

export type ReviewReading={
  valueText:string; status:string; validUntil:number;
  command:ThermalMode; commandText:string;
};
// Read-only presentation from canonical, recorded observations. Never infer a
// command from current draw or carry a sample across an unbounded history gap.
export function reviewReading(point:ThermalPoint,metric:ThermalMetric,excluded=false):ReviewReading{
  const value=thermalDisplayValues(point)[metric];
  const applicable=!(point.segmentType==="CS"&&(metric==="cell"||metric==="cellRate"));
  const status=excluded?"Filtered":!applicable?"N/A — no cells":point.quality!=="Live"?point.quality:value===null?"Not reported":"Observed";
  const c=point.commands;
  const command:ThermalMode=excluded||point.quality!=="Live"||!c?"Unknown":c.electricHeat===true?"Heating":c.compressor===true?(c.reversingValve===true?"Heating":c.reversingValve===false?"Cooling":"Unknown"):c.compressor===false&&c.electricHeat===false?"Idle":"Unknown";
  const bit=(value:boolean|null|undefined)=>value===true?"On":value===false?"Off":"Unknown";
  return {valueText:status==="Observed"?`${value!.toFixed(metric==="cellRate"?2:1)} ${thermalMetrics[metric].unit}`:"—",status,validUntil:point.at+120000,command,
    commandText:excluded?"Filtered observation":point.quality!=="Live"?`${point.quality} command telemetry`:`Compressor ${bit(c?.compressor)} · Electric heat ${bit(c?.electricHeat)} · Reversing valve ${bit(c?.reversingValve)} · Fan low ${bit(c?.fanLow)} · Fan high ${bit(c?.fanHigh)}`};
}
