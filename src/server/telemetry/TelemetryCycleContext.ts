import { AsyncLocalStorage } from "node:async_hooks";

interface TelemetryCycleStore {
  cycleId: number;
}

const cycleStorage = new AsyncLocalStorage<TelemetryCycleStore>();

export function runInTelemetryCycle<T>(cycleId: number, operation: () => T): T {
  return cycleStorage.run({ cycleId }, operation);
}

export function getTelemetryCycleId(): number | null {
  return cycleStorage.getStore()?.cycleId ?? null;
}
