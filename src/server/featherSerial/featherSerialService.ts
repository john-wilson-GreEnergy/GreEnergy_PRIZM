import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { discoverTopologyCandidates } from "../feather/featherDiscovery";

export const SERIAL_CONNECTION_TYPES = ["rxtx", "pjc", "rodbus"] as const;
export type SerialConnectionType = typeof SERIAL_CONNECTION_TYPES[number];

export type FeatherSerialTarget = {
  ip: string;
  arrayIndex: number | null;
  segmentIndex: number | null;
  label: string;
  source: string;
};

export type FeatherSerialInventoryRow = FeatherSerialTarget & {
  reachable: boolean;
  serialConnectionType: string | null;
  parameterValid: boolean;
  tomcatStatus: string;
  tomcatRunning: boolean;
  tomcatActiveSince: string | null;
  tomcatUptimeSeconds: number | null;
  featherStatus: FeatherStatusSnapshot;
  error: string | null;
  scannedAt: string;
};

export type FeatherCallHistory = {
  name: string;
  success: number;
  failed: number;
  total: number;
  lastSuccess: string | null;
  lastFailure: string | null;
};

export type FeatherStatusSnapshot = {
  available: boolean;
  version: string | null;
  state: string | null;
  calls: FeatherCallHistory[];
  fetchedAt: string;
  error: string | null;
};

type Credentials = { username: string; sshPassword?: string; sudoPassword?: string };
const XML_PATH = "/var/lib/tomcat8/conf/Catalina/localhost/feather.xml";
const PARAMETER_NAME = "feather.modbusv1.poller.serialConnectionType";
const IP_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/i;
const AUTH_ERROR_RE = /permission denied|authentication failed/i;

class SshCommandError extends Error {
  exitCode: number | null;

  constructor(message: string, exitCode: number | null) {
    super(message);
    this.name = "SshCommandError";
    this.exitCode = exitCode;
  }
}

function friendlySshError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if ((error as NodeJS.ErrnoException)?.code === "ENOENT" && /sshpass/i.test(message)) {
    return "Password-based SSH requires sshpass on the PRIZM host. Install sshpass or configure an SSH key for the moxa account.";
  }
  if (AUTH_ERROR_RE.test(message)) {
    return "The Feather rejected the username/password login. Verify the SSH login password for the moxa account (not only its sudo password). Host-key checking is already disabled for this workflow.";
  }
  return message;
}

export function isSupportedFeatherIp(ip: string): boolean {
  if (!IP_RE.test(ip)) return false;
  const octets = ip.split(".").map(Number);
  if (octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const host = octets[3];
  return host === 3 || (host >= 10 && host <= 110 && (host - 10) % 5 === 0);
}

export function getFeatherSerialTargets(): FeatherSerialTarget[] {
  const unique = new Map<string, FeatherSerialTarget>();
  for (const candidate of discoverTopologyCandidates()) {
    // A Turtle string-IP record can alias the segment Feather address and mark
    // an otherwise canonical topology-profile candidate excluded. Preserve the
    // configured Feather plan in that collision; reject only non-profile
    // candidates that discovery positively excluded.
    if ((candidate.excluded && candidate.sourceDiscoveryMethod !== "topology-profile") || !isSupportedFeatherIp(candidate.deviceIp)) continue;
    const octets = candidate.deviceIp.split(".").map(Number);
    const host = octets[3];
    unique.set(candidate.deviceIp, {
      ip: candidate.deviceIp,
      arrayIndex: Number.isInteger(candidate.arrayIndex) ? Number(candidate.arrayIndex) : null,
      segmentIndex: host === 3 ? 0 : Math.floor((host - 10) / 5) + 1,
      label: candidate.entityName || `Feather ${candidate.deviceIp}`,
      source: candidate.sourceDiscoveryMethod || "site-topology",
    });
  }
  return Array.from(unique.values()).sort((a, b) => {
    const aa = a.ip.split(".").map(Number);
    const bb = b.ip.split(".").map(Number);
    return aa.reduce((result, value, index) => result || value - bb[index], 0);
  });
}

function validateCredentials(credentials: Credentials) {
  if (!USER_RE.test(credentials.username || "")) throw new Error("A valid SSH username is required.");
  if (!credentials.sshPassword) throw new Error("An SSH login password is required for the Feather inventory workflow.");
}

function runSsh(ip: string, credentials: Credentials, remoteCommand: string, stdin = "", timeoutMs = 15000): Promise<{ stdout: string; stderr: string }> {
  validateCredentials(credentials);
  if (!IP_RE.test(ip)) return Promise.reject(new Error("Invalid target IP."));
  const useSshpass = true;
  const command = useSshpass ? "sshpass" : "ssh";
  const args = useSshpass ? ["-e", "ssh"] : [];
  args.push(
    "-o", "ConnectTimeout=5",
    "-o", "ConnectionAttempts=1",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    "-o", useSshpass ? "BatchMode=no" : "BatchMode=yes",
    ...(useSshpass ? [
      // This workflow is intentionally password-only. It neither consults nor
      // offers client SSH keys, and sshpass supplies the in-memory password.
      "-o", "PreferredAuthentications=keyboard-interactive,password",
      "-o", "PubkeyAuthentication=no",
      "-o", "PasswordAuthentication=yes",
      "-o", "KbdInteractiveAuthentication=yes",
      "-o", "NumberOfPasswordPrompts=1",
    ] : []),
    `${credentials.username}@${ip}`,
    remoteCommand,
  );
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...(useSshpass ? { SSHPASS: credentials.sshPassword } : {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new SshCommandError((stderr || stdout || `SSH exited ${code}`).trim(), code));
    });
    child.stdin.end(stdin);
  });
}

