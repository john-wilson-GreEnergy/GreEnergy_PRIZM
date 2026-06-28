export type ProvisioningBundleStatus =
  | "ready"
  | "partial"
  | "blocked"
  | "invalid";

export type ProvisioningBundleFileStatus =
  | "present"
  | "missing"
  | "invalid"
  | "optional-missing";

export type ProvisioningBundleValidationResult = {
  bundleId: string;
  bundlePath: string;
  bundleType: "feather-hatchery" | "unknown";
  status: ProvisioningBundleStatus;
  validatedAt: string;

  requiredFiles: Array<{
    path: string;
    status: ProvisioningBundleFileStatus;
    sizeBytes?: number;
    notes?: string;
  }>;

  optionalFiles: Array<{
    path: string;
    status: ProvisioningBundleFileStatus;
    sizeBytes?: number;
    notes?: string;
  }>;

  requiredDirectories: Array<{
    path: string;
    status: ProvisioningBundleFileStatus;
    notes?: string;
  }>;

  inspections: Array<{
    key: string;
    label: string;
    status: "pass" | "warn" | "fail" | "not-applicable";
    notes?: string;
  }>;

  summary: {
    requiredPresent: number;
    requiredMissing: number;
    optionalPresent: number;
    optionalMissing: number;
    inspectionPass: number;
    inspectionWarn: number;
    inspectionFail: number;
  };

  warnings: string[];
  errors: string[];
};
