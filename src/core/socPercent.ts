/** EMS/canonical SOC fields are already percentages, including values below 1%.
 * Never infer a fraction from magnitude: 0.6 means 0.6%, not 60%.
 */
export function normalizeSocPercent(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}
