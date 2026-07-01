import { getEmsCachedArrayReports, getEmsCachedLastCall, getEmsCachedBlock } from "../emsTurtleClient";
import { getCachedStringDetail } from "../stringsDashboard";

interface LkgState {
  positiveContactorClosed: boolean;
  negativeContactorClosed: boolean;
  pollAge: number;
  timestamp: number;
}

const lkgStates = new Map<string, LkgState>();

type CandidateSource =
  | "detailed-last-call-string-data"
  | "string-detail"
  | "array-report"
  | "last-call"
  | "last-known-good"
  | "block-summary-per-string-fallback"
  | "contactor-state-fallback";

function pN(val: any, def: number | null = null): number | null {
  if (val === undefined || val === null || val === "") return def;
  const n = Number(val);
  return Number.isFinite(n) ? n : def;
}

function parseContactorBoolean(val: any): boolean | null {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "boolean") return val;
  const s = String(val).toUpperCase().trim();
  if (["TRUE", "1", "CLOSED", "CLOSE", "ON", "YES"].includes(s)) return true;
  if (["FALSE", "0", "OPEN", "OFF", "NO"].includes(s)) return false;
  return null;
}

function extractContactorFields(obj: any) {
  if (!obj) return { pos: null, neg: null, exp: null, comm: null, state: null };

  const rawPos = obj.positiveContactorClosed
    ?? obj.posContactorClosed
    ?? obj.positiveClosed
    ?? obj.contactorPositiveFeedback
    ?? obj.positive_contactor_closed
    ?? obj.PositiveContactorClosed
    ?? null;

  const rawNeg = obj.negativeContactorClosed
    ?? obj.negContactorClosed
    ?? obj.negativeClosed
    ?? obj.contactorNegativeFeedback
    ?? obj.negative_contactor_closed
    ?? obj.NegativeContactorClosed
    ?? null;

  const rawExp = obj.contactorsCloseExpected
    ?? obj.closeExpected
    ?? obj.expectedClosed
    ?? obj.CloseExpected
    ?? obj.contactors_close_expected
    ?? obj.ContactorsCloseExpected
    ?? null;

  const rawComm = obj.stringConnectionState
    ?? obj.connectionState
    ?? obj.StringConnectionState
    ?? obj.communicating
    ?? obj.string_connection_state
    ?? null;

  const rawState = obj.stringContactorState
    ?? obj.contactorState
    ?? obj.StringContactorState
    ?? obj.contactorStatus
    ?? obj.string_contactor_state
    ?? null;

  return {
    pos: parseContactorBoolean(rawPos),
    neg: parseContactorBoolean(rawNeg),
    exp: parseContactorBoolean(rawExp),
    comm: rawComm !== undefined && rawComm !== null && rawComm !== "" ? String(rawComm) : null,
    state: rawState !== undefined && rawState !== null && rawState !== "" ? String(rawState) : null
  };
}

function isTimestampFresh(ts: string | number | null): boolean {
  if (!ts) return true;
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return true;
    return Date.now() - d.getTime() <= 5 * 60 * 1000;
  } catch {
    return true;
  }
}

function unwrapCachedData(wrapper: any): any {
  const data = wrapper?.data ?? wrapper;
  if (data?.data && typeof data.data === "object") return data.data;
  return data;
}

function normalizeReportEntry(entry: any): any {
  if (!entry) return null;
  return entry.stringData ?? entry.data?.stringData ?? entry.data ?? entry;
}

function matchesArrayNumber(value: any, arrayNumber: number): boolean {
  return pN(value?.arrayNumber ?? value?.arrayIndex ?? value?.array ?? value?.index ?? value?.id) === arrayNumber;
}

function matchesStringNumber(value: any, stringNumber: number): boolean {
  return pN(value?.stringNumber ?? value?.stringIndex ?? value?.string ?? value?.index ?? value?.id) === stringNumber;
}

