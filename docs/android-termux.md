# Running SmileyChat on Android via Termux

SmileyChat runs on Android phones through **Termux** plus a community-built Bun compatibility shim called **bun-termux**. This is a power-user install — there is no Play Store APK yet — but if you have used a terminal before you can be running in 15–20 minutes. Updates after the first install take under a minute.

The install is non-trivial because Bun has no native Android target. Bun's official binary is built against glibc, which Termux's Bionic libc does not provide. The `bun-termux` project ([Happ1ness-dev/bun-termux](https://github.com/Happ1ness-dev/bun-termux)) bridges that gap with an `LD_PRELOAD` shim plus the `glibc-runner` Termux package. It is currently the only documented Bun-on-Termux install path that works end-to-end.

## What you need

- An Android phone running Android 7 (Nougat) or newer.
- **An aarch64 (real ARM) device.** Any phone made after 2017 is fine. This walkthrough does **not** work on x86_64 Termux — Android emulators (BlueStacks, NoxPlayer, Windows Subsystem for Android, Android-x86, Genymotion, etc.) ship x86_64 Termux, and the `bun-termux` shim's Makefile is hardcoded to the `aarch64-linux-android` / `aarch64-linux-gnu` targets. Compilation of the shim will fail on x86_64 with `cannot open .../aarch64-unknown-linux-android/libclang_rt.builtins.a`.
- About 1 GB of free storage (Termux + glibc + Bun + SmileyChat).
- 15–20 minutes for the first install. Updates after that take under a minute.

After Step 1 below, verify your Termux is on aarch64 before going further:

```sh
dpkg --print-architecture
```

It must print `aarch64`. If it prints `x86_64`, stop here — this install path doesn't apply to your setup.

## Step 1 — Install Termux from F-Droid

**Do not install Termux from the Google Play Store.** The Play Store version has been unmaintained since 2020 and will fail in confusing ways on modern Android. Use F-Droid.

1. Phone browser → https://f-droid.org/ → tap "Download F-Droid".
2. Install the F-Droid APK (allow installs from unknown sources when prompted).
3. Open F-Droid, search for **Termux**, install it.
4. Open Termux — you should see a terminal prompt.

## Step 2 — Install Termux packages

`glibc-runner` lives in a separate repo that `glibc-repo` enables. apt resolves a whole install transaction against the current index *before* installing anything, so it has to be done in two passes: install `glibc-repo` first, refresh the index, then install everything else.

```sh
pkg update -y && pkg upgrade -y
pkg install -y glibc-repo
pkg update
pkg install -y git curl clang make python resolv-conf glibc-runner compiler-rt-glibc libunwind-glibc-static
```

This pulls in:

- **git, curl** — for cloning and downloads
- **clang, make, python** — for building the bun-termux shim from source
- **resolv-conf** — provides `/etc/resolv.conf` so DNS works for the glibc side
- **glibc-repo** — enables the glibc package repository (separate pass so the next install can see it)
- **glibc-runner** — provides a glibc shim layer that lets glibc binaries run under Termux's Bionic environment
- **compiler-rt-glibc** — clang's runtime for the `aarch64-linux-gnu` target the bun-termux shim build uses (clang defaults to Termux's Bionic compiler-rt, which is the wrong runtime for shim compilation)
- **libunwind-glibc-static** — static unwinder for the same target; the shim needs it at link time

## Step 3 — Fix DNS for the glibc side

```sh
ln -sf "$PREFIX/etc/resolv.conf" "$PREFIX/glibc/etc/resolv.conf"
```

The glibc shim has its own filesystem layout. Without a working DNS config, any process that tries to resolve a hostname (like `bun install` fetching from npm) fails with `Connection refused`. Symlinking Termux's `resolv.conf` into the glibc tree fixes that.

## Step 4 — Install Bun (the standard way)

```sh
curl -fsSL https://bun.sh/install | bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

This runs Bun's official installer, then writes the Bun PATH entry into `~/.bashrc` (the `>>` redirect also creates the file if it doesn't exist yet — a fresh Termux home has no `~/.bashrc`, which would otherwise make `source` fail). `source ~/.bashrc` reloads the shell so the new PATH is active.

**Do not run `bun --version` yet.** The binary is glibc-linked and will not execute on Termux directly until the next step installs the shim.

## Step 5 — Install the bun-termux shim

```sh
git clone https://github.com/Happ1ness-dev/bun-termux.git ~/bun-termux
cd ~/bun-termux
make
make install
```

This is the key step. `bun-termux` builds a small native shim (`bun-shim.so`) that, via `LD_PRELOAD`, intercepts a handful of syscalls Bun makes and translates between glibc expectations and Termux's Bionic environment. After `make install`, the `bun` command on your PATH transparently runs through the shim.

If `make` fails complaining about Bun's version, the shim's compatibility script may be lagging Bun's latest release. Pin Bun to a known-good version (`1.3.14` is validated):

```sh
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"
cd ~/bun-termux && make && make install
```

## Step 6 — Verify Bun works

```sh
bun --version
```

You should see a version number like `1.3.x`. **That's the success signal.** Bun is now running natively in Termux.

## Step 7 — Clone SmileyChat

```sh
cd ~
git clone https://github.com/SmileyTatsu/SmileyChat.git
cd SmileyChat
```

## Step 8 — Build and run

The `SmileyChat.UpdateStart.Termux.sh` script in the repo is the single command you'll run from here on out:

```sh
./SmileyChat.UpdateStart.Termux.sh
```

It does, in order:

1. `git pull --ff-only` — pulls the latest changes (no-op on a fresh clone).
2. `BUN_OPTIONS="--backend=copyfile --os=linux" bun install` — installs dependencies. `--backend=copyfile` prevents hardlink failures on Termux's filesystem; `--os=linux` tells Bun to fetch the Linux-target native binaries for deps like rolldown and esbuild (the bun-termux shim makes `process.platform` report `linux` at runtime, so Linux builds are what actually get loaded).
3. `BUN_OPTIONS="--os=linux" bun run build` — typechecks and bundles the frontend.
4. `BUN_OPTIONS="--os=linux" bun run start` — starts the server.

First-time install takes 1–3 minutes on a phone (most of that is `bun install`). Subsequent runs are much faster.

When the server is up, you'll see:

```
SmileyChat running at http://127.0.0.1:4173
```

## Step 9 — Browse to it

**Don't close Termux.** Switch apps (recents button) and open your phone's browser. Go to **http://127.0.0.1:4173**. SmileyChat loads.

## Keep the server alive in the background

While the Termux session is open, the server is up. To stop Android from suspending it:

1. Swipe down the notification shade.
2. Find the Termux notification, tap **Acquire wakelock**.
3. The phone won't suspend Termux until you manually release it.

## Updating

```sh
cd ~/SmileyChat
./SmileyChat.UpdateStart.Termux.sh
```

The script pulls the latest commits, reinstalls dependencies (no-op if nothing changed), rebuilds (incremental), and restarts the server.

## Optional — one-tap launcher from your home screen

If you don't want to open Termux and type the command every time, install **Termux:Widget** from F-Droid (same source as Termux). It pairs with Termux to expose home-screen shortcuts.

In Termux:

```sh
mkdir -p ~/.shortcuts
cat > ~/.shortcuts/SmileyChat << 'EOF'
#!/data/data/com.termux/files/usr/bin/sh
cd ~/SmileyChat
./SmileyChat.UpdateStart.Termux.sh
EOF
chmod +x ~/.shortcuts/SmileyChat
```

Then on your home screen, long-press → **Widgets** → drag the **Termux:Widget** shortcut to the screen. When it asks which script, pick **SmileyChat**. Tapping the icon now opens Termux, runs the update-and-start script, and you switch to your browser to use the app.

## Stop the server

Switch back to Termux, press **Volume-down + C** (Termux's Ctrl-C). The server stops and you get a normal prompt back.

## Where your data lives

`~/SmileyChat/userData/` contains characters, chats, personas, plugin storage. That directory is gitignored, so `SmileyChat.UpdateStart.Termux.sh` will never overwrite it. To back up everything, copy that folder somewhere safe.

To move data between devices, copy `~/SmileyChat/userData/` between them.

## Troubleshooting

**`make` in Step 5 fails with `cannot open .../aarch64-unknown-linux-android/libclang_rt.builtins.a` or `unable to find library -l:libunwind.a`:** your Termux is x86_64, not aarch64. `bun-termux`'s Makefile hardcodes the aarch64 target. Run `dpkg --print-architecture` — if it prints `x86_64`, you're on an Android emulator (BlueStacks, NoxPlayer, WSA, Android-x86, etc.) and this install path does not apply. There is no fix on the SmileyChat side; the limitation is upstream in `bun-termux`. To test SmileyChat, use a real ARM phone or an aarch64 Android emulator.

**`source: /root/.bashrc: No such file or directory` (or similar) at Step 4:** a fresh Termux home has no `~/.bashrc`. The updated Step 4 uses `echo '...' >> ~/.bashrc`, which both creates the file (if missing) and writes the Bun PATH entry. If you ran the older version of Step 4, fix it now: `echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc`.

**`make` fails in Step 5 with errors mentioning `compiler-rt` or `libunwind`:** Step 2's package list was missing `compiler-rt-glibc` and `libunwind-glibc-static`. The updated Step 2 includes both. If you installed earlier without them: `pkg install -y compiler-rt-glibc libunwind-glibc-static`, then re-run `make` in `~/bun-termux`.

**`E: Unable to locate package glibc-runner` during Step 2:** you ran `pkg install glibc-repo glibc-runner` in one command instead of the two-pass form. apt resolves the whole transaction against the current index before installing, so glibc-runner isn't visible until glibc-repo is installed and the index is refreshed. Re-run Step 2's commands in order (`pkg install -y glibc-repo` → `pkg update` → `pkg install -y git curl clang make python resolv-conf glibc-runner`).

**`bun --version` says "cannot execute: required file not found":** the `bun-termux` shim isn't loaded. Make sure Step 5 finished without errors and that you're using bash (not sh). If you opened a new Termux window after Step 4, run `source ~/.bashrc` again.

**`bun install` says "Connection refused" or hangs forever on the package list step:** the `resolv.conf` symlink from Step 3 didn't take. Re-run that command (`ln -sf "$PREFIX/etc/resolv.conf" "$PREFIX/glibc/etc/resolv.conf"`) and try again.

**`bun install` fails with `EACCES` or hardlink errors:** make sure the script (or your environment) sets `BUN_OPTIONS="--backend=copyfile --os=linux"`. The `SmileyChat.UpdateStart.Termux.sh` does this automatically when Termux is detected — if you're running `bun install` by hand, set it yourself.

**Rolldown/rollup says "Cannot find native binding" or "could not load @rolldown/binding-..." :** you didn't include `--os=linux` in `BUN_OPTIONS` on install. Without that flag, Bun fetches binaries that match the host's "real" platform (Android), but the bun-termux shim makes `process.platform` report `linux` at runtime, so the binary loader looks for the Linux build instead. Wipe and reinstall: `rm -rf node_modules bun.lock dist && BUN_OPTIONS="--backend=copyfile --os=linux" bun install`.

**`make` in the bun-termux step fails:** the shim's compat script may need a Bun version older than `latest`. Try installing `bun-v1.3.14` explicitly (see the pinned-version block in Step 5).

**Browser shows "site can't be reached":** the Termux server isn't running. Switch to Termux and confirm you still see `SmileyChat running at ...`. If you see a `$` prompt instead, the server stopped — re-run `./SmileyChat.UpdateStart.Termux.sh`.

**Port 4173 already in use:** set a different port before starting:
```sh
export SMILEYCHAT_PORT=4180
./SmileyChat.UpdateStart.Termux.sh
```
Then browse to `http://127.0.0.1:4180`.

**Phone gets warm during long sessions:** normal for any long-running CPU workload. Plug in the phone for multi-hour use. Thin phones may throttle after 30–60 minutes unplugged.

## Why this is more involved than a regular Linux install

A regular Linux box has a real glibc dynamic linker at `/lib/ld-linux-aarch64.so.1`, native symlink support, and a consistent `/proc/version`. Termux is Bionic-based and lacks all of that. The combination of `glibc-runner` (a glibc shim) and `bun-termux` (an `LD_PRELOAD` syscall translator) lets Bun and its npm ecosystem think they're running on a normal Linux machine.

It's not magic. Edge cases exist — a few npm packages with native binaries may fail at install time, and a Bun upgrade can briefly break compatibility with the shim until the `bun-termux` project ships a matching update. SmileyChat's current dependency set has been validated to work with this setup.

## Credit

This walkthrough leans entirely on [Happ1ness-dev/bun-termux](https://github.com/Happ1ness-dev/bun-termux) for solving the hard part. SmileyChat just runs on top of their work.
