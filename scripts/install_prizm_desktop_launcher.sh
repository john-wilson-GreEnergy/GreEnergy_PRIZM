#!/usr/bin/env bash
set -euo pipefail

app_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
desktop_dir=${XDG_DESKTOP_DIR:-$HOME/Desktop}
mkdir -p "$desktop_dir"

case $(uname -s) in
  Darwin)
    launcher="$desktop_dir/PRIZM.app"
    staging_dir=$(mktemp -d)
    trap 'rm -r "$staging_dir"' EXIT
    staged_app="$staging_dir/PRIZM.app"
    osacompile -o "$staged_app" "$app_dir/scripts/PRIZMLauncher.applescript"
    printf '#!/usr/bin/env bash\nexec %q\n' "$app_dir/scripts/prizm_desktop_start.sh" > "$staged_app/Contents/Resources/start.sh"
    chmod +x "$staged_app/Contents/Resources/start.sh"
    cp "$app_dir/scripts/assets/PRIZM.icns" "$staged_app/Contents/Resources/PRIZM.icns"
    plutil -replace CFBundleName -string PRIZM "$staged_app/Contents/Info.plist"
    plutil -replace CFBundleDisplayName -string PRIZM "$staged_app/Contents/Info.plist"
    plutil -replace CFBundleIdentifier -string com.greenergy.prizm.launcher "$staged_app/Contents/Info.plist"
    plutil -replace CFBundleIconFile -string PRIZM.icns "$staged_app/Contents/Info.plist"
    codesign --force --sign - "$staged_app" >/dev/null
    codesign --verify --deep --strict "$staged_app"
    if [[ -d $launcher ]]; then
      mv "$launcher" "$staging_dir/previous.app"
    fi
    if ! ditto "$staged_app" "$launcher"; then
      rm -r "$launcher"
      if [[ -d $staging_dir/previous.app ]]; then
        mv "$staging_dir/previous.app" "$launcher"
      fi
      exit 1
    fi
    codesign --verify --deep --strict "$launcher"
    ;;
  Linux)
    launcher="$desktop_dir/GreEnergy PRIZM.desktop"
    cat > "$launcher" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=GreEnergy PRIZM
Comment=Start PRIZM and open its dashboard
Exec="$app_dir/scripts/prizm_desktop_start.sh"
Icon=utilities-system-monitor
Terminal=false
Categories=Utility;
EOF
    chmod +x "$launcher"
    ;;
  *) echo "Desktop launcher is supported on macOS and Linux." >&2; exit 1 ;;
esac

echo "One-click launcher installed: $launcher"
