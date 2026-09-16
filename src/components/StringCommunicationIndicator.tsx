import React from "react";
import { WifiOff } from "lucide-react";

type CommunicationRow = {
  communicating?: boolean | null;
  bucket?: string;
  stale?: boolean;
  badReport?: boolean;
  sourceDebug?: { canonicalStringSnapshot?: { reason?: string } };
};

export function stringCommunicationStatus(row: CommunicationRow): "lost" | "unverified" | "stale" | "reported" {
  // Aggregate-count reconciliation cannot establish an individual device's identity.
  if (row.sourceDebug?.canonicalStringSnapshot?.reason === "array communication count assigned this row not communicating") return "unverified";
  if (row.communicating === false || row.bucket?.toLowerCase() === "notcommunicating") return "lost";
  if (row.stale === true || row.badReport === true) return "stale";
  return "reported";
}

export default function StringCommunicationIndicator({ row }: { row: CommunicationRow }) {
  const status = stringCommunicationStatus(row);
  if (status === "reported") return null;
  const label = status === "lost" ? "No communication" : status === "unverified" ? "Comms unverified" : "Telemetry stale";
  const explanation = status === "lost"
    ? "String telemetry reports communication loss. Displayed measurements may be last-known values. Rotation and contactor state are separate."
    : status === "unverified"
      ? "Array totals indicate communication loss, but do not confirm which string is affected. Verify this controller before treating it as a confirmed loss."
      : "Telemetry is stale or invalid; this alone does not confirm communication loss.";
  return <span title={explanation} className={`mt-1 inline-flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] font-bold ${status === "lost" ? "border-red-600 bg-red-50 text-red-800" : "border-amber-500 bg-amber-50 text-amber-900"}`}><WifiOff size={13} aria-hidden="true"/>{label}</span>;
}
