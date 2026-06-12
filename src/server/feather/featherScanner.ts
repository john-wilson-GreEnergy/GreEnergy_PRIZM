import { ManualScanConfig } from "./featherTypes";
import { queryFeatherDevice } from "./featherClient";

/**
 * Validates whether an IP address lies within standard private network ranges.
 */
export function isPrivateIp(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "localhost") return true;

  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  const o1 = parseInt(parts[0], 10);
  const o2 = parseInt(parts[1], 10);
  const o3 = parseInt(parts[2], 10);
  const o4 = parseInt(parts[3], 10);

  if (isNaN(o1) || isNaN(o2) || isNaN(o3) || isNaN(o4)) return false;
  if (o1 < 0 || o1 > 255 || o2 < 0 || o2 > 255 || o3 < 0 || o3 > 255 || o4 < 0 || o4 > 255) return false;

  // 10.0.0.0/8
  if (o1 === 10) return true;

  // 172.16.0.0/12
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;

  // 192.168.0.0/16
  if (o1 === 192 && o2 === 168) return true;

  return false;
}

/**
 * Converts IP string to unsigned 32-bit integer.
 */
function ipToLong(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Converts unsigned 32-bit integer back to IP string.
 */
function longToIp(long: number): string {
  return [
    (long >>> 24) & 0xFF,
    (long >>> 16) & 0xFF,
    (long >>> 8) & 0xFF,
    long & 0xFF
  ].join(".");
}

/**
 * Parses numeric ranges of form "1-8" or "3,5,10-15".
 */
export function parseRangeString(rangeStr: string): number[] {
  const out: number[] = [];
  const parts = rangeStr.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const bounds = trimmed.split("-").map(s => parseInt(s.trim(), 10));
      if (bounds.length === 2 && !isNaN(bounds[0]) && !isNaN(bounds[1])) {
        const start = Math.min(bounds[0], bounds[1]);
        const end = Math.max(bounds[0], bounds[1]);
        for (let i = start; i <= end; i++) {
          out.push(i);
        }
      }
    } else {
      const val = parseInt(trimmed, 10);
      if (!isNaN(val)) {
        out.push(val);
      }
    }
  }
  return out;
}

/**
 * Expands CIDR format string into IP string array.
 */
function expandCidr(cidr: string): string[] {
  const trimmed = cidr.trim();
  const match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!match) return [];

  const mask = parseInt(match[5], 10);
  if (mask < 0 || mask > 32) return [];

  const ipPart = trimmed.split("/")[0];
  const ipNum = ipToLong(ipPart);
  if (ipNum === null) return [];

  const size = Math.pow(2, 32 - mask);
  if (size > 1024) {
    throw new Error(`CIDR block scope (${size} IPs) exceeds maximum safe pre-fetch limit of 1024 IPs.`);
  }

  // Calculate network base address
  const maskBits = (0xFFFFFFFF << (32 - mask)) >>> 0;
  const startIp = (ipNum & maskBits) >>> 0;

  const ips: string[] = [];
  for (let i = 0; i < size; i++) {
    ips.push(longToIp(startIp + i));
  }
  return ips;
}

/**
 * Expands custom start/end IP bounds.
 */
function expandIpRange(startIp: string, endIp: string): string[] {
  const startLong = ipToLong(startIp.trim());
  const endLong = ipToLong(endIp.trim());
  if (startLong === null || endLong === null) {
    throw new Error("Invalid start/end IP boundary specified.");
  }

  const min = Math.min(startLong, endLong);
  const max = Math.max(startLong, endLong);
  const size = max - min + 1;

  if (size > 1024) {
    throw new Error(`Custom IP selection delta (${size} IPs) exceeds maximum safe pre-fetch limit of 1024 IPs.`);
  }

  const ips: string[] = [];
  for (let i = min; i <= max; i++) {
    ips.push(longToIp(i));
  }
  return ips;
}

/**
 * Resolves a ManualScanConfig into a concrete validated candidate IP collection.
 */
export function resolveScanCandidates(config: ManualScanConfig): {
  ips: string[];
  warnings: string[];
} {
  const ipsSet = new Set<string>();
  const warnings: string[] = [];

  // 1. CIDR mode
  if (config.cidr) {
    try {
      const cidrIps = expandCidr(config.cidr);
      cidrIps.forEach(ip => ipsSet.add(ip));
    } catch (e: any) {
      throw new Error(`CIDR Parsing Error: ${e.message}`);
    }
  }

  // 2. Explicit bounds mode
  else if (config.startIp && config.endIp) {
    try {
      const rangeIps = expandIpRange(config.startIp, config.endIp);
      rangeIps.forEach(ip => ipsSet.add(ip));
    } catch (e: any) {
      throw new Error(`IP Range Expansion Error: ${e.message}`);
    }
  }

  // 3. Shorthand range mode
  else if (config.arrayRanges && config.hostRanges) {
    try {
      const arrays = parseRangeString(config.arrayRanges);
      const hosts = parseRangeString(config.hostRanges);

      arrays.forEach(a => {
        hosts.forEach(h => {
          ipsSet.add(`10.0.${a}.${h}`);
        });
      });
    } catch (e: any) {
      throw new Error(`Shorthand Parsing Error: ${e.message}`);
    }
  }

  const resolvedIps = Array.from(ipsSet);

  // Apply Max Scans Target Check
  const maxScanTargets = Number(process.env.FEATHER_MAX_SCAN_TARGETS) || 512;
  if (resolvedIps.length > maxScanTargets) {
    throw new Error(`Requested scan range includes ${resolvedIps.length} target IPs, which exceeds the absolute ceiling limit of ${maxScanTargets}. Configure FEATHER_MAX_SCAN_TARGETS if needed.`);
  }

  // Apply Private IP Guard filter safeguards
  const allowPublic = process.env.ALLOW_PUBLIC_SCAN === "true";
  const publicUnfiltered = resolvedIps.filter(ip => !isPrivateIp(ip));

  if (publicUnfiltered.length > 0 && !allowPublic) {
    throw new Error(`Security Guard: Blocking scan against ${publicUnfiltered.length} public/external subnets (e.g. ${publicUnfiltered[0]}). Port pings must target private LAN ethernet nodes only.`);
  } else if (publicUnfiltered.length > 0 && allowPublic) {
    warnings.push(`Warning: ALLOW_PUBLIC_SCAN override active. Initiating packets towards ${publicUnfiltered.length} public endpoints.`);
  }

  return {
    ips: resolvedIps,
    warnings
  };
}

/**
 * Runs a concurrent port query scanning algorithm.
 */
export async function executeFeatherScan(
  targets: string[] | import("./featherTypes").DiscoveryCandidate[],
  concurrencyLimit: number = 16,
  timeoutMs: number = 3000
): Promise<any[]> {
  const results: any[] = [];
  let index = 0;

  async function worker() {
    while (index < targets.length) {
      const currentIdx = index++;
      const target = targets[currentIdx];
      
      let ip = "";
      let source: any = "manual";
      let candidateInfo: any = undefined;

      if (typeof target === "string") {
         ip = target;
      } else {
         ip = target.deviceIp;
         source = target.sourceDiscoveryMethod || "manual";
         candidateInfo = target;
      }

      try {
        const item = await queryFeatherDevice(ip, source, timeoutMs, candidateInfo);
        results.push(item);
      } catch (err) {
        console.error(`Concurrent scanner crashed on target ${ip}`, err);
      }
    }
  }

  const workerPool = Array.from(
    { length: Math.min(concurrencyLimit, targets.length) },
    worker
  );

  await Promise.all(workerPool);
  return results;
}
