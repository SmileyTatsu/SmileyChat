#!/data/data/com.termux/files/usr/bin/sh
# SmileyChat startup for Termux on Android.
# Pairs with the bun-termux shim (see docs/android-termux.md).

set -e

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR/../.."

if ! command -v bun >/dev/null 2>&1; then
    echo "Bun is required. See docs/android-termux.md for the install path."
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "Required dependencies (node_modules) are not installed."
    echo "SmileyChat will install dependencies using Bun."
    printf "Do you want to install dependencies now? (Y/N): "
    read REPLY
    case "$REPLY" in
        [Yy]*)
            echo "Installing dependencies..."
            BUN_OPTIONS="--backend=copyfile --os=linux" bun install
            ;;
        *)
            echo "Cannot run SmileyChat without installed dependencies."
            exit 1
            ;;
    esac
fi

if [ ! -f "dist/index.html" ]; then
    echo "Building SmileyChat..."
    BUN_OPTIONS="--os=linux" bun run build
fi

echo "Starting SmileyChat..."
BUN_OPTIONS="--os=linux" bun run start