const scanCommand = [
  `xml=${XML_PATH}`,
  `param=${PARAMETER_NAME}`,
  `if [ -r "$xml" ]; then value=$(sed -n 's/.*name="'"$param"'"[^>]*value="\\([^"]*\\)".*/\\1/p' "$xml" | head -n 1); else value=__UNREADABLE__; fi`,
  `status=$(systemctl is-active tomcat8 2>/dev/null || true)`,
  `if [ -z "$status" ]; then service tomcat8 status >/dev/null 2>&1 && status=active || status=inactive; fi`,
  `active_since=$(systemctl show tomcat8 -p ActiveEnterTimestamp --value 2>/dev/null || true)`,
  `main_pid=$(systemctl show tomcat8 -p MainPID --value 2>/dev/null || true)`,
  `uptime_seconds=""`,
  `if [ -n "$main_pid" ] && [ "$main_pid" != "0" ]; then uptime_seconds=$(ps -o etimes= -p "$main_pid" 2>/dev/null | tr -d ' ' || true); fi`,
  `printf 'SERIAL=%s\\nTOMCAT=%s\\nTOMCAT_ACTIVE_SINCE=%s\\nTOMCAT_UPTIME_SECONDS=%s\\n' "${"$"}value" "${"$"}status" "${"$"}active_since" "${"$"}uptime_seconds"`,
].join("; ");

function emptyFeatherStatus(error: string | null = null): FeatherStatusSnapshot {
  return { available: false, version: null, state: null, calls: [], fetchedAt: new Date().toISOString(), error };
}

function htmlText(value: string) {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").trim();
}

