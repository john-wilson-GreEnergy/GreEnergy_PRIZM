import {createHash,timingSafeEqual} from 'node:crypto';
import type {RequestHandler} from 'express';
import {workspacePath,workspaceRouteAllowed} from './workspaceAccess';
const hash=(value:string)=>createHash('sha256').update(value).digest();
/** Internal TLS entry only. Summary credentials and client headers cannot unlock it. */
export function collectorWorkspace(token:string,identityMatches:()=>boolean,handler:RequestHandler):RequestHandler {
  if(!/^[A-Za-z0-9_-]{43,128}$/.test(token))throw Error('Invalid workspace service credential');
  return (req,res,next)=>{
    if(!timingSafeEqual(hash(String(req.headers.authorization ?? '')),hash('Bearer '+token)))return res.status(401).json({error:'Workspace service authentication required'});
    if(!identityMatches())return res.status(409).json({error:'Active site differs from workspace enrollment'});
    try {if(!workspaceRouteAllowed(req.method,workspacePath(req.url)))return res.status(403).json({error:'Route is not available in the enrolled workspace'});}
    catch{return res.status(400).json({error:'Invalid workspace path'});}
    // Never expose this credential to legacy logging, adapters or responses.
    const actor=req.headers['x-prizm-guidance-actor'];
    if(typeof actor==='string'&&actor.length<=200&&workspacePath(req.url)==='/api/local/corrective-guidance')res.locals.prizmGuidanceActor=actor;
    delete req.headers['x-prizm-guidance-actor'];
    delete req.headers.authorization;
    handler(req,res,next);
  };
}
