import { Router } from 'express';
import { validateBundle } from './provisioningBundleValidator';
import { validateManifest } from './provisioningManifestValidator';
import { saveSelectedBundle, getSelectedBundle, clearSelectedBundle, saveValidationToHistory } from './provisioningBundleStorage';
import { buildProvisioningPlanPreview } from './featherProvisioningPlanner';

import { validateProvisioningWorkspace } from './provisioningWorkspaceValidator';

const router = Router();

router.get('/workspace/validate', async (req, res) => {
  try {
    const result = await validateProvisioningWorkspace();
    res.json({ success: true, validation: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/bundles/validate', (req, res) => {
  const { bundlePath } = req.body;
  if (!bundlePath) {
    return res.status(400).json({ success: false, error: "bundlePath is required" });
  }

  try {
    const result = validateBundle(bundlePath);
    res.json({ success: true, validation: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/bundles/validate-manifest', (req, res) => {
  const manifest = req.body;
  if (!manifest || !manifest.sourceLabel || !manifest.files) {
    return res.status(400).json({ success: false, error: "Invalid manifest" });
  }

  try {
    const result = validateManifest(manifest);
    res.json({ success: true, validation: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/bundles/latest', (req, res) => {
  const latest = getSelectedBundle();
  res.json({ success: true, validation: latest });
});

router.post('/bundles/select', (req, res) => {
  const { bundlePath } = req.body;
  if (!bundlePath) {
    return res.status(400).json({ success: false, error: "bundlePath is required" });
  }

  try {
    const result = validateBundle(bundlePath);
    saveSelectedBundle(result);
    saveValidationToHistory(result);
    res.json({ success: true, validation: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/bundles/selected', (req, res) => {
  clearSelectedBundle();
  res.json({ success: true });
});

router.post('/plans/preview', (req, res) => {
  const { targetFeatherIp, featherIndex, ioLogikIp, ioLogikSource, targetLabel, bundleValidation, bundleSource } = req.body;
  if (!targetFeatherIp || featherIndex === undefined || !ioLogikIp || !bundleValidation || !bundleSource) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  try {
    const plan = buildProvisioningPlanPreview(
      targetFeatherIp,
      Number(featherIndex),
      ioLogikIp,
      ioLogikSource || "user-input",
      targetLabel,
      bundleValidation,
      bundleSource
    );
    res.json({ success: true, plan });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
