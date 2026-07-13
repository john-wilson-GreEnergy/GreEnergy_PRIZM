export * from "./StringViewerTypes";
export * from "./StringViewerPriority";
export * from "./StringViewerCache";
export * from "./StringViewerMetrics";
export * from "./StringViewerScheduler";
export * from "./StringViewerRoutes";

import { stringViewerScheduler } from "./StringViewerScheduler";
export const markStringVisible = (stringKey: string): void => stringViewerScheduler.markStringVisible(stringKey);
export const markStringHidden = (stringKey: string): void => stringViewerScheduler.markStringHidden(stringKey);
export const requestStringDetailRefresh = (stringKey: string, reason = "detail-request"): void => stringViewerScheduler.requestRefresh(stringKey, reason);
