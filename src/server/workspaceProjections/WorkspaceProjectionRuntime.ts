import { getCoordinatorDebugState, getWorkspaceProjectionSource } from '../prizmDataCoordinator';
import { getLatestTelemetrySummary } from '../telemetry/TelemetryRuntime';
import { getTopologyGraphFingerprint, getTopologyGraphHealth } from '../topology/TopologyGraphRuntime';
import { telemetryBindingRuntime } from '../telemetry/binding';
import { observationRuntime } from '../observations';
import { stringViewerScheduler } from '../telemetry/stringviewer';
import { featherScheduler } from '../telemetry/feather';
import { ProfileStore } from '../profiles/profileStore';
import { getActiveProfile as getModbusProfile, getActiveValidationReport } from '../telemetry/modbusProfileManager';
import { buildOperatorProjection } from './OperatorProjection';
import { buildTechnicianProjection, compactString } from './TechnicianProjection';
import { buildEngineeringProjection, engineeringLazyProjection } from './EngineeringProjection';
import { cycle, deeplyImmutable, object, serializedBytes, text } from './ProjectionHelpers';
import { WorkspaceProjectionMetrics } from './WorkspaceProjectionMetrics';
import type { WorkspaceProjectionEnvelope, WorkspaceProjectionInput, WorkspaceProjectionKind } from './WorkspaceProjectionTypes';

export interface WorkspaceProjectionAccess { read(): Promise<WorkspaceProjectionInput> }
const defaultAccess: WorkspaceProjectionAccess = { async read() {
  const graphHealth = getTopologyGraphHealth(); const binding = telemetryBindingRuntime.getProjectionSummary(); const observation = observationRuntime.getProjectionSummary(); const modbusProfile = getModbusProfile();
  return { snapshot: object(getWorkspaceProjectionSource()), coordinator: object(getCoordinatorDebugState()), telemetry: object(getLatestTelemetrySummary()), graphHealth: object(graphHealth), graphFingerprint: getTopologyGraphFingerprint(), graphProfileId: text(object(graphHealth.profileIdentity).connectionProfileId), binding: binding ? object(binding) : null, bindingHealth: object(telemetryBindingRuntime.getLatestBindingHealth()), observation: observation ? object(observation) : null, observationHealth: object(observationRuntime.getLatestObservationHealth()), activeProfile: object(ProfileStore.getActiveProfile()), stringViewer: object(stringViewerScheduler.getDebugState()), featherScheduler: object(featherScheduler.getSchedulerState()), modbusProfile: modbusProfile ? object(modbusProfile) : null, modbusValidation: object(getActiveValidationReport()) };
} };
type ProjectionSet = Record<WorkspaceProjectionKind, WorkspaceProjectionEnvelope<unknown>>;

export class WorkspaceProjectionRuntime {
  private latest: ProjectionSet | null = null;
  private latestInput: WorkspaceProjectionInput | null = null;
  private inputKey: string | null = null;
  private inFlight: Promise<ProjectionSet> | null = null;
  private failureCycleId: number | null = null;
  private canonicalPublicationReporter: (() => { state: string; cycleId: number | null; cycleAligned: boolean; producingCycleIds: Readonly<Record<string, number | null>> }) | null = null;
  readonly metrics = new WorkspaceProjectionMetrics();
  constructor(private readonly access: WorkspaceProjectionAccess = defaultAccess) {}

  setCanonicalPublicationReporter(reporter: () => { state: string; cycleId: number | null; cycleAligned: boolean; producingCycleIds: Readonly<Record<string, number | null>> }): void { this.canonicalPublicationReporter = reporter; }
  requestBuild(force = false): Promise<ProjectionSet> { this.metrics.requested(this.inFlight != null); if (this.inFlight) return this.inFlight; this.inFlight = this.build(force).finally(() => { this.inFlight = null; }); return this.inFlight; }
  async get(kind: WorkspaceProjectionKind) { if (!this.latest) throw new Error('workspace-projection-unavailable'); return this.latest[kind]; }
  async engineeringSubresource(kind: string) { if (!this.latestInput || !this.latest) throw new Error('workspace-projection-unavailable'); const data = engineeringLazyProjection(kind, this.latestInput); return this.envelope(data, this.latest.engineering, this.latest.engineering.retainedLastKnownGood, this.latest.engineering.health); }

  async technicianDetail(arrayIndex: number, stringIndex: number) {
    this.metrics.detail(); if (!this.latestInput || !this.latest) throw new Error('workspace-projection-unavailable');
    const central = object(this.latestInput.snapshot); const normalized = object(central.normalized); const rows = Array.isArray(normalized.strings) ? normalized.strings : [];
    const row = rows.find((value: any) => Number(value.arrayIndex ?? value.arrayNumber) === arrayIndex && Number(value.stringIndex ?? value.stringNumber) === stringIndex); if (!row) return null;
    const details = object(object(normalized.arrayDetailsByArray)[String(arrayIndex)]); const detailed = (Array.isArray(details.strings) ? details.strings : []).find((value: any) => Number(value.stringIndex ?? value.stringNumber) === stringIndex);
    const observation = this.latestInput.observation; const state = Array.isArray(observation?.currentStates) ? observation.currentStates.find((value: any) => Number(value.coordinates?.arrayIndex ?? value.arrayIndex) === arrayIndex && Number(value.coordinates?.stringIndex ?? value.stringIndex) === stringIndex) : observationRuntime.getCurrentStateByCanonicalKey(`A${arrayIndex}-S${stringIndex}`);
    return this.envelope({ string: compactString(row, cycle(central.cycleId)), detail: detailed ?? null, observation: state ?? null }, this.latest.technician, this.latest.technician.retainedLastKnownGood, this.latest.technician.health);
  }

