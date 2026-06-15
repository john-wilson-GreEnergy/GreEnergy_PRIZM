export type LightbarMode = "single" | "alt4" | "mirror" | "usa" | "clear";

export interface RGB {
  red: number;
  green: number;
  blue: number;
}

export interface RGBW extends RGB {
  white: number;
}

export interface LightbarPreviewItem {
  array: number;
  string: number;
  red: number;
  green: number;
  blue: number;
  white: number;
  duration: number;
  group: string;
}

export interface LightbarPreviewResponse {
  success: boolean;
  mode: LightbarMode;
  arrayCount: number;
  stringCount: number;
  commandCount: number;
  durationSeconds: number;
  preview: LightbarPreviewItem[];
  warnings: string[];
}

export interface LightbarResultItem {
  array: number;
  string: number;
  red: number;
  green: number;
  blue: number;
  white: number;
  duration: number;
  ok: boolean;
  url: string;
  error: string | null;
}

export interface LightbarApplyResponse {
  success: boolean;
  mode: LightbarMode;
  commandCount: number;
  successCount: number;
  failedCount: number;
  durationSeconds: number;
  results: LightbarResultItem[];
}

export interface LightbarAuditRecord {
  id: string;
  timestamp: string;
  mode: string;
  source: "manual" | "fault-visualizer";
  dryRun: boolean;
  commandCount: number;
  successCount: number;
  failedCount: number;
  duration: number;
  arrays: string;
  strings: string;
  colors?: any;
  faultSignatures?: string[];
  ignoredFaultPatterns?: string[];
  operator?: string;
  warnings?: string[];
  errors?: string[];
}
