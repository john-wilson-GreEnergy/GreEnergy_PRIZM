export function parseNullableBool(value: any): boolean | null {
  if (value === true || value === false) {
    return value;
  }
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "on" || s === "closed" || s === "in" || s === "enabled" || s === "available") {
      return true;
    }
    if (s === "false" || s === "0" || s === "no" || s === "off" || s === "open" || s === "out" || s === "disabled" || s === "unavailable") {
      return false;
    }
    return null;
  }
  return null;
}
