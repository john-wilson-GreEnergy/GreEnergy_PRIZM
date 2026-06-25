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

  console.log("--- filterAndNormalizeArraySummary Tests ---");
  
  const test1 = [
    { arrayNumber: 0, friendlyString: "Array 0" },
    { arrayNumber: 1, friendlyString: "Array 1" },
    { arrayIndex: 2, friendlyString: "Array 2" }
  ];
  
  const res1 = filterAndNormalizeArraySummary(test1);
  assertEqual(res1.length, 2, "Should exclude array 0");
  assertEqual(res1[0].arrayNumber, 1, "First item should be array 1");
  assertEqual(res1[1].arrayNumber, 2, "Second item should be array 2");

  const test2 = [
    { key: "site:Array 1" },
    { key: "site:Array 0" },
    { key: "site:1:1" }
  ];
  
  const res2 = filterAndNormalizeArraySummary(test2);
  assertEqual(res2.length, 2, "Should parse key for array num and exclude array 0");
  assertEqual(res2[0].arrayNumber, 1, "First should be array 1");
  assertEqual(res2[1].arrayNumber, 1, "Second should be array 1");

  console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
