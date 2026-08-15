#!/usr/bin/env bash
# End-to-end check for the three states install.sh has to get right: fresh
# install, re-run on the latest release, and upgrade over an older binary.
# Serves fake release assets locally, so it needs no network and no server.
#
#   ./apps/collector/test-install.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
script="${root}/apps/web/public/install.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"; [ -n "${server_pid:-}" ] && kill "$server_pid" 2>/dev/null || true' EXIT

asset="usagefleet-$(uname -s | tr '[:upper:]' '[:lower:]' | sed 's/darwin/macos/')-$(uname -m | sed 's/arm64/arm64/;s/x86_64/x64/')"
mkdir -p "$work/release" "$work/bin"

# A stand-in for the real binary: prints the version `install.sh` reads back.
make_binary() {
	printf '#!/bin/sh\ncase "$1" in version) echo "%s";; *) echo "usagefleet %s";; esac\n' "$1" "$1" > "$2"
	chmod +x "$2"
}

make_binary 9.9.9 "$work/release/$asset"
(cd "$work/release" && shasum -a 256 "$asset" > SHA256SUMS.txt)

port=8787
RELEASE_DIR="$work/release" PORT="$port" bun -e "
const dir = process.env.RELEASE_DIR
Bun.serve({ port: Number(process.env.PORT), async fetch(req) {
  const asset = new URL(req.url).searchParams.get('asset')
  const file = Bun.file(dir + '/' + asset)
  return (await file.exists()) ? new Response(file) : new Response('nope', { status: 404 })
} })
" &
server_pid=$!
sleep 0.4

run() { sh "$script" --endpoint "http://127.0.0.1:${port}" --bin-dir "$work/bin" --no-service "$@"; }

echo "--- 1. fresh install"
out="$(run)"
echo "$out"
grep -q "installed" <<<"$out" || { echo "FAIL: expected an install"; exit 1; }
[ "$("$work/bin/usagefleet" version)" = "9.9.9" ] || { echo "FAIL: wrong version installed"; exit 1; }

echo "--- 2. re-run, already current"
out="$(run)"
echo "$out"
grep -q "up to date" <<<"$out" || { echo "FAIL: expected the up-to-date short circuit"; exit 1; }

echo "--- 3. upgrade over an older binary"
make_binary 9.9.8 "$work/bin/usagefleet"
out="$(run)"
echo "$out"
grep -q "9.9.8 → 9.9.9" <<<"$out" || { echo "FAIL: expected the version delta"; exit 1; }

echo "--- 4. tampered binary is replaced, not trusted"
echo 'broken' >> "$work/bin/usagefleet"
out="$(run)"
grep -q "installed\|upgraded" <<<"$out" || { echo "FAIL: expected a reinstall"; exit 1; }

echo "OK"
