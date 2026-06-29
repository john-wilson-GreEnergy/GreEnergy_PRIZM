export type ProvisioningPlanPreview = {
  planId: string;
  createdAt: string;
  status: "preview-only" | "invalid";
  target: {
    targetFeatherIp: string;
    featherIndex: number;
    ioLogikIp: string;
    targetLabel?: string;
  };
  bundle: {
    bundleId?: string;
    bundleType?: string;
    bundleStatus?: string;
    bundleDisplayStatus?: string;
    sourceMode: "manifest" | "server-path" | "prizm-workspace";
    sourceLabel?: string;
    bundlePath?: string;
  };
  calculatedValues: Array<{
    key: string;
    label: string;
    value: string | number;
    source: "user-input" | "calculated" | "override";
  }>;
  steps: Array<{
    stepId: string;
    order: number;
    title: string;
    category: "precheck" | "backup" | "stage" | "patch" | "install" | "restart" | "validate" | "record";
    executionType: "future-controlled-command" | "future-file-copy" | "future-config-edit" | "future-validation" | "manual-review";
    riskLevel: "low" | "medium" | "high";
    description: string;
    wouldModifyTarget: boolean;
    requiresCredentials: boolean;
    commandsPreview?: string[];
    filesRead?: string[];
    filesWritten?: string[];
    validations?: string[];
    warnings?: string[];
  }>;
  warnings: string[];
  errors: string[];
};
