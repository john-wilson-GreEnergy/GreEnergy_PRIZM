import assert from "node:assert/strict";
import {projectNotificationTimeline} from "./notificationTimelineProjection";
import {timelineChanges} from "./operationalTimelineModel";

const at = 1_800_000_000_000;
const active = projectNotificationTimeline([{severity:"warning",code:"2074",faultName:"Balancer warning",affectedTargets:[{arrayIndex:3,stringIndex:8,bpcIndex:2}]}], at, [1,2,3]);
assert.equal(active.length, 4);
assert.equal(active[0].scope, "block");
assert.equal(active[3].array, 3);
assert.equal(active[3].values["Warning count"], 1);
assert.match(String(active[3].values["Active notifications"]), /2074.*A3.*S8.*B2/);

const cleared = projectNotificationTimeline([], at + 10_000, [1,2,3])[0];
const changes = timelineChanges(active[0], cleared);
assert.ok(changes.some(event => event.message.includes("Warning count: 1 → 0")));
assert.ok(changes.some(event => event.message.includes("Active notifications:")));

console.log("notification timeline projection tests passed");
