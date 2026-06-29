import { v4 as uuidv4 } from 'uuid';
import { ProvisioningPlanPreview } from './provisioningPlanTypes';
import { ProvisioningBundleValidationResult } from './provisioningTypes';

export function buildProvisioningPlanPreview(
  workflowMode: "baseline-only" | "hatchery-only" | "baseline-and-hatchery",
  startingTargetState: "default-ip" | "existing-site-ip",
  startingIp: string,
  finalFeatherIp: string,
  gateway: string,
  networkType: "in-network" | "external",
  featherType: "CS" | "ES" | undefined,
  featherIndex: number | undefined,
  ioLogikIp: string | undefined,
  ioLogikSource: "calculated" | "override" | "user-input" | undefined,
  targetLabel: string | undefined,
  bundleValidation: ProvisioningBundleValidationResult | any,
  bundleSource: { mode: "manifest" | "server-path" | "prizm-workspace", sourceLabel: string, bundlePath: string },
  sshUsername?: string,
  sshPasswordProvided?: boolean,
  sudoPasswordProvided?: boolean,
  useSamePasswordForSudo?: boolean
): ProvisioningPlanPreview {
  const plan: ProvisioningPlanPreview = {
    planId: uuidv4(),
    createdAt: new Date().toISOString(),
    status: 'preview-only',
    target: {
      workflowMode,
      startingTargetState,
      startingIp,
      finalFeatherIp,
      postBaselineIp: startingTargetState === "default-ip" ? finalFeatherIp : startingIp,
      gateway,
      networkType,
      featherType,
      featherIndex,
      ioLogikIp,
      ioLogikSource,
      targetLabel,
      sshUsername,
      sshPasswordProvided,
      sudoPasswordProvided,
      useSamePasswordForSudo
    },
    bundle: {
      bundleStatus: bundleValidation.status,
      sourceMode: bundleSource.mode,
      sourceLabel: bundleSource.sourceLabel,
      bundlePath: bundleSource.bundlePath
    },
    calculatedValues: [
      { key: 'workflowMode', label: 'Workflow Mode', value: workflowMode, source: 'user-input' },
      { key: 'startingTargetState', label: 'Starting State', value: startingTargetState, source: 'user-input' },
      { key: 'startingIp', label: 'Starting IP', value: startingIp, source: 'user-input' }
    ],
    steps: [],
    warnings: [],
    errors: []
  };

  const postBaselineIp = plan.target.postBaselineIp;

  if (finalFeatherIp) {
    plan.calculatedValues.push({ key: 'finalFeatherIp', label: 'Final Feather IP', value: finalFeatherIp, source: 'user-input' });
  }
  if (featherIndex !== undefined) {
    plan.calculatedValues.push({ key: 'featherIndex', label: 'Feather Index', value: featherIndex, source: 'user-input' });
  }
  if (ioLogikIp) {
    plan.calculatedValues.push({ key: 'ioLogikIp', label: 'ioLogik IP', value: ioLogikIp, source: ioLogikSource || 'user-input' });
  }

  // Validations
  const isValidIp = (ip: string) => {
    if (!ip) return false;
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    for (const part of parts) {
      if (part === '') return false;
      if (!/^\d+$/.test(part)) return false;
      const num = parseInt(part, 10);
      if (num < 0 || num > 255) return false;
    }
    return true;
  };

  if (!workflowMode) plan.errors.push(`workflowMode is required`);
  if (!startingTargetState) plan.errors.push(`startingTargetState is required`);
  if (!isValidIp(startingIp)) plan.errors.push(`Invalid Starting IP: ${startingIp}`);

  if (workflowMode === 'baseline-and-hatchery') {
    if (!isValidIp(finalFeatherIp)) plan.errors.push(`Invalid Final Feather IP: ${finalFeatherIp}`);
  }

  if (workflowMode === 'baseline-only' && startingTargetState === 'default-ip' && networkType === 'in-network') {
    if (!isValidIp(finalFeatherIp)) plan.errors.push(`Invalid Final Feather IP: ${finalFeatherIp}`);
  }

  if (networkType === 'in-network') {
    if (!isValidIp(gateway)) plan.errors.push(`Invalid Gateway IP: ${gateway}`);
  }

  if (workflowMode === 'hatchery-only' || workflowMode === 'baseline-and-hatchery') {
    if (typeof featherIndex !== 'number' || isNaN(featherIndex)) plan.errors.push(`Feather Index must be a valid number`);
    if (!featherType) plan.errors.push(`Feather Type is required for hatchery workflows`);
    if (!isValidIp(ioLogikIp || '')) plan.errors.push(`Invalid ioLogik IP: ${ioLogikIp}`);
  }

  if (startingTargetState === 'default-ip' && networkType === 'in-network') {
    if (finalFeatherIp && finalFeatherIp === startingIp) {
      plan.errors.push(`Final Feather IP must not equal Starting IP in default-IP in-network adoption`);
    }
  }

  if (finalFeatherIp && finalFeatherIp.endsWith('.255') && ioLogikSource !== 'override') {
    plan.errors.push(`If final Feather IP last octet is 255, require manual ioLogik override`);
  }

  if (bundleSource.mode === 'prizm-workspace') {
    if (workflowMode === 'baseline-only' && !bundleValidation.supportedWorkflows.baselineOnly) {
      plan.errors.push(`Selected workflow is not supported by the current PRIZM Provisioning Workspace.`);
    }
    if (workflowMode === 'hatchery-only' && !bundleValidation.supportedWorkflows.hatcheryOnly) {
      plan.errors.push(`Selected workflow is not supported by the current PRIZM Provisioning Workspace.`);
    }
    if (workflowMode === 'baseline-and-hatchery' && !bundleValidation.supportedWorkflows.baselineAndHatchery) {
      plan.errors.push(`Selected workflow is not supported by the current PRIZM Provisioning Workspace.`);
    }
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

  let order = 1;

  if (workflowMode === 'baseline-only' || workflowMode === 'baseline-and-hatchery') {
    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Validate baseline inputs',
      stageGroup: 'baseline',
      category: 'precheck',
      executionType: 'future-validation',
      riskLevel: 'low',
      description: 'Validate inputs for baseline process.',
      wouldModifyTarget: false,
      requiresCredentials: false,
      validations: [
        `starting IP valid`,
        `final Feather IP valid where required`,
        `gateway valid for in-network`,
        `network type selected`
      ]
    });

    if (startingTargetState === 'default-ip') {
      plan.steps.push({
        stepId: uuidv4(),
        order: order++,
        title: 'Confirm isolated/default-IP safety',
        stageGroup: 'baseline',
        category: 'precheck',
        executionType: 'manual-review',
        riskLevel: 'low',
        description: 'Ensure isolated network environment for baseline adoption.',
        wouldModifyTarget: false,
        requiresCredentials: false,
        warnings: [
          `Only one 192.168.3.127 Feather should be connected.`,
          `PRIZM host must be able to reach 192.168.3.127.`,
          `Technician may need local adapter IP 192.168.3.x/24.`,
          `No host adapter changes are made by PRIZM.`
        ]
      });
    }

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Future reachability check',
      stageGroup: 'baseline',
      category: 'precheck',
      executionType: 'future-validation',
      riskLevel: 'low',
      description: 'Ping starting IP and confirm SSH access.',
      wouldModifyTarget: false,
      requiresCredentials: true,
      validations: [
        `Would ping ${startingIp}`,
        `Would confirm SSH access to PRIZM_TARGET_USER@${startingIp}`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Backup network interfaces',
      stageGroup: 'baseline',
      category: 'backup',
      executionType: 'future-controlled-command',
      riskLevel: 'low',
      description: 'Backup existing remote network interfaces before overwrite.',
      wouldModifyTarget: true,
      requiresCredentials: true,
      requiresSudo: true,
      commandsPreview: [
        `ssh PRIZM_TARGET_USER@${startingIp} "cp /etc/network/interfaces /etc/network/interfaces.bak_$(date +%Y%m%d%H%M%S)"`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Configure network',
      stageGroup: 'baseline',
      category: 'patch',
      executionType: 'future-config-edit',
      riskLevel: 'medium',
      description: networkType === 'in-network' ? 'Write static final IP and gateway' : 'Switch appropriate interface to DHCP',
      wouldModifyTarget: true,
      requiresCredentials: true,
      requiresSudo: true,
      filesWritten: [
        `/etc/network/interfaces`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Set DNS',
      stageGroup: 'baseline',
      category: 'patch',
      executionType: 'future-config-edit',
      riskLevel: 'medium',
      description: 'Write /etc/resolv.conf with nameserver 8.8.8.8.',
      wouldModifyTarget: true,
      requiresCredentials: true,
      requiresSudo: true,
      filesWritten: [
        `/etc/resolv.conf`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Reboot and wait',
      stageGroup: 'baseline',
      category: 'restart',
      executionType: 'future-controlled-command',
      riskLevel: 'medium',
      description: 'Reboot target and wait for post-baseline IP reachability.',
      wouldModifyTarget: true,
      requiresCredentials: true,
      requiresSudo: true,
      commandsPreview: [
        `ssh PRIZM_TARGET_USER@${startingIp} "sudo reboot"`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Stage baseline package',
      stageGroup: 'baseline',
      category: 'stage',
      executionType: 'future-file-copy',
      riskLevel: 'medium',
      description: `Copy deploy-redux.tar to PRIZM_TARGET_USER@${postBaselineIp}:~/`,
      wouldModifyTarget: true,
      requiresCredentials: true,
      filesWritten: [
        `PRIZM_TARGET_USER@${postBaselineIp}:~/deploy-redux.tar`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Extract baseline package',
      stageGroup: 'baseline',
      category: 'stage',
      executionType: 'future-controlled-command',
      riskLevel: 'low',
      description: `Extract deploy-redux.tar on target`,
      wouldModifyTarget: true,
      requiresCredentials: true,
      commandsPreview: [
        `ssh PRIZM_TARGET_USER@${postBaselineIp} "tar xf deploy-redux.tar"`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Run baseline script',
      stageGroup: 'baseline',
      category: 'install',
      executionType: 'future-controlled-command',
      riskLevel: 'high',
      description: `Execute featherScript.sh on target`,
      wouldModifyTarget: true,
      requiresCredentials: true,
      requiresSudo: true,
      commandsPreview: [
        `ssh PRIZM_TARGET_USER@${postBaselineIp} "cd ~/deploy && chmod +x featherScript.sh && sudo ./featherScript.sh"`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Reboot/wait after baseline script',
      stageGroup: 'baseline',
      category: 'validate',
      executionType: 'future-validation',
      riskLevel: 'low',
      description: `Wait for SSH at postBaselineIp`,
      wouldModifyTarget: false,
      requiresCredentials: false,
      validations: [
        `Would wait for SSH at ${postBaselineIp}`
      ]
    });
  }

  if (workflowMode === 'hatchery-only' || workflowMode === 'baseline-and-hatchery') {
    let hatcheryTargetIp = startingIp;
    if (workflowMode === 'hatchery-only' && startingTargetState === 'existing-site-ip') {
      hatcheryTargetIp = startingIp;
    } else if (workflowMode === 'hatchery-only' && startingTargetState === 'default-ip') {
      hatcheryTargetIp = startingIp;
      plan.warnings.push("Hatchery usually expects final site IP, but running on default IP since baseline stage is not selected.");
    } else if (workflowMode === 'baseline-and-hatchery') {
      hatcheryTargetIp = postBaselineIp;
    }

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Validate hatchery inputs',
      stageGroup: 'hatchery',
      category: 'precheck',
      executionType: 'future-validation',
      riskLevel: 'low',
      description: 'Validate inputs for hatchery process.',
      wouldModifyTarget: false,
      requiresCredentials: false,
      validations: [
        `Feather Index numeric`,
        `Feather Type CS/ES`,
        `ioLogik IP valid`,
        `hatchery target IP valid`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Review hatchery workspace/files',
      stageGroup: 'hatchery',
      category: 'precheck',
      executionType: 'manual-review',
      riskLevel: 'low',
      description: 'Check for presence of required hatchery files.',
      wouldModifyTarget: false,
      requiresCredentials: false,
      validations: [
        `required templates present`,
        `netmap files present`,
        `feather.war present`,
        `upgrade script present and not placeholder`,
        `optional overrides present/missing`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Stage hatchery bundle',
      stageGroup: 'hatchery',
      category: 'stage',
      executionType: 'future-file-copy',
      riskLevel: 'medium',
      description: `Copy hatchery package to target`,
      wouldModifyTarget: true,
      requiresCredentials: true,
      filesWritten: [
        `PRIZM_TARGET_USER@${hatcheryTargetIp}:~/hatchery/*`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Backup hatchery config files',
      stageGroup: 'hatchery',
      category: 'backup',
      executionType: 'future-controlled-command',
      riskLevel: 'low',
      description: `Backup existing identity and configs`,
      wouldModifyTarget: true,
      requiresCredentials: true,
      requiresSudo: true,
      commandsPreview: [
        `ssh PRIZM_TARGET_USER@${hatcheryTargetIp} "tar -czf hatchery_backup_$(date +%Y%m%d%H%M%S).tar.gz /etc/powin"`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Patch identity files',
      stageGroup: 'hatchery',
      category: 'patch',
      executionType: 'future-config-edit',
      riskLevel: 'medium',
      description: 'Update identity and IP configuration files with target-specific values.',
      wouldModifyTarget: true,
      requiresCredentials: true,
      requiresSudo: true,
      filesWritten: [
        `fourbaidentity.json (featherIndex -> ${featherIndex})`,
        `feather.json (featherIndex -> ${featherIndex})`,
        `fallback replacement for default/template value 202`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Patch feather.xml ioLogik target',
      stageGroup: 'hatchery',
      category: 'patch',
      executionType: 'future-config-edit',
      riskLevel: 'medium',
      description: 'Update feather.xml ioLogik target',
      wouldModifyTarget: true,
      requiresCredentials: true,
      requiresSudo: true,
      filesWritten: [
        `feather.xml (ioLogik target -> ${ioLogikIp})`
      ]
    });

    let serialConfig = '';
    if (featherType === 'ES') {
      serialConfig = `feather.modbusv1.poller.serialConnectionType = rxtx\nfeather.modbusv1.poller.serialPortName = /dev/ttyUSB0`;
    } else if (featherType === 'CS') {
      serialConfig = `feather.modbusv1.poller.serialConnectionType = pjc\nfeather.modbusv1.poller.serialPortName = /dev/ttyM0`;
    }

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Patch serial settings',
      stageGroup: 'hatchery',
      category: 'patch',
      executionType: 'future-config-edit',
      riskLevel: 'medium',
      description: `Update serial settings based on Feather Type ${featherType}`,
      wouldModifyTarget: true,
      requiresCredentials: true,
      requiresSudo: true,
      filesWritten: [
        `feather.properties`,
      ],
      validations: [
        serialConfig
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Prepare install scripts',
      stageGroup: 'hatchery',
      category: 'stage',
      executionType: 'future-controlled-command',
      riskLevel: 'low',
      description: 'Copy and chmod hatchery scripts',
      wouldModifyTarget: true,
      requiresCredentials: true,
      commandsPreview: [
        `ssh PRIZM_TARGET_USER@${hatcheryTargetIp} "chmod +x ~/hatchery/*.sh"`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Run configuration script',
      stageGroup: 'hatchery',
      category: 'install',
      executionType: 'future-controlled-command',
      riskLevel: 'high',
      description: 'Execute hatchery_configure_feather_powin.sh',
      wouldModifyTarget: true,
      requiresCredentials: true,
      requiresSudo: true,
      commandsPreview: [
        `ssh -t PRIZM_TARGET_USER@${hatcheryTargetIp} "cd ~/hatchery && sudo ./hatchery_configure_feather_powin.sh"`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Install WAR/XML',
      stageGroup: 'hatchery',
      category: 'install',
      executionType: 'future-controlled-command',
      riskLevel: 'high',
      description: 'Execute hatchery_install_war.sh with feather.war and feather.xml',
      wouldModifyTarget: true,
      requiresCredentials: true,
      requiresSudo: true,
      commandsPreview: [
        `ssh -t PRIZM_TARGET_USER@${hatcheryTargetIp} "cd ~/hatchery && sudo ./hatchery_install_war.sh feather.war feather.xml"`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Restart Tomcat',
      stageGroup: 'hatchery',
      category: 'restart',
      executionType: 'future-controlled-command',
      riskLevel: 'high',
      description: 'Restart tomcat8 service',
      wouldModifyTarget: true,
      requiresCredentials: true,
      requiresSudo: true,
      commandsPreview: [
        `ssh -t PRIZM_TARGET_USER@${hatcheryTargetIp} "sudo service tomcat8 restart"`
      ]
    });
  }

  // Verification / Record Stage
  if (workflowMode === 'hatchery-only' || workflowMode === 'baseline-and-hatchery') {
    let hatcheryTargetIp = workflowMode === 'baseline-and-hatchery' ? postBaselineIp : startingIp;
    
    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Verify Tomcat',
      stageGroup: 'verification',
      category: 'validate',
      executionType: 'future-validation',
      riskLevel: 'low',
      description: 'Check tomcat8 service status and port 8080.',
      wouldModifyTarget: false,
      requiresCredentials: true,
      validations: [
        `systemctl is-active tomcat8`,
        `journal check for startup`,
        `port 8080 listening`,
        `feather webapp directory present`
      ]
    });

    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Post-change Feather validation',
      stageGroup: 'verification',
      category: 'validate',
      executionType: 'future-validation',
      riskLevel: 'low',
      description: 'Poll Feather status endpoint and validate identity and ioLogik target.',
      wouldModifyTarget: false,
      requiresCredentials: false,
      validations: [
        `Would poll: http://${hatcheryTargetIp}:8080/feather/status/report.json`,
        `verify identity`,
        `verify reachability`,
        `verify ioLogik target if exposed`,
        `verify firmware/status response`
      ]
    });
  }

  if (workflowMode === 'baseline-only' || workflowMode === 'baseline-and-hatchery') {
    plan.steps.push({
      stepId: uuidv4(),
      order: order++,
      title: 'Baseline validation',
      stageGroup: 'verification',
      category: 'validate',
      executionType: 'future-validation',
      riskLevel: 'low',
      description: 'Verify baseline success',
      wouldModifyTarget: false,
      requiresCredentials: false,
      validations: [
        `Would verify ${postBaselineIp} SSH reachability`,
        `Would verify deploy/featherScript.sh completed successfully based on logs/status if available`
      ]
    });
  }

  plan.steps.push({
    stepId: uuidv4(),
    order: order++,
    title: 'Save provisioning record',
    stageGroup: 'record',
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
