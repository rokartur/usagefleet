#!/bin/sh
# usagefleet collector installer (macOS + Linux).
#
# Downloads the latest standalone binary for your OS/arch from the project's
# GitHub Releases, verifies its SHA-256 checksum, installs it as `usagefleet`
# on your PATH, and (when a token is available) enables it as an autostart
# background service.
#
# The repo is PRIVATE — downloads use the GitHub CLI (`gh`). Make sure you have
# access and have run `gh auth login` once (or have GH_TOKEN/GITHUB_TOKEN set).
#
# Quick start (you only need a device token from the Devices page):
#   curl -fsSL https://raw.githubusercontent.com/rokartur/usagefleet/main/install.sh | sh -s -- --token uf_xxx
#
# On Windows (Git Bash/MSYS/Cygwin) this hands over to install.ps1 automatically,
# keeping your flags — autostart there is a Scheduled Task, not launchd/systemd.
#
# To update later: just re-run the same command — it pulls the latest binary
# and restarts the service.
#
# Flags:
#   --token <uf_..>   device token; configures + enables the service automatically
#   --endpoint <url>   server URL (default: https://claude-tracker.rokartur.com)
#   --no-service       install the binary only; don't enable autostart
#   --service          force-enable the service even without a token (must be configured already)
#   --bin-dir <dir>    install location (default: ~/.local/bin, or /usr/local/bin if writable)
#   --version <tag>    pin a release tag instead of latest (e.g. v1.0.0.3)
#   -h, --help         show this help
#
# Env overrides: USAGEFLEET_VERSION, USAGEFLEET_BIN_DIR,
#   USAGEFLEET_ENDPOINT, USAGEFLEET_TOKEN, GH_TOKEN/GITHUB_TOKEN.
set -eu

REPO="rokartur/usagefleet"
DEFAULT_ENDPOINT="https://claude-tracker.rokartur.com"

ENDPOINT="${USAGEFLEET_ENDPOINT:-}"
TOKEN="${USAGEFLEET_TOKEN:-}"
SERVICE_MODE="auto"   # auto | force | skip
BIN_DIR="${USAGEFLEET_BIN_DIR:-}"
VERSION="${USAGEFLEET_VERSION:-latest}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  # Print the leading comment block (skip the shebang), stripping "# ".
  awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"
  exit 0
}

# ---- parse args -------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --token)      TOKEN="${2:-}"; shift 2 ;;
    --endpoint)   ENDPOINT="${2:-}"; shift 2 ;;
    --no-service) SERVICE_MODE="skip"; shift ;;
    --service)    SERVICE_MODE="force"; shift ;;
    --bin-dir)    BIN_DIR="${2:-}"; shift 2 ;;
    --version)    VERSION="${2:-}"; shift 2 ;;
    -h|--help)    usage ;;
    *) fail "unknown argument: $1 (try --help)" ;;
  esac
done

# ---- detect platform --------------------------------------------------------
os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Darwin) os_part="macos" ;;
  Linux)  os_part="linux" ;;
  MINGW*|MSYS*|CYGWIN*)
    # No launchd/systemd here — hand the same flags to the PowerShell installer.
    command -v powershell.exe >/dev/null 2>&1 \
      || fail "Windows detected but powershell.exe is not on PATH. Run install.ps1 from PowerShell instead."
    # Quote every value as a PowerShell single-quoted literal (no interpolation
    # inside one, so doubling ' is the whole job).
    psq() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"; }
    ps_args=""
    if [ -n "$TOKEN" ]; then ps_args="$ps_args -Token $(psq "$TOKEN")"; fi
    if [ -n "$ENDPOINT" ]; then ps_args="$ps_args -Endpoint $(psq "$ENDPOINT")"; fi
    if [ -n "$BIN_DIR" ]; then
      # PowerShell can't use an MSYS path like /c/tools — hand it a Windows one.
      command -v cygpath >/dev/null 2>&1 && BIN_DIR="$(cygpath -w "$BIN_DIR")"
      ps_args="$ps_args -BinDir $(psq "$BIN_DIR")"
    fi
    if [ "$VERSION" != "latest" ]; then ps_args="$ps_args -Version $(psq "$VERSION")"; fi
    if [ "$SERVICE_MODE" = "skip" ]; then ps_args="$ps_args -NoService"; fi
    if [ "$SERVICE_MODE" = "force" ]; then ps_args="$ps_args -Service"; fi
    info "Windows detected — running the PowerShell installer..."
    exec powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \
      "\$s = irm 'https://raw.githubusercontent.com/${REPO}/main/install.ps1'; & ([scriptblock]::Create(\$s))${ps_args}"
    ;;
  *) fail "unsupported OS: $os" ;;
esac
case "$arch" in
  arm64|aarch64) arch_part="arm64" ;;
  x86_64|amd64)  arch_part="x64" ;;
  *) fail "unsupported architecture: $arch" ;;
esac
ASSET="usagefleet-${os_part}-${arch_part}"

