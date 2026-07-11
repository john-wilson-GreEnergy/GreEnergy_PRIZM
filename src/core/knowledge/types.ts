export type ObservationSourceType = 'system' | 'import' | 'user' | 'derived' | 'external' | 'historical';
export type AssertionStatus = 'active' | 'superseded' | 'rejected' | 'conflicting';
export type EvidenceKind = 'observation' | 'document' | 'report' | 'manual' | 'external' | 'derived';

export interface ObservationRecord {
  readonly id: string;
  readonly source: string;
  readonly sourceType: ObservationSourceType;
  readonly observedAt: string;
  readonly receivedAt: string;
  readonly subject: string;
  readonly payload: unknown;
  readonly summary: string;
  readonly metadata?: Record<string, unknown>;
}

export interface EvidenceRecord {
  readonly id: string;
  readonly assertionId: string;
  readonly kind: EvidenceKind;
  readonly source: string;
  readonly summary: string;
  readonly reference?: string;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AssertionRecord {
  readonly id: string;
  readonly subject: string;
  readonly predicate: string;
  readonly object: string;
  readonly status: AssertionStatus;
  readonly evidenceIds: readonly string[];
  readonly observedAt: string;
  readonly createdAt: string;
  readonly metadata?: Record<string, unknown>;
}

export interface KnowledgeStoreSnapshot<T> {
  readonly items: readonly T[];
}
