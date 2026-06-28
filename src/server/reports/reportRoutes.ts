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
    const { titleOverride, notes, snapshotIds, snapshotOptions, refresh, includeFirmware, triggerFirmwareCapture, label } = req.body;
    
    let snapshot;
    let comparisonSnapshot;

    if (snapshotIds && snapshotIds.length === 2 && reportType === 'comparison') {
       comparisonSnapshot = loadSnapshot(snapshotIds[0]);
       snapshot = loadSnapshot(snapshotIds[1]);
    } else if (snapshotIds && snapshotIds.length === 1) {
       snapshot = loadSnapshot(snapshotIds[0]);
    } else {
       // build on the fly
       snapshot = await buildSiteDataSnapshot({ 
           ...snapshotOptions, 
           snapshotType: 'report',
           refresh: refresh,
           includeFirmware: includeFirmware,
           triggerFirmwareCapture: triggerFirmwareCapture,
           label: label,
           notes: notes
       });
    }
    
    if (!snapshot) {
        throw new Error("Failed to load or build Site Data Snapshot for report");
    }

    const payload = buildReportPackageFromSnapshot(snapshot, reportType, { titleOverride, notes, comparisonSnapshot });
    
    // Generate PDF
    const pdfBuffer = await generatePdf(payload);
    
    // Generate CSVs
    const csvs = [];
    
    const addCsv = (name: string, data: any[]) => {
      if (data && data.length > 0) {
        try {
          csvs.push({ name, content: parse(data) });
        } catch (e) {}
      }
    };

    if (payload.energyHealth) {
       addCsv('energy-array-summary.csv', payload.energyHealth.stringAvailabilityByArray);
       addCsv('voltage-metrics.csv', payload.energyHealth.voltageMetricsByArray);
    }
    
    if (payload.thermalHealth) {
       addCsv('thermal-array-summary.csv', payload.thermalHealth.tempMetricsByArray);
       addCsv('hvac-devices.csv', payload.thermalHealth.deviceStatus);
    }

    if (payload.correctiveActions) {
       addCsv('corrective-actions.csv', payload.correctiveActions.groupedActions?.map((g: any) => ({
           id: g.id,
           severity: g.severity,
           code: g.code,
           faultName: g.faultName,
           affectedCount: g.affectedCount,
           suggestedAction: g.suggestedAction,
           source: g.source,
           firstSeen: g.firstSeen,
           lastSeen: g.lastSeen
       })));
       addCsv('affected-targets.csv', payload.correctiveActions.expandedTargets);
    }

    if (payload.appendix?.sourceHealth) {
       addCsv('source-coverage.csv', payload.appendix.sourceHealth);
    }

    if (payload.appendix?.firmware?.included && payload.appendix.firmware.source !== 'unavailable') {
        const fw = payload.appendix.firmware;
        const fwSummary = [
            { type: 'Turtle Mismatches', count: fw.summary?.mismatchCount || 0 },
            { type: 'Missing Versions', count: fw.summary?.missingCount || 0 }
        ];
        addCsv('firmware-summary.csv', fwSummary);
        if (fw.details && fw.details.length > 0) {
            addCsv('firmware-details.csv', fw.details);
        }
    }
    
    const entry = await saveReport(payload, pdfBuffer, csvs);
    
    res.json({
      success: true,
      reportId: entry.reportId,
      snapshotId: snapshot.snapshotId,
      reportType: entry.reportType,
      createdAt: entry.createdAt,
      pdfUrl: `/api/local/reports/download/${entry.reportId}/report.pdf`,
      jsonUrl: `/api/local/reports/download/${entry.reportId}/report.json`,
      csvUrls: entry.csvPaths?.map((p: string) => `/api/local/reports/download/${entry.reportId}/${p.split('/').pop()}`) || [],
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