function getIndexedReport(container: any, index: number): { entry: any; pathPart: string } | null {
  if (!container) return null;

  const exactKeys = [String(index), `string${index}`, `String${index}`, `S${index}`, `s${index}`];
  for (const key of exactKeys) {
    if (container[key] !== undefined) return { entry: container[key], pathPart: key };
  }

  if (Array.isArray(container)) {
    const direct = container.find((item: any) => matchesStringNumber(item, index) || pN(item?.stringData?.stringNumber ?? item?.stringData?.stringIndex ?? item?.stringData?.string) === index);
    if (direct) return { entry: direct, pathPart: `[match:${index}]` };
    if (container[index] !== undefined) return { entry: container[index], pathPart: `[${index}]` };
    if (container[index - 1] !== undefined) return { entry: container[index - 1], pathPart: `[${index - 1}]` };
    return null;
  }

  if (typeof container === "object") {
    for (const [key, value] of Object.entries(container)) {
      const sData = normalizeReportEntry(value);
      if (matchesStringNumber(sData, index) || pN(key) === index) {
        return { entry: value, pathPart: key };
      }
    }
  }

  return null;
}

function getArrayReport(container: any, arrayNumber: number): { entry: any; pathPart: string } | null {
  if (!container) return null;

  const exactKeys = [String(arrayNumber), `array${arrayNumber}`, `Array${arrayNumber}`, `A${arrayNumber}`, `a${arrayNumber}`];
  for (const key of exactKeys) {
    if (container[key] !== undefined) return { entry: container[key], pathPart: key };
  }

  if (Array.isArray(container)) {
    const direct = container.find((item: any) => matchesArrayNumber(item, arrayNumber) || matchesArrayNumber(item?.arrayData, arrayNumber));
    if (direct) return { entry: direct, pathPart: `[match:${arrayNumber}]` };
    if (container[arrayNumber] !== undefined) return { entry: container[arrayNumber], pathPart: `[${arrayNumber}]` };
    if (container[arrayNumber - 1] !== undefined) return { entry: container[arrayNumber - 1], pathPart: `[${arrayNumber - 1}]` };
    return null;
  }

  if (typeof container === "object") {
    for (const [key, value] of Object.entries(container)) {
      const candidate = (value as any)?.arrayData ?? value;
      if (matchesArrayNumber(candidate, arrayNumber) || pN(key) === arrayNumber) {
        return { entry: value, pathPart: key };
      }
    }
  }

  return null;
}

function getStringFromArrayReport(arrayEntry: any, stringNumber: number): { data: any; pathPart: string } | null {
  const arrayData = arrayEntry?.arrayData ?? arrayEntry;
  const reports = arrayEntry?.stringReport
    ?? arrayData?.stringReport
    ?? arrayEntry?.strings
    ?? arrayData?.strings
    ?? null;

  const stringEntry = getIndexedReport(reports, stringNumber);
  if (!stringEntry) return null;

  const data = normalizeReportEntry(stringEntry.entry);
  if (!data) return null;

  return { data, pathPart: `${stringEntry.pathPart}${stringEntry.entry?.stringData ? ".stringData" : ""}` };
}

function getBlockString(blockData: any, arrayNumber: number, stringNumber: number): { data: any; pathPart: string } | null {
  if (!blockData) return null;

  if (Array.isArray(blockData.strings)) {
    const direct = blockData.strings.find((str: any) => matchesArrayNumber(str, arrayNumber) && matchesStringNumber(str, stringNumber));
    if (direct) return { data: direct, pathPart: "strings[match]" };
  }

  const arrays = blockData.arrays ?? blockData.blockReport?.arrays ?? blockData.statusReport?.arrays ?? null;
  const arrayEntry = getArrayReport(arrays, arrayNumber);
  if (!arrayEntry) return null;

  const stringEntry = getStringFromArrayReport(arrayEntry.entry, stringNumber);
  if (!stringEntry) return null;

  return { data: stringEntry.data, pathPart: `arrays.${arrayEntry.pathPart}.${stringEntry.pathPart}` };
}

