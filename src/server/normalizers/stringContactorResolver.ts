import { getEmsCachedArrayReports, getEmsCachedLastCall, getEmsCachedBlock } from "../emsTurtleClient";
import { getCachedStringDetail } from "../stringsDashboard";

interface LkgState {
  positiveContactorClosed: boolean;
  negativeContactorClosed: boolean;
  pollAge: number;
  timestamp: number;
}

// Memory persistence for last-known-good resolved contactor states (up to 3 polls)
const lkgStates = new Map<string, LkgState>();

function pN(val: any, def: number | null = null): number | null {
  if (val === undefined || val === null || val === "") return def;
  const n = Number(val);
  return isNaN(n) ? def : n;
}

function parseContactorBoolean(val: any): boolean | null {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "boolean") return val;
  const s = String(val).toUpperCase().trim();
  if (s === "TRUE" || s === "1" || s === "CLOSED" || s === "ON") return true;
  if (s === "FALSE" || s === "0" || s === "OPEN" || s === "OFF") return false;
  return null;
}

function extractContactorFields(obj: any) {
  if (!obj) return { pos: null, neg: null, exp: null, comm: null, state: null };

  const rawPos = obj.positiveContactorClosed ?? obj.posContactorClosed ?? obj.positiveClosed ?? obj.contactorPositiveFeedback ?? obj.positive_contactor_closed ?? null;
  const rawNeg = obj.negativeContactorClosed ?? obj.negContactorClosed ?? obj.negativeClosed ?? obj.contactorNegativeFeedback ?? obj.negative_contactor_closed ?? null;
  
  const rawExp = obj.contactorsCloseExpected ?? obj.closeExpected ?? obj.expectedClosed ?? obj.CloseExpected ?? obj.contactors_close_expected ?? null;
  const rawComm = obj.stringConnectionState ?? obj.connectionState ?? obj.communicating ?? obj.string_connection_state ?? null;
  const rawState = obj.stringContactorState ?? obj.contactorState ?? obj.contactorStatus ?? obj.string_contactor_state ?? null;

  return {
    pos: parseContactorBoolean(rawPos),
    neg: parseContactorBoolean(rawNeg),
    exp: parseContactorBoolean(rawExp),
    comm: rawComm ? String(rawComm) : null,
    state: rawState ? String(rawState) : null
  };
}

function isTimestampFresh(ts: string | number | null): boolean {
  if (!ts) return true; // Default to true if not specified so we don't discard valid data
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return true;
    const ageMs = Date.now() - d.getTime();
    return ageMs <= 5 * 60 * 1000; // 5 minutes freshness window
  } catch {
    return true;
  }
}

