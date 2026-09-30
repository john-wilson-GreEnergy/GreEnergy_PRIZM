/** Local identity policy, shared by provisioning and authentication. No network lookup. */
export function normalizeLocalEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 320) return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const [name, domain] = parts;
  if (!name || name.length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(name) || name.startsWith('.') || name.endsWith('.') || name.includes('..')) return null;
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return email;
}
