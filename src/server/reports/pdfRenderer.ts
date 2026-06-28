import PDFDocument from 'pdfkit';
import { SiteReportPayload } from './reportTypes';

function safeText(value: any, fallback = "--"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function safeUpper(value: any, fallback = "UNKNOWN"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value).toUpperCase();
}

function safeNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeFixed(value: any, digits = 1, fallback = "0.0"): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : fallback;
}

function asArray<T = any>(value: any): T[] {
  return Array.isArray(value) ? value : [];
}

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
      doc.fontSize(18).fillColor(TEXT_MAIN).text(safeText(payload.title, 'Report'), { align: 'center' });
      doc.moveDown(1);
      
      // Metadata box
      doc.rect(50, doc.y, 495, 120).strokeColor('#cbd5e1').stroke();
      doc.moveDown(1);
      
      doc.fontSize(10).fillColor(TEXT_MUTED);
      doc.text(`Site Name:`, 65, doc.y, { continued: true }).fillColor(TEXT_MAIN).text(` ${safeText(payload.site?.siteName)}`);
      doc.text(`Station Code:`, 65, doc.y + 5, { continued: true }).fillColor(TEXT_MAIN).text(` ${safeText(payload.site?.stationCode)}`);
      doc.text(`Block Index:`, 65, doc.y + 10, { continued: true }).fillColor(TEXT_MAIN).text(` ${safeText(payload.site?.blockIndex)}`);
      doc.text(`Topology Profile:`, 65, doc.y + 15, { continued: true }).fillColor(TEXT_MAIN).text(` ${safeText(payload.topology?.profileName)}`);
      doc.text(`Generated At:`, 65, doc.y + 20, { continued: true }).fillColor(TEXT_MAIN).text(` ${safeText(payload.generatedAt)}`);
      doc.text(`Report ID:`, 65, doc.y + 25, { continued: true }).fillColor(TEXT_MAIN).text(` ${safeText(payload.reportId)}`);
      
      doc.moveDown(4);

      // Freshness
      if (payload.freshness?.mockOrFallbackDetected) {
        doc.fillColor(DANGER).fontSize(12).text('WARNING: Local fallback / mock data detected — not valid live site data', { align: 'center' });
      } else if (payload.freshness?.overallStatus === 'stale') {
        doc.fillColor(WARNING).fontSize(12).text('WARNING: Generated from stale data cache', { align: 'center' });
      } else {
        doc.fillColor(BRAND_GREEN).fontSize(12).text(`Data Freshness: ${safeUpper(payload.freshness?.overallStatus)}`, { align: 'center' });
      }
      doc.moveDown(2);

      // Executive Summary
      if (payload.executiveSummary) {
        doc.fontSize(14).fillColor(TEXT_MAIN).text('Executive Summary', { underline: true });
        doc.moveDown(0.5);
        
        const es = payload.executiveSummary;
        
        doc.fontSize(10).fillColor(TEXT_MAIN);
        doc.text(`System Status: ${safeText(es.systemStatus)}`);
        doc.text(`Alarms: ${safeNumber(es.alarmCount)} | Warnings: ${safeNumber(es.warningCount)}`);
        doc.text(`Strings: ${safeNumber(es.onlineStrings)} Online, ${safeNumber(es.nearlineStrings)} Nearline, ${safeNumber(es.offlineStrings)} Offline`);
        doc.text(`Stored Energy: ${safeFixed(es.storedEnergyKWh)} kWh / ${safeFixed(es.installedCapacityKWh)} kWh`);
        doc.text(`System SOC: ${safeFixed(es.socPct)}%`);
        doc.moveDown(2);
      }

      // Energy Health
      if (payload.energyHealth) {
        doc.addPage();
        doc.fontSize(14).fillColor(TEXT_MAIN).text('Energy / Electrical Health', { underline: true });
        doc.moveDown(1);
        
        doc.fontSize(10);
        const energyMetrics = asArray(payload.energyHealth.voltageMetricsByArray);
        if (energyMetrics.length === 0) {
           doc.fillColor(TEXT_MUTED).text('No energy health data available in this snapshot.');
        } else {
           energyMetrics.forEach(arr => {
              doc.text(`Array ${safeText(arr.array)}: Min ${safeText(arr.min)}mV, Max ${safeText(arr.max)}mV, Delta ${safeText(arr.delta)}mV`);
           });
        }
      }

      // Thermal Health
      if (payload.thermalHealth) {
        doc.addPage();
        doc.fontSize(14).fillColor(TEXT_MAIN).text('Thermal Health', { underline: true });
        doc.moveDown(1);
        
        doc.fontSize(10);
        const tempMetrics = asArray(payload.thermalHealth.tempMetricsByArray);
        if (tempMetrics.length === 0) {
           doc.fillColor(TEXT_MUTED).text('No thermal health data available in this snapshot.');
        } else {
           tempMetrics.forEach(arr => {
              doc.text(`Array ${safeText(arr.array)}: Min ${safeText(arr.min)}C, Max ${safeText(arr.max)}C, Delta ${safeText(arr.delta)}C`);
           });
        }
      }
      
      // Corrective Actions
      if (payload.correctiveActions) {
        doc.addPage();
        doc.fontSize(14).fillColor(TEXT_MAIN).text('Corrective Actions', { underline: true });
        doc.moveDown(1);
        
        doc.fontSize(10);
        const actions = asArray(payload.correctiveActions.groupedActions);
        if (actions.length === 0) {
           doc.fillColor(TEXT_MUTED).text('No corrective actions available in this snapshot.');
        } else {
           actions.forEach(a => {
              const severity = safeUpper(a?.severity || a?.level || a?.status, "UNSPECIFIED");
              const isAlarm = severity.includes("ALARM") || severity.includes("FAULT") || severity.includes("ERROR");
              
              doc.fillColor(isAlarm ? DANGER : WARNING)
                 .text(`[${severity}] ${safeText(a.faultName)} (Count: ${safeNumber(a.affectedCount)})`);
              doc.fillColor(TEXT_MUTED).text(`Action: ${safeText(a.suggestedAction)}`);
              doc.moveDown(0.5);
           });
        }
      }

      // Controls and source health
      if (payload.freshness?.sources && asArray(payload.freshness.sources).length > 0) {
        doc.addPage();
        doc.fontSize(14).fillColor(TEXT_MAIN).text('Controls / Communications / Source Health', { underline: true });
        doc.moveDown(1);
        doc.fontSize(10).fillColor(TEXT_MAIN);
        const sources = asArray(payload.freshness.sources);
        if (sources.length === 0) {
           doc.fillColor(TEXT_MUTED).text('No source health data available in this snapshot.');
        } else {
           sources.forEach(s => {
              doc.text(`[${safeUpper(s?.status, "UNKNOWN")}] ${safeText(s.name)} (${safeText(s.sourceType)})`);
           });
        }
      }
      
      // Comparison
      if (payload.comparison) {
         doc.addPage();
         doc.fontSize(14).fillColor(TEXT_MAIN).text('Before / After Comparison', { underline: true });
         doc.moveDown(1);
         doc.fontSize(10).fillColor(TEXT_MAIN);
         doc.text(`Alarms Delta: ${safeNumber(payload.comparison?.deltas?.alarms)}`);
         doc.text(`Warnings Delta: ${safeNumber(payload.comparison?.deltas?.warnings)}`);
         doc.text(`Online Strings Delta: ${safeNumber(payload.comparison?.deltas?.onlineStrings)}`);
      }
      
      // Footer
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor(TEXT_MUTED).text(
          `Generated ${safeText(payload.generatedAt)} | PRIZM Report ID: ${safeText(payload.reportId)} | Page ${i + 1} of ${pages.count}`,
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

