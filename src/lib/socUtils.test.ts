import { getSystemSocAndSource } from "./socUtils";

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

  console.log("--- getSystemSocAndSource Tests ---");
  
  // Test 1: native block
  const res1 = getSystemSocAndSource({ bessFleetSummary: { systemSocPct: 45 } }, null);
  assertEqual(res1, { soc: 45, source: "native block" }, "Should get from native block");

  // Test 2: array average
  const res2 = getSystemSocAndSource({ arraySummary: [{ onlineSOC: 50 }, { onlineSOC: 60 }] }, null);
  assertEqual(res2, { soc: 55, source: "array average" }, "Should get from array average");

  // Test 3: string average
  const res3 = getSystemSocAndSource({}, { averageSoc: 85 });
  assertEqual(res3, { soc: 85, source: "string average" }, "Should get from string average");

  // Test 4: handles fractional soc < 1
  const res4 = getSystemSocAndSource({ bessFleetSummary: { systemSocPct: 0.5 } }, null);
  assertEqual(res4, { soc: 50, source: "native block" }, "Should convert 0.5 to 50");

  // Test 5: bounds to 100
  const res5 = getSystemSocAndSource({ bessFleetSummary: { systemSocPct: 105 } }, null);
  assertEqual(res5, { soc: 100, source: "native block" }, "Should bound to 100 max");

  console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
