# Native ioLogik migration

## Progressive scans and verified inventory — 2026-09-25

Native scans now publish each normalized device result as it completes. Discovery
still uses at most eight concurrent reads; authenticated inventory uses four.
The shared `/operations` subscription refreshes every second while a scan is
running (three seconds when idle). It reads server state only and never initiates
device acquisition. Existing blocking scan POST responses remain compatible.
Reloading the page reconnects to the server-owned scan without repeating it.

The API owns the current inventory projection. The UI no longer merges old
operation results over scan readings. Each row exposes `observedAt` and
`observationSource`; targets still waiting in a scan are explicitly marked as
previous readings. Unreachable or unverified responses remain unknown, not OK.
The current scan progress is transient: a failed scan retains the last completed
snapshot, and restarting PRIZM does not automatically resume acquisition.

`last-scan.json` remains the last completed scan report. The separate, atomically
written `inventory.json` retains successful verified update readbacks, including
across later updates and restarts. Both are site/topology/Golden-Rule scoped and
allowlist persisted fields (no passwords or raw device exports). A newer completed
scan replaces the inventory scope, matching the existing selected-scan behavior.
Failed update results stay in the operation report and cannot overwrite verified
inventory rows. A save error is reported without retrying any device write.
The most recent operation report remains historical, not proof of a current scan.

Validation: 33 native/service tests, shared-subscription and filter regressions,
TypeScript checking, Vite frontend build and esbuild server build passed on macOS.
Tests cover partial publication, bounded concurrency, failed acquisition, scan/update
exclusion, per-target persistence, stale/failed result rejection, scope changes and
atomic write failure. No firmware/configuration update is part of this validation.
Windows/Linux use the same Node implementation and existing portability CI;
those runtime jobs were not executed locally.

Live validation used a read-only 168-device scan after an idle-runtime restart.
API and browser both showed partial results (4/168 initially); reloading the page
reconnected to the same scan at 25/168 without issuing another scan. Result
filters remained usable during acquisition. An actual failed read at 10.0.2.16
rendered as unavailable / firmware and configuration not verified, replacing its
older OK reading rather than reporting false freshness. `npm test` (including
the network guard and pretest suites) also passed.
The scan completed at 21:40:01 UTC in 258.7 seconds: 168 results persisted,
167 configuration/firmware matches and one unverified device (10.0.2.16).
All 168 rows retained individual observation timestamps. This change improves
time-to-visible-results; it does not claim faster device responses or a shorter
whole-fleet acquisition duration. Successful-update persistence was tested with
mocked, network-blocked readbacks, not by issuing another live device update.

Rollback: previous production entry files are byte-verified at
`/tmp/prizm-before-progressive-fINLZO`; old hashed assets remain in `dist/assets`.
Restore those four entry files and restart the idle local runtime to revert this
deployment. The previous runtime ignores `inventory.json` and continues reading
the unchanged last-scan format. No persisted device data needs to be deleted.

## Tested direct path enabled in normal workflow — 2026-09-25

Following the separately approved successful direct upgrade on 10.0.4.96 and
the user's request to correct the UI workflow, the hash-pinned E1242 v4.0
Build24071616 catalog entry now permits v3.3 **Build22072210** as an additional
source. This is a field-tested application policy, not universal vendor approval.
The existing v3.4 adjacent source remains available. Earlier notes below stating
that v3.3 is always blocked describe the superseded policy.

The normal service passes this catalog rule to the native update engine; it is
not a browser-supplied override or a global bypass. A live pre-upload read still
checks the model and exact source build. Package identity/checksums, downgrade
refusal, current-version/build checks, one-attempt behavior, recovery wait and
two exact post-update readbacks remain intact. Wrong or missing v3.3 build stays
blocked. Unknown packages receive no direct path. Historical blocked run reports
are retained and labeled as historical; changing policy sends no device updates.

30 native tests plus subscription/filter regressions passed, including exact
source success, response loss without retransmission, other model/version/build
blocking, and refusal to report success with a wrong post-update build.

TypeScript checking and production build passed. After restarting local PRIZM,
the API advertised the tested source rule and retained the 168-device snapshot.
Read-only checks on 10.0.1.4, 10.0.5.11 and 10.0.7.56 confirmed E1242,
V3.3 Build22072210, both safe fields Off and watchdog 300s. The browser review
dialog showed all three targets and the corrected policy; it was cancelled
without pressing Start. No firmware/configuration upload was sent during this
fix. The previous blocked operation remains unchanged as historical evidence.
Rollback entry files were byte-verified at
`/tmp/prizm-before-qualified-upgrade-ejDQyX`; old hashed assets were retained.

