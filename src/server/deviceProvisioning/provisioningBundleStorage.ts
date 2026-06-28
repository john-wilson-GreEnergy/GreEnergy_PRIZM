import fs from 'fs';
import path from 'path';
import { ProvisioningBundleValidationResult } from './provisioningTypes';

const DATA_DIR = path.join(process.cwd(), 'data', 'provisioning');
const SELECTED_BUNDLE_FILE = path.join(DATA_DIR, 'selected-bundle.json');
const VALIDATION_HISTORY_FILE = path.join(DATA_DIR, 'bundle-validation-history.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function saveSelectedBundle(validation: ProvisioningBundleValidationResult) {
  ensureDir();
  fs.writeFileSync(SELECTED_BUNDLE_FILE, JSON.stringify(validation, null, 2), 'utf8');
}

export function getSelectedBundle(): ProvisioningBundleValidationResult | null {
  ensureDir();
  if (fs.existsSync(SELECTED_BUNDLE_FILE)) {
    try {
      const data = fs.readFileSync(SELECTED_BUNDLE_FILE, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error("Failed to read selected bundle", e);
    }
  }
  return null;
}

export function clearSelectedBundle() {
  ensureDir();
  if (fs.existsSync(SELECTED_BUNDLE_FILE)) {
    fs.unlinkSync(SELECTED_BUNDLE_FILE);
  }
}

export function saveValidationToHistory(validation: ProvisioningBundleValidationResult) {
  ensureDir();
  let history: ProvisioningBundleValidationResult[] = [];
  if (fs.existsSync(VALIDATION_HISTORY_FILE)) {
    try {
      history = JSON.parse(fs.readFileSync(VALIDATION_HISTORY_FILE, 'utf8'));
    } catch (e) {
      // ignore
    }
  }
  history.unshift(validation);
  if (history.length > 50) {
    history = history.slice(0, 50);
  }
  fs.writeFileSync(VALIDATION_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}
