# Running SmileyChat on Android via Termux

SmileyChat can run on Android phones through Termux plus a community-built Bun compatibility shim called `bun-termux`.

This is a power-user install. The easy installer is the recommended path, and the manual path is documented for people who want to understand or debug each step.

## What You Need

- Android 7 or newer.
- Termux from F-Droid, not the Google Play Store.
- An aarch64 Android device.
- About 1 GB of free storage.
- 15 to 20 minutes for the first install.

This does not work on x86_64 Termux. Android emulators such as BlueStacks, NoxPlayer, Windows Subsystem for Android, Android-x86, and Genymotion usually provide x86_64 Termux. The `bun-termux` shim build expects aarch64 targets.

After installing Termux, check your architecture:

```sh
dpkg --print-architecture
```

It must print:

```text
aarch64
```

If it prints `x86_64`, stop here. This install path does not apply to your setup.

## Install Termux

Do not install Termux from the Google Play Store. That version has been unmaintained since 2020 and can fail in confusing ways on modern Android.

1. Open your phone browser.
2. Go to `https://f-droid.org/`.
3. Download and install F-Droid.
4. Open F-Droid.
5. Search for Termux and install it.
6. Open Termux.

## Method 1: Easy Installer

This is the recommended method. It fetches and runs SmileyChat's Termux installer from GitHub:

```sh
curl -fsSL https://raw.githubusercontent.com/SmileyTatsu/SmileyChat/main/scripts/termux/install.sh | bash
```

The installer does the following:

1. Verifies that Termux is running on aarch64.
2. Updates Termux packages.
3. Installs the glibc repository and required build dependencies.
4. Installs Bun.
5. Builds and installs the `bun-termux` shim.
6. Clones SmileyChat into `~/SmileyChat` if needed.
7. Builds and starts SmileyChat.

When the server starts, open this URL in your Android browser:

```text
http://127.0.0.1:4173
```

After the first install, start or update SmileyChat with:

```sh
cd ~/SmileyChat
sh ./SmileyChat.Termux.sh
```

## Method 2: Manual Install

Use this method if you want to do every step yourself or debug the installer.

### Step 1: Install Termux packages

`glibc-runner` lives in a separate package repository enabled by `glibc-repo`. Install `glibc-repo` first, refresh package indexes, then install the remaining packages.

```sh
pkg update -y
pkg upgrade -y
pkg install -y glibc-repo
pkg update -y
pkg install -y git curl clang make python resolv-conf glibc-runner compiler-rt-glibc libunwind-glibc-static
```

These packages are used for:

- `git` and `curl`: cloning and downloads.
- `clang`, `make`, and `python`: building the `bun-termux` shim.
- `resolv-conf`: DNS configuration for the glibc side.
- `glibc-repo`: enabling Termux glibc packages.
- `glibc-runner`: running glibc binaries in Termux.
- `compiler-rt-glibc`: clang runtime for the glibc target.
- `libunwind-glibc-static`: static unwinder required by the shim build.

### Step 2: Fix DNS for glibc

```sh
mkdir -p "$PREFIX/glibc/etc"
ln -sf "$PREFIX/etc/resolv.conf" "$PREFIX/glibc/etc/resolv.conf"
```

Without this symlink, `bun install` can fail with connection or DNS errors when fetching packages.

### Step 3: Install Bun

Pin Bun to the known-good version validated with this setup:

```sh
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"
```

Add Bun to your shell path:

```sh
touch ~/.bashrc
grep -q 'export PATH="$HOME/.bun/bin:$PATH"' ~/.bashrc || echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/.bun/bin:$PATH"
```

Do not run `bun --version` yet. The Bun binary needs the `bun-termux` shim before it can run correctly in Termux.

### Step 4: Install the bun-termux shim

```sh
git clone https://github.com/Happ1ness-dev/bun-termux.git ~/bun-termux
cd ~/bun-termux
make
make install
```

After `make install`, the `bun` command on your path should run through the shim.

### Step 5: Verify Bun

```sh
bun --version
```

You should see a version number like `1.3.x`.

### Step 6: Clone SmileyChat

```sh
cd ~
git clone https://github.com/SmileyTatsu/SmileyChat.git
cd SmileyChat
```

### Step 7: Build and run

```sh
sh ./SmileyChat.Termux.sh
```

The launcher does the following:

