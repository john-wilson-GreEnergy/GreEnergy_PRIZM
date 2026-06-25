import { deriveArrayNumberFromRow, hasArrayZeroFallback, repairArraySummaryFromNormalizedStrings, isValidArraySummary, shouldRepairArraySummary, repairFinalArraySummary } from "../server/prizmDataCoordinator";
import { filterAndNormalizeArraySummary } from "./arraySummaryFilters";

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

  console.log("--- Array Summary Repair & Sanitization Specified Tests ---");

  // Setup 320 valid normalized strings mapped to Arrays 1 through 8
  const strings: any[] = [];
  for (let a = 1; a <= 8; a++) {
    for (let s = 1; s <= 40; s++) {
      strings.push({
        id: `A${a}-S${s}`,
        arrayNumber: a,
        stringNumber: s,
        stringKey: `A${a}-S${s}`,
        bucket: "online",
        kw: 10,
        amps: 5,
        socPct: 90,
        kwh: 100,
        minCellVoltage: 3.2,
        maxCellVoltage: 3.25,
        minCellTemperature: 25,
        maxCellTemperature: 27
      });
    }
  }

  // 1. Empty arraySummary + 320 normalized strings A1-S1..A8-S40 repairs to 8 arrays.
  const emptySummarySnapshot = {
    rollups: {
      arraySummary: []
    },
    normalized: {
      arrays: [],
      strings: strings
    }
  };
  assertEqual(shouldRepairArraySummary(emptySummarySnapshot), true, "Test 1.1: shouldRepairArraySummary returns true for empty arraySummary");
  const success1 = repairFinalArraySummary(emptySummarySnapshot);
  assertEqual(success1, true, "Test 1.2: repair succeeds");
  assertEqual(emptySummarySnapshot.rollups.arraySummary.length, 8, "Test 1.3: empty summary repaired to 8 arrays");
  assertEqual(emptySummarySnapshot.rollups.arraySummary[0].sourcePath, "repaired-from-normalized-strings", "Test 1.4: sourcePath is repaired-from-normalized-strings");

  // 2. Invalid Array 0 summary + normalized strings repairs to 8 arrays.
  const invalidArrayZeroSnapshot = {
    rollups: {
      arraySummary: [{
        arrayIndex: 0,
        friendlyString: "Array 0",
        sourcePath: "synthesized",
        stringCount: 320
      }]
    },
    normalized: {
      arrays: [{
        arrayIndex: 0,
        friendlyString: "Array 0",
        sourcePath: "synthesized",
        stringCount: 320
      }],
      strings: strings
    }
  };
  assertEqual(hasArrayZeroFallback(invalidArrayZeroSnapshot), true, "Test 2.1: detects invalid Array 0 fallback");
  const success2 = repairFinalArraySummary(invalidArrayZeroSnapshot);
  assertEqual(success2, true, "Test 2.2: repair of Array 0 fallback succeeds");
  assertEqual(invalidArrayZeroSnapshot.rollups.arraySummary.length, 8, "Test 2.3: repaired to exactly 8 arrays");
  assertEqual(hasArrayZeroFallback(invalidArrayZeroSnapshot), false, "Test 2.4: no longer contains Array 0 fallback");

  // 3. Valid native array summary does not get replaced.
  const validNativeSnapshot = {
    rollups: {
      arraySummary: [
        { arrayNumber: 1, friendlyString: "Array 1", stringCount: 40, sourcePath: "native" },
        { arrayNumber: 2, friendlyString: "Array 2", stringCount: 40, sourcePath: "native" }
      ]
    },
    normalized: {
      strings: strings
    }
  };
  assertEqual(shouldRepairArraySummary(validNativeSnapshot), false, "Test 3.1: shouldRepairArraySummary is false for valid native array summary");
  const success3 = repairFinalArraySummary(validNativeSnapshot);
  assertEqual(success3, false, "Test 3.2: repair returns false (skipped)");
  assertEqual(validNativeSnapshot.rollups.arraySummary.length, 2, "Test 3.3: valid native summary is untouched");
  assertEqual(validNativeSnapshot.rollups.arraySummary[0].sourcePath, "native", "Test 3.4: sourcePath is still native");

  // 4. Missing arrayNumber but id A5-S17 parses to Array 5.
  const rowWithIdOnly = { id: "A5-S17" };
  assertEqual(deriveArrayNumberFromRow(rowWithIdOnly), 5, "Test 4.1: id A5-S17 parses to Array 5");
  const rowWithKeyOnly = { stringKey: "Array 7-S2" };
  assertEqual(deriveArrayNumberFromRow(rowWithKeyOnly), 7, "Test 4.2: stringKey Array 7-S2 parses to Array 7");

  // 5. Repair debug is populated when repair runs.
  assertEqual(typeof (emptySummarySnapshot as any).debug?.arraySummaryRepair, "object", "Test 5.1: debug.arraySummaryRepair is populated");
  assertEqual((emptySummarySnapshot as any).debug?.arraySummaryRepair?.used, true, "Test 5.2: repair debug shows used = true");
  assertEqual((emptySummarySnapshot as any).debug?.arraySummaryRepair?.reason.includes("empty or invalid"), true, "Test 5.3: repair debug reason is correct");

  assertEqual(typeof (validNativeSnapshot as any).debug?.arraySummaryRepair, "object", "Test 5.4: debug.arraySummaryRepair is populated when skipped");
  assertEqual((validNativeSnapshot as any).debug?.arraySummaryRepair?.used, false, "Test 5.5: repair debug shows used = false");

  // 6. Final snapshot with normalized strings never returns empty arraySummary unless array numbers truly cannot be derived.
  const unparseableStringsSnapshot = {
    rollups: {
      arraySummary: []
    },
    normalized: {
      strings: [{ id: "unparseable-id-without-array-number" }]
    }
  };
  const success6 = repairFinalArraySummary(unparseableStringsSnapshot);
  assertEqual(success6, false, "Test 6.1: repair fails when array numbers cannot be derived");
  assertEqual(unparseableStringsSnapshot.rollups.arraySummary.length, 0, "Test 6.2: array summary remains empty");
  assertEqual((unparseableStringsSnapshot as any).debug?.arraySummaryRepair?.failed, true, "Test 6.3: debug records failed = true");

  // 7. Final snapshot never returns production Array 0.
  const arrayZeroRepairFailSnapshot = {
    rollups: {
      arraySummary: [{
        arrayIndex: 0,
        friendlyString: "Array 0",
        sourcePath: "synthesized",
        stringCount: 120
      }]
    },
    normalized: {
      strings: [{ id: "unparseable-id" }]
    }
  };
  const success7 = repairFinalArraySummary(arrayZeroRepairFailSnapshot);
  assertEqual(success7, false, "Test 7.1: repair fails for invalid strings");
  assertEqual(arrayZeroRepairFailSnapshot.rollups.arraySummary.length, 0, "Test 7.2: failed repair clears Array 0 fallback");
  assertEqual(hasArrayZeroFallback(arrayZeroRepairFailSnapshot), false, "Test 7.3: snapshot contains no Array 0 fallback");

  // 8. Frontend filterAndNormalizeArraySummary filters out Array 0
  const dummyArrays = [
    { arrayNumber: 0, friendlyString: "Array 0", stringCount: 100 },
    { arrayNumber: 1, friendlyString: "Array 1", stringCount: 40 }
  ];
  const filtered = filterAndNormalizeArraySummary(dummyArrays);
  assertEqual(filtered.length, 1, "Test 8.1: Frontend filters out Array 0");
  assertEqual(filtered[0].arrayNumber, 1, "Test 8.2: Frontend retains Array 1");

  console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
