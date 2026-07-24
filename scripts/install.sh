#!/usr/bin/env bash
# Traylist desktop installer — fetches the latest GitHub Release artifact.
# Usage: curl -fsSL https://raw.githubusercontent.com/Haroon966/traylist/main/scripts/install.sh | bash
set -euo pipefail

REPO="${TRAYLIST_REPO:-Haroon966/traylist}"
ALLOW_PRERELEASE="${TRAYLIST_PRERELEASE:-0}"
PREFIX="${TRAYLIST_PREFIX:-$HOME/.local}"
TMPDIR="${TMPDIR:-/tmp}"
WORK="$(mktemp -d "${TMPDIR%/}/traylist-install.XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

info()  { printf '==> %s\n' "$*"; }
warn()  { printf 'warning: %s\n' "$*" >&2; }
die()   { printf 'error: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

download() {
  local url="$1" out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 --retry-delay 1 -o "$out" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$out" "$url"
  else
    die "need curl or wget"
  fi
}

json_get() {
  # stdin: GitHub releases JSON → stdout: selected fields via python/node
  local py
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$@" <<'PY'
import json, os, sys
allow_pre = os.environ.get("TRAYLIST_PRERELEASE", "0") == "1"
data = json.load(sys.stdin)
# latest endpoint returns one release; /releases returns a list
if isinstance(data, list):
    rels = data
    if not allow_pre:
        rels = [r for r in rels if not r.get("prerelease") and not r.get("draft")]
    if not rels:
        sys.exit(2)
    rel = rels[0]
else:
    rel = data
    if rel.get("draft") or (rel.get("prerelease") and not allow_pre):
        sys.exit(2)

tag = rel.get("tag_name") or ""
assets = rel.get("assets") or []
want_os, want_arch, prefer = sys.argv[1], sys.argv[2], sys.argv[3]

def score(name: str) -> int:
    n = name.lower()
    # skip signatures / updater packs / blockmaps
    if n.endswith((".sig", ".json", ".blockmap")):
        return -1
    if n.endswith((".tar.gz", ".zip")) and not n.endswith(".app.tar.gz"):
        return -1
    s = 0
    if want_os == "linux" and not n.endswith((".deb", ".appimage", ".rpm")):
        return -1
    if want_os == "darwin" and not (n.endswith(".dmg") or n.endswith(".app.tar.gz")):
        return -1
    if want_os == "windows" and not (n.endswith((".msi", ".exe"))):
        return -1
    # require OS token when present in naming pattern
    if want_os == "linux" and "linux" not in n and not n.endswith((".deb", ".appimage", ".rpm")):
        return -1
    if want_os == "darwin" and not any(x in n for x in ("darwin", "macos", "mac")):
        # still allow plain Traylist_x.y.z_aarch64.dmg
        if not n.endswith((".dmg", ".app.tar.gz")):
            return -1
    if want_os == "windows" and not any(x in n for x in ("windows", "win", "nsis", "setup")):
        if not n.endswith((".msi", ".exe")):
            return -1

    arch_map = {
        "amd64": ("amd64", "x86_64", "x64", "x86-64"),
        "arm64": ("arm64", "aarch64"),
    }
    arch_ok = any(a in n for a in arch_map.get(want_arch, ()))
    if arch_ok:
        s += 50
    elif want_os == "darwin" and "universal" in n:
        s += 40
    elif not any(a in n for group in arch_map.values() for a in group):
        s += 10  # no arch in filename
    else:
        return -1

    pref_order = prefer.split(",")
    for i, p in enumerate(pref_order):
        p = p.strip().lower()
        if not p:
            continue
        if n.endswith(p) or (p.startswith(".") and n.endswith(p)):
            s += 30 - i
            break
        if p in n:
            s += 20 - i
            break
    else:
        s += 1
    return s

best = None
best_s = -1
for a in assets:
    name = a.get("name") or ""
    url = a.get("browser_download_url") or ""
    sc = score(name)
    if sc > best_s:
        best_s = sc
        best = (name, url, tag)

if not best or best_s < 0:
    sys.exit(3)
print(best[0])
print(best[1])
print(best[2])
PY
    return $?
  fi
  if command -v node >/dev/null 2>&1; then
    TRAYLIST_PRERELEASE="$ALLOW_PRERELEASE" node - "$1" "$2" "$3" <<'NODE'
const fs = require("fs");
const allowPre = process.env.TRAYLIST_PRERELEASE === "1";
let data = JSON.parse(fs.readFileSync(0, "utf8"));
if (Array.isArray(data)) {
  data = data.filter((r) => !r.draft && (allowPre || !r.prerelease));
  if (!data.length) process.exit(2);
  data = data[0];
} else if (data.draft || (data.prerelease && !allowPre)) process.exit(2);
const [wantOs, wantArch, prefer] = process.argv.slice(2);
const archMap = { amd64: ["amd64","x86_64","x64","x86-64"], arm64: ["arm64","aarch64"] };
function score(name) {
  const n = name.toLowerCase();
  if (n.endsWith(".sig") || n.endsWith(".blockmap") || n.endsWith(".json")) return -1;
  if (wantOs === "linux" && !(n.endsWith(".deb") || n.endsWith(".appimage") || n.endsWith(".rpm"))) return -1;
  if (wantOs === "darwin" && !(n.endsWith(".dmg") || n.endsWith(".app.tar.gz"))) return -1;
  if (wantOs === "windows" && !(n.endsWith(".msi") || n.endsWith(".exe"))) return -1;
  let s = 0;
  const archs = archMap[wantArch] || [];
  if (archs.some((a) => n.includes(a))) s += 50;
  else if (wantOs === "darwin" && n.includes("universal")) s += 40;
  else if (![...archMap.amd64, ...archMap.arm64].some((a) => n.includes(a))) s += 10;
  else return -1;
  prefer.split(",").forEach((p, i) => {
    p = p.trim().toLowerCase();
    if (p && (n.endsWith(p) || n.includes(p))) s += 30 - i;
  });
  return s;
}
let best = null, bestS = -1;
for (const a of data.assets || []) {
  const sc = score(a.name || "");
  if (sc > bestS) { bestS = sc; best = a; }
}
if (!best || bestS < 0) process.exit(3);
console.log(best.name);
console.log(best.browser_download_url);
console.log(data.tag_name || "");
NODE
    return $?
  fi
  die "need python3 or node to parse GitHub release metadata"
}

detect_os() {
  case "$(uname -s)" in
    Linux*)  echo linux ;;
    Darwin*) echo darwin ;;
    MINGW*|MSYS*|CYGWIN*) echo windows ;;
    *) die "unsupported OS: $(uname -s). On Windows use install.ps1." ;;
  esac
}

