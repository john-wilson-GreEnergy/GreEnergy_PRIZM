import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

export type IoLogikTarget = {
  ip: string;
  arrayIndex: number;
  segmentIndex: number;
  label: string;
};
export type IoLogikInventoryRow = IoLogikTarget & {
  pingOk: boolean;
  httpOk: boolean;
  reachable: boolean;
  firmware: string | null;
  firmwareRaw: string | null;
  result: string;
  do00Safe?: string | null;
  watchdogSeconds?: number | null;
  configurationStatus?: "ok" | "mismatch" | "unknown";
  configurationDetail?: string | null;
};

const DEFAULT_TOOL_DIR = "/Users/johnwilson/Desktop/IOLogik Script";
const toolDir = () => process.env.PRIZM_IOLOGIK_TOOL_DIR || DEFAULT_TOOL_DIR;
const scriptPath = () =>
  process.env.PRIZM_IOLOGIK_SCRIPT ||
  path.join(toolDir(), "moxa_e1242_fleet_import.sh");
const managedAssetDir = () =>
  process.env.PRIZM_IOLOGIK_ASSET_DIR ||
  path.join(process.cwd(), "data", "iologik-assets");
const managedConfigPath = () =>
  path.join(managedAssetDir(), "golden-config.txt");
const bundledConfigPath = () => path.join(toolDir(), "ik1242.txt");
const configPath = () =>
  process.env.PRIZM_IOLOGIK_CONFIG ||
  (fs.existsSync(managedConfigPath())
    ? managedConfigPath()
    : bundledConfigPath());
const firmwareManifestPath = () =>
  path.join(managedAssetDir(), "firmware.json");
const bundledFirmwarePath = () =>
  path.join(
    toolDir(),
    "moxa-iologik-e1200-series-iologik-e1242-e1242-t-firmware-v4.0.1kp",
  );
const firmwarePath = () => {
  if (process.env.PRIZM_IOLOGIK_FIRMWARE)
    return process.env.PRIZM_IOLOGIK_FIRMWARE;
  try {
    const manifest = JSON.parse(
      fs.readFileSync(firmwareManifestPath(), "utf8"),
    );
    const managed = path.join(
      managedAssetDir(),
      path.basename(String(manifest.storedName || "")),
    );
    if (fs.existsSync(managed)) return managed;
  } catch {}
  return bundledFirmwarePath();
};
const intEnv = (name: string, fallback: number) =>
  Math.max(1, Number(process.env[name]) || fallback);

export function getIoLogikTopology() {
  const arrays = intEnv("PRIZM_IOLOGIK_ARRAYS", 8);
  const segments = intEnv("PRIZM_IOLOGIK_ES_PER_ARRAY", 20);
  const prefix = process.env.PRIZM_IOLOGIK_SUBNET_PREFIX || "10.0";
  const targets: IoLogikTarget[] = [];
  for (let arrayIndex = 1; arrayIndex <= arrays; arrayIndex += 1) {
    targets.push({
      ip: `${prefix}.${arrayIndex}.4`,
      arrayIndex,
      segmentIndex: 0,
      label: `Array ${arrayIndex} / CS`,
    });
    for (let segmentIndex = 1; segmentIndex <= segments; segmentIndex += 1) {
      targets.push({
        ip: `${prefix}.${arrayIndex}.${11 + (segmentIndex - 1) * 5}`,
        arrayIndex,
        segmentIndex,
        label: `Array ${arrayIndex} / ES${segmentIndex}`,
      });
    }
  }
  return {
    arrays,
    segmentsPerArray: segments,
    prefix,
    targets,
    scriptAvailable: fs.existsSync(scriptPath()),
    configAvailable: fs.existsSync(configPath()),
    firmwareAvailable: fs.existsSync(firmwarePath()),
  };
}

const sha256 = (file: string) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const valueFrom = (text: string, expression: RegExp) =>
  text.match(expression)?.[1]?.trim() || null;

