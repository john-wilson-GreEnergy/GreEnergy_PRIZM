/** HTTP transport success is not equipment command success. */
export function requireVerifiedRotation(result: any): void {
  if (result?.success === true && Array.isArray(result.results) && result.results.length > 0 && result.results.every((row: any) => row.accepted === true && row.readbackConfirmed === true)) return;
  const details = Array.isArray(result?.results) ? result.results.filter((row: any) => row.accepted !== true || row.readbackConfirmed !== true).map((row: any) => {
    const target = row.target || {};
    const label = `Array ${target.array ?? '?'} / ${target.allPcs ? 'All PCS' : `PCS ${target.pcs ?? '?'}`}`;
    return `${label}: ${row.error || row.readbackStatus || 'Command outcome unavailable'}`;
  }).join('; ') : '';
  throw new Error(details || result?.error || 'PCS rotation was not verified. Check live status before retrying.');
}
