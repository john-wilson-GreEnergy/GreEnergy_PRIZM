import assert from "assert";

function stringNumberToEnergySegment(stringNumber: number): number {
  return Math.ceil(stringNumber / 2);
}

function runTests() {
  console.log("Running stringToEsMapper Tests...");

  // String 5 -> ES3
  assert.strictEqual(stringNumberToEnergySegment(5), 3);
  console.log("  -> String 5 maps to ES3 passed!");

  // String 6 -> ES3
  assert.strictEqual(stringNumberToEnergySegment(6), 3);
  console.log("  -> String 6 maps to ES3 passed!");

  // String 28 -> ES14
  assert.strictEqual(stringNumberToEnergySegment(28), 14);
  console.log("  -> String 28 maps to ES14 passed!");

  // String 20 -> ES10
  assert.strictEqual(stringNumberToEnergySegment(20), 10);
  console.log("  -> String 20 maps to ES10 passed!");

  // String 1 -> ES1
  assert.strictEqual(stringNumberToEnergySegment(1), 1);
  console.log("  -> String 1 maps to ES1 passed!");

  // String 2 -> ES1
  assert.strictEqual(stringNumberToEnergySegment(2), 1);
  console.log("  -> String 2 maps to ES1 passed!");

  // String 39 -> ES20
  assert.strictEqual(stringNumberToEnergySegment(39), 20);
  console.log("  -> String 39 maps to ES20 passed!");

  // String 40 -> ES20
  assert.strictEqual(stringNumberToEnergySegment(40), 20);
  console.log("  -> String 40 maps to ES20 passed!");

  console.log("All stringToEsMapper tests completed successfully!");
}

try {
  runTests();
} catch (err: any) {
  console.error("Test suite failed:", err);
  process.exit(1);
}