## Firmware mismatch filtering — 2026-09-25

The server projects `firmwareStatus` and `firmwareDetail` from normalized readings
and the current verified firmware package. Exact version/build is OK; known
different version or build is mismatch. Missing readings/builds, unreachable
devices, ambiguous partial versions and an unverified package stay unknown.
Neither a mismatch nor a filter authorizes a firmware write or downgrade.

The fleet result dropdown offers Firmware mismatches, Firmware matches (OK),
Firmware not verified, and Any mismatch (configuration or firmware), alongside
the existing configuration filters. Firmware cells include the status and its
explanation. Saved scan observations are reassessed on read, without acquiring
devices; importing another package refreshes that comparison. Raw scan data and
saved scan time are not changed merely by filtering or importing firmware.

29 native tests plus subscription/filter tests, TypeScript checking and production
build passed. After a fresh local restart, the 168-device saved scan retained its
19:57:32.925Z timestamp. API and browser both identified 3 firmware mismatches
(10.0.1.4, 10.0.5.11, 10.0.7.56; all v3.3 with configuration OK) and 165 exact
firmware matches. Combined mismatch filtering showed the same 3 rows. Filtering
left all devices unselected; no scan or hardware write was performed. Rollback
entry files were byte-verified in `/tmp/prizm-before-firmware-filter-AleHiG` with
old hashed assets retained. Windows/Linux execution was not retested this turn.

## Latest scan persistence — 2026-09-25

Discovery and firmware/configuration scans save their normalized results in
`data/iologik-assets/last-scan.json`. This is one snapshot, not an accumulating
inventory: a completed selected-device scan replaces the whole prior scan;
devices outside its scope are not carried forward. Unreachable/unknown results
are saved too. A failed acquisition or failed atomic file replacement leaves
the previous snapshot intact. Concurrent scans are rejected and device updates
cannot start while a scan is running. No passwords or raw exports are saved.

`GET /api/local/iologik/targets` exposes `lastScan`; the fleet UI restores it on
opening and labels its time, kind and target count as saved rather than live.
Older operation reports do not overwrite newer scan readings. The snapshot is
bound to the active profile/EMS identity, target topology, backend and Golden
Rule hash; changes prevent reuse until a fresh scan is completed. A site/policy
change during acquisition prevents publication. This feature sends no device
configuration or firmware writes and does not auto-scan on page load.

Tests cover reading through a fresh store instance, replacement, selected scope,
unknown targets, credential exclusion, corrupt files, site/policy mismatch and
disk-write failure. The 28 native tests, subscription/filter tests, typecheck and
production build passed. Rollback entry files were byte-verified in
`/tmp/prizm-before-scan-snapshot-neyNf7`; retained hashed assets allow restoration
without deleting runtime data. Windows/Linux runtime testing is still pending.

## Approved direct firmware trial — 2026-09-25 19:36 UTC

User approved one direct v3.3→v4.0 firmware test on Array 4 / ES18,
10.0.4.96, citing successful prior upgrades through the standalone script.
The test invoked PRIZM's native client and fleet engine with a per-invocation
prerequisite exception restricted to that IP and the previously verified package.
It did not use the browser apply route or relax the production offline catalog.
A persistent exclusive attempt marker prevented rerunning the upload. No other
devices were written, no configuration upload was sent, and there was no retry.

Preflight saved the complete native configuration and confirmed V3.3
Build22072210, both DO-00 safe-state fields Off, watchdog 300s, and the target IP.
The one 1,281,520-byte firmware upload began at 19:36:05.744Z to `/06_4_1.htm`.
At 19:36:49.467Z, HTTP 200 explicitly reported successful firmware upgrade.
Two fresh authenticated readbacks at 19:37:15.326Z and 19:37:23.603Z confirmed
V4.0 Build24071616 and unchanged DO-00/watchdog values. Independent verification
at 19:37:32.681Z reconfirmed firmware, address, DO-00 and watchdog; TCP port 502
accepted a connection (not a Modbus register/value test).

