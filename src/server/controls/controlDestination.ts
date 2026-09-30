import { ProfileStore } from '../profiles/profileStore';
import { buildEmsBaseUrl } from '../profiles/profileManager';
import { getEmsCachedBlock, isDemoActive } from '../emsTurtleClient';

/** Pin each command workflow to the enrolled profile and matching EMS identity. */
export function resolveControlDestination() {
  const profile = ProfileStore.getActiveProfile();
  if (!profile || isDemoActive()) throw new Error('Live controls require an active non-demo EMS profile');
  const baseUrl = buildEmsBaseUrl(profile).replace(/\/$/, '');
  const cache = getEmsCachedBlock();
  const report = cache?.data?.blockReport ?? cache?.data;
  const stationCode = report?.topology?.stationCode ?? report?.stationCode;
  const blockIndex = report?.topology?.blockIndex ?? report?.blockIndex;
  if (!profile.stationCode || !Number.isSafeInteger(profile.blockIndex) || profile.blockIndex < 1 ||
      stationCode !== profile.stationCode || Number(blockIndex) !== profile.blockIndex ||
      !['live', 'partial'].includes(cache?.source) || cache.staleData ||
      cache.activeProfileId !== profile.id || cache.activeEmsBaseUrl?.replace(/\/$/, '') !== baseUrl) {
    throw new Error('Control destination blocked: active profile and EMS identity/ownership are not verified');
  }
  const legacyOverride = process.env.PRIZM_EMS_TURTLE_BASE?.replace(/\/$/, '');
  if (legacyOverride && legacyOverride !== baseUrl) throw new Error('Legacy EMS override conflicts with the active site profile');
  const key = JSON.stringify([profile.id, baseUrl, profile.stationCode, profile.blockIndex, profile.arrayCount, profile.stringsPerArray, profile.topologyModel]);
  return {
    baseUrl, stationCode: profile.stationCode, blockIndex: profile.blockIndex,
    assertCurrent() {
      const current = ProfileStore.getActiveProfile();
      if (!current || isDemoActive() || JSON.stringify([current.id, buildEmsBaseUrl(current).replace(/\/$/, ''), current.stationCode, current.blockIndex, current.arrayCount, current.stringsPerArray, current.topologyModel]) !== key ||
          (process.env.PRIZM_EMS_TURTLE_BASE && process.env.PRIZM_EMS_TURTLE_BASE.replace(/\/$/, '') !== baseUrl)) {
        throw new Error('Active site changed during control workflow; remaining commands were not sent');
      }
    },
  };
}
