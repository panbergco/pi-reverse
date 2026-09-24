#!/usr/bin/env bash
# Install pi-reverse on this machine.
#
#   curl -fsSL https://raw.githubusercontent.com/panbergco/pi-reverse/main/install.sh | bash
#
# Installs the extension from npm and turns on fullscreen mode, which it needs.
# Nothing else is touched; the previous settings are backed up next to the file.
set -euo pipefail

AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
SETTINGS="$AGENT_DIR/settings.json"
SOURCE="npm:pi-reverse"

command -v pi >/dev/null || { echo "pi is not installed"; exit 1; }

# The mouse wheel inside a pair needs pi 0.85.1 or newer; everything else works on older releases.
version="$(pi --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
if [ -n "$version" ] && [ "$(printf '%s\n0.85.1\n' "$version" | sort -V | head -1)" != "0.85.1" ]; then
	echo "note: pi $version does not deliver mouse events into the conversation; the wheel inside"
	echo "      answers needs pi 0.85.1 or newer. Keyboard controls work either way."
fi

[ -f "$SETTINGS" ] || { mkdir -p "$AGENT_DIR"; echo '{}' > "$SETTINGS"; }
cp "$SETTINGS" "$SETTINGS.before-pi-reverse"

# Fullscreen on, and an earlier install from GitHub dropped so npm does not load it a second time.
# Any other pi-reverse entry, such as a local checkout, is kept.
python3 - "$SETTINGS" <<'SETTINGS_PY'
import json, sys
path = sys.argv[1]
settings = json.load(open(path))
packages = settings.setdefault("packages", [])
packages[:] = [p for p in packages if str(p) != "git:github.com/panbergco/pi-reverse"]
mode = settings.get("tuiMode")
settings["tuiMode"] = "fullscreen"
json.dump(settings, open(path, "w"), indent=2)
print(f"tuiMode: {mode or 'unset'} -> fullscreen")
SETTINGS_PY

# `pi install` downloads the package. Listing it in settings alone does not.
if grep -q 'pi-reverse' "$SETTINGS"; then
	echo "pi-reverse is already configured here; left as it is."
else
	pi install "$SOURCE"
fi

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
