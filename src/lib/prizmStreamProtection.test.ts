// Prizm Stream Protection & Polling Mechanics Tests
import { getEmsConnectionStatus } from "../server/emsTurtleClient";

// ----------------------------------------------------
// Core quality gates replicated for unit test assertions
// ----------------------------------------------------
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

function isDegradedComparedToPrevious(next: any, previous: any): { degraded: boolean; reason: string } {
  const previousQuality = getSnapshotQuality(previous);
  const nextQuality = getSnapshotQuality(next);

  if (!previous || !isRenderableSnapshot(previous)) {
    return { degraded: false, reason: "no previous renderable snapshot" };
  }

  if (!isRenderableSnapshot(next)) {
    return { degraded: true, reason: "next snapshot is not renderable" };
  }

  if (previousQuality.normalizedStrings >= 100 && nextQuality.normalizedStrings < previousQuality.normalizedStrings * 0.5) {
    return { degraded: true, reason: "normalized string count collapsed" };
  }

  if (previousQuality.stringSummaryRows >= 100 && nextQuality.stringSummaryRows < previousQuality.stringSummaryRows * 0.5) {
    return { degraded: true, reason: "string summary rows collapsed" };
  }

  if (previousQuality.arrayDetailStringTotal > 0 && nextQuality.arrayDetailStringTotal === 0) {
    return { degraded: true, reason: "array detail strings collapsed to zero" };
  }

  if (previousQuality.arraySummaryRows > 0 && nextQuality.arraySummaryRows === 0) {
    return { degraded: true, reason: "array summary rows collapsed to zero" };
  }

  return { degraded: false, reason: "snapshot accepted" };
}

// ----------------------------------------------------
// Mock state runner simulating React Context behavior
// ----------------------------------------------------
class MockFrontendDataContext {
  snapshot: any = null;
  error: Error | null = null;
  dataQualityWarning: string | null = null;
  isPollingEnabled = true;
  isTerminated = false;
  consecutiveFailureCount = 0;
  consecutiveDegradedCount = 0;
  lastPollAttemptedAt: string | null = null;
  lastGoodSnapshotAt: string | null = null;
  isFetching = false;

  // Simulate pause/resume/terminate controls
  pausePolling() {
    this.isPollingEnabled = false;
  }

  resumePolling() {
    if (this.isTerminated) return;
    this.isPollingEnabled = true;
  }

  terminateConnection() {
    this.isPollingEnabled = false;
    this.isTerminated = true;
  }

  // Simulate fetch snapshot loop with overlapping protection
  async simulateFetchSnapshot(mockFetchResult: () => Promise<any>) {
    if (this.isTerminated) return;
    if (this.isFetching) {
      // OVERLAPPING FETCH SKIPPED
      return "skipped";
    }

    this.isFetching = true;
    this.lastPollAttemptedAt = new Date().toISOString();

    try {
      const data = await mockFetchResult();
      const previous = this.snapshot;
      const { degraded, reason } = isDegradedComparedToPrevious(data, previous);

      if (degraded && previous && isRenderableSnapshot(previous)) {
        this.dataQualityWarning = "Latest poll degraded; displaying last known good data.";
        this.consecutiveDegradedCount++;
      } else {
        this.snapshot = data;
        const nowStr = new Date().toISOString();
        this.lastGoodSnapshotAt = nowStr;
        this.error = null;
        this.dataQualityWarning = null;
        this.consecutiveFailureCount = 0;
        this.consecutiveDegradedCount = 0;
      }
    } catch (err: any) {
      this.error = err;
      this.consecutiveFailureCount++;
    } finally {
      this.isFetching = false;
    }
  }
}

// ----------------------------------------------------
// Mock state runner simulating Backend centralSnapshot behavior
// ----------------------------------------------------
class MockBackendCoordinator {
  centralSnapshot: any = null;
  snapshotRejected = false;
  rejectionReason = "";

