export * from './WorkspaceProjectionTypes';
export * from './WorkspaceProjectionMetrics';
export * from './OperatorProjection';
export * from './TechnicianProjection';
export * from './EngineeringProjection';
export * from './WorkspaceProjectionRuntime';
export * from './WorkspaceProjectionRoutes';

import { telemetryMetrics } from '../telemetry/metrics';
import { workspaceProjectionRuntime } from './WorkspaceProjectionRuntime';
telemetryMetrics.setWorkspaceProjectionMetrics(() => workspaceProjectionRuntime.report(), () => workspaceProjectionRuntime.metrics.reset());
