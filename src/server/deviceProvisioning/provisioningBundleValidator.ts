import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ProvisioningBundleValidationResult } from './provisioningTypes';
import {
  REQUIRED_FILES,
  OPTIONAL_FILES,
  REQUIRED_DIRS,
  inspectFeatherXml,
  inspectFeatherJson,
  inspectFourbaIdentity,
  inspectCsv,
  inspectShellScript,
  determineFinalStatus
} from './provisioningShared';

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
  const featherXmlPath = path.join(bundlePath, 'feather.xml');
  if (fs.existsSync(featherXmlPath)) {
    try {
      inspectFeatherXml(fs.readFileSync(featherXmlPath, 'utf8'), result);
    } catch(e) {
       result.inspections.push({ key: 'feather.xml', label: 'feather.xml structure', status: 'fail', notes: 'Read error' });
       result.summary.inspectionFail++;
    }
  } else {
    result.inspections.push({ key: 'feather.xml', label: 'feather.xml structure', status: 'not-applicable', notes: 'Missing file' });
  }

  const featherJsonPath = path.join(bundlePath, 'feather.json');
  if (fs.existsSync(featherJsonPath)) {
    try {
      inspectFeatherJson(fs.readFileSync(featherJsonPath, 'utf8'), result);
    } catch(e) {
      result.inspections.push({ key: 'feather.json', label: 'feather.json identity', status: 'fail', notes: 'Read error' });
      result.summary.inspectionFail++;
      result.errors.push("Error reading feather.json.");
    }
  } else {
     result.inspections.push({ key: 'feather.json', label: 'feather.json identity', status: 'not-applicable' });
  }

  const fourbaPath = path.join(bundlePath, 'fourbaidentity.json');
  if (fs.existsSync(fourbaPath)) {
    try {
      inspectFourbaIdentity(fs.readFileSync(fourbaPath, 'utf8'), result);
    } catch(e) {
      result.inspections.push({ key: 'fourbaidentity.json', label: 'fourbaidentity.json identity', status: 'fail', notes: 'Read error' });
      result.summary.inspectionFail++;
      result.errors.push("Error reading fourbaidentity.json.");
    }
  } else {
     result.inspections.push({ key: 'fourbaidentity.json', label: 'fourbaidentity.json identity', status: 'not-applicable' });
  }

  const csvFiles = ['netmap_entity.csv', 'netmap_string.csv', 'netmap_other.csv'];
  for (const csv of csvFiles) {
    const csvPath = path.join(bundlePath, csv);
    if (fs.existsSync(csvPath)) {
      try {
         inspectCsv(csv, fs.readFileSync(csvPath, 'utf8'), result);
      } catch(e) {
        result.inspections.push({ key: csv, label: `${csv} structure`, status: 'fail', notes: 'Read error' });
        result.summary.inspectionFail++;
      }
    }
  }

  const scriptsToInspect = REQUIRED_FILES.filter(f => f.endsWith('.sh'));
  for (const script of scriptsToInspect) {
     const scriptPath = path.join(bundlePath, script);
     if (fs.existsSync(scriptPath)) {
       try {
         inspectShellScript(script, fs.readFileSync(scriptPath, 'utf8'), result);
       } catch (e) {
         result.inspections.push({ key: script, label: `${script} commands`, status: 'fail', notes: 'Read error' });
         result.summary.inspectionFail++;
       }
     }
  }

  determineFinalStatus(result);

  return result;
}
