// Mac loopback preview. Does not deploy, change equipment polling, or expose a LAN listener.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {createServer as httpServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {mobilePreviewApi,mobileOrigin} from './mobile-preview-proxy';
const app=mobilePreviewApi(),server=httpServer(app);
const vite=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',middlewareMode:true,hmr:{server}},appType:'custom'});
app.get('/mobile.webmanifest',(_req,res)=>res.type('application/manifest+json').json({name:'GreEnergy PRIZM Mobile',short_name:'PRIZM',start_url:'/',scope:'/',display:'standalone',background_color:'#f5f7f5',theme_color:'#123c32',icons:[{src:'/logo-transparent.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]}));
app.use(vite.middlewares);
app.get('/',async(_req,res,next)=>{try{res.type('html').send(await vite.transformIndexHtml('/',await readFile('mobile.html','utf8')));}catch(e){next(e);}});
app.use((_req,res)=>res.status(404).end());
server.listen(3206,'127.0.0.1',()=>console.log(`PRIZM mobile preview ${mobileOrigin} · Read only · Sign in with Fleet · No remote access`));
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{server.closeAllConnections();server.close(()=>{void vite.close().then(()=>process.exit(0));});});
