type Query = readonly string[];

/** Legacy independent traversal, retained for rollback. */
export function findArrayCandidatesLegacy(root: unknown, keys: Query, result: unknown[] = []): unknown[] {
  if (!root || typeof root !== 'object') return result;
  if (Array.isArray(root)) {
    if (root.length > 0 && root[0] && typeof root[0] === 'object' && keys.every(key => key in root[0])) {
      result.push(...root);
    } else {
      for (const child of root) findArrayCandidatesLegacy(child, keys, result);
    }
  } else {
    for (const child of Object.values(root)) findArrayCandidatesLegacy(child, keys, result);
  }
  return result;
}

/** Each query independently prunes matching arrays. Preserve ordering,
 * duplicates and references; no normalization or telemetry source selection.
 */
export function findArrayCandidates(root: unknown, queries: readonly Query[]): unknown[][] {
  const results = queries.map(() => [] as unknown[]);
  const stack = [{value: root, active: queries.map((_, index) => index)}];
  while (stack.length) {
    const {value, active} = stack.pop()!;
    if (!value || typeof value !== 'object') continue;
    let pending = active;
    if (Array.isArray(value)) {
      const first = value[0];
      if (first && typeof first === 'object') {
        pending = active.filter(index => {
          if (!queries[index].every(key => key in first)) return true;
          results[index].push(...value);
          return false;
        });
      }
    }
    if (!pending.length) continue;
    const children = Array.isArray(value) ? value : Object.values(value);
    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index];
      if (child && typeof child === 'object') stack.push({value: child, active: pending});
    }
  }
  return results;
}

export const batchedArraySearchEnabled = () => process.env.PRIZM_BATCHED_ARRAY_SEARCH !== 'false';

export function siteArrayCandidates(block: unknown, status: unknown, lastCall: unknown, optimized = batchedArraySearchEnabled()) {
  const queries = [
    ['arrayIndex', 'nearlineSOC'], ['arrayIndex', 'communicatingStackCount'],
    ['arrayIndex', 'availableACChargekW'], ['arrayIndex', 'onlineSOC'],
  ];
  const search = (root: unknown, signatures: Query[]) => optimized
    ? findArrayCandidates(root, signatures)
    : signatures.map(keys => findArrayCandidatesLegacy(root, keys));
  const b = search(block, queries);
  const s = search(status, [queries[0], queries[3]]);
  const l = search(lastCall, [queries[0]]);
  return [b[0], s[0], l[0], b[1], b[2], b[3], s[1]];
}
