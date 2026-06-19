import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export interface SiteDataContextType {
  snapshot: any | null;
  siteIdentity: any | null;
  liveStatus: any | null;
  sourceHealth: any[] | null;
  sourceHealthSummary: any | null;
  isInitialLoading: boolean;
  lastUpdated: string | null;
  refreshNow: (force?: boolean) => Promise<void>;
  error: Error | null;
}

const SiteDataContext = createContext<SiteDataContextType | null>(null);

export const SiteDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const fetchSnapshot = useCallback(async (force = false) => {
    try {
      const qs = force ? '?refresh=true' : '';
      const response = await fetch(`/api/local/site-data/snapshot${qs}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch site data: ${response.statusText}`);
      }
      const data = await response.json();
      setSnapshot(data);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err: any) {
      console.error("[SiteDataContext] Error fetching snapshot", err);
      // Keep previous snapshot if available, but set error
      setError(err);
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchSnapshot();

    // Setup polling (every 5 seconds)
    const intervalId = setInterval(() => {
      fetchSnapshot();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [fetchSnapshot]);

  const value: SiteDataContextType = {
    snapshot,
    siteIdentity: snapshot?.siteIdentity || null,
    liveStatus: snapshot?.liveStatus || null,
    sourceHealth: snapshot?.rollups?.sourceHealth || null,
    sourceHealthSummary: snapshot?.rollups?.sourceHealthSummary || null,
    isInitialLoading,
    lastUpdated,
    refreshNow: fetchSnapshot,
    error
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
