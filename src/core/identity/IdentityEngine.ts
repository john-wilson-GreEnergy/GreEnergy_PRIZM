import { IdentityNormalizer } from './IdentityNormalizer';
import { IdentityResolver } from './IdentityResolver';
import type { IdentityResolutionInput, IdentityResolutionResult } from './types';

export class IdentityEngine {
  private readonly normalizer = new IdentityNormalizer();
  private readonly resolver = new IdentityResolver();

  public resolve(input: IdentityResolutionInput): IdentityResolutionResult {
    const normalizedInput = this.normalizer.normalize(input.rawValue);
    return this.resolver.resolve(normalizedInput, input.candidates);
  }
}
