import { ProfileStore } from "./profiles/profileStore";

export type ActualContactorState = "closed" | "open" | "partial" | "unknown";

export type NormalizedContactorState = {
  arrayNumber: number;
  stringNumber: number;
  stringKey: string;
  positiveContactorClosed: boolean | null;
  negativeContactorClosed: boolean | null;
  contactorsCloseExpected: boolean | null;
  requestedState: "closed" | "open" | "unknown";
  actualState: ActualContactorState;
  source: "stringviewer-live";
  sourceUrl: string;
  fetchedAt: string;
  quality: "live" | "failed";
  error?: string | null;
};

type CacheEntry = {
  fetchedAtMs: number;
  data: NormalizedContactorState[];
};

const contactorCache: {
  all: CacheEntry | null;
  byString: Map<string, { fetchedAtMs: number; data: NormalizedContactorState }>;
} = {
  all: null,
  byString: new Map()
};

let contactorRefreshInFlight: Promise<{
  states: NormalizedContactorState[];
  summary: ReturnType<typeof summarize>;
}> | null = null;

let lastContactorRefreshError: string | null = null;


const DEFAULT_TTL_MS = 2500;
const DEFAULT_CONCURRENCY = 12;
const DEFAULT_TIMEOUT_MS = 5000;

function strictBool(value: any): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  if (value === null || value === undefined || value === "") return null;

  const text = String(value).trim().toUpperCase();
  if (["TRUE", "1", "CLOSED", "CLOSE", "ON"].includes(text)) return true;
  if (["FALSE", "0", "OPEN", "OPENED", "OFF"].includes(text)) return false;

  return null;
}

function stateFromFeedback(pos: boolean | null, neg: boolean | null): ActualContactorState {
  if (pos === true && neg === true) return "closed";
  if (pos === false && neg === false) return "open";
  if (pos !== null || neg !== null) return "partial";
  return "unknown";
}

function buildStringKey(arrayNumber: number, stringNumber: number): string {
  return `A${arrayNumber}-S${stringNumber}`;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker())
  );

  return results;
}

export function normalizeContactorStateFromStringviewer(
  arrayNumber: number,
  stringNumber: number,
  sourceUrl: string,
  raw: any
): NormalizedContactorState {
  const model = raw?.stringViewerDataModel ?? raw;
  const positiveContactorClosed = strictBool(model?.positiveContactorClosed);
  const negativeContactorClosed = strictBool(model?.negativeContactorClosed);
  const contactorsCloseExpected = strictBool(model?.contactorsCloseExpected);
  const requestedState =
    contactorsCloseExpected === true ? "closed" :
    contactorsCloseExpected === false ? "open" :
    "unknown";
  const actualState = stateFromFeedback(positiveContactorClosed, negativeContactorClosed);

  return {
    arrayNumber,
    stringNumber,
    stringKey: buildStringKey(arrayNumber, stringNumber),
    positiveContactorClosed,
    negativeContactorClosed,
    contactorsCloseExpected,
    requestedState,
    actualState,
    source: "stringviewer-live",
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    quality: "live",
    error: null
  };
}

function failedState(
  arrayNumber: number,
  stringNumber: number,
  sourceUrl: string,
  error: any
): NormalizedContactorState {
  return {
    arrayNumber,
    stringNumber,
    stringKey: buildStringKey(arrayNumber, stringNumber),
    positiveContactorClosed: null,
    negativeContactorClosed: null,
    contactorsCloseExpected: null,
    requestedState: "unknown",
    actualState: "unknown",
    source: "stringviewer-live",
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    quality: "failed",
    error: error?.message || String(error)
  };
}

export async function getContactorStateForString(
  arrayNumber: number,
  stringNumber: number,
  options: { refresh?: boolean; ttlMs?: number; timeoutMs?: number } = {}
): Promise<NormalizedContactorState> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cacheKey = buildStringKey(arrayNumber, stringNumber);
  const cached = contactorCache.byString.get(cacheKey);

  if (!options.refresh && cached && Date.now() - cached.fetchedAtMs <= ttlMs) {
    return cached.data;
  }

  const profile = ProfileStore.getActiveProfile();
  if (!profile) {
    return failedState(arrayNumber, stringNumber, "", "No active profile");
  }

  const baseUrl = `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}`;
  const sourceUrl = `${baseUrl}/tools/monitor/ems/stringviewer/array/${arrayNumber}/${stringNumber}/data`;

  try {
    const raw = await fetchJsonWithTimeout(sourceUrl, timeoutMs);
    const normalized = normalizeContactorStateFromStringviewer(arrayNumber, stringNumber, sourceUrl, raw);
    contactorCache.byString.set(cacheKey, { fetchedAtMs: Date.now(), data: normalized });
    return normalized;
  } catch (err) {
    const normalized = failedState(arrayNumber, stringNumber, sourceUrl, err);
    contactorCache.byString.set(cacheKey, { fetchedAtMs: Date.now(), data: normalized });
    return normalized;
  }
}

