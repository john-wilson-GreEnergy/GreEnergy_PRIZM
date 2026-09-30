import {Router} from "express";
import {operationalTimeline} from "./operationalTimeline";
export const operationalTimelineRouter = Router();
operationalTimelineRouter.get("/", (_req, res) => res.json(operationalTimeline().status()));
operationalTimelineRouter.get("/review", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {res.json(await operationalTimeline().query(Number(req.query.array), Number(req.query.hours), req.query.string === undefined ? null : Number(req.query.string)));}
  catch (error) {res.status(400).json({error: error instanceof Error ? error.message : String(error)});}
});
