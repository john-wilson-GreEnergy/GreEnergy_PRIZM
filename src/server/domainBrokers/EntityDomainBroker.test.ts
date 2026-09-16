import assert from "node:assert/strict";
import { EntityDomainBroker } from "./EntityDomainBroker";

const broker = new EntityDomainBroker<any>("test", (row) => row.id);
assert.equal(broker.publish([{ id: "a", value: 1 }], "2026-01-01T00:00:02Z").changes.length, 1);
assert.equal(broker.publish([{ id: "a", value: 0 }], "2026-01-01T00:00:01Z").changes.length, 0);
assert.equal(broker.snapshot().rows[0].value, 1);
assert.equal(broker.patch("a", { value: 2 }, "2026-01-01T00:00:03Z").changes.length, 1);
assert.equal(broker.snapshot().rows[0].value, 2);
console.log("EntityDomainBroker tests passed");