export async function getContactorStatesForAllStrings(
  options: {
    refresh?: boolean;
    ttlMs?: number;
    timeoutMs?: number;
    concurrency?: number;
    arrays?: number[];
    stringsPerArray?: number;
  } = {}
): Promise<{
  states: NormalizedContactorState[];
  summary: {
    total: number;
    open: number;
    closed: number;
    partial: number;
    unknown: number;
    failed: number;
    source: "stringviewer-live";
    fetchedAt: string;
  };
}> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  if (!options.refresh && contactorCache.all && Date.now() - contactorCache.all.fetchedAtMs <= ttlMs) {
    const states = contactorCache.all.data;
    return { states, summary: summarize(states) };
  }

  const arrays = options.arrays ?? [1, 2, 3, 4, 5, 6, 7, 8];
  const stringsPerArray = options.stringsPerArray ?? 40;
  const targets: Array<{ arrayNumber: number; stringNumber: number }> = [];

  for (const arrayNumber of arrays) {
    for (let stringNumber = 1; stringNumber <= stringsPerArray; stringNumber++) {
      targets.push({ arrayNumber, stringNumber });
    }
  }

  const states = await mapWithConcurrency(
    targets,
    options.concurrency ?? DEFAULT_CONCURRENCY,
    ({ arrayNumber, stringNumber }) =>
      getContactorStateForString(arrayNumber, stringNumber, {
        refresh: true,
        ttlMs,
        timeoutMs: options.timeoutMs
      })
  );

  contactorCache.all = { fetchedAtMs: Date.now(), data: states };
  return { states, summary: summarize(states) };
}

export function summarize(states: NormalizedContactorState[]) {
  return {
    total: states.length,
    open: states.filter((s) => s.actualState === "open").length,
    closed: states.filter((s) => s.actualState === "closed").length,
    partial: states.filter((s) => s.actualState === "partial").length,
    unknown: states.filter((s) => s.actualState === "unknown").length,
    failed: states.filter((s) => s.quality === "failed").length,
    source: "stringviewer-live" as const,
    fetchedAt: new Date().toISOString()
  };
}


export function getLatestContactorSnapshot() {
  const now = Date.now();
  const states = contactorCache.all?.data ?? [];
  const ageMs = contactorCache.all ? now - contactorCache.all.fetchedAtMs : null;

  return {
    hasSnapshot: Boolean(contactorCache.all),
    states,
    summary: summarize(states),
    ageMs,
    fetchedAtMs: contactorCache.all?.fetchedAtMs ?? null,
    inFlight: Boolean(contactorRefreshInFlight),
    lastError: lastContactorRefreshError
  };
}

export function triggerContactorRefresh(
  options: {
    ttlMs?: number;
    timeoutMs?: number;
    concurrency?: number;
    arrays?: number[];
    stringsPerArray?: number;
  } = {}
): Promise<{
  states: NormalizedContactorState[];
  summary: ReturnType<typeof summarize>;
}> {
  if (contactorRefreshInFlight) {
    return contactorRefreshInFlight;
  }

  contactorRefreshInFlight = getContactorStatesForAllStrings({
    refresh: true,
    ttlMs: options.ttlMs ?? DEFAULT_TTL_MS,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
    arrays: options.arrays,
    stringsPerArray: options.stringsPerArray
  })
    .then((result) => {
      lastContactorRefreshError = null;
      return result;
    })
    .catch((err) => {
      lastContactorRefreshError = err?.message || String(err);
      throw err;
    })
    .finally(() => {
      contactorRefreshInFlight = null;
    }) as Promise<{
      states: NormalizedContactorState[];
      summary: ReturnType<typeof summarize>;
    }>;

  return contactorRefreshInFlight;
}

export function getContactorEngineStatus() {
  const snapshot = getLatestContactorSnapshot();

  return {
    ...snapshot,
    stateCount: snapshot.states.length,
    summary: snapshot.summary
  };
}

export function mergeContactorStateIntoStringRow(row: any, state: NormalizedContactorState | undefined): any {
  if (!state) {
    return {
      ...row,
      contactor: {
        actualState: "unknown",
        source: "stringviewer-live",
        quality: "failed"
      },
      positiveContactorClosed: null,
      negativeContactorClosed: null,
      bothContactorsClosed: null,
      contactorStatus: "UNKNOWN",
      actualContactorStateSource: "contactor-engine-missing"
    };
  }

  const closed = state.actualState === "closed";
  const open = state.actualState === "open";

  return {
    ...row,
    contactor: state,
    positiveContactorClosed: state.positiveContactorClosed,
    negativeContactorClosed: state.negativeContactorClosed,
    contactorsCloseExpected: state.contactorsCloseExpected,
    requestedContactorState: state.requestedState,
    bothContactorsClosed: closed ? true : open ? false : null,
    contactorsClosed: closed ? true : open ? false : null,
    contactorStatus:
      state.actualState === "closed" ? "CLOSED" :
      state.actualState === "open" ? "OPEN" :
      state.actualState === "partial" ? "PARTIAL" :
      "UNKNOWN",
    contactorState:
      state.actualState === "closed" ? "CLOSED" :
      state.actualState === "open" ? "OPEN" :
      state.actualState === "partial" ? "PARTIAL" :
      "UNKNOWN",
    stringContactorState:
      state.actualState === "closed" ? "CLOSED" :
      state.actualState === "open" ? "OPEN" :
      state.actualState === "partial" ? "PARTIAL" :
      "UNKNOWN",
    actualContactorStateSource: "contactor-engine"
  };
}
