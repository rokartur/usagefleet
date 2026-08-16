# Collector internals

`apps/cli` — `@usagefleet/cli`. Zero runtime dependencies, Node ≥ 20, one
process per machine. User-facing usage lives in
[`apps/cli/README.md`](../apps/cli/README.md); this is how it works inside.

## Commands

`index.ts` dispatches: `login` (pairing, interactive setup + autostart),
`run` (one cycle), `watch` (the daemon loop), `limits` (one limits report),
`guard` (the prompt hook), `status`, `config` (file path + env reference),
`update`, `notify-test`, `uninstall`, `completion` (zsh/fish scripts).

The command list itself lives in `completion.ts` and drives both `help` and the
generated completion scripts — add a command there, not in two places. Some
entrypoints are deliberately missing from it, so they dispatch without being
advertised: `watch`, which is what the installed service runs rather than
something to type, `--version`/`-v`, since bare `usagefleet` already prints
the release in its header, and `install`/`init`, the former names of `login`,
which keep working for commands already pasted into scripts.

`login` also writes the completion scripts to where each shell loads them
(`installCompletions`), appending an `fpath` block to `.zshrc` when zsh needs
one. It runs after the service so a completion failure can never fail the
install, and self-update re-runs `login`, which keeps completions in step with
new commands.

## The watch loop

Every `USAGEFLEET_INTERVAL` seconds (default 15) `runOnce()`:

1. `scanner.ts` lists `*.jsonl` under the watched roots — `~/.claude/projects`,
   Claude Desktop's Electron userData sessions, and any Pi session dirs. Only
   files inside a `.../.claude/projects/...` subtree count as usage logs; the
   desktop root also holds `audit.jsonl`, a full duplicate of the same uuids.
2. `tailer.ts` reads each file from its stored byte offset (≤16 MB per file per
   cycle), `parser.ts` turns lines into `UsageRecord`s.
