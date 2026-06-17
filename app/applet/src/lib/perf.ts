export function markPerf(label: string, startedAt: number, metadata?: Record<string, any>) {
  const durationMs = Math.round(performance.now() - startedAt);
  try {
    if (localStorage.getItem("prizm_perf_debug") === "true") {
      console.info(`[PRIZM PERF] ${label}: ${durationMs}ms`, metadata || {});
    }
  } catch {
    // localStorage may not be available in all contexts
  }
  return durationMs;
}
