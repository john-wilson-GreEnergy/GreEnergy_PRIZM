export type NotificationSummaryVisibility = "show" | "rollupOnly" | "suppress";

export type NotificationCatalogEntry = {
  code: string;
  name: string;
  family?: string;
  component?: string;
  summaryVisibility?: NotificationSummaryVisibility;
  exportVisibility?: "include" | "exclude";
};

export const NOTIFICATION_CATALOG: Record<string, NotificationCatalogEntry> = {
  "1023": {
    code: "1023",
    name: "Cell Group Disconnect Alarm",
    family: "cgc-disconnect",
    component: "Cell Group",
    summaryVisibility: "show",
    exportVisibility: "include"
  },
  "2023": {
    code: "2023",
    name: "Cell Group Disconnect Warning",
    family: "cgc-disconnect",
    component: "Cell Group",
    summaryVisibility: "show",
    exportVisibility: "include"
  },
  "3023": {
    code: "3023",
    name: "Cell Group Disconnect Info",
    family: "cgc-disconnect",
    component: "Cell Group",
    summaryVisibility: "rollupOnly",
    exportVisibility: "exclude"
  },
  "2073": {
    code: "2073",
    name: "CellGroup Discharge Balancer Warning",
    family: "bpc-not-balancing",
    component: "BPC",
    summaryVisibility: "show",
    exportVisibility: "include"
  },
  "2074": {
    code: "2074",
    name: "CellGroup Charge Balancer Warning",
    family: "bpc-not-balancing",
    component: "BPC",
    summaryVisibility: "show",
    exportVisibility: "include"
  },
  "2534": {
    code: "2534",
    name: "Contactors Open Warning",
    family: "contactor-open",
    component: "String",
    summaryVisibility: "rollupOnly",
    exportVisibility: "exclude"
  },
  "2561": {
    code: "2561",
    name: "String OOR Warning",
    family: "string-out-of-rotation",
    component: "String",
    summaryVisibility: "rollupOnly",
    exportVisibility: "exclude"
  }
};

export function getNotificationCatalogEntry(code: string | number | null | undefined): NotificationCatalogEntry | null {
  if (code === null || code === undefined) return null;
  return NOTIFICATION_CATALOG[String(code)] || null;
}

export function getNotificationBaseCode(code: string | number | null | undefined): string {
  if (code === null || code === undefined) return "unknown";
  const n = Number(code);
  if (!Number.isFinite(n)) return String(code);
  return String(n % 1000).padStart(3, "0");
}
