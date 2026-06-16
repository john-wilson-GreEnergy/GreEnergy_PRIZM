import assert from "assert";
import { 
  normalizeIpToEquipmentCallout, 
  SiteTopologyProfile 
} from "./topologyResolver";

function runTests() {
  console.log("Running topologyResolver Tests...");

  // Test 1: Standard / Default Solar Star profile formula matches
  console.log("Test 1: Default formula matching...");
  
  // 10.0.1.3 → Array 1 CS
  const res1 = normalizeIpToEquipmentCallout("10.0.1.3");
  assert.strictEqual(res1.mapped, true, "10.0.1.3 should be mapped");
  assert.strictEqual(res1.label, "Array 1 CS");
  assert.strictEqual(res1.displayLabel, "Array 1 CS — 10.0.1.3");
  assert.strictEqual(res1.type, "cs");
  console.log("  -> 10.0.1.3 passed!");

  // 10.0.5.55 → Array 5 ES10
  const res2 = normalizeIpToEquipmentCallout("10.0.5.55");
  assert.strictEqual(res2.mapped, true, "10.0.5.55 should be mapped");
  assert.strictEqual(res2.label, "Array 5 ES10");
  assert.strictEqual(res2.displayLabel, "Array 5 ES10 — 10.0.5.55");
  assert.strictEqual(res2.type, "es");
  console.log("  -> 10.0.5.55 passed!");

  // 10.0.8.105 → Array 8 ES20
  const res3 = normalizeIpToEquipmentCallout("10.0.8.105");
  assert.strictEqual(res3.mapped, true);
  assert.strictEqual(res3.label, "Array 8 ES20");
  assert.strictEqual(res3.displayLabel, "Array 8 ES20 — 10.0.8.105");
  console.log("  -> 10.0.8.105 passed!");

  // Test 2: Unmapped hosts on default formula
  console.log("Test 2: Unmapped IP behavior...");
  const resUnmapped = normalizeIpToEquipmentCallout("10.0.5.112");
  assert.strictEqual(resUnmapped.mapped, false);
  assert.strictEqual(resUnmapped.label, "Unmapped device");
  assert.strictEqual(resUnmapped.displayLabel, "Unmapped device — 10.0.5.112");
  console.log("  -> Unmapped handling passed!");

  // Test 3: Alternate base network (e.g. 10.255.x.x / 10.255.5.55)
  console.log("Test 3: Alternate base network parsing...");
  const altProfile: any = {
    ipLayout: {
      baseNetwork: "10.255.0.0/16"
    }
  };
  const resAlt = normalizeIpToEquipmentCallout("10.255.5.55", altProfile);
  assert.strictEqual(resAlt.mapped, true);
  assert.strictEqual(resAlt.label, "Array 5 ES10");
  assert.strictEqual(resAlt.displayLabel, "Array 5 ES10 — 10.255.5.55");
  console.log("  -> Alternate base network passed!");

  // Test 4: Explicit device map overrides formula
  console.log("Test 4: Explicit device map overrides...");
  const explicitProfile: any = {
    ipLayout: {
      explicitDeviceMap: {
        "172.20.14.8": "Array 2 CS",
        "172.20.14.22": "Array 2 ES1",
        "10.0.5.55": "Override Array 5 ES99" // overrides formula for 10.0.5.55
      }
    }
  };
  
  const resExp1 = normalizeIpToEquipmentCallout("172.20.14.8", explicitProfile);
  assert.strictEqual(resExp1.mapped, true);
  assert.strictEqual(resExp1.label, "Array 2 CS");
  assert.strictEqual(resExp1.type, "cs");

  const resExp2 = normalizeIpToEquipmentCallout("10.0.5.55", explicitProfile);
  assert.strictEqual(resExp2.mapped, true);
  assert.strictEqual(resExp2.label, "Override Array 5 ES99");
  console.log("  -> Explicit device map overrides passed!");

  // Test 5: Non-IP labels are preserved
  console.log("Test 5: Non-IP labels preservation...");
  const resPreserve1 = normalizeIpToEquipmentCallout("Array 1 ES31");
  assert.strictEqual(resPreserve1.mapped, false);
  assert.strictEqual(resPreserve1.label, "Array 1 ES31");
  assert.strictEqual(resPreserve1.displayLabel, "Array 1 ES31");

  const resPreserve2 = normalizeIpToEquipmentCallout("status");
  assert.strictEqual(resPreserve2.mapped, false);
  assert.strictEqual(resPreserve2.label, "status");
  assert.strictEqual(resPreserve2.displayLabel, "status");
  console.log("  -> Non-IP labels preservation passed!");

  console.log("All topologyResolver tests completed successfully!");
}

try {
  runTests();
} catch (err: any) {
  console.error("Test suite failed:", err);
  process.exit(1);
}
