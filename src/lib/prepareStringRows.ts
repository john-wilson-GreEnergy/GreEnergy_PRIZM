import type {CanonicalStringSnapshotResult} from '../server/normalizers/canonicalStringSnapshot';
import {RowProjectionCache} from './rowProjectionCache';
type Row = CanonicalStringSnapshotResult['strings'][number];
const identity = (row: Row) => `${Number(row.arrayNumber ?? row.arrayIndex)}:${Number(row.stringNumber ?? row.stringIndex)}`;

/** Existing fast/snapshot/command-overlay merge, with optional identity reuse. */
export function prepareStringRows(snapshotRows: Row[], fastRows: Row[], overlays: Map<string, Row>, cache?: RowProjectionCache<Row>): Row[] {
  const snapshotByIdentity = new Map(snapshotRows.map(row => [identity(row), row]));
  const entries = (fastRows.length ? fastRows : snapshotRows).map(row => {
    const key = identity(row);
    const snapshotRow = fastRows.length ? snapshotByIdentity.get(key) : undefined;
    const state = overlays.get(key);
    return {key, inputs: [row, snapshotRow, state, fastRows.length > 0], build: () => {
      const merged = fastRows.length ? {...snapshotRow, ...row} : row;
      // Preserve existing balancing authority until richer fast telemetry arrives.
      if (fastRows.length && row.balanceTelemetryAvailable !== true && snapshotRow?.balanceTelemetryAvailable === true) {
        merged.balanceTelemetryAvailable = true;
        merged.balanceCount = snapshotRow.balanceCount;
        merged.balanceActivity = snapshotRow.balanceActivity;
        merged.balanceMode = snapshotRow.balanceMode;
        merged.balanceModeRaw = snapshotRow.balanceModeRaw;
        merged.balanceProvidedVoltageTarget = snapshotRow.balanceProvidedVoltageTarget;
        merged.balanceDetails = snapshotRow.balanceDetails;
      }
      if (!state) return merged;
      const closed = state.positiveContactorClosed === true && state.negativeContactorClosed === true;
      const open = state.positiveContactorClosed === false && state.negativeContactorClosed === false;
      return {...merged, contactor: state,
        positiveContactorClosed: state.positiveContactorClosed,
        negativeContactorClosed: state.negativeContactorClosed,
        contactorsCloseExpected: state.contactorsCloseExpected,
        dcBusVoltage: state.dcBusVoltage, busVoltage: state.dcBusVoltage, busVoltageVdc: state.dcBusVoltage,
        bothContactorsClosed: closed ? true : open ? false : null,
        contactorStatus: closed ? 'CLOSED' : open ? 'OPEN' : 'PARTIAL',
        contactorState: closed ? 'CLOSED' : open ? 'OPEN' : 'PARTIAL',
        stringContactorState: closed ? 'CLOSED' : open ? 'OPEN' : 'PARTIAL',
        actualContactorStateSource: 'post-command-stringviewer'};
    }};
  });
  return cache ? cache.project(entries) : entries.map(entry => entry.build());
}
