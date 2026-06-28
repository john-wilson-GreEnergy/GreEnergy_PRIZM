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

export type ProvisioningBundleManifest = {
  sourceLabel: string;
  files: Array<{
    path: string;
    name: string;
    sizeBytes: number;
    kind: "text" | "binary";
    contentPreview?: string;
    truncated?: boolean;
  }>;
  directories: string[];
};

export function validateManifest(manifest: ProvisioningBundleManifest): ProvisioningBundleValidationResult {
  const result: ProvisioningBundleValidationResult = {
    bundleId: uuidv4(),
    bundlePath: manifest.sourceLabel,
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

  if (!manifest || !manifest.files || !manifest.directories) {
     result.errors.push("Invalid manifest payload.");
     determineFinalStatus(result);
     return result;
  }

  // Create lookups
  const filesByPath = new Map(manifest.files.map(f => [f.path, f]));
  const dirsSet = new Set(manifest.directories);

  // Check required dirs
  for (const dir of REQUIRED_DIRS) {
    if (dirsSet.has(dir)) {
      result.requiredDirectories.push({ path: dir, status: 'present' });
    } else {
      result.requiredDirectories.push({ path: dir, status: 'missing' });
      result.errors.push(`Required directory missing: ${dir}`);
    }
  }

  // Check required files
  for (const file of REQUIRED_FILES) {
    let resolvedFile = file;
    let foundFile = filesByPath.get(file);

    if (!foundFile && file.startsWith('cronScripts/')) {
        const altFile = file.replace('cronScripts/', '');
        const altFoundFile = filesByPath.get(altFile);
        if (altFoundFile) {
            foundFile = altFoundFile;
            resolvedFile = altFile;
        }
    }

    if (foundFile) {
      if (foundFile.sizeBytes > 0) {
        result.requiredFiles.push({ path: resolvedFile, status: 'present', sizeBytes: foundFile.sizeBytes });
        result.summary.requiredPresent++;
      } else {
        result.requiredFiles.push({ path: resolvedFile, status: 'invalid', notes: 'File is empty' });
        result.summary.requiredMissing++;
        result.errors.push(`Required file invalid or empty: ${resolvedFile}`);
      }
    } else {
      result.requiredFiles.push({ path: file, status: 'missing' });
      result.summary.requiredMissing++;
      result.errors.push(`Required file missing: ${file}`);
    }
  }

  // Check optional files
  for (const file of OPTIONAL_FILES) {
    const foundFile = filesByPath.get(file);
    if (foundFile) {
      if (foundFile.sizeBytes > 0) {
        result.optionalFiles.push({ path: file, status: 'present', sizeBytes: foundFile.sizeBytes });
        result.summary.optionalPresent++;
      } else {
        result.optionalFiles.push({ path: file, status: 'invalid', notes: 'File is empty' });
      }
    } else {
      result.optionalFiles.push({ path: file, status: 'optional-missing' });
      result.summary.optionalMissing++;
    }
  }

  // Inspections
  const featherXml = filesByPath.get('feather.xml');
  if (featherXml) {
    if (featherXml.contentPreview !== undefined) {
      inspectFeatherXml(featherXml.contentPreview, result);
    } else {
       result.inspections.push({ key: 'feather.xml', label: 'feather.xml structure', status: 'fail', notes: 'No content preview available' });
       result.summary.inspectionFail++;
    }
  } else {
    result.inspections.push({ key: 'feather.xml', label: 'feather.xml structure', status: 'not-applicable', notes: 'Missing file' });
  }

  const featherJson = filesByPath.get('feather.json');
  if (featherJson) {
    if (featherJson.contentPreview !== undefined) {
      inspectFeatherJson(featherJson.contentPreview, result);
    } else {
      result.inspections.push({ key: 'feather.json', label: 'feather.json identity', status: 'fail', notes: 'No content preview available' });
      result.summary.inspectionFail++;
      result.errors.push("Cannot read feather.json.");
    }
  } else {
     result.inspections.push({ key: 'feather.json', label: 'feather.json identity', status: 'not-applicable' });
  }

  const fourba = filesByPath.get('fourbaidentity.json');
  if (fourba) {
    if (fourba.contentPreview !== undefined) {
      inspectFourbaIdentity(fourba.contentPreview, result);
    } else {
      result.inspections.push({ key: 'fourbaidentity.json', label: 'fourbaidentity.json identity', status: 'fail', notes: 'No content preview available' });
      result.summary.inspectionFail++;
      result.errors.push("Cannot read fourbaidentity.json.");
    }
  } else {
     result.inspections.push({ key: 'fourbaidentity.json', label: 'fourbaidentity.json identity', status: 'not-applicable' });
  }

  const csvFiles = ['netmap_entity.csv', 'netmap_string.csv', 'netmap_other.csv'];
  for (const csv of csvFiles) {
    const csvFile = filesByPath.get(csv);
    if (csvFile) {
      if (csvFile.contentPreview !== undefined) {
         inspectCsv(csv, csvFile.contentPreview, result);
      } else {
        result.inspections.push({ key: csv, label: `${csv} structure`, status: 'fail', notes: 'No content preview available' });
        result.summary.inspectionFail++;
      }
    }
  }

  const scriptsToInspect = REQUIRED_FILES.filter(f => f.endsWith('.sh'));
  for (const script of scriptsToInspect) {
     const scriptFile = filesByPath.get(script);
     if (scriptFile) {
       if (scriptFile.contentPreview !== undefined) {
         inspectShellScript(script, scriptFile.contentPreview, result);
       } else {
         result.inspections.push({ key: script, label: `${script} commands`, status: 'fail', notes: 'No content preview available' });
         result.summary.inspectionFail++;
       }
     }
  }

  determineFinalStatus(result);

  return result;
}
