import type {Request} from 'express';

/** External links and identity-provider redirects may open a document, never an
 * API or mutation. Refreshing that same document must not change authorization. */
export function allowedFetchSite(req:Request,entryDocument:boolean){
 const site=req.headers['sec-fetch-site'];
 if(!site||site==='same-origin'||site==='none')return true;
 return entryDocument&&req.method==='GET'&&
  req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document';
}
