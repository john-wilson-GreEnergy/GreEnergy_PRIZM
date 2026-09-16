import { EntityDomainBroker } from "./EntityDomainBroker";

function stringKey(row: any): string | null {
  const arrayNumber = Number(row?.arrayNumber ?? row?.arrayIndex);
  const stringNumber = Number(row?.stringNumber ?? row?.stringIndex);
  return Number.isFinite(arrayNumber) && Number.isFinite(stringNumber) ? `${arrayNumber}:${stringNumber}` : null;
}

export const stringDomainBroker = new EntityDomainBroker<any>("strings", stringKey);
const protectedTargets = new Map<string, number>();

export function publishBulkStringRows(rows: any[], capturedAt: string): void {
  const now = Date.now();
  const eligible = rows.filter((row) => {
    const key = stringKey(row);
    if (!key) return false;
    const protectedUntil = protectedTargets.get(key) || 0;
    if (protectedUntil <= now) protectedTargets.delete(key);
    return protectedUntil <= now;
  });
  stringDomainBroker.publish(eligible, capturedAt);
}

export function publishContactorStateToStringBroker(state: any): void {
  const key = stringKey(state);
  if (!key) return;
  protectedTargets.set(key, Date.now() + 10_000);
  const closed = state.positiveContactorClosed === true && state.negativeContactorClosed === true;
  const open = state.positiveContactorClosed === false && state.negativeContactorClosed === false;
  stringDomainBroker.patch(key, {
    contactor: state,
    positiveContactorClosed: state.positiveContactorClosed,
    negativeContactorClosed: state.negativeContactorClosed,
    contactorsCloseExpected: state.contactorsCloseExpected,
    dcBusVoltage: state.dcBusVoltage,
    busVoltage: state.dcBusVoltage,
    busVoltageVdc: state.dcBusVoltage,
    bothContactorsClosed: closed ? true : open ? false : null,
    contactorStatus: closed ? "CLOSED" : open ? "OPEN" : "PARTIAL",
    contactorState: closed ? "CLOSED" : open ? "OPEN" : "PARTIAL",
    stringContactorState: closed ? "CLOSED" : open ? "OPEN" : "PARTIAL",
    actualContactorStateSource: "post-command-stringviewer"
  }, state.fetchedAt || new Date().toISOString());
}

export function publishBusVoltageToStringBroker(state: any): void {
  const key = stringKey(state);
  if (!key || !Number.isFinite(Number(state?.dcBusVoltage))) return;

  // An array-wide StringViewer sweep is fresher than the bulk lastCall payload.
  // Briefly protect each voltage update so an older bulk poll cannot replace it.
  protectedTargets.set(key, Date.now() + 10_000);
  const dcBusVoltage = Number(state.dcBusVoltage);
  stringDomainBroker.patch(key, {
    dcBusVoltage,
    busVoltage: dcBusVoltage,
    busVoltageVdc: dcBusVoltage,
    busVoltageSource: "post-command-array-stringviewer"
  }, state.fetchedAt || new Date().toISOString());
}
