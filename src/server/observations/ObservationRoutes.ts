import express from 'express';
import { isLoopbackRequest } from '../telemetry/metrics/TelemetryMetricsRoutes';
import { observationRuntime } from './ObservationRuntime';
export const observationRouter = express.Router();
observationRouter.get('/', (_req, res) => res.json(observationRuntime.report())); observationRouter.get('/parity', (_req, res) => res.json(observationRuntime.parityReport()));
observationRouter.post('/rebuild', async (req, res) => { if (!isLoopbackRequest(req)) return res.status(403).json({ error: 'Loopback access required' }); try { await observationRuntime.requestObservationRebuild('debug-route', true); res.json({ success: true, observations: observationRuntime.report() }); } catch (error) { res.status(503).json({ success: false, error: error instanceof Error ? error.message : String(error), observations: observationRuntime.report() }); } });
observationRouter.post('/reset-parity', (req, res) => { if (!isLoopbackRequest(req)) return res.status(403).json({ error: 'Loopback access required' }); res.json({ success: true, parity: observationRuntime.resetParityHistory() }); });
