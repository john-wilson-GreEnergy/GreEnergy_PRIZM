// Disposable UI fixture, with no accounts, telemetry or equipment connections.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {build} from 'esbuild';
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'prizm-shift-preview-'));
const legacy=process.argv.includes('--legacy'),ending=process.argv.includes('--ending');
const expiresAt=Date.now()+(ending?4*60000:24*3600000);
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ShiftSessionBanner} from './src/components/ShiftSessionBanner';const expired=()=>{};createRoot(document.getElementById('root')).render(<><h2>SIMULATED OPERATIONS SESSION</h2><ShiftSessionBanner csrf="fixture" onExpired={expired}/><p>Fixture only. No accounts, telemetry, or equipment connected.</p></>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'esm',outfile:path.join(directory,'app.js')});
const app=express();app.post('/api/fleet/monitor',(_req,res)=>res.json({shiftMonitoring:true,continuousControlAccess:!legacy,maximumAgeMs:(legacy?12:24)*3600000,serverTime:Date.now(),expiresAt,controlExpiresAt:legacy?Date.now()-60000:expiresAt}));
app.post('/api/fleet/reauthenticate',(_req,res)=>res.status(403).json({error:'Fixture only. No actual authentication.'}));
app.use(express.static(directory));app.get('/',(_req,res)=>res.send('<!doctype html><title>Shift session preview · SIMULATED</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>'));
const server=app.listen(3202,'127.0.0.1',()=>console.log('SIMULATED http://127.0.0.1:3202/'));
process.once('SIGTERM',()=>{server.closeAllConnections();server.close(()=>{void fs.rm(directory,{recursive:true,force:true});});});
