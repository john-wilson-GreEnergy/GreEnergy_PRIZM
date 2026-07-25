import express from 'express';
import { isLoopbackRequest } from '../telemetry/metrics/TelemetryMetricsRoutes';
import { serializedBytes } from './ProjectionHelpers';
import { workspaceProjectionRuntime } from './WorkspaceProjectionRuntime';

export const workspaceProjectionRouter = express.Router();
export const workspaceProjectionDebugRouter = express.Router();

function route(path: string, loader: () => Promise<unknown>) { return async (_req: express.Request, res: express.Response) => { const started = performance.now(); try { const payload = await loader(); workspaceProjectionRuntime.metrics.route(path, performance.now() - started, serializedBytes(payload)); res.json(payload); } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : String(error) }); } }; }

workspaceProjectionRouter.get('/operator', route('operator', () => workspaceProjectionRuntime.get('operator')));
workspaceProjectionRouter.get('/technician', route('technician', () => workspaceProjectionRuntime.get('technician')));
workspaceProjectionRouter.get('/technician/strings/:array/:string', async (req, res) => { const arrayIndex = Number(req.params.array); const stringIndex = Number(req.params.string); if (!Number.isSafeInteger(arrayIndex) || arrayIndex < 1 || arrayIndex > 8 || !Number.isSafeInteger(stringIndex) || stringIndex < 1 || stringIndex > 40) return res.status(400).json({ error: 'array must be 1-8 and string must be 1-40' }); const started = performance.now(); try { const payload = await workspaceProjectionRuntime.technicianDetail(arrayIndex, stringIndex); if (!payload) return res.status(404).json({ error: 'string-not-found' }); workspaceProjectionRuntime.metrics.route('technician-detail', performance.now() - started, serializedBytes(payload)); res.json(payload); } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : String(error) }); } });
workspaceProjectionRouter.get('/engineering', route('engineering', () => workspaceProjectionRuntime.get('engineering')));
for (const kind of ['topology', 'performance', 'schedulers', 'modbus', 'parity'] as const) workspaceProjectionRouter.get(`/engineering/${kind}`, route(`engineering-${kind}`, () => workspaceProjectionRuntime.engineeringSubresource(kind)));

workspaceProjectionDebugRouter.get('/', (_req, res) => res.json(workspaceProjectionRuntime.report()));
workspaceProjectionDebugRouter.post('/rebuild', async (req, res) => { if (!isLoopbackRequest(req) && process.env.PRIZM_ALLOW_REMOTE_DEBUG_RESET !== 'true') return res.status(403).json({ error: 'Workspace projection rebuild is restricted to loopback requests.' }); try { await workspaceProjectionRuntime.requestBuild(true); res.json({ success: true, runtime: workspaceProjectionRuntime.report() }); } catch (error) { res.status(503).json({ success: false, error: error instanceof Error ? error.message : String(error), runtime: workspaceProjectionRuntime.report() }); } });