  report() { const publication = this.canonicalPublicationReporter?.() ?? null; return deeplyImmutable({ ready: this.latest != null, inputKey: this.inputKey, cycleId: this.latest?.operator.cycleId ?? null, failureCycleId: this.failureCycleId, canonicalPublicationState: publication?.state ?? 'UNINITIALIZED', canonicalPublicationCycleId: publication?.cycleId ?? null, canonicalCycleAligned: publication?.cycleAligned ?? false, canonicalStageProducingCycleIds: publication?.producingCycleIds ?? {}, projections: this.latest ? Object.fromEntries(Object.entries(this.latest).map(([kind, value]) => [kind, { generatedAt: value.generatedAt, cycleId: value.cycleId, bytes: serializedBytes(value), stale: value.stale, retainedLastKnownGood: value.retainedLastKnownGood, health: value.health }])) : {}, metrics: this.metrics.report() }); }

  private async build(force: boolean): Promise<ProjectionSet> {
    const readStarted = performance.now(); let input: WorkspaceProjectionInput;
    try { input = await this.access.read(); } catch (error) { return this.retain(error, null); }
    const sourceReadDuration = performance.now() - readStarted; const central = object(input.snapshot); const producingCycleId = cycle(central.cycleId ?? object(input.telemetry).cycleId); const activeProfileId = text(object(input.activeProfile).id);
    const key = JSON.stringify([producingCycleId, input.graphFingerprint, input.binding?.bindingFingerprint ?? null, input.observation?.observationFingerprint ?? null, activeProfileId]);
    if (!force && this.latest && this.inputKey === key) { this.metrics.skipped(); return this.latest; }
    if (input.graphProfileId && activeProfileId && input.graphProfileId !== activeProfileId) return this.retain(new Error(`cross-profile-projection:${input.graphProfileId}:${activeProfileId}`), producingCycleId);
    try {
      const timings = {} as Record<WorkspaceProjectionKind, number>; const results = {} as Record<WorkspaceProjectionKind, unknown>;
      for (const kind of ['operator', 'technician', 'engineering'] as const) { const started = performance.now(); results[kind] = kind === 'operator' ? buildOperatorProjection(central) : kind === 'technician' ? buildTechnicianProjection(central, producingCycleId) : buildEngineeringProjection(input); timings[kind] = performance.now() - started; }
      const live = object(central.liveStatus); const stale = live.stale === true || String(live.state) === 'CACHED'; const canonicalIncomplete = !input.graphFingerprint || !input.binding?.bindingFingerprint || !input.observation?.observationFingerprint; const health = !producingCycleId ? 'unavailable' : stale || canonicalIncomplete ? 'degraded' : 'healthy';
      const base = { cycleId: producingCycleId, graphFingerprint: input.graphFingerprint, bindingFingerprint: text(input.binding?.bindingFingerprint), observationFingerprint: text(input.observation?.observationFingerprint), sourceMode: text(live.source) ?? 'cached-runtime', stale } as const;
      const next = deeplyImmutable({ operator: this.envelope(results.operator, base, false, health), technician: this.envelope(results.technician, base, false, health), engineering: this.envelope(results.engineering, base, false, health) });
      this.latest = next; this.latestInput = input; this.inputKey = key; this.failureCycleId = null;
      this.metrics.success(timings, { operator: serializedBytes(next.operator), technician: serializedBytes(next.technician), engineering: serializedBytes(next.engineering) }, sourceReadDuration); return next;
    } catch (error) { return this.retain(error, producingCycleId); }
  }

  private envelope(data: unknown, base: Pick<WorkspaceProjectionEnvelope<unknown>, 'cycleId' | 'graphFingerprint' | 'bindingFingerprint' | 'observationFingerprint' | 'sourceMode' | 'stale'>, retained: boolean, health: WorkspaceProjectionEnvelope<unknown>['health']): WorkspaceProjectionEnvelope<any> {
    return deeplyImmutable({ generatedAt: new Date().toISOString(), cycleId: base.cycleId, producingCycleId: base.cycleId, failureCycleId: retained ? this.failureCycleId : null, graphFingerprint: base.graphFingerprint, bindingFingerprint: base.bindingFingerprint, observationFingerprint: base.observationFingerprint, sourceMode: base.sourceMode, stale: base.stale || retained, retainedLastKnownGood: retained, health, data });
  }
  private retain(error: unknown, failureCycleId: number | null): ProjectionSet { const message = error instanceof Error ? error.message : String(error); this.failureCycleId = failureCycleId; this.metrics.failure(message, this.latest != null, message.includes('cross-profile')); if (!this.latest) throw error; const retained = deeplyImmutable(Object.fromEntries(Object.entries(this.latest).map(([kind, value]) => [kind, this.envelope(value.data, value, true, 'degraded')])) as ProjectionSet); this.latest = retained; return retained; }
}

export const workspaceProjectionRuntime = new WorkspaceProjectionRuntime();
