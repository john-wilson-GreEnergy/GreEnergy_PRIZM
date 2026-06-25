import { deriveArrayNumberFromRow, hasArrayZeroFallback, repairArraySummaryFromNormalizedStrings } from "../server/prizmDataCoordinator";
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

  console.log("--- Array Summary Repair & Sanitization Tests ---");

  // 1. Snapshot with Array 0 fallback and normalized strings A1-S1 through A8-S40 repairs to 8 arrays
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

  const badSnapshot = {
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
    },
    arraySummary: [{
      arrayIndex: 0,
      friendlyString: "Array 0",
      sourcePath: "synthesized",
      stringCount: 320
    }]
  };

  assertEqual(hasArrayZeroFallback(badSnapshot), true, "Detection: Snapshot has invalid Array 0 fallback before repair");

  const success = repairArraySummaryFromNormalizedStrings(badSnapshot);
  assertEqual(success, true, "Part 1: Repair of invalid Array 0 fallback succeeded");
  assertEqual(hasArrayZeroFallback(badSnapshot), false, "Part 7: Repaired snapshot no longer contains Array 0 fallback");
  assertEqual(badSnapshot.rollups.arraySummary.length, 8, "Part 1: Repaired to exactly 8 arrays");

  // 2. Repair uses row.arrayNumber directly when present
  const rowWithArrayNumber = { arrayNumber: 3 };
  assertEqual(deriveArrayNumberFromRow(rowWithArrayNumber), 3, "Part 2: Correctly uses row.arrayNumber");

  // 3. Repair parses id A5-S17 if arrayNumber missing
  const rowWithIdOnly = { id: "A5-S17" };
  assertEqual(deriveArrayNumberFromRow(rowWithIdOnly), 5, "Part 3: Correctly parses id A5-S17 to arrayNumber 5");

  // 4. Repair emits scalar power/current fields, not arrays
  const firstRepairedArray: any = badSnapshot.rollups.arraySummary[0];
  assertEqual(typeof firstRepairedArray.powerkW, "number", "Part 4: powerkW is a scalar number, not an array");
  assertEqual(typeof firstRepairedArray.currentAmp, "number", "Part 4: currentAmp is a scalar number, not an array");
  assertEqual(firstRepairedArray.powerkW, 400, "Part 4: powerkW correctly sums 40 strings * 10 kW");
  assertEqual(firstRepairedArray.currentAmp, 200, "Part 4: currentAmp correctly sums 40 strings * 5 amps");

  // 5. Repair debug includes derivedArrayCounts
  const repairDebug = (badSnapshot as any).debug?.arraySummaryRepair;
  assertEqual(repairDebug?.used, true, "Part 5: Debug flag arraySummaryRepair.used is true");
  assertEqual(repairDebug?.derivedArrayCounts["1"], 40, "Part 5: Derived count for array 1 is 40");
  assertEqual(repairDebug?.derivedArrayCounts["8"], 40, "Part 5: Derived count for array 8 is 40");

  // 6. If repair fails, clear Array 0 fallback
  const noStringsSnapshot = {
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
      strings: []
    },
    arraySummary: [{
      arrayIndex: 0,
      friendlyString: "Array 0",
      sourcePath: "synthesized",
      stringCount: 320
    }]
  };
  const repairFailResult = repairArraySummaryFromNormalizedStrings(noStringsSnapshot);
  assertEqual(repairFailResult, false, "Part 6: Repair failed when no strings were present");
  assertEqual(noStringsSnapshot.rollups.arraySummary.length, 0, "Part 6/7: Failed repair clears the Array 0 fallback");

  // 8. Frontend ignores Array 0 if backend somehow emits it
  const dummyArrays = [
    { arrayNumber: 0, friendlyString: "Array 0", stringCount: 100 },
    { arrayNumber: 1, friendlyString: "Array 1", stringCount: 40 }
  ];
  const filtered = filterAndNormalizeArraySummary(dummyArrays);
  assertEqual(filtered.length, 1, "Part 8: Frontend filterAndNormalizeArraySummary filters out Array 0");
  assertEqual(filtered[0].arrayNumber, 1, "Part 8: Frontend retains only Array 1");

  console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
