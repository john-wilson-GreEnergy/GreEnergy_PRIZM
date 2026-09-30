import {setImmediate as nextTurn} from 'node:timers/promises';

export const cooperativeProcessingEnabled = () => process.env.PRIZM_COOPERATIVE_PROCESSING !== 'false';

/** Keep the coordinator's lock and local draft, but let ready socket/timer work run.
 * Promise.resolve() only yields to microtasks and cannot do that. Never use a
 * checkpoint inside a publication transaction or while mutating shared rows.
 */
export function createCooperativeCheckpoint(
  isCurrent: () => boolean,
  enabled = cooperativeProcessingEnabled(),
  yieldTurn: () => Promise<void> = () => nextTurn(),
): () => Promise<void> {
  return async () => {
    if (!isCurrent()) throw new Error('Telemetry context changed during processing; discard this cycle.');
    if (enabled) await yieldTurn();
    if (!isCurrent()) throw new Error('Telemetry context changed during processing; discard this cycle.');
  };
}