  updateSnapshot(newSnap: any) {
    let acceptSnapshot = true;
    let reason = "";
    if (this.centralSnapshot) {
      const check = isDegradedComparedToPrevious(newSnap, this.centralSnapshot);
      if (check.degraded) {
        acceptSnapshot = false;
        reason = check.reason;
      }
    }

    if (acceptSnapshot) {
      this.centralSnapshot = newSnap;
      this.snapshotRejected = false;
      this.rejectionReason = "";
    } else {
      this.snapshotRejected = true;
      this.rejectionReason = reason;
      // annotate existing
      if (this.centralSnapshot) {
        if (!this.centralSnapshot.liveStatus) {
          this.centralSnapshot.liveStatus = { warnings: [] };
        }
        this.centralSnapshot.liveStatus.stale = true;
      }
    }
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assertEqual(actual: any, expected: any, name: string) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.error(`❌ ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      failed++;
    }
  }

  console.log("--- Prizm Stream Protection Unit Tests ---");

  // Create mock snapshots
  const goodSnapshot1 = {
    normalized: {
      strings: Array(100).fill({ id: "S1", state: "OK" }),
      arrays: [{ id: "A1" }],
      arrayDetailsByArray: {
        "1": { strings: Array(5).fill({ id: "S1" }) }
      }
    },
    rollups: {
      stringSummary: { tableRows: Array(100).fill({ id: "S1" }) },
      arraySummary: Array(8).fill({ id: "A1" })
    }
  };

  const degradedSnapshot = {
    normalized: {
      strings: [],
      arrays: []
    },
    rollups: {
      stringSummary: { tableRows: [] }
    }
  };

  const goodSnapshot2 = {
    normalized: {
      strings: Array(105).fill({ id: "S2", state: "OK" }),
      arrays: [{ id: "A1" }],
      arrayDetailsByArray: {
        "1": { strings: Array(6).fill({ id: "S2" }) }
      }
    },
    rollups: {
      stringSummary: { tableRows: Array(105).fill({ id: "S2" }) },
      arraySummary: Array(8).fill({ id: "A1" })
    }
  };

  // --- FRONTEND TESTS ---

  // Test 1 & 3: Frontend keeps previous snapshot and does not overwrite when next is degraded
  const feContext = new MockFrontendDataContext();
  await feContext.simulateFetchSnapshot(async () => goodSnapshot1);
  assertEqual(feContext.snapshot !== null, true, "1. Frontend accepts initial good snapshot");
  assertEqual(feContext.lastGoodSnapshotAt !== null, true, "1. Frontend updates lastGoodSnapshotAt");

  await feContext.simulateFetchSnapshot(async () => degradedSnapshot);
  assertEqual(feContext.snapshot === goodSnapshot1, true, "3. Frontend keeps previous good snapshot when next is degraded");
  assertEqual(feContext.dataQualityWarning !== null, true, "3. Frontend flags warning banner 'displaying last known good data'");
  assertEqual(feContext.consecutiveDegradedCount, 1, "3. Increments consecutiveDegradedCount");

  // Test 4: Frontend accepts good data after degraded poll
  await feContext.simulateFetchSnapshot(async () => goodSnapshot2);
  assertEqual(feContext.snapshot === goodSnapshot2, true, "4. Frontend accepts subsequent fresh good data");
  assertEqual(feContext.dataQualityWarning, null, "4. Clears warning banner on fresh good data");
  assertEqual(feContext.consecutiveDegradedCount, 0, "4. Resets consecutiveDegradedCount on fresh good data");

  // Test 2: Frontend keeps polling after failed fetch
  await feContext.simulateFetchSnapshot(() => Promise.reject(new Error("Network Failure")));
  assertEqual(feContext.snapshot === goodSnapshot2, true, "2. Retains good snapshot after fetch error");
  assertEqual(feContext.consecutiveFailureCount, 1, "2. Increments consecutiveFailureCount");
  assertEqual(feContext.isPollingEnabled, true, "2. Polling remains enabled for continuous retry");

  // Test 5: pausePolling stops interval but keeps rendered snapshot
  feContext.pausePolling();
  assertEqual(feContext.isPollingEnabled, false, "5. pausePolling sets isPollingEnabled to false");
  assertEqual(feContext.snapshot === goodSnapshot2, true, "5. pausePolling retains rendered snapshot data");

  // Test 6: resumePolling restarts interval
  feContext.resumePolling();
  assertEqual(feContext.isPollingEnabled, true, "6. resumePolling sets isPollingEnabled back to true");

  // Test 7: terminateConnection stops polling permanently when called
  feContext.terminateConnection();
  assertEqual(feContext.isPollingEnabled, false, "7. terminateConnection disables polling");
  assertEqual(feContext.isTerminated, true, "7. terminateConnection flags connection as terminated");
  assertEqual(feContext.snapshot === goodSnapshot2, true, "7. terminateConnection preserves last rendered snapshot");

  // Test 8: overlapping fetches are skipped
  const activeFetchContext = new MockFrontendDataContext();
  activeFetchContext.isFetching = true; // Simulating active fetch in progress
  const result = await activeFetchContext.simulateFetchSnapshot(async () => goodSnapshot1);
  assertEqual(result, "skipped", "8. Overlapping fetch skipped and not stacked");

  // --- BACKEND TESTS ---

  // Test 9: Backend rejects degraded snapshot overwrite
  const beCoordinator = new MockBackendCoordinator();
  beCoordinator.updateSnapshot(goodSnapshot1);
  assertEqual(beCoordinator.centralSnapshot === goodSnapshot1, true, "9. Backend accepts initial good snapshot");

  beCoordinator.updateSnapshot(degradedSnapshot);
  assertEqual(beCoordinator.centralSnapshot === goodSnapshot1, true, "9. Backend rejects degraded snapshot and keeps previous good");
  assertEqual(beCoordinator.snapshotRejected, true, "9. Backend flags snapshot as rejected");
  assertEqual(beCoordinator.centralSnapshot.liveStatus.stale, true, "9. Backend marks centralSnapshot state as stale");

  // Test 10: Backend accepts fresh good snapshot after degraded poll
  beCoordinator.updateSnapshot(goodSnapshot2);
  assertEqual(beCoordinator.centralSnapshot === goodSnapshot2, true, "10. Backend accepts fresh good snapshot subsequent to degradation");
  assertEqual(beCoordinator.snapshotRejected, false, "10. Backend clears snapshotRejected flag on good update");

  console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
