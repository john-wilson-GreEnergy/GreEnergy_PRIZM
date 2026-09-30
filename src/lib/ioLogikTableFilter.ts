export type IoLogikResultFilter = 'all' | 'mismatch' | 'ok' | 'unknown' | 'unscanned' | 'unavailable' | 'any_mismatch' | 'firmware_mismatch' | 'firmware_ok' | 'firmware_unknown';

type FilterableReading = {
  configurationStatus?: 'ok' | 'mismatch' | 'unknown';
  firmwareStatus?: 'ok' | 'mismatch' | 'unknown';
  reachable?: boolean | null;
};

// Filter canonical scan states; never infer a mismatch from missing telemetry.
export function matchesIoLogikResult(row: FilterableReading, filter: IoLogikResultFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'any_mismatch': return row.configurationStatus === 'mismatch' || row.firmwareStatus === 'mismatch';
    case 'firmware_mismatch': return row.firmwareStatus === 'mismatch';
    case 'firmware_ok': return row.firmwareStatus === 'ok';
    case 'firmware_unknown': return row.firmwareStatus === 'unknown';
    case 'unavailable': return row.reachable === false;
    case 'unscanned': return row.configurationStatus == null && row.reachable == null;
    case 'unknown': return row.configurationStatus === 'unknown' || (row.configurationStatus == null && row.reachable != null);
    default: return row.configurationStatus === filter;
  }
}
