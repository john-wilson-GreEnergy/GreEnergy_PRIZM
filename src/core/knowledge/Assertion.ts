import type { AssertionRecord } from './types';

export class Assertion implements Readonly<AssertionRecord> {
  public readonly id: string;
  public readonly subject: string;
  public readonly predicate: string;
  public readonly object: string;
  public readonly status: AssertionRecord['status'];
  public readonly evidenceIds: readonly string[];
  public readonly observedAt: string;
  public readonly createdAt: string;
  public readonly metadata?: Record<string, unknown>;

  constructor(input: AssertionRecord) {
    this.id = input.id;
    this.subject = input.subject;
    this.predicate = input.predicate;
    this.object = input.object;
    this.status = input.status;
    this.evidenceIds = [...input.evidenceIds];
    this.observedAt = input.observedAt;
    this.createdAt = input.createdAt;
    this.metadata = input.metadata ? { ...input.metadata } : undefined;
  }
}
