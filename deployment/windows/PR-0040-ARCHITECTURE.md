# PR-0040 Windows Installer Architecture

## Outcome

The release artifact is a machine-wide `GreEnergy_PRIZM_Setup.msi`. A field machine receives the production PRIZM bundle, production `node_modules`, a private pinned Node.js runtime, WinSW, and the Tauri manager. Git, npm, Node.js, PowerShell, and Command Prompt are packaging-workstation tools only and are not required on the target.

## Technology decisions

### Installer: WiX Toolset v5

WiX is the native MSI authoring layer. It provides Windows Installer repair, component ownership, major upgrades, rollback, service lifecycle integration, Start Menu/Desktop shortcuts, and standard enterprise deployment switches. WiX v5's wildcard `Files` harvesting keeps the generated production payload out of source control while retaining explicit ownership of the service, configuration, and shortcuts.

Tauri's built-in MSI was not used as the outer installer because the product is larger than the manager: it must install and control a service, a private runtime, application payload, ProgramData ACLs, and preserved mutable data as one transaction.

### Service host: WinSW 2.12.0

WinSW is an established MIT-licensed service wrapper. The package pins and checksum-verifies the x64 executable. Configuration enables:

- service identity `GreEnergy PRIZM`
- automatic delayed startup
- LocalService execution with no desktop interaction
- hidden child process
- Ctrl+C graceful shutdown with a configurable 120-second timeout
- preshutdown notification
- escalating crash restart delays and failure-count reset
- rolling output logs in ProgramData

The Node runtime is private to the installation and never added to system `PATH`. `service-launch.cjs` reads the mutable port from ProgramData before loading the existing production entry point.

### Desktop manager: Tauri 2

The manager is a vanilla TypeScript UI backed by narrowly scoped Rust commands. It does not host or duplicate PRIZM application logic. Its health model reads the existing coordinator, publication, telemetry, StringViewer, Feather, site health, workspace, and projection endpoints. Native commands are limited to:

- querying and controlling the exact Windows service name
- reading/writing the fixed ProgramData configuration
- reading/exporting the fixed log directory
- creating/restoring bounded local backups
- launching the fixed staged MSI update path

No general shell interface is exposed to the webview.

## Installed layout

```text
C:\Program Files\GreEnergy\PRIZM\
  app\                 production server/client and production dependencies
  runtime\node.exe     private pinned Node runtime
  service\             WinSW executable and XML configuration
  manager\             GreEnergy PRIZM Manager

C:\ProgramData\GreEnergy\PRIZM\
  Logs\
  Config\settings.json
  Cache\
  Backups\
  Telemetry\
  Runtime\
  PID\
  Updates\
```

Program Files is immutable to normal users. Only ProgramData receives writable ACLs. The service runs as `NT AUTHORITY\LocalService`; interactive users receive query/start/stop access to the service but cannot replace its executable.

## Settings

`Config\settings.json` is created once with `NeverOverwrite` and is preserved across repair and major upgrade. The manager performs validation and an atomic temporary-file rename. Port changes are consumed on the next service restart. The update channel is deliberately restricted to `manual`.

The automatic-startup setting records operator preference; the installed service remains automatic/delayed to satisfy the industrial availability requirement. Changing the SCM startup type remains an administrative maintenance operation.

## Update strategy

Version one is offline/manual:

1. Place an approved, signed package at `C:\ProgramData\GreEnergy\PRIZM\Updates\GreEnergy_PRIZM_Setup.msi`.
2. Select **Update** in the manager.
3. Windows Installer requests elevation, gracefully stops the service, applies an in-place major upgrade, preserves ProgramData, starts the service, and performs MSI rollback if installation fails.
4. Reopen the manager and run **Health Check**.

The manager never performs `git pull` or `npm install` on a field machine. “Latest package” means the locally staged, release-controlled MSI.

## Repair strategy

Windows **Apps & features → GreEnergy PRIZM → Repair**, or:

