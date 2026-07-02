const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'src/components/SiteDistributionDashboard.tsx');
if (!fs.existsSync(target)) {
  throw new Error(`Missing target file: ${target}`);
}

let src = fs.readFileSync(target, 'utf8');

const helper = `
  const stringListStatusBuckets = snapshot?.rollups?.stringSummary?.buckets || null;
  const stringListStatusRows =
    snapshot?.normalized?.strings ||
    snapshot?.rollups?.stringSummary?.tableRows ||
    strings ||
    [];

  const countStringBucket = (bucket: string): number =>
    stringListStatusRows.filter((row: any) => row?.bucket === bucket).length;

  const stringListStatusCounts = {
    total: Number(stringListStatusBuckets?.online ?? NaN) >= 0
      ? Number(stringListStatusBuckets.online || 0) +
        Number(stringListStatusBuckets.nearline || 0) +
        Number(stringListStatusBuckets.offline || 0) +
        Number(stringListStatusBuckets.notCommunicating || 0) +
        Number(stringListStatusBuckets.unknown || 0)
      : (stringListStatusRows.length || strings.length),
    online: Number(stringListStatusBuckets?.online ?? NaN) >= 0
      ? Number(stringListStatusBuckets.online || 0)
      : countStringBucket('online'),
    nearline: Number(stringListStatusBuckets?.nearline ?? NaN) >= 0
      ? Number(stringListStatusBuckets.nearline || 0)
      : countStringBucket('nearline'),
    offline: Number(stringListStatusBuckets?.offline ?? NaN) >= 0
      ? Number(stringListStatusBuckets.offline || 0)
      : countStringBucket('offline'),
    notCommunicating: Number(stringListStatusBuckets?.notCommunicating ?? NaN) >= 0
      ? Number(stringListStatusBuckets.notCommunicating || 0)
      : countStringBucket('notCommunicating')
  };
`;

if (!src.includes('const stringListStatusCounts = {')) {
  const marker = '  const strings = data?.rows || [];\n';
  if (!src.includes(marker)) {
    throw new Error('Could not find strings declaration marker.');
  }
  src = src.replace(marker, marker + helper + '\n');
}

// Replace the existing five KPI cards at the top of the String List / distribution view.
const startMarker = '        {/* ROLLUPS KEY-PERFORMANCE INDICATORS */}';
const endMarker = '      </div>\n\n      {/* WORKSPACE PANELS MATRIX */}';
const start = src.indexOf(startMarker);
const end = src.indexOf(endMarker, start);

if (start === -1 || end === -1) {
  throw new Error('Could not find KPI row block boundaries.');
}

const newKpi = `        {/* ROLLUPS KEY-PERFORMANCE INDICATORS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-8 gap-3">
          <div className="bg-prizm-surface-strong p-2.5 rounded border border-prizm-border/60">
            <span className="text-[9px] text-prizm-text-muted uppercase block">Total Strings</span>
            <span className="font-bold text-base text-prizm-text">{stringListStatusCounts.total}</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-emerald-500/30 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Online</span>
              <span className="font-bold text-base text-emerald-600">{stringListStatusCounts.online}</span>
            </div>
            <span className="text-[9px] text-emerald-600 leading-tight">STRING STATUS</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-cyan-500/30 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Nearline</span>
              <span className="font-bold text-base text-cyan-600">{stringListStatusCounts.nearline}</span>
            </div>
            <span className="text-[9px] text-cyan-600 leading-tight">STRING STATUS</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-amber-500/30 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Offline</span>
              <span className="font-bold text-base text-amber-500">{stringListStatusCounts.offline}</span>
            </div>
            <span className="text-[9px] text-amber-600 leading-tight">STRING STATUS</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-slate-500/40 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Not Comm</span>
              <span className="font-bold text-base text-slate-500">{stringListStatusCounts.notCommunicating}</span>
            </div>
            <span className="text-[9px] text-slate-500 leading-tight">STRING STATUS</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-prizm-border/60 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Listed Rows</span>
              <span className="font-bold text-base text-prizm-info">{filteredStrings.length}</span>
            </div>
            <span className="text-[9px] text-prizm-text-muted leading-tight">FILTERED VIEW</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-prizm-border/60 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Warns / Alarms</span>
              <span className="font-bold text-base">
                <span className="text-prizm-warning">{siteRangeMetrics.warningCount}</span>
                <span className="text-prizm-text-muted"> / </span>
                <span className="text-prizm-danger">{siteRangeMetrics.alarmCount}</span>
              </span>
            </div>
            <span className="text-[9px] text-prizm-text-muted leading-tight">FILTERED VIEW</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-prizm-border/60 col-span-2 sm:col-span-3 md:col-span-5 xl:col-span-1" id="site-range-limits-panel">
            <span className="text-[9px] text-prizm-text-muted uppercase block font-extrabold border-b border-prizm-border/40 pb-1 mb-1">Range Limits</span>

            <div className="text-[10px] space-y-2 mt-1 text-prizm-text">
              <div className="space-y-0.5">
                <span className="text-[8px] text-prizm-text-muted block uppercase font-bold">Voltage Min/Avg/Max</span>
                <div className="font-mono font-bold text-prizm-info flex justify-between">
                  <span>Vdc:</span>
                  <span>
                    {siteRangeMetrics.voltMin !== null ? siteRangeMetrics.voltMin : '--'} / {siteRangeMetrics.voltAvg !== null ? siteRangeMetrics.voltAvg : '--'} / {siteRangeMetrics.voltMax !== null ? siteRangeMetrics.voltMax : '--'}
                  </span>
                </div>
              </div>

              <div className="space-y-0.5 border-t border-prizm-border/20 pt-1">
                <span className="text-[8px] text-prizm-text-muted block uppercase font-bold font-mono">Temp Min/Avg/Max</span>
                <div className="font-mono font-semibold text-orange-400 flex flex-col gap-0.5">
                  <div className="flex justify-between font-bold">
                    <span>C:</span>
                    <span>
                      {siteRangeMetrics.tempMin !== null ? siteRangeMetrics.tempMin.toFixed(1) : '--'} /{' '}
                      {siteRangeMetrics.tempAvg !== null ? siteRangeMetrics.tempAvg.toFixed(1) : '--'} /{' '}
                      {siteRangeMetrics.tempMax !== null ? siteRangeMetrics.tempMax.toFixed(1) : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[8px] text-prizm-text-muted">
                    <span>F:</span>
                    <span>
                      {siteRangeMetrics.tempMin !== null ? Math.round(celsiusToFahrenheit(siteRangeMetrics.tempMin)) : '--'} /{' '}
                      {siteRangeMetrics.tempAvg !== null ? Math.round(celsiusToFahrenheit(siteRangeMetrics.tempAvg)) : '--'} /{' '}
                      {siteRangeMetrics.tempMax !== null ? Math.round(celsiusToFahrenheit(siteRangeMetrics.tempMax)) : '--'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>`;

src = src.slice(0, start) + newKpi + src.slice(end);

fs.writeFileSync(target, src);
console.log('patched SiteDistributionDashboard KPI row to show total/online/nearline/offline/not-comm string buckets');
