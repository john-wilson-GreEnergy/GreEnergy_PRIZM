# Power display retry r2 — 2026-11-09

Status: staged and verified at `/home/ebc/prizm-power-display-20261109-r2`. Not activated. Sudo password entry is required in the user's terminal.

The previous installer rejected SS3's approximately 77 MB saved snapshot at a 64 MiB whole-file limit. This deployment-only correction streams the existing snapshot with the repository's installed MIT-licensed @streamparser/json 0.0.6, retaining only cache metadata, site identity, lastCall block identity and the app report. No acquisition or polling is added. The helper is isolated in a child process with a 128 MiB V8 old-space limit, a 45-second timeout, 64 KiB read chunks, a 512 MiB input cap and a 2 MiB retained-projection cap. It validates the full JSON document and rejects truncation, trailing data, duplicate selected evidence, symlinks and changes to the opened file during reading. Existing station/block identity, enabled-app, numeric request and freshness checks are retained.

The application payload and manifest are byte-identical to the previously reviewed power-display package. Only installer/staging support changes. The manifest SHA256 remains `150ec86eb4484f73aabbef1856d41a9ea9fbfd79e2458684fdafc1382e097203`. Installer SHA256: `910c3d04541a3055a38ec451ef7779895ebae90459f384d81cd44609b56355bf`.

The failed r1 records remain intact. The r2 installer requires the previous state to show no touched services, no completion, and the expected snapshot-size error. Separate release, backup and report paths prevent reuse of the failed rollout. All original account, configuration, learned-baseline, telemetry-freshness, startup-cleanup-skip and rollback protections remain.

Validation:

- Two synthetic 116 MB snapshots passed under the deployment heap limits, covering SS3/SS4 identity, nonzero and zero SunSpec requests.
- Small chunk boundaries, wrong identity, malformed/truncated/trailing JSON, duplicate evidence, oversized input/projection, missing evidence and symlink rejection passed.
- Installer self-test and JavaScript syntax checks passed.
- Dell read-only stage verification passed at 2026-11-09T22:36:59.357Z: all staged checksums, exact current baseline inventory, active SS3/SS4/Fleet releases and idle ioLogik operations.
- Actual SS3 snapshot: 76,217,756 bytes, scanned in 3,531 ms; SunSpec 23,415.6 kW at 2026-11-09T22:36:55.735Z, age 19,122 ms when checked.
- SS4 actual snapshot could not be read as ebc (EACCES). Its sudo preflight remains required before any restart. No permissions were changed.

Activate:

```sh
ssh -t -i ~/.ssh/prizm_dell_fleet ebc@10.0.0.15 'sudo node /home/ebc/prizm-power-display-20261109-r2/deploy.mjs apply'
```

Result: `/home/ebc/prizm-power-display-r2-result.json`. Backup: `/var/lib/prizm-fleet/power-display-20261109-r2`.

Startup cleanup is skipped for this deployment and any rollback restarts. Existing data, accounts, device configurations and learned baselines are preserved; latency settings and equipment commands are unchanged. Signed-in LAN/remote acceptance is still required after successful activation. Do not retry apply after a failure without inspecting its state.
