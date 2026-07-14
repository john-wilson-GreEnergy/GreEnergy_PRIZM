import express from 'express';
import { isLoopbackRequest } from '../metrics/TelemetryMetricsRoutes';
import { telemetryBindingRuntime } from './TelemetryBindingRuntime';

export const telemetryBindingRouter = express.Router();
telemetryBindingRouter.get('/bindings', (_req, res) => res.json(telemetryBindingRuntime.report()));
telemetryBindingRouter.get('/bindings/parity', (_req, res) => res.json(telemetryBindingRuntime.parityReport()));
telemetryBindingRouter.post('/bindings/rebuild', async (req, res) => { if (!isLoopbackRequest(req)) return res.status(403).json({ error: 'Loopback access required' }); try { await telemetryBindingRuntime.requestRebuild('debug-route', true); res.json({ success: true, bindings: telemetryBindingRuntime.report() }); } catch (error) { res.status(503).json({ success: false, error: error instanceof Error ? error.message : String(error), bindings: telemetryBindingRuntime.report() }); } });
telemetryBindingRouter.post('/bindings/reset-parity', (req, res) => { if (!isLoopbackRequest(req)) return res.status(403).json({ error: 'Loopback access required' }); res.json({ success: true, parity: telemetryBindingRuntime.resetParity() }); });
