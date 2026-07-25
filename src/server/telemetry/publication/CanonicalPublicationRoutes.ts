import express from 'express';
import { canonicalPublicationRuntime } from './CanonicalPublicationRuntime';

export const canonicalPublicationRouter = express.Router();

canonicalPublicationRouter.get('/', (_req, res) => {
  res.json(canonicalPublicationRuntime.report());
});
