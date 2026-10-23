/** Browser-local liveness only. Never substitutes receipt time for source time. */
let owner: object | null = null;
let lastEvent = 0;
let healthy = false;
export const STRING_STREAM_SILENCE_MS = 12_000;
export function stringStreamHealth(token: object, ready: boolean, now = Date.now()) {
  owner = token; healthy = ready; lastEvent = now;
}
export function releaseStringStream(token: object) {
  if (owner === token) { owner = null; healthy = false; }
}
export function hasHealthyStringStream(now = Date.now()) {
  return owner !== null && healthy && now - lastEvent < STRING_STREAM_SILENCE_MS;
}
