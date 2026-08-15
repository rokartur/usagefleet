# Installation

Two things get installed:

- **Server** — Docker (`web` + `db`). Same steps on every OS; see [Server](#server-docker).
- **Collector** — the `usagefleet` CLI, installed on every machine you use
  Claude on. Per-OS: [macOS](#collector--macos) · [Linux](#collector--linux) ·
  [Windows](#collector--windows).

You need a device **token** (`uf_…`) from the server's **Devices** page before
installing a collector.

---

## Server (Docker)

Requirements: Docker with Compose v2 — Docker Desktop on macOS/Windows, Docker
Engine on Linux.

```bash
cp .env.example .env
docker compose up --build -d      # migrations run automatically on boot
# open http://localhost:3000  (override the host port with WEB_PORT=)
```

Before `up`, set in `.env`: `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`
(≥32 chars, high entropy) and — if not on `localhost:3000` — `BETTER_AUTH_URL`.

Sign-in and billing are also required, and `docker compose` aborts rather than
starting half-configured if any is missing:

| Variable | Where to get it |
|----------|-----------------|
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | [github.com/settings/developers](https://github.com/settings/developers), callback `<BETTER_AUTH_URL>/api/auth/callback/github` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | [Google Cloud credentials](https://console.cloud.google.com/apis/credentials), callback `<BETTER_AUTH_URL>/api/auth/callback/google` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_FLEET`, `STRIPE_PRICE_CUSTOM` | Stripe dashboard |

Solo and Fleet are flat monthly prices. **Custom must be a per-unit price**
("$0.35 per device / month", no package or tier pricing): the chosen device
count is sent as the line-item quantity, so Stripe multiplies it out and the
device cap is read back from that same quantity.

The amounts are yours to pick — the app reads them back from these price ids and
renders whatever Stripe says, so nothing quotes a number you aren't charging.
Prices are cached per process, so restart `web` after editing one in Stripe.

Plan switches go through Stripe's customer portal, so in
[Billing → Customer portal](https://dashboard.stripe.com/settings/billing/portal)
turn on "Customers can switch plans", list all three products, and allow
quantity changes so Custom subscribers can resize. Without it, Stripe rejects
the switch and Billing shows an error toast.

Generate the secret:

```bash
openssl rand -base64 32                                   # macOS / Linux
```

```powershell
# Windows PowerShell (works on 5.1 and 7+)
$b = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b)
```

On Windows edit `.env` in an editor (`notepad .env`) — the `sed` one-liners in
the README are Unix-only. Everything else (rate limiting, reverse proxy,
`ALLOW_SIGNUP`, port conflicts) is covered in [README.md](README.md).

---

## Collector — macOS

Requirements: macOS 12+ (Apple Silicon or Intel), `curl` or `wget`. Signed into
Claude Code (`claude`) if you want the real 5h/weekly limit numbers.

```bash
curl -sSL https://usagefleet.com/install.sh | sh
```

Pass a device token from the Devices page to configure and start it in the same
step:

```bash
curl -sSL https://usagefleet.com/install.sh | sh -s -- --token uf_xxx
```

Downloads `usagefleet-macos-arm64`/`-x64`, verifies its SHA-256, installs to
`/usr/local/bin` (or `~/.local/bin` if that isn't writable), strips the Gatekeeper
quarantine flag, writes `~/.config/usagefleet/config.json`, and starts a LaunchAgent.

Verify:

```bash
usagefleet status      # service health, last limits reading, resolved config
usagefleet run         # one scan — the dashboard fills in within a minute
```

Service:

| | |
|---|---|
| Agent | `~/Library/LaunchAgents/dev.usagefleet.collector.plist` |
| Logs | `~/Library/Logs/usagefleet/usagefleet.out.log`, `usagefleet.err.log` |
| Config | `~/.config/usagefleet/config.json` (settings + tail state, mode `600`) |
| Restart | `launchctl kickstart -k gui/$(id -u)/dev.usagefleet.collector` |
| Update | re-run the installer (or `usagefleet install`) |
| Remove | `usagefleet uninstall` |

Troubleshooting:

- **"developer cannot be verified"** — the binary is unsigned; the installer
  removes the quarantine attribute. After a manual download run
  `xattr -d com.apple.quarantine ./usagefleet`.
- **Limits show nothing under the service** — a non-interactive LaunchAgent may be
  denied the login-Keychain read of `Claude Code-credentials`. Approve
  `/usr/bin/security` access once, or `export ANTHROPIC_API_KEY=…` *before*
  `usagefleet install` (it's baked into the agent).
- **`command not found`** — `~/.local/bin` isn't on your PATH; add
  `export PATH="$HOME/.local/bin:$PATH"` to `~/.zshrc`.

---

## Collector — Linux

Requirements: glibc x64 or arm64, `curl` or `wget`, `systemd` for autostart.

```bash
curl -sSL https://usagefleet.com/install.sh | sh -s -- --token uf_xxx
```

Installs to `/usr/local/bin` (or `~/.local/bin`), writes a **user** systemd unit,
enables it, and runs `loginctl enable-linger $USER` so it survives logout.

Verify:

```bash
usagefleet status
systemctl --user status usagefleet
```

Service:

| | |
|---|---|
| Unit | `~/.config/systemd/user/usagefleet.service` |
| Logs | `journalctl --user -u usagefleet -f` |
| Restart | `systemctl --user restart usagefleet` |
| Update | re-run the installer (or `usagefleet install`) |
| Remove | `usagefleet uninstall` (then delete the unit file) |

Troubleshooting:

- **No systemd / installer couldn't drive `systemctl`** — it prints the manual
  steps; or just run `usagefleet watch` from your own supervisor.
- **No desktop notifications** — install `notify-send`
  (`apt install libnotify-bin`, `dnf install libnotify`). A `--user` unit reaches
  the notification daemon only with a session bus (`DBUS_SESSION_BUS_ADDRESS`),
  which a graphical login provides.
- **Claude login not detected** — on Linux the collector reads
  `~/.claude/.credentials.json`; sign in once with `claude`, or set
  `ANTHROPIC_API_KEY` before `usagefleet install`.

---

## Collector — Windows

Requirements: 64-bit Windows 10/11, PowerShell.

```powershell
$s = irm https://usagefleet.com/install.ps1
& ([scriptblock]::Create($s)) -Token uf_xxx
```

Installs `usagefleet.exe` to `%LOCALAPPDATA%\Programs\usagefleet`, adds it to
your user PATH (open a new terminal to pick it up), unblocks the
Mark-of-the-Web, and registers a hidden Scheduled Task that starts at logon.

Running `install.sh` from Git Bash/MSYS also works — it forwards your flags to
`install.ps1`.

Verify:

```powershell
usagefleet status
usagefleet run
```

Service:

| | |
|---|---|
| Task | `usagefleet` — `schtasks /query /tn usagefleet /v /fo list` |
| Launcher + logs | `%LOCALAPPDATA%\usagefleet\` (`usagefleet.log`, truncated on each start) |
| Restart | `schtasks /end /tn usagefleet` then `schtasks /run /tn usagefleet` |
| Update | re-run the installer (it stops the task first, so the .exe isn't locked) |
| Remove | `usagefleet uninstall` |

Troubleshooting:

- **Script blocked** — the one-liner already runs via `[scriptblock]::Create`; for
  a downloaded file use
  `powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Token uf_xxx`.
- **SmartScreen warning** — the .exe is unsigned; the installer calls
  `Unblock-File`. After a manual download: `Unblock-File .\usagefleet.exe`.
- **Task XML rejected** — the installer falls back to a plain `onlogon` task; if
  even that fails it prints the exact `schtasks /create` line to run.
- **No toasts** — check Settings → Notifications; the toast appears under
  "Windows PowerShell".

---

## Without the installer script

Grab the asset for your platform from the GitHub Release, then configure it
yourself:

| Platform | Asset |
|---|---|
| macOS (Apple Silicon) | `usagefleet-macos-arm64` |
| macOS (Intel) | `usagefleet-macos-x64` |
| Linux (x64) | `usagefleet-linux-x64` |
| Linux (arm64) | `usagefleet-linux-arm64` |
| Windows (x64) | `usagefleet-windows-x64.exe` |

```bash
gh release download -R rokartur/usagefleet -p usagefleet-linux-x64
chmod +x usagefleet-linux-x64 && mv usagefleet-linux-x64 ~/.local/bin/usagefleet
usagefleet init --endpoint https://usagefleet.com --token uf_xxx
usagefleet install
```

From source (bun):

```bash
bun install                                    # from the repo root
cd apps/collector && bun run src/index.ts --help
```

Installer flags (`--help` for all): `--no-service`, `--endpoint <url>`,
`--bin-dir <dir>` — PowerShell: `-NoService`, `-Endpoint`, `-BinDir`.
The installer always fetches the latest release; `--endpoint` is for self-hosted
deployments, which serve their own installer and binaries.

Env vars, notification tuning and CLI commands:
[apps/collector/README.md](apps/collector/README.md).
