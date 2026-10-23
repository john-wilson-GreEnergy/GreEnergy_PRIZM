/** Discover every existing PCS candidate, in source/traversal order. Avoid
 * allocating paths and recursing for scalar cell readings that cannot contain
 * candidates. Never prune an object branch or assume an equipment layout.
 */
export function findPcsCandidates(sources: Record<string, unknown>, optimized = process.env.PRIZM_PCS_CANDIDATE_SCAN !== 'legacy') {
  const pcsDebugKeys: string[] = [];
  const pcsCandidates: any[] = [];
  function dig(obj: any, path: string) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((value, index) => {
        if (!optimized || value && typeof value === 'object') dig(value, `${path}[${index}]`);
      });
    } else {
      const visit = (key: string, value: any) => {
        const lower = key.toLowerCase();
        if (lower.includes('pcs') || lower.includes('inverter') || lower.includes('converter')) {
          pcsDebugKeys.push(`${path ? path + '.' : ''}${key}`);
          if (Array.isArray(value)) pcsCandidates.push(...value);
          else if (typeof value === 'object' && value !== null) pcsCandidates.push(value);
        }
        if (!optimized || value && typeof value === 'object') dig(value, `${path ? path + '.' : ''}${key}`);
      };
      if (optimized) for (const key of Object.keys(obj)) visit(key, obj[key]);
      else for (const [key, value] of Object.entries(obj)) visit(key, value);
    }
  }
  for (const [path, source] of Object.entries(sources)) dig(source, path);
  return {pcsDebugKeys, pcsCandidates};
}
