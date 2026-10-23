import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import DeferredStringTimeline from './DeferredStringTimeline';
import PcsOperationalTimeline from './PcsOperationalTimeline';

const closed=renderToStaticMarkup(<DeferredStringTimeline arrays={[1,2]}/>);
assert.match(closed,/Operational history &amp; incident timeline/);
assert.doesNotMatch(closed,/Load \/ refresh review|Loading history tools|<svg|<section/);
assert.doesNotMatch(closed,/<details[^>]*\bopen/);
const embedded=renderToStaticMarkup(<PcsOperationalTimeline arrays={[1,2]} embedded/>);
assert.doesNotMatch(embedded,/<details|<summary/);
assert.match(embedded,/Load \/ refresh review/);
assert.match(embedded,/This review never sends equipment commands/);
assert.match(embedded,/Array 1/);assert.match(embedded,/Array 2/);
console.log('Deferred string history: closed startup, no initial chart/review render, embedded controls and read-only wording passed.');
