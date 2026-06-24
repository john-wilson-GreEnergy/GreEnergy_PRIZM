import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { parseStatusPayload, parseReportPayload } from "./balancerTestParser";
import { analyzeReports } from "./balancerTestAnalyzer";
import { stringNumberToEnergySegment } from "../../lib/stringToEsMapper";
import { BalancerTestService } from "./balancerTestService";

async function runTests() {
  console.log("Running Balancer Test parser and analyzer unit tests...");

  // 1. Status parser handles JSON lines separated by tags
  const rawStatusHtml = `
    <body>
    {"testId": 12, "direction": "Charge", "statusMessage": "Finished.", "balancerTestTargets": "Array :1:1", "started": true, "finished": true}<br />
    {"testId": 13, "direction": "Discharge", "statusMessage": "CellGroups: 15", "balancerTestTargets": "Block :2", "started": true, "finished": false}
    </body>
  `;
  const parsedStatuses = parseStatusPayload(rawStatusHtml, 30);
  assert.strictEqual(parsedStatuses.length, 2);
  console.log("  -> Test Case 1: Status parser handles HTML / tags passed!");

  // 2. Status parser handles finished state
  assert.strictEqual(parsedStatuses[0].state, "FINISHED");
  assert.strictEqual(parsedStatuses[0].progress, 100);
  console.log("  -> Test Case 2: Status parser handles finished state passed!");

  // 3. Status parser extracts CellGroups N and computes progress
  assert.strictEqual(parsedStatuses[1].state, "RUNNING");
  assert.strictEqual(parsedStatuses[1].progress, 50); // 15 of 30
  console.log("  -> Test Case 3: Status parser extracts CellGroups N and progress passed!");

  // 4. Report parser extracts site/block/array/string/bpc/cell from cellGroupKey
  const rawReportHtml = `
    <html><body>{
      "results": [
        {
          "cellGroupKey": "CELLGROUP SITE_A:1:2:3:4:5",
          "balanceStart": "2026-06-24T08:00:00Z",
          "balanceEnd": "2026-06-24T08:05:00Z",
          "balanceConfirmedOn": true
        },
        {
          "cellGroupKey": "CELLGROUP SITE_A:1:2:5:6:7",
          "balanceStart": "2026-06-24T08:10:00Z",
          "balanceEnd": "2026-06-24T08:12:30Z",
          "balanceConfirmedOn": false,
          "warningTriggerMessage": "Voltage gap too large"
        },
        {
          "cellGroupKey": "CELLGROUP SITE_A:1:2:28:8:9",
          "balanceStart": "2026-06-24T08:20:00Z",
          "balanceEnd": "2026-06-24T08:30:00Z",
          "balanceConfirmedOn": true,
          "warningTriggeredAfterBalance": true
        },
        {
          "cellGroupKey": "CELLGROUP SITE_B:2:3:10:1:1",
          "balanceStart": "2026-06-24T08:40:00Z",
          "balanceEnd": "2026-06-24T08:50:00Z",
          "balanceConfirmedOn": true,
          "warningTriggeredTime": "2026-06-24T08:45:00Z"
        }
      ]
    }</body></html>
  `;
  const parsedRows = parseReportPayload(rawReportHtml);
  assert.strictEqual(parsedRows.length, 4);

  const row1 = parsedRows[0];
  assert.strictEqual(row1.site, "SITE_A");
  assert.strictEqual(row1.block, "1");
  assert.strictEqual(row1.array, 2);
  assert.strictEqual(row1.stringNumber, 3);
  assert.strictEqual(row1.bpc, 4);
  assert.strictEqual(row1.cell, 5);
  assert.strictEqual(row1.durationSec, 300); // 5 minutes
  assert.strictEqual(row1.balanceConfirmedOn, true);
  console.log("  -> Test Case 4: Report parser extracts fields from cellGroupKey passed!");

  // 5. Warning logic detects warningTriggerMessage
  const row2 = parsedRows[1];
  assert.strictEqual(row2.warning, true);
  assert.strictEqual(row2.warningTriggerMessage, "Voltage gap too large");
  console.log("  -> Test Case 5: Warning logic detects warningTriggerMessage passed!");

  // 6. Warning logic detects warningTriggeredAfterBalance
  const row3 = parsedRows[2];
  assert.strictEqual(row3.warning, true);
  assert.strictEqual(row3.warningTriggeredAfterBalance, true);
  console.log("  -> Test Case 6: Warning logic detects warningTriggeredAfterBalance passed!");

  // 7. Warning logic detects warningTriggeredTime
  const row4 = parsedRows[3];
  assert.strictEqual(row4.warning, true);
  assert.strictEqual(row4.warningTriggeredTime, "2026-06-24T08:45:00Z");
  console.log("  -> Test Case 7: Warning logic detects warningTriggeredTime passed!");

  // 8. Duration stats compute min/avg/p95/max
  const analysis = analyzeReports([1], parsedRows, "mock-base/");
  assert.strictEqual(analysis.summary.totalCellGroups, 4);
  assert.strictEqual(analysis.summary.confirmedBalances, 3);
  assert.strictEqual(analysis.summary.warningCount, 3);
  assert.strictEqual(analysis.summary.minDurationSec, 150); // 150s (row 2)
  assert.strictEqual(analysis.summary.maxDurationSec, 600); // 600s (rows 3 and 4)
  assert.strictEqual(analysis.summary.avgDurationSec, 412.5); // (300+150+600+600)/4 = 1650/4 = 412.5
  
  // For P95: sort ascending: [150, 300, 600, 600]
  // index = int(0.95 * (4 - 1) + 0.5) = int(0.95 * 3 + 0.5) = int(2.85 + 0.5) = int(3.35) = 3
  // sortedDurations[3] = 600
  assert.strictEqual(analysis.summary.p95DurationSec, 600);
  console.log("  -> Test Case 8: Duration stats compute min/avg/p95/max passed!");

  // 9. String 5 maps to ES3
  assert.strictEqual(stringNumberToEnergySegment(5), 3);
  console.log("  -> Test Case 9: String 5 maps to ES3 passed!");

  // 10. String 28 maps to ES14
  assert.strictEqual(stringNumberToEnergySegment(28), 14);
  console.log("  -> Test Case 10: String 28 maps to ES14 passed!");

  // 11. Combined multi-test analysis merges rows
  const mockReport2 = `
    <html><body>{
      "results": [
        {
          "cellGroupKey": "CELLGROUP SITE_B:2:3:10:1:2",
          "balanceStart": "2026-06-24T09:00:00Z",
          "balanceEnd": "2026-06-24T09:05:00Z",
          "balanceConfirmedOn": true
        }
      ]
    }</body></html>
  `;
  const parsedRows2 = parseReportPayload(mockReport2);
  const combinedRows = [...parsedRows, ...parsedRows2];
  const combinedAnalysis = analyzeReports([1, 2], combinedRows, "mock-base/");
  assert.strictEqual(combinedAnalysis.summary.totalCellGroups, 5);
  assert.strictEqual(combinedAnalysis.summary.confirmedBalances, 4);
  console.log("  -> Test Case 11: Combined multi-test analysis merges rows passed!");

  // 12. capability endpoint returns deploySupported false when no endpoint configured
  process.env.MOCK_DEPLOY_UNCONFIGURED = "true";
  const capsUnconfigured = BalancerTestService.getCapabilities();
  assert.strictEqual(capsUnconfigured.deploySupported, false);
  assert.strictEqual(capsUnconfigured.deployEndpointConfigured, false);
  console.log("  -> Test Case 12: Capabilities unconfigured branch passed!");

  // 13. returns 501 if endpoint not configured
  const deployResUnconfigured = await BalancerTestService.deploy({
    arrays: [1],
    direction: "charge",
    confirmationToken: "START BALANCER TEST"
  });
  assert.strictEqual(deployResUnconfigured.accepted, false);
  assert.strictEqual(deployResUnconfigured.supportedLocally, false);
  console.log("  -> Test Case 13: Deploy returns 501/supportedLocally false passed!");

  // 14. audit object is created for rejected request
  const auditPath = path.join(process.cwd(), "data", "audit", "balancer_test_audit.jsonl");
  assert.ok(fs.existsSync(auditPath));
  const auditContent = fs.readFileSync(auditPath, "utf8");
  assert.ok(auditContent.includes("Deployment endpoint not configured"));
  console.log("  -> Test Case 14: Audit file created for unconfigured rejection passed!");

  // Reset unconfigured to allow configured testing
  delete process.env.MOCK_DEPLOY_UNCONFIGURED;

  // 15. deploy request validation rejects no arrays
  const deployResNoArrays = await BalancerTestService.deploy({
    arrays: [],
    direction: "charge",
    confirmationToken: "START BALANCER TEST"
  });
  assert.strictEqual(deployResNoArrays.accepted, false);
  assert.strictEqual(deployResNoArrays.supportedLocally, true);
  assert.ok(deployResNoArrays.message.includes("arrays must be non-empty"));
  console.log("  -> Test Case 15: Validation rejects no arrays passed!");

  // 16. rejects invalid array numbers
  const deployResInvalidArrays = await BalancerTestService.deploy({
    arrays: [9],
    direction: "charge",
    confirmationToken: "START BALANCER TEST"
  });
  assert.strictEqual(deployResInvalidArrays.accepted, false);
  assert.strictEqual(deployResInvalidArrays.supportedLocally, true);
  assert.ok(deployResInvalidArrays.message.includes("arrays must be between 1 and 8"));
  console.log("  -> Test Case 16: Validation rejects invalid arrays passed!");

  // 17. rejects missing confirmation phrase
  const deployResNoConfirm = await BalancerTestService.deploy({
    arrays: [1],
    direction: "charge",
    confirmationToken: ""
  });
  assert.strictEqual(deployResNoConfirm.accepted, false);
  assert.strictEqual(deployResNoConfirm.supportedLocally, true);
  assert.ok(deployResNoConfirm.message.includes("missing or invalid confirmation phrase"));
  console.log("  -> Test Case 17: Validation rejects missing confirmation passed!");

  // 18. if endpoint is mocked as configured, deploy route sends expected EMS request and parses testId
  const originalFetch = globalThis.fetch;
  const originalGlobalFetch = (global as any).fetch;
  const interceptedUrls: string[] = [];
  const mockFetch = async (url: any) => {
    const urlStr = url.toString();
    interceptedUrls.push(urlStr);
    if (urlStr.includes("/trigger/")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ testId: 99 })
      } as any;
    } else {
      return {
        ok: true,
        status: 200,
        text: async () => `<body>{"testId": 99, "direction": "charge", "statusMessage": "Finished.", "balancerTestTargets": "Array :1:1", "started": true, "finished": true}</body>`
      } as any;
    }
  };
  globalThis.fetch = mockFetch;
  (global as any).fetch = mockFetch;

  const deployResSuccess = await BalancerTestService.deploy({
    arrays: [1, 2],
    direction: "charge",
    confirmationToken: "START BALANCER TEST"
  });

  globalThis.fetch = originalFetch;
  (global as any).fetch = originalGlobalFetch;

  assert.strictEqual(deployResSuccess.accepted, true);
  assert.strictEqual(deployResSuccess.testId, 99);
  assert.ok(interceptedUrls.some(u => u.includes("trigger/charge.json")));
  assert.ok(interceptedUrls.some(u => u.includes("arrayIndexes=1,2")));
  console.log("  -> Test Case 18: Successful deploy hits correct endpoint and parses testId passed!");

  console.log("All unit tests completed successfully!");
}

async function start() {
  try {
    await runTests();
  } catch (err: any) {
    console.error("Balancer Test suite failed:", err);
    process.exit(1);
  }
}

start();
