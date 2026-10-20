import React from 'react';
import {createRoot} from 'react-dom/client';
import {MobileApp} from './MobileApp';
import {FleetStore} from '../fleet/FleetStore';
import {routeRemoteExperience} from '../lib/remoteExperience';
import './mobile.css';
import '../components/operatingCharts.css';
import './landscape.css';
import './hvac.css';
import './responsive.css';
const hosted=window.location.pathname.startsWith('/mobile/')||window.location.pathname==='/review-mobile/';
const store=hosted?new FleetStore((input,init)=>{
 if(typeof input!=='string'||!input.startsWith('/api/fleet/'))return Promise.reject(Error('Mobile route unavailable'));
 return fetch('/mobile'+input,init);
}):undefined;
if(!routeRemoteExperience('mobile'))createRoot(document.getElementById('root')!).render(<MobileApp store={store} hosted={hosted}/>);
