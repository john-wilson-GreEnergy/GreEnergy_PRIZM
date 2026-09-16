import React, { useEffect, useMemo, useState } from "react";
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
  reachable?: boolean;
  pingOk?: boolean;
  httpOk?: boolean;
  firmware?: string | null;
  firmwareRaw?: string | null;
  result?: string;
  do00Safe?: string | null;
  watchdogSeconds?: number | null;
  configurationStatus?: "ok" | "mismatch" | "unknown";
  configurationDetail?: string | null;
};

export default function IoLogikFleetManager({ active }: { active: boolean }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<
    "targets" | "discover" | "firmware" | "config" | null
  >(null);
  const [query, setQuery] = useState("");
  const [arrayFilter, setArrayFilter] = useState("all");
  const [assets, setAssets] = useState<any>(null);
  const [message, setMessage] = useState<any>(null);
  const [confirming, setConfirming] = useState<"config" | "firmware" | null>(
    null,
  );
  const [firmwareImporting, setFirmwareImporting] = useState(false);
  const [watchdogDraft, setWatchdogDraft] = useState("300");
  const [savingGoldenRule, setSavingGoldenRule] = useState(false);

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
      setRows(data.rows || []);
      const drift = (data.rows || []).filter(
        (row: Row) => row.configurationStatus === "mismatch",
      ).length;
      setMessage({
        ok: drift === 0,
        error: drift
          ? `${drift} target(s) do not match the Golden Rule.`
          : null,
        text: `${kind === "discover" ? "Discovery" : "Firmware and configuration scan"} completed for ${(data.rows || []).length} responding target(s).`,
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
      setConfirming(false);
      await run("firmware");
    } catch (error: any) {
      setMessage({ error: error.message });
      setBusy(null);
    }
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
      setRows(data.before || []);
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
      if (!/\.kp$/i.test(file.name))
        throw new Error("Select a Moxa .kp firmware package.");
      if (file.size > 25 * 1024 * 1024)
        throw new Error("Firmware package exceeds the 25 MB safety limit.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000)
        binary += String.fromCharCode(
          ...bytes.subarray(offset, offset + 0x8000),
        );
      const data = await request("/api/local/iologik/firmware/import", {
        fileName: file.name,
        base64: btoa(binary),
      });
      setAssets(data.assets);
      setMessage({
        ok: true,
        text: `Firmware ${data.firmware.originalName} imported and ready for preflight.`,
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
  const arrays = useMemo<number[]>(
    () =>
      Array.from(new Set<number>(targets.map((item) => item.arrayIndex))).sort(
        (a, b) => a - b,
      ),
    [targets],
  );
  const shown = useMemo(
    () =>
      (rows.length ? rows : targets).filter(
        (item) =>
          (arrayFilter === "all" || item.arrayIndex === Number(arrayFilter)) &&
          `${item.label} ${item.ip} ${item.firmware || ""} ${item.result || ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [rows, targets, arrayFilter, query],
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
                disabled={!!busy || !targets.length}
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
                disabled={!!busy || !assets?.scriptAvailable}
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
              Configuration deployment strips all network settings. Firmware
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
                accept=".kp"
                disabled={firmwareImporting || !!busy}
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
                  {(assets.firmwareMetadata.sizeBytes / 1048576).toFixed(2)} MB
                </span>
                <span className="mt-1 block truncate font-mono text-[10px] text-prizm-text-muted">
                  SHA-256 {assets.firmwareMetadata.sha256}
                </span>
              </div>
            )}
            <button
              onClick={() => setConfirming("config")}
              disabled={!!busy || !selected.size || !assets?.configAvailable}
              className="mt-3 w-full rounded bg-amber-500 px-3 py-2 text-xs font-bold text-black disabled:opacity-40"
            >
              <Upload size={13} className="mr-2 inline" />
              Review configuration deploy
            </button>
            <button
              onClick={() => setConfirming("firmware")}
              disabled={!!busy || !selected.size || !assets?.firmwareAvailable}
              className="mt-2 w-full rounded bg-prizm-danger px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              <Upload size={13} className="mr-2 inline" />
              Review firmware update
            </button>
            {assets && (!assets.scriptAvailable || !assets.configAvailable) && (
              <p className="mt-2 text-xs text-prizm-danger">
                Required local script or golden configuration is unavailable.
                Check the PRIZM ioLogik tool path.
              </p>
            )}
          </div>
        </aside>
        <div className="space-y-4">
          <section className="rounded-lg border border-prizm-border bg-prizm-surface p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <FileCheck2 size={17} className="text-prizm-primary" />
              Golden configuration
            </h3>
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
                      Device profile
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
                            savingGoldenRule ||
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
                  <strong>Verified deployment safeguards:</strong> DO-00 Off and
                  the saved site watchdog are enforced during staging. IP
                  address, subnet mask, gateway, MAC address, and network
                  overwrite are removed before every upload.
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-prizm-text-muted">
                  <span>AI00–01: 4–20 mA</span>
                  <span>AI02–03: 0–10 V</span>
                  <span>
                    Custom Modbus:{" "}
                    {assets.configurationProfile.userDefinedModbus
                      ? "enabled"
                      : "disabled"}
                  </span>
                </div>
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
          <section className="overflow-hidden rounded-lg border border-prizm-border bg-prizm-surface">
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
              {(query || arrayFilter !== "all") && (
                <button
                  onClick={() => {
                    setQuery("");
                    setArrayFilter("all");
                  }}
                  className="rounded border border-prizm-border px-3"
                >
                  <X size={14} />
                </button>
              )}
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
                  </tr>
                </thead>
                <tbody>
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
                        A{item.arrayIndex} /{" "}
                        {item.segmentIndex === 0
                          ? "CS"
                          : `ES${item.segmentIndex}`}
                      </td>
                      <td className="p-2 font-mono">{item.ip}</td>
                      <td className="p-2">
                        {item.pingOk === undefined
                          ? "—"
                          : item.pingOk
                            ? "OK"
                            : "No"}
                      </td>
                      <td className="p-2">
                        {item.httpOk === undefined
                          ? "—"
                          : item.httpOk
                            ? "OK"
                            : "No"}
                      </td>
                      <td className="p-2 font-mono font-bold">
                        {item.firmware || "—"}
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
                          </span>
                        )}
                      </td>
                      <td
                        className={`p-2 font-bold ${item.reachable === false ? "text-prizm-danger" : item.result === "ok" || item.reachable ? "text-emerald-600" : "text-prizm-text-muted"}`}
                      >
                        {item.result || "Not scanned"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-prizm-border p-2 text-xs text-prizm-text-muted">
              Showing {shown.length} of {rows.length || targets.length} topology
              targets. “OK” means DO-00 is Off and the communication watchdog
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
                <strong>Network safeguard:</strong> IP, subnet mask, gateway,
                MAC, and network overwrite settings are removed before upload.
              </div>
            ) : (
              <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-700">
                <strong>Restart expected:</strong> Updated devices reboot.
                Devices already current are skipped; unknown versions are not
                flashed.
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
                disabled={busy === "config"}
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
