#!/bin/sh
# usagefleet collector installer (macOS + Linux).
#
# Downloads the latest standalone binary for your OS/arch, verifies its SHA-256
# checksum, installs it as `usagefleet` on your PATH, and (when a token is
# available) enables it as an autostart background service.
#
# Quick start:
#   curl -sSL https://usagefleet.com/install.sh | sh
#
# That installs the binary. To configure it in the same step, pass a device
# token from the Devices page:
#   curl -sSL https://usagefleet.com/install.sh | sh -s -- --token uf_xxx
#
# No GitHub account or `gh` needed: the server holds the one GitHub credential
# and serves the binary itself. The source repo stays private.
#
# On Windows (Git Bash/MSYS/Cygwin) this hands over to install.ps1 automatically,
# keeping your flags — autostart there is a Scheduled Task, not launchd/systemd.
#
# To update later: just re-run the same command — it pulls the latest binary
# and restarts the service.
#
# Flags:
#   --token <uf_..>   device token; configures + enables the service automatically
#   --endpoint <url>   server URL, for self-hosted deployments
#                      (default: https://usagefleet.com)
#   --no-service       install the binary only; don't enable autostart
#   --service          force-enable the service even without a token (must be configured already)
#   --bin-dir <dir>    install location (default: ~/.local/bin, or /usr/local/bin if writable)
#   --skip-checksum    install without verifying the SHA-256 (last resort; the
#                      install is unverified and a tampered binary would run)
#   -h, --help         show this help
#
# Env overrides: USAGEFLEET_BIN_DIR, USAGEFLEET_ENDPOINT, USAGEFLEET_TOKEN.
set -eu

# The hosted service. Self-hosters override it with --endpoint; everything,
# including the binary download below, is served by this one host.
DEFAULT_ENDPOINT="https://usagefleet.com"

ENDPOINT="${USAGEFLEET_ENDPOINT:-$DEFAULT_ENDPOINT}"
TOKEN="${USAGEFLEET_TOKEN:-}"
SERVICE_MODE="auto"   # auto | force | skip
BIN_DIR="${USAGEFLEET_BIN_DIR:-}"
SKIP_CHECKSUM="${USAGEFLEET_SKIP_CHECKSUM:-0}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  # Piped in via `curl | sh`, $0 is the shell itself and there is no file to
  # read the help out of, so send people to the copy they can read.
  if [ -r "$0" ]; then
    # Print the leading comment block (skip the shebang), stripping "# ".
    awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"
  else
    echo "usagefleet installer. Flags: --token <uf_..> --endpoint <url>"
    echo "  --bin-dir <dir> --no-service --service"
    echo "Full help: ${DEFAULT_ENDPOINT}/install.sh"
  fi
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
    --skip-checksum) SKIP_CHECKSUM=1; shift ;;
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
    ps_args="$ps_args -Endpoint $(psq "$ENDPOINT")"
    if [ -n "$BIN_DIR" ]; then
      # PowerShell can't use an MSYS path like /c/tools — hand it a Windows one.
      command -v cygpath >/dev/null 2>&1 && BIN_DIR="$(cygpath -w "$BIN_DIR")"
      ps_args="$ps_args -BinDir $(psq "$BIN_DIR")"
    fi
    if [ "$SERVICE_MODE" = "skip" ]; then ps_args="$ps_args -NoService"; fi
    if [ "$SERVICE_MODE" = "force" ]; then ps_args="$ps_args -Service"; fi
    if [ "$SKIP_CHECKSUM" = "1" ]; then ps_args="$ps_args -SkipChecksum"; fi
    info "Windows detected — running the PowerShell installer..."
    # Served by the same host as this script, so a self-hosted --endpoint keeps
    # the whole install on that deployment.
    exec powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \
      "\$s = irm '${ENDPOINT}/install.ps1'; & ([scriptblock]::Create(\$s))${ps_args}"
    ;;
  *) fail "unsupported OS: $os" ;;
