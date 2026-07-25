# GreEnergy PRIZM Windows Deployment Toolkit

This directory provides technician-facing Windows commands for a cloned PRIZM repository. It keeps process control local, records the exact managed process, and does not change telemetry, authority, polling, or application behavior.

## Requirements

- Windows 10/11 or Windows Server with Windows PowerShell 5.1
- Node.js and npm on `PATH` (use the version approved for the site)
- Git on `PATH` for updates
- A cloned PRIZM repository with `package.json` at its root
- Local access to the configured TCP port (default `3000`)

No cloud service is required. Dependency installation during an update needs access to the site's approved npm source only when `package-lock.json` changes or `node_modules` is absent.

## Technician quick start

1. Clone or copy the repository.
2. Double-click `start-prizm.bat`.
3. Wait for the readiness checks to pass. The browser opens at `http://localhost:3000` by default.

The launcher builds automatically when `dist\server.cjs` is missing. It exits with a nonzero code and a friendly message when a prerequisite, build, port, or readiness check fails.

## Commands

| Task | Double-click / command | Behavior |
|---|---|---|
| Build | `build-prizm.bat` | Runs the production build and verifies `dist\server.cjs`. |
| Start | `start-prizm.bat` | Builds if needed, starts one managed PRIZM process, polls readiness, then opens the browser. |
| Stop | `stop-prizm.bat` | Stops only the process tree identified by PRIZM's runtime PID metadata. It never kills all `node.exe` processes. |
| Restart | `restart-prizm.bat` | Stops, waits for exit, starts, and verifies readiness. Pass `-Build` to force a build. |
| Update | `update-prizm.bat` | Stops PRIZM, performs `git pull --ff-only`, installs only when needed, builds, starts, verifies, and reports the version. |
| Health | `powershell -ExecutionPolicy Bypass -File HealthCheck.ps1 -RequireRunning` | Checks prerequisites, artifacts, HTTP, coordinator, canonical publication, workspace, and projection readiness. |

The PowerShell entry points (`Start-PRIZM.ps1`, `Stop-PRIZM.ps1`, `Restart-PRIZM.ps1`, and `Update-PRIZM.ps1`) support automation and return `0` on success and nonzero on failure.

## Configuration

Edit `Config\prizm.config.json` while PRIZM is stopped:

- `port`: local HTTP port
- `launchBrowser`: open the default browser after a healthy start
- `autoBuild`: build when the production bundle is missing
- `autoUpdate`: reserved for a future approved updater; no current command updates automatically
- `startupTimeoutSeconds`: maximum readiness wait
- `healthPollSeconds`: readiness polling interval
- `logRetention`: number of newest `.log` files retained
- `service`: future Windows service settings

`Config\prizm.runtime.json` is generated while PRIZM runs. It records the managed PID, repository root, port, start time, and server log locations. Do not copy this runtime file between machines.

## Logs and backups

Operation and server output is written to `Logs\`. Entries include timestamp, command, duration, outcome, errors, stdout, and stderr where applicable. Rotation retains the latest configured number of log files (20 by default).

`Backups\` is reserved for update/build recovery artifacts. These directories contain `.gitkeep` placeholders so the directory layout exists in a clean clone; runtime log and PID files remain untracked.

## Health interpretation

The health check validates:

- Node.js, npm, and Git
- repository, `package.json`, `dist`, and `dist\server.cjs`
- configured port state and root HTTP response
- coordinator cycle activity
- canonical publication state `READY` with aligned cycles
- workspace projection runtime readiness
- operator projection API HTTP success

Without `-RequireRunning`, offline HTTP checks are informational so the command can be used as a preflight. With `-RequireRunning`, every runtime check is required.

## Windows service preparation

Service installation is intentionally **not automatic**. A normal Node process is not Service Control Manager-aware, so `install-service.ps1` refuses to register an invalid service command. When an approved service wrapper is available, run an elevated shell:

```powershell
.\install-service.ps1 -WrapperExecutable 'C:\Program Files\GreEnergy PRIZM\prizm-service.exe' -Confirm
```

The prepared service identity is:

- Service name: `GreEnergy PRIZM`
- Display name: `GreEnergy PRIZM Platform`
- Description: `GreEnergy Resources Battery Energy Storage Platform`

Remove it from an elevated shell with `.\remove-service.ps1 -Confirm`. Installation creates but does not start the service.

## Troubleshooting

- **Node/npm/Git missing:** install the site-approved tool and reopen the command window so `PATH` refreshes.
- **Missing build:** run `build-prizm.bat`; review the newest build log on failure.
- **Port occupied:** stop the application that owns the configured port or choose an approved unused port. PRIZM will not terminate an unknown process.
- **Stale PID metadata:** the toolkit removes metadata automatically when its PID no longer exists. If metadata names another repository, investigate rather than deleting a potentially valid instance.
- **Readiness timeout:** inspect both server stdout/stderr logs and run `HealthCheck.ps1 -RequireRunning`.
- **Update rejected:** `git pull --ff-only` deliberately refuses divergent history. Resolve repository state using the normal engineering workflow; the updater never resets or discards local work.
- **Canonical publication degraded:** treat this as an application/data-source diagnostic. The deployment toolkit does not alter acquisition or authority to force a green result.

## Expected layout

```text
deployment\windows\
  Backups\
  Config\
    prizm.config.json
  Logs\
  ServiceUtilities.psm1
  HealthCheck.ps1
  Start-PRIZM.ps1
  Stop-PRIZM.ps1
  Restart-PRIZM.ps1
  Update-PRIZM.ps1
  build-prizm.ps1
  install-service.ps1
  remove-service.ps1
  start-prizm.bat
  stop-prizm.bat
  restart-prizm.bat
  update-prizm.bat
  build-prizm.bat
```

## Future packaging

This toolkit is the cloned-repository deployment layer. Future work may add an MSI installer, a proper Windows Service wrapper, Electron or Tauri desktop packaging, an approved auto-updater, and desktop/start-menu shortcuts. Those features are documented here but are not implemented or enabled by this change.
