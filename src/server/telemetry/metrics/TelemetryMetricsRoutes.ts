import express from "express";
import { telemetryMetrics } from "./TelemetryMetrics";

export const telemetryMetricsRouter = express.Router();

function isLoopbackRequest(req: express.Request): boolean {
  const addresses = [req.ip, req.socket.remoteAddress].filter(Boolean).map(String);
  return addresses.some((address) => address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1");
}

telemetryMetricsRouter.get("/performance", (_req, res) => {
  res.json(telemetryMetrics.report());
});

telemetryMetricsRouter.post("/performance/reset", (req, res) => {
  if (!isLoopbackRequest(req) && process.env.PRIZM_ALLOW_REMOTE_DEBUG_RESET !== "true") {
    return res.status(403).json({
      success: false,
      error: "Telemetry performance reset is restricted to loopback requests.",
    });
  }

  res.json({ success: true, performance: telemetryMetrics.reset() });
});

export { isLoopbackRequest };
