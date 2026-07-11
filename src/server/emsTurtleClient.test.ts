import assert from "assert";
import { CsvProvider } from "../acquisition/providers/CsvProvider";
import {
  acquireEmsCsvEndpointWithCsvProvider,
  acquireEmsEndpointWithRestProvider,
  clearEmsTelemetryCache,
  getEmsCachedBlock,
  getEmsCachedRawStrings,
  getEmsSourcesDebugInfo,
  pollEmsTurtle,
} from "./emsTurtleClient";

const STRINGS_ENDPOINT = "/tools/report/ems/strings.csv";
const BLOCK_ENDPOINT = "/tools/monitor/ems/blockviewer/data";

function getStringsDebugRow() {
  const row = getEmsSourcesDebugInfo().find((entry: any) => entry.endpoint === STRINGS_ENDPOINT);
  assert.ok(row, "strings.csv debug row should exist");
  return row;
}

function getBlockDebugRow() {
  const row = getEmsSourcesDebugInfo().find((entry: any) => entry.endpoint === BLOCK_ENDPOINT);
  assert.ok(row, "blockviewer debug row should exist");
  return row;
}

function makeFetchForSuccessfulPoll(csvBody: string, blockPayload: any = { arrays: [] }): typeof fetch {
  return (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/status")) {
      return new Response("OK", { status: 200, headers: { "content-type": "text/plain" } });
    }
    if (url.endsWith("/tools/report/ems/status.json")) {
      return new Response(JSON.stringify({ stationCode: "BHE0020" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith(BLOCK_ENDPOINT)) {
      return new Response(JSON.stringify(blockPayload), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/tools/report/ems/lastCall.json")) {
      return new Response(JSON.stringify({ blockReport: {} }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/tools/report/ems/controllerStatistics.json")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith(STRINGS_ENDPOINT)) {
      return new Response(csvBody, { status: 200, headers: { "content-type": "text/csv" } });
    }
    throw new Error("unhandled endpoint");
  }) as typeof fetch;
}

async function runTests() {
  console.log("Running emsTurtleClient CsvProvider tests...");

  const originalFetch = global.fetch;
  try {
    clearEmsTelemetryCache();
    const blockPrimaryPayload = {
      system: { online: 6, nearline: 2, offline: 0 },
      arrays: [{ arrayIndex: 1, label: "Array 1" }]
    };
    global.fetch = makeFetchForSuccessfulPoll("array,string\n1,1", blockPrimaryPayload);

    const blockPrimaryResult = await acquireEmsEndpointWithRestProvider(BLOCK_ENDPOINT, 1000);
    assert.strictEqual(blockPrimaryResult.success, true);
    assert.deepStrictEqual(blockPrimaryResult.data, blockPrimaryPayload);
    const blockPrimaryDebug = getBlockDebugRow();
    assert.strictEqual(blockPrimaryDebug.success, true);
    assert.strictEqual(blockPrimaryDebug.statusCode, 200);
    assert.strictEqual(blockPrimaryDebug.sourceUsed, "primary");
    assert.strictEqual(blockPrimaryDebug.fallbackUsed, false);
    console.log("  -> blockviewer primary acquisition test passed");

    clearEmsTelemetryCache();
    const blockFallbackPayload = {
      system: { online: 4, nearline: 1, offline: 3 },
      arrays: [{ arrayIndex: 2, label: "Array 2" }]
    };
    global.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("127.0.0.1:3000") && url.endsWith(BLOCK_ENDPOINT)) {
        return new Response(JSON.stringify(blockFallbackPayload), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error("primary blockviewer down");
    }) as typeof fetch;

    const blockFallbackResult = await acquireEmsEndpointWithRestProvider(BLOCK_ENDPOINT, 1000);
    assert.strictEqual(blockFallbackResult.success, true);
    assert.deepStrictEqual(blockFallbackResult.data, blockFallbackPayload);
    const blockFallbackDebug = getBlockDebugRow();
    assert.strictEqual(blockFallbackDebug.success, true);
    assert.strictEqual(blockFallbackDebug.fallbackUsed, true);
    assert.strictEqual(blockFallbackDebug.sourceUsed, "fallback-local-mock");
    assert.ok(typeof blockFallbackDebug.fallbackUrl === "string" && blockFallbackDebug.fallbackUrl.includes("127.0.0.1:3000"));
    console.log("  -> blockviewer fallback behavior test passed");

    clearEmsTelemetryCache();
    const parityBlockPayload = {
      system: { online: 5, nearline: 2, offline: 1, notCommunicating: 0 },
      arrays: [
        { arrayIndex: 1, onlineEnergy: "100", pcs: [{ arrayPcsIndex: 1, acRealPowerKW: 12.5 }] },
        { arrayIndex: 2, onlineEnergy: "80", pcs: [{ arrayPcsIndex: 1, acRealPowerKW: 8.5 }] }
      ]
    };
    global.fetch = makeFetchForSuccessfulPoll("array,string,StringKey\n1,1,ST:BHE0020", parityBlockPayload);

    const pollResult = await pollEmsTurtle();
    assert.strictEqual(pollResult.success, true);

    const cachedBlock = getEmsCachedBlock();
    assert.strictEqual(cachedBlock.source, "live");
    assert.strictEqual(cachedBlock.staleData, false);
    assert.ok(cachedBlock.lastUpdated);
    assert.strictEqual(cachedBlock.data?.system?.online, parityBlockPayload.system.online);
    assert.strictEqual(cachedBlock.data?.system?.nearline, parityBlockPayload.system.nearline);
    assert.strictEqual(cachedBlock.data?.arrays?.length, parityBlockPayload.arrays.length);
    assert.strictEqual(cachedBlock.data?.arrays?.[0]?.arrayIndex, 1);
    assert.strictEqual(cachedBlock.data?.arrays?.[0]?.pcs?.[0]?.acRealPowerKW, 12.5);

    const blockParityDebug = getBlockDebugRow();
    assert.strictEqual(blockParityDebug.success, true);
    assert.strictEqual(blockParityDebug.sourceUsed, "primary");
    assert.strictEqual(blockParityDebug.fallbackUsed, false);
    console.log("  -> blockviewer poll cache update and output parity test passed");

    const cachedStrings = getEmsCachedRawStrings();
    assert.ok(Array.isArray(cachedStrings.data));
    assert.strictEqual(cachedStrings.data.length, 1);
    assert.strictEqual(cachedStrings.data[0].StringKey, "ST:BHE0020");

    const successDebug = getStringsDebugRow();
    assert.strictEqual(successDebug.success, true);
    assert.strictEqual(successDebug.statusCode, 200);
    assert.strictEqual(successDebug.sourceUsed, "primary");
    assert.strictEqual(successDebug.fallbackUsed, false);
    assert.ok(successDebug.lastPollTime && successDebug.lastPollTime !== "NEVER");
    assert.ok(successDebug.durationMs >= 0);
    assert.strictEqual(successDebug.lastError, "NONE");
    console.log("  -> strings.csv success, telemetry, and cache update test passed");

    clearEmsTelemetryCache();
    global.fetch = makeFetchForSuccessfulPoll("");
    const emptyResult = await acquireEmsCsvEndpointWithCsvProvider(STRINGS_ENDPOINT, 1000);
    assert.strictEqual(emptyResult.success, true);
    assert.strictEqual(emptyResult.rawContent, "");
    assert.strictEqual(emptyResult.rows.length, 0);
    assert.strictEqual(emptyResult.headers.length, 0);
    assert.strictEqual(getStringsDebugRow().success, true);
    console.log("  -> strings.csv empty CSV test passed");

    clearEmsTelemetryCache();
    global.fetch = makeFetchForSuccessfulPoll("a,b\n\"unterminated,2");
    const malformedResult = await acquireEmsCsvEndpointWithCsvProvider(STRINGS_ENDPOINT, 1000);
    assert.strictEqual(malformedResult.success, true);
    assert.ok(Array.isArray(malformedResult.rows));
    assert.ok(malformedResult.rows.length >= 1);
    assert.strictEqual(getStringsDebugRow().success, true);
    console.log("  -> strings.csv malformed CSV compatibility test passed");

    clearEmsTelemetryCache();
    global.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("127.0.0.1:3000")) {
        return new Response("array,string\n1,1", { status: 200, headers: { "content-type": "text/csv" } });
      }
      throw new Error("primary csv down");
    }) as typeof fetch;

    const fallbackResult = await acquireEmsCsvEndpointWithCsvProvider(STRINGS_ENDPOINT, 1000);
    assert.strictEqual(fallbackResult.success, true);
    assert.strictEqual(fallbackResult.fallbackUsed, true);

    const fallbackDebug = getStringsDebugRow();
    assert.strictEqual(fallbackDebug.success, true);
    assert.strictEqual(fallbackDebug.fallbackUsed, true);
    assert.strictEqual(fallbackDebug.sourceUsed, "fallback-local-mock");
    assert.ok(typeof fallbackDebug.fallbackUrl === "string" && fallbackDebug.fallbackUrl.includes("127.0.0.1:3000"));
    console.log("  -> strings.csv fallback telemetry test passed");

    const provider = new CsvProvider();
    const missingFileResult = await provider.acquire({
      name: "missing-csv",
      kind: "csv",
      path: "/tmp/prizm-missing-strings-file.csv"
    });
    assert.strictEqual(missingFileResult.success, false);
    assert.ok((missingFileResult.error || "").toLowerCase().includes("enoent") || (missingFileResult.error || "").toLowerCase().includes("no such file"));
    console.log("  -> missing CSV file test passed");

    clearEmsTelemetryCache();
    const representativeRows = [
      "ArrayIndex,StringIndex,StringKey,Timestamp,Datetime,StringConnectionState,Ah,KW,KWh,Soc,CalculatedStringVoltage,MeasuredStringVoltage,DcBusVoltage,StringCurrent,MaxCellGroupTemp,MinCellGroupTemp,AvgCellGroupTemp,MaxCellGroupVoltage,MinCellGroupVoltage,AvgCellGroupVoltage,EntityToken",
      "1,1,\"S[ST:BHE0020,B:1,A:1,S:1]\",1783779606615,2026-07-11T14:20:06.615Z,NEARLINE,100.8,0.0,133.65,36,1386,1387,0,0.0,260,230,246,3307,3294,3301,\"ENTITY,ALPHA\"",
      "1,2,\"S[ST:BHE0020,B:1,A:1,S:2]\",1783779606616,2026-07-11T14:20:06.616Z,ONLINE,101.2,4.5,134.15,37,1388,1389,1,1.2,261,231,247,3308,3295,3302,\"ENTITY,BETA\""
    ].join("\r\n");

    global.fetch = makeFetchForSuccessfulPoll(representativeRows);
    const representativePoll = await pollEmsTurtle();
    assert.strictEqual(representativePoll.success, true);

    const representativeCache = getEmsCachedRawStrings() as any;
    const representativeData = Array.isArray(representativeCache.data) ? representativeCache.data : [];
    assert.strictEqual(representativeData.length, 2);

    const keySet = new Set(representativeData.map((row: any) => row.stringKey));
    assert.strictEqual(keySet.size, 2);

    assert.strictEqual(Number(representativeData[0].arrayIndex), 1);
    assert.strictEqual(Number(representativeData[0].stringIndex), 1);
    assert.strictEqual(Number(representativeData[1].arrayIndex), 1);
    assert.strictEqual(Number(representativeData[1].stringIndex), 2);

    assert.ok(representativeData.some((row: any) => row.soc !== null && row.soc !== undefined && row.soc !== ""));
    assert.ok(representativeData.some((row: any) => row.connectionState && row.connectionState !== "Unknown"));
    assert.ok(representativeData.some((row: any) => row.voltageMeasured !== null && row.voltageMeasured !== undefined));
    assert.ok(representativeData.some((row: any) => row.cellGroupTempMax !== null && row.cellGroupTempMax !== undefined));

    const tokens = representativeData.map((row: any) => row.entityToken);
    assert.ok(tokens.includes("ENTITY,ALPHA"));
    assert.ok(tokens.includes("ENTITY,BETA"));
    console.log("  -> representative EMS CSV compatibility test passed");

    clearEmsTelemetryCache();
    global.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new Error("all endpoints offline");
    }) as typeof fetch;

    const offlinePoll = await pollEmsTurtle();
    assert.strictEqual(offlinePoll.success, false);

    const offlineBlock = getEmsCachedBlock();
    assert.strictEqual(offlineBlock.staleData, true);
    assert.ok(offlineBlock.source === "cached" || offlineBlock.source === "offline");
    assert.ok(offlineBlock.lastError);
    console.log("  -> blockviewer stale/offline behavior test passed");
  } finally {
    global.fetch = originalFetch;
  }
}

runTests().catch((err) => {
  console.error("emsTurtleClient RestProvider test failed:", err);
  process.exit(1);
});
