import { immutableValue } from '../../core/objectGraph';
import type { GraphIdentityRoute } from './GraphIdentityResolver';

export const GRAPH_IDENTITY_ROUTES: readonly GraphIdentityRoute[] = [
  'GET /api/local/strings',
  'GET /api/local/strings/dashboard',
  'GET /api/local/site-operations/summary',
];

export interface GraphIdentityReadinessPolicy {
  readonly promotionEnabled: boolean;
  readonly minimumMatches: number;
  readonly minimumCycles: number;
  readonly minimumDurationMs: number;
  readonly maximumMismatches: number;
  readonly requireAllRoutes: boolean;
}

export interface ParityObservation {
  readonly route: GraphIdentityRoute;
  readonly cycleId: number | null;
  readonly graphFingerprint: string;
  readonly sourceFingerprint: string;
  readonly matches: number;
  readonly mismatches: number;
  readonly missing: number;
  readonly duplicates: number;
  readonly fallback: boolean;
  readonly graphUsed: boolean;
  readonly legacyUsed: boolean;
  readonly latencyMs: number;
  readonly timestamp?: string;
  readonly mismatchSample?: string | null;
}

interface MutableRouteParity {
  comparisons: number; matches: number; mismatches: number; missingGraphIdentities: number; duplicateIdentities: number; fallbacks: number; graphUses: number; legacyUses: number;
  comparisonLatencyTotalMs: number; lastComparisonLatencyMs: number | null; lastMismatchSample: string | null; firstSuccessfulParityAt: string | null; latestSuccessfulParityAt: string | null;
  consecutiveSuccessfulComparisons: number; consecutiveSuccessfulCycles: number; lastSuccessfulCycleId: number | null; graphFingerprint: string | null; sourceFingerprint: string | null;
}

const routeState = (): MutableRouteParity => ({ comparisons: 0, matches: 0, mismatches: 0, missingGraphIdentities: 0, duplicateIdentities: 0, fallbacks: 0, graphUses: 0, legacyUses: 0, comparisonLatencyTotalMs: 0, lastComparisonLatencyMs: null, lastMismatchSample: null, firstSuccessfulParityAt: null, latestSuccessfulParityAt: null, consecutiveSuccessfulComparisons: 0, consecutiveSuccessfulCycles: 0, lastSuccessfulCycleId: null, graphFingerprint: null, sourceFingerprint: null });
const bool = (name: string, fallback: boolean): boolean => { const value = process.env[name]?.trim().toLowerCase(); return value == null ? fallback : value === 'true' || value === '1'; };
const integer = (name: string, fallback: number): number => { const value = Number(process.env[name]); return Number.isSafeInteger(value) && value >= 0 ? value : fallback; };

export function graphIdentityReadinessPolicy(): GraphIdentityReadinessPolicy {
  return immutableValue({ promotionEnabled: bool('PRIZM_GRAPH_IDENTITY_PROMOTION_ENABLED', false), minimumMatches: integer('PRIZM_GRAPH_IDENTITY_MIN_MATCHES', 960), minimumCycles: integer('PRIZM_GRAPH_IDENTITY_MIN_CYCLES', 3), minimumDurationMs: integer('PRIZM_GRAPH_IDENTITY_MIN_DURATION_MS', 60_000), maximumMismatches: integer('PRIZM_GRAPH_IDENTITY_MAX_MISMATCHES', 0), requireAllRoutes: bool('PRIZM_GRAPH_IDENTITY_REQUIRE_ALL_ROUTES', true) });
}

export class GraphIdentityReadinessTracker {
  private routes = new Map<GraphIdentityRoute, MutableRouteParity>();
  private history: ParityObservation[] = [];
  private graphFingerprint: string | null = null;
  private sourceFingerprint: string | null = null;
  private firstSuccessAt: string | null = null;
  private latestSuccessAt: string | null = null;
  private lastSuccessfulCycleId: number | null = null;
  private consecutiveSuccessfulCycles = 0;
  private readinessResets = 0;
  private eligibilityChanges = 0;
  private lastEligible = false;
  constructor(private readonly historyLimit = 200, private readonly now: () => Date = () => new Date()) {}

