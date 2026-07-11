import { EventBus } from '../events';
import { IdentityEngine } from '../identity';
import { KnowledgeStore } from '../knowledge';
import { ObjectRegistry } from '../registry';
import type { PrizmObject } from '../models';

export interface CoreIntegrationOptions {
  readonly registry?: ObjectRegistry<PrizmObject>;
  readonly eventBus?: EventBus;
  readonly identityEngine?: IdentityEngine;
  readonly knowledgeStore?: KnowledgeStore;
}

export class CoreIntegration {
  private readonly registry: ObjectRegistry<PrizmObject>;
  private readonly eventBus: EventBus;
  private readonly identityEngine: IdentityEngine;
  private readonly knowledgeStore: KnowledgeStore;

  constructor(options: CoreIntegrationOptions = {}) {
    this.eventBus = options.eventBus ?? new EventBus();
    this.registry = options.registry ?? new ObjectRegistry<PrizmObject>({ eventBus: this.eventBus });
    this.identityEngine = options.identityEngine ?? new IdentityEngine();
    this.knowledgeStore = options.knowledgeStore ?? new KnowledgeStore();

    this.identityEngine.subscribeTo(this.eventBus);
    this.knowledgeStore.subscribeTo(this.eventBus);
  }

  public registerObject(object: PrizmObject): Readonly<PrizmObject> | undefined {
    return this.registry.register(object);
  }

  public getRegistry(): ObjectRegistry<PrizmObject> {
    return this.registry;
  }

  public getEventBus(): EventBus {
    return this.eventBus;
  }

  public getIdentityEngine(): IdentityEngine {
    return this.identityEngine;
  }

  public getKnowledgeStore(): KnowledgeStore {
    return this.knowledgeStore;
  }
}
