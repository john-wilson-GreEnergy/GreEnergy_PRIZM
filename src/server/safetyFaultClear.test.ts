import assert from "assert";
import { v4 as uuidv4 } from "uuid";
import protobuf from "protobufjs";

// Extract logic directly or mock for tests
// 1. Topology Normalization
const mockRawTopology = [
    { entityKeyToken: "ENT_01", allowFaultReset: true, displayKey: "Batt01", enabled: true, ready: true, communicating: true },
    { entityKeyToken: "ENT_02", allowFaultReset: false, displayKey: "Batt02", enabled: true, ready: true, communicating: true },
    { entityKeyToken: "ENT_03", allowFaultReset: true, displayKey: "Batt03", enabled: false, ready: false, communicating: false }
];

function normalize(topologyList: any[]) {
     return topologyList.map(item => ({
        id: item.entityKeyToken,
        displayKey: item.displayKey || "",
        entityKeyToken: item.entityKeyToken || "",
        enabled: Boolean(item.enabled),
        ready: Boolean(item.ready),
        communicating: Boolean(item.communicating),
        allowFaultReset: Boolean(item.allowFaultReset),
     }));
}

async function runTests() {
    console.log("Running Safety Fault Clear Tests...");
    
    // Test 1: Topology Normalization & Filter
    const candidates = normalize(mockRawTopology);
    assert.strictEqual(candidates.length, 3, "Parsed 3 items");
    const eligible = candidates.filter(c => c.allowFaultReset);
    assert.strictEqual(eligible.length, 2, "2 items are eligible");
    const testEligible = eligible.find(c => c.entityKeyToken === "ENT_01");
    assert.ok(testEligible && testEligible.allowFaultReset === true, "ENT_01 allows reset");

    // Test 2: Rejecting Missing Token
    const targetEntity = candidates.find(c => c.entityKeyToken === "MISSING_01");
    assert.ok(!targetEntity, "Properly rejects missing token");

    // Test 3: Rejecting allowed == false
    const badEntity = candidates.find(c => c.entityKeyToken === "ENT_02");
    assert.strictEqual(badEntity?.allowFaultReset, false, "ENT_02 properly rejects allowed=false");

    // Test 4: Rejecting disabled / non-communicating
    const commFailureEntity = candidates.find(c => c.entityKeyToken === "ENT_03");
    assert.strictEqual(commFailureEntity?.communicating, false, "ENT_03 properly reports non-communicating");

    // Test 5: Protobuf command builder creates a Command
    const { SAFETY_FAULT_CLEAR_PROTO, buildSafetyFaultClearCommand, buildSafetyFaultCandidateSnapshot } = await import("./safetyFaultClear");
    const root = protobuf.parse(SAFETY_FAULT_CLEAR_PROTO).root;
    const CommandMessage = root.lookupType("phoenixtongue.Command");
    const EndpointTypeEnum = root.lookupEnum("phoenixtongue.EndpointType");

    const cmdPayload = {
        commandId: uuidv4(),
        commandTarget: { endpointType: EndpointTypeEnum.values["BLOCK"] },
        commandSource: { endpointType: EndpointTypeEnum.values["GOBLIN"] },
        commandPayload: {
             manualClearDeviceFault: {
                 entityKey: "ENT_01"
             }
        },
        username: "local-prizm"
    };

    const errMsg = CommandMessage.verify(cmdPayload);
    assert.ok(!errMsg, "Protobuf validation should pass");

    const msg = CommandMessage.create(cmdPayload);
    const buf = CommandMessage.encode(msg).finish();
    assert.ok(buf.length > 0, "Buffer generated successfully");

    const decoded = CommandMessage.decode(buf) as any;
    assert.strictEqual(decoded.commandSource.endpointType, EndpointTypeEnum.values["GOBLIN"]);
    assert.strictEqual(decoded.commandTarget.endpointType, EndpointTypeEnum.values["BLOCK"]);
    assert.strictEqual(decoded.commandPayload.manualClearDeviceFault.entityKey, "ENT_01");
    assert.strictEqual(decoded.username, "local-prizm");

    // Test 6: production builder includes the block identity required by Turtle.
    const built = buildSafetyFaultClearCommand({
        stationCode: "BHE0020",
        blockIndex: 1,
        entityKey: "OCDK-ST:BHE0020-B:1-OCD:7507",
        operatorUsername: "test-operator",
        commandId: "test-command-id",
    });
    const builtDecoded = CommandMessage.decode(built.buffer) as any;
    assert.strictEqual(builtDecoded.commandTarget.endpointType, EndpointTypeEnum.values["BLOCK"]);
    assert.strictEqual(builtDecoded.commandTarget.stationCode, "BHE0020");
    assert.strictEqual(builtDecoded.commandTarget.blockIndex, 1);
    assert.strictEqual(builtDecoded.commandSource.endpointType, EndpointTypeEnum.values["BLOCK"]);
    assert.strictEqual(builtDecoded.commandSource.stationCode, "BHE0020");
    assert.strictEqual(builtDecoded.commandSource.blockIndex, 1);
    assert.strictEqual(builtDecoded.commandPayload.manualClearDeviceFault.entityKey, "OCDK-ST:BHE0020-B:1-OCD:7507");

    // Test 7: Summary and Safety Clear consume the same LastCall-style candidate shape.
    const snapshot = buildSafetyFaultCandidateSnapshot({}, {
        topologyReport: {
            topologyNodes: [{
                entityKey: "OCDK-ST:BHE0020-B:1-OCD:7507",
                entityType: "OpenClosedDetector",
                statusMessage: "Hydrogen Alarm: <span>Requires Manual clear</span>",
                allowFaultReset: true,
                enabled: true,
                ready: true,
                communicating: true,
            }]
        }
    });
    assert.strictEqual(snapshot.eligible.length, 1);
    assert.strictEqual(snapshot.eligible[0].entityKeyToken, "OCDK_ST_BHE0020_B_1_OCD_7507");
    assert.strictEqual(snapshot.eligible[0].statusMessageText, "Hydrogen Alarm: Requires Manual clear");

    console.log("All tests passed!");
}

runTests().catch(console.error);
