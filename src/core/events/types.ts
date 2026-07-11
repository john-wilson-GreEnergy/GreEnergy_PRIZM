export interface CoreEvent<TPayload> {
  readonly type: string;
  readonly payload: Readonly<TPayload>;
  readonly source: string;
  readonly timestamp: string;
}

export type EventHandler<TPayload> = (event: CoreEvent<TPayload>) => void;

export interface EventDispatchFailure {
  readonly subscriptionId: string;
  readonly error: unknown;
}

export interface EventDispatchResult {
  readonly delivered: number;
  readonly failures: readonly EventDispatchFailure[];
}
