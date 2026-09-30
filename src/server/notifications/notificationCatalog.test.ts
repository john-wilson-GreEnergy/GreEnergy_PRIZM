import assert from 'node:assert/strict';
import {STRING_CONTROLLER_FAULT_CATALOG as documented} from './stringControllerFaultCatalog';
import {NOTIFICATION_CATALOG as catalog,getNotificationCatalogEntry} from './notificationCatalog';
import {describeBessStatusCode,classifyBessStatusCode} from '../../lib/bessStatusCodes';
import {buildNotificationReview} from './notificationReview';

// Independent transcription of the table IDs, by printed page. No range-derived expectations.
const pages: Record<number,string>={
  41:'1001 1002 1003 1004 1005 1006',
  42:'1007 1008 1009 1010 1011 1012 1013 1014 1015 1016 1017 1018 1019 1020',
  43:'1021 1022 1023 1024 1025 1026 1027 1028 1029 1030 1046 1047 1048 1049 1050',
  44:'1051 1052 1053 1054 1055 1056 1057 1531 1532 1533 1558 1559 1560 2001 2002 2003 2004 2005',
  45:'2006 2007 2008 2009 2010 2011 2012 2013 2014 2015 2016 2017 2018 2019',
  46:'2020 2021 2022 2023 2024 2025 2026 2027 2028 2029 2030 2046 2047 2048 2049 2050 2051',
  47:'2052 2053 2054 2055 2056 2057 2534 2535 3001 3002 3003 3004 3005 3006 3007 3008 3009',
  48:'3010 3011 3012 3013 3014 3015 3016 3017 3018 3019 3020 3021 3022 3023 3024',
  49:'3025 3026 3027 3028 3029 3030 3046 3047 3048 3049 3050 3051 3052 3053 3054 3055 3056 3057',
  50:'3536 3537 3538 3539 3540 3541 8001 8004 8010 8014 8019 8020 8042 8043 8044 8045',
  51:'9001 9004 9010 9014 9019 9020 9042 9043 9044 9045',
};
const expected=Object.values(pages).flatMap(page=>page.split(' '));
assert.equal(expected.length,160);
assert.deepEqual(Object.keys(documented).sort(),expected.sort());
assert.equal(Object.keys(catalog).length,163);
for (const [page,ids] of Object.entries(pages)) for (const code of ids.split(' ')) {
  const entry=catalog[code];
  assert.equal(entry.source?.page,Number(page),code);
  assert(entry.description && entry.clearingDescription && entry.component && entry.defaultSeverity,code);
  assert.equal(describeBessStatusCode(code),entry.name,code);
  assert.equal(classifyBessStatusCode(code),entry.defaultSeverity.toUpperCase(),code);
}
for (const code of ['1031','1042','2031','2042','3031','3042','8002','9002','9999']) assert.equal(getNotificationCatalogEntry(code),null,`Do not invent ${code}`);
for (const code of ['2073','2074','2561']) { assert(catalog[code]); assert.equal(catalog[code].source,undefined); }
for (const code of ['1032','1071','2032','2071','2921']) assert(!describeBessStatusCode(code).startsWith('Code '),'Keep legacy names outside the manual');
for (const code of ['3023','3024','2561']) {assert.equal(catalog[code].summaryVisibility,'rollupOnly');assert.equal(catalog[code].exportVisibility,'exclude');}
assert.equal(catalog['1003'].clearBehavior,'manual');
assert.equal(catalog['2003'].clearBehavior,'condition');
assert.equal(catalog['8001'].clearBehavior,'permanent-record');
assert.equal(catalog['9001'].clearBehavior,'condition');
assert.notEqual(catalog['8001'].family,catalog['1001'].family,'Warranty must not suppress ordinary voltage notifications');
assert.match(catalog['1047'].clearingDescription!,/even if the string goes offline/);
assert.match(catalog['1050'].description!,/trigger message 5/);
assert(!catalog['2050'].description!.includes('trigger message 5'));
assert.match(catalog['3046'].clearingDescription!,/PCS turning on/);
assert(!catalog['2046'].clearingDescription!.includes('PCS turning on'));
assert(catalog['2008'].sourceNotes?.length); assert(catalog['3003'].sourceNotes?.length);
assert.match(catalog['8042'].description!,/During charging/); assert.match(catalog['9045'].description!,/During discharging/);
const at='2026-09-28T16:00:00Z';
const all=buildNotificationReview(expected.map(code=>({code,arrayNumber:1,stringNumber:1})),at);
assert.equal(all.groups.length,160); assert.equal(all.totals.occurrences,160);
for (const group of all.groups) {
  assert.equal(group.severity,catalog[group.code].defaultSeverity);
  assert.equal(group.documentedClearing,catalog[group.code].clearingDescription);
  assert.equal(group.catalogSource?.page,catalog[group.code].source?.page);
}
assert.equal(buildNotificationReview([{code:'8001',severity:'warning'}],at).groups[0].severity,'warning','Source severity wins');
assert.equal(buildNotificationReview([{code:'8001',severity:'unknown'}],at).groups[0].severity,'unknown','Explicit unknown stays unknown');
assert.equal(buildNotificationReview([{code:'9999'}],at).groups[0].severity,'unknown');
assert.equal(all.groups.find(g=>g.code==='3536')?.section,'availability');
console.log('All 160 documented codes, page provenance, severity, clearing, shared labels and preservation checks passed');