```text
msiexec /fa GreEnergy_PRIZM_Setup.msi
```

Windows Installer restores missing/versioned Program Files components, retains ProgramData configuration and operational data, reasserts service configuration, and starts the service.

## Uninstall strategy

Standard uninstall stops and removes the service, shortcuts, and Program Files binaries while preserving ProgramData by default. This conservative default protects field logs, configuration, backups, and telemetry evidence.

For a confirmed full data removal, an administrator may run uninstall with `REMOVEUSERDATA=1` after exporting required evidence. The current WiX source reserves this secure property; the destructive data-removal custom action and final confirmation dialog must be completed and validated before enabling it in a signed field MSI. Until then, ProgramData removal is intentionally manual.

## Upgrade behavior

`MajorUpgrade` rejects downgrades and performs an in-place machine-wide upgrade using a stable UpgradeCode. Stable GUIDs own service/configuration/shortcuts. Harvested application components are regenerated from the immutable release payload. ProgramData components are permanent and `NeverOverwrite`, preserving:

- settings
- logs
- backups
- telemetry/cache
- staged update content

## Packaging

Run on a Windows x64 release workstation:

1. Install Node/npm, Rust MSVC prerequisites, Tauri prerequisites, .NET SDK, and WiX v5.
2. Run `package-windows.ps1` to build PRIZM and the manager, download checksum-pinned runtime/service dependencies, stage production dependencies, and create `artifacts\payload`.
3. Run `build-msi.ps1` to compile `GreEnergy_PRIZM_Setup.msi`.
4. Run `release-windows.ps1 -CertificateThumbprint ...` to build, Authenticode-sign, timestamp, and print the release SHA-256.

Build artifacts and third-party binaries are ignored by Git.

## Validation matrix

The MSI must be promoted only after testing in clean Windows 10/11 and Windows Server VMs:

| Scenario | Required evidence |
|---|---|
| Fresh install | No developer tools installed; folders/ACLs/shortcuts/service correct; manager opens; service reaches healthy |
| Restart and graceful stop | Exact service transitions; WinSW log confirms graceful exit inside timeout |
| Crash recovery | Kill child process; SCM/WinSW restarts it; health recovers |
| Repair | Remove a Program Files asset; repair restores it and restarts service |
| Major upgrade | Previous version upgrades in place; config/logs/backups/cache retained |
| Uninstall | Service and binaries removed; ProgramData retained |
| Manager | All buttons, status, process metrics, settings validation, log filters/export, backup/restore tested |
| Health | Existing endpoints represented accurately under healthy, starting, degraded, and unreachable states |
| Offline | Installation, launch, service, manager, health, logs, and backup operate with network disconnected |

These lifecycle tests require Windows and cannot be truthfully completed on macOS.

## Known limitations

- MSI compilation and lifecycle testing require Windows.
- WebView2 is normally present on supported Windows 10/11 systems. A fully disconnected image that lacks it requires the approved offline WebView2 runtime to be added to the release prerequisites.
- The first update design consumes a locally staged MSI; network auto-update is intentionally absent.
- Full ProgramData deletion is deliberately not automated until a tested confirmation dialog/custom action is available.
- The current application package version is `0.0.0`; release engineering must assign monotonic three-field MSI versions before field distribution.

## Code signing

Production releases should use an organization-validated Authenticode certificate held in an HSM or managed signing service, never a repository file. Sign the manager executable, WinSW executable where licensing permits re-signing, and final MSI using SHA-256 with RFC 3161 timestamping. Record signer identity, toolchain versions, dependency hashes, MSI hash, source commit, and SBOM in the release manifest. Validate signatures with `signtool verify /pa /all` on a clean Windows VM.

Future auto-update should accept only signed packages from an authenticated site-controlled channel, verify publisher and expected SHA-256 before elevation, support staged rollback, and remain disabled by default for offline/NERC environments.
