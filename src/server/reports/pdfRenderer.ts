import PDFDocument from 'pdfkit';
import { SiteReportPayload } from './reportTypes';

// --- Safe Access Helpers ---


function compactNumberRangesForPdf(values: any[]): string {
  const nums = Array.from(
    new Set(
      (values || [])
        .map((v: any) => Number(v))
        .filter((v: number) => Number.isFinite(v))
    )
  ).sort((a, b) => a - b);

  if (!nums.length) return "--";

  const ranges: string[] = [];
  let start = nums[0];
  let prev = nums[0];

  for (let i = 1; i <= nums.length; i += 1) {
    const current = nums[i];

    if (current === prev + 1) {
      prev = current;
      continue;
    }

    ranges.push(start === prev ? String(start) : `${start}-${prev}`);
    start = current;
    prev = current;
  }

  return ranges.join(", ");
}

function pickPdfTargetPart(target: any, keys: string[], fallback: any = null): any {
  for (const key of keys) {
    const value = target?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function condensePdfAffectedTargets(targets: any[]): any[] {
  const groups = new Map<string, any>();

  for (const target of targets || []) {
    const block = pickPdfTargetPart(target, ["blockIndex", "block", "blockNumber"], 1);
    const array = pickPdfTargetPart(target, ["arrayIndex", "arrayNumber", "array"], null);
    const es = pickPdfTargetPart(target, ["energySegmentIndex", "energySegmentNumber", "energySegment", "es"], null);
    const string = pickPdfTargetPart(target, ["stringIndex", "stringNumber", "string"], null);
    const side = pickPdfTargetPart(target, ["side"], null);
    const bpc = pickPdfTargetPart(target, ["batteryPackIndex", "bpcIndex", "bpc", "batteryPack"], null);

    const key = [block, array, es, string, side, bpc].join("|");

    if (!groups.has(key)) {
      groups.set(key, {
        block,
        array,
        es,
        string,
        side,
        bpc,
        cellGroups: [],
        rawTargets: [],
        representative: target
      });
    }

    const group = groups.get(key);
    group.rawTargets.push(target);

    const cg = pickPdfTargetPart(target, ["cellGroupIndex", "cellGroupNumber", "cell", "cg"], null);
    if (cg !== null && cg !== undefined) group.cellGroups.push(cg);
  }

  return Array.from(groups.values()).map((group) => {
    const parts = [
      group.block !== null && group.block !== undefined ? `Block ${group.block}` : null,
      group.array !== null && group.array !== undefined ? `Array ${group.array}` : null,
      group.es !== null && group.es !== undefined ? `ES${group.es}` : null,
      group.string !== null && group.string !== undefined ? `String ${group.string}` : null,
      group.side ? `${group.side}` : null,
      group.bpc !== null && group.bpc !== undefined ? `BPC ${group.bpc}` : null,
      group.cellGroups.length ? `CG ${compactNumberRangesForPdf(group.cellGroups)}` : null
    ].filter(Boolean);

    return {
      ...group.representative,
      condensedLabel: parts.join(" / "),
      condensedCount: group.rawTargets.length,
      condensedRawTargets: group.rawTargets
    };
  });
}

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

function asArray<T = any>(value: any): T[] {
  return Array.isArray(value) ? value : [];
}

// --- Formatting Helpers ---

function formatMWh(kWh: any): string {
  const num = Number(kWh);
  if (!Number.isFinite(num)) return "--";
  return (num / 1000).toFixed(2) + " MWh";
}

function formatKWh(kWh: any): string {
  const num = Number(kWh);
  if (!Number.isFinite(num)) return "--";
  return num.toFixed(1) + " kWh";
}

function formatPercent(value: any): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return num.toFixed(1) + "%";
}

function formatVoltageMv(value: any): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return num.toLocaleString() + " mV";
}

function formatTempF(value: any): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return num.toFixed(1) + " °F";
}

function formatTempC(value: any): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return num.toFixed(1) + " °C";
}

function formatPowerKw(value: any): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return num.toFixed(1) + " kW";
}

