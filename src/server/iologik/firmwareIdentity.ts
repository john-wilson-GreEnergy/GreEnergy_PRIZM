import { createHash } from 'node:crypto';

export const MOXA_E1242_V4_SHA512 = '56885404ad90f9bcdb5f5c7ddf8f1837375c8f6cbeb75d3ce067bbb724308f354c434ec0bb2177d775b0aeafbe2fc2ca2cebeacfbb8f4d68fd3ddf64e9c4d871';
const source = 'https://www.moxa.com/en/support/product-support/software-and-documentation?psid=42116';
export type FirmwareSource = { version: string; build: string };
export type FirmwareIdentity = {
  version: string | null; build: string | null; verified: boolean;
  sha512: string; source: string | null; prerequisiteVersion: string | null; upgradeNotice: string;
  directUpgradeFrom: FirmwareSource[];
};

// Offline catalog: add releases only after matching official package checksums and release notes.
// The trailing .1kp is the package extension, not a .1 patch version.
export function identifyFirmwareDigest(sha512: string): FirmwareIdentity {
  if (sha512.toLowerCase() === MOXA_E1242_V4_SHA512) return {
    version: '4.0', build: '24071616', verified: true, sha512: sha512.toLowerCase(), source,
    prerequisiteVersion: '3.4',
    // Field-qualified on E1242 10.0.4.96, 2026-09-25: one upload and two exact readbacks.
    // This exception belongs to these exact package bytes, not arbitrary v4.0 filenames.
    directUpgradeFrom: [{ version: '3.3', build: '22072210' }],
    upgradeNotice: 'Direct E1242 v3.3 Build22072210 → v4.0 Build24071616 is enabled following the successful PRIZM field test. v3.4 remains an allowed adjacent source. Other source versions/builds stay blocked. Each target is checked before upload; recheck configuration and communications after upgrading.',
  };
  return { version: null, build: null, verified: false, sha512, source: null, prerequisiteVersion: null, directUpgradeFrom: [],
    upgradeNotice: 'Package identity is not in the verified offline catalog. Import is allowed for inspection, but firmware deployment is blocked until its vendor checksum, version, build and upgrade path are reviewed.' };
}
export function identifyFirmware(bytes: Uint8Array): FirmwareIdentity {
  return identifyFirmwareDigest(createHash('sha512').update(bytes).digest('hex'));
}
export const reportedFirmwareBuild = (raw: string | null): string | null => raw?.match(/\bBuild\s*:?\s*(\d+)\b/i)?.[1] ?? null;
