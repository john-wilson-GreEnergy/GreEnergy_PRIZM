import "../../../scripts/test-network-guard.cjs";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import {OperationalTimeline} from "./operationalTimeline";
import type {TimelineBatch, TimelineObservation} from "./operationalTimelineModel";

const root = await fs.mkdtemp("/tmp/prizm-timeline-queue-");
const now = Date.now();
const site = {id: "fixture-a", label: "Fixture A"};
const options = {maxBytes: 10_000_000, reserveBytes: 0};
function batch(index: number, identity = site): TimelineBatch {
  return {site: {...identity}, observations: [{array: 1, entity: "string:1:1", string: 1, label: "Array 1 / String 1",
    stream: "string-state", source: "fixture", observedAt: now + index, sourceAt: now + index, quality: "live",
    values: {Contactors: index % 2 ? "CLOSED" : "OPEN"}}]};
}
function command(index: number): TimelineObservation {
  return {...batch(index).observations[0], stream: "command", values: {Summary: "Fixture command entry only", commandId: "fixture-only"}};
}
async function records(directory: string) {
  const names = (await fs.readdir(directory)).filter(name => name.endsWith(".jsonl"));
  const rows: {observation: TimelineObservation; events: {message: string}[]}[] = [];
  for (const name of names) for (const line of (await fs.readFile(path.join(directory, name), "utf8")).split("\n").filter(Boolean)) rows.push(JSON.parse(line));
  return rows;
}
const storage = new OperationalTimeline(path.join(root, "burst"), options, () => now + 1000);
const first = batch(0);
storage.ingest(first);
first.observations[0].values.Contactors = "MUTATED";
first.site.id = "wrong-site";
const entry = command(1);
storage.recordCommand(site, entry);
entry.values.Summary = "MUTATED";
for (let i = 1; i < 24; i++) storage.ingest(batch(i));
assert.equal(storage.status().pendingBatches, 24, "Burst enqueues synchronously while disk writes run separately");
assert.equal(storage.status().pendingCommands, 1);
assert.equal(storage.status().droppedBatches, 0);
assert(storage.status().pendingBytes > 0);
const closing = storage.close();
storage.ingest(batch(25)); storage.recordCommand(site, command(26));
await closing;
const burst = await records(storage.directory);
assert.equal(burst.length, 25, "Close drains accepted telemetry and command entries without accepting late work");
assert.equal(burst[0].observation.values.Contactors, "OPEN");
assert.equal(burst[1].observation.values.Summary, "Fixture command entry only");
assert.deepEqual(burst.filter(row => row.observation.stream !== "command").map(row => row.observation.sourceAt), Array.from({length: 24}, (_, i) => now + i));
assert.equal(burst.filter(row => row.events.some(e => e.message.includes(" → "))).length, 23, "All transient state changes survive the burst");
assert.equal(storage.status().pendingBatches, 0); assert.equal(storage.status().pendingBytes, 0); assert.equal(storage.status().pendingCommands, 0);
await assert.rejects(fs.stat(path.join(storage.directory, "writer.json")), {code: "ENOENT"});

const fleet = new OperationalTimeline(path.join(root, "fleet"), options, () => now + 1000);
for (let cycle = 0; cycle < 8; cycle++) {
  fleet.ingest({site, observations: Array.from({length: 320}, (_, index) => {
    const array = Math.floor(index / 40) + 1, string = index % 40 + 1;
    return {...batch(cycle).observations[0], array, string, entity: `string:${array}:${string}`, label: `Array ${array} / String ${string}`};
  })});
}
assert.equal(fleet.status().pendingBatches, 8);
await fleet.close();
assert.equal((await records(fleet.directory)).length, 2560, "Eight full-site bursts retain every configured string across all eight array shards");
assert.equal(fleet.status().droppedBatches, 0); assert.equal(fleet.status().error, null);

const limited = new OperationalTimeline(path.join(root, "limited"), {...options, maxPendingBatches: 2}, () => now + 1000);
for (let i = 0; i < 3; i++) limited.ingest(batch(i));
limited.recordCommand(site, command(3));
assert.equal(limited.status().droppedBatches, 1);
assert.match(limited.status().lastDropReason!, /batch limit/);
await limited.flush();
limited.ingest(batch(4)); await limited.close();
assert.equal((await records(limited.directory)).length, 4, "Overflow rejects newest telemetry, reserves command capacity and recovers after drain");
assert.equal(limited.status().droppedCommands, 0);