detect_arch() {
  local m
  m="$(uname -m)"
  case "$m" in
    x86_64|amd64) echo amd64 ;;
    aarch64|arm64) echo arm64 ;;
    *) die "unsupported CPU arch: $m" ;;
  esac
}

is_wsl() {
  grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null
}

has_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    return 0
  fi
  command -v sudo >/dev/null 2>&1 || return 1
  # non-interactive probe
  sudo -n true >/dev/null 2>&1
}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    die "need root privileges (install sudo or re-run as root)"
  fi
}

install_linux() {
  local file="$1" name="$2"
  case "$name" in
    *.deb)
      need_cmd dpkg
      info "Installing .deb (system-wide)…"
      if ! run_root dpkg -i "$file"; then
        info "Fixing dependencies…"
        run_root apt-get install -f -y || run_root dnf install -y || true
        run_root dpkg -i "$file"
      fi
      ;;
    *.rpm)
      info "Installing .rpm…"
      if command -v dnf >/dev/null 2>&1; then
        run_root dnf install -y "$file"
      elif command -v rpm >/dev/null 2>&1; then
        run_root rpm -Uvh "$file"
      else
        die "rpm/dnf not available"
      fi
      ;;
    *.AppImage|*.appimage)
      local dest_dir="$PREFIX/bin" dest="$PREFIX/bin/traylist"
      mkdir -p "$dest_dir" "$PREFIX/share/applications" "$PREFIX/share/icons/hicolor/256x256/apps"
      chmod +x "$file"
      # Extract icon if possible (best-effort)
      cp "$file" "$dest"
      cat > "$PREFIX/share/applications/traylist.desktop" <<EOF
[Desktop Entry]
Name=Traylist
Comment=Local-first system tray todo list
Exec=$dest
Icon=traylist
Terminal=false
Type=Application
Categories=Utility;Office;
StartupNotify=false
EOF
      info "Installed AppImage → $dest"
      if ! echo ":$PATH:" | grep -q ":$dest_dir:"; then
        warn "Add to PATH: export PATH=\"$dest_dir:\$PATH\""
      fi
      ;;
    *)
      die "unexpected Linux package: $name"
      ;;
  esac
}

