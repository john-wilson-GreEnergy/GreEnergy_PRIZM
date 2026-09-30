import type {NotificationCatalogEntry} from './notificationCatalog';

// Curated from the supplied Software User Interface Operation Manual, printed pp. 41–51.
// Only explicitly listed codes are generated. Definitions are not detection/clearing rules.
type Definition = {suffix:number; name:string; component:string; description:string; clears:string};
const definitions: Definition[] = [];
const add = (suffix:number,name:string,component:string,description:string,clears:string) =>
  definitions.push({suffix,name,component,description,clears});
const threshold = 'the configured threshold';
for (const [suffix,name,component,subject,quantity,high] of [
  [1,'CellGroup High Voltage','Cell Group','A cell group','voltage',true],
  [2,'Battery Pack High Voltage','BPC','A battery pack','voltage',true],
  [3,'String High Voltage','String','A string','voltage',true],
  [4,'CellGroup Low Voltage','Cell Group','A cell group','voltage',false],
  [5,'Battery Pack Low Voltage','BPC','A battery pack','voltage',false],
  [6,'String Low Voltage','String','A string','voltage',false],
  [10,'CellGroup High Temperature','Cell Group','A cell group','temperature',true],
  [11,'Battery Pack High Temperature','BPC','A battery pack','temperature',true],
  [12,'String High Temperature','String','A string','temperature',true],
  [13,'Enclosure High Temperature','Enclosure','An enclosure','temperature',true],
  [14,'CellGroup Low Temperature','Cell Group','A cell group','temperature',false],
  [15,'Battery Pack Low Temperature','BPC','A battery pack','temperature',false],
  [16,'String Low Temperature','String','A string','temperature',false],
  [17,'Enclosure Low Temperature','Enclosure','An enclosure','temperature',false],
] as const) add(suffix,name,component,`${subject} reported ${quantity} at or ${high?'above':'below'} ${threshold}.`,
  `The reported ${quantity} ${high?'falls below':'rises above'} ${threshold}.`);
for (const [suffix,name,component,subject,quantity] of [
  [7,'CellGroup Voltage Delta','Cell Group','cell group','voltage'],
  [8,'Battery Pack Voltage Delta','BPC','battery pack','voltage'],
  [9,'String Voltage Delta','String','string','voltage'],
  [18,'CellGroup Temperature Delta','Cell Group','cell group','temperature'],
  [57,'Battery Pack Temperature Delta','BPC','battery pack','temperature'],
] as const) add(suffix,name,component,`The difference between the highest and lowest ${subject} ${quantity} is at or above ${threshold}.`,
  `The ${quantity} difference falls below ${threshold}.`);
for (const [suffix,name,current] of [
  [19,'String High Charge Rate','charge'],[20,'String High Discharge Rate','discharge'],[21,'High Ground Current Leakage','ground'],
] as const) add(suffix,name,'String',`Detected ${current} current is at or above ${threshold}.`,`${current[0].toUpperCase()+current.slice(1)} current falls below ${threshold}.`);
add(22,'Measured Calculated Voltage Mismatch','BPC','Calculated battery pack voltages differ from voltage sensor measurements by more than the configured threshold.',`The calculated / measured voltage difference falls below ${threshold}.`);
for (const [suffix,name,component,receiver,sender] of [
  [23,'CGC Disconnect','Cell Group','BPC','CGC'],[24,'BPC Disconnect','BPC','string controller','BPC'],
  [25,'String Disconnect','String','BMS','string controller'],[26,'BMS Disconnect','BMS','EMS','BMS'],
  [29,'Relay Disconnect','Relay','EMS','relay'],
] as const) add(suffix,name,component,`The ${receiver} did not receive ${sender} communication before the configured timeout.`,`The ${receiver} receives ${sender} communication again.`);
for (const [suffix,name,component] of [[27,'PCS Disconnect','PCS'],[28,'Meter Disconnect','Meter']] as const)
  add(suffix,name,component,`EMS failed to connect to the ${component}.`,`EMS successfully connects to the ${component}.`);
add(30,'Low Connected String Count','String','Too few strings are connected.','A sufficient number of strings are connected.');
add(46,'Abnormal String Current','String','The PCS is off and showing no current, but abnormal string current is reported.',`String current falls below ${threshold}.`);
add(47,'String Current Delta','String','String current differs from average string current by a percentage greater than the configured threshold.',`The string current deviation falls below ${threshold}.`);
for (const [suffix,name,component] of [
  [48,'CGC','Cell Group'],[49,'BPC','BPC'],[50,'SC','String'],[51,'BMS/Phoenix','BMS'],[52,'EMS/Dragon','EMS'],
  [53,'Storage PCS','PCS'],[54,'PV PCS','PCS'],[55,'Meter','Meter'],[56,'Transformer','Transformer'],
] as const) add(suffix,`${name} Internal Error`,component,`${name} reported an internal error of the indicated severity.`,'The error is no longer reported.');

