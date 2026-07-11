import assert from "assert";
import {
  clearEmsTelemetryCache,
  pollEmsArrayNotifications,
  pollEmsStringNotifications,
  getEmsCachedArrayNotifications,
  getEmsCachedStringNotifications,
  runNotificationHybridComparison,
  getNotificationHybridTelemetry,
} from "./emsTurtleClient";

const ARRAY_ENDPOINT = "/tools/report/ems/array/1/notifications.json";
const STRING_ENDPOINT = "/tools/report/ems/array/1/string/16/notifications.json";

function notificationRow(code: string, category: "ALARM" | "WARNING", arrayIndex: number, stringIndex: number, batteryPackIndex = 0, cellGroupIndex = 0) {
  return {
    notificationType: {
      notificationCategory: category,
      notificationId: code,
    },
    notificationSource: {
      endpointType: batteryPackIndex > 0 ? "BATTERY_PACK" : "STRING",
      arrayIndex,
      stringIndex,
      batteryPackIndex,
      cellGroupIndex,
    },
    timestamp: String(Date.now()),
  };
}

function makeFetch(routes: Record<string, { status: number; body: any } | Error>): typeof fetch {
  return (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    const route = Object.entries(routes).find(([suffix]) => url.endsWith(suffix));
    if (!route) {
      throw new Error(`unhandled endpoint ${url}`);
    }
    const result = route[1];
    if (result instanceof Error) {
      throw result;
    }
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

async function runTests() {
  console.log("Running EMS Turtle notification hybrid tests...");
  const originalFetch = global.fetch;

  try {
    clearEmsTelemetryCache();
    global.fetch = makeFetch({
      [ARRAY_ENDPOINT]: {
        status: 200,
        body: { notification: [notificationRow("2074", "WARNING", 1, 16, 10, 3)] },
      },
    });

    await pollEmsArrayNotifications([1]);
    const arrayCache = getEmsCachedArrayNotifications();
    assert.strictEqual(arrayCache[1].ok, true);
    assert.strictEqual(arrayCache[1].status, 200);
    assert.strictEqual(arrayCache[1].notificationCount, 1);
    assert.strictEqual(arrayCache[1].sourceUsed, "primary");
    assert.strictEqual(arrayCache[1].fallbackUsed, false);
    assert.ok((arrayCache[1].responseDurationMs ?? -1) >= 0);
    console.log("  -> array notification acquisition success test passed");

    clearEmsTelemetryCache();
    global.fetch = makeFetch({
      [STRING_ENDPOINT]: {
        status: 200,
        body: { notification: [notificationRow("1024", "ALARM", 1, 16, 10, 0)] },
      },
    });

    await pollEmsStringNotifications([{ arrayIndex: 1, stringIndex: 16 }]);
    const stringCache = getEmsCachedStringNotifications();
    assert.strictEqual(stringCache["1:16"].ok, true);
    assert.strictEqual(stringCache["1:16"].status, 200);
    assert.strictEqual(stringCache["1:16"].notificationCount, 1);
    assert.strictEqual(stringCache["1:16"].sourceUsed, "primary");
    console.log("  -> string notification acquisition success test passed");

    clearEmsTelemetryCache();
    global.fetch = makeFetch({
      [ARRAY_ENDPOINT]: {
        status: 200,
        body: {},
      },
    });

    await pollEmsArrayNotifications([1]);
    const emptyArrayCache = getEmsCachedArrayNotifications();
    assert.strictEqual(emptyArrayCache[1].ok, true);
    assert.strictEqual(emptyArrayCache[1].notificationCount, 0);
    assert.deepStrictEqual(emptyArrayCache[1].data, { notification: [] });
    console.log("  -> empty notification response test passed");

    clearEmsTelemetryCache();
    global.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new Error("AbortError: timeout exceeded");
    }) as typeof fetch;

    await pollEmsArrayNotifications([1]);
    const failedArrayCache = getEmsCachedArrayNotifications();
    assert.strictEqual(failedArrayCache[1].ok, false);
    assert.strictEqual(failedArrayCache[1].notificationCount, 0);
    assert.ok((failedArrayCache[1].error || "").toLowerCase().includes("timeout") || (failedArrayCache[1].error || "").toLowerCase().includes("abort"));
    console.log("  -> timeout/failure test passed");

    clearEmsTelemetryCache();
    global.fetch = makeFetch({
      [ARRAY_ENDPOINT]: {
        status: 200,
        body: {
          notification: [
            notificationRow("2074", "WARNING", 1, 16, 10, 3),
            notificationRow("2074", "WARNING", 1, 16, 10, 3),
            notificationRow("2024", "WARNING", 1, 5, 6, 0),
          ],
        },
      },
      [STRING_ENDPOINT]: {
        status: 200,
        body: {
          notification: [
            notificationRow("1024", "ALARM", 1, 16, 10, 0),
            notificationRow("1024", "ALARM", 1, 16, 10, 0),
          ],
        },
      },
      ["/tools/report/ems/array/2/notifications.json"]: {
        status: 200,
        body: {
          notification: [
            notificationRow("9999", "WARNING", 2, 2, 0, 0),
          ],
        },
      },
    });

    const legacyNotifications = [
      {
        code: "2074",
        severity: "warning",
        affected: [
          { endpointType: "BATTERY_PACK", arrayIndex: 1, stringIndex: 16, batteryPackIndex: 10, cellGroupIndex: 3 },
          { endpointType: "BATTERY_PACK", arrayIndex: 1, stringIndex: 16, batteryPackIndex: 10, cellGroupIndex: 3 },
        ],
      },
      {
        code: "1024",
        severity: "alarm",
        affected: [
          { endpointType: "BATTERY_PACK", arrayIndex: 1, stringIndex: 16, batteryPackIndex: 10, cellGroupIndex: 0 },
          { endpointType: "BATTERY_PACK", arrayIndex: 1, stringIndex: 16, batteryPackIndex: 10, cellGroupIndex: 0 },
        ],
      },
    ];
    const legacyBefore = JSON.stringify(legacyNotifications);

    // Seed unrelated cache to verify scoped comparisons exclude it.
    await pollEmsArrayNotifications([2]);

    const comparison = await runNotificationHybridComparison({
      legacyNotifications,
      arrayNumbers: [1],
      stringTargets: [{ arrayIndex: 1, stringIndex: 16 }],
      refreshArrays: true,
      refreshStrings: true,
      maxStringTargets: 8,
    });

    assert.strictEqual(comparison.legacyCount, 2);
    assert.strictEqual(comparison.turtleArrayCount, 2);
    assert.strictEqual(comparison.turtleStringCount, 1);
    assert.strictEqual(comparison.legacyRawCount, 4);
    assert.strictEqual(comparison.turtleArrayRawCount, 3);
    assert.strictEqual(comparison.turtleStringRawCount, 2);
    assert.strictEqual(comparison.legacyDuplicateCount, 2);
    assert.strictEqual(comparison.turtleArrayDuplicateCount, 1);
    assert.strictEqual(comparison.turtleStringDuplicateCount, 1);
    assert.strictEqual(comparison.canonicalIdentityVersion, "notification-identity-v2");
    assert.ok(comparison.canonicalIdentityFormat.includes("src:"));
    assert.ok(comparison.sampleDuplicateIdentities.length > 0);
    assert.ok(comparison.matchedNotifications.length >= 2);
    assert.ok(comparison.missingFromLegacy.some((id) => id.includes("2024")));
    assert.ok(comparison.missingFromLegacy.every((id) => id.includes("a:1")), "scoped array comparison should not include unrelated arrays");
    assert.deepStrictEqual(comparison.arraysPolled, [1]);
    assert.strictEqual(comparison.legacyProductionOutputUnchanged, true);
    assert.strictEqual(JSON.stringify(legacyNotifications), legacyBefore);
    console.log("  -> duplicate collapse + scoped exclusion + raw-vs-unique parity test passed");

    clearEmsTelemetryCache();
    global.fetch = makeFetch({
      [ARRAY_ENDPOINT]: {
        status: 200,
        body: {
          notification: [
            {
              notificationType: {
                notificationCategory: "warning",
                notificationId: "7010",
              },
              notificationSource: {
                endpointType: null,
                arrayIndex: 0,
                stringIndex: null,
                batteryPackIndex: 0,
                cellGroupIndex: undefined,
              },
            },
          ],
        },
      },
    });

    const missingNormalized = await runNotificationHybridComparison({
      legacyNotifications: [
        {
          code: "7010",
          level: "WARNING",
          source: null,
          affected: [
            {
              endpointType: "",
              arrayIndex: 0,
              stringIndex: null,
              batteryPackIndex: 0,
              cellGroupIndex: undefined,
            },
          ],
        },
      ],
      arrayNumbers: [1],
      refreshArrays: true,
      refreshStrings: false,
    });

    assert.strictEqual(missingNormalized.legacyCount, 1);
    assert.strictEqual(missingNormalized.turtleArrayCount, 1);
    assert.strictEqual(missingNormalized.missingFromLegacy.length, 0);
    assert.strictEqual(missingNormalized.missingFromTurtle.length, 0);
    assert.strictEqual(missingNormalized.matchedNotifications.length, 1);
    console.log("  -> missing-field normalization consistency test passed");

    const telemetry = getNotificationHybridTelemetry();
    assert.strictEqual(telemetry.comparisonTimestamp, missingNormalized.comparisonTimestamp);
    assert.strictEqual(telemetry.canonicalIdentityVersion, "notification-identity-v2");
    console.log("  -> telemetry updates + hybrid comparison output + legacy output unchanged tests passed");

    console.log("EMS Turtle notification hybrid tests passed!");
  } finally {
    global.fetch = originalFetch;
  }
}

runTests().catch((err) => {
  console.error("emsTurtleNotificationsHybrid test failed:", err);
  process.exit(1);
});
