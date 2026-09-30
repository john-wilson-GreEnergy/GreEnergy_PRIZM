import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import {SignInForm} from './SignInPage';
import {normalizeLocalEmail} from '../core/security/localEmail';
import {credentialTransportAllowed} from './accessClient';

assert.equal(normalizeLocalEmail('  Tech+field@EXAMPLE.COM '),'tech+field@example.com');
for (const invalid of [null, 3, 'name', 'a@@b.com', 'a b@example.com', 'a@-b.com', '.a@example.com', 'a..b@example.com', 'a@b..com', 'a@b', 'a@'+('b'.repeat(64))+'.com', 'a\n@b.com']) assert.equal(normalizeLocalEmail(invalid),null);
assert(credentialTransportAllowed({protocol:'https:',hostname:'prizm.example.test'}));
assert(credentialTransportAllowed({protocol:'http:',hostname:'localhost'}));
assert(!credentialTransportAllowed({protocol:'http:',hostname:'10.0.0.15'}));
assert(!credentialTransportAllowed({protocol:'http:',hostname:'localhost.attacker.test'}));
assert(!credentialTransportAllowed({protocol:'file:',hostname:''}));
const html = renderToStaticMarkup(<SignInForm onSubmit={async()=>{throw new Error('Render must not submit');}} enabled busy={false} error=""/>);
assert.match(html,/type="email"/);assert.match(html,/type="password"/);
assert.match(html,/autoComplete="username"/);assert.match(html,/autoComplete="current-password"/);
assert.match(html,/>Sign in</);assert.doesNotMatch(html,/Technician|Operator|Remember|portal/);
const disabled = renderToStaticMarkup(<SignInForm onSubmit={async()=>{}} enabled={false} busy={false} error="Unavailable"/>);
assert.match(disabled,/disabled=""/);assert.match(disabled,/role="alert"/);
// Regression guard: secrets and the prior client-only identity never persist in this entry.
for (const name of ['accessClient.ts','SignInPage.tsx']) {
  const source = await readFile(new URL(name,import.meta.url),'utf8');
  assert.doesNotMatch(source,/localStorage|sessionStorage|console\.(?:log|error|warn)/);
}
const shell = await readFile(new URL('../workspaces/WorkspacePreviewShell.tsx',import.meta.url),'utf8');
assert.doesNotMatch(shell,/switchPortal|PortalEntry|readIdentity|Choose your portal/);
assert.match(shell,/Sign-in not enabled/);
const app = await readFile(new URL('../App.tsx',import.meta.url),'utf8');
assert.doesNotMatch(app,/portalMode|TECHNICIAN_TABS_ORDER/);
assert.match(app,/Site workspace/);
console.log('Unified workspace and email/password form checks passed; no live connections.');
