export type ProvisioningSourceMode = "external-manifest" | "external-server-path" | "prizm-workspace";

export type ProvisioningWorkspaceValidationResult = {
  workspaceId: string;
  workspaceRoot: string;
  validatedAt: string;
  status: "ready" | "partial" | "blocked" | "invalid";
  supportedWorkflows: {
    baselineOnly: boolean;
    hatcheryOnly: boolean;
    baselineAndHatchery: boolean;
  };
  repoTemplates: Array<{
    path: string;
    category: "baseline" | "hatchery";
    status: "present" | "missing" | "placeholder" | "invalid";
    sizeBytes?: number;
    notes?: string;
  }>;
  siteFiles: Array<{
    path: string;
    category: "baseline" | "netmap" | "war" | "override";
    status: "present" | "missing" | "invalid" | "optional-missing";
    sizeBytes?: number;
    notes?: string;
  }>;
  inspections: Array<{
    key: string;
    label: string;
    status: "pass" | "warn" | "fail" | "not-applicable";
    notes?: string;
  }>;
  warnings: string[];
  errors: string[];
  summary: {
    templatesPresent: number;
    templatesMissing: number;
    templatesPlaceholder: number;
    requiredSiteFilesPresent: number;
    requiredSiteFilesMissing: number;
    optionalSiteFilesPresent: number;
    inspectionPass: number;
    inspectionWarn: number;
    inspectionFail: number;
  };
};