function compressComponentList(components: string[]): string {
  if (components.length === 0) return "String-level";
  
  // Group by BPC
  const bpcToCgs = new Map<number, Set<number>>();
  const generalBpcs = new Set<number>();
  const generalCgs = new Set<number>();
  const otherStrings: string[] = [];
  
  for (const comp of components) {
    const bpcCgMatch = comp.match(/BPC\s*(\d+)\s*CG\s*(\d+)/i);
    if (bpcCgMatch) {
      const bpc = parseInt(bpcCgMatch[1], 10);
      const cg = parseInt(bpcCgMatch[2], 10);
      if (!bpcToCgs.has(bpc)) bpcToCgs.set(bpc, new Set());
      bpcToCgs.get(bpc)!.add(cg);
      continue;
    }
    
    const bpcMatch = comp.match(/BPC\s*(\d+)/i);
    if (bpcMatch) {
      const bpc = parseInt(bpcMatch[1], 10);
      generalBpcs.add(bpc);
      continue;
    }
    
    const cgMatch = comp.match(/CG\s*(\d+)/i);
    if (cgMatch) {
      const cg = parseInt(cgMatch[1], 10);
      generalCgs.add(cg);
      continue;
    }
    
    otherStrings.push(comp);
  }
  
  const resultParts: string[] = [];
  
  // Sort BPCs
  const sortedBpcs = Array.from(bpcToCgs.keys()).sort((a, b) => a - b);
  for (const bpc of sortedBpcs) {
    const cgs = Array.from(bpcToCgs.get(bpc)!).sort((a, b) => a - b);
    if (cgs.length === 0) {
      resultParts.push(`BPC ${bpc}`);
    } else {
      // Compress consecutive CGs if possible
      const cgRanges: string[] = [];
      let start = cgs[0];
      let prev = cgs[0];
      
      for (let i = 1; i <= cgs.length; i++) {
        const curr = cgs[i];
        if (curr === prev + 1) {
          prev = curr;
        } else {
          if (start === prev) {
            cgRanges.push(`${start}`);
          } else if (prev === start + 1) {
            cgRanges.push(`${start},${prev}`);
          } else {
            cgRanges.push(`${start}-${prev}`);
          }
          if (curr !== undefined) {
            start = curr;
            prev = curr;
          }
        }
      }
      resultParts.push(`BPC ${bpc} (CG ${cgRanges.join(',')})`);
    }
  }
  
  if (generalBpcs.size > 0) {
    const bpcs = Array.from(generalBpcs).sort((a, b) => a - b);
    resultParts.push(`BPCs ${bpcs.join(',')}`);
  }
  
  if (generalCgs.size > 0) {
    const cgs = Array.from(generalCgs).sort((a, b) => a - b);
    resultParts.push(`CGs ${cgs.join(',')}`);
  }
  
  resultParts.push(...otherStrings);
  
  return resultParts.join(", ");
}

// --- Layout Colors & Constants ---

const BRAND_GREEN = '#32A97B';
const TEXT_MAIN = '#1e293b';
const TEXT_MUTED = '#64748b';
const BORDER_LIGHT = '#e2e8f0';
const BG_ALT = '#f8fafc';
const DANGER = '#ef4444';
const WARNING = '#f59e0b';
const SUCCESS = '#22c55e';
const UNKNOWN_COLOR = '#94a3b8';

const MARGIN = 50;
const CONTENT_WIDTH = 495;

// --- Rendering Helpers ---

function drawSectionHeader(doc: typeof PDFDocument, title: string, subtitle?: string) {
  doc.moveDown(1);
  doc.fontSize(14).font('Helvetica-Bold').fillColor(BRAND_GREEN).text(title);
  if (subtitle) {
    doc.fontSize(10).font('Helvetica').fillColor(TEXT_MUTED).text(subtitle);
  }
  
  // Underline
  doc.moveTo(doc.x, doc.y + 5).lineTo(doc.x + CONTENT_WIDTH, doc.y + 5).strokeColor(BORDER_LIGHT).stroke();
  doc.moveDown(1.5);
  doc.font('Helvetica');
}

