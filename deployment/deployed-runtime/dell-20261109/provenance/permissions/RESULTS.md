# LAN / remote permission parity — 2026-11-09

Status: deployed successfully at 2026-11-09T15:43:22.796Z. Signed-in checks completed on LAN and remote for test@example.com on SS3 and SS4. Displayed permission status and navigation match. Full telemetry parity is NOT accepted: SS3's remote summary lacks HVAC quick-reference tiles that are present on LAN; its remote Thermal Controls page does have live HVAC data.

Shared per-site roles now authorize LAN and remote. Remote sign-in remains independently enabled/disabled. Existing full-workspace roles authorize remote controls when remote sign-in and the global remote-control switch are enabled. Read-only monitoring uses one passive route policy, including CLSS/HVAC monitoring. Old separate remote-controls edits are rejected clearly instead of reporting an ineffective save. Existing accounts are not migrated or rewritten during deployment.

Preserved: account/password confirmation, CSRF/origin checks, session revocation, control freshness checks and audit; existing accounts, recorded data, learned baselines, device configurations and latency settings. Collector application bytes are unchanged. Deployment restarts skip startup cleanup. No equipment commands used during testing.

Validation passed:
- TypeScript and source Vite build.
- Account management, admin routes, remote admin, remote controls, shared passive-read policy, LAN workspace gateway and rollback-policy tests.
- Exact packaged runtime tests and LAN/remote UI helper checks.
- Installer self-test.
- Dell read-only staging preflight at 2026-11-09T15:37:24.908Z: complete live file inventories matched, payload hashes matched, existing service override ordering preserved.

Manifest SHA256: 833008d4bf6ddece7de3bb310fc759dbf24d45acc278ccf21ca56120044e1cf0
Installer SHA256: a3d28d2d425ef4d72a9f10903719a403423a0bdf583b99e4efbc2601b3e8629c
Staging: /home/ebc/prizm-permissions-20261109
Changed files: collector 0, Fleet 40, LAN assets 33.

Activation:

```sh
ssh -t -i ~/.ssh/prizm_dell_fleet ebc@10.0.0.15 'sudo node /home/ebc/prizm-permissions-20261109/deploy.mjs apply'
```

After activation, verify test@example.com on both connections for SS3 and SS4; verify full-role controls availability without executing equipment commands, and read-only monitoring with command actions unavailable. New sign-in may be required after Fleet restarts. Do not claim browser acceptance before it is performed.

## Retry correction

The first apply stopped before rollout creation or service changes: the inherited asset verifier referenced an absent oldPanel field, creating /assets/undefined. Corrected the installer to resolve the unique prior administration asset from the reviewed rename map and validate both inventory checksums before requesting it. Actual installer regression tests passed using exact pre/post release bytes, including malformed metadata, failed HTTP responses and corrupted asset rejection. Read-only Dell stage verification passed at 2026-11-09T15:39:29.933Z. A curl read of the current public administration asset returned HTTP 200 with its expected checksum (Python urllib was denied HTTP 403). Application payload and manifest unchanged. The subsequent deployment completed; do not rerun apply merely to finish browser acceptance.

## Read-only acceptance — 2026-11-09

The Dell result report confirms no rollback, preserved accounts, skipped startup cleanup, unchanged latency settings and no equipment commands. All three services are active on the permissions-20261109 releases. Fleet and remote release checksums match. Existing HVAC baselines and device configurations were retained.

Remote browser observations around 10:48 AM Pacific, signed in as test@example.com:
- Both sites display “Monitoring and controls available” and the same Monitor, Equipment, Maintenance, History & reports and Administration navigation sections. Controls were not executed.
- Both site summaries show live readings, eight arrays and 320 strings. SS3 showed 312 online / 5 nearline / 3 offline; SS4 showed 312 / 3 / 5. Snapshot times advanced. SS4 also displayed partial coverage.
- Both Thermal Controls pages load 168 controller pairs and 336 HVAC targets with current readings and retained load profiles. SS3 showed 301 retained profiles and 916 saved incidents; SS4 showed 315 retained profiles and 1669 saved incidents. These are observations, not fixed expected totals.
- SS4 saved incident detail loads paired current traces, command-state lanes and recorded events without sending commands.
- Fire monitoring loads on both sites: each reports six of eight panels communicating. SS3 reports two panels needing review, SS4 four. These underlying feed gaps remain; telemetry access does not imply all equipment is healthy.
- SS3 summary also showed an empty HVAC quick-reference/topology section while its separate Thermal Controls page had live data. LAN comparison is needed before attributing this to permissions or a shared summary-view issue.

### Follow-up after LAN sign-in — approximately 11:08–11:10 AM Pacific

- Verified test@example.com on both LAN sites (3444/3445), with the same “Monitoring and controls available” status, all 19 workspace navigation buttons, and “Unlock Advanced Controls” entry point as remote. No controls were unlocked or executed; this is a read-only permissions/UI acceptance, not an equipment-command test.
- LAN live summary counts match the remote counts: SS3 312/5/3 strings online/nearline/offline; SS4 312/3/5. Live values and timestamps advance; individual numeric samples naturally differ with observation time.
- SS3 LAN Thermal Controls shows 168 pairs, 336 units, 301 retained profiles and 918 incidents. Remote HVAC access was confirmed earlier. SS4 LAN and remote both show 168 pairs, 336 units, 315 retained profiles, 1669 incidents and eight ready units at source time 11:09:59 AM.
- The same SS4 saved incident opens on LAN as remote: Array 5 / CS pair, 10:18:27 AM incident, two dropouts, observed peak 13.2 A, largest observed interval 17.518 seconds, with paired-current graph and command lanes.
- Fire-panel coverage matches across connections: SS3 six/eight communicating, two needing review; SS4 six/eight, four needing review. Fire monitoring is intentionally labeled read-only irrespective of the account's site control permission.
- Remaining confirmed discrepancy: SS3 LAN summary renders 336 HVAC quick-reference unit tiles; remote summary renders none and reports “HVAC telemetry has not been reported in the current snapshot.” Revisited remote summary again after navigation/load: same message with live cache last-fetched time 11:10:15 AM. SS4 renders all 336 tiles on both connections. This needs investigation before claiming complete telemetry parity; cause is not established by these browser checks.
- “Block Topology (0/0)” appears on both LAN and remote summaries, so this is a shared view issue rather than a demonstrated connection-specific permission discrepancy.

No account changes, equipment commands, forced polls or settings changes were performed during acceptance.
