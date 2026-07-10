export interface IdentityCandidate {
  readonly objectId: string;
  readonly canonicalId: string;
  readonly aliases: readonly string[];
  readonly provenance?: readonly ProvenanceEntry[];
}

export interface ProvenanceEntry {
  readonly source: string;
  readonly evidence: string;
  readonly confidence: number;
}

export interface IdentityResolutionInput {
  readonly rawValue: string;
  readonly source: string;
  readonly candidates: readonly IdentityCandidate[];
  readonly context?: Readonly<Record<string, unknown>>;
}

export interface IdentityResolutionResult {
  readonly matched: boolean;
  readonly objectId?: string;
  readonly canonicalId?: string;
  readonly confidence: number;
  readonly reason: 'canonical-id-exact' | 'alias-exact' | 'no-match';
  readonly normalizedInput: string;
}
