import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { ProvisioningWorkspaceValidationResult } from './provisioningWorkspaceTypes';

const execFileAsync = promisify(execFile);

const DEFAULT_WORKSPACE_ROOT = path.join(process.cwd(), 'provisioning');

export async function validateProvisioningWorkspace(): Promise<ProvisioningWorkspaceValidationResult> {
  const workspaceRoot = process.env.PRIZM_PROVISIONING_WORKSPACE || DEFAULT_WORKSPACE_ROOT;
  
  const result: ProvisioningWorkspaceValidationResult = {
    workspaceId: uuidv4(),
    workspaceRoot,
    validatedAt: new Date().toISOString(),
    status: "invalid",
    supportedWorkflows: {
      baselineOnly: false,
      hatcheryOnly: false,
      baselineAndHatchery: false,
    },
    repoTemplates: [],
    siteFiles: [],
    inspections: [],
    warnings: [],
    errors: [],
    summary: {
      templatesPresent: 0,
      templatesMissing: 0,
      templatesPlaceholder: 0,
      requiredSiteFilesPresent: 0,
      requiredSiteFilesMissing: 0,
      optionalSiteFilesPresent: 0,
      inspectionPass: 0,
      inspectionWarn: 0,
      inspectionFail: 0,
    }
  };

  try {
    const templatesDir = path.join(workspaceRoot, 'templates');
    const siteFilesDir = path.join(workspaceRoot, 'site-files');

    if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
      result.errors.push("Workspace root is missing or unreadable.");
      return result;
    }
    
    if (!fs.existsSync(templatesDir) || !fs.existsSync(siteFilesDir)) {
      result.errors.push("Workspace is missing templates or site-files directory.");
      return result;
    }

    let hasHardcodedCredentials = false;
    let credentialNotes: string[] = [];

    const checkFile = (relPath: string): { exists: boolean; sizeBytes: number; isPlaceholder: boolean; readable: boolean; notes: string[] } => {
      const fullPath = path.join(workspaceRoot, relPath);
      if (!fs.existsSync(fullPath)) return { exists: false, sizeBytes: 0, isPlaceholder: false, readable: false, notes: [] };
      try {
        const stats = fs.statSync(fullPath);
        if (stats.size === 0) return { exists: true, sizeBytes: 0, isPlaceholder: false, readable: true, notes: ["File is empty"] };
        const content = fs.readFileSync(fullPath, 'utf8');
        const isPlaceholder = content.includes("Template placeholder") || content.includes("replace with approved GreEnergy provisioning script");
        
        const credentialPatterns = [
          "sshpass -p moxa",
          "echo moxa | sudo -S",
          "password=moxa",
          "passwd=moxa",
          'PRIZM_TARGET_PASSWORD="${PRIZM_TARGET_PASSWORD:-moxa}"',
          'PRIZM_SUDO_PASSWORD="${PRIZM_SUDO_PASSWORD:-moxa}"'
        ];
        for (const pattern of credentialPatterns) {
          if (content.includes(pattern)) {
             hasHardcodedCredentials = true;
             if (!credentialNotes.includes(`Found hardcoded credential pattern in ${relPath}: '${pattern}'`)) {
                 credentialNotes.push(`Found hardcoded credential pattern in ${relPath}: '${pattern}'`);
             }
          }
        }

        const notes: string[] = [];
        const warnKeywords = ["sudo", "service tomcat8", "scp", "ssh", "sed", "cp", "chmod"];
        const foundKeywords = warnKeywords.filter(kw => content.includes(kw));
        if (foundKeywords.length > 0) {
          notes.push(`Contains provisioning commands: ${foundKeywords.join(", ")}`);
        }
        return { exists: true, sizeBytes: stats.size, isPlaceholder, readable: true, notes };
      } catch (e: any) {
        return { exists: true, sizeBytes: 0, isPlaceholder: false, readable: false, notes: ["Unreadable"] };
      }
    };

    const addTemplate = (relPath: string, category: "baseline" | "hatchery") => {
      const info = checkFile(relPath);
      if (!info.exists) {
        result.repoTemplates.push({ path: relPath, category, status: "missing" });
        result.summary.templatesMissing++;
      } else if (!info.readable || info.sizeBytes === 0) {
        result.repoTemplates.push({ path: relPath, category, status: "invalid", notes: info.notes.join("; ") });
        result.summary.templatesMissing++;
      } else if (info.isPlaceholder) {
        result.repoTemplates.push({ path: relPath, category, status: "placeholder", sizeBytes: info.sizeBytes });
        result.summary.templatesPlaceholder++;
      } else {
        result.repoTemplates.push({ path: relPath, category, status: "present", sizeBytes: info.sizeBytes, notes: info.notes.join("; ") });
        result.summary.templatesPresent++;
      }
    };

    addTemplate('templates/baseline/deploy_late_baseline.sh', 'baseline');
    addTemplate('templates/hatchery/hatchery_configure_feather_powin.sh', 'hatchery');
    addTemplate('templates/hatchery/hatchery_install_war.sh', 'hatchery');
    addTemplate('templates/hatchery/hatchery_start_cron_scripts.sh', 'hatchery');
    addTemplate('templates/hatchery/hatchery_configure_tomcat_service.sh', 'hatchery');
    addTemplate('templates/hatchery/hatchery_configure_rs485_service.sh', 'hatchery');
    addTemplate('templates/hatchery/hatchery_set_feather_min_free_kbytes.sh', 'hatchery');
    addTemplate('templates/hatchery/hatchery_configure_ntp.sh', 'hatchery');
    addTemplate('templates/hatchery/hatchery_configure_source_list.sh', 'hatchery');
    addTemplate('templates/hatchery/script_featherUpgradeSystem.sh', 'hatchery');

    const checkSiteFile = (relPath: string, category: "baseline" | "netmap" | "war" | "override", required: boolean) => {
      const fullPath = path.join(workspaceRoot, relPath);
      if (!fs.existsSync(fullPath)) {
        if (required) {
          result.siteFiles.push({ path: relPath, category, status: "missing" });
          result.summary.requiredSiteFilesMissing++;
        } else {
          result.siteFiles.push({ path: relPath, category, status: "optional-missing" });
        }
      } else {
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size === 0) {
            result.siteFiles.push({ path: relPath, category, status: "invalid", notes: "File is empty" });
            if (required) result.summary.requiredSiteFilesMissing++;
          } else {
            result.siteFiles.push({ path: relPath, category, status: "present", sizeBytes: stats.size });
            if (required) result.summary.requiredSiteFilesPresent++;
            else result.summary.optionalSiteFilesPresent++;
          }
        } catch(e: any) {
          result.siteFiles.push({ path: relPath, category, status: "invalid", notes: "Unreadable" });
          if (required) result.summary.requiredSiteFilesMissing++;
        }
      }
    };

    checkSiteFile('site-files/baseline/deploy-redux.tar', 'baseline', true);
    checkSiteFile('site-files/netmaps/netmap_entity.csv', 'netmap', true);
    checkSiteFile('site-files/netmaps/netmap_string.csv', 'netmap', true);
    checkSiteFile('site-files/netmaps/netmap_other.csv', 'netmap', true);
    checkSiteFile('site-files/war/feather.war', 'war', true);
    checkSiteFile('site-files/overrides/feather.xml', 'override', false);
    checkSiteFile('site-files/overrides/feather.json', 'override', false);
    checkSiteFile('site-files/overrides/fourbaidentity.json', 'override', false);
    checkSiteFile('site-files/overrides/configuration.json', 'override', false);
    checkSiteFile('site-files/overrides/physicalconfiguration.json', 'override', false);
    checkSiteFile('site-files/overrides/sunspecAPIConfig.json', 'override', false);

    // CSV inspection
    const csvs = ['netmap_entity.csv', 'netmap_string.csv', 'netmap_other.csv'];
    for (const csv of csvs) {
      const fullPath = path.join(workspaceRoot, 'site-files/netmaps', csv);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.trim().length > 0 && content.includes(',')) {
            result.inspections.push({ key: csv, label: `CSV Format: ${csv}`, status: 'pass' });
            result.summary.inspectionPass++;
          } else {
            result.inspections.push({ key: csv, label: `CSV Format: ${csv}`, status: 'fail', notes: "Not comma-delimited or empty" });
            result.summary.inspectionFail++;
          }
        } catch(e: any) {
          result.inspections.push({ key: csv, label: `CSV Format: ${csv}`, status: 'fail', notes: "Unreadable" });
          result.summary.inspectionFail++;
        }
      } else {
        result.inspections.push({ key: csv, label: `CSV Format: ${csv}`, status: 'fail', notes: "File missing" });
        result.summary.inspectionFail++;
      }
    }

    if (hasHardcodedCredentials) {
      result.inspections.push({ key: 'template-credential-scan', label: 'Template Credential Scan', status: 'fail', notes: credentialNotes.join('; ') });
      result.summary.inspectionFail++;
    } else {
      result.inspections.push({ key: 'template-credential-scan', label: 'Template Credential Scan', status: 'pass' });
      result.summary.inspectionPass++;
    }

    // TAR inspection
    const tarFile = result.siteFiles.find(f => f.path === 'site-files/baseline/deploy-redux.tar');
    if (tarFile && tarFile.status === 'present') {
      const fullTarPath = path.join(workspaceRoot, 'site-files/baseline/deploy-redux.tar');
      try {
        const { stdout } = await execFileAsync('tar', ['-tf', fullTarPath], { maxBuffer: 1024 * 1024 });
        if (stdout.includes('deploy/featherScript.sh')) {
           result.inspections.push({ key: 'deploy-redux.tar', label: 'TAR Inspection: deploy-redux.tar', status: 'pass', notes: "Found deploy/featherScript.sh" });
           result.summary.inspectionPass++;
        } else {
           result.inspections.push({ key: 'deploy-redux.tar', label: 'TAR Inspection: deploy-redux.tar', status: 'fail', notes: "Missing deploy/featherScript.sh in tar listing" });
           result.summary.inspectionFail++;
           // Since baseline needs this file, invalidate the baseline workflow
           result.supportedWorkflows.baselineOnly = false;
        }
      } catch(e: any) {
        result.inspections.push({ key: 'deploy-redux.tar', label: 'TAR Inspection: deploy-redux.tar', status: 'warn', notes: "deploy-redux.tar is present but tar listing is unavailable on this host." });
        result.summary.inspectionWarn++;
      }
    }

    // Workflow support logic
    const hasValidBaselineTemplate = result.repoTemplates.some(t => t.category === 'baseline' && t.status === 'present');
    const hasValidHatcheryTemplates = result.repoTemplates.filter(t => t.category === 'hatchery').every(t => t.status === 'present');
    
    const hasValidBaselineSiteFiles = tarFile && tarFile.status === 'present';
    const hasValidHatcherySiteFiles = ['netmap_entity.csv', 'netmap_string.csv', 'netmap_other.csv'].every(csv => {
        const file = result.siteFiles.find(f => f.path.endsWith(csv));
        return file && file.status === 'present';
      }) && result.siteFiles.some(f => f.path === 'site-files/war/feather.war' && f.status === 'present');

    if (hasValidBaselineTemplate && hasValidBaselineSiteFiles) {
      result.supportedWorkflows.baselineOnly = true;
    }
    
    if (hasValidHatcheryTemplates && hasValidHatcherySiteFiles && result.summary.inspectionFail === 0) {
      result.supportedWorkflows.hatcheryOnly = true;
    }
    
    if (result.supportedWorkflows.baselineOnly && result.supportedWorkflows.hatcheryOnly) {
      result.supportedWorkflows.baselineAndHatchery = true;
    }

    // Determine overall status
    if (!result.supportedWorkflows.baselineOnly && !result.supportedWorkflows.hatcheryOnly) {
      result.status = "blocked";
    } else if (hasHardcodedCredentials) {
      result.status = "blocked";
    } else {
      const hasWarnings = result.summary.inspectionWarn > 0 || result.repoTemplates.some(t => !!t.notes);
      if (hasWarnings || result.summary.templatesPlaceholder > 0) {
        result.status = "partial";
      } else {
        result.status = "ready";
      }
    }

  } catch (e: any) {
    result.errors.push(`Workspace validation error: ${e.message}`);
    result.status = "invalid";
  }

  return result;
}
