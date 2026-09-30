import express, {type RequestHandler} from 'express';
import path from 'node:path';

/** Only compiled public UI files. Never falls through to legacy handlers or data exports. */
export function pilotUi(directory: string): RequestHandler {
  const router = express.Router({caseSensitive:true,strict:true});
  router.use((_req,res,next) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    next();
  });
  router.use((req,res,next) => {
    if (req.method !== 'GET') return res.status(403).json({error:'Route not enabled in the restricted security pilot'});
    next();
  });
  const send = (file: string): RequestHandler => (_req,res) => {
    res.sendFile(path.join(directory,file), {dotfiles:'deny'}, error => {
      if (error && !res.headersSent) res.status(503).json({error:'Sign-in page unavailable; build the pilot UI first'});
    });
  };
  router.get(['/', '/signin', '/signin.html'],send('signin.html'));
  router.get('/logo-transparent.svg',send('logo-transparent.svg'));
  router.get(/^\/assets\/([A-Za-z0-9_-]+\.(?:js|css))$/, (req,res,next) => send('assets/'+req.params[0])(req,res,next));
  router.use((_req,res) => res.status(403).json({error:'Route not enabled in the restricted security pilot'}));
  return router;
}
