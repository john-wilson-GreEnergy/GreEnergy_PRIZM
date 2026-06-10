import { parseIPv4, compareIPv4, sortByIPv4 } from "./ipUtils";
import assert from "assert";

function runTests() {
  console.log("Running IP sort tests...");

  // parseIPv4
  assert.deepStrictEqual(parseIPv4("10.0.1.3"), [10, 0, 1, 3]);
  assert.strictEqual(parseIPv4("invalid"), null);
  assert.strictEqual(parseIPv4("10.0.1"), null);

  // compareIPv4
  assert.strictEqual(compareIPv4("10.0.1.3", "10.0.1.10"), -7);
  assert.strictEqual(compareIPv4("10.0.2.3", "10.0.1.10"), 1);

  // sortByIPv4
  const ips = [
    { ip: "10.0.1.75" },
    { ip: "10.0.1.3" },
    { ip: "invalid" },
    { ip: "10.0.1.10" },
    { ip: "10.0.2.3" }
  ];

  const sortedAsc = sortByIPv4(ips, r => r.ip, "asc");
  assert.deepStrictEqual(sortedAsc.map(r => r.ip), [
    "10.0.1.3",
    "10.0.1.10",
    "10.0.1.75",
    "10.0.2.3",
    "invalid"
  ]);

  const sortedDesc = sortByIPv4(ips, r => r.ip, "desc");
  assert.deepStrictEqual(sortedDesc.map(r => r.ip), [
    "10.0.2.3",
    "10.0.1.75",
    "10.0.1.10",
    "10.0.1.3",
    "invalid"
  ]);

  console.log("All IP sort tests passed!");
}

runTests();
