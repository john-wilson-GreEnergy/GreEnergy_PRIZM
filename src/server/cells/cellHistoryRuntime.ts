import path from 'node:path';
import {CellHistory} from './CellHistory';
import {ProfileStore} from '../profiles/profileStore';
import {buildEmsBaseUrl} from '../profiles/profileManager';

const bounded = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
export const cellHistory = new CellHistory({
  directory: path.resolve(process.cwd(), '.prizm-data', 'cell-history'),
  enabled: process.env.PRIZM_CELL_HISTORY_ENABLED === 'true',
  workerQueries: process.env.PRIZM_CELL_HISTORY_WORKER !== 'false',
  retentionDays: bounded(process.env.PRIZM_CELL_HISTORY_RETENTION_DAYS, 7, 1, 30),
  maxBytes: bounded(process.env.PRIZM_CELL_HISTORY_MAX_GIB, 8, 1, 32) * 1024 ** 3,
  currentSite: () => {
    const profile = ProfileStore.getActiveProfile();
    return profile?.stationCode && Number.isInteger(profile.blockIndex) ? {stationCode: profile.stationCode, blockIndex: profile.blockIndex, emsBaseUrl: buildEmsBaseUrl(profile)} : null;
  },
});
