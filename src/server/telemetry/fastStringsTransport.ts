import type { Request, Response } from 'express';
import type { EncodedJson } from './EncodedJsonCache';

export const fastStringsTransportEnabled = () => process.env.PRIZM_FAST_STRINGS_TRANSPORT !== 'false';

export function sendFastStringsResponse(req: Pick<Request, 'acceptsEncodings'>, res: Response, encoded: EncodedJson) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('X-PRIZM-Snapshot-Bytes', String(encoded.bytes));
  const encoding = req.acceptsEncodings('gzip', 'identity');
  if (!encoding) return res.status(406).end();
  if (encoding === 'gzip') {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Length', String(encoded.gzip.length));
    return res.end(encoded.gzip);
  }
  res.setHeader('Content-Length', String(encoded.bytes));
  return res.end(encoded.json);
}
