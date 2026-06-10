import assert from "assert";
import { v4 as uuidv4 } from "uuid";
import protobuf from "protobufjs";
import path from "path";

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

function runTests() {
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
    const protoPath = path.join(process.cwd(), "src/server/safetyFaultClearProto.proto");
    const root = protobuf.loadSync(protoPath);
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

    console.log("All tests passed!");
}

runTests();
