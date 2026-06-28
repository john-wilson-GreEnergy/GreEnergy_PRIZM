import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ProvisioningBundleValidationResult, ProvisioningBundleFileStatus, ProvisioningBundleStatus } from './provisioningTypes';

const REQUIRED_FILES = [
  'deploy_late_hatchery.sh',
  'hatchery_configure_feather_powin.sh',
  'hatchery_install_war.sh',
  'feather.war',
  'feather.xml',
  'feather.json',
  'fourbaidentity.json',
  'configuration.json',
  'physicalconfiguration.json',
  'sunspecAPIConfig.json',
  'netmap_entity.csv',
  'netmap_string.csv',
  'netmap_other.csv',
  'cronScripts/hatchery_start_cron_scripts.sh',
  'cronScripts/hatchery_configure_tomcat_service.sh',
  'cronScripts/hatchery_configure_rs485_service.sh',
  'cronScripts/hatchery_set_feather_min_free_kbytes.sh',
  'cronScripts/hatchery_configure_ntp.sh',
  'cronScripts/hatchery_configure_source_list.sh',
  'cronScripts/script_featherUpgradeSystem.sh'
];

const OPTIONAL_FILES = [
  'README',
  'README.md',
  'bundle.json',
  'provisioning-profile.json',
  'checksums.json'
];

const REQUIRED_DIRS = [
  'cronScripts'
];