function pushCandidate(
  candidates: Array<ContactorResolutionCandidate & { hasExplicit: boolean; isFresh: boolean }>,
  source: CandidateSource,
  sourcePath: string,
  timestamp: string | number | null,
  data: any
) {
  if (!data) return;
  const fields = extractContactorFields(data);
  const hasExplicit = fields.pos !== null || fields.neg !== null;
  const isFresh = isTimestampFresh(timestamp);
  candidates.push({
    source,
    sourcePath,
    timestamp: timestamp ? new Date(timestamp).toISOString() : null,
    positiveContactorClosed: fields.pos,
    negativeContactorClosed: fields.neg,
    contactorsCloseExpected: fields.exp,
    stringConnectionState: fields.comm,
    stringContactorState: fields.state,
    hasExplicit,
    isFresh,
    accepted: false,
    rejectedReason: null
  });
}

export interface ContactorResolutionCandidate {
  source: CandidateSource;
  sourcePath: string;
  timestamp: string | null;
  positiveContactorClosed: boolean | null;
  negativeContactorClosed: boolean | null;
  contactorsCloseExpected: boolean | null;
  stringConnectionState: string | null;
  stringContactorState: string | null;
  accepted: boolean;
  rejectedReason: string | null;
}

export interface ContactorResolutionResult {
  positiveContactorClosed: boolean | null;
  negativeContactorClosed: boolean | null;
  contactorsCloseExpected: boolean | null;
  bothContactorsClosed: boolean | null;
  contactorClosed: boolean | null;
  contactorStatus: "CLOSED" | "OPEN" | "UNKNOWN";
  stringConnectionState?: string | null;
  stringContactorState?: string | null;
  sourceDebug: {
    contactorResolution: {
      finalSource: string;
      finalSourcePath: string;
      candidates: ContactorResolutionCandidate[];
    }
  };
}

