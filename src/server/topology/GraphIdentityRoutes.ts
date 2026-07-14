import express from 'express';
import { graphIdentityResolver } from './GraphIdentityResolver';

export const graphIdentityRouter = express.Router();

graphIdentityRouter.get('/identity', (_req, res) => {
  res.json(graphIdentityResolver.report());
});
