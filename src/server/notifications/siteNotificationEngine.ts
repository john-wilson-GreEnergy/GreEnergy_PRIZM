import { getCorrectiveActionsView } from "../prizmDataCoordinator";
import {
  getNotificationBaseCode,
  getNotificationCatalogEntry
} from "./notificationCatalog";

export type NotificationFilterPreset =
  | "summaryDefault"
  | "summaryAll"
  | "stringDetail"
  | "stringListTotals"
  | "correctiveActions"
  | "export";

export type NormalizedSiteNotification = {
  id: string;
  actionId?: string;
  code: string;
  rawCode?: string;
  baseCode?: string;
  severity: "alarm" | "warning" | "info";
  level: "ALARM" | "WARNING" | "INFO";
  name: string;
  description: string;
  category: string;
  source: {
    endpointType?: string;
    arrayIndex?: number | null;
    energySegmentIndex?: number | null;
    stringIndex?: number | null;
    side?: string | null;
    batteryPackIndex?: number | null;
    cellGroupIndex?: number | null;
    featherIndex?: number | null;
    deviceIp?: string | null;
  };
  scope:
    | "site"
    | "array"
    | "string"
    | "bpc"
    | "cellGroup"
    | "feather"
    | "environmental"
    | "network"
    | "unknown";
  summaryVisibility: "show" | "suppress" | "rollupOnly";
  exportVisibility: "include" | "exclude";
  family?: string;
  component?: string;
  relatedNotifications?: NormalizedSiteNotification[];
  suppressedBySeverity?: NormalizedSiteNotification[];
  troubleshooting?: any;
  correctiveAction?: any;
  raw: any;
};

