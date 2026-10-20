/** Local summary delivery only: never changes equipment polling. */
export function fleetRefreshMs(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1000 && parsed <= 4000 ? parsed : 4000;
}
