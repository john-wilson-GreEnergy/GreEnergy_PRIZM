import { BalancerTestStatus, BalancerTestResultRow } from "./balancerTestTypes";
import { stringNumberToEnergySegment } from "../../lib/stringToEsMapper";

export function parseStatusPayload(rawText: string, totalCellGroups: number): BalancerTestStatus[] {
  // replace <br /> and <br> with newlines, remove other HTML tags, remove carriage returns, remove blank lines
  const cleanedText = rawText
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<br>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\r/g, "");

  const lines = cleanedText.split("\n").map(l => l.trim()).filter(Boolean);
  const results: BalancerTestStatus[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const id = parsed.testId !== undefined && parsed.testId !== null ? Number(parsed.testId) : -1;
      const direction = parsed.direction || "Unknown";
      const statusMessage = parsed.statusMessage || "";
      const rawTargets = parsed.balancerTestTargets || "";
      const started = parsed.started || false;
      const finished = parsed.finished || false;

      // state
      let state: "PENDING" | "RUNNING" | "FINISHED" | "FAILED" = "PENDING";
      const isFailed = statusMessage.toLowerCase().includes("fail") || statusMessage.toLowerCase().includes("error") || parsed.failed === true;
      if (isFailed) {
        state = "FAILED";
      } else if (finished || statusMessage === "Finished.") {
        state = "FINISHED";
      } else if (/CellGroups\s*:?\s*\d+/i.test(statusMessage) || started) {
        state = "RUNNING";
      }

      // progress
      let progress = 0;
      const cellGroupMatch = statusMessage.match(/CellGroups\s*:?\s*(\d+)/i);
      if (cellGroupMatch) {
        const n = Number(cellGroupMatch[1]);
        progress = Math.floor((n * 100) / totalCellGroups);
      } else if (finished || statusMessage === "Finished.") {
        progress = 100;
      }
      progress = Math.max(0, Math.min(100, progress));

      // location parsing
      const loc = parseLocationFromTargets(rawTargets);

      results.push({
        id,
        block: loc.block,
        arrays: loc.arrays,
        direction,
        state,
        progress,
        statusMessage,
        rawTargets,
        started,
        finished,
        raw: parsed
      });
    } catch (e) {
      console.warn("Failed to parse status line:", line, e);
    }
  }

  return results;
}

export function parseLocationFromTargets(targets: string): { block: string; arrays: string[] } {
  if (!targets) {
    return { block: "", arrays: [] };
  }
  if (targets.startsWith("Array ")) {
    const withoutPrefix = targets.replace(/^Array\s+/i, "");
    const parts = withoutPrefix.split(",").map(p => p.trim());
    if (parts.length > 0) {
      const firstPartSplit = parts[0].split(":");
      const block = firstPartSplit[1] || "";
      const arrays = parts.map(p => {
        const split = p.split(":");
        return split[2] || "";
      }).filter(Boolean);
      return { block, arrays };
    }
  } else if (targets.startsWith("Block ")) {
    const withoutPrefix = targets.replace(/^Block\s+/i, "");
    const block = withoutPrefix.split(":")[1] || "";
    return { block, arrays: [] };
  }
  return { block: "", arrays: [] };
}

export function parseDateToSeconds(dateStr: string | null | undefined): number | null {
  if (!dateStr || dateStr.length < 19) return null;
  const cleanStr = dateStr.slice(0, 19); // "YYYY-MM-DDTHH:MM:SS"
  const date = new Date(cleanStr);
  if (isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1000);
}

export function parseReportPayload(rawText: string): BalancerTestResultRow[] {
  // strip text before <body> if present, and after </body> if present
  let cleanJson = rawText;
  const bodyStartIdx = cleanJson.toLowerCase().indexOf("<body>");
  if (bodyStartIdx !== -1) {
    cleanJson = cleanJson.slice(bodyStartIdx + 6);
  }
  const bodyEndIdx = cleanJson.toLowerCase().indexOf("</body>");
  if (bodyEndIdx !== -1) {
    cleanJson = cleanJson.slice(0, bodyEndIdx);
  }
  cleanJson = cleanJson.trim();

  const parsed = JSON.parse(cleanJson);
  const results = Array.isArray(parsed.results) ? parsed.results : [];

  return results.map((row: any) => {
    const balanceStart = row.balanceStart || "";
    const balanceEnd = row.balanceEnd || "";
    const startSec = parseDateToSeconds(balanceStart);
    const endSec = parseDateToSeconds(balanceEnd);
    const durationSec = (startSec !== null && endSec !== null) ? (endSec - startSec) : 0;

    const cellGroupKey = row.cellGroupKey || "UNKNOWN";
    // Parsing cellGroupKey:
    // e.g., "CELLGROUP site:block:array:string:bpc:cell"
    const keyParts = cellGroupKey.split(/\s+/);
    const mainToken = keyParts[1] || "";
    const parts = mainToken.split(":");

    const site = parts[0] || "";
    const block = parts[1] || "";
    const array = parts[2] ? Number(parts[2]) : null;
    const stringNumber = parts[3] ? Number(parts[3]) : null;
    const bpc = parts[4] ? Number(parts[4]) : null;
    const cell = parts[5] ? Number(parts[5]) : null;

    const energySegmentNumber = stringNumber !== null ? stringNumberToEnergySegment(stringNumber) : null;

    // Warning logic:
    const warningTriggerMessage = row.warningTriggerMessage;
    const warningTriggeredAfterBalance = row.warningTriggeredAfterBalance === true;
    const warningTriggeredTime = row.warningTriggeredTime;

    const warning = (
      (warningTriggerMessage !== undefined && warningTriggerMessage !== null && warningTriggerMessage !== "" && warningTriggerMessage !== "null") ||
      warningTriggeredAfterBalance ||
      (warningTriggeredTime !== undefined && warningTriggeredTime !== null && warningTriggeredTime !== "" && warningTriggeredTime !== "null")
    );

    return {
      durationSec,
      site,
      block,
      array,
      stringNumber,
      energySegmentNumber,
      bpc,
      cell,
      balanceConfirmedOn: row.balanceConfirmedOn === true,
      warning,
      warningTriggerMessage: warningTriggerMessage || null,
      warningTriggeredAfterBalance,
      warningTriggeredTime: warningTriggeredTime || null,
      cellGroupKey,
      balanceStart,
      balanceEnd,
      raw: row
    };
  });
}
