import type {BalancingVerificationJob} from "../server/balancingVerification";
export type VerificationView = BalancingVerificationJob & {summary: {total: number; verified: number; persisted: number; pending: number; unresolved: number}};
// This observes an existing command job only. It never requests telemetry from
// equipment or posts a command. Reopening the page resumes the same job ID.
export function observeBalancingVerification(id: string, receive: (job: VerificationView) => void, fail: (message: string) => void) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const started = Date.now();
  const poll = async () => {
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 10_000);
    let done = false;
    try {
      const response = await fetch(`/api/local/balancing/verification/${encodeURIComponent(id)}`, {signal: controller.signal});
      if (response.status === 404) {done = true; throw new Error("Verification expired or server restarted. Equipment state is unknown; no command was resent.");}
      if (!response.ok) throw new Error("Verification temporarily unavailable. Checking again; no command will be resent.");
      const job: VerificationView = await response.json();
      if (!stopped) receive(job);
      done = job.status === "complete";
    } catch (error) {if (!stopped) fail(error instanceof Error ? error.message : "Verification unavailable");}
    finally {clearTimeout(timeout);}
    if (!stopped && !done) {
      if (Date.now() - started < 10 * 60_000) timer = setTimeout(poll, 4000);
      else fail("Verification exceeded its observation window. Inspect equipment readback before issuing another command.");
    }
  };
  void poll();
  return () => {stopped = true; clearTimeout(timer); controller?.abort();};
}
