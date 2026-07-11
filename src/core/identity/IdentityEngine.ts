import { EventBus } from '../events';
import type { CoreEvent, Subscription } from '../events';
import type { PrizmObject } from '../models';
import { IdentityNormalizer } from './IdentityNormalizer';
import { IdentityResolver } from './IdentityResolver';
import type { IdentityCandidate, IdentityResolutionInput, IdentityResolutionResult } from './types';

export class IdentityEngine {
  private readonly normalizer = new IdentityNormalizer();
  private readonly resolver = new IdentityResolver();

  public resolve(input: IdentityResolutionInput): IdentityResolutionResult {
    const normalizedInput = this.normalizer.normalize(input.rawValue);
    return this.resolver.resolve(normalizedInput, input.candidates);
  }

  public subscribeTo(eventBus: EventBus): Subscription {
    return eventBus.subscribe('ObjectRegistered', (event) => {
      const payload = event.payload as { objectId: string; object: PrizmObject; source: string };
      const candidates = this.buildIdentityCandidates(payload.object);
      const input: IdentityResolutionInput = {
        rawValue: payload.object.id,
        source: payload.source,
        candidates,
      };

      const resolution = this.resolve(input);
      if (!resolution.matched || !resolution.objectId) {
        return;
      }

      const identityResolvedEvent: CoreEvent<IdentityResolutionResult> = {
        type: 'IdentityResolved',
        payload: resolution,
        source: 'identity-engine',
        timestamp: new Date().toISOString(),
      };

      eventBus.publish(identityResolvedEvent);
    });
  }

  private buildIdentityCandidates(object: PrizmObject): IdentityCandidate[] {
    return [
      {
        objectId: object.id,
        canonicalId: object.id,
        aliases: [object.id],
      },
    ];
  }
}
