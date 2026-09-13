#!/usr/bin/env bash
# Install pi-reverse on this machine.
#
#   curl -fsSL https://raw.githubusercontent.com/panbergco/pi-reverse/main/install.sh | bash
#
# Adds the extension to pi's packages and turns on fullscreen mode, which it needs.
# Nothing else is touched; the previous settings are backed up next to the file.
set -euo pipefail

AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
SETTINGS="$AGENT_DIR/settings.json"
SOURCE="git:github.com/panbergco/pi-reverse"

command -v pi >/dev/null || { echo "pi is not installed"; exit 1; }
[ -f "$SETTINGS" ] || { mkdir -p "$AGENT_DIR"; echo '{}' > "$SETTINGS"; }
cp "$SETTINGS" "$SETTINGS.before-pi-reverse"

python3 - "$SETTINGS" "$SOURCE" <<'PY'
import json, sys
path, source = sys.argv[1], sys.argv[2]
settings = json.load(open(path))
packages = settings.setdefault("packages", [])
if not any(source in str(entry) for entry in packages):
    packages.append(source)
mode = settings.get("tuiMode")
settings["tuiMode"] = "fullscreen"
json.dump(settings, open(path, "w"), indent=2)
print(f"packages: {len(packages)} · tuiMode: {mode or 'unset'} -> fullscreen")
PY

cat <<'MSG'

Installed. Start a new pi session and the prompt will be at the top.

  /reverse            show every setting
  /reverse flip       back to the bottom-docked layout
  alt+j / alt+k       jump between Q&A pairs
  alt+e               expand the answer you are on

The mouse wheel inside an answer needs a patched pi (upstream issue #9538);
the keyboard controls work on the stock release. See the README for the fork.

Undo: restore settings.json.before-pi-reverse next to your settings file.
MSG