export function validateBundle(bundlePath: string): ProvisioningBundleValidationResult {
  const result: ProvisioningBundleValidationResult = {
    bundleId: uuidv4(),
    bundlePath,
    bundleType: "feather-hatchery",
    status: "invalid",
    validatedAt: new Date().toISOString(),
    requiredFiles: [],
    optionalFiles: [],
    requiredDirectories: [],
    inspections: [],
    summary: {
      requiredPresent: 0,
      requiredMissing: 0,
      optionalPresent: 0,
      optionalMissing: 0,
      inspectionPass: 0,
      inspectionWarn: 0,
      inspectionFail: 0
    },
    warnings: [],
    errors: []
  };

  try {
    if (!fs.existsSync(bundlePath)) {
      result.errors.push(`Bundle path does not exist: ${bundlePath}`);
      return result;
    }
    const stat = fs.statSync(bundlePath);
    if (!stat.isDirectory()) {
      result.errors.push(`Bundle path is not a directory: ${bundlePath}`);
      return result;
    }
  } catch (e: any) {
    result.errors.push(`Error accessing bundle path: ${e.message}`);
    return result;
  }

  // Check required dirs
  for (const dir of REQUIRED_DIRS) {
    const fullPath = path.join(bundlePath, dir);
    if (fs.existsSync(fullPath)) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          result.requiredDirectories.push({ path: dir, status: 'present' });
        } else {
          result.requiredDirectories.push({ path: dir, status: 'invalid', notes: 'Not a directory' });
          result.errors.push(`${dir} is not a directory.`);
        }
      } catch (e) {
        result.requiredDirectories.push({ path: dir, status: 'invalid', notes: 'Read error' });
        result.errors.push(`Error reading directory ${dir}.`);
      }
    } else {
      result.requiredDirectories.push({ path: dir, status: 'missing' });
      result.errors.push(`Required directory missing: ${dir}`);
    }
  }

  // Check required files
  for (const file of REQUIRED_FILES) {
    let fullPath = path.join(bundlePath, file);
    let resolvedFile = file;
    if (!fs.existsSync(fullPath) && file.startsWith('cronScripts/')) {
        const altFile = file.replace('cronScripts/', '');
        const altPath = path.join(bundlePath, altFile);
        if (fs.existsSync(altPath)) {
            fullPath = altPath;
            resolvedFile = altFile;
        }
    }

    if (fs.existsSync(fullPath)) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && stat.size > 0) {
          result.requiredFiles.push({ path: resolvedFile, status: 'present', sizeBytes: stat.size });
          result.summary.requiredPresent++;
        } else {
          result.requiredFiles.push({ path: resolvedFile, status: 'invalid', notes: stat.size === 0 ? 'File is empty' : 'Not a regular file' });
          result.summary.requiredMissing++;
          result.errors.push(`Required file invalid or empty: ${resolvedFile}`);
        }
      } catch (e) {
        result.requiredFiles.push({ path: resolvedFile, status: 'invalid', notes: 'Read error' });
        result.summary.requiredMissing++;
        result.errors.push(`Error reading file: ${resolvedFile}`);
      }
    } else {
      result.requiredFiles.push({ path: file, status: 'missing' });
      result.summary.requiredMissing++;
      result.errors.push(`Required file missing: ${file}`);
    }
  }

  // Check optional files
  for (const file of OPTIONAL_FILES) {
    const fullPath = path.join(bundlePath, file);
    if (fs.existsSync(fullPath)) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && stat.size > 0) {
          result.optionalFiles.push({ path: file, status: 'present', sizeBytes: stat.size });
          result.summary.optionalPresent++;
        } else {
          result.optionalFiles.push({ path: file, status: 'invalid', notes: stat.size === 0 ? 'File is empty' : 'Not a regular file' });
        }
      } catch (e) {
         result.optionalFiles.push({ path: file, status: 'invalid', notes: 'Read error' });
      }
    } else {
      result.optionalFiles.push({ path: file, status: 'optional-missing' });
      result.summary.optionalMissing++;
    }
  }

  // Inspections
  // feather.xml
  const featherXmlPath = path.join(bundlePath, 'feather.xml');
  if (fs.existsSync(featherXmlPath)) {
    try {
      const content = fs.readFileSync(featherXmlPath, 'utf8');
      if (content.includes('{io_logik_ip}') || /ioLogikIP/i.test(content) || /<parameter name="ip" value="\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"/i.test(content) || /<property name="ipAddress" value="\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"/i.test(content)) {
         result.inspections.push({ key: 'feather.xml', label: 'feather.xml structure', status: 'pass' });
         result.summary.inspectionPass++;
      } else {
         result.inspections.push({ key: 'feather.xml', label: 'feather.xml structure', status: 'warn', notes: 'Could not identify ioLogik IP or placeholder' });
         result.summary.inspectionWarn++;
         result.warnings.push("feather.xml: Could not identify ioLogik IP or placeholder.");
      }
    } catch(e) {
       result.inspections.push({ key: 'feather.xml', label: 'feather.xml structure', status: 'fail', notes: 'Read error' });
       result.summary.inspectionFail++;
    }
  } else {
    result.inspections.push({ key: 'feather.xml', label: 'feather.xml structure', status: 'not-applicable', notes: 'Missing file' });
  }

  // feather.json
  const featherJsonPath = path.join(bundlePath, 'feather.json');
  if (fs.existsSync(featherJsonPath)) {
    try {
      const content = fs.readFileSync(featherJsonPath, 'utf8');
      const data = JSON.parse(content);
      // identify identity
      let hasIdentity = false;
      const strData = JSON.stringify(data);
      if (strData.includes('{block_index}') || strData.includes('{array_index}') || strData.includes('block') || strData.includes('array')) {
         hasIdentity = true;
      }
      if (hasIdentity) {
        result.inspections.push({ key: 'feather.json', label: 'feather.json identity', status: 'pass' });
        result.summary.inspectionPass++;
      } else {
        result.inspections.push({ key: 'feather.json', label: 'feather.json identity', status: 'warn', notes: 'No replaceable identity field found' });
        result.summary.inspectionWarn++;
        result.warnings.push("feather.json: No replaceable identity field found.");
      }
    } catch(e) {
      result.inspections.push({ key: 'feather.json', label: 'feather.json identity', status: 'fail', notes: 'Invalid JSON or Read error' });
      result.summary.inspectionFail++;
      result.errors.push("feather.json is not valid JSON.");
    }
  } else {
     result.inspections.push({ key: 'feather.json', label: 'feather.json identity', status: 'not-applicable' });
  }

  // fourbaidentity.json
  const fourbaPath = path.join(bundlePath, 'fourbaidentity.json');
  if (fs.existsSync(fourbaPath)) {
    try {
      const content = fs.readFileSync(fourbaPath, 'utf8');
      const data = JSON.parse(content);
      if (data.blockIndex !== undefined || data.arrayIndex !== undefined || content.includes('{')) {
        result.inspections.push({ key: 'fourbaidentity.json', label: 'fourbaidentity.json identity', status: 'pass' });
        result.summary.inspectionPass++;
      } else {
        result.inspections.push({ key: 'fourbaidentity.json', label: 'fourbaidentity.json identity', status: 'warn', notes: 'No replaceable identity field found' });
        result.summary.inspectionWarn++;
        result.warnings.push("fourbaidentity.json: No replaceable identity field found.");
      }
    } catch(e) {
      result.inspections.push({ key: 'fourbaidentity.json', label: 'fourbaidentity.json identity', status: 'fail', notes: 'Invalid JSON' });
      result.summary.inspectionFail++;
      result.errors.push("fourbaidentity.json is not valid JSON.");
    }
  } else {
     result.inspections.push({ key: 'fourbaidentity.json', label: 'fourbaidentity.json identity', status: 'not-applicable' });
  }

  // CSVs
  const csvFiles = ['netmap_entity.csv', 'netmap_string.csv', 'netmap_other.csv'];
  for (const csv of csvFiles) {
    const csvPath = path.join(bundlePath, csv);
    if (fs.existsSync(csvPath)) {
      try {
         const content = fs.readFileSync(csvPath, 'utf8');
         if (content.includes(',')) {
            result.inspections.push({ key: csv, label: `${csv} structure`, status: 'pass' });
            result.summary.inspectionPass++;
         } else {
            result.inspections.push({ key: csv, label: `${csv} structure`, status: 'fail', notes: 'No comma-delimited content found' });
            result.summary.inspectionFail++;
            result.errors.push(`${csv} does not appear to be a valid CSV.`);
         }
      } catch(e) {
        result.inspections.push({ key: csv, label: `${csv} structure`, status: 'fail', notes: 'Read error' });
        result.summary.inspectionFail++;
      }
    }
  }

  // Shell scripts
  const scriptsToInspect = REQUIRED_FILES.filter(f => f.endsWith('.sh'));
  for (const script of scriptsToInspect) {
     const scriptPath = path.join(bundlePath, script);
     if (fs.existsSync(scriptPath)) {
       try {
         const content = fs.readFileSync(scriptPath, 'utf8');
         const dangerousCommands = ['sudo', 'service tomcat8', 'scp', 'ssh', 'sed', 'cp', 'chmod'];
         const found = dangerousCommands.filter(cmd => content.includes(cmd));
         if (found.length > 0) {
            result.inspections.push({ key: script, label: `${script} commands`, status: 'warn', notes: `Detected commands: ${found.join(', ')}` });
            result.summary.inspectionWarn++;
            result.warnings.push(`Script ${script} uses potentially sensitive commands: ${found.join(', ')}`);
         } else {
            result.inspections.push({ key: script, label: `${script} commands`, status: 'pass' });
            result.summary.inspectionPass++;
         }
       } catch (e) {
         result.inspections.push({ key: script, label: `${script} commands`, status: 'fail', notes: 'Read error' });
         result.summary.inspectionFail++;
       }
     }
  }


  if (result.errors.length > 0) {
     if (result.errors.some(e => e.includes('Bundle path'))) {
        result.status = 'invalid';
     } else {
        result.status = 'blocked';
     }
  } else if (result.warnings.length > 0) {
     result.status = 'partial';
  } else {
     result.status = 'ready';
  }

  return result;
}
