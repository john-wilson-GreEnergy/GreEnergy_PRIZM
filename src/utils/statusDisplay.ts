export function getDashboardConnectionStatus(sum: any, isRefreshing: boolean) {
    if (!sum) return { text: "Offline", colorClass: "text-prizm-danger", bgClass: "bg-prizm-danger/10" };

    const cState = sum.site?.connectionState;
    const source = sum.source;
    const isStale = !!sum.stale;
    const liveAttempted = !!sum.liveAttempted;
    const liveSucceeded = !!sum.liveSucceeded;
    const isDemo = source === "demo";

    if (isDemo) {
        return { text: "Demo Mode", colorClass: "text-purple-400", bgClass: "bg-purple-500/10", pulse: true };
    }
    
    if (cState === "disconnected" || source === "offline") {
        return { text: "Offline", colorClass: "text-prizm-danger", bgClass: "bg-prizm-danger/10", pulse: false };
    }
    
    if (isRefreshing) {
        return { text: "Refreshing Live", colorClass: "text-cyan-400", bgClass: "bg-cyan-500/10", pulse: true };
    }
    
    if (liveAttempted && !liveSucceeded && sum.cacheUsed) {
        return { text: "Using Last Snapshot", colorClass: "text-amber-500", bgClass: "bg-amber-500/10", pulse: false };
    }
    
    if (!liveAttempted && sum.cacheUsed && isStale) {
        return { text: "Using Last Snapshot", colorClass: "text-amber-500", bgClass: "bg-amber-500/10", pulse: false };
    }

    if (source === "partial" || ((liveSucceeded || source === "live-ems" || source === "live") && isStale)) {
        return { text: "Connection Partial", colorClass: "text-prizm-warning", bgClass: "bg-prizm-warning/10", pulse: false };
    }
    
    if (liveSucceeded || source === "live-ems" || source === "live" || (cState === "connected" && !isStale)) {
        return { text: "Connection Live", colorClass: "text-emerald-400", bgClass: "bg-emerald-500/10", pulse: true };
    }
    
    if (sum.cacheUsed) {
        return { text: "Using Last Snapshot", colorClass: "text-amber-500", bgClass: "bg-amber-500/10", pulse: false };
    }
    
    return { text: "Offline", colorClass: "text-prizm-danger", bgClass: "bg-prizm-danger/10", pulse: false };
}
