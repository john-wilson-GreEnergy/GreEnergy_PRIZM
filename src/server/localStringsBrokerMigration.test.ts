import assert from "assert";
import { buildLocalStringsResponse } from "./localStringsBrokerRoute";

function mkMeta(data: any[]) {
  return {
    source: "live",
    staleData: false,
    lastUpdated: "2026-07-11T00:00:00.000Z",
    activeEmsBaseUrl: "http://127.0.0.1",
    activeProfileName: "test-profile",
    activeProfileId: "profile-1",
    stationCode: "BHE0020",
    blockIndex: 1,
    lastError: null,
    cacheProfileId: "profile-1",
    cacheEmsBaseUrl: "http://127.0.0.1",
    cacheCreatedAt: "2026-07-10T00:00:00.000Z",
    cacheLastUpdatedAt: "2026-07-11T00:00:00.000Z",
    data,
  };
}

function mkRow(overrides: any = {}) {
  return {
    arrayIndex: 1,
    stringIndex: 16,
    stringKey: "A1-S16",
    soc: 55.1,
    voltageMeasured: 913.2,
    cellGroupTempMax: 41.6,
    connectionState: "Online",
    ...overrides,
  };
}

async function runTests() {
  console.log("Running local strings broker migration tests...");

  const legacyData = [mkRow(), mkRow({ stringIndex: 17, stringKey: "A1-S17", soc: 56.2 })];
  const legacyMeta = mkMeta(legacyData);
  const blockMeta = mkMeta([]);
  const ipMapWrapper = { data: [] };
  const snapshot = { rawSources: { strings: [] } };

  const brokerSnapshot = {
    authorities: {
      "string-telemetry": {
        chosenProviderId: "turtle",
        fallbackUsed: false,
        stale: false,
      },
    },
    unified: {
      stringTelemetry: {
        rows: [
          { raw: mkRow({ soc: 60.5 }) },
          { raw: mkRow({ stringIndex: 17, stringKey: "A1-S17", soc: 61.5 }) },
        ],
      },
    },
  };

  const brokerResult = await buildLocalStringsResponse({
    rawStringsWrapper: legacyMeta,
    blockWrapper: blockMeta,
    ipMapWrapper,
    snapshot,
    brokerSnapshot,
  });

  assert.strictEqual(brokerResult.usingBroker, true);
  assert.strictEqual(brokerResult.response.data.length, 2);
  assert.strictEqual(brokerResult.response.data[0].soc, 60.5);
  assert.strictEqual(brokerResult.parity?.brokerOutputCount, 2);
  assert.strictEqual(brokerResult.parity?.legacyOutputCount, 2);
  assert.strictEqual(brokerResult.parity?.brokerUniqueStringKeyCount, 2);
  assert.strictEqual(brokerResult.parity?.legacyUniqueStringKeyCount, 2);
  console.log("  -> broker-backed output and parity count test passed");

  const legacyResult = await buildLocalStringsResponse({
    rawStringsWrapper: legacyMeta,
    blockWrapper: blockMeta,
    ipMapWrapper,
    snapshot,
    forceLegacy: true,
    brokerSnapshot,
  });

  assert.deepStrictEqual(Object.keys(brokerResult.response), Object.keys(legacyResult.response));
  assert.deepStrictEqual(Object.keys(brokerResult.response.data[0]).sort(), Object.keys(legacyResult.response.data[0]).sort());
  console.log("  -> response contract parity test passed");

  const staleBrokerSnapshot = {
    authorities: {
      "string-telemetry": {
        chosenProviderId: "turtle",
        fallbackUsed: false,
        stale: true,
      },
    },
    unified: {
      stringTelemetry: {
        rows: [{ raw: mkRow({ soc: 99.9 }) }],
      },
    },
  };

  const staleResult = await buildLocalStringsResponse({
    rawStringsWrapper: legacyMeta,
    blockWrapper: blockMeta,
    ipMapWrapper,
    snapshot,
    brokerSnapshot: staleBrokerSnapshot,
  });

  assert.strictEqual(staleResult.usingBroker, false);
  assert.strictEqual(staleResult.response.data[0].soc, 55.1);
  console.log("  -> stale preferred source handling test passed");

  const rollbackResult = await buildLocalStringsResponse({
    rawStringsWrapper: legacyMeta,
    blockWrapper: blockMeta,
    ipMapWrapper,
    snapshot,
    forceLegacy: true,
    brokerSnapshot,
  });

  assert.strictEqual(rollbackResult.usingBroker, false);
  assert.strictEqual(rollbackResult.response.data[0].soc, 55.1);
  console.log("  -> rollback to legacy path test passed");

  const mutableRow = mkRow({ rawNested: { value: 1 } });
  const mutableMeta = mkMeta([mutableRow]);
  await buildLocalStringsResponse({
    rawStringsWrapper: mutableMeta,
    blockWrapper: blockMeta,
    ipMapWrapper,
    snapshot,
    forceLegacy: true,
  });
  assert.strictEqual(mutableMeta.data[0].rawNested.value, 1);
  console.log("  -> no mutation of cached source data test passed");

  assert.strictEqual(brokerResult.parity?.representativeFieldEquality.connectionState, true);
  assert.strictEqual(typeof brokerResult.parity?.representativeFieldEquality.soc, "boolean");
  assert.strictEqual(typeof brokerResult.parity?.representativeFieldEquality.measuredVoltage, "boolean");
  assert.strictEqual(typeof brokerResult.parity?.representativeFieldEquality.maxCellTemp, "boolean");
  console.log("  -> representative field parity structure test passed");

  console.log("Local strings broker migration tests passed!");
}

runTests().catch((err) => {
  console.error("Local strings broker migration tests failed:", err);
  process.exit(1);
});