# ---- release downloader (private repo → gh) ---------------------------------
# gh honors GH_TOKEN/GITHUB_TOKEN automatically, so it also works headless/CI.
if ! command -v gh >/dev/null 2>&1; then
  fail "the GitHub CLI 'gh' is required (the repo is private). Install it: https://cli.github.com/ — then run 'gh auth login'."
fi
if ! gh auth status >/dev/null 2>&1 && [ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
  fail "gh is not authenticated. Run 'gh auth login' (or set GH_TOKEN) and retry."
fi

GH_TAG=""
[ "$VERSION" != "latest" ] && GH_TAG="$VERSION"

# fetch_asset <asset-name> <dest-path> — returns nonzero on failure.
fetch_asset() {
  if gh release download $GH_TAG -R "$REPO" -p "$1" -O "$2" --clobber >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

# ---- sha-256 tool -----------------------------------------------------------
if command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  sha256() { echo SKIP; }
fi

tmp="$(mktemp -d "${TMPDIR:-/tmp}/usagefleet.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT INT TERM

info "Downloading $ASSET (${VERSION})..."
fetch_asset "$ASSET" "${tmp}/${ASSET}" \
  || fail "could not download $ASSET — check 'gh auth status', your repo access, and that a release with this asset exists."

# ---- verify checksum --------------------------------------------------------
if fetch_asset "SHA256SUMS.txt" "${tmp}/SHA256SUMS.txt"; then
  want="$(awk -v f="$ASSET" '$2==f || $2=="*"f {print $1}' "${tmp}/SHA256SUMS.txt" | head -n1)"
  got="$(sha256 "${tmp}/${ASSET}")"
  if [ -z "$want" ]; then
    warn "no checksum entry for $ASSET — skipping verification"
  elif [ "$got" = "SKIP" ]; then
    warn "no sha256 tool found — skipping checksum verification"
  elif [ "$want" != "$got" ]; then
    fail "checksum mismatch for $ASSET (want $want, got $got) — refusing to install"
  else
    info "Checksum OK."
  fi
else
  warn "could not fetch SHA256SUMS.txt — skipping checksum verification"
fi

# ---- choose install dir -----------------------------------------------------
if [ -z "$BIN_DIR" ]; then
  if [ -w /usr/local/bin ] 2>/dev/null; then
    BIN_DIR="/usr/local/bin"
  else
    BIN_DIR="${HOME}/.local/bin"
  fi
fi
mkdir -p "$BIN_DIR" || fail "cannot create install dir: $BIN_DIR"
DEST="${BIN_DIR}/usagefleet"

# ---- install ----------------------------------------------------------------
mv "${tmp}/${ASSET}" "$DEST"
chmod +x "$DEST"

# macOS Gatekeeper: the binary is unsigned, so strip the download quarantine
# flag, otherwise the first run is blocked with "developer cannot be verified".
if [ "$os" = "Darwin" ] && command -v xattr >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$DEST" 2>/dev/null || true
fi

info "Installed usagefleet -> $DEST"
"$DEST" help >/dev/null 2>&1 && info "Binary runs OK." \
  || warn "binary installed but did not run cleanly — check your OS/arch."

# ---- PATH hint --------------------------------------------------------------
case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *) warn "${BIN_DIR} is not on your PATH. Add it:"
     printf '       export PATH="%s:$PATH"\n' "$BIN_DIR" >&2 ;;
esac

# ---- configure (init) -------------------------------------------------------
if [ -n "$TOKEN" ]; then
  [ -n "$ENDPOINT" ] || ENDPOINT="$DEFAULT_ENDPOINT"
  info "Configuring for $ENDPOINT (writing ~/.usagefleet.json)..."
  "$DEST" init --endpoint "$ENDPOINT" --token "$TOKEN"
fi

# Is the collector configured (token+endpoint resolvable from flags/env/file)?
have_config() {
  { [ -n "$TOKEN" ] && [ -n "$ENDPOINT" ]; } && return 0
  [ -n "${USAGEFLEET_TOKEN:-}" ] && [ -n "${USAGEFLEET_ENDPOINT:-}" ] && return 0
  f="${HOME}/.usagefleet.json"
  [ -f "$f" ] && grep -q '"endpoint"' "$f" && grep -q '"token"' "$f"
}

# ---- enable autostart service ----------------------------------------------
case "$SERVICE_MODE" in
  skip)
    echo
    info "Binary installed. Next steps:"
    have_config || echo "  usagefleet init --endpoint $DEFAULT_ENDPOINT --token uf_xxx"
    echo "  usagefleet install        # enable autostart background service"
    ;;
  force)
    info "Enabling autostart service..."
    "$DEST" install
    ;;
  auto)
    if have_config; then
      info "Enabling autostart service..."
      "$DEST" install
      echo
      info "Done. usagefleet is running and will start on login."
      info "Update anytime by re-running this installer."
    else
      echo
      warn "No token/endpoint configured — skipping autostart."
      info "Configure then enable it:"
      echo "  usagefleet init --endpoint $DEFAULT_ENDPOINT --token uf_xxx"
      echo "  usagefleet install"
      echo "Or re-run this installer with: --token uf_xxx"
    fi
    ;;
esac
