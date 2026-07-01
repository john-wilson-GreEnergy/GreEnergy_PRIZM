import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef, useMemo } from 'react';

export interface SiteDataContextType {
  snapshot: any | null;
  activeTopologyProfile: any | null;
  siteIdentity: any | null;
  liveStatus: any | null;
  sourceHealth: any[] | null;
  sourceHealthSummary: any | null;
  isInitialLoading: boolean;
  lastUpdated: string | null;
  refreshNow: (force?: boolean) => Promise<void>;
  error: Error | null;
  dataQualityWarning: string | null;
  isPollingEnabled: boolean;
  isTerminated: boolean;
  pausePolling: () => void;
  resumePolling: () => void;
  terminateConnection: () => void;
  consecutiveFailureCount: number;
  consecutiveDegradedCount: number;
  lastPollAttemptedAt: string | null;
  lastGoodSnapshotAt: string | null;
}

const SiteDataContext = createContext<SiteDataContextType | null>(null);

function countArrayDetailStrings(snapshot: any): number {
  return (Object.values(snapshot?.normalized?.arrayDetailsByArray || {}) as any[])
    .reduce((sum: number, arr: any) => sum + ((arr?.strings || []).length), 0);
}

function getSnapshotQuality(snapshot: any) {
  return {
    normalizedStrings: snapshot?.normalized?.strings?.length || 0,
    stringSummaryRows: snapshot?.rollups?.stringSummary?.tableRows?.length || 0,
    arraySummaryRows: snapshot?.rollups?.arraySummary?.length || 0,
    arrayDetailStringTotal: countArrayDetailStrings(snapshot),
    hasNormalized: !!snapshot?.normalized,
    hasRollups: !!snapshot?.rollups,
    hasStringSummary: !!snapshot?.rollups?.stringSummary
  };
}

function isRenderableSnapshot(snapshot: any): boolean {
  const q = getSnapshotQuality(snapshot);
  return q.hasNormalized && q.hasRollups && q.hasStringSummary && q.normalizedStrings > 0;
}

function hasArrayZeroFallback(snapshot: any): boolean {
  const summary = snapshot?.rollups?.arraySummary || snapshot?.arrays || [];
  if (summary.length === 1 && (summary[0]?.arrayIndex === 0 || summary[0]?.arrayNumber === 0) && (summary[0]?.stringCount || 0) >= 100) {
    return true;
  }
  return false;
}

function isDegradedComparedToPrevious(next: any, previous: any): { degraded: boolean; reason: string; previousQuality: any; nextQuality: any } {
  const previousQuality = getSnapshotQuality(previous);
  const nextQuality = getSnapshotQuality(next);

  if (hasArrayZeroFallback(next)) {
    return { degraded: true, reason: "Rejected synthesized Array 0 fallback; preserving last-known-good array summary.", previousQuality, nextQuality };
  }

  if (!previous || !isRenderableSnapshot(previous)) {
    return { degraded: false, reason: "no previous renderable snapshot", previousQuality, nextQuality };
  }

  if (!isRenderableSnapshot(next)) {
    return { degraded: true, reason: "next snapshot is not renderable", previousQuality, nextQuality };
  }

  if (previousQuality.normalizedStrings >= 100 && nextQuality.normalizedStrings < previousQuality.normalizedStrings * 0.5) {
    return { degraded: true, reason: "normalized string count collapsed", previousQuality, nextQuality };
  }

  if (previousQuality.stringSummaryRows >= 100 && nextQuality.stringSummaryRows < previousQuality.stringSummaryRows * 0.5) {
    return { degraded: true, reason: "string summary rows collapsed", previousQuality, nextQuality };
  }

  if (previousQuality.arrayDetailStringTotal > 0 && nextQuality.arrayDetailStringTotal === 0) {
    return { degraded: true, reason: "array detail strings collapsed to zero", previousQuality, nextQuality };
  }

  if (previousQuality.arraySummaryRows > 0 && nextQuality.arraySummaryRows === 0) {
    return { degraded: true, reason: "array summary rows collapsed to zero", previousQuality, nextQuality };
  }

  return { degraded: false, reason: "snapshot accepted", previousQuality, nextQuality };
}