1. Runs `git pull --ff-only`.
2. Runs `BUN_OPTIONS="--backend=copyfile --os=linux" bun install`.
3. Runs `BUN_OPTIONS="--os=linux" bun run build`.
4. Runs `BUN_OPTIONS="--os=linux" bun run start`.

When the server starts, open this URL in your Android browser:

```text
http://127.0.0.1:4173
```

## Keeping the Server Alive

Do not close Termux while using SmileyChat. To reduce the chance that Android suspends the process:

1. Swipe down the notification shade.
2. Find the Termux notification.
3. Tap `Acquire wakelock`.

## Updating

```sh
cd ~/SmileyChat
sh ./SmileyChat.Termux.sh
```

This pulls the latest commits, installs dependencies if needed, rebuilds the app, and starts the server.

## Optional Home Screen Launcher

If you do not want to open Termux and type the command every time, install Termux:Widget from F-Droid.

In Termux:

```sh
mkdir -p ~/.shortcuts
cat > ~/.shortcuts/SmileyChat << 'EOF'
#!/data/data/com.termux/files/usr/bin/sh
cd ~/SmileyChat
sh ./SmileyChat.Termux.sh
EOF
chmod +x ~/.shortcuts/SmileyChat
```

Then long-press your Android home screen, open Widgets, add the Termux:Widget shortcut, and choose `SmileyChat`.

## Stop the Server

Switch back to Termux and press `Volume-down + C`. The server stops and you get a normal prompt back.

## Where Your Data Lives

SmileyChat stores local user data here:

```text
~/SmileyChat/userData/
```

That folder contains characters, chats, personas, plugin storage, and settings. It is gitignored, so updating SmileyChat will not overwrite it.

To move data between devices, copy `~/SmileyChat/userData/`.

## Troubleshooting

### `dpkg --print-architecture` prints `x86_64`

This setup requires aarch64 Termux. Use a real ARM Android device or an aarch64 Android environment.

### `E: Unable to locate package glibc-runner`

You probably tried to install `glibc-repo` and `glibc-runner` in the same command. Run the package commands in the documented order:

```sh
pkg install -y glibc-repo
pkg update -y
pkg install -y glibc-runner
```

### `make` fails with compiler-rt or libunwind errors

Install the missing glibc build packages:

```sh
pkg install -y compiler-rt-glibc libunwind-glibc-static
```

Then rerun:

```sh
cd ~/bun-termux
make
make install
```

### `bun --version` says `cannot execute: required file not found`

The `bun-termux` shim is not installed or is not being used. Make sure `make install` completed successfully in `~/bun-termux`, then reopen Termux or reload your path.

### `bun install` says `Connection refused` or hangs

The glibc DNS symlink may be missing. Re-run:

```sh
mkdir -p "$PREFIX/glibc/etc"
ln -sf "$PREFIX/etc/resolv.conf" "$PREFIX/glibc/etc/resolv.conf"
```

### `bun install` fails with hardlink or EACCES errors

Use the copyfile backend:

```sh
BUN_OPTIONS="--backend=copyfile --os=linux" bun install
```

### Native binding errors from rolldown or rollup

The dependencies were probably installed without `--os=linux`. Reinstall them:

```sh
rm -rf node_modules
BUN_OPTIONS="--backend=copyfile --os=linux" bun install
```

### Browser shows `site can't be reached`

The server is not running. Switch back to Termux. If you see a shell prompt instead of the server log, restart SmileyChat:

```sh
cd ~/SmileyChat
sh ./SmileyChat.Termux.sh
```

### Port 4173 is already in use

Set another port before starting:

```sh
export SMILEYCHAT_PORT=4180
sh ./SmileyChat.Termux.sh
```

Then open:

```text
http://127.0.0.1:4180
```

## Why This Is More Involved Than Regular Linux

Bun does not currently ship a native Android target. Its official binary is built for glibc Linux, while Termux normally uses Android's Bionic libc.

The `glibc-runner` package and the `bun-termux` shim make Bun and its npm dependencies behave like they are running on regular Linux. This is why the install needs glibc packages, a compatibility shim, and `BUN_OPTIONS="--os=linux"` for native dependencies.

## Credit

This walkthrough depends on [Happ1ness-dev/bun-termux](https://github.com/Happ1ness-dev/bun-termux) for the Bun compatibility layer. SmileyChat runs on top of that work.
