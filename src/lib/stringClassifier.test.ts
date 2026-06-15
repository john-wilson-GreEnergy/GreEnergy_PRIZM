import assert from "assert";
import { classifyStringOperationalState } from "./stringClassifier";

function runTests() {
  console.log("Running stringClassifier Tests...");

  // 1. communicating=true, inRotation=true, contactorsClosed=true -> online
  const t1 = {
    communicating: true,
    outRotation: false,
    positiveContactorClosed: true,
    negativeContactorClosed: true
  };
  const res1 = classifyStringOperationalState(t1);
  assert.strictEqual(res1.state, "online");
  assert.strictEqual(res1.bucket, "online");
  assert.strictEqual(res1.reason, "communicating_in_rotation_contactors_closed");
  console.log("  -> Test 1 passed!");

  // 2. communicating=true, inRotation=true, contactorsClosed=false -> nearline
  const t2 = {
    communicating: true,
    outRotation: false,
    positiveContactorClosed: true,
    negativeContactorClosed: false
  };
  const res2 = classifyStringOperationalState(t2);
  assert.strictEqual(res2.state, "nearline");
  assert.strictEqual(res2.bucket, "nearline");
  assert.strictEqual(res2.reason, "communicating_in_rotation_contactors_open");
  console.log("  -> Test 2 passed!");

  // 3. communicating=true, inRotation=false, contactorsClosed=true -> offline
  const t3 = {
    communicating: true,
    outRotation: true,
    positiveContactorClosed: true,
    negativeContactorClosed: true
  };
  const res3 = classifyStringOperationalState(t3);
  assert.strictEqual(res3.state, "offline");
  assert.strictEqual(res3.bucket, "offline");
  assert.strictEqual(res3.reason, "out_of_rotation");
  console.log("  -> Test 3 passed!");

  // 4. communicating=true, inRotation=false, contactorsClosed=false -> offline
  const t4 = {
    communicating: true,
    outRotation: true,
    positiveContactorClosed: false,
    negativeContactorClosed: false
  };
  const res4 = classifyStringOperationalState(t4);
  assert.strictEqual(res4.state, "offline");
  assert.strictEqual(res4.bucket, "offline");
  assert.strictEqual(res4.reason, "out_of_rotation");
  console.log("  -> Test 4 passed!");

  // 5. communicating=false, inRotation=true, contactorsClosed=true -> notCommunicating
  const t5 = {
    communicating: false,
    outRotation: false,
    positiveContactorClosed: true,
    negativeContactorClosed: true
  };
  const res5 = classifyStringOperationalState(t5);
  assert.strictEqual(res5.state, "notCommunicating");
  assert.strictEqual(res5.bucket, "notCommunicating");
  assert.strictEqual(res5.reason, "not_communicating");
  console.log("  -> Test 5 passed!");

  // 6. unknown/ambiguous -> offline or notCommunicating only if comms explicitly false
  const t6 = {
    communicating: true,
    outRotation: false,
    positiveContactorClosed: false,
    negativeContactorClosed: false
  };
  const res6 = classifyStringOperationalState(t6);
  assert.strictEqual(res6.state, "nearline"); // because communicating=true, inRotation=true, contactorsClosed=false
  console.log("  -> Test 6 passed!");

  const t7 = {
    StringConnectionState: "NOT_COMMUNICATING"
  };
  const res7 = classifyStringOperationalState(t7);
  assert.strictEqual(res7.state, "notCommunicating");
  console.log("  -> Test 7 passed!");

  console.log("All stringClassifier tests completed successfully!");
}

try {
  runTests();
} catch (err: any) {
  console.error("Test suite failed:", err);
  process.exit(1);
}