function countValue(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchFeatherStatus(ip: string): Promise<FeatherStatusSnapshot> {
  const fetchedAt = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(`http://${ip}:8080/feather/status`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = (await response.text()).slice(0, 250_000);
    const calls: FeatherCallHistory[] = [];
    const expression = /<b>([^<]+)<\/b><br\s*\/?>\s*co_success:\s*([\d,]+),\s*co_failed:\s*([\d,]+),\s*co_total:\s*([\d,]+),\s*lt_success:\s*([^<]+?),\s*lt_failed:\s*([^<]+?)(?:<br\s*\/?>|$)/gi;
    for (const match of html.matchAll(expression)) {
      calls.push({ name: htmlText(match[1]), success: countValue(match[2]), failed: countValue(match[3]), total: countValue(match[4]), lastSuccess: htmlText(match[5]) === "N/A" ? null : htmlText(match[5]), lastFailure: htmlText(match[6]) === "N/A" ? null : htmlText(match[6]) });
    }
    return { available: true, version: html.match(/Version=([^<\r\n]+)/i)?.[1]?.trim() || null, state: html.match(/Status=([^<\r\n]+)/i)?.[1]?.trim() || null, calls, fetchedAt, error: null };
  } catch (error: any) {
    return emptyFeatherStatus(error?.name === "AbortError" ? "Status page timed out" : error?.message || String(error));
  }
}

function parseScan(target: FeatherSerialTarget, stdout: string, featherStatus: FeatherStatusSnapshot): FeatherSerialInventoryRow {
  const serial = stdout.match(/^SERIAL=(.*)$/m)?.[1]?.trim() || null;
  const tomcat = stdout.match(/^TOMCAT=(.*)$/m)?.[1]?.trim() || "unknown";
  const activeSince = stdout.match(/^TOMCAT_ACTIVE_SINCE=(.*)$/m)?.[1]?.trim() || null;
  const uptimeValue = Number(stdout.match(/^TOMCAT_UPTIME_SECONDS=(.*)$/m)?.[1]?.trim());
  return {
    ...target,
    reachable: true,
    serialConnectionType: serial === "__UNREADABLE__" || !serial ? null : serial,
    parameterValid: SERIAL_CONNECTION_TYPES.includes(serial as SerialConnectionType),
    tomcatStatus: tomcat,
    tomcatRunning: tomcat === "active",
    tomcatActiveSince: activeSince,
    tomcatUptimeSeconds: Number.isFinite(uptimeValue) && uptimeValue >= 0 ? uptimeValue : null,
    featherStatus,
    error: serial === "__UNREADABLE__" ? `${XML_PATH} is not readable` : !serial ? `${PARAMETER_NAME} was not found` : null,
    scannedAt: new Date().toISOString(),
  };
}

async function mapLimited<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

export async function scanFeatherSerialInventory(credentials: Credentials, requestedIps?: string[]) {
  const allowed = getFeatherSerialTargets();
  const requested = requestedIps?.length ? new Set(requestedIps) : null;
  const targets = requested ? allowed.filter(target => requested.has(target.ip)) : allowed;
  if (requested && targets.length !== requested.size) throw new Error("One or more targets are not in the current Feather site inventory.");
  if (!targets.length) return [];
  const scanTarget = async (target: FeatherSerialTarget) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const [result, featherStatus] = await Promise.all([
          runSsh(target.ip, credentials, scanCommand),
          fetchFeatherStatus(target.ip),
        ]);
        return parseScan(target, result.stdout, featherStatus);
      } catch (error: any) {
        const authRejected = AUTH_ERROR_RE.test(error?.message || "");
        // Feather SSH and Tomcat can recover slowly after a restart. Retry
        // transient authentication and connection failures before presenting
        // a target as failed.
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, authRejected ? attempt * 1500 : attempt * 3000));
          continue;
        }
        const message = friendlySshError(error);
        return { ...target, reachable: false, serialConnectionType: null, parameterValid: false, tomcatStatus: authRejected ? "authentication required" : "unreachable", tomcatRunning: false, tomcatActiveSince: null, tomcatUptimeSeconds: null, featherStatus: await fetchFeatherStatus(target.ip), error: message, scannedAt: new Date().toISOString() };
      }
    }
    throw new Error("Unexpected Feather scan retry state.");
  };
  // Fail fast on shared credential problems rather than issuing the same bad
  // authentication attempt against every controller on the site.
  const first = await scanTarget(targets[0]);
  if (first.tomcatStatus === "authentication required") throw new Error(first.error || "SSH authentication failed.");
  return [first, ...await mapLimited(targets.slice(1), 4, scanTarget)];
}

function applyCommand(desired: SerialConnectionType) {
  const escapedParameter = PARAMETER_NAME.replace(/\./g, "\\.");
  return [
    `xml=${XML_PATH}`,
    `test -f "$xml" || { echo 'RESULT=xml-missing'; exit 20; }`,
    `matches=$(grep -c 'name="${PARAMETER_NAME}"' "$xml" || true)`,
    `test "$matches" -eq 1 || { echo "RESULT=parameter-count-$matches"; exit 21; }`,
    `current=$(sed -n 's/.*name="${escapedParameter}"[^>]*value="\\([^"]*\\)".*/\\1/p' "$xml" | head -n 1)`,
    `test "$current" != '${desired}' || { echo 'RESULT=skipped'; systemctl is-active tomcat8 2>/dev/null || true; exit 0; }`,
    `stamp=$(date -u +%Y%m%dT%H%M%SZ)`,
    `backup="${"$"}xml.prizm-backup-${"$"}stamp"`,
    `cp -p "$xml" "$backup"`,
    `tmp=$(mktemp /tmp/prizm-feather-xml.XXXXXX)`,
    `sed 's/\\(name="${escapedParameter}"[^>]*value="\\)[^"]*/\\1${desired}/' "$xml" > "$tmp"`,
    `install -o $(stat -c %u "$xml") -g $(stat -c %g "$xml") -m $(stat -c %a "$xml") "$tmp" "$xml"`,
    `rm -f "$tmp"`,
    `systemctl restart tomcat8 2>/dev/null || service tomcat8 restart`,
    `status=unknown`,
    `attempt=0`,
    `while [ "$attempt" -lt 18 ]; do status=$(systemctl is-active tomcat8 2>/dev/null || true); if [ -z "$status" ]; then service tomcat8 status >/dev/null 2>&1 && status=active || status=inactive; fi; [ "$status" = active ] && break; attempt=$((attempt + 1)); sleep 5; done`,
    `test "$status" = active || { echo "RESULT=restart-failed TOMCAT=${"$"}status BACKUP=${"$"}backup"; exit 22; }`,
    `verify=$(sed -n 's/.*name="${escapedParameter}"[^>]*value="\\([^"]*\\)".*/\\1/p' "$xml" | head -n 1)`,
    `test "$verify" = '${desired}' || { echo "RESULT=verify-failed VALUE=${"$"}verify BACKUP=${"$"}backup"; exit 23; }`,
    `echo "RESULT=changed VALUE=${"$"}verify TOMCAT=${"$"}status BACKUP=${"$"}backup"`,
  ].join("; ");
}

