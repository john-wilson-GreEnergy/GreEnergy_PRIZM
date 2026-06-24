import assert from "assert";
import { stringNumberToEnergySegment, formatStringEsLabel } from "./stringToEsMapper";

function runTests() {
  console.log("Running stringToEsMapper Tests...");

  // String 1 -> ES1
  assert.strictEqual(stringNumberToEnergySegment(1), 1);
  console.log("  -> String 1 maps to ES1 passed!");

  // String 2 -> ES1
  assert.strictEqual(stringNumberToEnergySegment(2), 1);
  console.log("  -> String 2 maps to ES1 passed!");

  // String 3 -> ES2
  assert.strictEqual(stringNumberToEnergySegment(3), 2);
  console.log("  -> String 3 maps to ES2 passed!");

  // String 4 -> ES2
  assert.strictEqual(stringNumberToEnergySegment(4), 2);
  console.log("  -> String 4 maps to ES2 passed!");

  // String 5 -> ES3
  assert.strictEqual(stringNumberToEnergySegment(5), 3);
  console.log("  -> String 5 maps to ES3 passed!");

  // String 6 -> ES3
  assert.strictEqual(stringNumberToEnergySegment(6), 3);
  console.log("  -> String 6 maps to ES3 passed!");

  // String 20 -> ES10
  assert.strictEqual(stringNumberToEnergySegment(20), 10);
  console.log("  -> String 20 maps to ES10 passed!");

  // String 28 -> ES14
  assert.strictEqual(stringNumberToEnergySegment(28), 14);
  console.log("  -> String 28 maps to ES14 passed!");

  // String 39 -> ES20
  assert.strictEqual(stringNumberToEnergySegment(39), 20);
  console.log("  -> String 39 maps to ES20 passed!");

  // String 40 -> ES20
  assert.strictEqual(stringNumberToEnergySegment(40), 20);
  console.log("  -> String 40 maps to ES20 passed!");

  // Invalid/null/0 string returns null
  assert.strictEqual(stringNumberToEnergySegment(null), null);
  assert.strictEqual(stringNumberToEnergySegment(undefined), null);
  assert.strictEqual(stringNumberToEnergySegment(0), null);
  assert.strictEqual(stringNumberToEnergySegment(-5), null);
  console.log("  -> Invalid/null/0 string returns null passed!");

  // Explicit ES-level target uses explicit ES only when no string number is present
  const labelNoString = formatStringEsLabel({
    arrayNumber: 5,
    energySegmentNumber: 8
  });
  assert.strictEqual(labelNoString, "Array 5 / ES8");
  console.log("  -> Explicit ES-level target uses explicit ES only when no string number is present passed!");

  // Formatting tests (Full & Compact)
  const fullLabel = formatStringEsLabel({
    blockIndex: 1,
    arrayNumber: 5,
    stringNumber: 5,
    includeBlock: true
  });
  assert.strictEqual(fullLabel, "Block 1 / Array 5 / ES3 - String 5");
  console.log("  -> Full label formatting passed!");

  const compactLabel = formatStringEsLabel({
    arrayNumber: 5,
    stringNumber: 5,
    compact: true
  });
  assert.strictEqual(compactLabel, "A5 / ES3 / S5");
  console.log("  -> Compact label formatting passed!");

  console.log("All stringToEsMapper tests completed successfully!");
}

try {
  runTests();
} catch (err: any) {
  console.error("Test suite failed:", err);
  process.exit(1);
}
