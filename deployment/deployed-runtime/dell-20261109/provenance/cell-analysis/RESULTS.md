# Cell analysis deployment — 2026-11-09

Status: staged and verified on Dell; not activated. Existing services remain on permissions-20261109 releases.

## Scope

SS3 and SS4, LAN and remote. Equipment → Cell analysis sidebar entry with Overview, Incidents, Cell explorer and Reading guide. Passive analysis consumes the existing cell-history publication stream. No additional polling, device commands or latency setting changes.

New incident storage has a 64 MiB / 256-file cap, 360 samples per graph and a 2 GiB free-space reserve. At its cap recording pauses and reports the reason; existing recordings are not deleted. Findings are advisory voltage evidence, not a capacity or failure diagnosis.

## Validation

- Dell application inventories match every baseline application-file checksum used for packaging.
- Offline packaged-module replay of 12 recorded SS3 Array 1 String 40 frames detects an incident containing BPC 2 and BPC 13.
- Packaged incident persistence/readback and disabled-monitor rollback switch pass.
- Local-only HTTP tests pass for health status, incident detail, no-store responses, rejected query parameters and rejected POST.
- LAN/Fleet sidebar placement, changed module imports and named exports pass.
- Unrelated collector top-level functions and Fleet gateway, forwarding, startup and authentication entry points are unchanged.
- Installer self-test passes for fixed targets, cleanup skip, baseline preservation and freshness guards.
- Dell read-only stage verification passed at 2026-11-09T20:09:08.593Z: all three services active on reviewed releases; SS3 ioLogik operation complete, SS4 no saved operation.
- Earlier source-workspace browser acceptance covered desktop, tablet and phone layouts; final signed-in deployed browser acceptance remains pending activation.

## Artifacts

Dell stage: `/home/ebc/prizm-cell-analysis-20261109`
Installer SHA256: `5e8a9b26f69d4cc15f40357b3f030dedb2d3bc0b307dfc8495150a36fe0dd2ed`
Manifest SHA256: `10a485b720ecafa8491d5bec9f01e4420aef12aab264c7b71886dc5f9937bae6`

Only application files and checksums were uploaded. No telemetry fixtures or credentials were uploaded with this package.

## Activation

```sh
ssh -t -i ~/.ssh/prizm_dell_fleet ebc@10.0.0.15 'sudo node /home/ebc/prizm-cell-analysis-20261109/deploy.mjs apply'
```

The installer restarts collectors one at a time and then Fleet, skipping startup cleanup on collector starts. It preserves accounts, saved ioLogik rules, existing data and HVAC baselines. It checks exact baselines again, refuses active ioLogik operations, verifies fresh cell and HVAC evidence and advancing telemetry, and rolls back touched services on failed checks. Existing history retention remains unchanged. Root-protected checks run at activation; staging verification does not substitute for them.

Report after activation: `/home/ebc/prizm-cell-analysis-result.json`
Recovery state: `/var/lib/prizm-fleet/cell-analysis-20261109`

After successful activation, verify signed-in SS3 and SS4 LAN and remote Cell analysis views and String 40 evidence. Do not send equipment commands. New passive incident persistence must accumulate distinct fresh samples; the private replay fixture is not inserted into live history.

## Tool review note

Automatic approval review rejected a REA static-analysis call because proprietary code could be exposed to an external provider. The call did not run. All runtime comparison, packaging and testing were performed locally instead.
