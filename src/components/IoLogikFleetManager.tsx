import React, { useEffect, useMemo, useRef, useState } from "react";
import { subscribeIoLogikOperation } from '../lib/subscribeIoLogikOperation';
import { matchesIoLogikResult, type IoLogikResultFilter } from '../lib/ioLogikTableFilter';
import type { getIoLogikOperation } from '../server/iologik/iologikFleetService';
type FleetState = ReturnType<typeof getIoLogikOperation>;
import {
  CheckCircle2,
  Cpu,
  FileCheck2,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";

type Target = {
  ip: string;
  arrayIndex: number;
  segmentIndex: number;
  label: string;
};
type Row = Target & {
  observedAt?: string;
  observationSource?: 'scan' | 'verified-update';
  reachable?: boolean | null;
  pingOk?: boolean | null;
  httpOk?: boolean | null;
  firmware?: string | null;
  firmwareRaw?: string | null;
  firmwareStatus?: 'ok' | 'mismatch' | 'unknown';
  firmwareDetail?: string;
  result?: string;
  do00Safe?: string | null;
  do00PeerSafe?: string | null;
  watchdogSeconds?: number | null;
  configurationStatus?: "ok" | "mismatch" | "unknown";
  configurationDetail?: string | null;
};
type DeviceResult = Target & { success: boolean; action?: string; detail?: string; before?: Row; after?: Row };
type Operation = { id: string; inventoryWarning?: string; kind: string; state: string; startedAt: string; results: DeviceResult[]; targetIps: string[] };

export default function IoLogikFleetManager({ active }: { active: boolean }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [lastScan, setLastScan] = useState<{scannedAt:string;kind:string;targetIps:string[]} | null>(null);
  const publishedAt = useRef(0);
  const [scan, setScan] = useState<FleetState['scan']>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<
    "targets" | "discover" | "firmware" | "config" | null
  >(null);
  const [query, setQuery] = useState("");
  const [arrayFilter, setArrayFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState<IoLogikResultFilter>('all');
  const [assets, setAssets] = useState<any>(null);
  const [message, setMessage] = useState<any>(null);
  const [confirming, setConfirming] = useState<"config" | "firmware" | null>(
    null,
  );
  const [firmwareImporting, setFirmwareImporting] = useState(false);
  const [watchdogDraft, setWatchdogDraft] = useState("300");
  const [savingGoldenRule, setSavingGoldenRule] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [results, setResults] = useState<DeviceResult[]>([]);
  const [configImporting, setConfigImporting] = useState(false);
  const updating = !!busy || operation?.state === 'running' || scan?.state === 'running';
  const acceptState = (state: FleetState) => {
    if (state.publishedAt < publishedAt.current) return;
    publishedAt.current = state.publishedAt;
    setRows(state.inventory);
    setLastScan(state.lastScan);
    setScan(state.scan);
    setOperation(state.operation);
    setResults(state.operation?.results || []);
  };

  const request = async (url: string, body?: any) => {
    const response = await fetch(
      url,
      body
        ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
        : undefined,
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  };
  const loadTargets = async () => {
    setBusy("targets");
    setMessage(null);
    try {
      const data = await request("/api/local/iologik/targets");
      setTargets(data.targets || []);
      setAssets(data.assets);
      acceptState(data.fleetState);
      if (data.assets?.configurationProfile?.deploymentTargets?.watchdogSeconds)
        setWatchdogDraft(
          String(
            data.assets.configurationProfile.deploymentTargets.watchdogSeconds,
          ),
        );
    } catch (error: any) {
      setMessage({ error: error.message });
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => {
    if (active) loadTargets();
  }, [active]);
  useEffect(() => {
    if (!active) return;
    return subscribeIoLogikOperation(acceptState);
  }, [active]);
  useEffect(() => () => setPassword(""), []);
  const scope = selected.size ? Array.from(selected) : undefined;
  const run = async (kind: "discover" | "firmware") => {
    setBusy(kind);
    setMessage(null);
    try {
      const data = await request(
        kind === "discover"
          ? "/api/local/iologik/discover"
          : "/api/local/iologik/firmware/scan",
        {
          targetIps: scope,
          password: kind === "firmware" ? password : undefined,
        },
      );
      acceptState(await request('/api/local/iologik/operations'));
      const drift = (data.rows || []).filter(
        (row: Row) => row.configurationStatus === "mismatch",
      ).length;
      const firmwareDrift = (data.rows || []).filter((row: Row) => row.firmwareStatus === 'mismatch').length;
      setMessage({
        ok: drift === 0 && firmwareDrift === 0,
        error: drift || firmwareDrift
          ? `${drift} configuration mismatch(es) · ${firmwareDrift} firmware mismatch(es).`
          : null,
        text: `${kind === "discover" ? "Discovery" : "Firmware and configuration scan"} completed for ${(data.rows || []).length} target(s), including unavailable devices.`,
      });
    } catch (error: any) {
      setMessage({ error: error.message });
    } finally {
      setBusy(null);
    }
  };
  const applyConfiguration = async () => {
    setBusy("config");
    setMessage(null);
    try {
      const data = await request("/api/local/iologik/configuration/apply", {
        targetIps: Array.from(selected),
        password,
        confirmed: true,
      });
      const failed = (data.results || []).filter(
        (row: any) => !row.success,
      ).length;
      setMessage({
        ok: failed === 0,
        error: failed
          ? `${failed} target(s) failed configuration verification.`
          : null,
        text: `${data.results.length - failed} configured · ${failed} failed`,
      });
      setConfirming(null);
      acceptState(await request('/api/local/iologik/operations'));
    } catch (error: any) {
      setMessage({ error: error.message });
    } finally { setBusy(null); }
  };
  const applyFirmware = async () => {
    setBusy("config");
    setMessage(null);
    try {
      const data = await request("/api/local/iologik/firmware/apply", {
        targetIps: Array.from(selected),
        password,
        confirmed: true,
      });
      const updated = (data.results || []).filter(
        (row: any) => row.action === "updated" && row.success,
      ).length;
      const skipped = (data.results || []).filter(
        (row: any) => row.action === "skipped",
      ).length;
      const failed = (data.results || []).filter(
        (row: any) => !row.success,
      ).length;
      setMessage({
        ok: failed === 0,
        error: failed
          ? `${failed} target(s) were skipped or failed strict verification.`
          : null,
        text: `${updated} updated · ${skipped} already current · ${failed} unresolved`,
      });
      setConfirming(null);
      acceptState(await request('/api/local/iologik/operations'));
    } catch (error: any) {
      setMessage({ error: error.message });
    } finally {
      setBusy(null);
    }
  };
  const importFirmware = async (file?: File) => {
    if (!file) return;
    setFirmwareImporting(true);
    setMessage(null);
    try {
      if (!/kp$/i.test(file.name) || !/e1242/i.test(file.name))
        throw new Error("Select a versioned Moxa E1242 firmware package ending in kp.");
      if (file.size > 25 * 1024 * 1024)
        throw new Error("Firmware package exceeds the 25 MB safety limit.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0;offset < bytes.length;offset += 0x8000)
        binary += String.fromCharCode(
          ...bytes.subarray(offset, offset + 0x8000),
        );
      const data = await request("/api/local/iologik/firmware/import", {
        fileName: file.name,
        base64: btoa(binary),
      });
      setAssets(data.assets);
      await loadTargets(); // Reassess saved readings against the newly imported package without a device scan.
      setMessage({
        ok: true,
        text: data.firmware.verified ? `Firmware v${data.firmware.version} Build ${data.firmware.build} imported. Review upgrade prerequisites before deployment.` : 'Firmware imported for inspection. Vendor identity is unverified; deployment is blocked.',
      });
    } catch (error: any) {
      setMessage({ error: error.message });
    } finally {
      setFirmwareImporting(false);
    }
  };
  const saveGoldenRule = async () => {
    const seconds = Number(watchdogDraft);
    if (!Number.isInteger(seconds) || seconds < 30 || seconds > 3600) {
      setMessage({
        error:
          "Watchdog timeout must be a whole number from 30 to 3600 seconds.",
      });
      return;
    }
    setSavingGoldenRule(true);
    setMessage(null);
    try {
      const data = await request("/api/local/iologik/configuration/profile", {
        watchdogSeconds: seconds,
        confirmed: true,
      });
      setAssets(data.assets);
      setRows([]);
      setLastScan(null);
      setMessage({
        ok: true,
        text: `${seconds} seconds is now the site Golden Rule. Rescan targets to refresh compliance.`,
      });
    } catch (error: any) {
      setMessage({ error: error.message });
    } finally {
      setSavingGoldenRule(false);
    }
  };
  const importConfiguration = async (file?: File) => {
    if (!file) return;
    setConfigImporting(true);
    try {
      if (file.size > 1024 * 1024) throw new Error('Configuration must be smaller than 1 MB.');
      const data = await request('/api/local/iologik/configuration/import', { text: await file.text() });
      setAssets(data.assets); setWatchdogDraft(String(data.configurationProfile.deploymentTargets.watchdogSeconds)); setRows([]);
      setLastScan(null);
      setMessage({ ok: true, text: 'Golden configuration imported. No device settings were changed.' });
    } catch (error) { setMessage({ error: error instanceof Error ? error.message : 'Import failed.' }); }
    finally { setConfigImporting(false); }
  };
  const arrays = useMemo<number[]>(
    () =>
      Array.from(new Set<number>(targets.map((item) => item.arrayIndex))).sort(
        (a, b) => a - b,
      ),
    [targets],
  );
  const shown = useMemo(
    () => {
      const readings = new Map(rows.map(row => [row.ip, row]));
      const candidates: Row[] = targets.map(target => readings.get(target.ip) || target);
      return candidates.filter(
        (item) =>
          (arrayFilter === "all" || item.arrayIndex === Number(arrayFilter)) &&
          matchesIoLogikResult(item, resultFilter) &&
          `${item.label} ${item.ip} ${item.firmware || ""} ${item.result || ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      );
    },
    [rows, targets, arrayFilter, query, resultFilter],
  );
  const toggle = (ips: string[]) =>
    setSelected((current) => {
      const next = new Set(current);
      const all = ips.every((ip) => next.has(ip));
      ips.forEach((ip) => (all ? next.delete(ip) : next.add(ip)));
      return next;
    });
  const reachable = rows.filter((row) => row.reachable).length;
  const unavailable = rows.filter((row) => row.reachable === false).length;
  const hiddenSelected = selected.size - shown.filter(row => selected.has(row.ip)).length;

  return (
    <div className="space-y-4 font-sans">
      <section className="rounded-lg border border-prizm-border bg-prizm-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-prizm-text">
              <Cpu size={18} className="text-prizm-primary" />
              ioLogik E1242 Fleet Manager
            </h2>
            <p className="mt-1 text-xs text-prizm-text-muted">
              Discover site I/O devices, inventory firmware, and safely deploy
              the proven golden configuration without changing device network
              settings.
            </p>
            <p className="mt-1 text-xs text-prizm-text-muted">Backend: {assets?.backend === 'native' ? 'Native PRIZM · no standalone script required' : assets?.backend || 'Loading…'}</p>
          </div>
          <button
            onClick={loadTargets}
            disabled={!!busy}
            className="rounded border border-prizm-border px-3 py-2 text-xs font-bold"
          >
            <RefreshCw
              size={13}
              className={`mr-2 inline ${busy === "targets" ? "animate-spin" : ""}`}
            />
            Reload topology
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <div className="rounded border border-prizm-border p-3">
            <span className="text-[10px] font-bold uppercase text-prizm-text-muted">
              Expected devices
            </span>
            <strong className="block text-xl">{targets.length}</strong>
          </div>
          <div className="rounded border border-emerald-400/40 bg-emerald-500/5 p-3">
            <span className="text-[10px] font-bold uppercase text-emerald-700">
              Reachable
            </span>
            <strong className="block text-xl text-emerald-600">
              {reachable || "—"}
            </strong>
          </div>
          <div className="rounded border border-amber-400/40 bg-amber-500/5 p-3">
            <span className="text-[10px] font-bold uppercase text-amber-700">
              Unavailable
            </span>
            <strong className="block text-xl text-amber-600">
              {rows.length ? unavailable : "—"}
            </strong>
          </div>
          <div className="rounded border border-prizm-border p-3">
            <span className="text-[10px] font-bold uppercase text-prizm-text-muted">
              Selected
            </span>
            <strong className="block text-xl text-prizm-primary">
              {selected.size}
            </strong>
          </div>
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[330px_1fr]">
        <aside className="space-y-4 rounded-lg border border-prizm-border bg-prizm-surface p-4">
          <div>
            <h3 className="text-xs font-bold uppercase">1. Choose scope</h3>
            <div className="mt-2 flex gap-3 text-[10px] font-bold uppercase">
              <button
                onClick={() =>
                  setSelected(new Set(targets.map((item) => item.ip)))
                }
                className="text-prizm-primary"
              >
                Select all
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-prizm-danger"
              >
                Deselect all
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {arrays.map((array) => {
                const ips = targets
                  .filter((item) => item.arrayIndex === array)
                  .map((item) => item.ip);
                const all = ips.every((ip) => selected.has(ip));
                return (
                  <button
                    key={array}
                    onClick={() => toggle(ips)}
                    className={`rounded border p-2 text-xs font-bold ${all ? "border-prizm-primary bg-prizm-info/10 text-prizm-primary" : "border-prizm-border"}`}
                  >
                    Array {array}
                    <span className="block text-[9px] font-normal">
                      {ips.length} devices
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-prizm-border pt-4">
            <h3 className="text-xs font-bold uppercase">2. Inspect</h3>
            <div className="mt-2 grid gap-2">
              <button
                onClick={() => run("discover")}
                disabled={updating || !targets.length}
                className="rounded bg-prizm-primary px-3 py-2 text-xs font-bold text-black disabled:opacity-40"
              >
                {busy === "discover"
                  ? "Discovering…"
                  : `Discover ${selected.size || targets.length} devices`}
              </button>
              <label className="text-[10px] font-bold uppercase text-prizm-text-muted">
                Device password{" "}
                <span className="normal-case font-normal">(memory only)</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1 w-full rounded border border-prizm-border bg-white p-2 text-xs text-prizm-text"
                />
              </label>
              <button
                onClick={() => run("firmware")}
                disabled={updating || !assets?.backendAvailable}
                className="rounded border border-prizm-primary px-3 py-2 text-xs font-bold text-prizm-primary disabled:opacity-40"
              >
                {busy === "firmware"
                  ? "Reading device settings…"
                  : "Scan firmware + configuration"}
              </button>
            </div>
          </div>
          <div className="border-t border-prizm-border pt-4">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase">
              <Settings2 size={14} />
              3. Update
            </h3>
            <p className="mt-2 text-xs text-prizm-text-muted">
              Configuration deployment preserves each device’s network settings. Firmware
              deployment inventories versions first, skips current devices, and
              refuses unknown versions.
            </p>
            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded border border-prizm-primary px-3 py-2 text-xs font-bold text-prizm-primary">
              <Upload size={14} />
              {firmwareImporting
                ? "Importing firmware…"
                : "Import firmware package"}
              <input
                type="file"
                disabled={firmwareImporting || updating}
                onChange={(event) => {
                  void importFirmware(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
                className="sr-only"
              />
            </label>
            {assets?.firmwareMetadata && (
              <div className="mt-2 rounded border border-prizm-border bg-prizm-surface-strong p-2 text-xs">
                <strong className="block truncate">
                  {assets.firmwareMetadata.originalName}
                </strong>
                <span className="text-prizm-text-muted">
                  Version {assets.firmwareMetadata.version || "unverified"} ·{" "}
                  {assets.firmwareMetadata.build && <>Build {assets.firmwareMetadata.build} · </>}
                  {(assets.firmwareMetadata.sizeBytes / 1048576).toFixed(2)} MB
                </span>
                <p className="mt-2 text-xs">{assets.firmwareMetadata.verified ? 'Vendor SHA-512 matched' : 'Firmware deployment blocked'}</p>
                <p className="mt-1 text-xs text-prizm-text-muted">{assets.firmwareMetadata.upgradeNotice}</p>
                <span className="mt-1 block truncate font-mono text-[10px] text-prizm-text-muted">
                  SHA-256 {assets.firmwareMetadata.sha256}
                </span>
              </div>
            )}
            <button
              onClick={() => setConfirming("config")}
              disabled={updating || !selected.size || !assets?.configAvailable}
              className="mt-3 w-full rounded bg-amber-500 px-3 py-2 text-xs font-bold text-black disabled:opacity-40"
            >
              <Upload size={13} className="mr-2 inline" />
              Review configuration deploy
            </button>
            <button
              onClick={() => setConfirming("firmware")}
              disabled={updating || !selected.size || !assets?.firmwareAvailable || !assets?.firmwareMetadata?.verified || assets?.backend === 'legacy'}
              className="mt-2 w-full rounded bg-prizm-danger px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              <Upload size={13} className="mr-2 inline" />
              Review firmware update
            </button>
            {assets && (!assets.backendAvailable || !assets.configAvailable) && (
              <p className="mt-2 text-xs text-prizm-danger">
                Import a golden configuration to enable configuration deployment. Native firmware updates are independent. The legacy backend, if selected, also requires its standalone script.
              </p>
            )}
          </div>
        </aside>
        <div className="space-y-4">
          <section className="rounded-lg border border-prizm-border bg-prizm-surface p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <FileCheck2 size={17} className="text-prizm-primary" />
              Golden Rule settings
            </h3>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded border border-prizm-border p-2 text-xs">
              <Upload size={14} />{configImporting ? 'Importing…' : 'Import E1242 configuration'}
              <input type="file" accept=".txt" className="sr-only" disabled={configImporting || updating} onChange={event => { void importConfiguration(event.target.files?.[0]); event.currentTarget.value = ''; }} />
            </label>
            {assets?.configurationProfile?.available ? (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div>
                    <span className="text-xs text-prizm-text-muted">
                      Source
                    </span>
                    <strong className="block text-sm">
                      {assets.configurationProfile.fileName}
                    </strong>
                  </div>
                  <div>
                    <span className="text-xs text-prizm-text-muted">
                      Rule source firmware (reference only)
                    </span>
                    <strong className="block text-sm">
                      E1242 · firmware{" "}
                      {assets.configurationProfile.sourceFirmware}
                    </strong>
                  </div>
                  <div>
                    <span className="text-xs text-prizm-text-muted">
                      I/O layout
                    </span>
                    <strong className="block text-sm">
                      8 DI · 4 DO · 4 DIO · 4 AI
                    </strong>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div
                    className={`rounded border p-3 ${assets.configurationProfile.deploymentTargets?.do00Compliant ? "border-emerald-400/40 bg-emerald-500/5" : "border-prizm-danger/40 bg-prizm-danger/10"}`}
                  >
                    <span className="text-xs font-bold uppercase text-prizm-text-muted">
                      DO-00 safe state
                    </span>
                    <strong className="mt-1 block text-base">
                      {assets.configurationProfile.deploymentTargets
                        ?.do00SafeState || "Unknown"}
                    </strong>
                    <span className="text-xs text-prizm-text-muted">
                      Target: Off — never Hold Last
                    </span>
                  </div>
                  <div
                    className={`rounded border p-3 ${assets.configurationProfile.deploymentTargets?.watchdogCompliant ? "border-emerald-400/40 bg-emerald-500/5" : "border-prizm-danger/40 bg-prizm-danger/10"}`}
                  >
                    <span className="text-xs font-bold uppercase text-prizm-text-muted">
                      Communication watchdog
                    </span>
                    <strong className="mt-1 block text-base">
                      {assets.configurationProfile.deploymentTargets
                        ?.watchdogSeconds ?? "Unknown"}{" "}
                      seconds
                    </strong>
                    <label className="mt-2 block text-xs font-bold text-prizm-text-muted">
                      Site Golden Rule (seconds)
                      <div className="mt-1 flex gap-2">
                        <input
                          type="number"
                          min={30}
                          max={3600}
                          step={1}
                          value={watchdogDraft}
                          onChange={(event) =>
                            setWatchdogDraft(event.target.value)
                          }
                          className="min-w-0 flex-1 rounded border border-prizm-border bg-white px-2 py-1.5 text-sm text-prizm-text"
                        />
                        <button
                          onClick={saveGoldenRule}
                          disabled={
                            savingGoldenRule || updating ||
                            Number(watchdogDraft) ===
                            assets.configurationProfile.deploymentTargets
                              ?.watchdogSeconds
                          }
                          className="rounded bg-prizm-primary px-3 py-1.5 text-xs font-bold text-black disabled:opacity-40"
                        >
                          {savingGoldenRule ? "Saving…" : "Save rule"}
                        </button>
                      </div>
                    </label>
                    <span className="mt-1 block text-[10px] text-prizm-text-muted">
                      Allowed range: 30–3600 seconds. Saving changes the
                      comparison and future fleet deployment target.
                    </span>
                  </div>
                </div>
                <div className="mt-3 rounded border border-emerald-400/40 bg-emerald-500/5 p-3 text-xs text-emerald-800">
                  <strong>Deployment safeguards:</strong>{' '}
                  {assets.configurationProfile.applicationMode === 'device-native-policy'
                    ? 'Only DO-00 safe state and watchdog timeout are applied to each device’s own export. Firmware metadata, authentication, network settings and all other I/O settings are preserved. Network overwrite is disabled. A different firmware version does not require a firmware update; unsupported configuration formats are blocked.'
                    : 'Legacy full-configuration import. DO-00 Off and the site watchdog are enforced; network overwrite is disabled.'}
                </div>
                {assets.configurationProfile.applicationMode !== 'device-native-policy' && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-prizm-text-muted">
                  <span>AI00–01: 4–20 mA</span>
                  <span>AI02–03: 0–10 V</span>
                  <span>
                    Custom Modbus:{" "}
                    {assets.configurationProfile.userDefinedModbus
                      ? "enabled"
                      : "disabled"}
                  </span>
                </div>}
                <p className="mt-2 truncate font-mono text-[10px] text-prizm-text-muted">
                  SHA-256 {assets.configurationProfile.sha256}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-prizm-danger">
                Golden configuration file is unavailable.
              </p>
            )}
          </section>
          {operation && <section className="rounded-lg border border-prizm-border bg-prizm-surface p-3 text-xs">
            <strong>Last {operation.kind} update · {operation.state}</strong>
            <p>{operation.results.length} / {operation.targetIps.length} target results · {new Date(operation.startedAt).toLocaleString()}</p>
            {operation.state === 'complete' && <p className="mt-1 text-prizm-text-muted">Historical results from the last run, not a new preflight. A new update checks the current package policy and device state again.</p>}
            {operation.state === 'interrupted' && <p className="text-amber-700">PRIZM restarted before completion. Inspect the device states before retrying; no updates were automatically resumed.</p>}
            {operation.inventoryWarning && <p className="text-amber-700">{operation.inventoryWarning}</p>}
          </section>}
          {scan && <section aria-label="Scan progress" className="rounded-lg border border-prizm-border bg-prizm-surface p-3 text-xs" role="status">
            <strong>{scan.state === 'running' ? 'Scanning' : scan.state === 'complete' ? 'Scan complete' : 'Scan failed'} · {scan.completed} / {scan.targetIps.length} devices</strong>
            {scan.state === 'running' && <><progress aria-label="Devices scanned" className="mt-2 block w-full" value={scan.completed} max={scan.targetIps.length} /><p className="mt-1">Completed rows appear automatically. Pending rows retain their previous reading and timestamp. No device settings are changed.</p></>}
            {scan.error && <p className="text-amber-700">{scan.error} Previous saved inventory retained.</p>}
          </section>}
          <section className="overflow-hidden rounded-lg border border-prizm-border bg-prizm-surface">
            <div className="border-b border-prizm-border p-3 text-xs text-prizm-text-muted">
              <p className="mb-1">Firmware comparison: {assets?.firmwareMetadata?.verified ? `v${assets.firmwareMetadata.version} Build${assets.firmwareMetadata.build}` : 'No verified package — firmware status is not verified'}. Mismatch filtering does not select devices or authorize updates.</p>
              {lastScan ? <><strong className="text-prizm-text">Last saved {lastScan.kind === 'discover' ? 'discovery' : 'firmware + configuration scan'}</strong> · {new Date(lastScan.scannedAt).toLocaleString()} · {lastScan.targetIps.length} target(s). Saved observations, not live readings. Verified updates refresh individual inventory rows without changing this scan report. The next completed scan replaces the inventory scope.</> : 'No saved scan for the current site and Golden Rule. Verified update readings appear individually; run a scan to save a scan report.'}
            </div>
            <div className="flex flex-wrap gap-2 border-b border-prizm-border p-3">
              <div className="relative min-w-[220px] flex-1">
                <Search
                  size={14}
                  className="absolute left-3 top-2.5 text-prizm-text-muted"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search segment, IP, firmware, or result"
                  className="w-full rounded border border-prizm-border bg-prizm-surface-strong py-2 pl-9 pr-3 text-xs"
                />
              </div>
              <select
                aria-label="Filter by array"
                value={arrayFilter}
                onChange={(event) => setArrayFilter(event.target.value)}
                className="rounded border border-prizm-border bg-prizm-surface-strong px-3 py-2 text-xs"
              >
                <option value="all">All arrays</option>
                {arrays.map((array) => (
                  <option key={array} value={array}>
                    Array {array}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter by scan result"
                value={resultFilter}
                onChange={event => setResultFilter(event.target.value as IoLogikResultFilter)}
                className="rounded border border-prizm-border bg-prizm-surface-strong px-3 py-2 text-xs"
              >
                <option value="all">All results</option>
                <option value="any_mismatch">Any mismatch (configuration or firmware)</option>
                <option value="mismatch">Configuration mismatches</option>
                <option value="firmware_mismatch">Firmware mismatches</option>
                <option value="firmware_ok">Firmware matches (OK)</option>
                <option value="firmware_unknown">Firmware not verified</option>
                <option value="ok">Configuration matches (OK)</option>
                <option value="unknown">Not verified</option>
                <option value="unavailable">Unavailable devices</option>
                <option value="unscanned">Not scanned</option>
              </select>
              {(query || arrayFilter !== "all" || resultFilter !== 'all') && (
                <button
                  aria-label="Clear device filters"
                  onClick={() => {
                    setQuery("");
                    setArrayFilter("all");
                    setResultFilter('all');
                  }}
                  className="rounded border border-prizm-border px-3"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-b border-prizm-border px-3 py-2 text-xs">
              <button disabled={!shown.length || updating} onClick={() => setSelected(new Set(shown.map(row => row.ip)))} className="font-bold text-prizm-primary disabled:opacity-40">
                Select only shown ({shown.length})
              </button>
              <span>{selected.size} selected{hiddenSelected > 0 ? ` · ${hiddenSelected} hidden by filters` : ''}</span>
              <span className="text-prizm-text-muted">Filtering does not change the selected update targets.</span>
            </div>
            <div className="max-h-[650px] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-prizm-surface-strong text-[10px] uppercase text-prizm-text-muted">
                  <tr>
                    <th className="p-2">Select</th>
                    <th className="p-2">Enclosure</th>
                    <th className="p-2">IP address</th>
                    <th className="p-2">Ping</th>
                    <th className="p-2">Web UI</th>
                    <th className="p-2">Firmware</th>
                    <th className="p-2">Configuration</th>
                    <th className="p-2">Result</th>
                    <th className="p-2">Last observed</th>
                    <th className="p-2">Last update</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-prizm-text-muted">No devices match these filters. Only scanned, confirmed differences appear under Configuration mismatches; unverified devices are listed separately.</td></tr>}
                  {shown.map((item) => (
                    <tr
                      key={item.ip}
                      className={`border-t border-prizm-border/60 ${selected.has(item.ip) ? "bg-prizm-info/5" : ""}`}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(item.ip)}
                          onChange={() => toggle([item.ip])}
                        />
                      </td>
                      <td className="p-2 font-bold">
                        Array {item.arrayIndex} /{" "}
                        {item.segmentIndex === 0
                          ? "CS"
                          : `ES${item.segmentIndex}`}
                      </td>
                      <td className="p-2 font-mono">{item.ip}</td>
                      <td className="p-2">
                        {item.pingOk == null
                          ? "Not tested"
                          : item.pingOk
                            ? "OK"
                            : "No"}
                      </td>
                      <td className="p-2">
                        {item.httpOk == null
                          ? "—"
                          : item.httpOk
                            ? "OK"
                            : "No"}
                      </td>
                      <td className="p-2 font-mono font-bold">
                        {item.firmware || "—"}
                        {item.firmwareStatus && <span title={item.firmwareDetail} className={`mt-1 block text-[10px] ${item.firmwareStatus === 'mismatch' ? 'text-prizm-danger' : item.firmwareStatus === 'ok' ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {item.firmwareStatus === 'ok' ? 'Firmware OK' : item.firmwareStatus === 'mismatch' ? 'Firmware mismatch' : 'Firmware not verified'}
                        </span>}
                      </td>
                      <td className="p-2">
                        {item.configurationStatus ? (
                          <span
                            title={item.configurationDetail || undefined}
                            className={`inline-flex rounded border px-2 py-1 text-[10px] font-bold uppercase ${item.configurationStatus === "ok" ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-700" : item.configurationStatus === "mismatch" ? "border-prizm-danger/40 bg-prizm-danger/10 text-prizm-danger" : "border-amber-400/40 bg-amber-500/10 text-amber-700"}`}
                          >
                            {item.configurationStatus === "ok"
                              ? "OK"
                              : item.configurationStatus === "mismatch"
                                ? "Mismatch"
                                : "Not verified"}
                          </span>
                        ) : (
                          "—"
                        )}
                        {item.configurationStatus && (
                          <span className="mt-1 block whitespace-nowrap text-[10px] text-prizm-text-muted">
                            DO-00 {item.do00Safe ?? "?"} · Watchdog{" "}
                            {item.watchdogSeconds ?? "?"}s
                            {item.do00PeerSafe != null && item.do00PeerSafe !== item.do00Safe && (
                              <span className="block text-prizm-danger">Conflicting companion safe state: {item.do00PeerSafe === '2' ? 'Hold Last' : item.do00PeerSafe === '1' ? 'On' : 'Off'}</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td
                        className={`p-2 font-bold ${item.reachable === false ? "text-prizm-danger" : item.result === "ok" || item.result === "reachable" ? "text-emerald-600" : "text-prizm-text-muted"}`}
                      >
                        {item.result || "Not scanned"}
                        {scan?.state === 'running' && scan.targetIps.includes(item.ip) && !scan.completedIps.includes(item.ip) && <span className="block text-amber-700">Pending scan · previous reading</span>}
                      </td>
                      <td className="p-2 whitespace-nowrap text-[10px] text-prizm-text-muted">
                        {item.observedAt ? <><time dateTime={item.observedAt}>{new Date(item.observedAt).toLocaleString()}</time><span className="block">{item.observationSource === 'verified-update' ? 'Verified update readback' : 'Scan reading'}</span></> : 'Not observed'}
                      </td>
                      <td className="p-2 min-w-[190px]">
                        {results.filter(result => result.ip === item.ip).map(result => <div key={result.ip} className={result.success ? 'text-emerald-700' : 'text-amber-700'}><strong>{result.action || (result.success ? 'Verified' : 'Not verified')}</strong><p className="font-normal">{result.detail}</p></div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-prizm-border p-2 text-xs text-prizm-text-muted">
              Showing {shown.length} of {targets.length} topology
              targets. “OK” means both reported DO-00 safe-state fields are Off and the communication watchdog
              matches the saved site Golden Rule. A scan never changes device
              state.
            </p>
          </section>
        </div>
      </div>
      {message && (
        <div
          className={`flex items-center gap-2 rounded border p-3 text-xs font-bold ${message.error ? "border-prizm-danger/40 bg-prizm-danger/10 text-prizm-danger" : "border-emerald-400/40 bg-emerald-50 text-emerald-700"}`}
        >
          {message.error ? (
            <ShieldAlert size={15} />
          ) : (
            <CheckCircle2 size={15} />
          )}{" "}
          {message.error || message.text}
        </div>
      )}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-lg border border-amber-500/50 bg-prizm-surface p-5 shadow-2xl"
          >
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase">
              <ShieldAlert size={19} className="text-amber-500" />
              {confirming === "config"
                ? "Deploy ioLogik configuration?"
                : "Update ioLogik firmware?"}
            </h3>
            <p className="mt-3 text-xs text-prizm-text-muted">
              PRIZM will{" "}
              {confirming === "config" ? "configure" : "preflight and update"}{" "}
              <strong className="text-prizm-text">
                {selected.size} selected E1242 device(s)
              </strong>
              . Devices that do not respond or reject authentication will be
              reported individually.
            </p>
            {confirming === "config" ? (
              <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-[11px] text-emerald-700">
                {assets?.configurationProfile?.applicationMode === 'device-native-policy' && <p className="mb-2">Apply DO-00 safe state Off and watchdog {assets.configurationProfile.deploymentTargets?.watchdogSeconds} seconds only. Firmware and all other settings remain unchanged.</p>}
                <strong>Network safeguard:</strong> The target’s own network settings
                are preserved and network overwrite is disabled. A successful import
                restarts the device; do not interrupt its power or network.
              </div>
            ) : (
              <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-700">
                <strong>Restart expected:</strong> Updated devices reboot.
                Devices already current are skipped; unknown versions are not
                flashed.
                <p className="mt-2">Target: v{assets?.firmwareMetadata?.version} Build {assets?.firmwareMetadata?.build}. {assets?.firmwareMetadata?.upgradeNotice}</p>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirming(null)}
                className="rounded border border-prizm-border px-4 py-2 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={
                  confirming === "config" ? applyConfiguration : applyFirmware
                }
                disabled={updating}
                className={`rounded px-4 py-2 text-xs font-bold disabled:opacity-50 ${confirming === "config" ? "bg-amber-500 text-black" : "bg-prizm-danger text-white"}`}
              >
                {busy === "config"
                  ? "Working and verifying…"
                  : confirming === "config"
                    ? "Deploy configuration"
                    : "Start firmware update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
