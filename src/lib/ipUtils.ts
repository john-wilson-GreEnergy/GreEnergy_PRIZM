export function parseIPv4(ip: string | undefined | null): number[] | null {
  if (!ip) return null;
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(p => parseInt(p, 10));
  if (octets.some(isNaN)) return null;
  return octets;
}

export function compareIPv4(a: string | undefined | null, b: string | undefined | null): number {
  const ipA = parseIPv4(a);
  const ipB = parseIPv4(b);
  
  if (ipA === null && ipB === null) return 0;
  if (ipA === null) return 1; // Put invalid/missing IPs at the end
  if (ipB === null) return -1;

  for (let i = 0; i < 4; i++) {
    if (ipA[i] !== ipB[i]) {
      return ipA[i] - ipB[i];
    }
  }
  return 0;
}

export function sortByIPv4<T>(rows: T[], ipSelector: (row: T) => string, direction: "asc" | "desc" = "asc"): T[] {
  return [...rows].sort((a, b) => {
    const ipA = ipSelector(a);
    const ipB = ipSelector(b);
    
    const parsedA = parseIPv4(ipA);
    const parsedB = parseIPv4(ipB);

    if (parsedA === null && parsedB === null) return 0;
    if (parsedA === null) return 1; // Always at the end
    if (parsedB === null) return -1;

    for (let i = 0; i < 4; i++) {
      if (parsedA[i] !== parsedB[i]) {
        const diff = parsedA[i] - parsedB[i];
        return direction === "asc" ? diff : -diff;
      }
    }
    return 0;
  });
}
