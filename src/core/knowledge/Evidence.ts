import type { EvidenceRecord } from './types';

export class Evidence implements Readonly<EvidenceRecord> {
  public readonly id: string;
  public readonly assertionId: string;
  public readonly kind: EvidenceRecord['kind'];
  public readonly source: string;
  public readonly summary: string;
  public readonly reference?: string;
  public readonly timestamp: string;
  public readonly metadata?: Record<string, unknown>;

  constructor(input: EvidenceRecord) {
    this.id = input.id;
    this.assertionId = input.assertionId;
    this.kind = input.kind;
    this.source = input.source;
    this.summary = input.summary;
    this.reference = input.reference;
    this.timestamp = input.timestamp;
    this.metadata = input.metadata ? { ...input.metadata } : undefined;
  }
}
