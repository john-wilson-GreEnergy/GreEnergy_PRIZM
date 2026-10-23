/** Loopback-only review. No deployment, credentials on disk, controls, or equipment polling. */
import express from 'express';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer as createVite} from 'vite';
import react from '@vitejs/plugin-react';
import {mobilePreviewApi,dellTransport} from './mobile-preview-proxy';
const origin='http://127.0.0.1:3210',app=express(),server=createServer(app);
app.disable('x-powered-by');app.set('strict routing',true);
app.use((req,res,next)=>{
 if(req.headers.host!=='127.0.0.1:3210')return res.sendStatus(403);
 res.set('Cache-Control','no-store');
 const api=/^\/(fleet|mobile)(\/api\/fleet\/.*)$/.exec(req.url);
 if(api){req.url=api[2];req.originalUrl=api[2];}
 next();
});
app.use(mobilePreviewApi(dellTransport,{origin,remoteReview:true}));
// Optional byte-for-byte deployed UI plus BPC-only disclosure patch, for review.
if(process.env.PRIZM_BPC_REVIEW_DIR){
 const dir=path.resolve(process.env.PRIZM_BPC_REVIEW_DIR);
 app.use('/bpc-review/assets',express.static(path.join(dir,'assets')));
 for(const [route,file] of [['fleet','fleet.html'],['mobile','mobile.html']] as const)
  app.get('/bpc-review/'+route,async(_req,res,next)=>{try{
   const html=(await readFile(path.join(dir,file),'utf8')).replaceAll('"/assets/','"/bpc-review/assets/');
   res.type('html').send(html);
  }catch(e){next(e);}});
}
const vite=await createVite({configFile:false,plugins:[react()],server:{host:'127.0.0.1',middlewareMode:true,hmr:{server}},appType:'custom'});
app.get('/',(_req,res)=>res.redirect('/fleet/'));
// Deliberately non-adaptive review route lets a PC inspect the mobile design.
for(const [route,file,adaptive] of [['/fleet/','fleet.html',true],['/mobile/','mobile.html',true],['/review-mobile/','mobile.html',false]] as const)
 app.get(route,async(_req,res,next)=>{try{
  let html=await readFile(file,'utf8');
  if(adaptive)html=html.replace('<html','<html data-prizm-adaptive="true"');
  // Review banner is outside the application so it is visible before sign-in too.
  html=html.replace('<body>','<body><div style="padding:12px;text-align:center;background:#fff4cc;color:#493900;font:14px system-ui">LOCAL REVIEW · Live Dell readings after sign-in · Site PRIZM links open the existing remote service · <a href="/fleet/">Desktop</a> / <a href="/review-mobile/">Mobile layout</a></div>');
  res.type('html').send(await vite.transformIndexHtml(route,html));
 }catch(e){next(e);}});
app.use(vite.middlewares);
app.use((_req,res)=>res.sendStatus(404));
server.listen(3210,'127.0.0.1',()=>console.log('Remote experience preview '+origin+' · Read only · Dell unchanged'));
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{server.closeAllConnections();server.close(()=>{void vite.close().then(()=>process.exit(0));});});
