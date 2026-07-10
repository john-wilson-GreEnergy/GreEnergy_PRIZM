import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Edit3,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  X
} from "lucide-react";

type MatrixEntry = Record<string, any>;

const ARRAY_FIELDS = [
  "matchTerms",
  "faultCodes",
  "warningCodes",
  "infoCodes",
  "warrantyCodes",
  "recommendedActions",
  "validationChecks",
  "clearingCriteria"
];

const TEXT_FIELDS = [
  "issueName",
  "system",
  "component",
  "severityHint",
  "managerSummary",
  "technicianDetail",
  "fieldCorrections",
  "safetyNote",
  "sourceDocument",
  "sourcePage"
];

function toText(value: any): string {
  if (Array.isArray(value)) return value.join("\n");
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseArrayText(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizePatch(edit: Record<string, string>) {
  const patch: Record<string, any> = {};

  for (const field of TEXT_FIELDS) {
    if (field in edit) patch[field] = edit[field];
  }

  for (const field of ARRAY_FIELDS) {
    if (field in edit) patch[field] = parseArrayText(edit[field]);
  }

  return patch;
}

export default function TroubleshootingMatrixEditor() {
  const [entries, setEntries] = useState<MatrixEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [systemFilter, setSystemFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/local/troubleshooting/library", { cache: "no-store" });
      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      const nextEntries = Array.isArray(payload.entries) ? payload.entries : [];
      setEntries(nextEntries);

      const nextSelected =
        selectedId && nextEntries.some((entry: MatrixEntry) => entry.id === selectedId)
          ? selectedId
          : nextEntries[0]?.id || "";

      setSelectedId(nextSelected);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) || null,
    [entries, selectedId]
  );

  useEffect(() => {
    if (!selected) {
      setEdit({});
      return;
    }

    const next: Record<string, string> = {};

    for (const field of TEXT_FIELDS) next[field] = toText(selected[field]);
    for (const field of ARRAY_FIELDS) next[field] = toText(selected[field]);

    setEdit(next);
  }, [selectedId, selected?.overrideStatus]);

  const systems = useMemo(() => {
    return Array.from(new Set(entries.map((entry) => String(entry.system || "Unknown")))).sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();

    return entries.filter((entry) => {
      if (systemFilter !== "all" && String(entry.system || "Unknown") !== systemFilter) return false;
      if (statusFilter === "override" && entry.overrideStatus !== "override") return false;
      if (statusFilter === "built-in" && entry.overrideStatus === "override") return false;

      if (!q) return true;

      const haystack = [
        entry.id,
        entry.issueName,
        entry.system,
        entry.component,
        entry.managerSummary,
        ...(entry.faultCodes || []),
        ...(entry.warningCodes || []),
        ...(entry.infoCodes || []),
        ...(entry.matchTerms || [])
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");

      return haystack.includes(q);
    });
  }, [entries, query, systemFilter, statusFilter]);

  const save = async () => {
    if (!selected) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const patch = normalizePatch(edit);

      const res = await fetch(`/api/local/troubleshooting/overrides/${encodeURIComponent(selected.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch })
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      setMessage(`Saved override for ${selected.id}`);
      await load();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4500);
    }
  };

  const reset = async () => {
    if (!selected) return;
    if (!window.confirm(`Reset ${selected.id} back to built-in PRIZM guidance?`)) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/local/troubleshooting/overrides/${encodeURIComponent(selected.id)}`, {
        method: "DELETE"
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      setMessage(`Reset ${selected.id} to built-in guidance`);
      await load();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4500);
    }
  };

  const setField = (field: string, value: string) => {
    setEdit((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="h-[calc(100vh-180px)] min-h-[680px] flex flex-col gap-3 font-sans">
      <div className="flex items-center justify-between gap-3 bg-prizm-surface border border-prizm-border rounded p-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-prizm-primary" />
            <h2 className="text-sm font-black uppercase tracking-widest text-prizm-text font-mono">
              Corrective Action Matrix Editor
            </h2>
          </div>
          <p className="text-[11px] text-prizm-text-muted mt-1">
            Admin overrides are stored locally and take priority over built-in PRIZM guidance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {message && (
            <span className="text-[10px] font-mono font-bold uppercase text-emerald-400">
              <Check size={12} className="inline mr-1" />
              {message}
            </span>
          )}
          {error && (
            <span className="text-[10px] font-mono font-bold uppercase text-rose-400">
              <X size={12} className="inline mr-1" />
              {error}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading || saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded border border-prizm-border bg-prizm-surface-strong text-prizm-text hover:text-prizm-primary text-[10px] font-mono font-black uppercase"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Reload
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-3 min-h-0 flex-1">
        <div className="bg-prizm-surface border border-prizm-border rounded overflow-hidden flex flex-col min-h-0">
          <div className="p-3 border-b border-prizm-border space-y-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-prizm-text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search code, issue, system, term..."
                className="w-full pl-8 pr-3 py-2 rounded bg-prizm-bg border border-prizm-border text-prizm-text text-xs outline-none focus:border-prizm-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={systemFilter}
                onChange={(e) => setSystemFilter(e.target.value)}
                className="px-2 py-2 rounded bg-prizm-bg border border-prizm-border text-prizm-text text-[10px] font-mono"
              >
                <option value="all">All Systems</option>
                {systems.map((system) => (
                  <option key={system} value={system}>{system}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-2 rounded bg-prizm-bg border border-prizm-border text-prizm-text text-[10px] font-mono"
              >
                <option value="all">All Sources</option>
                <option value="built-in">Built-In Only</option>
                <option value="override">Overrides Only</option>
              </select>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
            {filteredEntries.map((entry) => {
              const isSelected = entry.id === selectedId;
              const codes = [
                ...(entry.faultCodes || []),
                ...(entry.warningCodes || []),
                ...(entry.infoCodes || [])
              ].slice(0, 4);

              return (
                <button
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className={`w-full text-left p-3 border-b border-prizm-border/60 transition-colors ${
                    isSelected ? "bg-prizm-primary/10" : "hover:bg-prizm-surface-strong"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-black text-prizm-text uppercase">
                          {entry.issueName}
                        </span>
                        {entry.overrideStatus === "override" && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-mono font-black uppercase">
                            Override
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-prizm-text-muted font-mono mt-1 truncate">
                        {entry.id}
                      </div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {codes.map((code: string) => (
                          <span key={code} className="px-1 rounded bg-black/30 text-prizm-primary text-[8px] font-mono font-bold">
                            #{code}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Edit3 size={13} className={isSelected ? "text-prizm-primary" : "text-prizm-text-muted"} />
                  </div>
                </button>
              );
            })}

            {!loading && filteredEntries.length === 0 && (
              <div className="p-6 text-center text-prizm-text-muted text-[10px] uppercase font-mono">
                No matrix entries match the filters.
              </div>
            )}
          </div>
        </div>

        <div className="bg-prizm-surface border border-prizm-border rounded overflow-hidden flex flex-col min-h-0">
          {selected ? (
            <>
              <div className="p-3 border-b border-prizm-border flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-mono text-prizm-text-muted uppercase">{selected.id}</div>
                  <h3 className="text-base font-black text-prizm-text">{selected.issueName}</h3>
                  <div className="text-[10px] text-prizm-text-muted mt-1">
                    {selected.system} / {selected.component} / {selected.platform || "platform"}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={reset}
                    disabled={saving || selected.overrideStatus !== "override"}
                    className="flex items-center gap-1.5 px-3 py-2 rounded border border-prizm-border bg-prizm-bg text-prizm-text-muted hover:text-amber-400 disabled:opacity-40 text-[10px] font-mono font-black uppercase"
                  >
                    <RotateCcw size={12} />
                    Reset
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-2 rounded border border-prizm-primary/40 bg-prizm-primary/10 text-prizm-primary hover:bg-prizm-primary/20 disabled:opacity-50 text-[10px] font-mono font-black uppercase"
                  >
                    <Save size={12} />
                    {saving ? "Saving..." : "Save Override"}
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {["issueName", "system", "component", "severityHint", "sourceDocument", "sourcePage"].map((field) => (
                    <label key={field} className="space-y-1">
                      <span className="block text-[9px] font-mono font-black uppercase tracking-widest text-prizm-text-muted">
                        {field}
                      </span>
                      <input
                        value={edit[field] || ""}
                        onChange={(e) => setField(field, e.target.value)}
                        className="w-full rounded border border-prizm-border bg-prizm-bg px-3 py-2 text-xs text-prizm-text outline-none focus:border-prizm-primary"
                      />
                    </label>
                  ))}
                </div>

                {["managerSummary", "technicianDetail", "fieldCorrections", "safetyNote"].map((field) => (
                  <label key={field} className="block space-y-1">
                    <span className="block text-[9px] font-mono font-black uppercase tracking-widest text-prizm-text-muted">
                      {field}
                    </span>
                    <textarea
                      value={edit[field] || ""}
                      onChange={(e) => setField(field, e.target.value)}
                      rows={field === "managerSummary" ? 3 : 2}
                      className="w-full rounded border border-prizm-border bg-prizm-bg px-3 py-2 text-xs text-prizm-text outline-none focus:border-prizm-primary resize-y"
                    />
                  </label>
                ))}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {["faultCodes", "warningCodes", "infoCodes", "warrantyCodes", "matchTerms"].map((field) => (
                    <label key={field} className="block space-y-1">
                      <span className="block text-[9px] font-mono font-black uppercase tracking-widest text-prizm-text-muted">
                        {field}
                      </span>
                      <textarea
                        value={edit[field] || ""}
                        onChange={(e) => setField(field, e.target.value)}
                        rows={4}
                        placeholder="One per line, or comma separated"
                        className="w-full rounded border border-prizm-border bg-prizm-bg px-3 py-2 text-xs text-prizm-text outline-none focus:border-prizm-primary resize-y font-mono"
                      />
                    </label>
                  ))}
                </div>

                {["recommendedActions", "validationChecks", "clearingCriteria"].map((field) => (
                  <label key={field} className="block space-y-1">
                    <span className="block text-[9px] font-mono font-black uppercase tracking-widest text-prizm-text-muted">
                      {field}
                    </span>
                    <textarea
                      value={edit[field] || ""}
                      onChange={(e) => setField(field, e.target.value)}
                      rows={6}
                      placeholder="One item per line"
                      className="w-full rounded border border-prizm-border bg-prizm-bg px-3 py-2 text-xs text-prizm-text outline-none focus:border-prizm-primary resize-y"
                    />
                  </label>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-prizm-text-muted text-[10px] uppercase font-mono">
              Select a matrix entry to edit.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
