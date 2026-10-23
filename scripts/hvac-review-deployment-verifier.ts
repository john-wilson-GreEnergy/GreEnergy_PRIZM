// Pure read-only acceptance: validates the published model, never queries devices.
import assert from 'node:assert/strict';
import {projectNotificationHvacs,auditNotificationGuidance,attachFleetHvacs} from '../src/server/notifications/hvacIssueReview';
import type {NotificationReview} from '../src/server/notifications/notificationReview';
import type {FleetDetails} from '../src/core/fleet/details';
export {buildBlockPowerFlow} from '../src/server/fleet/blockPowerFlow';
export {FleetBroker,parseSummary} from '../src/server/fleet/FleetBroker';

export function verifyHvacReview(review:NotificationReview,issues:FleetDetails['issues']){
  assert(review?.hvacReview,'Published HVAC review missing');
  assert(Array.isArray(review.guidanceGaps),'Published documentation audit missing');
  assert.deepEqual(review.hvacReview,projectNotificationHvacs(review));
  assert.deepEqual(review.guidanceGaps,auditNotificationGuidance(review));
  const expected=structuredClone(issues);attachFleetHvacs(expected);
  assert.deepEqual(issues.hvacReview,expected.hvacReview);
  for(const model of [review.hvacReview,issues.hvacReview!]){
    assert.equal(new Set(model.devices.map(t=>t.id)).size,model.devices.length);
    for(const target of model.devices){
      assert(Number.isSafeInteger(target.unit)&&target.unit!>0);
      assert(!target.issues.some(i=>/\b(FSS|fire suppression|smoke|gas sensor)\b/i.test(`${i.code} ${i.title}`)));
    }
  }
  return {canonicalMappedHvacTargets:review.hvacReview.devices.length,
    fleetMappedHvacTargets:issues.hvacReview!.devices.length,
    unresolvedTargets:issues.hvacReview!.unassigned.length,
    guidanceGaps:review.guidanceGaps.length,partial:issues.hvacReview!.partial};
}
