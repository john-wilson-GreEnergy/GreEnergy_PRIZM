/** Presentation choice only. Authorization is enforced by the remote server. */
export function remoteExperience(device:{userAgent:string;maxTouchPoints:number}):'mobile'|'fleet'{
  return /iPhone|iPad|iPod|Android/i.test(device.userAgent)||
    /Macintosh/i.test(device.userAgent)&&device.maxTouchPoints>1?'mobile':'fleet';
}
export function remoteHome(){
  return '/'+remoteExperience(navigator)+'/';
}
/** Do not use viewport width: resizing a PC or rotating a phone must not switch apps. */
export function routeRemoteExperience(current:'mobile'|'fleet'){
  if(document.documentElement.dataset.prizmAdaptive!=='true')return false;
  const target=remoteHome();
  if(target===`/${current}/`)return false;
  window.location.replace(target+window.location.hash);
  return true;
}
