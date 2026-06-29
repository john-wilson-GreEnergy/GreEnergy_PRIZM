export type ProvisioningPlanPreview = {
  planId: string;
  createdAt: string;
  status: "preview-only" | "invalid";
  target: {
    workflowMode: "baseline-only" | "hatchery-only" | "baseline-and-hatchery";
    startingTargetState: "default-ip" | "existing-site-ip";
    startingIp: string;
    finalFeatherIp: string;
    postBaselineIp: string;
    gateway: string;
    networkType: "in-network" | "external";
    featherType?: "CS" | "ES";
    featherIndex?: number;
    ioLogikIp?: string;
    ioLogikSource?: "calculated" | "override" | "user-input";
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
    stageGroup?: "baseline" | "hatchery" | "verification" | "record";
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
