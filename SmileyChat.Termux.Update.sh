#!/data/data/com.termux/files/usr/bin/sh
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"
exec sh ./scripts/termux/update-start.sh
