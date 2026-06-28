import PDFDocument from 'pdfkit';
import { SiteReportPayload } from './reportTypes';

export async function generatePdf(payload: SiteReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });

      // Colors
      const BRAND_GREEN = '#32A97B';
      const TEXT_MAIN = '#1e293b';
      const TEXT_MUTED = '#64748b';
      const DANGER = '#ef4444';
      const WARNING = '#f59e0b';
      
      // Page 1: Header / Cover
      doc.fontSize(24).fillColor(BRAND_GREEN).text('GreEnergy PRIZM', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(18).fillColor(TEXT_MAIN).text(payload.title, { align: 'center' });
      doc.moveDown(1);
      
      // Metadata box
      doc.rect(50, doc.y, 495, 120).strokeColor('#cbd5e1').stroke();
      doc.moveDown(1);
      
      doc.fontSize(10).fillColor(TEXT_MUTED);
      doc.text(`Site Name:`, 65, doc.y, { continued: true }).fillColor(TEXT_MAIN).text(` ${payload.site.siteName || '-'}`);
      doc.text(`Station Code:`, 65, doc.y + 5, { continued: true }).fillColor(TEXT_MAIN).text(` ${payload.site.stationCode || '-'}`);
      doc.text(`Block Index:`, 65, doc.y + 10, { continued: true }).fillColor(TEXT_MAIN).text(` ${payload.site.blockIndex || '-'}`);
      doc.text(`Topology Profile:`, 65, doc.y + 15, { continued: true }).fillColor(TEXT_MAIN).text(` ${payload.topology.profileName || '-'}`);
      doc.text(`Generated At:`, 65, doc.y + 20, { continued: true }).fillColor(TEXT_MAIN).text(` ${payload.generatedAt}`);
      doc.text(`Report ID:`, 65, doc.y + 25, { continued: true }).fillColor(TEXT_MAIN).text(` ${payload.reportId}`);
      
      doc.moveDown(4);

      // Freshness
      if (payload.freshness.mockOrFallbackDetected) {
        doc.fillColor(DANGER).fontSize(12).text('WARNING: Local fallback / mock data detected — not valid live site data', { align: 'center' });
      } else if (payload.freshness.overallStatus === 'stale') {
        doc.fillColor(WARNING).fontSize(12).text('WARNING: Generated from stale data cache', { align: 'center' });
      } else {
        doc.fillColor(BRAND_GREEN).fontSize(12).text(`Data Freshness: ${payload.freshness.overallStatus.toUpperCase()}`, { align: 'center' });
      }
      doc.moveDown(2);

      // Executive Summary
      if (payload.executiveSummary) {
        doc.fontSize(14).fillColor(TEXT_MAIN).text('Executive Summary', { underline: true });
        doc.moveDown(0.5);
        
        const es = payload.executiveSummary;
        
        doc.fontSize(10).fillColor(TEXT_MAIN);
        doc.text(`System Status: ${es.systemStatus}`);
        doc.text(`Alarms: ${es.alarmCount} | Warnings: ${es.warningCount}`);
        doc.text(`Strings: ${es.onlineStrings} Online, ${es.nearlineStrings} Nearline, ${es.offlineStrings} Offline`);
        doc.text(`Stored Energy: ${(es.storedEnergyKWh || 0).toFixed(1)} kWh / ${(es.installedCapacityKWh || 0).toFixed(1)} kWh`);
        doc.text(`System SOC: ${(es.socPct || 0).toFixed(1)}%`);
        doc.moveDown(2);
      }

      // Energy Health
      if (payload.energyHealth) {
        doc.addPage();
        doc.fontSize(14).fillColor(TEXT_MAIN).text('Energy / Electrical Health', { underline: true });
        doc.moveDown(1);
        
        doc.fontSize(10);
        payload.energyHealth.voltageMetricsByArray.forEach(arr => {
           doc.text(`Array ${arr.array}: Min ${arr.min}mV, Max ${arr.max}mV, Delta ${arr.delta}mV`);
        });
      }

      // Thermal Health
      if (payload.thermalHealth) {
        doc.addPage();
        doc.fontSize(14).fillColor(TEXT_MAIN).text('Thermal Health', { underline: true });
        doc.moveDown(1);
        
        doc.fontSize(10);
        payload.thermalHealth.tempMetricsByArray.forEach(arr => {
           doc.text(`Array ${arr.array}: Min ${arr.min}C, Max ${arr.max}C, Delta ${arr.delta}C`);
        });
      }
      
      // Corrective Actions
      if (payload.correctiveActions) {
        doc.addPage();
        doc.fontSize(14).fillColor(TEXT_MAIN).text('Corrective Actions', { underline: true });
        doc.moveDown(1);
        
        doc.fontSize(10);
        payload.correctiveActions.groupedActions.forEach(a => {
           doc.fillColor(a.severity === 'fault' || a.severity === 'alarm' ? DANGER : WARNING)
              .text(`[${a.severity.toUpperCase()}] ${a.faultName} (Count: ${a.affectedCount})`);
           doc.fillColor(TEXT_MUTED).text(`Action: ${a.suggestedAction}`);
           doc.moveDown(0.5);
        });
      }

      // Controls and source health
      if (payload.freshness.sources && payload.freshness.sources.length > 0) {
        doc.addPage();
        doc.fontSize(14).fillColor(TEXT_MAIN).text('Controls / Communications / Source Health', { underline: true });
        doc.moveDown(1);
        doc.fontSize(10).fillColor(TEXT_MAIN);
        payload.freshness.sources.forEach(s => {
           doc.text(`[${s.status.toUpperCase()}] ${s.name} (${s.sourceType})`);
        });
      }
      
      // Comparison
      if (payload.comparison) {
         doc.addPage();
         doc.fontSize(14).fillColor(TEXT_MAIN).text('Before / After Comparison', { underline: true });
         doc.moveDown(1);
         doc.fontSize(10).fillColor(TEXT_MAIN);
         doc.text(`Alarms Delta: ${payload.comparison.deltas.alarms}`);
         doc.text(`Warnings Delta: ${payload.comparison.deltas.warnings}`);
         doc.text(`Online Strings Delta: ${payload.comparison.deltas.onlineStrings}`);
      }
      
      // Footer
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor(TEXT_MUTED).text(
          `Generated ${payload.generatedAt} | PRIZM Report ID: ${payload.reportId} | Page ${i + 1} of ${pages.count}`,
          50,
          doc.page.height - 40,
          { align: 'center' }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
