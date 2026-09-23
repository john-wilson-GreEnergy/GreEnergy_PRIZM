import assert from "node:assert/strict";
import {observeBalancingVerification} from "./balancingVerificationClient";
const originalFetch = globalThis.fetch;
const calls: string[] = [];
try {
  globalThis.fetch = (async (url: string, options?: RequestInit) => {
    calls.push(String(url)); assert(!options?.method || options.method === "GET");
    return new Response(JSON.stringify({status: "complete", strings: [], summary: {total: 0}}), {status: 200});
  }) as typeof fetch;
  await new Promise<void>((resolve, reject) => {observeBalancingVerification("job-id", job => {assert.equal(job.status, "complete"); resolve();}, reject);});
  assert.deepEqual(calls, ["/api/local/balancing/verification/job-id"]);
  globalThis.fetch = (async () => new Response("{}", {status: 404})) as typeof fetch;
  await new Promise<void>((resolve, reject) => {observeBalancingVerification("expired", () => reject(new Error("Unexpected result")), message => {assert.match(message, /server restarted/); resolve();});});
  console.log("Job observation uses GET only and reports lost verification without resending");
} finally {globalThis.fetch = originalFetch;}
