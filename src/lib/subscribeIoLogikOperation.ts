import type { getIoLogikOperation } from '../server/iologik/iologikFleetService';
type Snapshot = ReturnType<typeof getIoLogikOperation>;
type Listener = (snapshot: Snapshot) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | undefined;
let pending = false;
let revision = '';
let cached: Snapshot | undefined;
async function refresh() {
  if (pending) return;
  pending = true;
  try {
    const response = await fetch('/api/local/iologik/operations');
    if (!response.ok) return;
    const snapshot: Snapshot = await response.json();
    // Publish canonical inventory/progress, never merge old operation payloads in the UI.
    const next = JSON.stringify([snapshot.scopeKey, snapshot.operation, snapshot.scan, snapshot.inventory, snapshot.lastScan]);
    cached = snapshot;
    if (next !== revision) { revision = next; listeners.forEach(listener => listener(snapshot)); }
  } catch { /* Retain last report on transport failure. */ }
  finally {
    pending = false;
    if (listeners.size) timer = setTimeout(() => void refresh(), cached?.scan?.state === 'running' ? 1000 : 3000);
  }
}
/** One shared, read-only inventory/status subscription, never device acquisition. */
export function subscribeIoLogikOperation(listener: Listener) {
  listeners.add(listener);
  if (cached) listener(cached);
  if (listeners.size === 1 && !pending) void refresh();
  return () => { listeners.delete(listener); if (!listeners.size) { clearTimeout(timer); timer = undefined; } };
}
