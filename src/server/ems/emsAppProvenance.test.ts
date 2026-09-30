import assert from "node:assert/strict";
import {emsAppRows, emsAppProvenance, stampEmsAppResponse} from "./emsAppProvenance";
const app = {appCode: "ADB0001", priority: 300, enabled: true, health: "HEALTH_HEALTHY"};
const at = "2026-09-23T19:00:00Z", base = "http://fixture:8080/turtle";
assert.equal(emsAppProvenance(app).sourceLive, false, "Disk/test cache is not live acquisition");
for (const payload of [{dragonApps:[app]}, {apps:[app]}, {emsApps:[app]}, {data:{dragonApps:[app]}}, {data:[app]}, [app]]) {
  assert.deepEqual(emsAppRows(payload), [app]);
}
stampEmsAppResponse({dragonApps:[app]}, at, base, true);
assert.deepEqual(emsAppProvenance(app), {sourceTimestampUtc:at,sourceBaseUrl:base,sourceLive:true});
stampEmsAppResponse({arrayPcsList:[]}, "2026-09-23T19:01:00Z", base, true);
assert.equal(emsAppProvenance(app).sourceTimestampUtc, at, "A response omitting apps cannot refresh retained rows");
app.enabled = false;
assert.equal(emsAppProvenance(app).sourceLive, false, "Local cache mutations are not fresh EMS observations");
stampEmsAppResponse({dragonApps:[app]}, at, base, false);
assert.equal(emsAppProvenance(app).sourceLive, false, "Fallback/mock acquisition remains unavailable");
const fresh = {...app}; stampEmsAppResponse({dragonApps:[fresh]}, at, base, true);
assert.equal(emsAppProvenance(fresh).sourceLive, true);
assert.equal(emsAppProvenance({...fresh}).sourceLive, false, "Unproven copies cannot acquire freshness");
console.log("EMS app response provenance, cache retention, local mutation and fallback tests passed");
