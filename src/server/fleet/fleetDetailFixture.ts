// Synthetic canonical data for offline tests and the explicitly labeled local preview.
export function fleetDetailFixture(stationCode:string,stamp:string,siteIndex=0){
  const identity={stationCode,blockIndex:1},strings:Record<string,unknown>[]=[],sensors:Record<string,unknown>[]=[],summaries:Record<string,unknown>[]=[],pcs:Record<string,unknown>[]=[],health:Record<string,unknown>[]=[];
  for(let array=1;array<=8;array++){
    summaries.push({arrayIndex:array,stringCount:40,onlineStringCount:array===3?38:40,outOfRotationCount:array===3?2:0,onlineSOC:48.2+siteIndex*14.2+(array-4)*.4,voltageVolt:1371+array*2});
    pcs.push({arrayNumber:array,pcsIndex:1,state:array===3?'Standby':'Grid feed',rotationStatus:'IN',acRealPowerKW:(siteIndex?720:1250)/8,fetchedAt:stamp,communicating:true,sourceOk:true,stale:false});
    health.push({name:`array-${array}-report`,ok:true,stale:false,lastUpdated:stamp});
    for(let string=1;string<=40;string++){
      const v=3260+array*2+string%7,t=23+siteIndex+array*.6+(string%5)*.2;
      strings.push({arrayNumber:array,stringNumber:string,communicating:true,minCellVoltageMv:v-7,avgCellVoltageMv:v,maxCellVoltageMv:v+9,
        minCellTempC:t-1.2,avgCellTempC:t,maxCellTempC:t+1.8});
    }
    for(let segment=1;segment<=20;segment++){
      const trip=siteIndex===0 && array===6 && segment===8;
      sensors.push({id:`${stationCode}-${array}-${segment}`,stationCode,blockIndex:1,displayLabel:`Array ${array} / ES${segment}`,segmentCommunicating:true,
        heatStatus:trip?'TRIPPED':'NOT_TRIPPED',heatCommunicating:true,heatTrippedTimestamp:trip?new Date(Date.parse(stamp)-120000).toISOString():null,
        findings:trip?['Heat sensor physical trip: TRIPPED']:[],source:'firstresponder_v1',sourcePath:'/turtle/firstresponder/data/enclosures[]',
        gasStatus:'NOT_TRIPPED',gasCommunicating:true,smokeStatus:'NOT_TRIPPED',smokeCommunicating:true,fireSuppressionStatus:'NOT_TRIPPED',fireSuppressionCommunicating:true});
    }
  }
  const target=(array:number,string:number)=>({id:`string:${array}:${string}`,label:`Array ${array} / String ${string}`});
  const groups=siteIndex===0?[
    {code:'1003',title:'String high voltage',category:'String / Cell',section:'equipment',severity:'alarm',targets:[target(1,2)]},
    {code:'2008',title:'Battery pack voltage delta',category:'String / Cell',section:'equipment',severity:'warning',targets:[target(2,4),target(2,8),target(4,11)]},
    {code:'HVAC',title:'Commanded cooling with low amperage',category:'HVAC / Environmental',section:'equipment',severity:'warning',targets:[{id:'hvac:5:6',label:'Array 5 / ES6 · HVAC 1'},{id:'hvac:7:9',label:'Array 7 / ES9 · HVAC 2'}]},
    {code:'CONTACTOR',title:'String contactors open',category:'String / Cell',section:'availability',severity:'warning',targets:[target(3,17),target(3,18)]},
  ]:[{code:'2008',title:'Battery pack voltage delta',category:'String / Cell',section:'equipment',severity:'warning',targets:[target(4,5),target(4,6)]},
    {code:'HVAC',title:'Cooling performance review',category:'HVAC / Environmental',section:'equipment',severity:'warning',targets:[{id:'hvac:2:3',label:'Array 2 / ES3 · HVAC 1'}]}];
  const view={siteIdentity:identity,liveStatus:{lastUpdated:stamp,stale:false,liveSucceeded:true,cacheUsed:false},arraySummary:summaries,pcsSummary:pcs,sourceHealth:health,
    notificationReview:{version:1,capturedAt:stamp,groups,sourceWarnings:[]}};
  return {view,snapshot:{siteIdentity:{...identity},normalized:{strings,sensors}}};
}