Configuration comparison found only firmware/eCOS metadata changes and the new
`MXIO_AUTH_ENABLE=1` field. Existing SNMP_ENABLE=1, REST_ENABLE=1 and EIP_ENABLE=0
were preserved. The PRIZM browser's one-target scan showed 4.0, Golden Rule OK,
DO-00 0 and watchdog 300s. Cached Array 4 / ES18 HVAC telemetry from Feather
10.0.4.95 was Live at 19:38:09.527Z, after recovery, with no reported HVAC faults.
This is not an end-to-end validation of every EMS I/O signal or control action.

Private backups and evidence are saved, mode 0600 under a mode 0700 directory,
in `data/iologik-assets/firmware-trial-20260925-10.0.4.96/` (git-ignored).
The firmware result is in that trial report, not the normal UI operation report;
the UI was updated by a fresh read-only scan. Native regression tests passed
before the trial. No production code was changed or server restarted this turn.

Outcome: direct upgrade qualified on this particular E1242/device/build using
PRIZM's native engine. It is evidence against assuming a mandatory intermediate
3.4 on this exact tested combination, not universal vendor support or authority
to upgrade the remaining devices. Fleet guard remains conservative pending a
separate implementation decision; remaining firmware targets are 10.0.5.11 and
10.0.7.56. Do not automatically restore the v3.3 configuration onto v4.0.

## Firmware identity and upgrade preparation — 2026-09-25

The supplied `moxa-iologik-e1200-series-iologik-e1242-e1242-t-firmware-v4.0.1kp`
is **v4.0 Build24071616**, not v4.0.1. Its SHA-512 matches the official E1242
package at https://www.moxa.com/en/support/product-support/software-and-documentation?psid=42116:
`56885404ad90f9bcdb5f5c7ddf8f1837375c8f6cbeb75d3ce067bbb724308f354c434ec0bb2177d775b0aeafbe2fc2ca2cebeacfbb8f4d68fd3ddf64e9c4d871`.

The offline firmware catalog now supplies identity for import, existing assets,
deployment, and UI. Unknown packages can be imported for inspection but cannot
be deployed. Old manifest version labels are not authoritative. Deployment
recomputes hashes, enforces the import checksum and verifies version AND build
on two fresh readbacks. Matching version with missing/different build is not
success and does not trigger a reflash. Legacy firmware writes are blocked
because they lack these guards; legacy scan/configuration paths remain intact.

Moxa's release history lists 3.3, 3.4, then 4.0, and its device upload screen
warns to use only adjacent releases. PRIZM therefore conservatively requires
3.4 before 4.0. This is a safety policy inferred from that warning, not proof
that direct 3.3→4.0 fails or vendor qualification of this site's hardware.
Obtain a trusted 3.4 package with official checksum/build information, or
written vendor confirmation of a direct upgrade, before the next live test.
The 3.4 package is not yet available in the verified catalog.

Release notes: https://www.moxa.com/Moxa/media/PDIM/S100000327/ioLogik%20E1200%20Series_moxa-iologik-e1200-series-iologik-e1242-e1242-t-firmware-v4.0.1kp_Software%20Release%20History.pdf

4.0 changes protocol defaults and password handling. The separately approved
single-device test must include backups, stable power, observed recovery,
firmware/build, address, DO safe state, watchdog, authentication and required
protocol checks. Do not count firmware identity verification as configuration
or EMS communication verification. No firmware was flashed during this work.

### Local validation

27 native tests, the operation subscription test, result-filter tests, TypeScript
checking and the production build passed. The actual local package hash resolved
to the catalog identity. After restarting local PRIZM, `/api/local/iologik/targets`
and the browser firmware card both showed v4.0 Build24071616, vendor SHA-512
matched, and the v3.4 prerequisite. The previous completed configuration report
remained intact and active update targets were empty. Firmware installation is
NOT yet live-qualified. Node-based identification is OS-independent; Windows
and Linux execution have not been retested in this session.

Rollback entry files were copied and byte-compared at
`/tmp/prizm-before-firmware-identity-7td77s`; old hashed assets remain in `dist/assets`.
Restore those entry files and restart PRIZM to revert the local runtime. Keep
firmware operations paused when reverting because the prior runtime lacks these
identity/path safeguards. No rollback restart was performed.

### Remaining configuration targets completed

