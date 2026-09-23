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

# The mouse wheel inside a pair needs pi 0.85.1 or newer; everything else works on older releases.
version="$(pi --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
if [ -n "$version" ] && [ "$(printf '%s\n0.85.1\n' "$version" | sort -V | head -1)" != "0.85.1" ]; then
	echo "note: pi $version does not deliver mouse events into the conversation; the wheel inside"
	echo "      answers needs pi 0.85.1 or newer. Keyboard controls work either way."
fi
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

Mouse: the left half of the pane scrolls inside the pair under the pointer,
the right half scrolls the conversation (pi 0.85.1 or newer).

Undo: restore settings.json.before-pi-reverse next to your settings file.
MSG
