import express from 'express';
import { isLoopbackRequest } from '../telemetry/metrics/TelemetryMetricsRoutes';
import { getLatestTopologyGraphSnapshot, getLatestTopologySourceSnapshot, getTopologyGraphFingerprint, getTopologyGraphHealth, getTopologyGraphParity, invalidateTopologyGraph, requestTopologyGraphRebuild } from './TopologyGraphRuntime';

export const topologyGraphRouter = express.Router();
const SAMPLE_LIMIT = 20;

topologyGraphRouter.get('/graph', async (_req, res) => {
  try {
    const snapshot = getLatestTopologyGraphSnapshot(); const source = getLatestTopologySourceSnapshot(); const health = getTopologyGraphHealth();
    if (!snapshot || !source) return res.status(503).json({ error: 'topology-graph-unavailable', health });
    res.json({ generatedAt: snapshot.generatedAt, graphVersion: snapshot.graphVersion, fingerprint: getTopologyGraphFingerprint(), sourceFingerprint: source.fingerprint, cycleId: source.cycleId, health, countsByKind: snapshot.countsByKind, countsByRelationship: snapshot.countsByRelationship, sourceMetadata: source.sources ?? [], warnings: [...(source.diagnostics.missing ?? []), ...(source.diagnostics.ambiguous ?? []), ...(source.diagnostics.duplicates ?? [])], objectSamples: snapshot.objects.slice(0, SAMPLE_LIMIT), relationshipSamples: snapshot.relationships.slice(0, SAMPLE_LIMIT) });
  } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : String(error), health: getTopologyGraphHealth() }); }
});

topologyGraphRouter.get('/parity', async (_req, res) => {
  try { const parity = getTopologyGraphParity(); if (!parity) return res.status(503).json({ error: 'topology-parity-unavailable', health: getTopologyGraphHealth() }); res.json(parity); }
  catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : String(error), health: getTopologyGraphHealth() }); }
});

topologyGraphRouter.post('/rebuild', async (req, res) => {
  if (!isLoopbackRequest(req) && process.env.PRIZM_ALLOW_REMOTE_DEBUG_RESET !== 'true') return res.status(403).json({ success: false, error: 'Topology graph rebuild is restricted to loopback requests.' });
  try { const result = await requestTopologyGraphRebuild('debug-route:forced-rebuild', true); res.json({ success: true, rebuilt: result.rebuilt, retainedLastKnownGood: result.retainedLastKnownGood, fingerprint: result.graphFingerprint, sourceFingerprint: result.sourceFingerprint, cycleId: getLatestTopologySourceSnapshot()?.cycleId ?? null, health: getTopologyGraphHealth() }); }
  catch (error) { res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error), health: getTopologyGraphHealth() }); }
});

topologyGraphRouter.post('/invalidate', async (req, res) => {
  if (!isLoopbackRequest(req) && process.env.PRIZM_ALLOW_REMOTE_DEBUG_RESET !== 'true') return res.status(403).json({ success: false, error: 'Topology graph invalidation is restricted to loopback requests.' });
  invalidateTopologyGraph('debug-route:simulated-invalidation');
  try { const result = await requestTopologyGraphRebuild('debug-route:invalidation-rebuild', true); res.json({ success: true, rebuilt: result.rebuilt, retainedLastKnownGood: result.retainedLastKnownGood, health: getTopologyGraphHealth() }); }
  catch (error) { res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error), health: getTopologyGraphHealth() }); }
});