function toNumber(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getActionList(): any[] {
  const view: any = getCorrectiveActionsView();

  if (Array.isArray(view)) return view;
  if (Array.isArray(view?.correctiveActions)) return view.correctiveActions;
  if (Array.isArray(view?.actions)) return view.actions;

  return [];
}

function normalizeSeverity(action: any, code: string): "alarm" | "warning" | "info" {
  const raw = String(action?.severity ?? action?.level ?? action?.category ?? "").toUpperCase();

  if (raw.includes("ALARM") || raw.includes("FAULT") || raw.includes("CRITICAL")) return "alarm";
  if (raw.includes("WARN")) return "warning";

  const numericCode = Number(code);
  if (Number.isFinite(numericCode)) {
    if (numericCode >= 1000 && numericCode < 2000) return "alarm";
    if (numericCode >= 2000 && numericCode < 3000) return "warning";
  }

  return "info";
}

function getBaseCode(code: string): string {
  return getNotificationBaseCode(code);
}

function inferScope(source: NormalizedSiteNotification["source"], action: any): NormalizedSiteNotification["scope"] {
  const haystack = [
    source.endpointType,
    action?.source,
    action?.faultName,
    action?.faultLabel,
    action?.name,
    action?.title,
    action?.description
  ].filter(Boolean).join(" ").toUpperCase();

  if (source.cellGroupIndex != null) return "cellGroup";
  if (source.batteryPackIndex != null) return "bpc";
  if (source.stringIndex != null) return "string";
  if (source.arrayIndex != null) return "array";
  if (haystack.includes("FEATHER")) return "feather";
  if (haystack.includes("LEAK") || haystack.includes("DOOR") || haystack.includes("HVAC") || haystack.includes("ENVIRONMENT")) return "environmental";
  if (haystack.includes("COMM") || haystack.includes("NETWORK") || haystack.includes("MODBUS")) return "network";

  return "unknown";
}

function summaryVisibilityFor(n: Pick<NormalizedSiteNotification, "code" | "name" | "description" | "severity">): "show" | "suppress" | "rollupOnly" {
  const text = `${n.code} ${n.name} ${n.description}`.toUpperCase();

  // Keep them countable, but do not spam the default summary action table.
  if (
    text.includes("STRING OOR") ||
    text.includes("OUT OF ROTATION") ||
    text.includes("OUT-OF-ROTATION") ||
    text.includes("CONTACTORS OPEN") ||
    text.includes("CONTACTOR OPEN")
  ) {
    return "rollupOnly";
  }

  return "show";
}

function normalizeFromAction(action: any, target: any, targetIndex: number): NormalizedSiteNotification {
  const code = String(
    action?.rawCode ??
    action?.code ??
    action?.faultCode ??
    action?.notificationId ??
    action?.id ??
    "unknown"
  );

  const severity = normalizeSeverity(action, code);
  const level = severity === "alarm" ? "ALARM" : severity === "warning" ? "WARNING" : "INFO";

  const source = {
    endpointType: target?.endpointType ?? action?.endpointType ?? action?.source ?? null,
    arrayIndex: toNumber(target?.arrayIndex ?? action?.arrayIndex),
    energySegmentIndex: toNumber(target?.energySegmentIndex ?? action?.energySegmentIndex),
    stringIndex: toNumber(target?.stringIndex ?? action?.stringIndex),
    side: target?.side ?? action?.side ?? null,
    batteryPackIndex: toNumber(target?.batteryPackIndex ?? target?.bpcIndex ?? action?.batteryPackIndex),
    cellGroupIndex: toNumber(target?.cellGroupIndex ?? target?.cgIndex ?? action?.cellGroupIndex),
    featherIndex: toNumber(target?.featherIndex ?? action?.featherIndex),
    deviceIp: target?.deviceIp ?? action?.deviceIp ?? null
  };

  const catalogEntry = getNotificationCatalogEntry(code);

  const name = String(
    catalogEntry?.name ??
    action?.faultName ??
    action?.faultLabel ??
    action?.name ??
    action?.title ??
    `${level} Code ${code}`
  );

  const description = String(
    action?.description ??
    action?.summary ??
    action?.message ??
    name
  );

  const normalized: NormalizedSiteNotification = {
    id: `${action?.id ?? "action"}:${code}:${targetIndex}:${source.arrayIndex ?? "site"}:${source.stringIndex ?? "x"}:${source.batteryPackIndex ?? "x"}:${source.cellGroupIndex ?? "x"}`,
    actionId: action?.id,
    code,
    rawCode: String(action?.rawCode ?? code),
    baseCode: getBaseCode(code),
    severity,
    level,
    name,
    description,
    category: String(action?.category ?? action?.source ?? source.endpointType ?? catalogEntry?.component ?? "notification"),
    source,
    scope: inferScope(source, action),
    summaryVisibility: catalogEntry?.summaryVisibility ?? "show",
    exportVisibility: catalogEntry?.exportVisibility ?? "include",
    family: catalogEntry?.family ?? getBaseCode(code),
    component: catalogEntry?.component,
    relatedNotifications: [],
    suppressedBySeverity: [],
    troubleshooting: action?.resolved ?? action?.troubleshooting ?? action?.resolvedTroubleshooting ?? null,
    correctiveAction: action,
    raw: {
      action,
      target
    }
  };

  if (!catalogEntry?.summaryVisibility) {
    normalized.summaryVisibility = summaryVisibilityFor(normalized);
  }

  return normalized;
}

function buildNotificationsFromCorrectiveActions(): NormalizedSiteNotification[] {
  const actions = getActionList();
  const notifications: NormalizedSiteNotification[] = [];

  for (const action of actions) {
    const targets = action?.affectedTargets ?? action?.affected ?? [];

    if (Array.isArray(targets) && targets.length > 0) {
      targets.forEach((target: any, index: number) => {
        notifications.push(normalizeFromAction(action, target, index));
      });
    } else {
      notifications.push(normalizeFromAction(action, action, 0));
    }
  }

  return notifications;
}

function severityRank(severity: NormalizedSiteNotification["severity"]): number {
  if (severity === "alarm") return 3;
  if (severity === "warning") return 2;
  if (severity === "info") return 1;
  return 0;
}

function buildSeverityGroupKey(n: NormalizedSiteNotification): string {
  const source = n.source || {};
  return [
    n.family || n.baseCode || getBaseCode(n.code),
    source.arrayIndex ?? "site",
    source.stringIndex ?? "x",
    source.batteryPackIndex ?? "x",
    source.cellGroupIndex ?? "x",
    source.deviceIp ?? "x",
    n.troubleshooting?.matrixEntryId ?? n.troubleshooting?.id ?? "x"
  ].join("|");
}

function groupByHighestSeverity(notifications: NormalizedSiteNotification[]): {
  groupedNotifications: NormalizedSiteNotification[];
  suppressedBySeverity: NormalizedSiteNotification[];
} {
  const groups = new Map<string, NormalizedSiteNotification[]>();

  for (const n of notifications) {
    const key = buildSeverityGroupKey(n);
    const group = groups.get(key) || [];
    group.push(n);
    groups.set(key, group);
  }

  const groupedNotifications: NormalizedSiteNotification[] = [];
  const suppressedBySeverity: NormalizedSiteNotification[] = [];

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => {
      const rankDiff = severityRank(b.severity) - severityRank(a.severity);
      if (rankDiff !== 0) return rankDiff;
      return Number(b.code) - Number(a.code);
    });

    const winner = {
      ...sorted[0],
      relatedNotifications: sorted,
      suppressedBySeverity: sorted.slice(1)
    };

    groupedNotifications.push(winner);
    suppressedBySeverity.push(...sorted.slice(1));
  }

  return { groupedNotifications, suppressedBySeverity };
}

function applyFilter(notifications: NormalizedSiteNotification[], filter: NotificationFilterPreset): {
  notifications: NormalizedSiteNotification[];
  suppressed: NormalizedSiteNotification[];
} {
  if (filter === "summaryAll" || filter === "stringDetail" || filter === "stringListTotals") {
    return { notifications, suppressed: [] };
  }

  if (filter === "summaryDefault" || filter === "correctiveActions" || filter === "export") {
    const visible = notifications.filter((n) => n.summaryVisibility === "show");
    const suppressed = notifications.filter((n) => n.summaryVisibility !== "show");
    return { notifications: visible, suppressed };
  }

  return { notifications, suppressed: [] };
}

