import { Router } from 'express';
import { buildSiteDataSnapshot, compareSiteSnapshots } from './siteSnapshotEngine';
import { buildReportPackageFromSnapshot } from './reportBuilder';
import { generatePdf } from './pdfRenderer';
import { getSnapshotsIndex, loadSnapshot, deleteSnapshot as delSnapshot } from './siteSnapshotStorage';
import { saveReport, getReportIndex, getReportPath, deleteReport } from './reportStorage';
import { ReportType } from './reportTypes';
import { parse } from 'json2csv';

const router = Router();

// Snapshot routes
router.post('/snapshots/capture', async (req, res) => {
  try {
    const { label, notes } = req.body;
    const snapshot = await buildSiteDataSnapshot({ snapshotType: 'manual', label: label || 'Manual Capture', notes });
    res.json({ success: true, snapshotId: snapshot.snapshotId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/snapshots/build', async (req, res) => {
  try {
    const options = req.body;
    const snapshot = await buildSiteDataSnapshot(options);
    res.json({ success: true, snapshot });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/snapshots', async (req, res) => {
  try {
    const snapshots = getSnapshotsIndex();
    res.json({ success: true, snapshots });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/snapshots/:snapshotId', async (req, res) => {
  try {
    const snapshot = loadSnapshot(req.params.snapshotId);
    if (!snapshot) {
      return res.status(404).json({ success: false, error: 'Snapshot not found' });
    }
    res.json({ success: true, snapshot });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/snapshots/:snapshotId', async (req, res) => {
  try {
    delSnapshot(req.params.snapshotId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Report Generation helper
async function handleReportGeneration(req: any, res: any, reportType: ReportType) {
  try {
    const { titleOverride, notes, snapshotIds, snapshotOptions } = req.body;
    
    let snapshot;
    let comparisonSnapshot;

    if (snapshotIds && snapshotIds.length === 2 && reportType === 'comparison') {
       comparisonSnapshot = loadSnapshot(snapshotIds[0]);
       snapshot = loadSnapshot(snapshotIds[1]);
    } else if (snapshotIds && snapshotIds.length === 1) {
       snapshot = loadSnapshot(snapshotIds[0]);
    } else {
       // build on the fly
       snapshot = await buildSiteDataSnapshot({ ...snapshotOptions, snapshotType: 'report' });
    }
    
    if (!snapshot) {
        throw new Error("Failed to load or build Site Data Snapshot for report");
    }

    const payload = buildReportPackageFromSnapshot(snapshot, reportType, { titleOverride, notes, comparisonSnapshot });
    
    // Generate PDF
    const pdfBuffer = await generatePdf(payload);
    
    // Generate simple CSVs if needed (example)
    const csvs = [];
    if (payload.energyHealth && payload.energyHealth.voltageMetricsByArray) {
       try {
         const csvContent = parse(payload.energyHealth.voltageMetricsByArray);
         csvs.push({ name: 'voltage-metrics.csv', content: csvContent });
       } catch (e) {}
    }
    
    const entry = await saveReport(payload, pdfBuffer, csvs);
    
    res.json({
      success: true,
      reportId: entry.reportId,
      reportType: entry.reportType,
      createdAt: entry.createdAt,
      pdfUrl: `/api/local/reports/download/${entry.reportId}/report.pdf`,
      jsonUrl: `/api/local/reports/download/${entry.reportId}/report.json`,
      csvUrls: entry.csvPaths?.map(p => `/api/local/reports/download/${entry.reportId}/${p.split('/').pop()}`) || [],
      sourceFreshness: payload.freshness,
      warnings: payload.freshness.warnings
    });
  } catch (err: any) {
    console.error("[reports] Failed to generate report", {
      reportType,
      error: err?.message,
      stack: err?.stack
    });
    res.status(500).json({ 
      success: false, 
      error: err?.message || "Failed to generate report" 
    });
  }
}

// Generate report endpoints
router.post('/site-snapshot', (req, res) => handleReportGeneration(req, res, 'site-snapshot'));
router.post('/thermal-health', (req, res) => handleReportGeneration(req, res, 'thermal-health'));
router.post('/energy-health', (req, res) => handleReportGeneration(req, res, 'energy-health'));
router.post('/corrective-actions', (req, res) => handleReportGeneration(req, res, 'corrective-actions'));
router.post('/comparison', (req, res) => handleReportGeneration(req, res, 'comparison'));
router.post('/custom', (req, res) => handleReportGeneration(req, res, 'custom'));

// Report History
router.get('/', async (req, res) => {
  try {
    const index = await getReportIndex();
    res.json({ success: true, reports: index });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download files
router.get('/download/:reportId/:filename', async (req, res) => {
  try {
    const { reportId, filename } = req.params;
    // Sanitize filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
       return res.status(400).send('Invalid filename');
    }
    const filePath = await getReportPath(reportId, filename);
    if (!filePath) {
      return res.status(404).send('File not found');
    }
    res.download(filePath);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.delete('/:reportId', async (req, res) => {
  try {
    await deleteReport(req.params.reportId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export const reportRoutes = router;
