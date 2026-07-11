import { ProviderHealthReport, computeStale } from "./TelemetryHealth";
import { TelemetryContinuityMode, TelemetryDomain } from "./TelemetryModels";

export interface TelemetryAuthorityRule {
  domain: TelemetryDomain;
  preferredSource: string;
  fallbackSources: string[];
  confidence: number;
  freshnessTargetMs: number;
  continuity: TelemetryContinuityMode;
}

export interface AuthorityResolutionResult {
  domain: TelemetryDomain;
  chosenProviderId: string | null;
  fallbackUsed: boolean;
  confidence: number;
  freshnessTargetMs: number;
  continuity: TelemetryContinuityMode;
  stale: boolean;
  reason: string;
}

export const TELEMETRY_AUTHORITY_RULES: Record<TelemetryDomain, TelemetryAuthorityRule> = {
  "controller-health": {
    domain: "controller-health",
    preferredSource: "turtle",
    fallbackSources: ["first-responder"],
    confidence: 0.95,
    freshnessTargetMs: 15000,
    continuity: "continuous",
  },
  "string-telemetry": {
    domain: "string-telemetry",
    preferredSource: "turtle",
    fallbackSources: [],
    confidence: 0.95,
    freshnessTargetMs: 15000,
    continuity: "continuous",
  },
  "feather-hvac-telemetry": {
    domain: "feather-hvac-telemetry",
    preferredSource: "feather",
    fallbackSources: ["turtle"],
    confidence: 0.9,
    freshnessTargetMs: 30000,
    continuity: "continuous",
  },
  notifications: {
    domain: "notifications",
    preferredSource: "turtle",
    fallbackSources: [],
    confidence: 0.9,
    freshnessTargetMs: 30000,
    continuity: "continuous",
  },
  "first-responder-safety": {
    domain: "first-responder-safety",
    preferredSource: "first-responder",
    fallbackSources: ["turtle"],
    confidence: 0.95,
    freshnessTargetMs: 30000,
    continuity: "on-demand",
  },
};

export class TelemetryAuthorityRegistry {
  private readonly rules: Record<TelemetryDomain, TelemetryAuthorityRule>;

  constructor(rules: Record<TelemetryDomain, TelemetryAuthorityRule> = TELEMETRY_AUTHORITY_RULES) {
    this.rules = rules;
  }

  getRule(domain: TelemetryDomain): TelemetryAuthorityRule {
    return this.rules[domain];
  }

  getAllRules(): Record<TelemetryDomain, TelemetryAuthorityRule> {
    return this.rules;
  }

  resolve(domain: TelemetryDomain, providerHealth: Record<string, ProviderHealthReport>): AuthorityResolutionResult {
    const rule = this.rules[domain];
    const candidates = [rule.preferredSource, ...rule.fallbackSources];

    for (let i = 0; i < candidates.length; i++) {
      const id = candidates[i];
      const health = providerHealth[id];
      if (!health) continue;

      const stale = health.stale || computeStale(health.lastSuccessAt, rule.freshnessTargetMs);
      if (health.healthy && !stale) {
        return {
          domain,
          chosenProviderId: id,
          fallbackUsed: i > 0,
          confidence: rule.confidence,
          freshnessTargetMs: rule.freshnessTargetMs,
          continuity: rule.continuity,
          stale,
          reason: i > 0 ? "preferred-unhealthy-or-stale" : "preferred-healthy",
        };
      }
    }

    const preferredHealth = providerHealth[rule.preferredSource];
    return {
      domain,
      chosenProviderId: preferredHealth ? rule.preferredSource : null,
      fallbackUsed: false,
      confidence: rule.confidence,
      freshnessTargetMs: rule.freshnessTargetMs,
      continuity: rule.continuity,
      stale: true,
      reason: "no-healthy-fresh-provider",
    };
  }
}