export interface ContactorResolutionCandidate {
  source: "detailed-last-call-string-data" | "string-detail" | "array-report" | "last-call" | "last-known-good" | "block-summary-per-string-fallback" | "contactor-state-fallback";
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

/**
 * Resolves the prioritized contactor readback state for a given string
 */
export function resolvePrioritizedContactors(arrayNumber: number, stringNumber: number, rawRow?: any): ContactorResolutionResult {
  const key = `A${arrayNumber}-S${stringNumber}`;
  const candidates: Array<ContactorResolutionCandidate & { hasExplicit: boolean; isFresh: boolean }> = [];

  // 0. Extract rawRow as a candidate first if passed
  if (rawRow) {
    const fields = extractContactorFields(rawRow);
    const sourceName = rawRow.source === "detailed-last-call-string-data" ? "detailed-last-call-string-data" :
                       rawRow.source === "string-detail" ? "string-detail" : 
                       rawRow.source === "array-report" ? "array-report" : 
                       rawRow.source === "last-call" ? "last-call" : 
                       rawRow.source === "last-known-good" ? "last-known-good" : "block-summary-per-string-fallback";
    
    candidates.push({
      source: sourceName,
      sourcePath: rawRow.sourcePath || "/rawRow-input",
      timestamp: rawRow.timestampUtc || rawRow.sourceTimestampUtc || null,
      positiveContactorClosed: fields.pos,
      negativeContactorClosed: fields.neg,
      contactorsCloseExpected: fields.exp,
      stringConnectionState: fields.comm,
      stringContactorState: fields.state,
      hasExplicit: fields.pos !== null || fields.neg !== null,
      isFresh: true,
      accepted: false,
      rejectedReason: null
    });
  }

  // 1. Detailed last-call Candidate (blockReport.arrayReport.<array>.stringReport.<string>.stringData)
  const lastCallWrapper = getEmsCachedLastCall();
  if (lastCallWrapper && lastCallWrapper.data) {
    const blockReport = lastCallWrapper.data.blockReport || lastCallWrapper.data;
    const arrayRep = blockReport?.arrayReport?.[arrayNumber] ?? blockReport?.arrayReport?.[String(arrayNumber)];
    const stringRep = arrayRep?.stringReport?.[stringNumber] ?? arrayRep?.stringReport?.[String(stringNumber)];
    const sData = stringRep?.stringData;
    if (sData) {
      const fields = extractContactorFields(sData);
      const timestamp = lastCallWrapper.lastUpdated || null;
      const hasExplicit = fields.pos !== null || fields.neg !== null;
      const isFresh = isTimestampFresh(timestamp);

      candidates.push({
        source: "detailed-last-call-string-data",
        sourcePath: `blockReport.arrayReport.${arrayNumber}.stringReport.${stringNumber}.stringData`,
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
  }

  // 2. string-detail Candidate
  const detail = getCachedStringDetail(arrayNumber, stringNumber);
  if (detail && detail.ok) {
    const sData = detail.data?.stringViewerDataModel ?? detail.data?.stringData ?? detail.data ?? null;
    if (sData) {
      const fields = extractContactorFields(sData);
      const timestamp = detail.lastUpdated || sData.timeStamp || sData.timestamp || null;
      const hasExplicit = fields.pos !== null || fields.neg !== null;
      const isFresh = isTimestampFresh(timestamp);
      
      candidates.push({
        source: "string-detail",
        sourcePath: detail.endpoint || `/tools/report/ems/array/${arrayNumber}/string/${stringNumber}/report.json`,
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
  }

  // 3. array-report Candidate
  const arrayReports = getEmsCachedArrayReports() || {};
  const arrayRep = arrayReports[arrayNumber]?.data;
  if (arrayRep) {
    const sData = arrayRep.stringReport?.[stringNumber]?.stringData ?? 
                  arrayRep.stringReport?.[`string${stringNumber}`]?.stringData ?? null;
    if (sData) {
      const fields = extractContactorFields(sData);
      const timestamp = arrayRep.timeStamp || arrayRep.timestamp || arrayReports[arrayNumber]?.lastUpdated || null;
      const hasExplicit = fields.pos !== null || fields.neg !== null;
      const isFresh = isTimestampFresh(timestamp);

      candidates.push({
        source: "array-report",
        sourcePath: arrayReports[arrayNumber]?.endpoint || `/tools/report/ems/array/${arrayNumber}/report.json`,
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
  }

  // 4. last-call Candidate (standard arrays/strings)
  if (lastCallWrapper && lastCallWrapper.data) {
    let lcStr: any = null;
    const lastCallStrings = lastCallWrapper.data.strings;
    const lastCallArrays = lastCallWrapper.data.arrays;
    if (Array.isArray(lastCallStrings)) {
      lcStr = lastCallStrings.find((str: any) => pN(str.array) === arrayNumber && pN(str.string) === stringNumber);
    }
    if (!lcStr && Array.isArray(lastCallArrays)) {
      const lcA = lastCallArrays.find((arr: any) => pN(arr.index || arr.arrayIndex) === arrayNumber);
      if (lcA && Array.isArray(lcA.strings)) {
        lcStr = lcA.strings.find((str: any) => pN(str.index || str.stringIndex) === stringNumber);
      }
    }
    if (lcStr) {
      const fields = extractContactorFields(lcStr);
      const timestamp = lastCallWrapper.lastUpdated || null;
      const hasExplicit = fields.pos !== null || fields.neg !== null;
      const isFresh = isTimestampFresh(timestamp);

      candidates.push({
        source: "last-call",
        sourcePath: "/tools/report/ems/lastCall.json",
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
  }

  // 5. last-known-good Candidate
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

  // 6. block-summary-per-string-fallback Candidate
  const blockWrapper = getEmsCachedBlock();
  if (blockWrapper && blockWrapper.data && Array.isArray(blockWrapper.data.strings)) {
    const blockStr = blockWrapper.data.strings.find((str: any) => pN(str.array) === arrayNumber && pN(str.string) === stringNumber);
    if (blockStr) {
      const fields = extractContactorFields(blockStr);
      const timestamp = blockWrapper.lastUpdated || null;

      candidates.push({
        source: "block-summary-per-string-fallback",
        sourcePath: "/tools/monitor/ems/blockviewer/data",
        timestamp: timestamp ? new Date(timestamp).toISOString() : null,
        positiveContactorClosed: fields.pos,
        negativeContactorClosed: fields.neg,
        contactorsCloseExpected: fields.exp,
        stringConnectionState: fields.comm,
        stringContactorState: fields.state,
        hasExplicit: fields.pos !== null || fields.neg !== null,
        isFresh: true,
        accepted: false,
        rejectedReason: null
      });
    }
  }

  // 7. contactor-state-fallback Candidate
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

  // Determine the winner among candidate sources by priority
  let winner: (ContactorResolutionCandidate & { hasExplicit: boolean; isFresh: boolean }) | null = null;

  const detailedLastCallCand = candidates.find(c => c.source === "detailed-last-call-string-data");
  const detailCand = candidates.find(c => c.source === "string-detail");
  const arrayRepCand = candidates.find(c => c.source === "array-report");
  const lastCallCand = candidates.find(c => c.source === "last-call");
  const lkgCand = candidates.find(c => c.source === "last-known-good");
  const blockCand = candidates.find(c => c.source === "block-summary-per-string-fallback");
  const stateFallbackCand = candidates.find(c => c.source === "contactor-state-fallback");

  if (detailedLastCallCand && detailedLastCallCand.hasExplicit && detailedLastCallCand.isFresh) {
    winner = detailedLastCallCand;
  } else if (detailCand && detailCand.hasExplicit && detailCand.isFresh) {
    winner = detailCand;
  } else if (arrayRepCand && arrayRepCand.hasExplicit && arrayRepCand.isFresh) {
    winner = arrayRepCand;
  } else if (lastCallCand && lastCallCand.hasExplicit && lastCallCand.isFresh) {
    winner = lastCallCand;
  } else if (lkgCand && lkgCand.hasExplicit) {
    winner = lkgCand;
  } else if (blockCand && blockCand.hasExplicit) {
    winner = blockCand;
  } else if (stateFallbackCand) {
    winner = stateFallbackCand;
  }

  // If we selected a high-priority source and it resolved to CLOSED (true, true),
  // persist it in our last-known-good Map
  if (winner) {
    winner.accepted = true;
    
    const isHighPriority = winner.source === "detailed-last-call-string-data" || winner.source === "string-detail" || winner.source === "array-report" || winner.source === "last-call";
    const resolvedClosed = winner.positiveContactorClosed === true && winner.negativeContactorClosed === true;
    
    if (isHighPriority && resolvedClosed) {
      lkgStates.set(key, {
        positiveContactorClosed: true,
        negativeContactorClosed: true,
        pollAge: 0,
        timestamp: Date.now()
      });
    } else if (winner.source === "last-known-good") {
      const state = lkgStates.get(key);
      if (state) {
        state.pollAge += 1;
      }
    }
  }

  // Mark other candidates as rejected with appropriate reasons
  for (const cand of candidates) {
    if (cand === winner) continue;
    
    if (!cand.hasExplicit) {
      cand.rejectedReason = "rejected (missing explicit feedback)";
    } else if (!cand.isFresh) {
      cand.rejectedReason = "rejected (stale timestamp)";
    } else if (winner && winner.source === "last-known-good" && cand.source === "block-summary-per-string-fallback") {
      cand.rejectedReason = "rejected (lower-priority conflict)";
    } else {
      cand.rejectedReason = "rejected (superseded by higher-priority source)";
    }
  }

  // Final values
  const finalPos = winner ? winner.positiveContactorClosed : null;
  const finalNeg = winner ? winner.negativeContactorClosed : null;
  const finalExp = winner ? winner.contactorsCloseExpected : null;
  const finalComm = winner ? winner.stringConnectionState : null;
  const finalState = winner ? winner.stringContactorState : null;
  
  const bothContactorsClosed = (finalPos === true && finalNeg === true) ? true : 
                               (finalPos === false || finalNeg === false) ? false : null;
                               
  const contactorClosed = bothContactorsClosed;
  
  let contactorStatus: "CLOSED" | "OPEN" | "UNKNOWN" = "UNKNOWN";
  if (bothContactorsClosed === true) contactorStatus = "CLOSED";
  else if (bothContactorsClosed === false) contactorStatus = "OPEN";

  // Cleanup internal candidate properties before exporting to the clean type
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