export function getIoLogikConfigurationProfile() {
  const file = configPath();
  if (!fs.existsSync(file)) return { available: false, path: file };
  const text = fs.readFileSync(file, "utf8");
  const stat = fs.statSync(file);
  const do00SafeCode = valueFrom(text, /^DO00=.*?DO00_SAFE=(\d+),/m);
  const do00SafeLabel = valueFrom(text, /^DO00=.*?DO00_SAFE=\d+,\(([^)]+)\)/m);
  const watchdogSeconds = Number(
    valueFrom(text, /^CONNECTION_WATCHDOG\s*=\s*(\d+)/m),
  );
  return {
    available: true,
    fileName: path.basename(file),
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    sha256: sha256(file),
    model: valueFrom(text, /^MOD_TYPE\s*=\s*(.+)$/m),
    sourceFirmware: valueFrom(text, /^FW_Ver\s*=\s*(.+)$/m),
    digitalInputs: (text.match(/^DI\d{2}=.+$/gm) || []).length,
    digitalOutputs: (text.match(/^DO\d{2}=.+$/gm) || []).length,
    dioOutputs: (text.match(/^DIO\d{2}=1,\(DO\)/gm) || []).length,
    analogInputs: [0, 1, 2, 3].map((index) => ({
      channel: `AI${String(index).padStart(2, "0")}`,
      mode: valueFrom(
        text,
        new RegExp(
          `^AI${String(index).padStart(2, "0")}=\\d+,\\s*\\(([^)]+)\\)`,
          "m",
        ),
      ),
      enabled: new RegExp(
        `^AI${String(index).padStart(2, "0")}=.*AI${String(index).padStart(2, "0")}_EN=1`,
        "m",
      ).test(text),
    })),
    userDefinedModbus: /^EnableUserDefined_Modbus\s*=1/m.test(text),
    deploymentTargets: {
      do00SafeState:
        do00SafeCode === "0" && /^off$/i.test(do00SafeLabel || "")
          ? "Off"
          : do00SafeLabel || "Unknown",
      do00SafeCode,
      watchdogSeconds: Number.isFinite(watchdogSeconds)
        ? watchdogSeconds
        : null,
      do00Compliant: do00SafeCode === "0" && /^off$/i.test(do00SafeLabel || ""),
      watchdogCompliant: Number.isFinite(watchdogSeconds),
    },
    networkSafeguard: {
      appliedBeforeDeployment: true,
      excluded: [
        "IP address",
        "subnet mask",
        "gateway",
        "MAC address",
        "network overwrite",
      ],
    },
  };
}

export function updateIoLogikGoldenRule(input: { watchdogSeconds?: number }) {
  const watchdogSeconds = Number(input.watchdogSeconds);
  if (
    !Number.isInteger(watchdogSeconds) ||
    watchdogSeconds < 30 ||
    watchdogSeconds > 3600
  ) {
    throw new Error(
      "Watchdog timeout must be a whole number from 30 to 3600 seconds.",
    );
  }
  const source = configPath();
  if (!fs.existsSync(source))
    throw new Error(`Golden configuration not found at ${source}`);
  let text = fs.readFileSync(source, "utf8");
  if (!/^CONNECTION_WATCHDOG\s*=/m.test(text))
    throw new Error(
      "Golden configuration does not contain a communication watchdog setting.",
    );
  text = text.replace(
    /^CONNECTION_WATCHDOG\s*=.*$/m,
    `CONNECTION_WATCHDOG=${watchdogSeconds},(sec)`,
  );
  text = text.replace(
    /^DO00=(.*?DO00_SAFE=)\d+,\([^)]+\)/m,
    "DO00=$1" + "0,(Off)",
  );
  fs.mkdirSync(managedAssetDir(), { recursive: true, mode: 0o700 });
  const destination = managedConfigPath();
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, text, { mode: 0o600 });
  fs.renameSync(temporary, destination);
  return getIoLogikConfigurationProfile();
}

