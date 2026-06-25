import { normalizeVoltage, normalizeDeltaVoltage } from "./voltageNormalizer";

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assertEqual(actual: any, expected: any, name: string) {
    if (actual === expected) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.error(`❌ ${name}: expected ${expected}, got ${actual}`);
      failed++;
    }
  }

  console.log("--- normalizeVoltage Tests ---");
  assertEqual(normalizeVoltage(3.2), 3200, "Should convert 3.2V to 3200mV");
  assertEqual(normalizeVoltage("3.3"), 3300, "Should convert string '3.3' to 3300mV");
  assertEqual(normalizeVoltage(3200), 3200, "Should keep 3200mV as 3200mV");
  assertEqual(normalizeVoltage("3500"), 3500, "Should keep string '3500' as 3500mV");
  assertEqual(normalizeVoltage(0), null, "Should return null for out of bounds 0");
  assertEqual(normalizeVoltage(1.5), null, "Should return null for out of bounds 1.5");
  assertEqual(normalizeVoltage(5.1), null, "Should return null for out of bounds 5.1");
  assertEqual(normalizeVoltage(1499), null, "Should return null for out of bounds 1499");
  assertEqual(normalizeVoltage(4501), null, "Should return null for out of bounds 4501");
  assertEqual(normalizeVoltage(null), null, "Should handle null");
  assertEqual(normalizeVoltage(undefined), null, "Should handle undefined");
  assertEqual(normalizeVoltage("invalid"), null, "Should handle invalid string");

  console.log("--- normalizeDeltaVoltage Tests ---");
  assertEqual(normalizeDeltaVoltage(0.5), 500, "Should convert 0.5V to 500mV");
  assertEqual(normalizeDeltaVoltage("0.05"), 50, "Should convert string '0.05' to 50mV");
  assertEqual(normalizeDeltaVoltage(1.4), 1400, "Should convert 1.4V to 1400mV");
  assertEqual(normalizeDeltaVoltage(50), 50, "Should keep 50mV as 50mV");
  assertEqual(normalizeDeltaVoltage(1500), 1500, "Should keep 1500mV as 1500mV");
  assertEqual(normalizeDeltaVoltage(0), 0, "Should keep 0 as 0");
  assertEqual(normalizeDeltaVoltage(null), null, "Should handle null");
  assertEqual(normalizeDeltaVoltage(undefined), null, "Should handle undefined");
  assertEqual(normalizeDeltaVoltage("invalid"), null, "Should handle invalid string");

  console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
