export interface AcquisitionResult<TPayload = unknown> {
  readonly source: string;
  readonly kind: string;
  readonly success: boolean;
  readonly payload?: TPayload;
  readonly error?: string;
  readonly timestamp: string;
}
