import express from "express";
import { stringViewerScheduler } from "./StringViewerScheduler";

export const stringViewerRouter = express.Router();

function isLoopback(req: express.Request): boolean {
  return [req.ip, req.socket.remoteAddress].filter(Boolean).map(String).some((address) => address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1");
}

stringViewerRouter.get("/scheduler", (_req, res) => {
  res.json(stringViewerScheduler.getDebugState());
});

stringViewerRouter.post("/refresh", async (req, res) => {
  if (!isLoopback(req) && process.env.PRIZM_ALLOW_REMOTE_DEBUG_RESET !== "true") {
    return res.status(403).json({ success: false, error: "StringViewer refresh requests are restricted to loopback clients." });
  }
  const reason = String(req.body?.reason || "debug-read-only-refresh");
  let requested = 0;
  if (typeof req.body?.stringKey === "string") {
    stringViewerScheduler.requestRefresh(req.body.stringKey, reason);
    requested = 1;
  } else if (Array.isArray(req.body?.stringKeys)) {
    const keys = req.body.stringKeys.map(String).slice(0, 320);
    stringViewerScheduler.requestRefreshMany(keys, reason);
    requested = keys.length;
  } else if (Number.isSafeInteger(Number(req.body?.arrayIndex))) {
    requested = stringViewerScheduler.requestArrayRefresh(Number(req.body.arrayIndex), reason);
  } else if (req.body?.fullSweep === true) {
    requested = stringViewerScheduler.requestFullSweep(reason);
  } else {
    return res.status(400).json({ success: false, error: "Provide stringKey, stringKeys, arrayIndex, or fullSweep=true." });
  }
  const { requestRefresh } = await import("../../prizmDataCoordinator");
  requestRefresh(`stringviewer:${reason}`);
  res.status(202).json({ success: true, requested, readOnly: true, scheduler: stringViewerScheduler.getDebugState() });
});
