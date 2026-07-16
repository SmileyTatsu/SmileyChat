#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."

if ! command -v bun &> /dev/null; then
    if [ -f "$HOME/.bun/bin/bun" ]; then
        export PATH="$HOME/.bun/bin:$PATH"
    else
        echo "Bun is required to run SmileyChat, but it was not found."
        read -p "Do you want to install Bun now? (Y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            curl -fsSL https://bun.sh/install | bash
            export PATH="$HOME/.bun/bin:$PATH"
        else
            echo "Please install Bun manually from https://bun.sh"
            exit 1
        fi
    fi
fi

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    bun install
fi

echo "Building SmileyChat..."
bun run build

echo "Starting SmileyChat..."
bun run start