Operation `196fe76b-c658-44c7-b87f-2c245776f82c`, 19:21:19.643Z–19:22:09.073Z,
applied one configuration upload each to 10.0.5.11 and 10.0.7.56. Both had two
matching fresh readbacks: both DO-00 safe-state fields Off, watchdog 300s,
firmware V3.3 Build22072210 unchanged. Independent reads confirmed at
19:22:36.300Z and 19:22:45.695Z. All four originally selected configuration
outliers are now corrected; firmware remains a separate outstanding task.

## Successful corrected import — 2026-09-25 19:17 UTC

One configuration-only upload was explicitly approved and submitted through the
PRIZM browser for Array 4 / ES18, 10.0.4.96. Operation
`5b2b6837-d0ad-4167-851b-5bbaaa623c55` ran from 19:17:03.417Z to 19:17:50.210Z.
The device accepted the upload. Both DO00_SAFE and Peer_DO_SM_STATUS00 changed
from 2 (Hold Last) to 0 (Off), with two matching fresh post-update readbacks.
Watchdog stayed at 300s and firmware stayed V3.3 Build22072210. PRIZM rendered OK
and “updated — Verified by two post-update readbacks.” An independent fresh
session at 19:18:27.442Z confirmed Off in the device's DO settings form as well as
both exported fields, with IP still 10.0.4.96. No second upload, firmware write,
extra restart or other-device write was sent.

This qualifies the corrected import on this particular firmware/device, not all
versions. The remaining configuration targets 10.0.5.11 and 10.0.7.56 were not
changed. Firmware installation remains a separate unqualified workflow requiring
its own approved test and confirmation of the vendor-supported upgrade path.

## Instrumented import result — 2026-09-25 18:56 UTC

One separately authorized configuration upload was sent to 10.0.3.16. No firmware
was sent and the other three devices were not changed. The native client posted
to `/06_5_1.htm` with fields `token`, `importfile`, `import` (network-overwrite
checkbox omitted). The prepared file was 20743 bytes, SHA-256
`5c97059234054609b5344a0a7d559994219a3995253e1b0e5a5e13c539221ee5`.
At 18:56:15.650Z the upload began; HTTP 200 arrived after 1764 ms with the explicit
message “System configuration file imported and restart successfully.”

Verification ended at 18:58:23.384Z without a match: DO00_SAFE remained 2 and the
watchdog remained 300. A new export and the independent DO channel form both
confirmed Hold Last. The status page subsequently reported elapsed uptime
00:02:06, consistent with a restart during this test; firmware remained
V4.0 Build24071616 and the address remained 10.0.3.16. This isolates the remaining
problem to applying/persisting the requested setting (or a subsequent overwrite),
not proof of an upload rejection or simply a missing reboot. There was no second
upload or speculative Save/Restart. The exact internal cause remains unproven.

Future operation reports distinguish explicit upload acceptance, an unconfirmed
response, and a rejection. None overrides the requirement for matching readback.
The actual firmware form and bundled firmware HTML identify `update=Update` as
the submit control; the former hard-coded `Submit=Submit` was corrected and has
a regression assertion. This is a confirmed form mismatch, not yet evidence that
firmware installation now succeeds. The page also warns to upgrade only to the
next/previous release; verify the vendor-supported version path before flashing.

## Current device-native configuration policy

Configuration deployment now treats the imported golden file as a source of
managed policy, not as the full payload. It exports the target's own configuration
and changes only DO00_SAFE and its companion Peer_DO_SM_STATUS00 to Off,
CONNECTION_WATCHDOG to the saved site rule,
and NET_CONFIG_OVERWRITE to 0 as a transport safeguard. The upload checkbox for
network overwrite remains omitted. Original line endings, firmware/eCOS metadata,
authentication, vendor-specific extensions and all other I/O settings remain
unchanged. This preserves the 4.0-only MXIO_AUTH_ENABLE field automatically without
inventing compatibility by rewriting a version number.

Preflight requires an E1242 export with its end marker, the expected IP, unique
managed fields, recognized DO output mode/safe-state syntax and watchdog units.
Missing, duplicate or unsupported fields block the upload. A different firmware
version alone does not block it; this is format-based support, not a claim of
qualification on every firmware version. Configuration readback must confirm the
requested settings twice and unchanged reported firmware metadata. There is no
secondary watchdog-form write on a mismatch and no automatic upload retry.

