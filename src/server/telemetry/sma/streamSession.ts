import https from 'node:https';
import tls from 'node:tls';
import type {Duplex} from 'node:stream';
import WebSocket from 'ws';
import type {SmaStreamTarget} from './streamConfig';
import {MqttFrames,mqttConnect,mqttDisconnect,mqttPing,mqttSubscribe,StreamPoints} from './streamProtocol';

export class SmaSessionError extends Error {
  constructor(readonly code:'transport'|'authentication'|'certificate'|'protocol'|'subscription',
    readonly stage:'unknown'|'tls'|'base-data'|'login'|'logout'|'refresh'|'websocket'|'mqtt'|'heartbeat'='unknown',
    readonly reason:'unspecified'|'timeout'|'network'|'http-status'|'invalid-json'|'payload-limit'|'pin-mismatch'|'rejected'|'closed'|'frame-gap'='unspecified',
    readonly detail?:number){super(code);}
}
export class PinnedSmaAgent extends https.Agent {
  constructor(private target:Pick<SmaStreamTarget,'host'|'fingerprint256'>,
    private connect:(options:tls.ConnectionOptions,ready:()=>void)=>tls.TLSSocket=(options,ready)=>tls.connect(options,ready)){super({keepAlive:false,maxSockets:2});}
  override createConnection(options:tls.ConnectionOptions,callback:(err:Error|null,stream:Duplex)=>void):undefined {
    let done=false;
    const finish=(error:Error|null,socket:tls.TLSSocket)=>{if(done)return;done=true;callback(error,socket);};
    // Pin verification happens BEFORE HTTP can send the password or cookie.
    const socket=this.connect({...options,host:this.target.host,port:443,rejectUnauthorized:false},()=>{
      if(socket.getPeerCertificate().fingerprint256!==this.target.fingerprint256){const error=new SmaSessionError('certificate','tls','pin-mismatch');finish(error,socket);socket.destroy();return;}
      socket.setTimeout(0);finish(null,socket);
    });
    socket.setTimeout(5000,()=>socket.destroy(new SmaSessionError('transport','tls','timeout')));
    socket.once('error',e=>finish(e,socket));return undefined;
  }
}
export interface SessionTransport {
  request(path:string,body?:unknown):Promise<unknown>;
  token():string|undefined;
  socket():WebSocket;
  dispose():void;
}
export class SmaTransport implements SessionTransport {
  private agent:PinnedSmaAgent;
  private cookies=new Map<string,string>();
  constructor(private target:SmaStreamTarget){this.agent=new PinnedSmaAgent(target);}
  token(){return this.cookies.get('PHPSESSID');}
  socket(){return new WebSocket(`wss://${this.target.host}/ws`,'mqtt',{agent:this.agent,handshakeTimeout:6000,maxPayload:1024*1024,perMessageDeflate:false});}
  request(endpoint:string,body?:unknown):Promise<unknown>{
    if(!['/home/baseData','/home/login','/home/logout','/home/refreshSession'].includes(endpoint))throw new SmaSessionError('protocol');
    const bytes=body===undefined?undefined:JSON.stringify(body);
    const stage=({'/home/baseData':'base-data','/home/login':'login','/home/logout':'logout','/home/refreshSession':'refresh'} as const)[endpoint as '/home/login'];
    return new Promise((resolve,reject)=>{
      const req=https.request({host:this.target.host,port:443,path:endpoint,method:bytes?'POST':'GET',agent:this.agent,
        headers:{Accept:'application/json',Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(bytes?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bytes)}:{})}},res=>{
        for(const raw of res.headers['set-cookie']||[]){const pair=raw.split(';')[0],at=pair.indexOf('=');if(at>0)this.cookies.set(pair.slice(0,at),pair.slice(at+1));}
        let buffer='';res.on('data',(chunk:Buffer)=>{buffer+=chunk.toString('utf8');if(buffer.length>8*1024*1024)req.destroy(new SmaSessionError('protocol',stage,'payload-limit'));});
        res.on('error',()=>reject(new SmaSessionError('transport',stage,'network')));
        res.on('end',()=>{if(res.statusCode===401 || res.statusCode===403)return reject(new SmaSessionError('authentication',stage,'http-status',res.statusCode));
          if(res.statusCode!==200)return reject(new SmaSessionError('transport',stage,'http-status',res.statusCode));
          try{resolve(JSON.parse(buffer));}catch{reject(new SmaSessionError('protocol',stage,'invalid-json'));}});
      });
      const timer=setTimeout(()=>req.destroy(new SmaSessionError('transport',stage,'timeout')),7000);timer.unref();
      req.on('close',()=>clearTimeout(timer));req.on('error',e=>reject(e instanceof SmaSessionError?e:new SmaSessionError('transport',stage,'network')));req.end(bytes);
    });
  }
  dispose(){this.cookies.clear();this.agent.destroy();}
}
export class SmaStreamSession {
  private stopped=false;
  private finish:((error?:SmaSessionError)=>void)|null=null;
  constructor(private target:SmaStreamTarget,readonly points:StreamPoints,private transport:SessionTransport=new SmaTransport(target)){}
  stop(){this.stopped=true;this.points.end();this.finish?.();}
  async run():Promise<void>{
    let attempted=false;
    try{
      await this.transport.request('/home/baseData');if(this.stopped)return;
      attempted=true;
      const result=await this.transport.request('/home/login',{userLevel:this.target.userLevel,password:this.target.password}) as {data?:{ret?:boolean;expired?:boolean;insecure?:boolean}};
      if(result?.data?.ret!==true || result.data.expired || result.data.insecure)throw new SmaSessionError('authentication','login','rejected');
      if(this.stopped)return;
      const token=this.transport.token();if(!token)throw new SmaSessionError('authentication','login','rejected');
      await this.receive(token);
    }finally{
      this.points.end();
      // Logout only this session; never alter the device's password/settings.
      if(attempted)try{await this.transport.request('/home/logout',{});}catch{/* session expiry remains the fallback */}
      this.transport.dispose();
    }
  }
  private receive(token:string):Promise<void>{
    return new Promise((resolve,reject)=>{
      const ws=this.transport.socket(),frames=new MqttFrames();let ended=false,subscribed=false,connack=false,lastFrame=Date.now(),refreshing=false,lastRefresh=Date.now();
      let volume=0,volumeSince=Date.now();
      const finish=(error?:SmaSessionError)=>{
        if(ended)return;ended=true;clearInterval(heartbeat);clearTimeout(deadline);this.points.end();this.finish=null;
        if(ws.readyState===WebSocket.OPEN){ws.send(mqttDisconnect());ws.close();}else ws.terminate();
        const reap=setTimeout(()=>ws.terminate(),250);reap.unref();
        if(error)reject(error);else resolve();
      };
      this.finish=finish;
      const deadline=setTimeout(()=>finish(new SmaSessionError('transport','mqtt','timeout')),12_000);deadline.unref();
      const heartbeat=setInterval(()=>{
        if(Date.now()-lastFrame>35_000)return finish(new SmaSessionError('transport','heartbeat','frame-gap',Date.now()-lastFrame));
        if(subscribed && ws.readyState===WebSocket.OPEN)ws.send(mqttPing());
        if(subscribed && !refreshing && Date.now()-lastRefresh>=60_000){
          refreshing=true;lastRefresh=Date.now();
          void this.transport.request('/home/refreshSession').catch(e=>finish(e instanceof SmaSessionError?e:new SmaSessionError('transport','refresh','network'))).finally(()=>{refreshing=false;});
        }
      },15_000);heartbeat.unref();
      ws.on('error',e=>finish(e instanceof SmaSessionError?e:new SmaSessionError('transport','websocket','network')));
      ws.on('close',(code:number)=>finish(this.stopped?undefined:new SmaSessionError('transport','websocket','closed',code)));
      ws.on('open',()=>{if(this.stopped)return finish();ws.send(mqttConnect(token));});
      ws.on('message',(raw:Buffer)=>{
        if(ended)return;
        try{
          const now=Date.now();if(now-volumeSince>10_000){volume=0;volumeSince=now;}volume+=raw.length;
          if(volume>8*1024*1024)throw new SmaSessionError('protocol');
          for(const {header,body} of frames.push(raw)){
            lastFrame=now;const type=header>>4;
            if(type===2){if(connack || body.length!==2 || body[0]!==0 || body[1]!==0)throw new SmaSessionError('authentication');connack=true;ws.send(mqttSubscribe(this.target.deviceId));}
            else if(type===9){if(!connack || subscribed || body.length!==3 || body.readUInt16BE(0)!==1 || body[2]!==0)throw new SmaSessionError('subscription');subscribed=true;clearTimeout(deadline);this.points.begin();}
            else if(type===3){
              if(!subscribed || body.length<2)continue;
              if(((header>>1)&3)!==0)throw new SmaSessionError('protocol');
              const length=body.readUInt16BE(0);if(length+2>body.length)throw new SmaSessionError('protocol');
              this.points.ingest(body.subarray(2,2+length).toString('utf8'),body.subarray(2+length),(header&1)!==0,now);
            }else if(type!==13)throw new SmaSessionError('protocol');
          }
        }catch(e){finish(e instanceof SmaSessionError?e:new SmaSessionError('protocol'));}
      });
      if(this.stopped)finish();
    });
  }
}
