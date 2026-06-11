import { formatPrizmUtcTimestamp } from "./timeFormat";

// Helper to safely format Feather diagnostic/interlock/fault entries

export function formatFeatherDiagnosticValue(value: any): string {
  if (value === null || value === undefined) return "--";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(formatFeatherDiagnosticValue).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    if (value.device) return String(value.device);
    if (value.name) return String(value.name);
    if (value.label) return String(value.label);
    if (value.description) return String(value.description);
    if (value.message) return String(value.message);
    if (value.status) return String(value.status);
    try {
      return JSON.stringify(value);
    } catch {
      return "[unreadable object]";
    }
  }
  return String(value);
}

export function formatLostCommsEntry(entry: any): {
  label: string;
  tooltip?: string;
  raw?: any;
} {
  if (!entry) return { label: "--" };
  if (typeof entry === "string") return { label: entry, raw: entry };
  if (typeof entry === "object") {
    const device = entry.device || entry.name || entry.label || entry.id || "Unknown Device";
    const lastMs = entry.lastCommsTimestampMillis || entry.lastCommsMs || entry.timestampMillis;
    const tooltip = lastMs
      ? `Lost Comms with: ${device} — Last Comms: ${formatPrizmUtcTimestamp(Number(lastMs))}`
      : `Lost Comms with: ${device}`;
    return {
      label: String(device),
      tooltip,
      raw: entry
    };
  }
  return { label: String(entry), raw: entry };
}
