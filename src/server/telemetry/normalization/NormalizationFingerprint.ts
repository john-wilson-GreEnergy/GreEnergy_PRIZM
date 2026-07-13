const objectIds = new WeakMap<object, number>();
let nextObjectId = 0;

function sourceToken(value: unknown): string {
  if ((typeof value === "object" && value !== null) || typeof value === "function") {
    const objectValue = value as object;
    let id = objectIds.get(objectValue);
    if (id == null) { id = ++nextObjectId; objectIds.set(objectValue, id); }
    return `object:${id}`;
  }
  return `${typeof value}:${String(value)}`;
}

export function createNormalizationFingerprint(...sources: unknown[]): string {
  return sources.map(sourceToken).join("|");
}