  record(value: ParityObservation): void {
    if (this.graphFingerprint !== value.graphFingerprint || this.sourceFingerprint !== value.sourceFingerprint) this.resetForFingerprint(value.graphFingerprint, value.sourceFingerprint);
    const timestamp = value.timestamp ?? this.now().toISOString();
    const route = this.routes.get(value.route) ?? routeState(); this.routes.set(value.route, route);
    route.comparisons += 1; route.matches += value.matches; route.mismatches += value.mismatches; route.missingGraphIdentities += value.missing; route.duplicateIdentities += value.duplicates; route.fallbacks += value.fallback ? 1 : 0; route.graphUses += value.graphUsed ? 1 : 0; route.legacyUses += value.legacyUsed ? 1 : 0; route.comparisonLatencyTotalMs += value.latencyMs; route.lastComparisonLatencyMs = value.latencyMs; route.graphFingerprint = value.graphFingerprint; route.sourceFingerprint = value.sourceFingerprint;
    const success = value.mismatches === 0 && value.missing === 0 && value.duplicates === 0 && value.matches > 0;
    if (success) {
      route.firstSuccessfulParityAt ??= timestamp; route.latestSuccessfulParityAt = timestamp; route.consecutiveSuccessfulComparisons += 1;
      if (value.cycleId !== route.lastSuccessfulCycleId) { route.consecutiveSuccessfulCycles += 1; route.lastSuccessfulCycleId = value.cycleId; }
      this.firstSuccessAt ??= timestamp; this.latestSuccessAt = timestamp;
      if (value.cycleId !== this.lastSuccessfulCycleId) { this.consecutiveSuccessfulCycles += 1; this.lastSuccessfulCycleId = value.cycleId; }
    } else {
      route.consecutiveSuccessfulComparisons = 0; route.consecutiveSuccessfulCycles = 0; route.lastMismatchSample = value.mismatchSample ?? 'Identity parity comparison failed';
      this.firstSuccessAt = null; this.latestSuccessAt = null; this.consecutiveSuccessfulCycles = 0; this.lastSuccessfulCycleId = null;
    }
    this.history.push(Object.freeze({ ...value, timestamp })); if (this.history.length > this.historyLimit) this.history.splice(0, this.history.length - this.historyLimit);
    const eligible = this.readiness().ready; if (eligible !== this.lastEligible) { this.eligibilityChanges += 1; this.lastEligible = eligible; }
  }

  reset(): void { this.routes.clear(); this.history = []; this.graphFingerprint = null; this.sourceFingerprint = null; this.firstSuccessAt = null; this.latestSuccessAt = null; this.lastSuccessfulCycleId = null; this.consecutiveSuccessfulCycles = 0; this.readinessResets += 1; this.lastEligible = false; }

  readiness(policy = graphIdentityReadinessPolicy()) {
    const now = this.now().getTime(); const first = this.firstSuccessAt ? new Date(this.firstSuccessAt).getTime() : now; const duration = this.firstSuccessAt ? Math.max(0, now - first) : 0;
    const values = [...this.routes.values()]; const matches = values.reduce((sum, value) => sum + value.matches, 0); const mismatches = values.reduce((sum, value) => sum + value.mismatches, 0); const missing = values.reduce((sum, value) => sum + value.missingGraphIdentities, 0); const duplicates = values.reduce((sum, value) => sum + value.duplicateIdentities, 0);
    const blockers: string[] = [];
    if (matches < policy.minimumMatches) blockers.push(`minimum-matches:${matches}/${policy.minimumMatches}`);
    if (this.consecutiveSuccessfulCycles < policy.minimumCycles) blockers.push(`minimum-cycles:${this.consecutiveSuccessfulCycles}/${policy.minimumCycles}`);
    if (duration < policy.minimumDurationMs) blockers.push(`minimum-duration-ms:${duration}/${policy.minimumDurationMs}`);
    if (mismatches > policy.maximumMismatches) blockers.push(`mismatches:${mismatches}/${policy.maximumMismatches}`);
    if (missing > 0) blockers.push(`missing-identities:${missing}`); if (duplicates > 0) blockers.push(`duplicate-identities:${duplicates}`);
    if (policy.requireAllRoutes) for (const route of GRAPH_IDENTITY_ROUTES) if (!(this.routes.get(route)?.consecutiveSuccessfulComparisons)) blockers.push(`route-not-ready:${route}`);
    return { ready: blockers.length === 0, blockers, matches, mismatches, missing, duplicates, consecutiveSuccessfulCycles: this.consecutiveSuccessfulCycles, sustainedParityDurationMs: duration };
  }

  report() {
    const policy = graphIdentityReadinessPolicy(); const readiness = this.readiness(policy);
    return immutableValue({ readiness, readinessPolicy: policy, graphFingerprint: this.graphFingerprint, sourceFingerprint: this.sourceFingerprint, parityByRoute: Object.fromEntries([...this.routes.entries()].map(([route, value]) => [route, { ...value, averageComparisonLatencyMs: value.comparisons ? value.comparisonLatencyTotalMs / value.comparisons : null, sustainedParityDurationMs: value.firstSuccessfulParityAt ? Math.max(0, this.now().getTime() - new Date(value.firstSuccessfulParityAt).getTime()) : 0 }])), parityHistorySummary: { retained: this.history.length, limit: this.historyLimit, oldestAt: this.history[0]?.timestamp ?? null, latestAt: this.history.at(-1)?.timestamp ?? null }, parityHistory: [...this.history], readinessResets: this.readinessResets, graphOnlyEligibilityChanges: this.eligibilityChanges });
  }

  private resetForFingerprint(graphFingerprint: string, sourceFingerprint: string): void {
    if (this.graphFingerprint != null || this.sourceFingerprint != null) this.readinessResets += 1;
    this.routes.clear(); this.firstSuccessAt = null; this.latestSuccessAt = null; this.lastSuccessfulCycleId = null; this.consecutiveSuccessfulCycles = 0; this.graphFingerprint = graphFingerprint; this.sourceFingerprint = sourceFingerprint; this.lastEligible = false;
  }
}
