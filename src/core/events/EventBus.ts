import type { CoreEvent, EventDispatchFailure, EventDispatchResult, EventHandler } from './types';
import { Subscription } from './Subscription';

interface RegisteredSubscription {
  readonly subscription: Subscription;
  readonly listener: EventHandler<unknown>;
}

export class EventBus {
  private readonly subscriptions = new Map<string, RegisteredSubscription[]>();

  public publish<TPayload>(event: CoreEvent<TPayload>): EventDispatchResult {
    const subscribers = this.subscriptions.get(event.type) ?? [];
    const failures: EventDispatchFailure[] = [];
    let delivered = 0;

    for (const entry of subscribers) {
      if (entry.subscription.isRemoved()) {
        continue;
      }

      try {
        entry.listener(event as CoreEvent<unknown>);
        delivered += 1;
      } catch (error) {
        failures.push({
          subscriptionId: entry.subscription.id,
          error,
        });
      }
    }

    return {
      delivered,
      failures,
    };
  }

  public subscribe<TPayload>(type: string, listener: EventHandler<TPayload>): Subscription {
    const subscription = new Subscription(this.createId(), type);
    const current = this.subscriptions.get(type) ?? [];

    current.push({
      subscription,
      listener: listener as EventHandler<unknown>,
    });

    this.subscriptions.set(type, current);
    return subscription;
  }

  public clear(): void {
    this.subscriptions.clear();
  }

  public subscriptionCount(type?: string): number {
    if (type) {
      const subscriptions = this.subscriptions.get(type) ?? [];
      return subscriptions.filter((entry) => !entry.subscription.isRemoved()).length;
    }

    let count = 0;
    for (const entries of this.subscriptions.values()) {
      count += entries.filter((entry) => !entry.subscription.isRemoved()).length;
    }
    return count;
  }

  private createId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
