#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

echo "=== SmileyChat Termux Installer ==="

# --- Architecture check ---
ARCH="$(dpkg --print-architecture)"
if [ "$ARCH" != "aarch64" ]; then
  echo
  echo "ERROR: This installer only works on aarch64 Android devices."
  echo "Current architecture: $ARCH"
  echo
  echo "If this is an emulator (BlueStacks, WSA, Nox, Android-x86, etc.),"
  echo "bun-termux will not compile."
  exit 1
fi

# --- Update packages ---
echo
echo "=== Updating Termux packages ==="
export DEBIAN_FRONTEND=noninteractive

pkg update -y
pkg upgrade -y -o Dpkg::Options::="--force-confold" -o Dpkg::Options::="--force-confdef"

# --- Install glibc repo first (required two-pass install) ---
echo
echo "=== Installing glibc repo ==="
pkg install -y glibc-repo

pkg update -y

# --- Install dependencies ---
echo
echo "=== Installing dependencies ==="
pkg install -y \
  git \
  curl \
  clang \
  make \
  python \
  resolv-conf \
  glibc-runner \
  compiler-rt-glibc \
  libunwind-glibc-static

# --- Fix DNS for glibc ---
echo
echo "=== Fixing DNS for glibc ==="
mkdir -p "$PREFIX/glibc/etc"
ln -sf "$PREFIX/etc/resolv.conf" "$PREFIX/glibc/etc/resolv.conf"

# --- Install Bun ---
echo
echo "=== Installing Bun ==="

# Pin known-good version for bun-termux compatibility
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"

# Ensure PATH exists in bashrc
touch ~/.bashrc

if ! grep -q 'export PATH="$HOME/.bun/bin:$PATH"' ~/.bashrc; then
  echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
fi

export PATH="$HOME/.bun/bin:$PATH"

# --- Install bun-termux shim ---
echo
echo "=== Installing bun-termux shim ==="

if [ -d "$HOME/bun-termux" ]; then
  if [ -d "$HOME/bun-termux/.git" ]; then
    BUN_TERMUX_REMOTE="$(git -C "$HOME/bun-termux" remote get-url origin 2>/dev/null || true)"
    case "$BUN_TERMUX_REMOTE" in
      *Happ1ness-dev/bun-termux* ) ;;
      "" )
        echo
        echo "ERROR: $HOME/bun-termux has no origin remote."
        echo "Move it aside or remove it, then run this installer again."
        exit 1
        ;;
      * )
        echo
        echo "ERROR: $HOME/bun-termux uses an unexpected origin remote:"
        echo "$BUN_TERMUX_REMOTE"
        echo "Move it aside or remove it, then run this installer again."
        exit 1
        ;;
    esac
    git -C "$HOME/bun-termux" pull --ff-only
  else
    echo
    echo "ERROR: $HOME/bun-termux already exists but is not a Git checkout."
    echo "Move it aside or remove it, then run this installer again."
    exit 1
  fi
else
  git clone https://github.com/Happ1ness-dev/bun-termux.git "$HOME/bun-termux"
fi

cd "$HOME/bun-termux"

make
make install

# --- Verify Bun works ---
echo
echo "=== Verifying Bun ==="

if ! bun --version; then
  echo
  echo "ERROR: Bun failed to run after shim install."
  exit 1
fi

# --- Clone SmileyChat ---
echo
echo "=== Installing SmileyChat ==="

cd ~

if [ ! -d "$HOME/SmileyChat" ]; then
  git clone https://github.com/SmileyTatsu/SmileyChat.git
elif [ ! -d "$HOME/SmileyChat/.git" ] || [ ! -f "$HOME/SmileyChat/scripts/termux/update-start.sh" ]; then
  echo
  echo "ERROR: $HOME/SmileyChat already exists but does not look like a SmileyChat Git checkout."
  echo "Move it aside or remove it, then run this installer again."
  exit 1
else
  SMILEYCHAT_REMOTE="$(git -C "$HOME/SmileyChat" remote get-url origin 2>/dev/null || true)"
  case "$SMILEYCHAT_REMOTE" in
    *SmileyTatsu/SmileyChat* ) ;;
    "" )
      echo
      echo "ERROR: $HOME/SmileyChat has no origin remote."
      echo "Move it aside or remove it, then run this installer again."
      exit 1
      ;;
    * )
      echo
      echo "ERROR: $HOME/SmileyChat uses an unexpected origin remote:"
      echo "$SMILEYCHAT_REMOTE"
      echo "Move it aside or remove it, then run this installer again."
      exit 1
      ;;
  esac
fi

cd "$HOME/SmileyChat"

chmod +x ./SmileyChat.Termux.sh ./scripts/termux/update-start.sh || true

# --- Start SmileyChat ---
echo
echo "=== Starting SmileyChat ==="

export BUN_OPTIONS="--backend=copyfile --os=linux"

sh ./scripts/termux/update-start.sh
