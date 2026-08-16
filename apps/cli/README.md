# @usagefleet/cli

The UsageFleet collector. It tails the local logs of your Claude agents and
reports usage to [usagefleet.com](https://usagefleet.com), where it's split
across your device groups. Read-only on the log files, zero runtime
dependencies, Node ≥ 20.

## Install

Get a device **token** from the [Devices](https://usagefleet.com/devices) page,
then, on that machine:

```bash
npm i -g @usagefleet/cli
usagefleet login uf_xxx
```

Same two commands on macOS, Linux and Windows (in PowerShell chain them with
`;` — 5.1 has no `&&`). `login` pairs the device, sets the collector to start
with your session and writes `~/.config/usagefleet/config.json` (mode `600`).
The dashboard fills in within a minute.

`login` takes the token and nothing else. The collector reports to
`usagefleet.com` and there is no way to redirect it: the request carries your
device token and a log of what this machine is working on.

If `npm i -g` fails with EACCES your global prefix is root-owned: use a Node
version manager (nvm, fnm, volta) or `npm config set prefix ~/.local` with
`~/.local/bin` on your PATH. Don't install under `sudo` — the collector would
run as the wrong user.

## Commands

```bash
usagefleet status         # service health, last limits reading, resolved config
usagefleet run            # one scan: upload usage + report limits
usagefleet watch          # poll continuously (what the service runs)
usagefleet limits         # report ONLY your real 5h/weekly limit usage
usagefleet guard          # exit 2 if this device's group is over a blocking limit
usagefleet notify-test    # fire a sample desktop notification
usagefleet update         # upgrade now (it also self-updates every 6h)
usagefleet config         # config file location + every env override
usagefleet login <token>  # pair this device + (re)install the service, idempotent
usagefleet uninstall      # remove it
usagefleet completion zsh # print a shell completion script (zsh, fish)
```

`login` sets up completions for you, for each shell you actually use — zsh
gets `~/.zsh/completions/_usagefleet` plus an `fpath` block appended to
`.zshrc`, fish gets `~/.config/fish/completions/usagefleet.fish`. Restart the
shell once. `uninstall` removes both again, and self-update keeps them current.

`completion` stays for piping a script somewhere else yourself.

## What it collects

- **Token usage** — Claude Code (`~/.claude/projects/**/*.jsonl`), Claude
  Desktop agent-mode (Cowork) sessions, and the
  [pi](https://github.com/badlogic/pi-mono) agent (`~/.pi/agent/sessions`,
  Anthropic-provider records only; other providers don't touch Claude limits).
  A per-file byte offset in the config file means each line is sent once;
  rotation and truncation are handled and partial lines are never sent. Delivery
  is at-least-once — the server dedups on `uuid`.
- **Your real limit %** — the collector uses the Claude login already on the
  machine (subscription OAuth from `claude`: macOS login Keychain, elsewhere
  `<config dir>/.credentials.json`; falling back to `ANTHROPIC_API_KEY`), sends a
  1-token ping to the Messages API and reads the same 5h/weekly percentages
  Claude's own `/usage` screen shows. Credentials never
  leave the machine — only the percentages do. `usagefleet status` shows which
  login was found.

Uploaded per record: token counts, model, session id, hostname, working
directory, git branch. Prompts, responses and file contents are never read.

## Desktop notifications

The first time a window crosses a threshold (default `80` and `95`) you get a
desktop notification — once per threshold per window, re-armed when the window
resets. macOS uses `osascript`, Linux `notify-send` (falling back to
`kdialog --passivepopup`; install `libnotify-bin` if neither exists), Windows a
WinRT toast via `powershell.exe`.

`usagefleet notify-test` confirms it works. Tune with
`USAGEFLEET_NOTIFY_THRESHOLDS="50,80,95"`, disable with `USAGEFLEET_NOTIFY=0`.

## Blocking prompts over the limit

A group can be set to **refuse new prompts** once it has burned its budget slice
(1/N of the account limit) for a window — a switch per window on the Groups
page, both off by default. `usagefleet login` registers a Claude Code `UserPromptSubmit` hook in
`~/.claude/settings.json` (removed by `uninstall`, refreshed rather than stacked
on re-install, and skipped entirely with `USAGEFLEET_HOOK=0`):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "usagefleet guard" }] }
    ]
  }
}
```

If `USAGEFLEET_CONFIG` was set when you logged in, the installed command carries
it (`USAGEFLEET_CONFIG=<path> usagefleet guard`, or `set "..." && ...` on
Windows). That is what binds the hook to the right store, and so to the right
Anthropic account — see "Two Claude accounts on one machine" below.

`guard` **fails open** everywhere else — no config, server down, timeout (5s),
old server, 429 — because a tracker problem must never stop you working. Only
whole prompts are blocked, never tool calls mid-turn, so the current turn always
finishes.

## Configuration

`~/.config/usagefleet/config.json` (honours `XDG_CONFIG_HOME`) holds everything
the CLI persists: your settings plus two machine-managed sections, `state` (tail
offsets) and `notify` (which thresholds already fired). Delete it to start
clean. Re-running `login` merges, so rotating a token doesn't reset offsets.

Env vars override the file:

| Variable | Meaning |
|----------|---------|
| `USAGEFLEET_TOKEN` | device token |
| `USAGEFLEET_PROJECTS` | override `~/.claude/projects` |
| `USAGEFLEET_DESKTOP` | override the Claude Desktop sessions dir; `off` to skip it |
| `USAGEFLEET_PI` | override the pi sessions dirs, comma-separated; `off` to skip |
| `USAGEFLEET_INTERVAL` | watch poll seconds (default 15) |
| `USAGEFLEET_LIMITS_INTERVAL` | seconds between limit pings (default 300, so the 1-token ping isn't every cycle) |
| `USAGEFLEET_NOTIFY` | desktop notifications, on by default |
| `USAGEFLEET_NOTIFY_THRESHOLDS` | utilization % that trigger an alert (default `80,95`) |
| `USAGEFLEET_BATCH` | records per upload (default 100, server caps at 1000) |
| `USAGEFLEET_CONFIG` | override the config file path |
| `USAGEFLEET_UPDATE` | `0` turns the self-update check off |
| `USAGEFLEET_UPDATE_INTERVAL` | seconds between update checks (default `21600` = 6h) |
| `USAGEFLEET_HOOK` | `0` keeps the prompt-blocking hook out of `~/.claude/settings.json` |
| `CLAUDE_CONFIG_DIR` | Claude Code's own knob: which login to watch (default `~/.claude`) |

When run as a service, `login` bakes every `USAGEFLEET_*` value currently set
(plus `ANTHROPIC_API_KEY` and `CLAUDE_CONFIG_DIR`) into the launchd/systemd
unit, written mode `600`.

### Two Claude accounts on one machine

One collector watches one login. To report a second subscription from the same
machine, run a second collector against Claude Code's other config dir, with its
own device token and its own state:

```sh
CLAUDE_CONFIG_DIR=~/.claude-work \
  USAGEFLEET_CONFIG=~/.config/usagefleet/work.json \
  USAGEFLEET_PROJECTS=~/.claude-work/projects \
  usagefleet login uf_...