The companion-field correction additionally requires exactly one recognized
Peer_DO_SM_STATUS00 in the device's native export; it does not invent that field
for an unknown format. Scan compliance and deployment verification require both
safe-state fields to be Off. Conflicting fields are a mismatch, and a missing or
unrecognized companion field is unknown, never OK. Golden-file staging normalizes
the companion when present; per-device preparation also corrects it for existing
saved golden files. Other DO channels and power-on state remain unchanged.

Correction validation on 2026-09-25: 25 native tests, the shared-status regression
test, result-filter checks, typecheck and production frontend/server builds passed
on macOS. A read-only preflight at 19:14:35 UTC on 10.0.4.96 (V3.3 Build22072210)
found both safe-state fields at 2 and watchdog 300s. In-memory preparation changed
DO00, Peer_DO_SM_STATUS00 and NET_CONFIG_OVERWRITE only. The updated local runtime
was restarted with no active ioLogik, balancer-test or fan-hold jobs. Prior entry
files are retained at `/tmp/prizm-before-peer-fix-PEStXc`; prior hashed frontend
assets remain available for rollback. Windows/Linux live qualification is pending.

Native firmware-only updates do not require a golden file and never import the
configuration policy. A policy, if available and valid, is used only to label the
post-firmware configuration reading. The legacy backend retains its old behavior
and limitations; it is never entered automatically after a failed native write.

2026-09-25 validation: 22 protocol/subscription tests plus result-filter assertions,
typecheck, production frontend/server builds and a fresh local restart passed.
The browser and local API show device-native-policy with Off / 300 seconds. A
read-only in-memory preparation on 10.0.3.16 (4.0), 10.0.4.96, 10.0.5.11 and
10.0.7.56 (3.3) preserved every line except DO00 and NET_CONFIG_OVERWRITE; all
watchdogs were already 300 seconds. No uploads were sent in this qualification.
Live import acceptance is still unverified and needs a separately approved
single-device test. The previous build is retained at
`/tmp/prizm-before-iologik-policy-FLRSql/dist` for local rollback.

## Scan-result table filters

The result selector filters existing canonical scan readings alongside array and
text search. Configuration mismatches excludes unverified and unscanned targets;
both have separate views, as do unavailable devices. No filtering action polls or
writes a device. Selections are preserved and hidden selected targets are counted.
“Select only shown” explicitly replaces the selection with the visible rows.
Clear device filters restores the full table without changing selection.

## Earlier import compatibility investigation (superseded staging)

The four-device run on 2026-09-25 did not change DO-00. Independent DO channel
forms confirm Hold Last. The earlier staging removed section 4 altogether;
firmware strings identify an importer for that section and its watchdog fields.
Preserve the required section structure. For each configuration upload, read the
target's own network section, keep its addresses/access restrictions, change only
the requested watchdog, and force NET_CONFIG_OVERWRITE=0. Do not submit the web
form's network-overwrite checkbox. Preserve CRLF and put the submit field after
the file, matching the observed web form. An explicit Moxa rejection must be
reported immediately, including “Import config fail” and “File process fails”.
These corrections require a separately authorized single-device write test.

Single-device qualification (2026-09-25): 18 focused tests, typecheck and the
production build passed locally. The authorized configuration-only test on
10.0.3.16 returned the device's explicit `Import config fail` response. PRIZM
recorded operation `8246bd18-edd7-4ed4-aeca-d06492221369` as rejected without an
automatic retry. Independent readback still showed firmware V4.0 Build24071616,
DO-00 Hold Last (2), watchdog 300 seconds, and the original IP address. Firmware
and the other three selected devices were not changed.

Read-only comparison found that the golden export identifies firmware 3.3 /
eCOS 2.4.0, whereas this target exports firmware 4.0 / eCOS 2.5.0 and an additional
`MXIO_AUTH_ENABLE` field absent from the golden file. Otherwise the prepared
file's differing parsed fields were DO00 and NET_CONFIG_OVERWRITE. This is a
configuration-format compatibility candidate, not proof of the device's rejection
cause. Do not claim import parity or roll out to the remaining devices. The next
qualification should preserve target-native format and authentication settings;
any further live upload requires separate authorization.

PRIZM's default E1242 workflow uses Node HTTP, cookies, multipart uploads and
bounded read-back verification on macOS, Windows and Linux. It does not spawn
Bash, curl, ping, sed or a platform-specific command. The standalone tool remains
unchanged; `PRIZM_IOLOGIK_BACKEND=legacy` explicitly restores the previous backend
on systems that support that script. Never automatically fall back to another
write path after an ambiguous upload.

