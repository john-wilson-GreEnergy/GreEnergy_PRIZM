import {createServer, createConnection, isIPv4, type Server, type Socket} from 'node:net';

export interface FleetEntryConfig {
  bindAddress: string;
  port: number;
  upstreamAddress: string;
  upstreamPort: number;
  maxConnections: number;
  connectTimeoutMs: number;
  idleTimeoutMs: number;
}

const privateAddress = (value: unknown): value is string => {
  if (typeof value !== 'string' || !isIPv4(value)) return false;
  const [a, b] = value.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};
const integer = (value: unknown, fallback: number, min: number, max: number): number => {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || Number(result) < min || Number(result) > max) throw new Error('Invalid entry point limit');
  return Number(result);
};

/** A private administrator config, never a browser-supplied destination. */
export function parseFleetEntryConfig(raw: unknown): FleetEntryConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid entry point configuration');
  const row = raw as Record<string, unknown>;
  const keys = new Set(['bindAddress', 'port', 'upstreamAddress', 'upstreamPort', 'maxConnections', 'connectTimeoutMs', 'idleTimeoutMs', 'allowLoopbackTest','workspaceEntry']);
  if (Object.keys(row).some(key => !keys.has(key))) throw new Error('Unknown entry point option');
  if (row.allowLoopbackTest !== undefined && typeof row.allowLoopbackTest !== 'boolean') throw new Error('Invalid test flag');
  if(row.workspaceEntry!==undefined && typeof row.workspaceEntry!=='boolean')throw Error('Invalid workspace entry flag');
  const test = row.allowLoopbackTest === true;
  if (test ? row.bindAddress !== '127.0.0.1' || row.upstreamAddress !== '127.0.0.1'
    : !privateAddress(row.bindAddress) || !privateAddress(row.upstreamAddress)) throw new Error('Explicit private IPv4 addresses required');
  const config: FleetEntryConfig = {
    bindAddress: row.bindAddress as string,
    port: integer(row.port, 3443, 1024, 65535),
    upstreamAddress: row.upstreamAddress as string,
    upstreamPort: integer(row.upstreamPort, 3443, 1024, 65535),
    maxConnections: integer(row.maxConnections, 64, 1, 256),
    connectTimeoutMs: integer(row.connectTimeoutMs, 3000, 100, 10000),
    idleTimeoutMs: integer(row.idleTimeoutMs, 30000, 100, 120000),
  };
  if (!test && (row.workspaceEntry===true ? ![3444,3445].includes(config.port) || config.upstreamPort!==config.port : config.port !== 3443 || config.upstreamPort !== 3443)) throw new Error('Production entry points require the fixed Fleet or explicitly enabled workspace HTTPS ports');
  if (config.bindAddress === config.upstreamAddress && config.port === config.upstreamPort) throw new Error('Entry point cannot target itself');
  return config;
}

/**
 * Fixed-destination TCP relay for end-to-end Fleet HTTPS. It holds no TLS key,
 * parses no HTTP, performs no DNS lookup, and cannot select an equipment URL.
 * The upstream must be the dedicated Fleet HTTPS service, enforced additionally
 * by namespace firewall rules. Never point this at standalone port 3000.
 */
export async function startFleetEntry(config: FleetEntryConfig): Promise<{
  server: Server;
  activeConnections: () => number;
  stop: () => Promise<void>;
}> {
  const connections = new Set<{client: Socket; upstream: Socket}>();
  const server = createServer({pauseOnConnect: true}, client => {
    if (connections.size >= config.maxConnections) { client.destroy(); return; }
    const upstream = createConnection({host: config.upstreamAddress, port: config.upstreamPort});
    const pair = {client, upstream};
    connections.add(pair);
    const deadline = setTimeout(() => close(), config.connectTimeoutMs);
    deadline.unref();
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      clearTimeout(deadline);
      connections.delete(pair);
      client.destroy(); upstream.destroy();
    }
    client.on('error', close); upstream.on('error', close);
    client.on('close', close); upstream.on('close', close);
    client.setTimeout(config.idleTimeoutMs, close);
    upstream.setTimeout(config.idleTimeoutMs, close);
    client.setNoDelay(true); upstream.setNoDelay(true);
    upstream.once('connect', () => {
      clearTimeout(deadline);
      if (closed) return;
      client.pipe(upstream); upstream.pipe(client);
      client.resume();
    });
  });
  await new Promise<void>((resolve, reject) => {
    const failed = (error: Error) => reject(error);
    server.once('error', failed);
    server.listen(config.port, config.bindAddress, () => { server.removeListener('error', failed); resolve(); });
  });
  let stopping: Promise<void> | undefined;
  return {
    server,
    activeConnections: () => connections.size,
    stop: () => stopping ??= new Promise<void>(resolve => {
      server.close(() => resolve());
      for (const {client, upstream} of connections) { client.destroy(); upstream.destroy(); }
    }),
  };
}
