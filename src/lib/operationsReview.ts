import type {NotificationReview} from '../server/notifications/notificationReview';
/** Presentation switches only. Neither flag grants access to telemetry or controls. */
export function operationsLayoutEnabled(search=typeof window==='undefined'?'':window.location.search,
  defaultEnabled=typeof document!=='undefined'&&document.documentElement.dataset.prizmOperations==='enabled'){
  const mode=new URLSearchParams(search).get('ui');
  if(typeof document!=='undefined'&&document.documentElement.dataset.prizmRemoteReadOnly==='true')return true;
  return mode==='legacy'?false:mode==='operations'||defaultEnabled;
}
export function isLocalOperationsReview(){
  return typeof document!=='undefined'&&document.documentElement.dataset.prizmLocalReview==='read-only';
}
export function legacyLayoutUrl(href:string){const url=new URL(href);url.searchParams.set('ui','legacy');return url.toString();}

/** Preserve the canonical object and its counts; only describe transport freshness. */
export function correctiveReviewPresentation(state:{
  snapshot?:{normalized?:{notificationReview?:NotificationReview};liveStatus?:{stale?:boolean}}|null;
  error?:unknown;dataQualityWarning?:string|null;isInitialLoading:boolean;isPollingEnabled:boolean;isTerminated:boolean;
}){
  const {snapshot,error,dataQualityWarning,isInitialLoading,isPollingEnabled,isTerminated}=state;
  return {
    review:snapshot?.normalized?.notificationReview,
    stale:Boolean(error||dataQualityWarning||!isPollingEnabled||isTerminated||snapshot?.liveStatus?.stale),
    loading:isInitialLoading,
    error:isTerminated?'Connection terminated. Retained evidence is not current.':!isPollingEnabled?'Polling paused. Retained evidence is not current.':error?'Latest update failed. Retained evidence is shown; check connection health.':dataQualityWarning||undefined,
  };
}