function buildRollups(notifications: NormalizedSiteNotification[]) {
  const byString: Record<string, any> = {};
  const byArray: Record<string, any> = {};
  const byCode: Record<string, any> = {};

  let alarmCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  const bumpSeverity = (bucket: any, n: NormalizedSiteNotification) => {
    bucket.count = (bucket.count || 0) + 1;
    bucket.alarmCount = (bucket.alarmCount || 0) + (n.severity === "alarm" ? 1 : 0);
    bucket.warningCount = (bucket.warningCount || 0) + (n.severity === "warning" ? 1 : 0);
    bucket.infoCount = (bucket.infoCount || 0) + (n.severity === "info" ? 1 : 0);
    bucket.highestSeverity =
      bucket.alarmCount > 0 ? "alarm" :
      bucket.warningCount > 0 ? "warning" :
      bucket.infoCount > 0 ? "info" :
      "none";
  };

  for (const n of notifications) {
    if (n.severity === "alarm") alarmCount += 1;
    else if (n.severity === "warning") warningCount += 1;
    else infoCount += 1;

    const a = n.source.arrayIndex;
    const s = n.source.stringIndex;

    if (a != null) {
      const arrayKey = String(a);
      byArray[arrayKey] ||= { arrayIndex: a, count: 0, alarmCount: 0, warningCount: 0, infoCount: 0 };
      bumpSeverity(byArray[arrayKey], n);
    }

    if (a != null && s != null) {
      const stringKey = `${a}-${s}`;
      byString[stringKey] ||= { arrayIndex: a, stringIndex: s, count: 0, alarmCount: 0, warningCount: 0, infoCount: 0 };
      bumpSeverity(byString[stringKey], n);
    }

    byCode[n.code] ||= { code: n.code, baseCode: n.baseCode, name: n.name, count: 0, alarmCount: 0, warningCount: 0, infoCount: 0 };
    bumpSeverity(byCode[n.code], n);
  }

  return {
    alarmCount,
    warningCount,
    infoCount,
    totalCount: notifications.length,
    byString,
    byArray,
    byCode
  };
}

export function getSiteNotificationEngineView(options?: { filter?: NotificationFilterPreset }) {
  const filter = options?.filter ?? "summaryDefault";
  const allNotifications = buildNotificationsFromCorrectiveActions();
  const filtered = applyFilter(allNotifications, filter);

  const grouped = groupByHighestSeverity(filtered.notifications);
  const allGrouped = groupByHighestSeverity(allNotifications);

  return {
    success: true,
    source: "corrective-actions",
    filter,
    notifications: filtered.notifications,
    groupedNotifications: grouped.groupedNotifications,
    suppressedBySeverity: grouped.suppressedBySeverity,
    suppressed: filtered.suppressed,
    rollups: buildRollups(filtered.notifications),
    groupedRollups: buildRollups(grouped.groupedNotifications),
    allRollups: buildRollups(allNotifications),
    allGroupedRollups: buildRollups(allGrouped.groupedNotifications)
  };
}

export function getStringNotificationView(arrayNumber: number, stringNumber: number) {
  const allNotifications = buildNotificationsFromCorrectiveActions();

  const notifications = allNotifications.filter((n) =>
    Number(n.source.arrayIndex) === Number(arrayNumber) &&
    Number(n.source.stringIndex) === Number(stringNumber)
  );

  const alarms = notifications.filter((n) => n.severity === "alarm");
  const warnings = notifications.filter((n) => n.severity === "warning");
  const grouped = groupByHighestSeverity(notifications);
  const groupedAlarms = grouped.groupedNotifications.filter((n) => n.severity === "alarm");
  const groupedWarnings = grouped.groupedNotifications.filter((n) => n.severity === "warning");

  return {
    success: true,
    source: "corrective-actions",
    arrayNumber,
    stringNumber,
    notificationCount: notifications.length,
    alarmCount: alarms.length,
    warningCount: warnings.length,
    highestSeverity: alarms.length > 0 ? "alarm" : warnings.length > 0 ? "warning" : notifications.length > 0 ? "info" : "none",
    groupedNotificationCount: grouped.groupedNotifications.length,
    groupedAlarmCount: groupedAlarms.length,
    groupedWarningCount: groupedWarnings.length,
    groupedHighestSeverity: groupedAlarms.length > 0 ? "alarm" : groupedWarnings.length > 0 ? "warning" : grouped.groupedNotifications.length > 0 ? "info" : "none",
    notifications,
    groupedNotifications: grouped.groupedNotifications,
    suppressedBySeverity: grouped.suppressedBySeverity,
    alarms,
    warnings,
    rollups: buildRollups(notifications),
    groupedRollups: buildRollups(grouped.groupedNotifications)
  };
}

export function getNotificationRollupsView() {
  const allNotifications = buildNotificationsFromCorrectiveActions();
  const grouped = groupByHighestSeverity(allNotifications);

  return {
    success: true,
    source: "corrective-actions",
    raw: buildRollups(allNotifications),
    grouped: buildRollups(grouped.groupedNotifications),
    suppressedBySeverityCount: grouped.suppressedBySeverity.length,
    ...buildRollups(grouped.groupedNotifications)
  };
}
