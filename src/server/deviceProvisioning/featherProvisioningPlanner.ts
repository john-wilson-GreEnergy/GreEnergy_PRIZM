import { v4 as uuidv4 } from 'uuid';
import { ProvisioningPlanPreview } from './provisioningPlanTypes';
import { ProvisioningBundleValidationResult } from './provisioningTypes';

export function buildProvisioningPlanPreview(
  targetFeatherIp: string,
  featherIndex: number,
  ioLogikIp: string,
  targetLabel: string | undefined,
  bundleValidation: ProvisioningBundleValidationResult,
  bundleSource: { mode: "manifest" | "server-path", sourceLabel: string, bundlePath: string }
): ProvisioningPlanPreview {
  const plan: ProvisioningPlanPreview = {
    planId: uuidv4(),
    createdAt: new Date().toISOString(),
    status: 'preview-only',
    target: {
      targetFeatherIp,
      featherIndex,
      ioLogikIp,
      targetLabel
    },
    bundle: {
      bundleStatus: bundleValidation.status,
      sourceMode: bundleSource.mode,
      sourceLabel: bundleSource.sourceLabel,
      bundlePath: bundleSource.bundlePath
    },
    calculatedValues: [
      { key: 'targetFeatherIp', label: 'Target Feather IP', value: targetFeatherIp, source: 'user-input' },
      { key: 'featherIndex', label: 'Feather Index', value: featherIndex, source: 'user-input' },
      { key: 'ioLogikIp', label: 'ioLogik IP', value: ioLogikIp, source: 'user-input' } // Or calculated depending on how it was passed, but we treat as input here
    ],
    steps: [],
    warnings: [],
    errors: []
  };

  // Validations
  const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
  if (!ipRegex.test(targetFeatherIp)) {
    plan.errors.push(`Invalid Target Feather IP: ${targetFeatherIp}`);
  }
  if (!ipRegex.test(ioLogikIp)) {
    plan.errors.push(`Invalid ioLogik IP: ${ioLogikIp}`);
  }
  if (typeof featherIndex !== 'number' || isNaN(featherIndex)) {
    plan.errors.push(`Feather Index must be a valid number`);
  }

  if (!bundleValidation) {
    plan.errors.push(`Bundle validation result is missing`);
  } else if (bundleValidation.status === 'blocked' || bundleValidation.status === 'invalid') {
    plan.errors.push(`Selected bundle is in ${bundleValidation.status} state`);
  }

  if (bundleSource.mode === 'manifest') {
    plan.warnings.push("Browser-selected bundle contents are not persisted on the server. Future execution will require selecting the same folder again or using Manual Server Path.");
  }

  if (plan.errors.length > 0) {
    plan.status = 'invalid';
    return plan;
  }

  // Build steps
  let order = 1;

  plan.steps.push({
    stepId: uuidv4(),
    order: order++,
    title: 'Validate target inputs',
    category: 'precheck',
    executionType: 'future-validation',
    riskLevel: 'low',
    description: 'Validate target Feather IP format, Feather Index numeric, and ioLogik IP format.',
    wouldModifyTarget: false,
    requiresCredentials: false,
    validations: [
      `Target Feather IP (${targetFeatherIp}) format is valid`,
      `Feather Index (${featherIndex}) is numeric`,
      `ioLogik IP (${ioLogikIp}) format is valid`
    ]
  });

  plan.steps.push({
    stepId: uuidv4(),
    order: order++,
    title: 'Review selected provisioning bundle',
    category: 'precheck',
    executionType: 'manual-review',
    riskLevel: 'low',
    description: 'Review the previously validated bundle status and warnings.',
    wouldModifyTarget: false,
    requiresCredentials: false,
    validations: [
      `Bundle source: ${bundleSource.sourceLabel}`,
      `Bundle status: ${bundleValidation.status}`
    ]
  });

  plan.steps.push({
    stepId: uuidv4(),
    order: order++,
    title: 'Future reachability check',
    category: 'precheck',
    executionType: 'future-validation',
    riskLevel: 'low',
    description: 'Ping target Feather IP and confirm SSH access.',
    wouldModifyTarget: false,
    requiresCredentials: true,
    validations: [
      `Would ping ${targetFeatherIp}`,
      `Would confirm SSH access to moxa@${targetFeatherIp}`
    ]
  });

  plan.steps.push({
    stepId: uuidv4(),
    order: order++,
    title: 'Future backup',
    category: 'backup',
    executionType: 'future-controlled-command',
    riskLevel: 'low',
    description: 'Backup existing remote hatchery folder and relevant Tomcat config files before overwrite.',
    wouldModifyTarget: true,
    requiresCredentials: true,
    commandsPreview: [
      `ssh moxa@${targetFeatherIp} "tar -czf hatchery_backup_$(date +%Y%m%d%H%M%S).tar.gz ~/hatchery"`
    ]
  });

  plan.steps.push({
    stepId: uuidv4(),
    order: order++,
    title: 'Stage bundle to target',
    category: 'stage',
    executionType: 'future-file-copy',
    riskLevel: 'medium',
    description: `Copy hatchery bundle to moxa@${targetFeatherIp}:~/hatchery/`,
    wouldModifyTarget: true,
    requiresCredentials: true,
    filesWritten: [
      `moxa@${targetFeatherIp}:~/hatchery/*`
    ]
  });

  plan.steps.push({
    stepId: uuidv4(),
    order: order++,
    title: 'Patch identity files',
    category: 'patch',
    executionType: 'future-config-edit',
    riskLevel: 'medium',
    description: 'Update identity and IP configuration files with target-specific values.',
    wouldModifyTarget: true,
    requiresCredentials: true,
    filesWritten: [
      `fourbaidentity.json (identity/index -> ${featherIndex})`,
      `feather.json (identity/index -> ${featherIndex})`,
      `feather.xml (ioLogik target -> ${ioLogikIp})`
    ]
  });

  plan.steps.push({
    stepId: uuidv4(),
    order: order++,
    title: 'Run controlled configuration script',
    category: 'install',
    executionType: 'future-controlled-command',
    riskLevel: 'high',
    description: 'Execute hatchery_configure_feather_powin.sh',
    wouldModifyTarget: true,
    requiresCredentials: true,
    commandsPreview: [
      `ssh -t moxa@${targetFeatherIp} "cd ~/hatchery && sudo ./hatchery_configure_feather_powin.sh"`
    ]
  });

  plan.steps.push({
    stepId: uuidv4(),
    order: order++,
    title: 'Install WAR and XML',
    category: 'install',
    executionType: 'future-controlled-command',
    riskLevel: 'high',
    description: 'Execute hatchery_install_war.sh with feather.war and feather.xml',
    wouldModifyTarget: true,
    requiresCredentials: true,
    commandsPreview: [
      `ssh -t moxa@${targetFeatherIp} "cd ~/hatchery && sudo ./hatchery_install_war.sh feather.war feather.xml"`
    ]
  });

  plan.steps.push({
    stepId: uuidv4(),
    order: order++,
    title: 'Restart / verify Tomcat',
    category: 'restart',
    executionType: 'future-controlled-command',
    riskLevel: 'high',
    description: 'Verify tomcat8 service restart and wait for Feather status endpoint.',
    wouldModifyTarget: true,
    requiresCredentials: true,
    commandsPreview: [
      `ssh -t moxa@${targetFeatherIp} "sudo service tomcat8 restart"`
    ]
  });

  plan.steps.push({
    stepId: uuidv4(),
    order: order++,
    title: 'Post-change validation',
    category: 'validate',
    executionType: 'future-validation',
    riskLevel: 'medium',
    description: 'Poll Feather status endpoint and validate identity and ioLogik target.',
    wouldModifyTarget: false,
    requiresCredentials: false,
    validations: [
      `Would poll: http://${targetFeatherIp}:8080/feather/status/report.json`,
      `target is reachable`,
      `feather identity matches ${featherIndex}`,
      `ioLogik target is correct if exposed`,
      `firmware/status endpoint responds`
    ]
  });

  plan.steps.push({
    stepId: uuidv4(),
    order: order++,
    title: 'Save provisioning record',
    category: 'record',
    executionType: 'future-validation',
    riskLevel: 'low',
    description: 'Save run metadata, plan, logs, before/after validation to PRIZM local storage.',
    wouldModifyTarget: false,
    requiresCredentials: false,
    validations: [
      'Record saved successfully'
    ]
  });

  return plan;
}