export const SiteDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [activeTopologyProfile, setActiveTopologyProfile] = useState<any | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const [dataQualityWarning, setDataQualityWarning] = useState<string | null>(null);
  const [isPollingEnabled, setIsPollingEnabled] = useState(true);
  const [isTerminated, setIsTerminated] = useState(false);
  const [lastPollAttemptedAt, setLastPollAttemptedAt] = useState<string | null>(null);
  const [lastGoodSnapshotAt, setLastGoodSnapshotAt] = useState<string | null>(null);
  const [consecutiveFailureCount, setConsecutiveFailureCount] = useState<number>(0);
  const [consecutiveDegradedCount, setConsecutiveDegradedCount] = useState<number>(0);

  const isFetchingRef = useRef(false);
  const snapshotRef = useRef<any>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const fetchSnapshot = useCallback(async (force = false) => {
    if (isTerminated) {
      console.warn("[SiteDataContext] Fetch skipped: connection is manually terminated");
      return;
    }
    if (isFetchingRef.current) {
      console.warn("[SiteDataContext] Fetch skipped: overlapping request in progress");
      return;
    }

    isFetchingRef.current = true;
    setLastPollAttemptedAt(new Date().toISOString());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 10000); // 10 second timeout

    try {
      const qs = force ? '?refresh=true' : '';
      const [response, topoResponse] = await Promise.all([
        fetch(`/api/local/site-data/snapshot${qs}`, { signal: controller.signal }),
        fetch('/api/local/topology/active', { signal: controller.signal })
      ]);
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch site data: ${response.statusText}`);
      }
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        // NGINX Proxy or Vite SPA fallback during restart/warming
        throw new Error("Server is restarting or unreachable");
      }
      
      const data = await response.json();
      if (topoResponse.ok) {
        const topoData = await topoResponse.json();
        if (topoData.success && topoData.profile) {
          setActiveTopologyProfile(topoData.profile);
        }
      }
      const previous = snapshotRef.current;
      const { degraded, reason } = isDegradedComparedToPrevious(data, previous);

      if (degraded && previous && isRenderableSnapshot(previous)) {
        setDataQualityWarning("Latest poll degraded; displaying last known good data.");
        setConsecutiveDegradedCount(prev => prev + 1);
        setError(null); // Clear error since we have a good renderable snapshot
      } else {
        setSnapshot(data);
        const nowStr = new Date().toISOString();
        setLastGoodSnapshotAt(nowStr);
        setLastUpdated(nowStr);
        setError(null);
        setDataQualityWarning(null);
        setConsecutiveFailureCount(0);
        setConsecutiveDegradedCount(0);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.warn("[SiteDataContext] Could not get latest snapshot", err.message || err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setConsecutiveFailureCount(prev => prev + 1);
    } finally {
      isFetchingRef.current = false;
      setIsInitialLoading(false);
    }
  }, [isTerminated]);

  const pausePolling = useCallback(() => {
    setIsPollingEnabled(false);
  }, []);

  const resumePolling = useCallback(() => {
    if (isTerminated) {
      console.warn("[SiteDataContext] Cannot resume polling: connection is manually terminated");
      return;
    }
    setIsPollingEnabled(true);
    fetchSnapshot();
  }, [fetchSnapshot, isTerminated]);

  const terminateConnection = useCallback(() => {
    setIsPollingEnabled(false);
    setIsTerminated(true);
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  // Polling setup
  useEffect(() => {
    if (!isPollingEnabled || isTerminated) {
      return;
    }

    const intervalId = setInterval(() => {
      fetchSnapshot();
    }, 2000);

    return () => clearInterval(intervalId);
  }, [fetchSnapshot, isPollingEnabled, isTerminated]);

  const liveStatus = useMemo(() => {
    const base = snapshot?.liveStatus || null;
    if (isTerminated) {
      return {
        ...base,
        connectionState: "terminated",
        isTerminated: true,
        message: "Connection Manually Terminated",
      };
    }
    return base;
  }, [snapshot, isTerminated]);

  const value: SiteDataContextType = {
    snapshot,
    activeTopologyProfile,
    siteIdentity: snapshot?.siteIdentity || null,
    liveStatus,
    sourceHealth: snapshot?.rollups?.sourceHealth || null,
    sourceHealthSummary: snapshot?.rollups?.sourceHealthSummary || null,
    isInitialLoading,
    lastUpdated,
    refreshNow: fetchSnapshot,
    error,
    dataQualityWarning,
    isPollingEnabled,
    isTerminated,
    pausePolling,
    resumePolling,
    terminateConnection,
    consecutiveFailureCount,
    consecutiveDegradedCount,
    lastPollAttemptedAt,
    lastGoodSnapshotAt
  };

  return (
    <SiteDataContext.Provider value={value}>
      {children}
    </SiteDataContext.Provider>
  );
};

export const useSiteData = () => {
  const context = useContext(SiteDataContext);
  if (!context) {
    throw new Error('useSiteData must be used within a SiteDataProvider');
  }
  return context;
};
