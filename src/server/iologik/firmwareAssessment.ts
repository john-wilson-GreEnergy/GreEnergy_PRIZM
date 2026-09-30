import { reportedFirmwareBuild } from './firmwareIdentity';

type Reading = { firmware?: string | null; firmwareRaw?: string | null; reachable?: boolean | null };
type Package = { verified?: boolean; version?: string | null; build?: string | null } | null;
export function assessIoLogikFirmware(row: Reading, target: Package): {firmwareStatus:'ok'|'mismatch'|'unknown';firmwareDetail:string} {
  const unknown = (firmwareDetail:string) => ({firmwareStatus:'unknown' as const,firmwareDetail});
  if (!target?.verified || !target.version || !target.build) return unknown('Import a vendor-verified firmware package to compare versions and builds.');
  const expected = `v${target.version} Build${target.build}`;
  if (row.reachable === false || !row.firmware || !/^\d+(?:\.\d+)+$/.test(row.firmware)) return unknown(`Firmware not verified; expected ${expected}.`);
  const actual = row.firmware.split('.').map(Number), wanted = target.version.split('.').map(Number);
  if (!actual.every(Number.isFinite) || !wanted.every(Number.isFinite)) return unknown('Firmware version format is not supported.');
  if (actual.some((part,index)=>index<wanted.length && part!==wanted[index])) return {firmwareStatus:'mismatch',firmwareDetail:`Reported v${row.firmware}; package is ${expected}. A mismatch is not authorization to upgrade or downgrade.`};
  if (actual.length!==wanted.length) return unknown(`Partial version comparison: v${row.firmware}; expected ${expected}.`);
  const build = reportedFirmwareBuild(row.firmwareRaw ?? null);
  if (!build) return unknown(`Version matches, but build is not reported; expected ${expected}.`);
  if (build!==target.build) return {firmwareStatus:'mismatch',firmwareDetail:`Reported Build${build}; expected ${expected}.`};
  return {firmwareStatus:'ok',firmwareDetail:`Matches verified package ${expected}.`};
}