esac
case "$arch" in
  arm64|aarch64) arch_part="arm64" ;;
  x86_64|amd64)  arch_part="x64" ;;
  *) fail "unsupported architecture: $arch" ;;
esac
ASSET="usagefleet-${os_part}-${arch_part}"

# ---- release downloader -----------------------------------------------------
# The server proxies the private repo's release assets, so this needs no GitHub
# account, no `gh`, and no token — just the endpoint.
ASSET_URL="${ENDPOINT}/api/v1/collector/asset"

if command -v curl >/dev/null 2>&1; then
  # --fail so an HTTP error (404, 429, 503) is a nonzero exit, not a saved
  # error page that we would then try to execute.
  fetch_url() { curl -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  fetch_url() { wget -q "$1" -O "$2"; }
else
  fail "need curl or wget to download the collector."
fi

# fetch_asset <asset-name> <dest-path> — returns nonzero on failure.
fetch_asset() {
  fetch_url "${ASSET_URL}?asset=$1" "$2" 2>/dev/null
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

info "Downloading $ASSET from ${ENDPOINT}..."
fetch_asset "$ASSET" "${tmp}/${ASSET}" \
  || fail "could not download $ASSET from ${ENDPOINT} — check the server is reachable and has a published release for your platform (retry in a few minutes if you were rate limited)."

# ---- verify checksum --------------------------------------------------------
# Verification failure is fatal, never a warning: whatever can serve a tampered
# binary can also make SHA256SUMS.txt unavailable, so degrading to a warning
# hands the attacker the bypass for free. --skip-checksum is the explicit,
# user-chosen way out.
if [ "$SKIP_CHECKSUM" = "1" ]; then
  warn "--skip-checksum given — installing $ASSET WITHOUT verifying it"
else
  fetch_asset "SHA256SUMS.txt" "${tmp}/SHA256SUMS.txt" \
    || fail "could not fetch SHA256SUMS.txt from ${ENDPOINT} — refusing to install unverified (re-run with --skip-checksum to override)"
  want="$(awk -v f="$ASSET" '$2==f || $2=="*"f {print $1}' "${tmp}/SHA256SUMS.txt" | head -n1)"
  got="$(sha256 "${tmp}/${ASSET}")"
  if [ -z "$want" ]; then
    fail "no checksum entry for $ASSET — refusing to install unverified (re-run with --skip-checksum to override)"
  elif [ "$got" = "SKIP" ]; then
    fail "no sha256 tool found (install sha256sum or shasum) — refusing to install unverified (re-run with --skip-checksum to override)"
  elif [ "$want" != "$got" ]; then
    fail "checksum mismatch for $ASSET (want $want, got $got) — refusing to install"
  else
    info "Checksum OK."
  fi
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
  info "Configuring for $ENDPOINT (writing ~/.config/usagefleet/config.json)..."
  "$DEST" init --endpoint "$ENDPOINT" --token "$TOKEN"
fi

# Is the collector configured (token+endpoint resolvable from flags/env/file)?
have_config() {
  { [ -n "$TOKEN" ] && [ -n "$ENDPOINT" ]; } && return 0
  [ -n "${USAGEFLEET_TOKEN:-}" ] && [ -n "${USAGEFLEET_ENDPOINT:-}" ] && return 0
  f="${XDG_CONFIG_HOME:-$HOME/.config}/usagefleet/config.json"
  # Fall back to the pre-consolidation file: the collector migrates it on its
  # next write, but until then that is where the token still lives.
  [ -f "$f" ] || f="${HOME}/.usagefleet.json"
  [ -f "$f" ] && grep -q '"endpoint"' "$f" && grep -q '"token"' "$f"
}

# ---- enable autostart service ----------------------------------------------
case "$SERVICE_MODE" in
  skip)
    echo
    info "Binary installed. Next steps:"
    have_config || echo "  usagefleet init --endpoint $ENDPOINT --token uf_xxx"
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
      echo "  usagefleet init --endpoint $ENDPOINT --token uf_xxx"
      echo "  usagefleet install"
      echo "Or re-run this installer with: --token uf_xxx"
    fi
    ;;
esac
