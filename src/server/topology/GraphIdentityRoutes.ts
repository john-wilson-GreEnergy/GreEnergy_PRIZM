import express from 'express';
import { isLoopbackRequest } from '../telemetry/metrics/TelemetryMetricsRoutes';
import { graphIdentityResolver } from './GraphIdentityResolver';

export const graphIdentityRouter = express.Router();

graphIdentityRouter.get('/identity', (_req, res) => {
  res.json(graphIdentityResolver.report());
});

graphIdentityRouter.post('/identity/reset-parity', (req, res) => {
  if (!isLoopbackRequest(req) && process.env.PRIZM_ALLOW_REMOTE_DEBUG_RESET !== 'true') return res.status(403).json({ success: false, error: 'Graph identity parity reset is restricted to loopback requests.' });
  res.json({ success: true, identity: graphIdentityResolver.resetParity() });
});
