import assert from "node:assert/strict";
import { isSupportedFeatherIp, SERIAL_CONNECTION_TYPES } from "./featherSerialService";

assert.deepEqual(SERIAL_CONNECTION_TYPES, ["rxtx", "pjc", "rodbus"]);
assert.equal(isSupportedFeatherIp("10.0.1.3"), true);
assert.equal(isSupportedFeatherIp("10.0.1.10"), true);
assert.equal(isSupportedFeatherIp("10.0.8.105"), true);
assert.equal(isSupportedFeatherIp("10.0.8.110"), true);
assert.equal(isSupportedFeatherIp("10.0.1.11"), false);
assert.equal(isSupportedFeatherIp("10.0.1.111"), false);
assert.equal(isSupportedFeatherIp("10.0.1.999"), false);
assert.equal(isSupportedFeatherIp("not-an-ip"), false);

console.log("Feather serial target validation tests passed.");