const bytes = Buffer.byteLength(JSON.stringify(batch(0)));
const byteLimited = new OperationalTimeline(path.join(root, "bytes"), {...options, maxPendingBytes: bytes}, () => now + 1000);
byteLimited.ingest(batch(0)); byteLimited.ingest(batch(2));
assert.equal(byteLimited.status().pendingBytes, bytes);
assert.equal(byteLimited.status().droppedBatches, 1);
assert.match(byteLimited.status().lastDropReason!, /byte limit/);
await byteLimited.close();
assert.equal((await records(byteLimited.directory)).length, 1);

const failed = new OperationalTimeline(path.join(root, "failed"), {...options, maxBytes: 1}, () => now + 1000);
for (let i = 0; i < 3; i++) failed.ingest(batch(i));
failed.recordCommand(site, command(3)); await failed.close();
assert.match(failed.status().error!, /storage cap/);
assert.equal(failed.status().droppedBatches, 3, "All unwritten queued batches are accounted for on disk failure");
assert.equal(failed.status().droppedCommands, 1);
assert.equal(failed.status().pendingBatches, 0); assert.equal(failed.status().pendingBytes, 0);

let delayedClock = now;
const delayed = new OperationalTimeline(path.join(root, "delayed"), options, () => delayedClock);
const freshElectrical = batch(0); freshElectrical.observations[0].stream = "electrical";
freshElectrical.observations[0].values = {kw: 5}; delayed.ingest(freshElectrical);
const alreadyStale = batch(1); alreadyStale.observations[0].sourceAt = now - 180_000;
delayed.ingest(alreadyStale);
delayedClock += 240_000; // Delay persistence without delaying or relabeling the observation.
await delayed.close();
const delayedRows = await records(delayed.directory);
assert.equal(delayedRows[0].observation.quality, "live", "Writer delay cannot fabricate a historical telemetry outage");
assert.equal(delayedRows[0].observation.observedAt, now);
assert.equal(delayedRows[1].observation.quality, "unavailable", "Telemetry stale when observed remains unavailable");

const sites = new OperationalTimeline(path.join(root, "sites"), options, () => now + 1000);
sites.ingest(batch(0)); sites.ingest(batch(1));
const other = {id: "fixture-b", label: "Fixture B"};
sites.ingest(batch(2, other)); sites.ingest(batch(3, other));
await sites.flush();
const otherReport = await sites.query(1, 1);
assert.equal(otherReport.site, "Fixture B"); assert.equal(otherReport.samples, 2);
assert.equal(otherReport.events.filter(e => e.message.includes(" → ")).length, 1);
sites.ingest({site, observations: []}); await sites.flush();
const firstReport = await sites.query(1, 1);
assert.equal(firstReport.site, "Fixture A"); assert.equal(firstReport.samples, 2);
assert(firstReport.events.some(e => e.message === "Contactors: OPEN → CLOSED"), "A queued site switch does not clear a preceding write's baseline");
await sites.close();

const oldFlag = process.env.PRIZM_TIMELINE_BUFFERING;
try {
  process.env.PRIZM_TIMELINE_BUFFERING = "false";
  const legacy = new OperationalTimeline(path.join(root, "legacy"), options, () => now + 1000);
  legacy.ingest(batch(0)); legacy.ingest(batch(1));
  assert.equal(legacy.status().bufferingEnabled, false);
  assert.equal(legacy.status().droppedBatches, 1);
  assert.match(legacy.status().lastDropReason!, /buffering disabled/);
  await legacy.close(); assert.equal((await records(legacy.directory)).length, 1);
} finally {
  if (oldFlag === undefined) delete process.env.PRIZM_TIMELINE_BUFFERING; else process.env.PRIZM_TIMELINE_BUFFERING = oldFlag;
}
console.log("Timeline queue: immutable ordered bursts, transient states, command interleaving, limits, error accounting, site isolation, shutdown and rollback passed; no device requests");