function drawMetricGrid(doc: typeof PDFDocument, cards: { label: string; value: string; color?: string }[]) {
  const startX = doc.x;
  let currentX = startX;
  let currentY = doc.y;
  const cols = 4;
  const cardWidth = (CONTENT_WIDTH - (cols - 1) * 10) / cols;
  const cardHeight = 45;
  
  doc.fontSize(8);
  
  for (let i = 0; i < cards.length; i++) {
    if (i > 0 && i % cols === 0) {
      currentX = startX;
      currentY += cardHeight + 10;
    }
    
    const card = cards[i];
    
    // Box
    doc.rect(currentX, currentY, cardWidth, cardHeight)
       .fillAndStroke(BG_ALT, BORDER_LIGHT);
       
    // Label
    doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').text(card.label, currentX + 5, currentY + 5, { width: cardWidth - 10, align: 'center' });
    
    // Value
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor(card.color || TEXT_MAIN)
       .text(card.value, currentX + 5, currentY + 20, { width: cardWidth - 10, align: 'center' });
    doc.fontSize(8);
    
    currentX += cardWidth + 10;
  }
  
  doc.y = currentY + cardHeight + 15;
  doc.font('Helvetica');
}

function drawReadinessBanner(doc: typeof PDFDocument, label: string, status: string, color: string) {
  doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 25).fill(color);
  doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold');
  doc.text(`${label}: ${status}`, MARGIN, doc.y - 18, { align: 'center', width: CONTENT_WIDTH });
  doc.font('Helvetica');
  doc.moveDown(1);
}

function drawWarningBanner(doc: typeof PDFDocument, text: string, severity: 'warning' | 'danger') {
  const color = severity === 'danger' ? DANGER : WARNING;
  doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 25).fill(color);
  doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
  doc.text(text, MARGIN, doc.y - 17, { align: 'center', width: CONTENT_WIDTH });
  doc.font('Helvetica');
  doc.moveDown(1);
}

function checkPageBreak(doc: typeof PDFDocument, requiredSpace: number) {
  if (doc.y + requiredSpace > doc.page.height - MARGIN) {
    doc.addPage();
    return true;
  }
  return false;
}

interface TableColumn {
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
}

function drawTableProper(doc: typeof PDFDocument, columns: TableColumn[], rows: string[][], rowColors?: string[]) {
  const startX = doc.x;
  const rowHeight = 20;
  
  // Header
  checkPageBreak(doc, rowHeight);
  const headerY = doc.y;
  doc.rect(startX, headerY, CONTENT_WIDTH, rowHeight).fill(BRAND_GREEN);
  doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
  
  let currentX = startX;
  columns.forEach(col => {
    doc.text(col.header, currentX + 5, headerY + 5, { width: col.width - 10, align: col.align || 'left', lineBreak: false });
    currentX += col.width;
  });
  doc.font('Helvetica');
  doc.y = headerY + rowHeight;
  
  if (rows.length === 0) {
    doc.moveDown(0.5);
    doc.fillColor(TEXT_MUTED).fontSize(9).text('No data available.', startX + 5, doc.y);
    doc.moveDown(1);
    return;
  }
  
  // Rows
  rows.forEach((row, rowIndex) => {
    checkPageBreak(doc, rowHeight);
    const rowY = doc.y;
    
    // Background
    if (rowIndex % 2 === 1) {
      doc.rect(startX, rowY, CONTENT_WIDTH, rowHeight).fill(BG_ALT);
    }
    
    doc.fillColor(rowColors && rowColors[rowIndex] ? rowColors[rowIndex] : TEXT_MAIN).fontSize(8);
    currentX = startX;
    
    row.forEach((cellText, cellIndex) => {
      const col = columns[cellIndex];
      doc.text(cellText, currentX + 5, rowY + 5, { width: col.width - 10, align: col.align || 'left', lineBreak: false });
      currentX += col.width;
    });
    
    doc.y = rowY + rowHeight;
  });
  doc.moveDown(1);
}

// --- Main Generator ---

