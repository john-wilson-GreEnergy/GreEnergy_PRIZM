# Mobile and Fleet administration deployment — 2026-11-05

Status: packaged and tested offline; live activation requires the operator's sudo password. Staging alone does not activate changes.

## Scope
- Phone/tablet touch sizing, responsive user cards, site navigation, and explicit choice between mobile monitor and full Fleet.
- Fleet account email changes, deletion, direct password reset, and existing one-time password setup codes. Existing administrator password confirmation, origin/CSRF validation and profile permissions remain enforced. Administrator accounts retain existing console-only restrictions except remote-control grants.
- Applies to SS3 and SS4 LAN site pages and the remote Fleet/site pages.

## Preserved baseline
- Collector: clss-nac1-collector-20261105 (all files byte-for-byte unchanged in the new collector release).
- Fleet: updates-20261029-r2, freshly captured with current in-place CLSS assets.
- LAN UI: updates-lan-20261029-r2, freshly captured with current in-place CLSS assets.
- Only three named server functions are transplanted from reviewed source into the existing Fleet runtime wrappers. Other server functionality is unchanged.
- Existing credentials, account hashes and site telemetry are not included in the stage payload.

## Activation safeguards
Installer refuses changed release inventories, running ioLogik operations, conflicting overrides/locks, unhealthy telemetry and existing rollout paths. It backs up the account file privately on the Dell, verifies it remains byte-identical, and retains historical audit data. Learned HVAC profiles and incident files are backed up before and during graceful shutdown. Saved device configurations and latency-related environment/settings files are checked for changes. Collector restarts and rollback use a one-time startup-cleanup skip. Verification uses existing GET endpoints only; no scans, device configuration apply, or equipment commands.

Run from the Mac after read-only stage verification:

```sh
ssh -t -i ~/.ssh/prizm_dell_fleet ebc@10.0.0.15 'sudo node /home/ebc/prizm-mobile-admin-20261105/deploy.mjs apply'
```

The installer writes `/home/ebc/prizm-mobile-admin-result.json`. Signed-in LAN and remote browser acceptance follows activation. No real user account should be edited or deleted during that acceptance.

## Offline evidence
- Packaged account router tests: authorization, password confirmation, CSRF/origin, email uniqueness, account identity/grant preservation, session revocation, deletion restrictions and audit failures.
- Packaged UI fixtures: synthetic accounts only; external requests blocked; phone/tablet/desktop layouts, account actions and mobile/full-Fleet view choice.
- Mocked restart/rollback: SS3/SS4/Fleet start and backup failures, graceful shutdown and cleanup skips.
- Complete baseline/release hash inventories and dependency-reference checks in `stage/manifest.json` and `verify-package.mjs`.
- Static shipped-file analysis: REA evidence ev_64d4b419461da9c9d1b9b40a4d3a64338e24a284e79b9cf5b4328898281c45fd. Selected wrappers and Fleet entry only; static evidence does not establish runtime behavior.

Actual iPad Safari acceptance remains a post-deployment check; offline browser tests use Chromium with phone/tablet sizes.
