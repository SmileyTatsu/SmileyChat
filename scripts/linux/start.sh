#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."

if ! command -v bun &> /dev/null; then
    if [ -f "$HOME/.bun/bin/bun" ]; then
        export PATH="$HOME/.bun/bin:$PATH"
    else
        echo "Bun is required to run SmileyChat, but it was not found on your system."
        if ! command -v curl &> /dev/null; then
            echo "curl is required to download Bun, but it was not found."
            echo "Please install curl using your package manager (e.g., sudo apt install -y curl)."
            exit 1
        fi
        if ! command -v unzip &> /dev/null; then
            echo "unzip is required by Bun's installer, but it was not found."
            echo "Please install unzip using your package manager (e.g., sudo apt install -y unzip)."
            exit 1
        fi
        echo "SmileyChat can download and install Bun to $HOME/.bun via https://bun.sh."
        read -p "Do you want to download and install Bun now? (Y/N): " -n 1 -r
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
    echo "Required dependencies (node_modules) are not installed."
    read -p "Do you want to install dependencies now using Bun? (Y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Installing dependencies..."
        bun install
    else
        echo "Cannot run SmileyChat without installed dependencies."
        exit 1
    fi
fi

if [ ! -f "dist/index.html" ]; then
    echo "Building SmileyChat frontend..."
    bun run build
fi

echo "Starting SmileyChat..."
bun run start