install_darwin() {
  local file="$1" name="$2"
  if [[ "$name" == *.dmg ]]; then
    need_cmd hdiutil
    local mount
    mount="$(hdiutil attach -nobrowse -readonly "$file" | awk '/\/Volumes\// {print $3; exit}')"
    [ -n "$mount" ] || die "failed to mount DMG"
    local app
    app="$(find "$mount" -maxdepth 2 -name '*.app' -print -quit)"
    [ -n "$app" ] || { hdiutil detach "$mount" >/dev/null; die "no .app in DMG"; }
    info "Copying $(basename "$app") → /Applications"
    run_root rm -rf "/Applications/$(basename "$app")"
    run_root cp -R "$app" /Applications/
    hdiutil detach "$mount" >/dev/null || true
    if command -v xattr >/dev/null 2>&1; then
      xattr -dr com.apple.quarantine "/Applications/$(basename "$app")" 2>/dev/null || true
    fi
  elif [[ "$name" == *.app.tar.gz ]]; then
    tar -xzf "$file" -C "$WORK"
    local app
    app="$(find "$WORK" -maxdepth 2 -name '*.app' -print -quit)"
    [ -n "$app" ] || die "no .app in archive"
    info "Copying $(basename "$app") → /Applications"
    run_root rm -rf "/Applications/$(basename "$app")"
    run_root cp -R "$app" /Applications/
    if command -v xattr >/dev/null 2>&1; then
      xattr -dr com.apple.quarantine "/Applications/$(basename "$app")" 2>/dev/null || true
    fi
  else
    die "unexpected macOS package: $name"
  fi
}

main() {
  export TRAYLIST_PRERELEASE="$ALLOW_PRERELEASE"

  local os arch prefer api_url
  os="$(detect_os)"
  arch="$(detect_arch)"

  if [ "$os" = linux ] && is_wsl; then
    warn "WSL detected — system tray / global hotkeys may not work. Prefer native Linux or Windows build."
  fi
  if [ "$os" = windows ]; then
    die "use PowerShell: irm https://raw.githubusercontent.com/${REPO}/main/scripts/install.ps1 | iex"
  fi

  case "$os" in
    linux)
      if command -v dpkg >/dev/null 2>&1 && { [ "$(id -u)" -eq 0 ] || command -v sudo >/dev/null 2>&1; }; then
        prefer=".deb,.AppImage,.rpm"
      else
        prefer=".AppImage,.deb,.rpm"
        warn "no dpkg/sudo — will prefer AppImage user install under $PREFIX"
      fi
      ;;
    darwin) prefer=".dmg,.app.tar.gz" ;;
    *) prefer="" ;;
  esac

  if [ "$ALLOW_PRERELEASE" = 1 ]; then
    api_url="https://api.github.com/repos/${REPO}/releases"
  else
    api_url="https://api.github.com/repos/${REPO}/releases/latest"
  fi

  info "Fetching latest Traylist release ($REPO)…"
  local meta name url tag
  if ! download "$api_url" "$WORK/release.json"; then
    die "could not reach GitHub API for $REPO (network / rate limit / repo missing)"
  fi

  set +e
  meta="$(json_get "$os" "$arch" "$prefer" < "$WORK/release.json")"
  local jc=$?
  set -e
  case "$jc" in
    0) ;;
    2) die "no usable GitHub release yet. Publish a release (tag vX.Y.Z) or set TRAYLIST_PRERELEASE=1" ;;
    3) die "no matching $os/$arch asset in the latest release. Check: https://github.com/${REPO}/releases" ;;
    *) die "failed to parse release metadata (install python3 or node)" ;;
  esac

  name="$(printf '%s\n' "$meta" | sed -n '1p')"
  url="$(printf '%s\n' "$meta" | sed -n '2p')"
  tag="$(printf '%s\n' "$meta" | sed -n '3p')"
  [ -n "$url" ] || die "empty download URL"

  info "Downloading $name ($tag)…"
  local pkg="$WORK/$name"
  download "$url" "$pkg"

  # Quiet if app is running — do not kill (data loss risk)
  if pgrep -x traylist >/dev/null 2>&1 || pgrep -if '[Tt]raylist' >/dev/null 2>&1; then
    warn "Traylist looks running — quit it from the tray menu before first launch of the new build."
  fi

  case "$os" in
    linux)  install_linux "$pkg" "$name" ;;
    darwin) install_darwin "$pkg" "$name" ;;
  esac

  info "Done. Start Traylist from your app menu / Applications, or run: traylist"
  if [ "$os" = linux ]; then
    info "Tip (Wayland): tray popup uses X11 placement — GDK_BACKEND=x11 is set by the app when needed."
  fi
}

main "$@"
