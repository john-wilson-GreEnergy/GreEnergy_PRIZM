// Only the four process IDs verified on live SS3/SS4 inverters are promoted.
export const STREAM_IDS=[332,6070,6644,6100] as const;
export const STREAM_STALE_MS=15_000;
export interface StreamPoint {
  id:number;value:number|null;quality:number|null;unitId:null;timestamp:number|null;
  receivedAt:number;streamAdvancedAt:number|null;source:'SMA_MQTT';streamConnected:boolean;
}
export class StreamPoints {
  private points=new Map<number,StreamPoint>();
  private seen=new Set<number>();
  connected=false;
  constructor(readonly deviceId:string){}
  begin(){this.connected=true;this.seen.clear();for(const [id,p] of this.points)this.points.set(id,{...p,streamAdvancedAt:null});}
  end(){this.connected=false;}
  ingest(topic:string,payload:Buffer,retained:boolean,now=Date.now()){
    if(!this.connected || retained || topic!==`process/${this.deviceId}`)return;
    let data:unknown;try{data=JSON.parse(payload.toString('utf8'));}catch{return;}
    const processData=(data as {data?:{processData?:Record<string,unknown>}})?.data?.processData;
    if(!processData || typeof processData!=='object')return;
    for(const id of STREAM_IDS){
      const v=processData[id];if(!Array.isArray(v) || v.length<3)continue;
      const [value,stamp,quality]=v,previous=this.points.get(id);
      const validStamp=typeof stamp==='number' && Number.isFinite(stamp) && stamp>0 && stamp<8.64e12;
      const validValue=typeof value==='number' && Number.isFinite(value)
        && (id===6070?Number.isInteger(value)&&value>=0&&value<=0xffffffff:id===332?Number.isInteger(value)&&value>=0&&value<256:id===6100?value>=-273.15&&value<=500:value>=0);
      // Repeated/cached or backwards timestamps cannot renew freshness. Invalid
      // quality invalidates immediately, including at an unchanged timestamp.
      const valid=validStamp && validValue && quality===0;
      const advances=valid && this.seen.has(id) && previous?.timestamp!==null && previous?.timestamp!==undefined
        && stamp>previous.timestamp && previous.quality===0 && previous.value!==null;
      const repeat=valid && this.seen.has(id) && previous?.timestamp===stamp && previous.value===value && previous.quality===0;
      if(repeat)continue;
      this.seen.add(id);
      this.points.set(id,{id,value:valid?value:null,quality:typeof quality==='number'?quality:null,unitId:null,
        timestamp:validStamp?stamp:null,receivedAt:now,streamAdvancedAt:advances?now:null,source:'SMA_MQTT',streamConnected:this.connected});
    }
  }
  snapshot(){return Object.fromEntries([...this.points].map(([id,p])=>[id,{...p,streamConnected:this.connected}]));}
}
const utf=(s:string)=>{const b=Buffer.from(s),l=Buffer.alloc(2);l.writeUInt16BE(b.length);return Buffer.concat([l,b]);};
const packet=(head:number,body:Buffer)=>{let n=body.length;const a:number[]=[];do{const d=n%128;n=Math.floor(n/128);a.push(d|(n?128:0));}while(n);return Buffer.concat([Buffer.from([head,...a]),body]);};
export const mqttConnect=(token:string)=>packet(0x10,Buffer.concat([utf('MQTT'),Buffer.from([4,0xc2,0,30]),utf(''),utf('sc30com-webui'),utf(token)]));
export const mqttSubscribe=(deviceId:string)=>packet(0x82,Buffer.concat([Buffer.from([0,1]),utf(`process/${deviceId}`),Buffer.from([0])]));
export const mqttPing=()=>Buffer.from([0xc0,0]);
export const mqttDisconnect=()=>Buffer.from([0xe0,0]);
// No MQTT publish encoder is provided. Outbound messages are read-only.
export class MqttFrames {
  private buffer:Buffer=Buffer.alloc(0);
  push(chunk:Buffer):Array<{header:number;body:Buffer}>{
    if(this.buffer.length+chunk.length>1024*1024)throw Error('SMA frame limit');
    this.buffer=Buffer.concat([this.buffer,chunk]);const result:Array<{header:number;body:Buffer}>=[];
    while(this.buffer.length>1){let i=1,length=0,m=1,d:number;
      do{if(i>=this.buffer.length)return result;d=this.buffer[i++];length+=(d&127)*m;m*=128;if(i>5)throw Error('SMA malformed frame');}while(d&128);
      if(length>1024*1024)throw Error('SMA frame limit');if(this.buffer.length<i+length)break;
      result.push({header:this.buffer[0],body:Buffer.from(this.buffer.subarray(i,i+length))});this.buffer=this.buffer.subarray(i+length);
    }
    return result;
  }
}
