export const REQUIRED_FILES = [
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

export const OPTIONAL_FILES = [
  'README',
  'README.md',
  'bundle.json',
  'provisioning-profile.json',
  'checksums.json'
];

export const REQUIRED_DIRS = [
  'cronScripts'
];

import { ProvisioningBundleValidationResult } from './provisioningTypes';

export function inspectFeatherXml(content: string, result: ProvisioningBundleValidationResult) {
  const hasIpRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/;
  const hasIoLogikContext = /io-?logik|moxa|remote\s*io/i.test(content);
  const hasKnownParam = /(?:ip|ipAddress|host|address|ioLogikHost|ioLogikIp|remoteHost|endpoint)/i.test(content);
  
  let passed = false;

  if (content.includes('{io_logik_ip}') || 
      (hasIpRegex.test(content) && hasIoLogikContext) ||
      (hasIpRegex.test(content) && hasKnownParam)) {
      passed = true;
  }

  if (passed) {
    result.inspections.push({ key: 'feather.xml', label: 'feather.xml structure', status: 'pass' });
    result.summary.inspectionPass++;
  } else if (hasIpRegex.test(content) && !hasIoLogikContext) {
    result.inspections.push({ key: 'feather.xml', label: 'feather.xml structure', status: 'warn', notes: 'Contains IP addresses, but none could be confidently identified as the ioLogik target' });
    result.summary.inspectionWarn++;
    result.warnings.push("feather.xml contains IP addresses, but none could be confidently identified as the ioLogik target.");
  } else {
    result.inspections.push({ key: 'feather.xml', label: 'feather.xml structure', status: 'warn', notes: 'Could not identify ioLogik IP or placeholder' });
    result.summary.inspectionWarn++;
    result.warnings.push("feather.xml: Could not identify ioLogik IP or placeholder.");
  }
}

function findIdentityField(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const keys = Object.keys(obj);
  for (const k of keys) {
    const lowerKey = k.toLowerCase();
    if (['featherindex', 'feather_index', 'index', 'id', 'deviceid', 'segmentindex', 'energysegmentindex', 'collectionsegmentindex', 'arrayindex', 'blockindex', 'lineupindex', 'stringindex', 'identity', 'name', 'devicename'].includes(lowerKey)) {
      return k;
    }
    const val = obj[k];
    if (val === 202 || val === "202") {
      return "202";
    }
    if (typeof val === 'object') {
       const nested = findIdentityField(val);
       if (nested) return nested;
    }
  }
  return null;
}

export function inspectFeatherJson(content: string, result: ProvisioningBundleValidationResult) {
  try {
    const data = JSON.parse(content);
    let identityField = findIdentityField(data);
    let hasIdentity = false;

    if (!identityField) {
      const strData = JSON.stringify(data);
      if (strData.includes('{block_index}') || strData.includes('{array_index}') || strData.includes('{feather_index}') || strData.includes('block') || strData.includes('array')) {
        hasIdentity = true;
        identityField = "placeholder";
      }
    } else {
      hasIdentity = true;
    }

    if (hasIdentity) {
      const note = identityField === "202" ? "Default identity value 202 found." : 
                   identityField === "placeholder" ? "Template placeholder found." :
                   `Likely identity field found: ${identityField}`;
      result.inspections.push({ key: 'feather.json', label: 'feather.json identity', status: 'pass', notes: note });
      result.summary.inspectionPass++;
    } else {
      result.inspections.push({ key: 'feather.json', label: 'feather.json identity', status: 'warn', notes: 'No replaceable identity field found' });
      result.summary.inspectionWarn++;
      result.warnings.push("feather.json: No replaceable identity field found.");
    }
  } catch(e) {
    result.inspections.push({ key: 'feather.json', label: 'feather.json identity', status: 'fail', notes: 'Invalid JSON' });
    result.summary.inspectionFail++;
    result.errors.push("feather.json is not valid JSON.");
  }
}

export function inspectFourbaIdentity(content: string, result: ProvisioningBundleValidationResult) {
  try {
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
}

export function inspectCsv(key: string, content: string, result: ProvisioningBundleValidationResult) {
  if (content.includes(',')) {
    result.inspections.push({ key, label: `${key} structure`, status: 'pass' });
    result.summary.inspectionPass++;
  } else {
    result.inspections.push({ key, label: `${key} structure`, status: 'fail', notes: 'No comma-delimited content found' });
    result.summary.inspectionFail++;
    result.errors.push(`${key} does not appear to be a valid CSV.`);
  }
}

export function inspectShellScript(key: string, content: string, result: ProvisioningBundleValidationResult) {
  const dangerousCommands = ['sudo', 'service tomcat8', 'scp', 'ssh', 'sed', 'cp', 'chmod'];
  const found = dangerousCommands.filter(cmd => content.includes(cmd));
  if (found.length > 0) {
    result.inspections.push({ key, label: `${key} commands`, status: 'warn', notes: `Contains provisioning commands: ${found.join(', ')}` });
    result.summary.inspectionWarn++;
    result.warnings.push(`Script ${key} contains provisioning commands that will require controlled execution during a future provisioning run. (${found.join(', ')})`);
  } else {
    result.inspections.push({ key, label: `${key} commands`, status: 'pass' });
    result.summary.inspectionPass++;
  }
}

export function determineFinalStatus(result: ProvisioningBundleValidationResult) {
  if (result.errors.length > 0) {
    if (result.errors.some(e => e.includes('Bundle path') || e.includes('Invalid manifest'))) {
      result.status = 'invalid';
    } else {
      result.status = 'blocked';
    }
  } else if (result.warnings.length > 0) {
    result.status = 'partial';
  } else {
    result.status = 'ready';
  }
}