const source = (page:number) => ({document:'String Controller Fault Codes.pdf',section:'Software User Interface Operation Manual · Table of Notifications',page});
function pageFor(code:number): number {
  if (code<=1006) return 41;
  if (code<=1020) return 42;
  if (code<=1050) return 43;
  if (code<=2005) return 44;
  if (code<=2019) return 45;
  if (code<=2051) return 46;
  if (code<=3009) return 47;
  if (code<=3024) return 48;
  return 49;
}
const manualAlarmSuffixes = new Set([3,6,19,20,21,46,47,48,49,50,51,52,53,54,55,56]);
const slug = (name:string) => name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
export const STRING_CONTROLLER_FAULT_CATALOG: Record<string,NotificationCatalogEntry> = {};
for (const definition of definitions) {
  for (const [prefix,severity,label] of [[1000,'alarm','Alarm'],[2000,'warning','Warning'],[3000,'info','Info']] as const) {
    const code=String(prefix+definition.suffix);
    const manual=severity==='alarm' && manualAlarmSuffixes.has(definition.suffix);
    const notes:string[]=[];
    if (severity==='warning' && (definition.suffix<=26 || definition.suffix===29 || definition.suffix===46 || definition.suffix===47 || definition.suffix===57))
      notes.push('The manual labels this a Warning but refers to an alarm setting/timeout in its prose. Verify the configured value and hysteresis on the controller; no numeric threshold is inferred.');
    if (code==='3003') notes.push('The manual specifies an info threshold for detection but an alarm threshold for clearing. Verify controller behavior.');
    STRING_CONTROLLER_FAULT_CATALOG[code]={code,name:`${definition.name} ${label}`,family:slug(definition.name),component:definition.component,
      description:definition.description+(code==='1050'?' The manual identifies trigger message 5 as a mismatch between the two DC bus current sensors.':''),
      defaultSeverity:severity,clearBehavior:manual?'manual':'condition',
      clearingDescription:manual?`The manual specifies manual clearing${code==='1047'?', even if the string goes offline':''}.`:
        definition.clears+(code==='3046'?' The manual also lists the PCS turning on as a clearing condition.':''),
      source:source(pageFor(Number(code))),sourceNotes:notes.length?notes:undefined,summaryVisibility:'show',exportVisibility:'include'};
  }
}
const extras: [number,string,string,string,string, 'alarm'|'warning'|'info', 'manual'|'condition'][] = [
  [1531,'Duplicate Battery Pack Alarm','BPC','Two or more battery packs share an index or unique ID.','Duplicate battery pack IDs or indices are no longer detected.','alarm','condition'],
  [1532,'Smoke Alarm','Safety','EMS detected an activated smoke alarm on site.','The manual specifies manual clearing.','alarm','manual'],
  [1533,'Building Fire Alarm','Safety','EMS detected an activated building fire alarm on site.','The manual specifies manual clearing.','alarm','manual'],
  [1558,'Multiple Closed CGC Relays Alarm','BPC','More than one CGC relay is closed on a single battery pack.','The manual associates clearing with the AC battery E-Stop signal clearing. This is documentation, not an instruction to reset an E-Stop; verify the approved site procedure.','alarm','condition'],
  [1559,'String Fuse Open Alarm','String','A string fuse has opened.','The manual specifies manual clearing.','alarm','manual'],
  [1560,'E-Stop Signal Received Alarm','Safety','An E-Stop signal associated with an AC battery has been detected.','The manual specifies manual clearing.','alarm','manual'],
  [2534,'Contactor Open Warning','String','The string controller detected that a contactor has opened.','Both contactors close.','warning','condition'],
  [2535,'Open Door Warning','Enclosure','A container door is open.','The door is closed.','warning','condition'],
  [3536,'Contactor Error','String','The string controller detected that a contactor has opened.','Both contactors close.','info','condition'],
];
for (const [code,name,component] of [[3537,'BPC','BPC'],[3538,'CGC','Cell Group'],[3539,'String Controller','String'],[3540,'Phoenix','BMS'],[3541,'Dragon','EMS']] as const)
  extras.push([code,`${name} Booter Mode`,component,`${name} is stuck in Booter Mode.`,'The device leaves Booter Mode.','info','condition']);
for (const [id,name,component,description,clearingDescription,defaultSeverity,clearBehavior] of extras) {
  const code=String(id);
  STRING_CONTROLLER_FAULT_CATALOG[code]={code,name,component,description,clearingDescription,defaultSeverity,clearBehavior,
    family:slug(name.replace(/ (Alarm|Warning)$/,'')),source:source(id<2000?44:id<3000?47:50),summaryVisibility:'show',exportVisibility:'include'};
}
const warrantyDefinitions = definitions.filter(d=>[1,4,10,14,19,20].includes(d.suffix));
for (const [suffix,high,mode] of [[42,true,'Charging'],[43,true,'Discharging'],[44,false,'Charging'],[45,false,'Discharging']] as const)
  warrantyDefinitions.push({suffix,name:`CellGroup ${high?'High':'Low'} ${mode} Temperature`,component:'Cell Group',
    description:`During ${mode.toLowerCase()}, a cell group reported temperature at or ${high?'above':'below'} ${threshold}.`,
    clears:`Cell group temperature ${high?'falls below':'rises above'} ${threshold}.`});
for (const definition of warrantyDefinitions) {
  for (const [prefix,defaultSeverity,label] of [[8000,'alarm','Alarm'],[9000,'warning','Warning']] as const) {
    const code=String(prefix+definition.suffix);
    STRING_CONTROLLER_FAULT_CATALOG[code]={code,name:`${definition.name} Warranty ${label}`,family:`warranty-${slug(definition.name)}`,
      component:definition.component,description:definition.description,defaultSeverity,warranty:true,
      clearBehavior:prefix===8000?'permanent-record':'condition',clearingDescription:prefix===8000?'Warranty alarms are permanently recorded.':definition.clears,
      source:source(prefix===8000?50:51),summaryVisibility:'show',exportVisibility:'include'};
  }
}
