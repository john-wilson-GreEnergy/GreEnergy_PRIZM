# Data export deployment — 2026-11-09

Status: staged and read-only verification passed; activation requires the Dell sudo password in the user’s terminal. No services restarted during preparation.

Baseline: cell-summary-collector-20261109, cell-summary-20261109 and cell-summary-lan-20261109, verified against fresh Dell file inventories.

The package adds the Data export tab, read-only catalogue/query/download routes and an isolated bounded worker. Adapters are extracted directly from the canonical source recorder exportPlan methods and attached to the existing recorder instances. Existing recording/acquisition code is preserved byte-for-byte. The export worker resolves beside the new release module; existing worker symlinks remain unchanged. No raw device requests are introduced.

Export contents: selected retained power/PCS/reported setpoints, cell/string context and whole-site HVAC history; CSV, coverage, manifest and an offline HTML graph report in one ZIP. Maximum requested window is seven days, subject to recorded coverage. Existing history retention is unchanged. Missing periods are not reconstructed.

Limits: 32 targets, 1,024 series, 120,000 readings, 256 MiB input, 32 MiB output, 16 MiB ZIP, 25-second work budget with 30-second worker timeout and 256 MiB worker heap. One active export per collector; one in-memory package expires after five minutes. No server export files are written. Disable with PRIZM_DATA_EXPORT_ENABLED=false if needed.

Validation: exact inventory and reversal of unrelated changes; dependency allowlists; module imports/exports; packaged adapters against genuine offline recorder files; packaged worker CSV/HTML export; unchanged fixture files; site-switch refusal; remote read-only query policies; LAN/remote-shaped desktop, iPad and phone acceptance; installer cleanup-skip and baseline guards. Synthetic data only in browser tests. Live signed-in acceptance remains after activation.

Installer stages SS3, SS4, then Fleet. It backs up accounts and monitor/configuration stores, skips startup cleanup for this rollout only, checks fresh advancing telemetry and retained learned baselines, verifies LAN and remote assets, and restores previous releases on verification failure. Existing data, account grants, saved Golden Rules and latency settings are guarded. It refuses deployment while an ioLogik operation is active. No equipment commands are sent.

Activation:

```sh
ssh -t -i ~/.ssh/prizm_dell_fleet ebc@10.0.0.15 'sudo node /home/ebc/prizm-data-export-20261109/deploy.mjs apply'
```

Read-only preflight:

```sh
ssh -i ~/.ssh/prizm_dell_fleet ebc@10.0.0.15 'node /home/ebc/prizm-data-export-20261109/verify-stage.mjs'
```

Rollback after an activated rollout:

```sh
ssh -t -i ~/.ssh/prizm_dell_fleet ebc@10.0.0.15 'sudo node /home/ebc/prizm-data-export-20261109/deploy.mjs rollback'
```

Do not rerun apply after a failed attempt without inspecting its state. The installer intentionally blocks reused rollout paths.