export function importIoLogikFirmware(input: {
  fileName?: string;
  base64?: string;
}) {
  const fileName = path.basename(String(input.fileName || ""));
  if (!/\.kp$/i.test(fileName))
    throw new Error("Select a Moxa ioLogik .kp firmware package.");
  if (!input.base64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(input.base64))
    throw new Error("Firmware file data is missing or invalid.");
  const payload = Buffer.from(input.base64.replace(/\s/g, ""), "base64");
  if (!payload.length)
    throw new Error("The selected firmware package is empty.");
  if (payload.length > 25 * 1024 * 1024)
    throw new Error("Firmware package exceeds the 25 MB safety limit.");
  const version = fileName.match(/v(\d+\.\d+(?:\.\d+)?)/i)?.[1] || null;
  if (!version)
    throw new Error(
      "The firmware filename must include a version such as v4.0.1.",
    );
  fs.mkdirSync(managedAssetDir(), { recursive: true, mode: 0o700 });
  const storedName = `firmware-${Date.now()}-${fileName.replace(/[^A-Za-z0-9._-]/g, "_")}`;
  const destination = path.join(managedAssetDir(), storedName);
  fs.writeFileSync(destination, payload, { mode: 0o600 });
  const manifest = {
    originalName: fileName,
    storedName,
    version,
    sizeBytes: payload.length,
    sha256: crypto.createHash("sha256").update(payload).digest("hex"),
    importedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    firmwareManifestPath(),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  return manifest;
}

function allowedTargets(ips?: string[]) {
  const all = getIoLogikTopology().targets;
  if (!ips?.length) return all;
  const requested = new Set(ips.map(String));
  return all.filter((target) => requested.has(target.ip));
}

function runTool(
  args: string[],
  password?: string,
  extraEnv: Record<string, string> = {},
) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve, reject) => {
      if (!fs.existsSync(scriptPath()))
        return reject(
          new Error(`ioLogik fleet script not found at ${scriptPath()}`),
        );
      const child = spawn("bash", [scriptPath(), ...args], {
        env: {
          ...process.env,
          MOXA_PASS: password || process.env.PRIZM_IOLOGIK_PASSWORD || "moxa",
          PAUSE_AFTER_RUN: "0",
          ...extraEnv,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (value) => {
        stdout += String(value);
      });
      child.stderr.on("data", (value) => {
        stderr += String(value);
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    },
  );
}

async function mapLimit<T, R>(
  values: T[],
  limit: number,
  fn: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await fn(values[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function discoverIoLogik(ips?: string[]) {
  const targets = allowedTargets(ips);
  return mapLimit(
    targets,
    intEnv("PRIZM_IOLOGIK_DISCOVERY_CONCURRENCY", 24),
    async (target) => {
      const result = await runTool([
        "verify-ip",
        target.ip,
        "both",
        "/contents.htm",
      ]);
      const fields = result.stdout.trim().split(",");
      const pingOk = fields[1] === "1";
      const httpOk = fields[2] === "1";
      return {
        ...target,
        pingOk,
        httpOk,
        reachable: pingOk || httpOk,
        firmware: null,
        firmwareRaw: null,
        result: pingOk || httpOk ? "reachable" : "unreachable",
      } as IoLogikInventoryRow;
    },
  );
}

function parseCsvLine(line: string) {
  const [
    ip,
    arrayIndex,
    segment,
    firmware,
    firmwareRaw,
    result,
    do00Safe,
    watchdogSeconds,
    configurationStatus,
    configurationDetail,
  ] = line.trim().split(",");
  return {
    ip,
    arrayIndex: Number(arrayIndex),
    segmentIndex: String(segment).toUpperCase() === "CS" ? 0 : Number(segment),
    firmware: firmware || null,
    firmwareRaw: firmwareRaw || null,
    result: result || "unknown",
    do00Safe: do00Safe || null,
    watchdogSeconds: watchdogSeconds ? Number(watchdogSeconds) : null,
    configurationStatus: (configurationStatus === "ok" ||
    configurationStatus === "mismatch"
      ? configurationStatus
      : "unknown") as "ok" | "mismatch" | "unknown",
    configurationDetail: configurationDetail || null,
  };
}

export async function scanIoLogikFirmware(input: {
  targetIps?: string[];
  password?: string;
}) {
  const reachable = (await discoverIoLogik(input.targetIps)).filter(
    (row) => row.reachable,
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prizm-iologik-scan-"));
  fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
  try {
    return await mapLimit(
      reachable,
      intEnv("PRIZM_IOLOGIK_FWSCAN_CONCURRENCY", 12),
      async (target) => {
        const csv = path.join(root, `scan-${target.ip}.csv`);
        fs.writeFileSync(
          csv,
          "ip,array,segment,fw_simple,fw_raw,result,do00_safe,watchdog_seconds,config_status,config_detail\n",
          { mode: 0o600 },
        );
        const watchdogTarget =
          getIoLogikConfigurationProfile().deploymentTargets?.watchdogSeconds ||
          300;
        const execution = await runTool(
          ["worker-fwscan", target.ip, root, csv],
          input.password,
          { WD_TIME: String(watchdogTarget) },
        );
        const line =
          fs.readFileSync(csv, "utf8").trim().split(/\r?\n/).slice(-1)[0] || "";
        const parsed = parseCsvLine(line);
        if (!line || parsed.ip === "ip") {
          return {
            ...target,
            pingOk: target.pingOk,
            httpOk: target.httpOk,
            reachable: true,
            firmware: null,
            firmwareRaw: null,
            result: `worker_exit_${execution.code}`,
            configurationStatus: "unknown",
            configurationDetail:
              execution.stderr.trim().split(/\r?\n/).slice(-1)[0] ||
              "scan_failed",
          } as IoLogikInventoryRow;
        }
        return {
          ...target,
          ...parsed,
          pingOk: target.pingOk,
          httpOk: target.httpOk,
          reachable: true,
          result:
            execution.code === 0
              ? parsed.result
              : `worker_exit_${execution.code}`,
        } as IoLogikInventoryRow;
      },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function sanitizeConfiguration(source: string, destination: string) {
  const lines = fs.readFileSync(source, "utf8").split(/\r?\n/);
  let inNetwork = false;
  const watchdogTarget =
    valueFrom(lines.join("\n"), /^CONNECTION_WATCHDOG\s*=\s*(\d+)/m) || "300";
  const sanitized = lines
    .filter((line) => {
      if (/^\[4\. Network Settings\]/.test(line)) {
        inNetwork = true;
        return false;
      }
      if (/^\[[0-9]+\./.test(line) && inNetwork) inNetwork = false;
      return (
        !inNetwork && !/^NET_(IP|MASK|GATEWAY|MAC|CONFIG_OVERWRITE)=/.test(line)
      );
    })
    .map((line) => {
      if (/^NET_CONFIG_OVERWRITE=/.test(line)) return "NET_CONFIG_OVERWRITE=0";
      if (/^DO00=/.test(line))
        return line.replace(/DO00_SAFE=\d+,\([^)]+\)/, "DO00_SAFE=0,(Off)");
      if (/^CONNECTION_WATCHDOG\s*=/.test(line))
        return `CONNECTION_WATCHDOG=${watchdogTarget},(sec)`;
      return line;
    })
    .join("\n");
  fs.writeFileSync(destination, sanitized, { mode: 0o600 });
}

export async function deployIoLogikConfiguration(input: {
  targetIps: string[];
  password?: string;
}) {
  if (!fs.existsSync(configPath()))
    throw new Error(`Golden configuration not found at ${configPath()}`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prizm-iologik-config-"));
  fs.mkdirSync(path.join(root, "configs"), { recursive: true });
  const sanitized = path.join(root, "ik1242_NO_IP_CHANGE.txt");
  sanitizeConfiguration(configPath(), sanitized);
  try {
    const reachable = (await discoverIoLogik(input.targetIps)).filter(
      (row) => row.reachable,
    );
    return await mapLimit(
      reachable,
      intEnv("PRIZM_IOLOGIK_CONFIG_CONCURRENCY", 8),
      async (target) => {
        const localOut = path.join(root, target.ip);
        fs.mkdirSync(localOut, { recursive: true });
        fs.writeFileSync(
          path.join(localOut, "config_status.csv"),
          "ip,login_ok,stage1_import_ok,stage2_ioserver_ok\n",
          { mode: 0o600 },
        );
        const execution = await runTool(
          ["worker-config", target.ip, sanitized, localOut],
          input.password,
        );
        const line =
          fs
            .readFileSync(path.join(localOut, "config_status.csv"), "utf8")
            .trim()
            .split(/\r?\n/)
            .slice(-1)[0] || "";
        const [, login, imported, settings] = line.split(",");
        return {
          ...target,
          success:
            execution.code === 0 &&
            login === "1" &&
            imported === "1" &&
            settings === "1",
          loginOk: login === "1",
          importOk: imported === "1",
          settingsOk: settings === "1",
          detail: execution.stderr.trim().split(/\r?\n/).slice(-1)[0] || null,
        };
      },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

export async function deployIoLogikFirmware(input: {
  targetIps: string[];
  password?: string;
}) {
  if (!fs.existsSync(firmwarePath()))
    throw new Error(`Firmware package not found at ${firmwarePath()}`);
  const targetVersion = (
    path.basename(firmwarePath()).match(/v([0-9]+\.[0-9]+)/i)?.[1] || ""
  ).trim();
  const before = await scanIoLogikFirmware({
    targetIps: input.targetIps,
    password: input.password,
  });
  const skipped = before
    .filter((row) => row.result === "ok" && row.firmware === targetVersion)
    .map((row) => ({
      ...row,
      success: true,
      action: "skipped",
      detail: `Already on ${targetVersion}`,
    }));
  const pending = before.filter(
    (row) =>
      row.result === "ok" && row.firmware && row.firmware !== targetVersion,
  );
  const unknown = before
    .filter((row) => row.result !== "ok" || !row.firmware)
    .map((row) => ({
      ...row,
      success: false,
      action: "skipped_unknown",
      detail:
        "Current firmware could not be verified; strict mode skipped this device.",
    }));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prizm-iologik-fw-"));
  try {
    const changed = await mapLimit(
      pending,
      intEnv("PRIZM_IOLOGIK_FIRMWARE_CONCURRENCY", 4),
      async (target) => {
        const localOut = path.join(root, target.ip);
        fs.mkdirSync(localOut, { recursive: true });
        fs.writeFileSync(
          path.join(localOut, "fw_status.csv"),
          "ip,login_ok,fw_upload_ok,pre_ping_ok,pre_http_ok,ping_down_s,http_down_s,down_s,ping_up_s,http_up_s,up_s,fw_result\n",
          { mode: 0o600 },
        );
        const execution = await runTool(
          ["worker-fw", target.ip, firmwarePath(), localOut],
          input.password,
          { FW_WATCH_REBOOT: "1" },
        );
        const line =
          fs
            .readFileSync(path.join(localOut, "fw_status.csv"), "utf8")
            .trim()
            .split(/\r?\n/)
            .slice(-1)[0] || "";
        const fields = line.split(",");
        const uploaded = fields[2] === "1";
        const result = fields[11] || `worker_exit_${execution.code}`;
        return {
          ...target,
          success: execution.code === 0 && uploaded && result.startsWith("ok:"),
          action: "updated",
          uploadOk: uploaded,
          downSeconds: fields[7] || null,
          upSeconds: fields[10] || null,
          detail: result,
        };
      },
    );
    return {
      targetVersion,
      before,
      results: [...skipped, ...changed, ...unknown],
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

export const getIoLogikAssets = () => {
  const firmware = firmwarePath();
  let firmwareMetadata: any = null;
  try {
    firmwareMetadata = JSON.parse(
      fs.readFileSync(firmwareManifestPath(), "utf8"),
    );
  } catch {
    if (fs.existsSync(firmware))
      firmwareMetadata = {
        originalName: path.basename(firmware),
        sizeBytes: fs.statSync(firmware).size,
        sha256: sha256(firmware),
        version:
          path.basename(firmware).match(/v(\d+\.\d+(?:\.\d+)?)/i)?.[1] || null,
        importedAt: null,
      };
  }
  return {
    scriptPath: scriptPath(),
    configPath: configPath(),
    firmwarePath: firmware,
    scriptAvailable: fs.existsSync(scriptPath()),
    configAvailable: fs.existsSync(configPath()),
    firmwareAvailable: fs.existsSync(firmware),
    configurationProfile: getIoLogikConfigurationProfile(),
    firmwareMetadata,
  };
};
