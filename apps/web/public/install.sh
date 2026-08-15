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
# Upgrading: re-run the exact same command. The installer finds the copy you
# already have, upgrades it in place (keeping your config and its directory),
# and restarts the service. If that copy is already the latest release it says
# so and skips the download.
#
# Flags:
#   --token <uf_..>   device token; configures + enables the service automatically
#   --endpoint <url>   server URL, for self-hosted deployments
#                      (default: https://usagefleet.com)
#   --force            reinstall even when the latest release is already installed
#   --no-service       install the binary only; don't enable autostart
#   --service          force-enable the service even without a token (must be configured already)
#   --bin-dir <dir>    install location (default: the existing install, else
#                      ~/.local/bin, or /usr/local/bin if writable)
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
FORCE=0

# ---- output -----------------------------------------------------------------
# Same "quiet" style the collector itself prints: one mark, a padded label, the
# detail in gray. Colour only when stdout is a terminal — under `curl | sh` only
# stdin is the pipe, so this stays coloured for a human and plain in a log.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_DIM=$(printf '\033[90m'); C_GRN=$(printf '\033[32m')
  C_YLW=$(printf '\033[33m'); C_RED=$(printf '\033[31m')
  C_BLD=$(printf '\033[1m');  C_OFF=$(printf '\033[0m')
else
  C_DIM=''; C_GRN=''; C_YLW=''; C_RED=''; C_BLD=''; C_OFF=''
fi

ok()   { printf '%s✓%s %-10s %s%s%s\n' "$C_GRN" "$C_OFF" "$1" "$C_DIM" "${2:-}" "$C_OFF"; }
note() { printf '%s%s%s\n' "$C_DIM" "$*" "$C_OFF"; }
warn() { printf '%s!%s %s\n' "$C_YLW" "$C_OFF" "$*" >&2; }
fail() { printf '%s✗%s %s\n' "$C_RED" "$C_OFF" "$*" >&2; exit 1; }

usage() {
  # Piped in via `curl | sh`, $0 is the shell itself and there is no file to
  # read the help out of, so send people to the copy they can read.
  if [ -r "$0" ]; then
    # Print the leading comment block (skip the shebang), stripping "# ".
    awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"
  else
    echo "usagefleet installer. Flags: --token <uf_..> --endpoint <url>"
    echo "  --bin-dir <dir> --force --no-service --service"
    echo "Full help: ${DEFAULT_ENDPOINT}/install.sh"
  fi
  exit 0
}

# ---- parse args -------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --token)      TOKEN="${2:-}"; shift 2 ;;
    --endpoint)   ENDPOINT="${2:-}"; shift 2 ;;
    --force)      FORCE=1; shift ;;
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
    note "Windows detected — running the PowerShell installer…"
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

human_size() {
  b="$(wc -c < "$1" 2>/dev/null || echo 0)"
  awk -v b="$b" 'BEGIN{printf "%.1f MB", b/1048576}'
}

# `version` prints the bare number; a pre-1.3 build falls through to help, whose
# banner carries the version too — so take the first x.y.z from either.
binary_version() {
  "$1" version 2>/dev/null | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true
}

# ---- where to install -------------------------------------------------------
# Re-running this script is the documented upgrade path, so default to the
# directory of the copy that is already here: dropping a second binary somewhere
# else leaves PATH to decide which one the user actually runs. An explicit
# --bin-dir (or USAGEFLEET_BIN_DIR) still wins.
if [ -z "$BIN_DIR" ]; then
  for candidate in \
    "$(command -v usagefleet 2>/dev/null || true)" \
    "${HOME}/.local/bin/usagefleet" \
    "/usr/local/bin/usagefleet"
  do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then BIN_DIR="$(dirname "$candidate")"; break; fi
  done
fi

if [ -z "$BIN_DIR" ]; then
  if [ -w /usr/local/bin ] 2>/dev/null; then
    BIN_DIR="/usr/local/bin"
  else
    BIN_DIR="${HOME}/.local/bin"
  fi
fi
mkdir -p "$BIN_DIR" || fail "cannot create install dir: $BIN_DIR"
DEST="${BIN_DIR}/usagefleet"

# The version we are about to replace — read from the target itself, so it is
# never some other copy's number from elsewhere on PATH.
CURRENT_VERSION=""
[ -x "$DEST" ] && CURRENT_VERSION="$(binary_version "$DEST")"

printf '%susagefleet%s %s %s%s-%s%s\n\n' \
  "$C_BLD" "$C_OFF" "${CURRENT_VERSION:-}" "$C_DIM" "$os_part" "$arch_part" "$C_OFF"

tmp="$(mktemp -d "${TMPDIR:-/tmp}/usagefleet.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT INT TERM

