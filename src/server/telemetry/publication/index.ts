export * from './CanonicalPublicationTypes';
export * from './CanonicalPublicationMetrics';
export * from './CanonicalPublicationRuntime';
export * from './CanonicalPublicationRoutes';

import { telemetryMetrics } from '../metrics';
import { workspaceProjectionRuntime } from '../../workspaceProjections/WorkspaceProjectionRuntime';
import { canonicalPublicationRuntime } from './CanonicalPublicationRuntime';

telemetryMetrics.setCanonicalPublicationMetrics(
  () => canonicalPublicationRuntime.report(),
  () => canonicalPublicationRuntime.metrics.reset(),
);
workspaceProjectionRuntime.setCanonicalPublicationReporter(() => {
  const status = canonicalPublicationRuntime.status();
  return {
    state: status.state,
    cycleId: status.publicationCycleId,
    cycleAligned: status.cycleAligned,
    producingCycleIds: status.producingCycleIds,
  };
});
