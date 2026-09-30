import assert from "node:assert/strict";
import { repairFinalCorrectiveActionsFromSnapshot } from "../prizmDataCoordinator";
import { NOTIFICATION_CATALOG } from "./notificationCatalog";

let report = {positiveContactorClosed:false,negativeContactorClosed:false,contactorsCloseExpected:true,measuredStringVoltage:1300,dcBusVoltage:1280};
const notification = (code:string) => ({notificationType:{notificationCategory:code.startsWith("1")?"ALARM":"WARNING",notificationId:code},notificationSource:{endpointType:"STRING",arrayIndex:1,stringIndex:1}});
async function run(extra:any[]=[]){
  const snapshot:any={normalized:{strings:[{...report,arrayNumber:1,stringNumber:1,communicating:true,timestampUtc:new Date().toISOString()}],correctiveActions:[]},rollups:{},rawSources:{arrayNotifications:{1:{data:{notification:[notification("2534"),...extra]}}}}};
  repairFinalCorrectiveActionsFromSnapshot(snapshot);
  assert.equal(snapshot.rawSources.arrayNotifications[1].data.notification.length,1+extra.length,"raw warnings must remain available");
  return snapshot;
}
{
  let snapshot=await run();
  assert.equal(snapshot.normalized.correctiveActions.length,0);
  assert.equal(snapshot.debug.contactorOpenAssessments[0].classification,"waiting-for-voltage-alignment");
  report={...report,dcBusVoltage:1295};
  snapshot=await run();
  assert.equal(snapshot.normalized.correctiveActions.length,1,"unexpected open must be visible");
  report={...report,contactorsCloseExpected:false};
  assert.equal((await run()).normalized.correctiveActions.length,0,"intentional open is not an actionable fault");
  snapshot=await run([notification("1024")]);
  assert.equal(snapshot.normalized.correctiveActions.length,2,"active alarm and open warning must both survive");
  assert.equal(NOTIFICATION_CATALOG["2534"].exportVisibility,"include");
}
console.log("Contactor corrective aggregation preserves raw events and distinguishes waits from actionable warnings");
