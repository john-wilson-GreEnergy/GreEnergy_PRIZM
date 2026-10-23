/** Only the snapshot-only enrichment used by prepareStringRows. Live row fields
 * remain authoritative in the broker stream. No timestamp/state inference. */
export function stringListContextRow(row: Record<string, unknown>) {
  const keys = ['arrayNumber','arrayIndex','stringNumber','stringIndex',
    'balanceTelemetryAvailable','balanceCount','balanceActivity','balanceMode',
    'balanceModeRaw','balanceProvidedVoltageTarget','balanceDetails'];
  return Object.fromEntries(keys.filter(key => key in row).map(key => [key,row[key]]));
}
