/** Shared UI contract. Equipment identity is projected by the server, never inferred here. */
export interface SafetyCandidate {
  entityKeyToken: string;
  displayKey: string;
  entityKey?: string;
  resetEntityKey?: string;
  statusMessage: string;
  statusMessageText?: string;
  entityType?: string;
  allowFaultReset: boolean;
  enabled: boolean;
  communicating: boolean;
  resetBlockedReason?: string;
  equipment?: { array: string; segment: string; controller: string };
}
export type ClearOutcome = {
  candidate: SafetyCandidate;
  state: 'queued' | 'confirmed' | 'rejected' | 'unknown' | 'skipped';
  message: string;
};
export const candidateSignature = (c: SafetyCandidate) => JSON.stringify([
  c.entityKeyToken, c.resetEntityKey, c.displayKey, c.statusMessage,
  c.allowFaultReset, c.enabled, c.communicating,
  c.resetBlockedReason,
]);
export function candidateBlockedReason(c: SafetyCandidate): string {
  if (c.resetBlockedReason) return c.resetBlockedReason;
  if (!c.entityKeyToken) return 'Equipment identity unavailable';
  if (c.allowFaultReset !== true) return 'Not eligible for reset';
  if (c.enabled !== true) return 'Equipment disabled';
  if (c.communicating !== true) return 'Equipment not communicating';
  return '';
}
export function selectedSafetyCandidates(candidates: SafetyCandidate[], selected: Record<string, string>) {
  const seen = new Set<string>();
  return candidates.filter(c => {
    if (seen.has(c.entityKeyToken)) return false;
    seen.add(c.entityKeyToken);
    return !candidateBlockedReason(c) && selected[c.entityKeyToken] === candidateSignature(c);
  });
}

/** Deliberate click only; sequential existing per-device endpoint, never automatic retries. */
export async function clearSelectedSafetyFaults(
  profileId: string, candidates: SafetyCandidate[],
  request: typeof fetch, onResult: (result: ClearOutcome) => void,
  canContinue: () => boolean = () => true,
) {
  let stopped = false;
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.entityKeyToken)) continue;
    seen.add(candidate.entityKeyToken);
    if (stopped || !canContinue()) {
      onResult({candidate, state: 'skipped', message: 'Not sent: batch stopped. Review before selecting again.'});
      continue;
    }
    const blocked = candidateBlockedReason(candidate);
    if (!profileId || blocked) {
      onResult({candidate, state: 'rejected', message: blocked || 'Site profile unavailable'});
      continue;
    }
    try {
      const response = await request('/api/local/safety-fault-clear/execute', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({profileId, entityKeyToken: candidate.entityKeyToken,
          expectedDisplayKey: candidate.displayKey, expectedStatusMessage: candidate.statusMessage,
          expectedResetEntityKey: candidate.resetEntityKey,
          confirmationText: 'CLEAR FAULT'}),
      });
      const payload = await response.json();
      if (response.ok && payload.queued === true) {
        const confirmed = payload.verification?.appearsCleared === true;
        onResult({candidate, state: confirmed ? 'confirmed' : 'queued',
          message: confirmed ? 'Clear confirmed by subsequent telemetry' : 'Queued — clearance not yet confirmed'});
      } else {
        // A failed gateway response can follow dispatch; do not invite a blind retry.
        const uncertain = response.status >= 500 || response.ok;
        onResult({candidate, state: uncertain ? 'unknown' : 'rejected',
          message: uncertain ? 'Outcome unknown — inspect live state before retrying' : payload.error || `Request rejected (${response.status})`});
        stopped = true;
      }
    } catch {
      onResult({candidate, state: 'unknown', message: 'Response unavailable — command may have been sent. No retry performed.'});
      stopped = true;
    }
  }
}
