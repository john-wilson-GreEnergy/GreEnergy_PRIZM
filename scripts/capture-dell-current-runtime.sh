#!/usr/bin/env bash
set -euo pipefail

# Read-only capture of the application files selected by the Dell's PRIZM
# services. The live release directories are never modified and services are
# neither stopped nor restarted. Site configuration, credentials, logs,
# telemetry, caches and account data are deliberately excluded.

capture_date="$(date -u +%Y%m%dT%H%M%SZ)"
capture_root="/home/ebc/prizm-runtime-capture-${capture_date}"
archive="${capture_root}.tar.gz"

releases=(
  "/opt/prizm-fleet/releases/power-display-collector-20261109-r2"
  "/opt/prizm-fleet/releases/power-display-20261109-r2"
  "/opt/prizm-fleet/releases/workspaces-20261001"
)
units=(
  "prizm.service"
  "prizm-site@ss4.service"
  "prizm-fleet.service"
)

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo so every deployed application file can be read." >&2
  exit 1
fi
if [[ -e "${capture_root}" || -e "${archive}" ]]; then
  echo "Refusing to overwrite an existing capture: ${capture_root}" >&2
  exit 1
fi

install -d -m 0750 -o ebc -g ebc "${capture_root}/releases" "${capture_root}/evidence"

{
  printf 'capturedAtUtc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'hostname=%s\n' "$(hostname)"
  printf 'kernel=%s\n' "$(uname -srmo)"
  printf 'node=%s\n' "$(node --version 2>/dev/null || printf unavailable)"
  printf 'currentSymlink=%s\n' "$(readlink -f /opt/prizm-fleet/current)"
} >"${capture_root}/evidence/platform.txt"

for unit in "${units[@]}"; do
  systemctl show "${unit}" \
    --property=Id,LoadState,ActiveState,SubState,UnitFileState,ExecMainStartTimestamp,ExecMainPID,NRestarts,ExecStart,FragmentPath,DropInPaths \
    >"${capture_root}/evidence/${unit}.show.txt"
done

for source in "${releases[@]}"; do
  if [[ ! -d "${source}/dist" ]]; then
    echo "Missing expected deployed directory: ${source}/dist" >&2
    exit 1
  fi
  if find "${source}/dist" -type l -print -quit | grep -q .; then
    echo "Symlinks are not permitted in captured application files: ${source}/dist" >&2
    exit 1
  fi
  release="$(basename "${source}")"
  install -d -m 0750 -o ebc -g ebc "${capture_root}/releases/${release}"
  cp -a --no-preserve=ownership "${source}/dist" "${capture_root}/releases/${release}/dist"
  (
    cd "${source}/dist"
    find . -type f -print0 | sort -z | xargs -0 sha256sum
  ) >"${capture_root}/evidence/${release}.live.sha256"
  (
    cd "${capture_root}/releases/${release}/dist"
    find . -type f -print0 | sort -z | xargs -0 sha256sum
  ) >"${capture_root}/evidence/${release}.capture.sha256"
  cmp "${capture_root}/evidence/${release}.live.sha256" \
      "${capture_root}/evidence/${release}.capture.sha256"
done

chown -R ebc:ebc "${capture_root}"
tar -C /home/ebc -czf "${archive}" "$(basename "${capture_root}")"
chown ebc:ebc "${archive}"
sha256sum "${archive}" | tee "${archive}.sha256"
chown ebc:ebc "${archive}.sha256"

echo
echo "Capture complete. No service was changed or restarted."
echo "Archive: ${archive}"
echo "Checksum: ${archive}.sha256"
