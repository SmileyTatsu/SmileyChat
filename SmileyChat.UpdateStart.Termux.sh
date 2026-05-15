#!/data/data/com.termux/files/usr/bin/sh
# SmileyChat update-and-start for Termux on Android.
# Pairs with the bun-termux shim (see docs/android-termux.md).
#
# The shim makes process.platform report "linux" at runtime, so deps with
# platform-specific native bindings (rolldown, esbuild) need the Linux build
# at runtime — fetched via --os=linux on install. --backend=copyfile avoids
# hardlink failures on Termux's filesystem.

set -e

cd "$(dirname "$0")"

if ! command -v git >/dev/null 2>&1; then
    echo "Git is required. Run: pkg install git"
    exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
    echo "Bun is required. See docs/android-termux.md for the install path."
    exit 1
fi

if [ ! -d .git ]; then
    echo "This folder is not a Git checkout. Clone SmileyChat first."
    exit 1
fi

echo "Updating SmileyChat..."
git pull --ff-only

echo "Installing dependencies..."
BUN_OPTIONS="--backend=copyfile --os=linux" bun install

echo "Building SmileyChat..."
BUN_OPTIONS="--os=linux" bun run build

echo "Starting SmileyChat..."
echo "Open http://127.0.0.1:4173 in your browser."
BUN_OPTIONS="--os=linux" bun run start
