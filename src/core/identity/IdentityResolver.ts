import type { IdentityCandidate, IdentityResolutionResult } from './types';

export class IdentityResolver {
  public resolve(
    normalizedInput: string,
    candidates: readonly IdentityCandidate[],
  ): IdentityResolutionResult {
    for (const candidate of candidates) {
      const canonicalId = this.normalizeValue(candidate.canonicalId);
      if (canonicalId === normalizedInput) {
        return {
          matched: true,
          objectId: candidate.objectId,
          canonicalId: candidate.canonicalId,
          confidence: 1.0,
          reason: 'canonical-id-exact',
          normalizedInput,
        };
      }
    }

    for (const candidate of candidates) {
      for (const alias of candidate.aliases) {
        const normalizedAlias = this.normalizeValue(alias);
        if (normalizedAlias === normalizedInput) {
          return {
            matched: true,
            objectId: candidate.objectId,
            canonicalId: candidate.canonicalId,
            confidence: 0.95,
            reason: 'alias-exact',
            normalizedInput,
          };
        }
      }
    }

    return {
      matched: false,
      confidence: 0,
      reason: 'no-match',
      normalizedInput,
    };
  }

  private normalizeValue(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[\s_/:-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
}