# ---- is the installed copy already the release? -----------------------------
# The published checksum answers this without downloading 60 MB, and it is a
# stronger check than comparing version strings: it also catches a truncated or
# hand-edited binary and reinstalls it.
WANT=""
if [ "$SKIP_CHECKSUM" != "1" ]; then
  fetch_asset "SHA256SUMS.txt" "${tmp}/SHA256SUMS.txt" \
    || fail "could not fetch SHA256SUMS.txt from ${ENDPOINT} — refusing to install unverified (re-run with --skip-checksum to override)"
  WANT="$(awk -v f="$ASSET" '$2==f || $2=="*"f {print $1}' "${tmp}/SHA256SUMS.txt" | head -n1)"
  [ -n "$WANT" ] || fail "no checksum entry for $ASSET — refusing to install unverified (re-run with --skip-checksum to override)"
fi

UP_TO_DATE=0
if [ "$FORCE" != "1" ] && [ -n "$WANT" ] && [ -x "$DEST" ] && [ "$(sha256 "$DEST")" = "$WANT" ]; then
  UP_TO_DATE=1
  ok "up to date" "${CURRENT_VERSION:-latest release} · --force to reinstall"
fi

# ---- download + verify + install --------------------------------------------
NEW_VERSION=""
if [ "$UP_TO_DATE" = "0" ]; then
  fetch_asset "$ASSET" "${tmp}/${ASSET}" \
    || fail "could not download $ASSET from ${ENDPOINT} — check the server is reachable and has a published release for your platform (retry in a few minutes if you were rate limited)."
  ok "downloaded" "$(human_size "${tmp}/${ASSET}")"

  # Verification failure is fatal, never a warning: whatever can serve a tampered
  # binary can also make SHA256SUMS.txt unavailable, so degrading to a warning
  # hands the attacker the bypass for free. --skip-checksum is the explicit,
  # user-chosen way out.
  if [ "$SKIP_CHECKSUM" = "1" ]; then
    warn "--skip-checksum given — installing $ASSET WITHOUT verifying it"
  else
    got="$(sha256 "${tmp}/${ASSET}")"
    if [ "$got" = "SKIP" ]; then
      fail "no sha256 tool found (install sha256sum or shasum) — refusing to install unverified (re-run with --skip-checksum to override)"
    elif [ "$WANT" != "$got" ]; then
      fail "checksum mismatch for $ASSET (want $WANT, got $got) — nothing installed${CURRENT_VERSION:+, $CURRENT_VERSION still in place}"
    fi
    ok "verified" "sha256 $(printf '%s' "$WANT" | cut -c1-12)…"
  fi

  chmod +x "${tmp}/${ASSET}"
  # macOS Gatekeeper: the binary is unsigned, so strip the download quarantine
  # flag, otherwise the first run is blocked with "developer cannot be verified".
  if [ "$os" = "Darwin" ] && command -v xattr >/dev/null 2>&1; then
    xattr -d com.apple.quarantine "${tmp}/${ASSET}" 2>/dev/null || true
  fi
  NEW_VERSION="$(binary_version "${tmp}/${ASSET}")"
  [ -n "$NEW_VERSION" ] || warn "the downloaded binary did not run cleanly — check your OS/arch."

  # Replacing a running binary: mv unlinks the old inode, so a live collector
  # keeps running off it until the service restart below picks up the new one.
  mv "${tmp}/${ASSET}" "$DEST"
  if [ -n "$CURRENT_VERSION" ] && [ -n "$NEW_VERSION" ] && [ "$CURRENT_VERSION" != "$NEW_VERSION" ]; then
    ok "upgraded" "${CURRENT_VERSION} → ${NEW_VERSION} · ${DEST}"
  else
    ok "installed" "${NEW_VERSION:+${NEW_VERSION} · }${DEST}"
  fi
fi

# ---- PATH hint --------------------------------------------------------------
case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *) warn "${BIN_DIR} is not on your PATH. Add it:"
     printf '       export PATH="%s:$PATH"\n' "$BIN_DIR" >&2 ;;
esac

# ---- configure (init) -------------------------------------------------------
# `init` and `install` print their own step lines in this same style.
if [ -n "$TOKEN" ]; then
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
    note "binary installed. next:"
    have_config || note "  usagefleet init --endpoint $ENDPOINT --token uf_xxx"
    note "  usagefleet install    enable the autostart service"
    ;;
  force)
    "$DEST" install
    ;;
  auto)
    if have_config; then
      # Idempotent, and it restarts the service onto the binary installed above —
      # so this also repairs a service that was removed or crashed out.
      "$DEST" install
      echo
      note "collecting now."
      note "  usagefleet status     current state"
      note "  usagefleet watch      run in the foreground"
    else
      echo
      warn "no token/endpoint configured — skipping autostart."
      note "configure it, then enable the service:"
      note "  usagefleet init --endpoint $ENDPOINT --token uf_xxx"
      note "  usagefleet install"
      note "or re-run this installer with: --token uf_xxx"
    fi
    ;;
esac
