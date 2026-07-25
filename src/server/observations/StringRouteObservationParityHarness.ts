import type { ObjectGraphSnapshot } from '../../core/objectGraph';
import { immutableBindingValue } from '../telemetry/binding';
import type { ObservationSnapshot } from './ObservationTypes';
import { StringRouteObservationAdapter, type ControllerIpMapping, type StringRouteVariant } from './StringRouteObservationAdapter';
import { StringRouteObservationParity, type StringRouteParityResult } from './StringRouteObservationParity';

export interface StringRouteParityHarnessInput { readonly normalizedRows: readonly Readonly<Record<string, unknown>>[]; readonly observationSnapshot: ObservationSnapshot; readonly graph: ObjectGraphSnapshot | null; readonly controllerIpMappings?: readonly ControllerIpMapping[]; readonly legacyResponses: Readonly<Record<StringRouteVariant, unknown>> }
export interface StringRouteParityHarnessReport { readonly generatedAt: string; readonly cycleId: number | null; readonly routes: Readonly<Record<StringRouteVariant, StringRouteParityResult>>; readonly fieldAdapterDurationMs: number; readonly routeReconstructionDurationMs: number; readonly parityComparisonDurationMs: number; readonly observationLookups: number; readonly graphLookups: number; readonly estimatedTemporaryAllocations: number; readonly pass: boolean }

export class StringRouteObservationParityHarness {
  run(input: StringRouteParityHarnessInput): StringRouteParityHarnessReport {
    const normalizedRows = immutableBindingValue(input.normalizedRows); const snapshot = immutableBindingValue(input.observationSnapshot); const graph = input.graph ? immutableBindingValue(input.graph) : null; const adapter = new StringRouteObservationAdapter(); const parity = new StringRouteObservationParity();
    const routes = {} as Record<StringRouteVariant, StringRouteParityResult>; let fieldAdapterDurationMs = 0; let routeReconstructionDurationMs = 0; let parityComparisonDurationMs = 0; let observationLookups = 0; let graphLookups = 0; let estimatedTemporaryAllocations = 0;
    for (const route of ['local-strings', 'strings-dashboard', 'site-operations'] as const) { const result = adapter.reconstruct({ normalizedLegacyRows: normalizedRows, observationSnapshot: snapshot, graph, controllerIpMappings: input.controllerIpMappings, routeVariant: route, rootTemplate: input.legacyResponses[route] }); const comparison = parity.compare(route, input.legacyResponses[route], result.response); routes[route] = comparison; fieldAdapterDurationMs += result.performance.fieldAdapterDurationMs; routeReconstructionDurationMs += result.performance.reconstructionDurationMs; parityComparisonDurationMs += comparison.comparisonDurationMs; observationLookups += result.performance.observationLookups; graphLookups += result.performance.graphLookups; estimatedTemporaryAllocations += result.performance.estimatedTemporaryAllocations; }
    return immutableBindingValue({ generatedAt: new Date().toISOString(), cycleId: snapshot.cycleId, routes, fieldAdapterDurationMs, routeReconstructionDurationMs, parityComparisonDurationMs, observationLookups, graphLookups, estimatedTemporaryAllocations, pass: Object.values(routes).every((route) => route.pass) });
  }
}
