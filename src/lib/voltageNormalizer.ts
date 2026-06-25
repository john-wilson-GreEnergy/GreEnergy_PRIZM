export const normalizeVoltage = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const num = Number(v);
  if (isNaN(num)) return null;
  // If it's a small voltage like 3.2, assume volts, convert to mV
  if (num >= 2 && num <= 5) {
    return num * 1000;
  }
  // If it's within standard cell range in mV
  if (num >= 1500 && num <= 4500) {
    return num;
  }
  return null; // treat as invalid/unavailable
};

export const normalizeDeltaVoltage = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const num = Number(v);
  if (isNaN(num)) return null;
  // If it's a very small delta, assume volts, convert to mV
  if (num > 0 && num < 1.5) {
    return num * 1000;
  }
  return num;
};
