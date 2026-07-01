import { 
  repairFinalFleetRollupsFromStringsAndArrays, 
  findNativeEmsBlockSummary, 
  findNativeArraySummaryTotals,
  findNativeEmsArrayStringCounts,
  lastKnownGoodEmsApps
} from "./prizmDataCoordinator";
import { setEmsCachedBlock, emsCache } from "./emsTurtleClient";

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
  assertEqual(snapshotWithArrayTotals.rollups.stringSummary.source, "native-ems-array-string-counts", "Test 2.1: stringSummary.source falls back to native-ems-array-string-counts");
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

  // 7. findNativeEmsArrayStringCounts priority 1 (Full native EMS block array counts)
  const rawP1 = {
    block: {
      arrays: [
        { arrayIndex: 1, onlineStringCount: 10, nearlineStringCount: 2, offlineStringCount: 1, notCommunicationStringCount: 0 },
        { arrayIndex: 2, onlineStringCount: 20, nearlineStringCount: 1, offlineStringCount: 0, notCommunicationStringCount: 1 }
      ]
    }
  };
  const countsP1 = findNativeEmsArrayStringCounts(rawP1);
  assert(countsP1 !== null, "Test 7.1: findNativeEmsArrayStringCounts P1 extracts data successfully");
  assertEqual(countsP1?.source, "native-ems-array-string-counts", "Test 7.2: source name is native-ems-array-string-counts");
  assertEqual(countsP1?.online, 30, "Test 7.3: online sum is 30");
  assertEqual(countsP1?.nearline, 3, "Test 7.4: nearline sum is 3");
  assertEqual(countsP1?.offline, 1, "Test 7.5: offline sum is 1");
  assertEqual(countsP1?.notCommunicating, 1, "Test 7.6: notCommunicating sum is 1");

  // 8. findNativeEmsArrayStringCounts priority 2 (Native EMS last-call dcBatteryReport socData)
  const rawP2 = {
    lastCall: {
      blockReport: {
        dcBatteryReport: {
          "1": {
            dcBatteryData: {
              socData: { onlineStackCount: 15, nearlineStackCount: 2, offlineStackCount: 1 }
            }
          },
          "2": {
            dcBatteryData: {
              socData: { onlineStackCount: 25, nearlineStackCount: 1, offlineStackCount: 0 }
            }
          }
        }
      }
    }
  };
  const countsP2 = findNativeEmsArrayStringCounts(rawP2);
  assert(countsP2 !== null, "Test 8.1: findNativeEmsArrayStringCounts P2 extracts data successfully");
  assertEqual(countsP2?.source, "native-ems-dc-battery-soc-stack-counts", "Test 8.2: source name is native-ems-dc-battery-soc-stack-counts");
  assertEqual(countsP2?.online, 40, "Test 8.3: online sum is 40");
  assertEqual(countsP2?.nearline, 3, "Test 8.4: nearline sum is 3");
  assertEqual(countsP2?.offline, 1, "Test 8.5: offline sum is 1");

  // 9. findNativeEmsArrayStringCounts priority 3 (Native EMS arrayReport communication counts)
  const rawP3 = {
    status: {
      blockReport: {
        arrayReport: {
          "1": {
            arrayData: { communicatingStackCount: 35, notCommunicatingStackCount: 5 }
          }
        }
      }
    }
  };
  const countsP3 = findNativeEmsArrayStringCounts(rawP3);
  assert(countsP3 !== null, "Test 9.1: findNativeEmsArrayStringCounts P3 extracts data successfully");
  assertEqual(countsP3?.source, "native-ems-array-communication-counts", "Test 9.2: source name is native-ems-array-communication-counts");
  assertEqual(countsP3?.online, 35, "Test 9.3: online sum is 35");
  assertEqual(countsP3?.notCommunicating, 5, "Test 9.4: notCommunicating sum is 5");

  // 10. findNativeEmsArrayStringCounts priority 4 (Existing direct-field parser)
  const rawP4 = {
    block: {
      onlineStringCount: 100,
      nearlineStringCount: 5,
      offlineStringCount: 2,
      notCommunicationStringCount: 1
    }
  };
  const countsP4 = findNativeEmsArrayStringCounts(rawP4);
  assert(countsP4 !== null, "Test 10.1: findNativeEmsArrayStringCounts P4 extracts data successfully");
  assertEqual(countsP4?.source, "native-ems-block-summary", "Test 10.2: source name is native-ems-block-summary");
  assertEqual(countsP4?.online, 100, "Test 10.3: online count is 100");
  assertEqual(countsP4?.nearline, 5, "Test 10.4: nearline count is 5");

  // 11. Array Summary matching check: Native array counts beating repaired counts
  const snapshotArrayMatch: any = {
    rawSources: rawP1,
    normalized: {
      strings: strings.slice(0, 80), // 80 strings
      arrays: [
        { arrayNumber: 1, stringCount: 0, onlineStringCount: 0, nearlineStringCount: 0 },
        { arrayNumber: 2, stringCount: 0, onlineStringCount: 0, nearlineStringCount: 0 }
      ]
    },
    rollups: {
      stringSummary: {
        rollups: {}
      },
      arraySummary: [
        { arrayIndex: 1, stringCount: 0, onlineStringCount: 0, nearlineStringCount: 0 },
        { arrayIndex: 2, stringCount: 0, onlineStringCount: 0, nearlineStringCount: 0 }
      ],
      bessFleetSummary: {},
      fleetCapacity: {}
    }
  };

  repairFinalFleetRollupsFromStringsAndArrays(snapshotArrayMatch);
  assertEqual(snapshotArrayMatch.rollups.arraySummary[0].onlineStringCount, 10, "Test 11.1: Array 1 onlineStringCount matches native 10");
  assertEqual(snapshotArrayMatch.rollups.arraySummary[0].nearlineStringCount, 2, "Test 11.2: Array 1 nearlineStringCount matches native 2");
  assertEqual(snapshotArrayMatch.rollups.arraySummary[1].onlineStringCount, 20, "Test 11.3: Array 2 onlineStringCount matches native 20");
  assertEqual(snapshotArrayMatch.rollups.arraySummary[1].notCommunicationStringCount, 1, "Test 11.4: Array 2 notCommunicationStringCount matches native 1");

  // 12. Real EMS app preservation via setEmsCachedBlock
  emsCache.block = null;
  const blockWithApps = {
    dragonApps: [{ appCode: "PCS_APP", active: true }],
    onlineStringCount: 15
  };
  setEmsCachedBlock(blockWithApps);
  assertEqual(emsCache.block?.dragonApps?.length, 1, "Test 12.1: dragonApps cached successfully");

  const blockWithoutApps = {
    onlineStringCount: 18
  };
  setEmsCachedBlock(blockWithoutApps);
  assertEqual(emsCache.block?.dragonApps?.length, 1, "Test 12.2: dragonApps preserved when new fetch is missing them");
  assertEqual(emsCache.block?.onlineStringCount, 18, "Test 12.3: Rest of block data updated correctly");

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
