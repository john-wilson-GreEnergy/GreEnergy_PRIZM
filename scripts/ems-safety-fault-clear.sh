#!/usr/bin/env bash
set -euo pipefail

dependency_install_command() {
  if command -v apt-get >/dev/null 2>&1; then
    printf '%s\n' 'apt-get update && apt-get install -y python3 ca-certificates'
  elif command -v dnf >/dev/null 2>&1; then
    printf '%s\n' 'dnf install -y python3 ca-certificates'
  elif command -v yum >/dev/null 2>&1; then
    printf '%s\n' 'yum install -y python3 ca-certificates'
  elif command -v apk >/dev/null 2>&1; then
    printf '%s\n' 'apk add --no-cache python3 ca-certificates'
  elif command -v zypper >/dev/null 2>&1; then
    printf '%s\n' 'zypper --non-interactive install python3 ca-certificates'
  elif command -v brew >/dev/null 2>&1; then
    printf '%s\n' 'brew install python'
  else
    return 1
  fi
}

check_dependencies() {
  echo "Dependency check:"
  echo "  [OK] Bash ${BASH_VERSION%%(*}"
  if command -v python3 >/dev/null 2>&1; then
    echo "  [OK] $(python3 --version 2>&1)"
    return 0
  fi

  echo "  [MISSING] Python 3"
  local install_command=""
  install_command="$(dependency_install_command || true)"
  if [[ -z "$install_command" ]]; then
    echo "No supported package manager was detected. Install Python 3, then rerun this utility." >&2
    return 1
  fi
  echo "  Proposed installation: $install_command"
  if [[ ! -t 0 ]]; then
    echo "Interactive installation is unavailable. Run the command above as an administrator." >&2
    return 1
  fi
  local answer=""
  printf 'Type yes to install the missing dependency: ' >&2
  read -r answer </dev/tty
  if [[ "${answer,,}" != "yes" ]]; then
    echo "Installation cancelled. Nothing was changed."
    return 1
  fi

  local elevated=()
  if (( EUID != 0 )) && [[ "$install_command" != brew* ]]; then
    if ! command -v sudo >/dev/null 2>&1; then
      echo "Administrator access is required, but sudo is unavailable." >&2
      return 1
    fi
    elevated=(sudo)
  fi
  echo "Installing Python 3 and certificate support..."
  # The command is selected exclusively from the fixed package-manager list above.
  if [[ "$install_command" == *" && "* ]]; then
    "${elevated[@]}" apt-get update
    "${elevated[@]}" apt-get install -y python3 ca-certificates
  else
    read -r -a install_parts <<<"$install_command"
    "${elevated[@]}" "${install_parts[@]}"
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "Python 3 installation did not complete successfully." >&2
    return 1
  fi
  echo "  [OK] $(python3 --version 2>&1)"
}

