import assert from "node:assert/strict";
import { runInTelemetryCycle } from "../TelemetryCycleContext";
import { buildCanonicalStringIndexes } from "./CanonicalStringIndexes";
import { CycleNormalizationCache } from "./CycleNormalizationCache";
import { createNormalizationFingerprint } from "./NormalizationFingerprint";
import { normalizationMetrics } from "./NormalizationMetrics";

async function run(): Promise<void> {
  console.log("Running cycle normalization cache tests...");
  normalizationMetrics.reset();
  const cache = new CycleNormalizationCache();
  let executions = 0;
  let release: (() => void) | null = null;
  const source = { rows: [{ stringKey: "A1-S1", alarm: "SMOKE", stale: true }] };
  const before = structuredClone(source);
  const operation = async () => {
    executions += 1;
    await new Promise<void>((resolve) => { release = resolve; });
    return Object.freeze({ rows: Object.freeze(source.rows.map((row) => ({ ...row }))), fallback: "last-known-good" });
  };

  const [firstPromise, secondPromise] = runInTelemetryCycle(10, () => {
    const request = { domain: "strings" as const, fingerprint: createNormalizationFingerprint(source), operation };
    return [cache.getOrCompute(request), cache.getOrCompute(request)];
  });
  await Promise.resolve();
  assert.equal(executions, 1, "concurrent callers must share one normalization execution");
  assert.ok(release);
  release();
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(first, second, "same-cycle callers must receive the canonical immutable result");
  assert.ok(Object.isFrozen(first));
  assert.deepEqual(source, before, "normalization caching must not mutate source payloads");
  assert.equal(first.rows[0].alarm, "SMOKE", "alarm/fault meaning must be preserved");
  assert.equal(first.rows[0].stale, true, "stale state must be preserved");
  assert.equal(first.fallback, "last-known-good", "fallback provenance must be preserved");

  const hit = await runInTelemetryCycle(10, () => cache.getOrCompute({ domain: "strings", fingerprint: createNormalizationFingerprint(source), operation }));
  assert.equal(hit, first);
  assert.equal(executions, 1);
  cache.clearCycle(10);
  assert.equal(cache.sizeForCycle(10), 0, "cycle cleanup must discard canonical values");

  await runInTelemetryCycle(11, () => cache.getOrCompute({ domain: "strings", fingerprint: createNormalizationFingerprint(source), operation: async () => { executions += 1; return first; } }));
  assert.equal(executions, 2, "the next cycle must recompute");

  let attempts = 0;
  await assert.rejects(() => runInTelemetryCycle(12, () => cache.getOrCompute({ domain: "first-responder", operation: async () => { attempts += 1; throw new Error("expected"); } })));
  const recovered = await runInTelemetryCycle(12, () => cache.getOrCompute({ domain: "first-responder", operation: async () => { attempts += 1; return { healthy: true }; } }));
  assert.equal(recovered.healthy, true, "an error must not poison a later normalization attempt");
  assert.equal(attempts, 2);

  const rows = [
    { stringKey: "A1-S1", arrayIndex: 1, stringIndex: 1, energySegmentNumber: 1, stringControllerIp: "10.0.1.10" },
    { stringKey: "A1-S2", arrayIndex: 1, stringIndex: 2, energySegmentNumber: 1, stringControllerIp: "10.0.1.15" },
    { stringKey: "A2-S1", arrayIndex: 2, stringIndex: 1, energySegmentNumber: 1, stringControllerIp: "10.0.2.10" },
  ];
  const indexes = buildCanonicalStringIndexes(rows);
  assert.equal(indexes.byStringKey.get("A1-S1"), rows[0], "canonical string identity must remain exact");
  assert.equal(indexes.byArrayAndString.get("1:2"), rows[1]);
  assert.deepEqual(indexes.byArrayIndex.get(1), [rows[0], rows[1]]);
  assert.deepEqual(indexes.byEnergySegment.get("1:1"), [rows[0], rows[1]], "Energy Segment mapping must retain both strings");
  assert.equal(indexes.byIpAddress.get("10.0.2.10"), rows[2]);

  const report = normalizationMetrics.report();
  assert.equal(report.cycles.find((cycle) => cycle.cycleId === 10 && cycle.domain === "strings")?.executionCount, 1);
  assert.equal(report.cycles.find((cycle) => cycle.cycleId === 10 && cycle.domain === "strings")?.inFlightReuseCount, 1);
  assert.equal(report.cycles.find((cycle) => cycle.cycleId === 10 && cycle.domain === "strings")?.hitCount, 1);
  console.log("Cycle normalization cache tests passed!");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
