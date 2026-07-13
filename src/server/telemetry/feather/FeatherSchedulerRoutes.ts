import express from "express";
import { getTelemetryCycleId } from "../TelemetryCycleContext";
import { featherScheduler } from "./FeatherScheduler";
import type { FeatherPriorityClass } from "./FeatherTypes";

export const featherSchedulerRouter = express.Router();
const loopback = (req: express.Request) => [req.ip, req.socket.remoteAddress].filter(Boolean).map(String).some((address) => address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1");

featherSchedulerRouter.get("/scheduler", (_req, res) => res.json(featherScheduler.getSchedulerState()));

featherSchedulerRouter.post("/refresh", async (req, res) => {
  if (!loopback(req) && process.env.PRIZM_ALLOW_REMOTE_DEBUG_RESET !== "true") return res.status(403).json({ success: false, error: "Feather refresh is restricted to loopback clients." });
  const reason = String(req.body?.reason || "debug-read-only-refresh");
  let ips: string[] = [];
  if (typeof req.body?.deviceIp === "string") ips = [req.body.deviceIp];
  else if (Array.isArray(req.body?.deviceIps)) ips = [...new Set<string>(req.body.deviceIps.map((value: unknown) => String(value)))].slice(0, 2000);
  else if (["ON_DEMAND", "HOT", "WARM", "COLD"].includes(req.body?.priority)) ips = featherScheduler.requestPriorityRefresh(req.body.priority as FeatherPriorityClass, reason);
  else if (req.body?.fullSweep === true) ips = featherScheduler.requestFullRefresh(reason);
  else return res.status(400).json({ success: false, error: "Provide deviceIp, deviceIps, priority, or fullSweep=true." });
  featherScheduler.requestRefreshMany(ips, reason);
  const snapshots = await featherScheduler.refreshControllers(ips.slice(0, featherScheduler.config.maxRefreshesPerCycle), reason, getTelemetryCycleId());
  const diagnostics = req.body?.includeDiagnostics === true && ips.length === 1 ? await featherScheduler.requestDiagnostics(ips[0], reason) : undefined;
  res.json({ success: true, readOnly: true, requested: ips.length, refreshed: snapshots.filter(Boolean).length, ...(diagnostics ? { diagnostics } : {}), scheduler: featherScheduler.getSchedulerState() });
});