show_intro() {
  local bold=$'\033[1m' dim=$'\033[2m' green=$'\033[32m' yellow=$'\033[33m' white=$'\033[37m' reset=$'\033[0m'
  command -v clear >/dev/null 2>&1 && clear || true
  cat >&2 <<EOF
${green}
.·:'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''':·.
: :   _______ .______       _______  _______ .__   __.  _______ .______        ___________    ____ : :
: :  /  _____||   _  \\     |   ____||   ____||  \\ |  | |   ____||   _  \\      /  _____\\   \\  /   / : :
: : |  |  __  |  |_)  |    |  |__   |  |__   |   \\|  | |  |__   |  |_)  |    |  |  __  \\   \\/   /  : :
: : |  | |_ | |      /     |   __|  |   __|  |  . \`  | |   __|  |      /     |  | |_ |  \\_    _/   : :
: : |  |__| | |  |\\  \\----.|  |____ |  |____ |  |\\   | |  |____ |  |\\  \\----.|  |__| |    |  |     : :
: :  \\______| | _| \`._____||_______||_______||__| \\__| |_______|| _| \`._____| \\______|    |__|     : :
'·:................................................................................................:·'
${reset}
${bold}${green}GreEnergy Resources LLC${reset}
${dim}${white}EMS Safety Fault Scan and Manual Clear Utility · Version 1.2${reset}

${bold}${yellow}SAFETY NOTICE${reset}
${white}This utility sends a live ManualClearDeviceFault command to the connected EMS.
Use it only after the underlying condition has been inspected and corrected.
Clearing a fault does not correct an active electrical, thermal, moisture, fire,
communications, or equipment condition. The EMS must explicitly report the
target as eligible, communicating, and enabled before a command can be sent.${reset}

${dim}${white}The utility performs a second eligibility check immediately before submission
and rescans EMS afterward to verify whether reset eligibility cleared.${reset}
EOF
  printf '\n%sPress Enter to acknowledge and continue...%s' "$dim$white" "$reset" >&2
  read -r _
}

# Keep noninteractive list/help output machine-friendly.
check_dependencies || exit 1
echo
if [[ $# -eq 0 && -t 0 ]]; then
  show_intro
fi

exec python3 - "$@" <<'PY'
import argparse
import json
import re
import sys
import time
import uuid
import urllib.error
import urllib.request


def prompt(message):
    """Read operator input from the terminal; stdin contains this embedded program."""
    print(message, end="", file=sys.stderr, flush=True)
    with open("/dev/tty", "r") as terminal:
        answer = terminal.readline()
    if answer == "":
        raise EOFError
    return answer.rstrip("\r\n")


def http_json(url, timeout=5):
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def normalize_key(value):
    return str(value or "").replace("-", "_").replace(":", "_")


def plain_text(value):
    return re.sub(r"<[^>]*>", "", str(value or "")).strip()


def location_from_identity(item):
    """Recover station and block from keys such as OCDK-ST:BHE0020-B:1-OCD:211."""
    for value in (item.get("entityKey"), item.get("token"), item.get("display"), item.get("resetKey")):
        match = re.search(r"(?:^|[-_])ST[:_]([A-Za-z0-9]+)[-_]B[:_](\d+)(?:[-_]|$)", str(value or ""), re.IGNORECASE)
        if match:
            return match.group(1), int(match.group(2))
    return "", 0


def candidate(row, source):
    entity_key = str(row.get("entityKey") or "")
    token = str(row.get("entityKeyToken") or normalize_key(entity_key))
    return {
        "entityKey": entity_key,
        "token": token,
        "resetKey": entity_key if source == "lastCall" else token,
        "display": str(row.get("displayKey") or entity_key or token),
        "status": plain_text(row.get("statusMessage")),
        "allow": row.get("allowFaultReset") is True,
        "communicating": row.get("communicating") is True,
        "enabled": row.get("enabled") is True,
        "station": str(row.get("stationCode") or ""),
        "block": row.get("blockIndex"),
        "source": source,
    }


def walk_last_call(value, found):
    if isinstance(value, dict):
        if isinstance(value.get("entityKey"), str) and "allowFaultReset" in value:
            found.append(candidate(value, "lastCall"))
        for child in value.values():
            walk_last_call(child, found)
    elif isinstance(value, list):
        for child in value:
            walk_last_call(child, found)


def blockviewer_rows(value):
    if isinstance(value, list):
        return value
    if not isinstance(value, dict):
        return []
    rows = list(value.get("topology") or [])
    for array in value.get("arrays") or []:
        if isinstance(array, dict):
            rows.append(array)
            rows.extend(array.get("strings") or [])
    return rows


def discover(base):
    block = http_json(base + "/tools/monitor/ems/blockviewer/data")
    last_call = http_json(base + "/tools/report/ems/lastCall.json")
    merged = {}
    for row in blockviewer_rows(block):
        if isinstance(row, dict) and row.get("entityKeyToken"):
            item = candidate(row, "blockviewer")
            merged[item["token"]] = item
    last_rows = []
    walk_last_call(last_call, last_rows)
    for item in last_rows:
        token = normalize_key(item["entityKey"])
        if token in merged:
            merged[token].update({
                "allow": item["allow"], "communicating": item["communicating"],
                "enabled": item["enabled"], "resetKey": item["entityKey"],
                "status": item["status"] or merged[token]["status"],
                "station": item["station"] or merged[token]["station"],
                "block": item["block"] or merged[token]["block"], "source": "both",
            })
        else:
            item["token"] = token
            merged[token] = item
    return merged


def varint(number):
    result = bytearray()
    while number > 0x7f:
        result.append((number & 0x7f) | 0x80)
        number >>= 7
    result.append(number)
    return bytes(result)


def field_varint(number, value):
    return varint(number << 3) + varint(value)


def field_bytes(number, value):
    data = value.encode() if isinstance(value, str) else bytes(value)
    return varint((number << 3) | 2) + varint(len(data)) + data


def build_command(station, block, entity_key, username):
    endpoint = field_varint(1, 3) + field_bytes(2, station) + field_varint(3, block)
    manual_clear = field_bytes(1, entity_key)
    payload = field_bytes(51, manual_clear)
    command_id = str(uuid.uuid4())
    command = (
        field_bytes(1, command_id) + field_bytes(4, endpoint) +
        field_bytes(5, endpoint) + field_bytes(6, payload) + field_bytes(7, username)
    )
    return command_id, command


def send_command(base, body):
    request = urllib.request.Request(
        base + "/tools/controls/ems/command", data=body, method="POST",
        headers={"Content-Type": "application/octet-stream", "Accept": "text/plain, application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, response.read(4000).decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read(4000).decode("utf-8", "replace")


parser = argparse.ArgumentParser(description="Discover and clear EMS safety faults without PRIZM.")
parser.add_argument("--ems", default="http://10.0.0.3:8080/turtle", help="EMS Turtle base URL")
parser.add_argument("--list", action="store_true", help="List live eligible targets without prompting")
parser.add_argument("--target", help="Exact entityKeyToken from --list")
parser.add_argument("--station", help="Station code override when the target does not report one")
parser.add_argument("--block", type=int, help="Block index override when the target does not report one")
parser.add_argument("--username", default="ems-terminal", help="Operator name recorded in the EMS command")
args = parser.parse_args()
base = args.ems.rstrip("/")

def scan():
    try:
        targets = discover(base)
    except Exception as error:
        print(f"Scan failed: {error}", file=sys.stderr)
        return {}, []
    eligible = sorted(
        (item for item in targets.values() if item["allow"] and item["communicating"] and item["enabled"]),
        key=lambda item: item["token"],
    )
    return targets, eligible


def show_eligible(eligible):
    if not eligible:
        print("No live targets currently permit a safety fault reset.")
        return
    print(f"{len(eligible)} eligible target(s):")
    for index, item in enumerate(eligible, 1):
        detail = f" — {item['status']}" if item["status"] else ""
        print(f"  {index}. {item['display']} [{item['token']}]{detail}")


def parse_selection(text, count):
    text = text.strip().lower().replace(" ", "")
    if text == "all":
        return list(range(count))
    selected = []
    for part in text.split(","):
        if not part:
            raise ValueError
        if "-" in part:
            start_text, end_text = part.split("-", 1)
            start, end = int(start_text), int(end_text)
            if start > end:
                raise ValueError
            values = range(start, end + 1)
        else:
            values = [int(part)]
        for value in values:
            if value < 1 or value > count:
                raise ValueError
            index = value - 1
            if index not in selected:
                selected.append(index)
    if not selected:
        raise ValueError
    return selected


def target_location(target):
    identity_station, identity_block = location_from_identity(target)
    station = (args.station or target["station"] or identity_station).strip()
    try:
        block = args.block or int(target["block"] or identity_block)
    except (TypeError, ValueError):
        block = 0
    return station, block


def clear_targets(targets):
    ready = []
    print(f"\nSelected {len(targets)} target(s):")
    for target in targets:
        station, block = target_location(target)
        if not station or block < 1:
            print(f"  SKIPPED {target['display']}: station or block is missing.")
            continue
        ready.append((target, station, block))
        print(f"  {target['display']} — {target['status'] or 'No status text reported'}")
        print(f"    Station {station}, Block {block}")
    if not ready:
        print("No selected targets can be submitted. Nothing was sent.")
        return
    print(f"EMS: {base}")
    if prompt(f"Type yes to clear {len(ready)} selected fault(s): ").strip().lower() != "yes":
        print("Cancelled. Nothing was sent.")
        return

    queued = {}
    for target, station, block in ready:
        print(f"\nPreflight: {target['display']}...")
        try:
            fresh = discover(base)
        except Exception as error:
            print(f"FAILED: fresh EMS scan could not complete: {error}")
            queued[target["token"]] = False
            continue
        verified = fresh.get(target["token"])
        if not verified or not verified["allow"] or not verified["communicating"] or not verified["enabled"]:
            print("SKIPPED: target is no longer eligible, communicating, and enabled.")
            queued[target["token"]] = False
            continue
        command_id, command = build_command(station, block, verified["resetKey"], args.username)
        status, response = send_command(base, command)
        print(f"EMS HTTP status: {status} · Command ID: {command_id}")
        if response.strip():
            print(f"EMS response: {response.strip()}")
        queued[target["token"]] = status == 200
        print("QUEUED" if status == 200 else "FAILED: EMS did not accept the command.")

    pending = {token for token, accepted in queued.items() if accepted}
    if not pending:
        print("\nNo commands were queued; verification was not started.")
        return
    verified_tokens = set()
    timeout_seconds, interval_seconds = 45, 3
    deadline = time.monotonic() + timeout_seconds
    print(f"\nVerifying queued commands for up to {timeout_seconds} seconds...")
    while pending and time.monotonic() < deadline:
        time.sleep(interval_seconds)
        try:
            after_targets = discover(base)
        except Exception as error:
            print(f"Verification scan delayed: {error}")
            continue
        cleared = {token for token in pending if token not in after_targets or not after_targets[token]["allow"]}
        for token in sorted(cleared):
            print(f"VERIFIED: {token} no longer reports reset eligibility.")
        verified_tokens.update(cleared)
        pending.difference_update(cleared)
        if pending:
            remaining = max(0, int(deadline - time.monotonic()))
            print(f"Waiting for EMS: {len(pending)} target(s) pending, {remaining}s remaining...")
    for token in sorted(pending):
        print(f"NOT VERIFIED: {token} still permits a reset after {timeout_seconds} seconds.")
    print(f"Verification complete: {len(verified_tokens)} verified, {len(pending)} still pending.")


if args.list:
    _, eligible = scan()
    show_eligible(eligible)
    sys.exit(0)

if args.target:
    targets, _ = scan()
    target = targets.get(args.target) or targets.get(normalize_key(args.target))
    if not target or not target["allow"] or not target["communicating"] or not target["enabled"]:
        print("Target is not currently eligible, communicating, and enabled.", file=sys.stderr)
        sys.exit(4)
    clear_targets([target])
    sys.exit(0)

scanned = []
while True:
    print("\nEMS Safety Fault Utility")
    print("  1. Scan for faults")
    print(f"  2. Clear scanned faults{' (' + str(len(scanned)) + ' available)' if scanned else ' (scan required)'}")
    print("  3. Exit")
    try:
        choice = prompt("Choose an action [1-3]: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\nExiting.")
        break
    if choice == "1":
        print("\nScanning EMS...")
        _, scanned = scan()
        show_eligible(scanned)
    elif choice == "2":
        if not scanned:
            print("Run a scan first. No clear command was sent.")
            continue
        show_eligible(scanned)
        try:
            selection_text = prompt("Select faults (example: 1-8 or 2-5,8,10,20-23) or type all: ")
            selected_indices = parse_selection(selection_text, len(scanned))
            selected_targets = [scanned[index] for index in selected_indices]
        except ValueError:
            print("Invalid selection. Nothing was sent. Use numbers, ranges, comma lists, or all.")
            continue
        clear_targets(selected_targets)
        print("Refreshing the scanned fault list...")
        _, scanned = scan()
        show_eligible(scanned)
    elif choice == "3":
        print("Exiting.")
        break
    else:
        print("Invalid choice. Select 1, 2, or 3.")
PY
