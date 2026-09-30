import assert from "node:assert/strict";
import { buildHvacTargetsFromSources } from "./hvacSimulationService";
import { DiscoveryCandidate, FeatherNormalizedStatus } from "../feather/featherTypes";

const candidates: DiscoveryCandidate[] = [
  {
    deviceIp: "10.0.8.3",
    sourceDiscoveryMethod: "topology-profile",
    arrayIndex: 8,
    segment: 3,
    entityName: "Array 8 CS",
    isCollectionSegment: true
  },
  {
    deviceIp: "10.0.8.10",
    sourceDiscoveryMethod: "topology-profile",
    arrayIndex: 8,
    segment: 10,
    entityName: "Array 8 ES 1"
  },
  {
    deviceIp: "10.0.8.12",
    sourceDiscoveryMethod: "string-ip-map",
    arrayIndex: 8,
    stringIndex: 1,
    entityName: "Array 8 String 1 Controller",
    excluded: true,
    excludeReason: "string-controller-or-inferred-es-host"
  }
];

const cachedDevices = [
  { deviceIp: "10.0.8.3", arrayIndex: 8, reachable: true, entityName: "Feather 10.0.8.3" },
  { deviceIp: "10.0.8.10", arrayIndex: 8, reachable: true, entityName: "Feather 10.0.8.10" },
  { deviceIp: "10.0.8.12", arrayIndex: 8, stringIndex: 1, reachable: false, entityName: "Array 8 String 1 Controller" },
  { deviceIp: "10.0.8.13", arrayIndex: 8, stringIndex: 2, reachable: false, entityName: "Array 8 String 2 Controller" }
] as FeatherNormalizedStatus[];

const targets = buildHvacTargetsFromSources(candidates, cachedDevices, "2026-09-30T00:00:00.000Z");

assert.deepEqual(targets.map(target => target.ip), ["10.0.8.3", "10.0.8.10"]);
assert.equal(targets.every(target => target.reachable), true);
assert.equal(targets.every(target => target.source === "feather-cache"), true);
assert.equal(targets[0].isCollectionSegment, true);

console.log("HVAC simulation target filtering tests passed!");
