var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/server/security/localAccounts.ts
var import_node_fs = require("node:fs");
var import_promises = require("node:fs/promises");
var import_node_path = __toESM(require("node:path"), 1);
async function readPrivateJson(file) {
  if (!import_node_path.default.isAbsolute(file)) throw new Error("Security file path must be absolute");
  const parent = await (0, import_promises.lstat)(import_node_path.default.dirname(file));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 18) !== 0) throw new Error("Security directory must not be writable by other accounts");
  const handle = await (0, import_promises.open)(file, import_node_fs.constants.O_RDONLY | import_node_fs.constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 1024 * 1024 || (stat.mode & 63) !== 0 || stat.uid !== process.getuid?.() && stat.uid !== 0) throw new Error("Security file must be private (0600) and owned by this service account or root");
    return JSON.parse(await handle.readFile("utf8"));
  } finally {
    await handle.close();
  }
}

// src/server/fleet/entryRelay.ts
var import_node_net = require("node:net");
var privateAddress = (value) => {
  if (typeof value !== "string" || !(0, import_node_net.isIPv4)(value)) return false;
  const [a, b] = value.split(".").map(Number);
  return a === 10 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168;
};
var integer = (value, fallback, min, max) => {
  const result = value === void 0 ? fallback : value;
  if (!Number.isSafeInteger(result) || Number(result) < min || Number(result) > max) throw new Error("Invalid entry point limit");
  return Number(result);
};
function parseFleetEntryConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid entry point configuration");
  const row = raw;
  const keys = /* @__PURE__ */ new Set(["bindAddress", "port", "upstreamAddress", "upstreamPort", "maxConnections", "connectTimeoutMs", "idleTimeoutMs", "allowLoopbackTest", "workspaceEntry"]);
  if (Object.keys(row).some((key) => !keys.has(key))) throw new Error("Unknown entry point option");
  if (row.allowLoopbackTest !== void 0 && typeof row.allowLoopbackTest !== "boolean") throw new Error("Invalid test flag");
  if (row.workspaceEntry !== void 0 && typeof row.workspaceEntry !== "boolean") throw Error("Invalid workspace entry flag");
  const test = row.allowLoopbackTest === true;
  if (test ? row.bindAddress !== "127.0.0.1" || row.upstreamAddress !== "127.0.0.1" : !privateAddress(row.bindAddress) || !privateAddress(row.upstreamAddress)) throw new Error("Explicit private IPv4 addresses required");
  const config = {
    bindAddress: row.bindAddress,
    port: integer(row.port, 3443, 1024, 65535),
    upstreamAddress: row.upstreamAddress,
    upstreamPort: integer(row.upstreamPort, 3443, 1024, 65535),
    maxConnections: integer(row.maxConnections, 64, 1, 256),
    connectTimeoutMs: integer(row.connectTimeoutMs, 3e3, 100, 1e4),
    idleTimeoutMs: integer(row.idleTimeoutMs, 3e4, 100, 12e4)
  };
  if (!test && (row.workspaceEntry === true ? ![3444, 3445].includes(config.port) || config.upstreamPort !== config.port : config.port !== 3443 || config.upstreamPort !== 3443)) throw new Error("Production entry points require the fixed Fleet or explicitly enabled workspace HTTPS ports");
  if (config.bindAddress === config.upstreamAddress && config.port === config.upstreamPort) throw new Error("Entry point cannot target itself");
  return config;
}
async function startFleetEntry(config) {
  const connections = /* @__PURE__ */ new Set();
  const server = (0, import_node_net.createServer)({ pauseOnConnect: true }, (client) => {
    if (connections.size >= config.maxConnections) {
      client.destroy();
      return;
    }
    const upstream = (0, import_node_net.createConnection)({ host: config.upstreamAddress, port: config.upstreamPort });
    const pair = { client, upstream };
    connections.add(pair);
    const deadline = setTimeout(() => close(), config.connectTimeoutMs);
    deadline.unref();
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      clearTimeout(deadline);
      connections.delete(pair);
      client.destroy();
      upstream.destroy();
    }
    client.on("error", close);
    upstream.on("error", close);
    client.on("close", close);
    upstream.on("close", close);
    client.setTimeout(config.idleTimeoutMs, close);
    upstream.setTimeout(config.idleTimeoutMs, close);
    client.setNoDelay(true);
    upstream.setNoDelay(true);
    upstream.once("connect", () => {
      clearTimeout(deadline);
      if (closed) return;
      client.pipe(upstream);
      upstream.pipe(client);
      client.resume();
    });
  });
  await new Promise((resolve, reject) => {
    const failed = (error) => reject(error);
    server.once("error", failed);
    server.listen(config.port, config.bindAddress, () => {
      server.removeListener("error", failed);
      resolve();
    });
  });
  let stopping;
  return {
    server,
    activeConnections: () => connections.size,
    stop: () => stopping ??= new Promise((resolve) => {
      server.close(() => resolve());
      for (const { client, upstream } of connections) {
        client.destroy();
        upstream.destroy();
      }
    })
  };
}

// src/server/fleet/entryMain.ts
async function main() {
  const config = parseFleetEntryConfig(await readPrivateJson(process.env.PRIZM_FLEET_ENTRY_CONFIG ?? ""));
  const relay = await startFleetEntry(config);
  console.info(JSON.stringify({ event: "fleet.entry.started", bindAddress: config.bindAddress, port: config.port }));
  let stopping = false;
  const stop = async (exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 5e3);
    deadline.unref();
    await relay.stop();
    clearTimeout(deadline);
    process.exit(exitCode);
  };
  relay.server.on("error", () => {
    console.error("Fleet entry listener failed");
    void stop(1);
  });
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}
void main().catch(() => {
  console.error("Fleet entry startup failed. Check private config and namespace addresses.");
  process.exitCode = 1;
});
//# sourceMappingURL=fleet-entry.cjs.map
