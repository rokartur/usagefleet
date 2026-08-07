# Installation

Two things get installed:

- **Server** — Docker (`web` + `db`). Same steps on every OS; see [Server](#server-docker).
- **Collector** — the `claude-track` CLI, installed on every machine you use
  Claude on. Per-OS: [macOS](#collector--macos) · [Linux](#collector--linux) ·
  [Windows](#collector--windows).

You need a device **token** (`ctk_…`) from the server's **Devices** page before
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
(≥32 chars, high entropy) and — if not on `localhost:3000` — `NEXT_PUBLIC_APP_URL`
and `BETTER_AUTH_URL`.

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

Requirements: macOS 12+ (Apple Silicon or Intel), [`gh`](https://cli.github.com/)
authenticated (`gh auth login`) because the repo is private. Signed into Claude
Code (`claude`) if you want the real 5h/weekly limit numbers.

```bash
curl -fsSL https://raw.githubusercontent.com/rokartur/claude-track/main/install.sh | sh -s -- --token ctk_xxx
```

Downloads `claude-track-macos-arm64`/`-x64`, verifies its SHA-256, installs to
`/usr/local/bin` (or `~/.local/bin` if that isn't writable), strips the Gatekeeper
quarantine flag, writes `~/.claude-track.json`, and starts a LaunchAgent.

Verify:

```bash
claude-track status      # config, tail state, detected Claude login
claude-track run         # one scan — the dashboard fills in within a minute
```

Service:

| | |
|---|---|
| Agent | `~/Library/LaunchAgents/dev.claudetrack.collector.plist` |
| Logs | `/tmp/claude-track.out.log`, `/tmp/claude-track.err.log` |
| Restart | `launchctl kickstart -k gui/$(id -u)/dev.claudetrack.collector` |
| Update | re-run the installer (or `claude-track install`) |
| Remove | `claude-track uninstall` |

Troubleshooting:

- **"developer cannot be verified"** — the binary is unsigned; the installer
  removes the quarantine attribute. After a manual download run
  `xattr -d com.apple.quarantine ./claude-track`.
- **Limits show nothing under the service** — a non-interactive LaunchAgent may be
  denied the login-Keychain read of `Claude Code-credentials`. Approve
  `/usr/bin/security` access once, or `export ANTHROPIC_API_KEY=…` *before*
  `claude-track install` (it's baked into the agent).
- **`command not found`** — `~/.local/bin` isn't on your PATH; add
  `export PATH="$HOME/.local/bin:$PATH"` to `~/.zshrc`.

---

## Collector — Linux

Requirements: glibc x64 or arm64, `systemd` for autostart,
[`gh`](https://cli.github.com/) authenticated (`gh auth login`).

```bash
curl -fsSL https://raw.githubusercontent.com/rokartur/claude-track/main/install.sh | sh -s -- --token ctk_xxx
```

Installs to `/usr/local/bin` (or `~/.local/bin`), writes a **user** systemd unit,
enables it, and runs `loginctl enable-linger $USER` so it survives logout.

Verify:

```bash
claude-track status
systemctl --user status claude-track
```

Service:

| | |
|---|---|
| Unit | `~/.config/systemd/user/claude-track.service` |
| Logs | `journalctl --user -u claude-track -f` |
| Restart | `systemctl --user restart claude-track` |
| Update | re-run the installer (or `claude-track install`) |
| Remove | `claude-track uninstall` (then delete the unit file) |

Troubleshooting:

- **No systemd / installer couldn't drive `systemctl`** — it prints the manual
  steps; or just run `claude-track watch` from your own supervisor.
- **No desktop notifications** — install `notify-send`
  (`apt install libnotify-bin`, `dnf install libnotify`). A `--user` unit reaches
  the notification daemon only with a session bus (`DBUS_SESSION_BUS_ADDRESS`),
  which a graphical login provides.
- **Claude login not detected** — on Linux the collector reads
  `~/.claude/.credentials.json`; sign in once with `claude`, or set
  `ANTHROPIC_API_KEY` before `claude-track install`.

---

## Collector — Windows

Requirements: 64-bit Windows 10/11, PowerShell,
[`gh`](https://cli.github.com/) authenticated (`gh auth login`).

```powershell
$s = irm https://raw.githubusercontent.com/rokartur/claude-track/main/install.ps1
& ([scriptblock]::Create($s)) -Token ctk_xxx
```

Installs `claude-track.exe` to `%LOCALAPPDATA%\Programs\claude-track`, adds it to
your user PATH (open a new terminal to pick it up), unblocks the
Mark-of-the-Web, and registers a hidden Scheduled Task that starts at logon.

Running `install.sh` from Git Bash/MSYS also works — it forwards your flags to
`install.ps1`.

Verify:

```powershell
claude-track status
claude-track run
```

Service:

| | |
|---|---|
| Task | `claude-track` — `schtasks /query /tn claude-track /v /fo list` |
| Launcher + logs | `%LOCALAPPDATA%\claude-track\` (`claude-track.log`, truncated on each start) |
| Restart | `schtasks /end /tn claude-track` then `schtasks /run /tn claude-track` |
| Update | re-run the installer (it stops the task first, so the .exe isn't locked) |
| Remove | `claude-track uninstall` |

Troubleshooting:

- **Script blocked** — the one-liner already runs via `[scriptblock]::Create`; for
  a downloaded file use
  `powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Token ctk_xxx`.
- **SmartScreen warning** — the .exe is unsigned; the installer calls
  `Unblock-File`. After a manual download: `Unblock-File .\claude-track.exe`.
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
| macOS (Apple Silicon) | `claude-track-macos-arm64` |
| macOS (Intel) | `claude-track-macos-x64` |
| Linux (x64) | `claude-track-linux-x64` |
| Linux (arm64) | `claude-track-linux-arm64` |
| Windows (x64) | `claude-track-windows-x64.exe` |

```bash
gh release download -R rokartur/claude-track -p claude-track-linux-x64
chmod +x claude-track-linux-x64 && mv claude-track-linux-x64 ~/.local/bin/claude-track
claude-track init --endpoint https://claude-tracker.rokartur.com --token ctk_xxx
claude-track install
```

From source (Node ≥ 18 or bun):

```bash
cd collector && npm install && npm run build && npm link
```

Installer flags (`--help` for all): `--no-service`, `--endpoint <url>`,
`--bin-dir <dir>`, `--version <tag>` — PowerShell: `-NoService`, `-Endpoint`,
`-BinDir`, `-Version`.

Env vars, notification tuning and CLI commands: [collector/README.md](collector/README.md).
