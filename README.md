# Traylist

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)

Local-first system tray list for **Ubuntu**, **macOS**, and **Windows**, plus an **Android** app that syncs over the same Wi‑Fi.

**Site:** [haroon966.github.io/traylist](https://haroon966.github.io/traylist/) · **Privacy:** todos stay on your devices; LAN sync is opt-in.

## Features

- System tray icon with open-count badge / tooltip — click opens the panel (inline add) top-right
- Add, complete, delete todos (local JSON store — no account)
- Auto icons from keywords (`buy`, `meet`, `email`, …)
- Markdown-lite in titles: `**bold**`, `*italic*`, `` `code` ``
- Natural due dates (`tomorrow 3pm`, `fri`, `in 2h`) + sort (overdue → today → later)
- OS notifications when due; snooze `10m` / `1h` / `tomorrow` on overdue chips
- Global hotkey: **Ctrl+Shift+Space** (Windows/Linux) or **Cmd+Shift+Space** (macOS)
- Undo with **Ctrl/Cmd+Z**
- Launch at login toggle
- Export / restore JSON; export Markdown
- **Same-WiFi sync** — desktop hosts, phone pairs once via **QR code** (or 6-digit code), then auto-reconnects
- Follows OS light / dark appearance
- Esc or click-away closes the popup (app stays in tray)

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable)
- OS webview / build deps (see below)
- **Android build:** Android Studio / SDK + NDK (Tauri uses `$ANDROID_HOME`)

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

### macOS

Xcode Command Line Tools:

```bash
xcode-select --install
```

### Windows

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- WebView2 (usually preinstalled on Windows 10/11)

## Develop (desktop)

```bash
npm install
npm run tauri dev
```

The window starts hidden — use the **tray icon** or the global hotkey to open it (panel docks **top-right**).

On Ubuntu Wayland, Traylist forces `GDK_BACKEND=x11` so window placement works (Wayland blocks `set_position`).

## Android

First-time (already done if `src-tauri/gen/android` exists):

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
npm run tauri android init
```

Run on a device/emulator:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
npm run tauri android dev
```

Release APK/AAB:

```bash
npm run tauri android build
```

## Wi‑Fi sync

1. On the **desktop**, open Traylist → **⋯ → Wi‑Fi Sync…** → enable sync.
2. A **QR code** and 6-digit code appear (LAN IP + port).
3. On **Android**, open **Wi‑Fi Sync…** → **Scan QR code** (or Find desktop + enter the code).
4. Pair once. After that, both sides push updates over the local WebSocket whenever they’re on the same network.

If the phone cannot reach the desktop and **UFW/firewalld** is on, open the port **once** (password prompt only for this step — not on every app launch):

```bash
sudo ufw allow 17834/tcp comment 'Traylist Wi-Fi sync'
mkdir -p ~/.local/share/traylist && echo 'tcp/17834' > ~/.local/share/traylist/firewall-17834.ok
```

Or use **⋯ → Wi‑Fi Sync… → Allow through firewall (once)** in the app.

Forget devices on the desktop to rotate the code and drop old tokens.

Checks:

```bash
npm run check:sync
```

## Build installers (desktop)

```bash
npm run tauri build
```

Artifacts appear under `src-tauri/target/release/bundle/`:

| OS | Typical outputs |
|----|-----------------|
| Linux | `.deb`, AppImage |
| macOS | `.dmg`, `.app` |
| Windows | `.msi`, `.exe` |

## Tips

- Type `Buy **milk** tomorrow 3pm` to see icon + bold + due chip
- Right-click / ⋯ for Quit; tray click opens the list + add panel (not a native Open menu)
- Closing the popup hides to tray; use **Quit** from ⋯ to exit

## Privacy

Todos stay on your devices. LAN sync is opt-in, token-gated, and never leaves your Wi‑Fi.
