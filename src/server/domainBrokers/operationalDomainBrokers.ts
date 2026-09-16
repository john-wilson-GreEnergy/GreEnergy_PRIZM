import { EntityDomainBroker } from "./EntityDomainBroker";
import { publishBulkStringRows, stringDomainBroker } from "./stringDomainBroker";

const keyFrom = (...fields: string[]) => (row: any): string | null => {
  for (const field of fields) {
    const value = row?.[field];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return null;
};

export const operationalDomainBrokers = {
  strings: stringDomainBroker,
  pcs: new EntityDomainBroker<any>("pcs", (row) => {
    const array = row?.arrayNumber ?? row?.arrayIndex;
    const pcs = row?.pcsNumber ?? row?.pcsIndex ?? row?.index ?? 1;
    return array == null ? keyFrom("id", "entityKey", "ipAddress")(row) : `${array}:${pcs}`;
  }),
  hvac: new EntityDomainBroker<any>("hvac", keyFrom("entityKey", "id", "ipAddress", "ip", "controllerIp")),
  safety: new EntityDomainBroker<any>("safety", (row) => {
    const explicit = keyFrom("entityKey", "id", "deviceKey")(row);
    if (explicit) return explicit;
    const array = row?.arrayNumber ?? row?.arrayIndex ?? "site";
    const segment = row?.segmentNumber ?? row?.segmentIndex ?? row?.segmentLabel ?? "segment";
    const device = row?.displayName ?? row?.name ?? row?.sensorType ?? "sensor";
    return `${array}:${segment}:${device}`;
  }),
  "ems-apps": new EntityDomainBroker<any>("ems-apps", keyFrom("appCode", "code", "id", "name")),
  topology: new EntityDomainBroker<any>("topology", (row) => {
    const array = row?.arrayNumber ?? row?.arrayIndex ?? row?.index;
    return array == null ? keyFrom("entityKey", "id", "name")(row) : `array:${array}`;
  }),
  lightbars: new EntityDomainBroker<any>("lightbars", (row) => {
    const array = row?.arrayNumber ?? row?.arrayIndex;
    const string = row?.stringNumber ?? row?.stringIndex;
    return array != null && string != null ? `${array}:${string}` : null;
  })
} as const;

export type OperationalDomainName = keyof typeof operationalDomainBrokers;

export function publishOperationalDomains(snapshot: any, capturedAt = new Date().toISOString()): void {
  const normalized = snapshot?.normalized || {};
  publishBulkStringRows(Array.isArray(normalized.strings) ? normalized.strings : [], capturedAt);
  operationalDomainBrokers.pcs.publish(Array.isArray(normalized.pcs) ? normalized.pcs : [], capturedAt);
  operationalDomainBrokers.hvac.publish(Array.isArray(normalized.feather) ? normalized.feather : [], capturedAt);
  operationalDomainBrokers.safety.publish(Array.isArray(normalized.sensors) ? normalized.sensors : [], capturedAt);
  operationalDomainBrokers["ems-apps"].publish(Array.isArray(normalized.emsApps) ? normalized.emsApps : [], capturedAt);
  operationalDomainBrokers.topology.publish(Array.isArray(normalized.arrays) ? normalized.arrays : [], capturedAt);

  const lightbars = (Array.isArray(normalized.strings) ? normalized.strings : []).map((row: any) => ({
    arrayNumber: row.arrayNumber ?? row.arrayIndex,
    stringNumber: row.stringNumber ?? row.stringIndex,
    command: row.lightbarCommand ?? row.lastLightbarCommand ?? null,
    status: row.lightbarStatus ?? null,
    sourceTimestamp: row.timestampUtc ?? row.timestamp ?? capturedAt
  }));
  operationalDomainBrokers.lightbars.publish(lightbars, capturedAt);
}

export function getOperationalDomainBroker(name: string): EntityDomainBroker<any> | null {
  return (operationalDomainBrokers as Record<string, EntityDomainBroker<any>>)[name] || null;
}
