#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./uninstall-headless.sh --purge [--yes]

Completely removes this PRIZM installation, its systemd service, and all data
stored inside the installation directory. Any external PRIZM_CACHE_DIR,
PRIZM_HISTORY_DIR, or PRIZM_THERMAL_DIR declared in .env is also listed and
removed after the same confirmation.

--purge  Required acknowledgement that application data will be deleted.
--yes    Non-interactive mode for managed decommissioning.
EOF
}

purge=false
assume_yes=false
for argument in "$@"; do
  case "$argument" in
    --purge) purge=true ;;
    --yes) assume_yes=true ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; echo "Unknown option: $argument" >&2; exit 2 ;;
  esac
done

if [[ $purge != true ]]; then
  usage >&2
  echo 'Refusing to continue without --purge.' >&2
  exit 2
fi
if [[ $(uname -s) != Linux ]] || ! command -v systemctl >/dev/null; then
  echo 'This uninstaller requires Linux with systemd.' >&2
  exit 1
fi
if [[ $EUID -eq 0 ]]; then
  echo 'Run as the non-root deployment account; sudo will be requested when needed.' >&2
  exit 1
fi
if ! command -v sudo >/dev/null; then
  echo 'sudo is required to remove the PRIZM service and installation.' >&2
  exit 1
fi

app_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)

# Refuse broad or ambiguous deletion targets even when --yes was supplied.
case "$app_dir" in
  /|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/opt|/root|/run|/sbin|/srv|/tmp|/usr|/var)
    echo "Unsafe installation path: $app_dir" >&2
    exit 1
    ;;
esac
if [[ ! -f $app_dir/package.json || ! -f $app_dir/install-headless.sh || ! -f $app_dir/start-production.cjs ]]; then
  echo "$app_dir does not look like a complete PRIZM installation; refusing to delete it." >&2
  exit 1
fi
if ! grep -q 'GreEnergy PRIZM' "$app_dir/README.md" 2>/dev/null; then
  echo 'PRIZM repository marker was not found; refusing to delete the directory.' >&2
  exit 1
fi

declare -a purge_paths=("$app_dir")
if [[ -f $app_dir/.env ]]; then
  while IFS='=' read -r key value; do
    case "$key" in
      PRIZM_CACHE_DIR|PRIZM_HISTORY_DIR|PRIZM_THERMAL_DIR)
        value=${value%$'\r'}
        value=${value#\"}; value=${value%\"}
        value=${value#\'}; value=${value%\'}
        [[ -n $value ]] || continue
        if [[ $value != /* ]]; then value="$app_dir/$value"; fi
        resolved=$(realpath -m "$value")
        case "$resolved" in
          /|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/opt|/root|/run|/sbin|/srv|/tmp|/usr|/var)
            echo "Unsafe external data path in .env: $resolved" >&2
            exit 1
            ;;
        esac
        purge_paths+=("$resolved")
        ;;
    esac
  done < "$app_dir/.env"
fi

echo 'PRIZM PURGE PLAN'
echo '----------------'
echo 'Service: prizm.service'
printf 'Delete:  %s\n' "${purge_paths[@]}"
echo
echo 'This removes PRIZM, node_modules, builds, configuration, audit records,'
echo 'uploaded assets, cached telemetry, historical telemetry, and saved profiles.'
echo 'Node.js and shared Ubuntu packages are intentionally retained.'

if [[ $assume_yes != true ]]; then
  read -r -p 'Type PURGE PRIZM to continue: ' confirmation
  if [[ $confirmation != 'PURGE PRIZM' ]]; then
    echo 'Purge cancelled.'
    exit 1
  fi
fi

sudo -v
sudo systemctl disable --now prizm.service 2>/dev/null || true
sudo rm -f -- /etc/systemd/system/prizm.service
for backup in /etc/systemd/system/prizm.service.backup.*; do
  [[ -e $backup ]] && sudo rm -f -- "$backup"
done
sudo systemctl daemon-reload
sudo systemctl reset-failed prizm.service 2>/dev/null || true

# Remove external stores before deleting the repository that contains this script.
for target in "${purge_paths[@]}"; do
  [[ $target == "$app_dir" ]] && continue
  if [[ -e $target ]]; then sudo rm -rf -- "$target"; fi
done

cd /
sudo rm -rf -- "$app_dir"

echo 'PRIZM and its saved application data have been purged.'
echo 'System journal history and shared packages were not removed.'

