export interface AcquisitionProvider<TPayload = unknown> {
  readonly name: string;
  readonly kind: string;
  acquire(input: unknown): Promise<AcquisitionResult<TPayload>>;
}

export interface AcquisitionResult<TPayload = unknown> {
  readonly source: string;
  readonly kind: string;
  readonly success: boolean;
  readonly payload?: TPayload;
  readonly error?: string;
  readonly timestamp: string;
}

export interface AcquisitionSource {
  readonly name: string;
  readonly kind: string;
  readonly config?: Readonly<Record<string, unknown>>;
}
