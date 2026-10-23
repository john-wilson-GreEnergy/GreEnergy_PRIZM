import type {RequestHandler} from 'express';

/** Dedicated acquisition process: no legacy UI, API or equipment-control routes. */
export function collectorOnlyEnabled(value = process.env.PRIZM_COLLECTOR_ONLY): boolean {
  if (value === undefined || value === 'false') return false;
  if (value !== 'true') throw new Error('PRIZM_COLLECTOR_ONLY must be true or false');
  return true;
}

export function collectorOnlyGate(enabled: boolean): RequestHandler {
  return (_req, res, next) => {
    if (!enabled) return next();
    res.set('Cache-Control', 'no-store').status(403).json({error: 'Dedicated collector: legacy routes disabled'});
  };
}

export function collectorLegacyBindAddress(enabled: boolean): string {
  return enabled ? '127.0.0.1' : '0.0.0.0';
}
