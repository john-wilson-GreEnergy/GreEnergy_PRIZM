export interface AnalyticsRow {
  array:number; target:string; position:number; value:number|null; low?:number|null; high?:number|null;
  observedAt:number|null; quality:'fresh'|'stale'|'unknown'; source:string;
}
export interface AnalyticsMetric {id:string; label:string; unit:string; rows:AnalyticsRow[]}
export interface SiteAnalytics {site:string; preparedAt:number; metrics:AnalyticsMetric[]; historical:false; operatingCharts?:import('./operatingCharts').OperatingCharts}
