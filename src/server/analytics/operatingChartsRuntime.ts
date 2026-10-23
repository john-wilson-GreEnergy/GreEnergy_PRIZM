import path from 'node:path';
import {OperatingChartsStore} from './OperatingChartsStore';
export const operatingChartsStore=new OperatingChartsStore(path.resolve('.prizm-data','operating-charts'));
export const operatingChartsEnabled=()=>process.env.PRIZM_OPERATING_CHARTS!=='false';
