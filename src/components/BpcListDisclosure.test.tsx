import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {BpcListDisclosure} from './BpcListDisclosure';

const html=renderToStaticMarkup(<BpcListDisclosure label="Unique BPC list · 2 shown"><p>Device rows</p></BpcListDisclosure>);
assert(html.startsWith('<details class="prizm-bpc-list">'));
assert(!html.includes(' open'));
assert(html.includes('<summary>Unique BPC list'));
assert(html.includes('Device rows'));
for(const file of ['../fleet/BpcIssuesTable.tsx','./CorrectiveBpcWorkspace.tsx','../mobile/MobileApp.tsx']){
  const source=readFileSync(new URL(file,import.meta.url),'utf8');
  assert.equal((source.match(/<BpcListDisclosure /g)||[]).length,2,`${file}: inventory and device list use shared collapsed disclosure`);
}
console.log('PASS BPC disclosure: collapsed default, native keyboard/touch summary, preserved rows, all view integrations');
