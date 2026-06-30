import express from "express";
import { executeContactorControl } from "./contactorControlService";

export const contactorControlRouter = express.Router();

contactorControlRouter.post("/", async (req, res) => {
  try {
    const result = await executeContactorControl(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to execute contactor control" });
  }
});
