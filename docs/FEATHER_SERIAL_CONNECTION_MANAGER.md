# Feather Serial Connection Manager

PRIZM's **Feather / HVAC → Serial Mode Inventory** view inventories the
`feather.modbusv1.poller.serialConnectionType` value and Tomcat 8 state on the
Feather devices in the active site topology.

## Target discovery

PRIZM uses the existing topology/profile and Turtle IP-map discovery pipeline.
Collection Segment Feathers use host `.3`. Energy Segment Feathers use `.10`
and increments of five through `.110`; only devices present in the current
canonical site inventory are offered. The configured site size determines which
of those addresses are present, so a 20-ES lineup normally ends at `.105`.

## Safe operation

- Scanning is read-only.
- Credentials remain in process memory and are not written to disk or audit logs.
- Host-key checking is bypassed only for this workflow; it does not modify the
  host's global SSH configuration or known-hosts file.
- Applying requires target selection and an exact typed confirmation.
- Targets already set to the requested value are skipped, while their Tomcat
  status is still verified.
- Every changed XML file receives a timestamped `.prizm-backup-*` copy.
- The operation changes only the named parameter, restarts Tomcat 8, waits, and
  then verifies both the value and service state.
- Results are written to `data/audit/feather_serial_connection_audit.jsonl`
  without credentials.

## Standalone operation

The equivalent utility is `scripts/feather-serial-inventory.sh`. It is read-only
unless `--set` is supplied.

```bash
./scripts/feather-serial-inventory.sh --scan --arrays 1-8 --es-count 20
./scripts/feather-serial-inventory.sh --scan --targets-file feather-ips.txt
./scripts/feather-serial-inventory.sh --set pjc --array 3 --es-count 20
```

SSH keys are used by default. If passwords are required, provide `SSH_PASSWORD`
and optionally `SUDO_PASSWORD` in the command environment. The target-file form
accepts one Feather IP per line and rejects addresses outside the supported
Feather addressing pattern.