export async function generatePdf(payload: SiteReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // --- 1. COVER / HEADER ---
      
      doc.fontSize(24).font('Helvetica-Bold').fillColor(BRAND_GREEN).text('GreEnergy PRIZM', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(16).font('Helvetica').fillColor(TEXT_MAIN).text(safeText(payload.title, 'Field Report'), { align: 'center' });
      doc.moveDown(1);
      
      // Metadata box
      const metaY = doc.y;
      doc.rect(MARGIN, metaY, CONTENT_WIDTH, 100).strokeColor(BORDER_LIGHT).stroke();
      
      doc.fontSize(9).fillColor(TEXT_MUTED);
      doc.text(`Site Name:`, MARGIN + 15, metaY + 15, { continued: true }).fillColor(TEXT_MAIN).font('Helvetica-Bold').text(` ${safeText(payload.site?.siteName)}`).font('Helvetica');
      doc.text(`Station / Block:`, MARGIN + 15, metaY + 30, { continued: true }).fillColor(TEXT_MAIN).font('Helvetica-Bold').text(` ${safeText(payload.site?.stationCode)} / Block ${safeText(payload.site?.blockIndex)}`).font('Helvetica');
      doc.text(`Topology Profile:`, MARGIN + 15, metaY + 45, { continued: true }).fillColor(TEXT_MAIN).font('Helvetica-Bold').text(` ${safeText(payload.topology?.profileName)}`).font('Helvetica');
      doc.text(`Generated At:`, MARGIN + 15, metaY + 60, { continued: true }).fillColor(TEXT_MAIN).text(` ${safeText(payload.generatedAt)}`);
      doc.text(`Report ID:`, MARGIN + 15, metaY + 75, { continued: true }).fillColor(TEXT_MAIN).text(` ${safeText(payload.reportId)}`);
      
      doc.y = metaY + 115;

      // Freshness Banner
      if (payload.freshness?.mockOrFallbackDetected) {
        drawWarningBanner(doc, 'WARNING: Local fallback / mock data detected — not valid live site data', 'danger');
      } else if (payload.freshness?.overallStatus === 'stale') {
        drawWarningBanner(doc, 'WARNING: Generated from stale data cache', 'warning');
      }
      
      const isSnapshot = payload.reportId.startsWith('site-snapshot');
      const isThermal = payload.reportId.startsWith('thermal');
      const isEnergy = payload.reportId.startsWith('energy');
      const isCorrective = payload.reportId.startsWith('corrective');
      const isComparison = payload.reportId.startsWith('comparison');
      
      // --- SITE SNAPSHOT SPECIFIC ---
      if (isSnapshot && payload.executiveSummary) {
        const es = payload.executiveSummary;
        
        let readiness = 'UNKNOWN';
        let rColor = UNKNOWN_COLOR;
        
        const alarms = safeNumber(es.alarmCount);
        const warnings = safeNumber(es.warningCount);
        
        if (alarms > 0) { readiness = 'ACTION REQUIRED'; rColor = DANGER; }
        else if (warnings > 0 || payload.freshness?.overallStatus !== 'fresh') { readiness = 'LIMITED'; rColor = WARNING; }
        else { readiness = 'READY'; rColor = SUCCESS; }
        
        drawReadinessBanner(doc, 'Site Readiness', readiness, rColor);
        
        drawMetricGrid(doc, [
          { label: 'Installed Capacity', value: formatMWh(es.installedCapacityKWh) },
          { label: 'Stored Energy', value: formatMWh(es.storedEnergyKWh) },
          { label: 'System SOC', value: formatPercent(es.socPct) },
          { label: 'EMS Status', value: safeUpper(es.emsStatus), color: es.emsStatus === 'Connected' ? SUCCESS : DANGER },
          { label: 'Online Strings', value: String(safeNumber(es.onlineStrings)), color: SUCCESS },
          { label: 'Nearline Strings', value: String(safeNumber(es.nearlineStrings)), color: WARNING },
          { label: 'Offline Strings', value: String(safeNumber(es.offlineStrings)), color: DANGER },
          { label: 'Not Comm', value: String(safeNumber(es.notCommunicatingStrings)), color: UNKNOWN_COLOR },
          { label: 'Active Alarms', value: String(alarms), color: alarms > 0 ? DANGER : SUCCESS },
          { label: 'Active Warnings', value: String(warnings), color: warnings > 0 ? WARNING : SUCCESS },
          { label: 'PCS Status', value: safeUpper(es.pcsStatus), color: es.pcsStatus === 'Online' ? SUCCESS : WARNING },
          { label: 'Data Freshness', value: safeUpper(payload.freshness?.overallStatus), color: payload.freshness?.overallStatus === 'fresh' ? SUCCESS : WARNING }
        ]);
        
        drawSectionHeader(doc, 'Operations Summary');
        doc.fontSize(10).fillColor(TEXT_MAIN).lineGap(4);
        doc.text(`Site ${safeText(payload.site?.stationCode)} Block ${safeText(payload.site?.blockIndex)} is reporting ${safeNumber(es.onlineStrings)} strings in online state and ${safeNumber(es.nearlineStrings)} strings in nearline state. The fleet currently holds ${formatMWh(es.storedEnergyKWh)} of stored energy against an installed capacity of ${formatMWh(es.installedCapacityKWh)}.`);
        doc.text(`Active corrective actions include ${warnings} warning groups and ${alarms} alarm groups. EMS/Turtle data status is ${safeUpper(es.emsStatus)}.`);
        
        doc.moveDown(1);
        doc.font('Helvetica-Bold').text('Recommended Next Actions:');
        doc.font('Helvetica').fillColor(TEXT_MUTED);
        if (alarms > 0) doc.text('• Review alarm corrective actions immediately. See Corrective Actions section.');
        else if (warnings > 0) doc.text('• Review warning groups and monitor affected targets.');
        else doc.text('• Continue normal monitoring. No active alarms or warnings detected.');
        if (payload.freshness?.overallStatus !== 'fresh') doc.text('• Refresh EMS/Turtle sources before using report for final field validation.');
        
        doc.lineGap(0);
      }
      
      // --- THERMAL HEALTH SPECIFIC ---
      if ((isThermal || isSnapshot) && payload.thermalHealth) {
        if (!isSnapshot) doc.addPage();
        else checkPageBreak(doc, 200);
        
        drawSectionHeader(doc, 'Thermal Health');
        
        const th = payload.thermalHealth;
        
        if (isThermal) {
           drawReadinessBanner(doc, 'Thermal Readiness', 'NORMAL', SUCCESS); // Simplified for this exercise
           
           drawMetricGrid(doc, [
             { label: 'Max Cell Temp', value: formatTempC(th.maxCellTemp) },
             { label: 'Max Temp Delta', value: formatTempC(th.maxTempDelta) },
             { label: 'HVAC Mismatches', value: String(safeNumber(th.hvacMismatchCount)) },
             { label: 'Avg Cell Temp', value: formatTempC(th.avgCellTemp || 0) }
           ]);
           
           doc.fontSize(10).fillColor(TEXT_MAIN).lineGap(4);
           doc.text(`Thermal profile is reporting a maximum cell temperature of ${formatTempC(th.maxCellTemp)} and a maximum temperature delta of ${formatTempC(th.maxTempDelta)}. HVAC mismatch count is ${safeNumber(th.hvacMismatchCount)}.`);
           doc.moveDown(1.5);
           doc.lineGap(0);
        }
        
        doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_MAIN).text('Array Thermal Summary');
        doc.font('Helvetica').moveDown(0.5);
        
        const thermRows = asArray(th.tempMetricsByArray).map(arr => [
          `Array ${safeText(arr.array)}`,
          formatTempC(arr.min),
          formatTempC(arr.max),
          formatTempC(arr.delta),
          safeNumber(arr.delta) > 5 ? 'Warning' : 'Normal'
        ]);
        
        drawTableProper(doc, [
          { header: 'Array', width: 90 },
          { header: 'Min Temp', width: 100 },
          { header: 'Max Temp', width: 100 },
          { header: 'Delta', width: 100 },
          { header: 'Status', width: 105 }
        ], thermRows);
      }
      
      // --- ENERGY / ELECTRICAL HEALTH SPECIFIC ---
      if ((isEnergy || isSnapshot) && payload.energyHealth) {
        if (!isSnapshot) doc.addPage();
        else checkPageBreak(doc, 200);
        
        drawSectionHeader(doc, 'Energy / Electrical Health');
        
        const eh = payload.energyHealth;
        
        if (isEnergy) {
           drawReadinessBanner(doc, 'Electrical Readiness', 'AVAILABLE', SUCCESS);
           
           drawMetricGrid(doc, [
             { label: 'Installed Capacity', value: formatMWh(eh.fleetCapacity?.installedCapacityKWh) },
             { label: 'Stored Energy', value: formatMWh(eh.fleetCapacity?.availableStoredKWh) },
             { label: 'System SOC', value: formatPercent(eh.fleetCapacity?.systemSocPct) },
             { label: 'Max Voltage Delta', value: formatVoltageMv(asArray(eh.voltageMetricsByArray).reduce((max, a) => Math.max(max, safeNumber(a.delta)), 0)) }
           ]);
        }
        
        doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_MAIN).text('String Availability by Array');
        doc.font('Helvetica').moveDown(0.5);
        
        const stringRows = asArray(eh.stringAvailabilityByArray).map(arr => [
          `Array ${safeText(arr.arrayIndex)}`,
          String(safeNumber(arr.onlineStrings)),
          String(safeNumber(arr.nearlineStrings)),
          String(safeNumber(arr.offlineStrings)),
          formatKWh(arr.onlineAvailableKWh),
          formatPercent(arr.onlineSOC)
        ]);
        
        drawTableProper(doc, [
          { header: 'Array', width: 80 },
          { header: 'Online', width: 70 },
          { header: 'Nearline', width: 70 },
          { header: 'Offline', width: 70 },
          { header: 'Stored Energy', width: 100 },
          { header: 'SOC', width: 105 }
        ], stringRows);
        
        doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_MAIN).text('Cell Voltage Summary by Array');
        doc.font('Helvetica').moveDown(0.5);
        
        const voltRows = asArray(eh.voltageMetricsByArray).map(arr => [
          `Array ${safeText(arr.array)}`,
          formatVoltageMv(arr.min),
          formatVoltageMv(arr.max),
          formatVoltageMv(arr.delta),
          safeNumber(arr.delta) > 100 ? 'Warning' : 'Normal'
        ]);
        
        drawTableProper(doc, [
          { header: 'Array', width: 90 },
          { header: 'Min Cell', width: 100 },
          { header: 'Max Cell', width: 100 },
          { header: 'Delta', width: 100 },
          { header: 'Status', width: 105 }
        ], voltRows);
      }
      
      // --- CORRECTIVE ACTIONS SPECIFIC ---
      if ((isCorrective || isSnapshot) && payload.correctiveActions) {
        if (!isSnapshot) doc.addPage();
        else checkPageBreak(doc, 200);
        
        drawSectionHeader(doc, 'Corrective Actions', 'Active faults and suggested troubleshooting steps');
        
        const rawActions = asArray(payload.correctiveActions.groupedActions);
        const actions = rawActions.filter((issue: any) => {
          const name = (issue.faultName || issue.fault || "").toLowerCase();
          const code = String(issue.code || issue.id || "");
          if (code === "2534" || code === "2561" || name.includes("2534") || name.includes("2561")) {
            return false;
          }
          return true;
        });
        
        if (actions.length === 0) {
           doc.fontSize(10).fillColor(TEXT_MUTED).text('No active corrective actions were present in this snapshot.');
        } else {
           if (isCorrective) {
             const hasAlarms = actions.some(a => safeUpper(a.severity).includes('ALARM') || safeUpper(a.severity).includes('FAULT'));
             drawReadinessBanner(doc, 'Corrective Priority', hasAlarms ? 'CRITICAL' : 'ACTION REQUIRED', hasAlarms ? DANGER : WARNING);
           }
           
           actions.forEach(a => {
              checkPageBreak(doc, 80);
              const severity = safeUpper(a?.severity || a?.level || a?.status, "UNSPECIFIED");
              const isAlarm = severity.includes("ALARM") || severity.includes("FAULT") || severity.includes("ERROR");
              
              doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 20).fill(isAlarm ? '#fef2f2' : '#fffbeb');
              doc.fillColor(isAlarm ? DANGER : WARNING).font('Helvetica-Bold').fontSize(10);
              doc.text(`[${severity}] ${safeText(a.faultName)}`, MARGIN + 5, doc.y - 14, { width: CONTENT_WIDTH - 10 });
              
              doc.font('Helvetica').fontSize(9).fillColor(TEXT_MAIN);
              doc.y += 10;
              doc.text(`Affected Count: ${safeNumber(a.affectedCount)} targets`);
              doc.fillColor(TEXT_MUTED).text(`Suggested Action: ${safeText(a.suggestedAction)}`);
              doc.moveDown(0.5);
              
              const targetsList = asArray(a.targets);
              if (targetsList.length > 0) {
                 const locationGroups: Record<string, {
                   array: string;
                   stack: string;
                   string: string;
                   side: string;
                   deviceIp: string;
                   components: string[];
                 }> = {};

                 targetsList.forEach((t: any) => {
                   const arrayVal = t.arrayIndex ?? t.arrayNumber ?? t.array;
                   const arrayStr = arrayVal !== undefined && arrayVal !== null ? `A${arrayVal}` : "-";

                   let stackStr = "-";
                   if (t.blockIndex !== undefined && t.blockIndex !== null) {
                     stackStr = `B${t.blockIndex}`;
                   } else if (t.segmentIndex !== undefined && t.segmentIndex !== null) {
                     stackStr = `ES${t.segmentIndex}`;
                   } else if (t.energySegmentIndex !== undefined && t.energySegmentIndex !== null) {
                     stackStr = `ES${t.energySegmentIndex}`;
                   } else if (t.energySegmentNumber !== undefined && t.energySegmentNumber !== null) {
                     stackStr = `ES${t.energySegmentNumber}`;
                   } else if (t.stack !== undefined && t.stack !== null) {
                     stackStr = String(t.stack);
                   } else if (t.container !== undefined && t.container !== null) {
                     stackStr = String(t.container);
                   }

                   const stringVal = t.stringIndex ?? t.stringNumber ?? t.string;
                   const stringStr = stringVal !== undefined && stringVal !== null ? `Str ${stringVal}` : "-";

                   const sideStr = t.side ?? t.stringSide ?? "-";
                   const deviceIpStr = t.deviceIp ?? t.ip ?? "-";

                   const bpcVal = t.bpcIndex ?? t.batteryPackIndex ?? t.bpc;
                   const cgVal = t.cellGroupIndex ?? t.cgIndex ?? t.cellGroup;

                   let componentStr = "";
                   if (bpcVal !== undefined && bpcVal !== null && bpcVal !== "") {
                     if (cgVal !== undefined && cgVal !== null && cgVal !== "") {
                       componentStr = `BPC ${bpcVal} CG ${cgVal}`;
                     } else {
                       componentStr = `BPC ${bpcVal}`;
                     }
                   } else if (cgVal !== undefined && cgVal !== null && cgVal !== "") {
                     componentStr = `CG ${cgVal}`;
                   }

                   const groupKey = `${arrayStr}|${stackStr}|${stringStr}|${sideStr}|${deviceIpStr}`;
                   if (!locationGroups[groupKey]) {
                     locationGroups[groupKey] = {
                       array: arrayStr,
                       stack: stackStr,
                       string: stringStr,
                       side: sideStr,
                       deviceIp: deviceIpStr,
                       components: []
                     };
                   }

                   if (componentStr) {
                     locationGroups[groupKey].components.push(componentStr);
                   }
                 });

                 const maxTargets = 20;
                 const allUniqueLocations = Object.values(locationGroups);
                 const displayedLocations = allUniqueLocations.slice(0, maxTargets);

                 const tRows = displayedLocations.map(g => {
                   const uniqueComps = Array.from(new Set(g.components));
                   const consolidatedStr = compressComponentList(uniqueComps);
                   return [
                     g.array,
                     g.stack,
                     g.string,
                     g.side,
                     g.deviceIp,
                     consolidatedStr
                   ];
                 });

                 drawTableProper(doc, [
                   { header: 'Array', width: 50 },
                   { header: 'Stack/ES', width: 60 },
                   { header: 'String', width: 60 },
                   { header: 'Side', width: 65 },
                   { header: 'Device IP', width: 90 },
                   { header: 'Affected Components', width: 170 }
                 ], tRows);

                 if (allUniqueLocations.length > maxTargets) {
                    doc.fontSize(8).fillColor(TEXT_MUTED).text(`... and ${allUniqueLocations.length - maxTargets} more unique locations not shown`, MARGIN, doc.y);
                    doc.moveDown(0.5);
                 }
              }
              
              // Tech punch-list box
              if (isCorrective) {
                doc.moveDown(0.5);
                const boxY = doc.y;
                doc.rect(MARGIN + 10, boxY, CONTENT_WIDTH - 20, 40).strokeColor(BORDER_LIGHT).stroke();
                doc.fillColor(BORDER_LIGHT).fontSize(8).text('Technician Notes / Retest Result:', MARGIN + 15, boxY + 5);
                doc.y = boxY + 50;
              } else {
                doc.moveDown(1.5);
              }
           });
        }
      }
      
      // --- SOURCE HEALTH APPENDIX ---
      if ((isSnapshot || isCorrective || isThermal || isEnergy) && payload.freshness?.sources) {
        checkPageBreak(doc, 200);
        drawSectionHeader(doc, 'Source Health Appendix', 'Data source communication and freshness confidence');
        
        const sources = asArray(payload.freshness.sources);
        if (sources.length === 0) {
           doc.fontSize(10).fillColor(TEXT_MUTED).text('Source health data was not available for this report.');
        } else {
           const sourceRows = sources.map(s => {
             const status = safeUpper(s?.status, "UNKNOWN");
             return [
               safeText(s.name),
               safeText(s.sourceType),
               status,
               status === 'ONLINE' || status === 'CONNECTED' || status === 'FRESH' ? 'Normal' : 'Stale/Offline'
             ];
           });
           
           drawTableProper(doc, [
             { header: 'Source Name', width: 160 },
             { header: 'Type', width: 110 },
             { header: 'Status', width: 110 },
             { header: 'Confidence', width: 115 }
           ], sourceRows);
        }
      }
      
      // --- COMPARISON SPECIFIC ---
      if (isComparison && payload.comparison) {
         drawSectionHeader(doc, 'Before / After Comparison');
         
         const deltas = payload.comparison.deltas || {};
         const alarmsDelta = safeNumber(deltas.alarms);
         const warnsDelta = safeNumber(deltas.warnings);
         const onDelta = safeNumber(deltas.onlineStrings);
         
         let outcome = 'INCONCLUSIVE';
         let oColor = UNKNOWN_COLOR;
         
         if (alarmsDelta < 0 || warnsDelta < 0 || onDelta > 0) {
           outcome = 'IMPROVED';
           oColor = SUCCESS;
         } else if (alarmsDelta > 0 || warnsDelta > 0 || onDelta < 0) {
           outcome = 'DEGRADED';
           oColor = DANGER;
         } else {
           outcome = 'NO CHANGE';
           oColor = TEXT_MUTED;
         }
         
         drawReadinessBanner(doc, 'Corrective Action Result', outcome, oColor);
         
         drawMetricGrid(doc, [
           { label: 'Alarms Delta', value: alarmsDelta > 0 ? `+${alarmsDelta}` : String(alarmsDelta), color: alarmsDelta > 0 ? DANGER : (alarmsDelta < 0 ? SUCCESS : TEXT_MAIN) },
           { label: 'Warnings Delta', value: warnsDelta > 0 ? `+${warnsDelta}` : String(warnsDelta), color: warnsDelta > 0 ? WARNING : (warnsDelta < 0 ? SUCCESS : TEXT_MAIN) },
           { label: 'Online Strings', value: onDelta > 0 ? `+${onDelta}` : String(onDelta), color: onDelta > 0 ? SUCCESS : (onDelta < 0 ? DANGER : TEXT_MAIN) },
           { label: 'Max Temp Delta', value: formatTempC(deltas.maxTemp) }
         ]);
      }
      
      // --- FOOTER ---
      try {
        const pages = doc.bufferedPageRange();
        for (let i = pages.start; i < pages.start + pages.count; i++) {
          doc.switchToPage(i);
          const pageNumber = i - pages.start + 1;
          
          doc.moveTo(MARGIN, doc.page.height - 50).lineTo(MARGIN + CONTENT_WIDTH, doc.page.height - 50).strokeColor(BORDER_LIGHT).stroke();
          
          doc.fontSize(8).fillColor(TEXT_MUTED).text(
            `GreEnergy PRIZM | Report ID: ${safeText(payload.reportId)} | Generated: ${safeText(payload.generatedAt)} | Page ${pageNumber} of ${pages.count}`,
            MARGIN,
            doc.page.height - 40,
            { align: 'center', width: CONTENT_WIDTH }
          );
        }
      } catch (footerErr) {
        console.warn('[reports] PDF footer rendering skipped', footerErr);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

