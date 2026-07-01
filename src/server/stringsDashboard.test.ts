import assert from "assert";
import { buildCanonicalStringState } from "./stringsDashboard";

function runTests() {
    console.log("Running Canonical String Dashboard and Parser Tests...");

    // 1. Identity mappings test (A1-S1, A1-S2, A8-S40)
    const s1 = buildCanonicalStringState({ arrayNumber: 1, stringNumber: 1 });
    assert.strictEqual(s1.identity.arrayIndex, 1);
    assert.strictEqual(s1.identity.stringNumber, 1);
    assert.strictEqual(s1.identity.localEsNumber, 1);
    assert.strictEqual(s1.identity.pairedStringNumber, 2);
    assert.strictEqual(s1.identity.featherIp, "10.0.1.10");
    assert.strictEqual(s1.identity.canonicalKey, "array:1:string:1");
    assert.strictEqual(s1.identity.displayName, "A1-S1");
    console.log("  -> Test 1: Identity mappings for Array 1 String 1 passed!");

    const s2 = buildCanonicalStringState({ arrayNumber: 1, stringNumber: 2 });
    assert.strictEqual(s2.identity.arrayIndex, 1);
    assert.strictEqual(s2.identity.stringNumber, 2);
    assert.strictEqual(s2.identity.localEsNumber, 1);
    assert.strictEqual(s2.identity.pairedStringNumber, 1);
    assert.strictEqual(s2.identity.featherIp, "10.0.1.10");
    console.log("  -> Test 2: Identity mappings for Array 1 String 2 passed!");

    const s33 = buildCanonicalStringState({ arrayNumber: 1, stringNumber: 33 });
    assert.strictEqual(s33.identity.localEsNumber, 17);
    assert.strictEqual(s33.identity.pairedStringNumber, 34);
    assert.strictEqual(s33.identity.featherIp, "10.0.1.90");
    console.log("  -> Test 3: Identity mappings for Array 1 String 33 passed!");

    const s40 = buildCanonicalStringState({ arrayNumber: 8, stringNumber: 40 });
    assert.strictEqual(s40.identity.localEsNumber, 20);
    assert.strictEqual(s40.identity.pairedStringNumber, 39);
    assert.strictEqual(s40.identity.featherIp, "10.0.8.105");
    console.log("  -> Test 4: Identity mappings for Array 8 String 40 passed!");

    // 2. Contactor aggregate states and expected command match
    const scClosed = buildCanonicalStringState({
        arrayNumber: 1, stringNumber: 1,
        positiveContactorClosed: true,
        negativeContactorClosed: true,
        contactorsCloseExpected: true
    });
    assert.strictEqual(scClosed.contactors.bothContactorsClosed, true);
    assert.strictEqual(scClosed.contactors.contactorFeedbackKnown, true);
    assert.strictEqual(scClosed.contactors.contactorMismatch, false);
    assert.strictEqual(scClosed.contactors.displayState, "CLOSED");
    assert.strictEqual(scClosed.contactors.commandMatchesContactors, true);
    console.log("  -> Test 5: Contactors CLOSED & Command match passed!");

    const scMismatch = buildCanonicalStringState({
        arrayNumber: 1, stringNumber: 1,
        positiveContactorClosed: true,
        negativeContactorClosed: false,
        contactorsCloseExpected: true
    });
    assert.strictEqual(scMismatch.contactors.bothContactorsClosed, false);
    assert.strictEqual(scMismatch.contactors.contactorMismatch, true);
    assert.strictEqual(scMismatch.contactors.commandMatchesContactors, false);
    assert.strictEqual(scMismatch.contactors.displayState, "OPEN / PARTIAL");
    console.log("  -> Test 6: Contactors Mismatch / Partial passed!");

    // 3. Rotation aggregate states
    const scRotationIn = buildCanonicalStringState({
        arrayNumber: 1, stringNumber: 1,
        outRotation: false
    });
    assert.strictEqual(scRotationIn.rotation.inRotation, true);
    assert.strictEqual(scRotationIn.rotation.outOfRotation, false);
    assert.strictEqual(scRotationIn.rotation.displayState, "IN");
    console.log("  -> Test 7: Rotation IN state passed!");

    const scRotationOut = buildCanonicalStringState({
        arrayNumber: 1, stringNumber: 1,
        outRotation: true
    });
    assert.strictEqual(scRotationOut.rotation.inRotation, false);
    assert.strictEqual(scRotationOut.rotation.outOfRotation, true);
    assert.strictEqual(scRotationOut.rotation.displayState, "OUT");
    console.log("  -> Test 8: Rotation OUT state passed!");

    // 4. Communication status
    const scCommOnline = buildCanonicalStringState({
        arrayNumber: 1, stringNumber: 1,
        communicating: true
    });
    assert.strictEqual(scCommOnline.communication.communicating, true);
    assert.strictEqual(scCommOnline.communication.displayState, "ONLINE");
    console.log("  -> Test 9: Communication ONLINE passed!");

    const scCommOffline = buildCanonicalStringState({
        arrayNumber: 1, stringNumber: 1,
        communicating: false
    });
    assert.strictEqual(scCommOffline.communication.communicating, false);
    assert.strictEqual(scCommOffline.communication.displayState, "OFFLINE");
    console.log("  -> Test 10: Communication OFFLINE passed!");

    // 5. Buckets (online, nearline, offline, notCommunicating, unknown)
    const scOnlineBucket = buildCanonicalStringState({
        arrayNumber: 1, stringNumber: 1,
        communicating: true,
        outRotation: false,
        positiveContactorClosed: true,
        negativeContactorClosed: true
    });
    assert.strictEqual(scOnlineBucket.health.operationalBucket, "Online");
    console.log("  -> Test 11: Bucket Online passed!");

    const scNearlineBucket = buildCanonicalStringState({
        arrayNumber: 1, stringNumber: 1,
        communicating: true,
        outRotation: false,
        positiveContactorClosed: false,
        negativeContactorClosed: false
    });
    assert.strictEqual(scNearlineBucket.health.operationalBucket, "Nearline");
    console.log("  -> Test 12: Bucket Nearline passed!");

    const scOfflineBucket = buildCanonicalStringState({
        arrayNumber: 1, stringNumber: 1,
        communicating: true,
        outRotation: true,
        positiveContactorClosed: false,
        negativeContactorClosed: false
    });
    assert.strictEqual(scOfflineBucket.health.operationalBucket, "Offline");
    console.log("  -> Test 13: Bucket Offline passed!");

    const scNotCommBucket = buildCanonicalStringState({
        arrayNumber: 1, stringNumber: 1,
        communicating: false,
        outRotation: false,
        positiveContactorClosed: false,
        negativeContactorClosed: false
    });
    assert.strictEqual(scNotCommBucket.health.operationalBucket, "NotCommunicating");
    console.log("  -> Test 14: Bucket NotCommunicating passed!");

    // 6. BPC counts
    const scBpcEmpty = buildCanonicalStringState({
        arrayNumber: 1, stringNumber: 1
    });
    assert.strictEqual(scBpcEmpty.bpcs.knownCount, 0);
    assert.strictEqual(scBpcEmpty.bpcs.expectedCount, 14);
    console.log("  -> Test 15: BPC empty default passed!");

    const scBpcEnriched = buildCanonicalStringState({
        arrayNumber: 1, stringNumber: 1,
        bpcCount: 14
    });
    assert.strictEqual(scBpcEnriched.bpcs.knownCount, 14);
    assert.strictEqual(scBpcEnriched.bpcs.expectedCount, 14);
    console.log("  -> Test 16: BPC enriched with count passed!");

    // 7. Numeric null handling
    const scNulls = buildCanonicalStringState({
        arrayNumber: 1, stringNumber: 1,
        amps: undefined,
        kw: null,
        minCellVoltage: undefined,
        maxCellVoltage: null
    });
    assert.strictEqual(scNulls.electrical.currentA, null);
    assert.strictEqual(scNulls.electrical.powerKw, null);
    assert.strictEqual(scNulls.electrical.minCellVoltageMv, null);
    assert.strictEqual(scNulls.electrical.maxCellVoltageMv, null);
    assert.strictEqual(scNulls.electrical.deltaCellVoltageMv, null);
    console.log("  -> Test 17: Numeric null handling passed!");

    console.log("All Canonical String Dashboard and Parser Tests passed successfully!");
}

try {
    runTests();
} catch (err: any) {
    console.error("Test execution failed:", err);
    process.exit(1);
}
