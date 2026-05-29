#!/usr/bin/env bash
# batch_configure_site_layout.sh
# Apply site-specific ARRAYS_ALLOWED / STRINGS_ALLOWED to your script set in one shot.

set -euo pipefail

# --------------------------- Settings ---------------------------------
# Target scripts in the current directory (only those that exist will be touched)
FILES=(
  "new_simulate.sh"              # uses ARRAYS_ALLOWED
  "new_mio_test.sh"              # uses ARRAYS_ALLOWED
  "new_local_notifications.sh"   # uses ARRAYS_ALLOWED + STRINGS_ALLOWED
  "new_feather_comms.sh"         # uses ARRAYS_ALLOWED
  "new_string_viewer.sh"         # optional; uses ARRAYS_ALLOWED + STRINGS_ALLOWED (if you added it)
)

# --------------------------- Helpers ----------------------------------
timestamp() { date +"%Y%m%d-%H%M%S"; }

# replace_or_insert VAR=... line
# - If a line starting with VAR= exists, replace it
# - Otherwise, insert a new line after the shebang (#!) or at file top
replace_or_insert() {
  local file="$1" var="$2" value="$3"
  local assign_line
  assign_line="${var}=\"${value}\""

  # Try to replace first; if no replacement, insert after shebang
  if perl -0777 -pe 'BEGIN{$v=$ENV{VAR};$line=$ENV{ASSIGN}}
                     $n = (s/^\Q$v\E=.*$/$line/m);
                     END{exit($n?0:1)}' \
        -i -- "$file"; then
    :
  else
    # Insert after shebang if present, else at top
    if perl -0777 -ne 'print; END{exit 0}' -- "$file" | head -n1 | grep -q '^#!'; then
      perl -0777 -pe 'BEGIN{$line=$ENV{ASSIGN}."\n"}
                      s/^(#!.*\n)/$1$line/m' \
           -i -- "$file"
    else
      tmp="$(mktemp)"; printf '%s\n' "$assign_line" >"$tmp"; cat "$file" >>"$tmp"; mv "$tmp" "$file"
    fi
  fi
}

# Safe in-place set of a variable (with backup)
set_var() {
  local file="$1" var="$2" value="$3"
  local bak="${file}.bak.$(timestamp)"
  cp -p -- "$file" "$bak" 2>/dev/null || cp -p "$file" "$bak"
  VAR="$var" ASSIGN="${var}=\"${value}\"" replace_or_insert "$file" "$var" "$value"
  echo "  - ${file}: set ${var}=\"${value}\"   (backup: $(basename "$bak"))"
}

# --------------------------- Prompt -----------------------------------
echo "Enter ARRAYS_ALLOWED        (examples: 1-8   |  1,2,5-7,12   |  auto)"
read -r ARRAYS_ALLOWED_INPUT
ARRAYS_ALLOWED_INPUT="${ARRAYS_ALLOWED_INPUT//[$'\t\r\n ']/}"   # strip spaces

echo "Enter STRINGS_ALLOWED       (examples: auto   |  1-42        |  1,2,5-10)"
read -r STRINGS_ALLOWED_INPUT
STRINGS_ALLOWED_INPUT="${STRINGS_ALLOWED_INPUT//[$'\t\r\n ']/}" # strip spaces

# Basic sanity check (not strict—accepts "auto" or digits/commas/dashes)
valid_spec() {
  [[ "$1" == "auto" || "$1" =~ ^[0-9][0-9,-]*$ ]]
}
if ! valid_spec "$ARRAYS_ALLOWED_INPUT"; then
  echo "ERROR: ARRAYS_ALLOWED must be 'auto' or a list/range like 1-8 or 1,2,5-7" >&2
  exit 1
fi
if ! valid_spec "$STRINGS_ALLOWED_INPUT"; then
  echo "ERROR: STRINGS_ALLOWED must be 'auto' or a list/range like 1-42 or 1,2,5-10" >&2
  exit 1
fi

# --------------------------- Apply ------------------------------------
echo
echo "Patching scripts in: $(pwd)"
echo "  ARRAYS_ALLOWED = \"$ARRAYS_ALLOWED_INPUT\""
echo "  STRINGS_ALLOWED = \"$STRINGS_ALLOWED_INPUT\""
echo

any=0
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue
  any=1
  chmod +w "$f" 2>/dev/null || true

  # Always set ARRAYS_ALLOWED (all four scripts use it)
  set_var "$f" "ARRAYS_ALLOWED" "$ARRAYS_ALLOWED_INPUT"

  # Only set STRINGS_ALLOWED if the script already references it
  if grep -q '^STRINGS_ALLOWED=' "$f" 2>/dev/null || grep -q 'STRINGS_ALLOWED' "$f" 2>/dev/null; then
    set_var "$f" "STRINGS_ALLOWED" "$STRINGS_ALLOWED_INPUT"
  else
    # Silence: some scripts don't use STRINGS_ALLOWED by design
    :
  fi

  # Ensure executable bit
  chmod +x "$f" 2>/dev/null || true
done

if [[ $any -eq 0 ]]; then
  echo "No target scripts found. Place this script next to your scripts and rerun." >&2
  exit 1
fi

echo
echo "Done. Updated values have been written and backups (*.bak.<timestamp>) were created."
echo "You can rerun this script anytime to change site layout safely."