function audit(record: any) {
  const auditPath = path.join(process.cwd(), "data", "audit", "feather_serial_connection_audit.jsonl");
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.appendFileSync(auditPath, JSON.stringify(record) + "\n", "utf8");
}

export async function applyFeatherSerialConnectionType(input: {
  credentials: Credentials;
  targetIps: string[];
  desired: SerialConnectionType;
  requestedBy?: string;
}) {
  if (!SERIAL_CONNECTION_TYPES.includes(input.desired)) throw new Error("Unsupported serial connection type.");
  const allowed = new Map(getFeatherSerialTargets().map(target => [target.ip, target]));
  const targets = Array.from(new Set(input.targetIps)).map(ip => allowed.get(ip)).filter(Boolean) as FeatherSerialTarget[];
  if (!targets.length || targets.length !== new Set(input.targetIps).size) throw new Error("One or more targets are not in the current Feather site inventory.");
  const before = await scanFeatherSerialInventory(input.credentials, targets.map(target => target.ip));
  const beforeByIp = new Map(before.map(row => [row.ip, row]));
  const results = await mapLimited(targets, 4, async target => {
    const current = beforeByIp.get(target.ip);
    if (current?.serialConnectionType === input.desired) {
      return { ip: target.ip, action: "skipped", success: current.tomcatRunning, before: current.serialConnectionType, after: current.serialConnectionType, tomcatRunning: current.tomcatRunning, message: current.tomcatRunning ? "Already configured; Tomcat verified active." : "Already configured, but Tomcat is not active." };
    }
    if (!current?.reachable) return { ip: target.ip, action: "failed", success: false, before: null, after: null, tomcatRunning: false, message: current?.error || "Target unreachable." };
    const sudoPassword = input.credentials.sudoPassword ?? input.credentials.sshPassword ?? "";
    try {
      const encodedCommand = Buffer.from(applyCommand(input.desired), "utf8").toString("base64");
      const remote = `sudo -S -p '' sh -c "$(printf '%s' '${encodedCommand}' | base64 -d)"`;
      const response = await runSsh(target.ip, input.credentials, remote, `${sudoPassword}\n`, 105000);
      const changed = /RESULT=changed/.test(response.stdout);
      const skipped = /RESULT=skipped/.test(response.stdout);
      return { ip: target.ip, action: changed ? "changed" : skipped ? "skipped" : "failed", success: changed || skipped, before: current.serialConnectionType, after: changed ? input.desired : current.serialConnectionType, tomcatRunning: /TOMCAT=active|^active$/m.test(response.stdout), message: response.stdout.trim() };
    } catch (error: any) {
      return { ip: target.ip, action: "failed", success: false, before: current.serialConnectionType, after: null, tomcatRunning: false, message: error?.message || String(error) };
    }
  });
  const verification = await scanFeatherSerialInventory(input.credentials, targets.map(target => target.ip));
  const response = { desired: input.desired, requestedBy: input.requestedBy || "local-prizm", startedAt: before[0]?.scannedAt || new Date().toISOString(), completedAt: new Date().toISOString(), results, verification };
  audit({ ...response, credentials: undefined });
  return response;
}
