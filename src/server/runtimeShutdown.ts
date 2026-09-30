import type {Server} from "node:http";
import type {RequestHandler, Response} from "express";

let stopping = false;
export const isRuntimeStopping = () => stopping;

type ShutdownHooks = {
  stop: () => void;
  drain: () => Promise<void>;
  close: () => Promise<void>;
};

export class RuntimeShutdown {
  private responses = new Set<Response>();
  private running: Promise<number> | null = null;

  readonly middleware: RequestHandler = (_req, res, next) => {
    if (stopping) {
      res.setHeader("Connection", "close");
      res.status(503).json({error: "PRIZM is shutting down; retry after restart"});
      return;
    }
    this.responses.add(res);
    const done = () => this.responses.delete(res);
    res.once("finish", done);
    res.once("close", done);
    next();
  };

  constructor(
    private hooks: ShutdownHooks,
    private log = (message: string) => console.log(message),
    private drainTimeoutMs = 15_000,
  ) {}

  run(server: Server): Promise<number> {
    if (this.running) return this.running;
    stopping = true;
    this.running = this.finish(server);
    return this.running;
  }

  private async finish(server: Server): Promise<number> {
    let failed = false;
    this.log("[Shutdown] Rejecting new requests and stopping scheduled work");
    server.close();
    server.closeIdleConnections();
    try { this.hooks.stop(); }
    catch (error) { failed = true; this.log(`[Shutdown] Stop failed: ${String(error)}`); }

    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    let waiting = true;
    try {
      await Promise.race([
        new Promise<never>((_, reject) => {
          drainTimer = setTimeout(() => reject(new Error("Work drain exceeded its deadline; closing recorders before process deadline")), this.drainTimeoutMs);
        }),
        Promise.all([
          this.hooks.drain(),
          (async () => {
            while (waiting && this.responses.size) {
              // Permanent SSE subscriptions reconnect after restart.
              for (const res of this.responses) {
                if (String(res.getHeader("Content-Type")).includes("text/event-stream")) res.end();
              }
              await new Promise(resolve => setTimeout(resolve, 25));
            }
          })(),
        ]),
      ]);
    } catch (error) {
      failed = true;
      this.log(`[Shutdown] Drain failed: ${String(error)}`);
    } finally {
      waiting = false;
      if (drainTimer) clearTimeout(drainTimer);
    }

    // Close rejects late ingests, waits for queued writes/fsync, then releases
    // only the recorder's own lock. Never delete locks on the hard timeout.
    try { await this.hooks.close(); }
    catch (error) { failed = true; this.log(`[Shutdown] Recorder close failed: ${String(error)}`); }
    server.closeAllConnections();
    this.log(failed ? "[Shutdown] Finished with errors" : "[Shutdown] Recordings flushed; locks released; shutdown complete");
    return failed ? 1 : 0;
  }

  install(server: Server, timeoutMs = 30_000) {
    if (process.env.PRIZM_GRACEFUL_SHUTDOWN === "false") return;
    const stop = () => {
      if (this.running) return;
      const deadline = setTimeout(() => {
        console.error("[Shutdown] Deadline exceeded; pending work may be incomplete. Unreleased writer locks are retained for crash recovery.");
        server.closeAllConnections();
        process.exit(1);
      }, timeoutMs);
      void this.run(server).then(code => {
        clearTimeout(deadline);
        process.exit(code);
      }, error => {
        console.error("[Shutdown] Failed", error);
        process.exit(1);
      });
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
  }
}
