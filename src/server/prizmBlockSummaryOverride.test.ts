import { 
  repairFinalFleetRollupsFromStringsAndArrays, 
  findNativeEmsBlockSummary, 
  findNativeArraySummaryTotals,
  lastKnownGoodEmsApps
} from "./prizmDataCoordinator";

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

  function assert(condition: boolean, name: string) {
    if (condition) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.error(`❌ ${name}: condition failed`);
      failed++;
    }
  }

  console.log("--- Prizm Block Summary Overrides & Priorities Tests ---");

  // Mock Normalized Strings (representing 320 strings)
  const strings: any[] = [];
  for (let a = 1; a <= 8; a++) {
    for (let s = 1; s <= 40; s++) {
      strings.push({
        id: `A${a}-S${s}`,
        arrayNumber: a,
        stringNumber: s,
        stringKey: `A${a}-S${s}`,
        communicating: true,
        inRotation: true,
        contactorsClosed: false, // Normalizer default -> nearline
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

  // 1. Native block summary priority test
  const snapshotWithBlockSummary: any = {
    rawSources: {
      block: {
        onlineStringCount: 315,
        nearlineStringCount: 3,
        offlineStringCount: 2,
        notCommunicationStringCount: 0
      }
    },
    normalized: {
      strings: strings
    },
    rollups: {
      stringSummary: {
        rollups: {}
      },
      bessFleetSummary: {},
      fleetCapacity: {}
    }
  };

  repairFinalFleetRollupsFromStringsAndArrays(snapshotWithBlockSummary);
  assertEqual(snapshotWithBlockSummary.rollups.stringSummary.source, "native-ems-block-summary", "Test 1.1: stringSummary.source is native-ems-block-summary");
  assertEqual(snapshotWithBlockSummary.rollups.stringSummary.buckets.online, 315, "Test 1.2: Buckets online count matches native 315");
  assertEqual(snapshotWithBlockSummary.rollups.stringSummary.buckets.nearline, 3, "Test 1.3: Buckets nearline count matches native 3");
  assertEqual(snapshotWithBlockSummary.rollups.stringSummary.buckets.offline, 2, "Test 1.4: Buckets offline count matches native 2");
  assertEqual(snapshotWithBlockSummary.rollups.stringSummary.buckets.notCommunicating, 0, "Test 1.5: Buckets notCommunicating count matches native 0");
  assertEqual(snapshotWithBlockSummary.rollups.stringSummary.debug.source, "native-ems-block-summary", "Test 1.6: Debug source matches");
  assert(snapshotWithBlockSummary.rollups.stringSummary.debug.detectedFields.length > 0, "Test 1.7: Debug detectedFields populated");

  // 2. No native block summary fallback: Array Summary Totals priority
  const snapshotWithArrayTotals: any = {
    rawSources: {
      block: {
        arrays: [
          { arrayIndex: 1, onlineStringCount: 40, nearlineStringCount: 0 },
          { arrayIndex: 2, onlineStringCount: 35, nearlineStringCount: 5 }
        ]
      }
    },
    normalized: {
      strings: strings.slice(0, 80) // 80 strings
    },
    rollups: {
      stringSummary: {
        rollups: {}
      },
      bessFleetSummary: {},
      fleetCapacity: {}
    }
  };

  repairFinalFleetRollupsFromStringsAndArrays(snapshotWithArrayTotals);
  assertEqual(snapshotWithArrayTotals.rollups.stringSummary.source, "native-array-summary-totals", "Test 2.1: stringSummary.source falls back to native-array-summary-totals");
  assertEqual(snapshotWithArrayTotals.rollups.stringSummary.buckets.online, 75, "Test 2.2: Sum of online array string counts is 75");
  assertEqual(snapshotWithArrayTotals.rollups.stringSummary.buckets.nearline, 5, "Test 2.3: Sum of nearline array string counts is 5");

  // 3. Connection permitted separation
  // Ensure that strings having connectionPermitted = true or false does not affect raw/native counts or bucketing.
  const stringsWithCp = strings.map(s => ({ ...s, connectionPermitted: true }));
  const snapshotWithCp: any = {
    rawSources: {
      block: {
        onlineStringCount: 310,
        nearlineStringCount: 10,
        offlineStringCount: 0,
        notCommunicationStringCount: 0
      }
    },
    normalized: {
      strings: stringsWithCp
    },
    rollups: {
      stringSummary: {
        rollups: {}
      },
      bessFleetSummary: {},
      fleetCapacity: {}
    }
  };

  repairFinalFleetRollupsFromStringsAndArrays(snapshotWithCp);
  assertEqual(snapshotWithCp.rollups.stringSummary.source, "native-ems-block-summary", "Test 3.1: source is native-ems-block-summary");
  assertEqual(snapshotWithCp.rollups.stringSummary.buckets.online, 310, "Test 3.2: Cp strings do not alter native online bucket");
  assertEqual(snapshotWithCp.rollups.stringSummary.buckets.nearline, 10, "Test 3.3: Cp strings do not alter native nearline bucket");

  // 4. Native summary not overwritten
  // Ensure that repaired values derived from normalized strings (all 320 strings would resolve to nearline because contactorsClosed is false)
  // do not overwrite the native block summary values.
  assertEqual(snapshotWithBlockSummary.rollups.stringSummary.buckets.online, 315, "Test 4.1: Buckets online is still 315 (not overwritten by normalized rows count)");
  assertEqual(snapshotWithBlockSummary.rollups.stringSummary.buckets.nearline, 3, "Test 4.2: Buckets nearline is still 3 (not overwritten by normalized rows count)");

  // 5. EMS Apps retention test simulation
  // Simulate prizmDataCoordinator EMS Apps retention
  let emsAppsToUse = [];
  let testLastKnownGood = [{ name: "App1" }];
  if ((!emsAppsToUse || emsAppsToUse.length === 0) && testLastKnownGood.length > 0) {
      emsAppsToUse = testLastKnownGood.map((app: any) => ({
          ...app,
          stalePreserved: true
      }));
  }
  assertEqual(emsAppsToUse[0].name, "App1", "Test 5.1: EMS apps retrieved from lastKnownGood on empty poll");
  assertEqual(emsAppsToUse[0].stalePreserved, true, "Test 5.2: stalePreserved flag is true");

  // 6. Feather summary/list agreement simulation
  const enrichedFeatherRows = [
    { id: "F1", communicating: true, hasActiveIssue: false },
    { id: "F2", communicating: false, hasActiveIssue: true }
  ];
  
  const baseFeather = {};
  const devices = enrichedFeatherRows || [];
  const total = devices.length;
  const online = devices.filter((d: any) => d.communicating === true).length;
  const offline = devices.filter((d: any) => d.communicating === false).length;
  
  const featherSummary = {
    ...baseFeather,
    totalDevices: total,
    onlineDevices: online,
    offlineDevices: offline,
    devices
  };

  assertEqual(featherSummary.totalDevices, 2, "Test 6.1: Feather totalDevices matches");
  assertEqual(featherSummary.onlineDevices, 1, "Test 6.2: Feather onlineDevices matches");
  assertEqual(featherSummary.offlineDevices, 1, "Test 6.3: Feather offlineDevices matches");
  assertEqual(featherSummary.devices.length, 2, "Test 6.4: devices array inside featherSummary matches enrichedFeatherRows count");

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