The provider handles the existing Moxa challenge/session protocol and parses
observed E1242 pages. Fleet orchestration validates targets, serializes operations
per device, stages device-specific configuration without readdressing, and records sanitized per-device
outcomes. Routes remain adapters; the UI displays post-operation observations.
Firmware HTTP acceptance is not completion. Exact version read-back is required
for verified success; a device reporting only major/minor cannot prove a patch
release and is marked unverified, not automatically reflashed or downgraded.

Assets use the managed ioLogik directory under PRIZM data. Configuration and
firmware can be imported in the UI. Explicit legacy asset overrides are supported;
the existing Mac asset directory is a migration fallback, not a runtime dependency.
Passwords, session cookies, challenge tokens and raw HTML are never retained in
the operation report. Device HTTP/MD5 is an existing device protocol constraint,
not suitable for exposure outside the protected site LAN.

Validation: mocked protocol tests with real Node request-body types, negative
upload/verification cases, target validation and platform CI matrix. Live write
qualification requires the technician's selected devices and maintenance approval;
tests in development must not send firmware, configuration or reboot commands.

Local validation (2026-09-25): a read-only native session on 10.0.1.11 returned
model E1242, firmware `V4.0 Build24071616`, DO-00 safe state 0, and watchdog 300s.
The device rejected the default fetch transport's login with HTTP 405; the native
Node HTTP transport with explicit message framing successfully authenticated and
read the configuration. The precise server-side reason for the rejection is not
known. No live firmware/configuration write was performed.
The same device's authenticated upload forms were read without submitting them:
firmware action `06_4_1.htm`, field `file`; configuration action `06_5_1.htm`, field
`importfile`; both contain a hidden `token`. The native parser recognized both.
The browser scan also rendered firmware 4.0, DO-00 0 and watchdog 300s as a match.
`npm run test:iologik` passes 15 focused tests; typecheck and production build pass
locally. Actual firmware installation and configuration-change parity remain
unverified until a separately authorized maintenance test.

The UI's shared status subscription reads only the saved operation report, not
the controllers. The latest report survives refresh/restart; an unfinished report
is marked interrupted and is never resumed automatically. The legacy flag selects
the old script explicitly; its old verification limitations still apply.

Approved single-device form test (2026-09-25, 19:01–19:02 UTC): on 10.0.3.16
(Array 3 / ES2), one DO-00 settings submission followed by one Save/Restart
persisted safe state Off. Two fresh post-restart sessions confirmed Off through
both the exported configuration and DO settings form. Watchdog remained 300s,
firmware remained V4.0 Build24071616, and the network address was preserved.
No firmware or other device was changed. A subsequent PRIZM read-only scan at
19:04:29 UTC returned `configurationStatus: ok`.

The before/after export differed in DO00 and Peer_DO_SM_STATUS00 only. The
previous native import changed DO00_SAFE but retained Peer_DO_SM_STATUS00 at
Hold Last (2). This is evidence of a second setting that must be reconciled,
not proof of internal import ordering or a qualified fix to the import path.
Further import trials require explicit approval; do not roll out fleet writes.

The scan also exposed a UI regression: changes to active scan locks replayed an
unchanged historical operation report over fresh scan results. Status publication
now keys on the operation itself; lock-only changes cannot overwrite the scan.
The historical failed operation remains intact rather than being rewritten as a
successful import.
Validation of this display correction: 22 native tests, the shared-subscription
regression test, result-filter checks, typecheck and Vite production build passed
locally. After loading the updated frontend, a one-device browser scan rendered
Array 3 / ES2 as OK, DO-00 0, watchdog 300s, firmware 4.0. The Last update column
still correctly contains the older unverified import outcome. No backend restart
or additional device write was needed for the display-only change.

Minimum native runtime: Node 22. The portability workflow exercises mocked
protocols on macOS, Windows and Linux with Node 22/24. Adding that workflow is not
evidence that all six CI jobs have run; local validation covers macOS only.
This removes the ioLogik shell dependency, not every platform-specific dependency
elsewhere in PRIZM. Package authenticity must still be established from a trusted
vendor source; the import checksum detects alteration, not vendor authenticity.
