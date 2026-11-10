# Power display deployment — 2026-11-09

Status: application package staged; activation requires the Dell sudo password in the user's terminal. No services were restarted during preparation. Signed-in SS3/SS4 acceptance remains after activation.

Baseline: data-export-collector-20261109, data-export-20261109, data-export-lan-20261109. Fresh read-only file inventories match the locally archived deployed files exactly. Only declared power-display changes are added. The complete local source build is deliberately not deployed; unrelated unpublished changes stay out of this package.

Summary and Fleet views show SunSpec requested power, PCS commanded power, PCS measured power, and the separately labeled Basic-operation target. Apps shows the numeric SSPC001 request. Existing lastCall and PCS acquisitions supply the readings; no cloud dependency, new polling or equipment writes. App report time is labeled separately from collection time; PPC command issue time is not available. Incomplete PCS coverage is unavailable rather than a partial total. Real zero remains zero; stale complete readings remain visible and explicitly labeled.

Packaged backend functions are compiled directly from the reviewed source modules, with a dependency allowlist. Existing collector and Fleet entrypoints receive guarded, unique-boundary edits. UI modules reuse deployed React singletons. Content-hashed assets and entry references preserve prior assets. Reversing every declared edit reproduces the prior backend, UI and HTML bytes exactly.

Validation passed: baseline and release inventories, declared-change reversal, JavaScript parsing and import/export resolution, source tests against packaged implementations, packaged Apps mapping and Fleet validation, wrong-site rejection, and offline LAN/remote-shaped SS3/SS4 browser fixtures. Fixtures use synthetic data. Source build and TypeScript checks passed in the implementation turn. Network guard blocks unmocked network requests during offline tests. REA static Fleet inspection evidence: ev_9bb6a22e94aa2d30abe9bb9ca219a4e87b1995d3110c89694cbe5f093c1f0b13 (static, not runtime proof).

The installer verifies existing fresh numeric SunSpec inputs before restarting a collector, applies SS3 then SS4 then Fleet, and checks fresh advancing telemetry, source-separated power evidence, app projection, existing data export/cell monitoring, retained HVAC profiles, saved ioLogik configuration, protected account/configuration hashes and LAN/remote assets. It refuses active ioLogik operations. Startup cleanup is skipped for these collector restarts only, including rollback. Scheduled retention, data stores, accounts, device configuration, latency settings and equipment commands are unchanged. Existing application release rollback is retained.

Activation:

```sh
ssh -t -i ~/.ssh/prizm_dell_fleet ebc@10.0.0.15 'sudo node /home/ebc/prizm-power-display-20261109/deploy.mjs apply'
```

Read-only staged verification:

```sh
ssh -i ~/.ssh/prizm_dell_fleet ebc@10.0.0.15 'node /home/ebc/prizm-power-display-20261109/verify-stage.mjs'
```

Explicit rollback after activation:

```sh
ssh -t -i ~/.ssh/prizm_dell_fleet ebc@10.0.0.15 'sudo node /home/ebc/prizm-power-display-20261109/deploy.mjs rollback'
```

Do not rerun apply following a failed attempt without inspecting its state; the installer intentionally refuses reused rollout paths. Installer and payload checksums are in stage/stage-checksums.json; Dell staging results are in dell-stage-verification.json.
