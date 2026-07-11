import type { ObservationRecord } from './types';

export class Observation implements Readonly<ObservationRecord> {
  public readonly id: string;
  public readonly source: string;
  public readonly sourceType: ObservationRecord['sourceType'];
  public readonly observedAt: string;
  public readonly receivedAt: string;
  public readonly subject: string;
  public readonly payload: unknown;
  public readonly summary: string;
  public readonly metadata?: Record<string, unknown>;

  constructor(input: ObservationRecord) {
    this.id = input.id;
    this.source = input.source;
    this.sourceType = input.sourceType;
    this.observedAt = input.observedAt;
    this.receivedAt = input.receivedAt;
    this.subject = input.subject;
    this.payload = input.payload;
    this.summary = input.summary;
    this.metadata = input.metadata ? { ...input.metadata } : undefined;
  }
}
