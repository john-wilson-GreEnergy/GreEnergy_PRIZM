import { TelemetryMetricsRegistry } from "./TelemetryMetricsRegistry";
import { TelemetryPerformanceReport } from "./TelemetryMetricsTypes";
import { normalizationMetrics } from "../normalization";
import { stringViewerScheduler } from "../stringviewer/StringViewerScheduler";
import { featherScheduler } from "../feather/FeatherScheduler";

export class TelemetryMetrics {
  private graphIdentityReporter: (() => unknown) | null = null;
  private graphIdentityResetter: (() => unknown) | null = null;
  private telemetryBindingReporter: (() => unknown) | null = null;
  private telemetryBindingResetter: (() => unknown) | null = null;
  constructor(readonly registry = new TelemetryMetricsRegistry()) {}

  setGraphIdentityMetrics(reporter: () => unknown, resetter: () => unknown): void { this.graphIdentityReporter = reporter; this.graphIdentityResetter = resetter; }
  setTelemetryBindingMetrics(reporter: () => unknown, resetter: () => unknown): void { this.telemetryBindingReporter = reporter; this.telemetryBindingResetter = resetter; }

  report(): TelemetryPerformanceReport {
    const generatedAt = new Date();
    const endpoints = this.registry.getEndpoints();
    const suspectedDuplicatePolls = endpoints
      .filter((metric) => metric.duplicateRequestCount > 0 || metric.coalescedRequestCount > 0)
      .sort((a, b) => (b.duplicateRequestCount + b.coalescedRequestCount) - (a.duplicateRequestCount + a.coalescedRequestCount));
    const staleSources = endpoints.filter((metric) => metric.stale).sort((a, b) => (b.calculatedDataAgeMs ?? -1) - (a.calculatedDataAgeMs ?? -1));
    const slowestEndpoints = [...endpoints].filter((metric) => metric.maximumMs != null).sort((a, b) => (b.rollingAverageMs ?? 0) - (a.rollingAverageMs ?? 0)).slice(0, 10);
    const highestRequestVolume = [...endpoints].sort((a, b) => b.requestCount - a.requestCount).slice(0, 10);
    const recommendations: string[] = [];
    if (suspectedDuplicatePolls.length) recommendations.push("Review concurrent callers for the reported logical endpoints; this baseline observed overlapping requests but did not coalesce or block them.");
    if (staleSources.length) recommendations.push("Review freshness thresholds and last-known-good retention for stale sources before changing polling cadence.");
    if (slowestEndpoints.some((metric) => (metric.rollingAverageMs ?? 0) >= 1000)) recommendations.push("Prioritize the highest-latency endpoints for timeout and cadence analysis after parity validation.");
    if (endpoints.some((metric) => metric.fallbackCount > 0)) recommendations.push("Separate primary-device latency from local fallback latency in the next optimization phase.");
    if (!recommendations.length) recommendations.push("Collect a longer representative operating window before changing cadence or cache semantics.");

    const observationStartedAt = this.registry.getObservationStartedAt();
    return {
      generatedAt: generatedAt.toISOString(),
      processUptimeSeconds: process.uptime(),
      processUptime: process.uptime(),
      observationStartedAt,
      observationDurationSeconds: Math.max(0, (generatedAt.getTime() - new Date(observationStartedAt).getTime()) / 1000),
      endpoints,
      providers: this.registry.getProviders(),
      coordinator: this.registry.getCoordinator(),
      coordinatorPhases: this.registry.getCoordinatorPhases(),
      normalization: normalizationMetrics.report(),
      stringViewer: stringViewerScheduler.getDebugState(),
      featherScheduler: featherScheduler.getSchedulerState(),
      graphIdentity: this.graphIdentityReporter?.() ?? null,
      telemetryBindings: this.telemetryBindingReporter?.() ?? null,
      broker: this.registry.getBroker(),
      routes: this.registry.getRoutes(),
      suspectedDuplicatePolls,
      staleSources,
      slowestEndpoints,
      highestRequestVolume,
      recommendations,
    };
  }

  reset(): TelemetryPerformanceReport { this.registry.reset(); normalizationMetrics.reset(); stringViewerScheduler.metrics.reset(); featherScheduler.metrics.reset(); this.graphIdentityResetter?.(); this.telemetryBindingResetter?.(); return this.report(); }
}

export const telemetryMetrics = new TelemetryMetrics();