export function resolvePrioritizedContactors(arrayNumber: number, stringNumber: number, rawRow?: any): ContactorResolutionResult {
  const key = `A${arrayNumber}-S${stringNumber}`;
  const candidates: Array<ContactorResolutionCandidate & { hasExplicit: boolean; isFresh: boolean }> = [];

  if (rawRow) {
    const sourceName: CandidateSource = rawRow.source === "detailed-last-call-string-data" ? "detailed-last-call-string-data" :
      rawRow.source === "string-detail" ? "string-detail" :
      rawRow.source === "array-report" ? "array-report" :
      rawRow.source === "last-call" ? "last-call" :
      rawRow.source === "last-known-good" ? "last-known-good" :
      "block-summary-per-string-fallback";
    pushCandidate(candidates, sourceName, rawRow.sourcePath || "/rawRow-input", rawRow.timestampUtc || rawRow.sourceTimestampUtc || null, rawRow);
  }

  const lastCallWrapper = getEmsCachedLastCall();
  const lastCallData = unwrapCachedData(lastCallWrapper);
  const lastCallTimestamp = lastCallWrapper?.lastUpdated ?? lastCallData?.timeStamp ?? lastCallData?.timestamp ?? lastCallData?.blockReport?.timeStamp ?? null;

  const blockReport = lastCallData?.blockReport ?? lastCallData;
  const lastCallArrayReport = getArrayReport(blockReport?.arrayReport, arrayNumber);
  if (lastCallArrayReport) {
    const stringEntry = getStringFromArrayReport(lastCallArrayReport.entry, stringNumber);
    if (stringEntry) {
      pushCandidate(
        candidates,
        "detailed-last-call-string-data",
        `blockReport.arrayReport.${lastCallArrayReport.pathPart}.stringReport.${stringEntry.pathPart}`,
        lastCallTimestamp,
        stringEntry.data
      );
    }
  }

  const detail = getCachedStringDetail(arrayNumber, stringNumber);
  if (detail && detail.ok) {
    const sData = detail.data?.stringViewerDataModel ?? detail.data?.stringData ?? detail.data ?? null;
    pushCandidate(
      candidates,
      "string-detail",
      detail.endpoint || `/tools/report/ems/array/${arrayNumber}/string/${stringNumber}/report.json`,
      detail.lastUpdated || sData?.timeStamp || sData?.timestamp || null,
      sData
    );
  }

  const arrayReports = getEmsCachedArrayReports() || {};
  const cachedArray = arrayReports[arrayNumber] ?? arrayReports[String(arrayNumber)];
  const arrayReportData = unwrapCachedData(cachedArray);
  if (arrayReportData) {
    const stringEntry = getStringFromArrayReport(arrayReportData, stringNumber);
    if (stringEntry) {
      pushCandidate(
        candidates,
        "array-report",
        `${cachedArray?.endpoint || `/tools/report/ems/array/${arrayNumber}/report.json`}.${stringEntry.pathPart}`,
        arrayReportData.timeStamp || arrayReportData.timestamp || cachedArray?.lastUpdated || null,
        stringEntry.data
      );
    }
  }

  let lcStr: any = null;
  if (Array.isArray(lastCallData?.strings)) {
    lcStr = lastCallData.strings.find((str: any) => matchesArrayNumber(str, arrayNumber) && matchesStringNumber(str, stringNumber));
  }
  if (!lcStr && Array.isArray(lastCallData?.arrays)) {
    const lcA = lastCallData.arrays.find((arr: any) => matchesArrayNumber(arr, arrayNumber));
    if (lcA && Array.isArray(lcA.strings)) {
      lcStr = lcA.strings.find((str: any) => matchesStringNumber(str, stringNumber));
    }
  }
  if (lcStr) {
    pushCandidate(candidates, "last-call", "/tools/report/ems/lastCall.json", lastCallTimestamp, lcStr);
  }

  const lkg = lkgStates.get(key);
  if (lkg && lkg.pollAge < 3) {
    candidates.push({
      source: "last-known-good",
      sourcePath: "prizm-stable-last-known-good",
      timestamp: new Date(lkg.timestamp).toISOString(),
      positiveContactorClosed: lkg.positiveContactorClosed,
      negativeContactorClosed: lkg.negativeContactorClosed,
      contactorsCloseExpected: null,
      stringConnectionState: null,
      stringContactorState: null,
      hasExplicit: true,
      isFresh: true,
      accepted: false,
      rejectedReason: null
    });
  }

  const blockWrapper = getEmsCachedBlock();
  const blockData = unwrapCachedData(blockWrapper);
  const blockString = getBlockString(blockData, arrayNumber, stringNumber);
  if (blockString) {
    pushCandidate(
      candidates,
      "block-summary-per-string-fallback",
      `/tools/monitor/ems/blockviewer/data.${blockString.pathPart}`,
      blockWrapper?.lastUpdated || blockData?.timeStamp || blockData?.timestamp || null,
      blockString.data
    );
  }

  let derivedState: string | null = null;
  let derivedSourcePath = "unknown";
  for (const cand of candidates) {
    if (cand.stringContactorState) {
      const sUpper = cand.stringContactorState.toUpperCase().trim();
      if (sUpper === "CLOSED" || sUpper === "OPEN") {
        derivedState = sUpper;
        derivedSourcePath = cand.sourcePath;
        break;
      }
    }
  }
  if (derivedState) {
    const closed = derivedState === "CLOSED";
    candidates.push({
      source: "contactor-state-fallback",
      sourcePath: derivedSourcePath,
      timestamp: null,
      positiveContactorClosed: closed,
      negativeContactorClosed: closed,
      contactorsCloseExpected: null,
      stringConnectionState: null,
      stringContactorState: derivedState,
      hasExplicit: true,
      isFresh: true,
      accepted: false,
      rejectedReason: null
    });
  }

  const detailedLastCallCand = candidates.find(c => c.source === "detailed-last-call-string-data" && c.hasExplicit && c.isFresh);
  const detailCand = candidates.find(c => c.source === "string-detail" && c.hasExplicit && c.isFresh);
  const arrayRepCand = candidates.find(c => c.source === "array-report" && c.hasExplicit && c.isFresh);
  const lastCallCand = candidates.find(c => c.source === "last-call" && c.hasExplicit && c.isFresh);
  const lkgCand = candidates.find(c => c.source === "last-known-good" && c.hasExplicit);
  const blockCand = candidates.find(c => c.source === "block-summary-per-string-fallback" && c.hasExplicit);
  const stateFallbackCand = candidates.find(c => c.source === "contactor-state-fallback");

  const winner = detailedLastCallCand
    ?? detailCand
    ?? arrayRepCand
    ?? lastCallCand
    ?? lkgCand
    ?? blockCand
    ?? stateFallbackCand
    ?? null;

  if (winner) {
    winner.accepted = true;
    const isHighPriority = ["detailed-last-call-string-data", "string-detail", "array-report", "last-call"].includes(winner.source);
    const resolvedClosed = winner.positiveContactorClosed === true && winner.negativeContactorClosed === true;
    const resolvedOpen = winner.positiveContactorClosed === false && winner.negativeContactorClosed === false;

    if (isHighPriority && resolvedClosed) {
      lkgStates.set(key, {
        positiveContactorClosed: true,
        negativeContactorClosed: true,
        pollAge: 0,
        timestamp: Date.now()
      });
    } else if (isHighPriority && resolvedOpen) {
      lkgStates.delete(key);
    } else if (winner.source === "last-known-good") {
      const state = lkgStates.get(key);
      if (state) state.pollAge += 1;
    }
  }

  for (const cand of candidates) {
    if (cand === winner) continue;
    if (!cand.hasExplicit) {
      cand.rejectedReason = "rejected (missing explicit feedback)";
    } else if (!cand.isFresh) {
      cand.rejectedReason = "rejected (stale timestamp)";
    } else if (cand.source === "block-summary-per-string-fallback" && winner && winner.source !== "block-summary-per-string-fallback") {
      cand.rejectedReason = "rejected (lower-priority conflict)";
    } else {
      cand.rejectedReason = "rejected (superseded by higher-priority source)";
    }
  }

  const finalPos = winner ? winner.positiveContactorClosed : null;
  const finalNeg = winner ? winner.negativeContactorClosed : null;
  const finalExp = winner ? winner.contactorsCloseExpected : null;
  const finalComm = winner ? winner.stringConnectionState : null;
  const finalState = winner ? winner.stringContactorState : null;

  const bothContactorsClosed = finalPos === true && finalNeg === true
    ? true
    : (finalPos === false || finalNeg === false ? false : null);

  const contactorClosed = bothContactorsClosed;

  let contactorStatus: "CLOSED" | "OPEN" | "UNKNOWN" = "UNKNOWN";
  if (bothContactorsClosed === true) contactorStatus = "CLOSED";
  else if (bothContactorsClosed === false) contactorStatus = "OPEN";

  const cleanCandidates: ContactorResolutionCandidate[] = candidates.map(c => ({
    source: c.source,
    sourcePath: c.sourcePath,
    timestamp: c.timestamp,
    positiveContactorClosed: c.positiveContactorClosed,
    negativeContactorClosed: c.negativeContactorClosed,
    contactorsCloseExpected: c.contactorsCloseExpected,
    stringConnectionState: c.stringConnectionState,
    stringContactorState: c.stringContactorState,
    accepted: c.accepted,
    rejectedReason: c.rejectedReason
  }));

  return {
    positiveContactorClosed: finalPos,
    negativeContactorClosed: finalNeg,
    contactorsCloseExpected: finalExp,
    bothContactorsClosed,
    contactorClosed,
    contactorStatus,
    stringConnectionState: finalComm,
    stringContactorState: finalState,
    sourceDebug: {
      contactorResolution: {
        finalSource: winner ? winner.source : "unknown",
        finalSourcePath: winner ? winner.sourcePath : "unknown",
        candidates: cleanCandidates
      }
    }
  };
}
