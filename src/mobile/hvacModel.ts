import type {SiteView} from '../core/fleet/model';
import type {ThermalReadings} from '../server/thermal/thermalMetrics';
export interface MobileHvacUnit {
 id:string;array:number;segment:string;unit:number;label:string;
 mode:'Heating'|'Cooling'|'Idle'|'Unknown';quality:'Live'|'Stale'|'Unavailable';
 at:number;faults:string[];controllerAlerts:string[];readings:ThermalReadings;
}
export interface MobileHvac {units:MobileHvacUnit[];error:string|null;capturedAt:number|null}
export type MobileSite=SiteView&{mobileHvac?:MobileHvac};
