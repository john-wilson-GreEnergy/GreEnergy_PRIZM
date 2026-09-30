import { IoLogikClient, IoLogikError, stageConfiguration, prepareDeviceConfiguration, type DeviceReading } from './ioLogikClient';
import type { IoLogikTarget, IoLogikInventoryRow } from './iologikFleetService';
import { reportedFirmwareBuild, type FirmwareSource } from './firmwareIdentity';

export type IoLogikResult = IoLogikTarget & {
  success: boolean; action: string; detail: string; before?: IoLogikInventoryRow; after?: IoLogikInventoryRow;
  uploadStatus?: 'accepted' | 'unconfirmed' | 'rejected';
};
type Client = Pick<IoLogikClient, 'discover' | 'login' | 'read' | 'readConfiguration' | 'upload' | 'setWatchdog'>;
type Dependencies = { client: (ip: string, password: string) => Client; sleep: (ms: number) => Promise<void>; now: () => number; recoveryMs: number };
const empty: DeviceReading = { model: null, firmware: null, firmwareRaw: null, do00Safe: null, do00PeerSafe: null, watchdogSeconds: null };
const code = (error: unknown) => error instanceof IoLogikError ? error.code : 'operation_failed';
export function inventory(target: IoLogikTarget, reading: DeviceReading, watchdog: number): IoLogikInventoryRow {
  const known = reading.do00Safe !== null && reading.do00PeerSafe !== null && reading.watchdogSeconds !== null && Number.isFinite(watchdog);
  const match = reading.do00Safe === '0' && reading.do00PeerSafe === '0' && reading.watchdogSeconds === watchdog;
  return {
    ...target, ...reading, pingOk: null, httpOk: true, reachable: true, result: 'ok', configurationStatus: known ? (match ? 'ok' : 'mismatch') : 'unknown',
    configurationDetail: known ? (match ? 'Golden Rule match' : `DO-00 ${reading.do00Safe}; companion safe state ${reading.do00PeerSafe}; watchdog ${reading.watchdogSeconds}s`) : 'Settings incomplete; both DO-00 safe-state fields and watchdog must be reported'
  };
}
export function compareFirmware(reported: string, target: string): 'exact' | 'older' | 'newer' | 'ambiguous' {
  if (!/^\d+(?:\.\d+)+$/.test(reported) || !/^\d+(?:\.\d+)+$/.test(target)) return 'ambiguous';
  const a = reported.split('.').map(Number), b = target.split('.').map(Number);
  if (!a.every(Number.isFinite) || !b.every(Number.isFinite)) return 'ambiguous';
  for (let i = 0;i < Math.min(a.length, b.length);i++) { if (a[i] < b[i]) return 'older'; if (a[i] > b[i]) return 'newer'; }
  return a.length === b.length ? 'exact' : 'ambiguous';
}
export async function boundedMap<T, R>(values: T[], limit: number, fn: (value: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(values.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => { while (cursor < values.length) { const index = cursor++; output[index] = await fn(values[index]); } }));
  return output;
}
export class NativeIoLogikFleet {
  private readonly busy = new Set<string>();
  private readonly deps: Dependencies;
  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = { client: (ip, password) => new IoLogikClient(ip, password), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)), now: Date.now, recoveryMs: 900000, ...deps };
  }
  activeTargets() { return [...this.busy]; }
  async discover(targets: IoLogikTarget[], onRow?: (row: IoLogikInventoryRow) => void): Promise<IoLogikInventoryRow[]> {
    return this.scanRows(targets, 8, onRow, async target => {
      if (this.busy.has(target.ip)) return this.unknown(target, 'device_busy');
      this.busy.add(target.ip);
      try {
        const reachable = await this.deps.client(target.ip, '').discover();
        return { ...target, ...empty, pingOk: null, httpOk: reachable, reachable, result: reachable ? 'reachable' : 'unreachable' };
      } catch (error) { return this.unknown(target, code(error)); }
      finally { this.busy.delete(target.ip); }
    });
  }
  private unknown(target: IoLogikTarget, reason: string): IoLogikInventoryRow {
    const responded = /^(http_\d|login_|firmware_not_reported)/.test(reason);
    const unreachable = ['device_connection_failed', 'request_timeout'].includes(reason);
    const reachable = responded ? true : unreachable ? false : null;
    return { ...target, ...empty, pingOk: null, httpOk: reachable, reachable, result: reason, configurationStatus: 'unknown', configurationDetail: reason };
  }
  private scanRows(targets: IoLogikTarget[], limit: number, onRow: ((row: IoLogikInventoryRow) => void) | undefined, read: (target: IoLogikTarget) => Promise<IoLogikInventoryRow>) {
    return boundedMap(targets, limit, async target => {
      const row = {...await read(target), observedAt: new Date(this.deps.now()).toISOString(), observationSource: 'scan' as const};
      onRow?.(row);
      return row;
    });
  }
  async scan(targets: IoLogikTarget[], password: string, watchdog: number, onRow?: (row: IoLogikInventoryRow) => void): Promise<IoLogikInventoryRow[]> {
    return this.scanRows(targets, 4, onRow, async target => {
      if (this.busy.has(target.ip)) return this.unknown(target, 'device_busy');
      this.busy.add(target.ip);
      try { const client = this.deps.client(target.ip, password); await client.login(); return inventory(target, await client.read(), watchdog); }
      catch (error) { return this.unknown(target, code(error)); }
      finally { this.busy.delete(target.ip); }
    });
  }
  async deploy(input: { targets: IoLogikTarget[]; password: string; kind: 'configuration' | 'firmware'; config?: string; firmware?: { bytes: Uint8Array; fileName: string; version: string; build?: string; prerequisiteVersion?: string; directUpgradeFrom?: FirmwareSource[] }; onResult?: (result: IoLogikResult) => void }): Promise<IoLogikResult[]> {
    if (!input.targets.length) throw new IoLogikError('no_targets_selected');
    let watchdogSeconds = NaN;
    if (input.kind === 'configuration') watchdogSeconds = stageConfiguration(input.config || '').watchdogSeconds;
    else if (input.config) {
      try { watchdogSeconds = stageConfiguration(input.config).watchdogSeconds; } catch { /* Policy is optional for firmware-only updates. */ }
    }
    if (input.kind === 'firmware' && !input.firmware?.bytes.length) throw new IoLogikError('firmware_missing');
    return boundedMap(input.targets, 2, async target => {
      const finish = (result: IoLogikResult) => { input.onResult?.(result); return result; };
      if (this.busy.has(target.ip)) return finish({ ...target, success: false, action: 'blocked', detail: 'device_busy' });
      this.busy.add(target.ip);
      let before: IoLogikInventoryRow | undefined, after: IoLogikInventoryRow | undefined;
      let writeAttempted = false;
      let uploadStatus: IoLogikResult['uploadStatus'];
      try {
        const client = this.deps.client(target.ip, input.password);
        await client.login();
        const reading = await client.read(); before = inventory(target, reading, watchdogSeconds);
        if (!/\bE1242\b/i.test(reading.model || '')) throw new IoLogikError('device_model_not_verified_e1242');
        if (input.kind === 'firmware') {
          if (!reading.firmware) throw new IoLogikError('current_firmware_unknown');
          const comparison = compareFirmware(reading.firmware, input.firmware!.version);
          if (comparison === 'exact' && input.firmware!.build && reportedFirmwareBuild(reading.firmwareRaw) !== input.firmware!.build)
            return finish({ ...target, before, after: before, success: false, action: 'skipped_unverified', detail: 'Version matches but build is different or unavailable; no automatic reflash.' });
          if (comparison !== 'older') return finish({
            ...target, before, after: before, success: comparison === 'exact', action: comparison === 'exact' ? 'skipped' : 'skipped_unverified',
            detail: comparison === 'exact' ? 'Already on the exact requested version' : comparison === 'newer' ? 'Downgrade refused' : 'Device reports only a partial version; exact package match cannot be verified. No upload sent.'
          });
          const qualifiedDirectSource = input.firmware!.directUpgradeFrom?.some(source =>
            source.version === reading.firmware && source.build === reportedFirmwareBuild(reading.firmwareRaw));
          if (input.firmware!.prerequisiteVersion && reading.firmware !== input.firmware!.prerequisiteVersion && !qualifiedDirectSource)
            return finish({ ...target, before, after: before, success: false, action: 'blocked', detail: `Upgrade path not qualified: ${reading.firmwareRaw || reading.firmware} → v${input.firmware!.version}. Allowed sources: v${input.firmware!.prerequisiteVersion}${(input.firmware!.directUpgradeFrom || []).map(source => ` or v${source.version} Build${source.build}`).join('')}. No upload sent.` });
        }
        const payload=input.kind==='firmware'?input.firmware!.bytes:Buffer.from(prepareDeviceConfiguration(input.config!,await client.readConfiguration(),target.ip));
        writeAttempted = true;
        try {
          await client.upload(input.kind, payload, input.kind === 'firmware' ? input.firmware!.fileName : 'ik1242.txt');
          uploadStatus = 'accepted';
        } catch (error) {
          // A reboot may interrupt the response. Read back, but never repeat the upload.
          if (!/^(device_connection_failed|request_timeout|write_redirect_unverified|upload_response_unrecognized|http_5\d\d)$/.test(code(error))) throw error;
          uploadStatus = 'unconfirmed';
        }
        // A single upload attempt only. Recovery uses fresh authenticated reads, not retransmission.
        const deadline = this.deps.now() + (input.kind === 'firmware' ? this.deps.recoveryMs : 120000);
        let stable = 0, lastSignature = '', lastError = 'readback_unavailable';
        while (this.deps.now() < deadline) {
          await this.deps.sleep(3000);
          try {
            const verify = this.deps.client(target.ip, input.password); await verify.login();
            const observed = await verify.read(); after = inventory(target, observed, watchdogSeconds);
            if (!/\bE1242\b/i.test(observed.model || '')) throw new IoLogikError('readback_model_unverified');
            const matched = input.kind === 'configuration' ? after.configurationStatus === 'ok' && observed.firmwareRaw === reading.firmwareRaw : observed.firmware === input.firmware!.version && (!input.firmware!.build || reportedFirmwareBuild(observed.firmwareRaw) === input.firmware!.build);
            const partial = input.kind === 'firmware' && !!observed.firmware && observed.firmware !== reading.firmware && compareFirmware(observed.firmware, input.firmware!.version) === 'ambiguous';
            const signature = JSON.stringify([observed.firmwareRaw, observed.do00Safe, observed.do00PeerSafe, observed.watchdogSeconds]);
            stable = signature === lastSignature ? stable + 1 : 1; lastSignature = signature;
            if (stable >= 2 && (matched || partial)) return finish({
              ...target, before, after, uploadStatus, success: matched, action: matched ? 'updated' : 'uploaded_unverified',
              detail: matched ? 'Verified by two post-update readbacks' : 'New firmware family observed; exact patch version is not exposed by this device.'
            });
            lastError = 'readback_does_not_match';
          } catch (error) { lastError = code(error); stable = 0; }
        }
        return finish({ ...target, before, after, uploadStatus, success: false, action: 'unverified', detail: `${uploadStatus === 'accepted' ? 'Device reported upload success' : 'Upload response was not confirmed'}; ${lastError}. Do not re-upload until device state is checked.` });
      } catch (error) {
        const rejected=/^(configuration_import_rejected|upload_file_rejected|upload_authentication_rejected)$/.test(code(error));
        return finish({ ...target, before, after, uploadStatus: rejected ? 'rejected' : uploadStatus, success: false,
          action: rejected ? 'rejected' : writeAttempted ? 'unverified' : 'failed',
          detail: code(error) + (rejected ? '; device explicitly rejected the upload. No automatic retry was sent.' : writeAttempted ? '; write outcome may be uncertain — inspect before retrying' : '') });
      }
      finally { this.busy.delete(target.ip); }
    });
  }
}