3. `uploader.ts` posts them in batches of ≤1000 (the server's `BatchSchema` cap)
   with retry + backoff.
4. The new offset is committed **only after** the server acknowledges — hence
   at-least-once delivery and the server-side dedup on `(userId, uuid)`.
5. Offsets for files that no longer exist are pruned, so a long-lived install
   doesn't grow one state entry per session forever.

A `400`/`422` means the server parsed the request and rejected the *records*, so
the chunk is split and each half retried: one malformed line costs one record
instead of the whole batch. `402` parks the device (plan wall) without losing
data; uploads resume when a slot frees up.

On the same loop, less often: the limits report every
`USAGEFLEET_LIMITS_INTERVAL` seconds and a self-update check every
`USAGEFLEET_UPDATE_INTERVAL` seconds (default 6h). The limits default is
source-aware: 60s for subscription logins (the oauth/usage read below is free)
and 300s for API keys (each reading costs a billable token).

## Limits reporting

`claude-creds.ts` finds the local Claude login — subscription OAuth (macOS
Keychain or `<config dir>/.credentials.json`, refreshing an expired token) or an
API key. For a subscription login `claude-limits.ts` asks `api/oauth/usage`
first — the undocumented endpoint Claude Code's own `/usage` screen uses. It is
free (no billable ping), returns the exact account-wide 5h/7d percentages that
screen shows, and is the source of the per-model caps ("Fable · 24% used").
When it answers, that IS the report and nothing else is sent to Anthropic.

The fallback — always used for API keys, and for subscriptions only when
oauth/usage yields nothing — is a **1-token** request to
`api.anthropic.com/v1/messages` purely to read the response headers:
`anthropic-ratelimit-unified-{5h,7d}-*` plus per-model variants like
`...-7d-fable-utilization`. That is why the limits leg is rate-limited
separately from the usage scan: on the fallback path every reading costs a
billable token. (On subscription logins those headers now carry a 0–1 fraction,
so the fallback is genuinely degraded there — tiny percentages — but it beats
reporting nothing.)

The parsed report goes to `POST /api/v1/limits`. oauth/usage reports **0–100
percentages** (`utilization`/`percent`), so parsing is a clamp keeping one
decimal — the server multiplies the group split by the group count, so integer
rounding here would amplify on the dashboard. There is deliberately no "0–1
fraction" normalisation on the header path: `1` would mean 1%, and reading it
as 100% would drive the headline number, the critical desktop notification and
`guard`'s prompt block, every time a window has just reset.

For a subscription login the report also names **which Anthropic account** it
describes: `claude-account.ts` reads `oauthAccount` out of Claude Code's own
`~/.claude.json` (a local file read, no network, no credentials). The server
keeps one set of percentages per account, so two machines on two different
subscriptions stop overwriting each other. An API-key login has no account
identity and reports none; the server buckets those together.

Every per-login path hangs off `claudeConfigDir()` (`paths.ts`), i.e. honours
`CLAUDE_CONFIG_DIR`, so a second collector started against a second config dir
reports the second subscription. With that variable set the macOS Keychain is
deliberately not consulted: its item is global and belongs to the default login,
so falling back to it would report one account's limits under the other's uuid.
`service.ts` bakes the variable into the launchd/systemd unit for the same
reason, and `hook.ts` bakes `USAGEFLEET_CONFIG` into the prompt-guard command so
the guard resolves the same store the collector writes (`guardCommand` emits the
POSIX `VAR=value cmd` prefix, or `set "VAR=value" && cmd` on win32, since cmd.exe
has no inline form).

The unit *name* is not per-config, though: the launchd label, systemd unit and
Scheduled Task name are constants, so only one collector can be installed as a
service. A second `login` rewrites the first one's definition; the second
account has to be run by hand.

`notifier.ts` compares each window's utilization against ascending thresholds
(`USAGEFLEET_NOTIFY_THRESHOLDS`, default 80/95) and fires one desktop
notification per threshold per window via `notify.ts` (osascript / notify-send /
PowerShell toast). The per-window marks live in the store, so a new window
re-arms them.

## Prompt guard

`usagefleet guard` is a Claude Code `UserPromptSubmit` hook, installed into
`~/.claude/settings.json` by `hook.ts`. It asks
`GET /api/v1/limits`; exit 2 refuses the prompt with the stderr message, exit 0
lets it through. Nothing is printed on stdout — on this hook stdout is injected
into the model's context.

It **fails open** by design: unconfigured, offline, timed out (5s), non-OK
response, junk JSON, or a server too old to send the fields all return 0. Only an
explicit `blocked: true` blocks. A tracker outage must never stop someone from
working.

The server fails open too: it only answers `blocked: true` while the account's
last reported utilization is under 15 minutes old. Limits reporting needs live
Claude credentials and can stop while usage upload keeps working, so without
that window a frozen percentage would refuse prompts indefinitely. Raising
`USAGEFLEET_LIMITS_INTERVAL` past 15 min therefore turns blocking off.

## State and config

One file: `~/.config/usagefleet/config.json` (`XDG_CONFIG_HOME` honoured,
`USAGEFLEET_CONFIG` overrides the path) holding settings, tail offsets and
notification marks. Every write goes through `atomic-write.ts` — tmp file →
fsync → rename → fsync dir, with a per-pid tmp name so a manual `run` alongside
the installed service can't publish a corrupt half-write.

Env overrides everything in the file: `USAGEFLEET_TOKEN`, `_PROJECTS`,
`_DESKTOP`, `_PI`, `_BATCH`, `_INTERVAL`, `_LIMITS_INTERVAL`, `_UPDATE`,
`_UPDATE_INTERVAL`, `_NOTIFY`, `_NOTIFY_THRESHOLDS`, `_HOOK`.

The server is not among them. `ENDPOINT` in `config.ts` is a constant
(`https://usagefleet.com`): the request carries a device token and a log of what
the machine is working on, so there is one https destination and no flag, env
var or stored field that can redirect it. `login` refuses outright if it sees
`--endpoint`, rather than ignoring it and shipping a self-hoster's usage to the
hosted service on the first self-update.

## Autostart (`service.ts`)

User-scoped on every OS, never root: launchd `LaunchAgents` plist (macOS),
systemd `--user` unit (Linux), Scheduled Task at logon driven by a hidden VBS
launcher (Windows, because a compiled console binary would flash a window).
Installs resolve the binary through a stable bin dir, since the service starts
with a nearly empty PATH. `uninstall` removes the agent/unit/task and the guard
hook.

## Self-update

`update.ts` runs `npm i -g @usagefleet/cli` against the public registry when a
newer version exists — no server, no token, no GitHub involved.
`USAGEFLEET_UPDATE=0` opts out.

**Every push to `main` publishes a new version** (`.github/workflows/release.yml`,
version = manifest major.minor + run number), so installed collectors pick up CLI
changes within ~6 hours. Treat `apps/cli` edits as shipping to user machines.

## Tests

`bun run test` in `apps/cli` (vitest). The pure pieces — parser, store, config,
guard, hook, notifier, uploader, service, claude-limits — are covered; keep new
logic in that shape rather than inside the loop.