```

Each reports its own account, and the dashboard keeps their limits apart. The
prompt guard follows: because `USAGEFLEET_CONFIG` was set for this `login`, the
hook written into `~/.claude-work/settings.json` carries it, so that account's
guard reads that account's token and blocks against the right subscription. With
a relocated config dir the macOS Keychain is skipped on purpose: that item
belongs to the default login.

**Only one of them can run as the background service.** The launchd label,
systemd unit and Scheduled Task name are fixed, so the second `login` rewrites
the first one's service definition rather than adding a second. Run the extra
collector yourself with the same env — `... usagefleet watch`, under your own
unit or terminal — and keep `login` for the account you want supervised.

## Background service

`login` is idempotent and reload-safe: re-running it rewrites the service
definition and restarts it, so it doubles as the update step. It launches an
absolute `node` plus the installed package path, so an empty service PATH is
fine — but removing that Node version (`nvm uninstall`) stops the collector
until you re-run `usagefleet login` under the new one.

- **macOS** — a LaunchAgent (`~/Library/LaunchAgents`, RunAtLoad + KeepAlive),
  booted immediately. Logs in `~/Library/Logs/usagefleet/`. Plist is mode `600`:
  it holds your token.
- **Linux** — a `systemd --user` unit, plus `loginctl enable-linger $USER` so it
  survives logout. If `systemctl` can't be driven it prints the manual steps.
- **Windows** — a Scheduled Task (`usagefleet`) starting at logon, restarting on
  failure, running hidden through a `wscript` launcher in
  `%LOCALAPPDATA%\usagefleet` (which carries the env values set at install
  time). Log: `%LOCALAPPDATA%\usagefleet\usagefleet.log`. Inspect with
  `schtasks /query /tn usagefleet /v /fo list`.

> **macOS limits under the service.** Usage collection works headless. Reading
> the login Keychain for the real limit % may be denied to a non-interactive
> agent — the collector logs a clear hint. Either approve `/usr/bin/security`
> access to the `Claude Code-credentials` item once, or set `ANTHROPIC_API_KEY`
> before `usagefleet login` so limits use the API key.

## Updates

`watch` checks the npm registry at startup and every 6 hours; on a new version
it runs `npm install -g @usagefleet/cli@<version>` and re-runs `login` to
restart the service on it. `usagefleet update` does the same on demand. npm is
called through the absolute path next to the running `node`, because a
launchd/systemd service gets a minimal PATH.

Every failure is a no-op — registry unreachable, non-semver version, npm
missing or exiting non-zero, local `dev` builds — and the service is only
restarted after npm reports success.

## From source

```bash
cd apps/cli
bun install
bun run src/index.ts status   # or: npm run build && node dist/index.js status
```
