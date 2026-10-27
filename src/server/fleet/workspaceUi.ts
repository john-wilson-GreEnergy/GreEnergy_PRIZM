import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,readdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import type {Response} from 'express';

export interface WorkspaceUi {
  readonly releaseId:string;
  readonly publicDirectory:string;
  /** Call only after the entry point's authentication and route checks. */
  send(pathname:string,response:Response):boolean;
}

/** One immutable frontend release for LAN and remote workspaces. Never exposes
 * server bundles, source maps, configuration, directory listings, or symlinks. */
export function createWorkspaceUi(directory:string):WorkspaceUi {
  const root=realpathSync(directory),assets=path.join(root,'assets');
  const entries=new Map<string,string>();
  const etags=new Map<string,string>();
  const revalidateAssets=process.env.PRIZM_UI_ASSET_REVALIDATION!=='false';
  const digest=createHash('sha256');
  if(!lstatSync(assets).isDirectory()||lstatSync(assets).isSymbolicLink())throw Error('Workspace assets must be a real directory');
  const files=['index.html','fleet.html','mobile.html',...['logo-transparent.svg','favicon.ico'].filter(file=>{
    try{lstatSync(path.join(root,file));return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
  }),...readdirSync(assets).filter(file=>/^[A-Za-z0-9_.-]+\.(js|css|woff2?|ttf|png|svg|ico)$/.test(file)).map(file=>'assets/'+file)].sort();
  for(const file of files){
    const absolute=path.join(root,file),stat=lstatSync(absolute);
    if(!stat.isFile()||stat.isSymbolicLink())throw Error('Workspace release contains an unsafe asset');
    // Only one file buffer is live at a time; no duplicate in-memory UI cache.
    const hash=createHash('sha256').update(readFileSync(absolute)).digest('hex');
    digest.update(file+'\0'+hash+'\n');
    etags.set('/'+file,'"'+hash+'"');
    if(!['fleet.html','mobile.html'].includes(file))entries.set(file==='index.html'?'/':'/'+file,absolute);
  }
  const releaseId=digest.digest('hex');
  return Object.freeze({publicDirectory:root,releaseId,send(pathname:string,res:Response){
    if(pathname!=='/'&&!pathname.startsWith('/assets/')&&!['/logo-transparent.svg','/favicon.ico'].includes(pathname))return false;
    const file=entries.get(pathname);
    res.set({'X-Prizm-UI-Release':releaseId,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    // Do not fall back to a collector's older asset when a release is incomplete.
    if(!file){res.sendStatus(404);return true;}
    // Only static interface files may be retained, privately and with mandatory
    // revalidation. HTML, account context and telemetry remain no-store. The
    // caller still applies its existing access checks before conditional delivery.
    if(revalidateAssets&&pathname.startsWith('/assets/'))res.set({
      'Cache-Control':'private, no-cache',ETag:etags.get(pathname)!,
    });
    res.sendFile(file,{cacheControl:false},error=>{
      if(!error)return;
      if(res.headersSent){res.destroy();return;}
      res.status(503).json({error:'Workspace interface unavailable; reload after release recovery.'});
    });
    return true;
  }});
}
