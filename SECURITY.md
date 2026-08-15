# Security

## Reporting a vulnerability

Use GitHub's [private vulnerability
reporting](https://github.com/rokartur/usagefleet/security/advisories/new) —
it opens a channel only the maintainers can read. If that fails, email
<rokartur@icloud.com>.

Please do not open a public issue for anything that exposes another account's
data, tokens or usage history.

Expect a first reply within 72 hours. Fixes ship on `main`, which publishes the
CLI to npm and redeploys usagefleet.com; you will be credited in the advisory
unless you ask otherwise.

## Scope

The hosted instance at usagefleet.com and this repository. Highest interest:

- anything that reads or writes another user's usage rows, groups or devices
- the ingest endpoints (`/api/v1/*`) — they are authenticated by device token
  only, so token forgery, replay across accounts, or bypassing the plan check
- session and OAuth handling in `apps/web/src/lib/auth.ts`
- admin access, which is granted by the `ADMIN_EMAILS` env var alone
- the collector's self-update path, since it fetches and runs code

Out of scope: rate-limit tuning, missing security headers with no exploit,
volumetric DoS, findings from automated scanners without a working request, and
anything requiring an attacker-controlled machine that already has the user's
device token.

## Supported versions

Only the latest published `@usagefleet/cli` and the current `main` deployment.
Installed collectors self-update within six hours, so a CLI fix reaches devices
without action.

## Handling of secrets

Device tokens are stored as SHA-256 digests and shown once at creation; a
leaked token is revoked from the Devices page. If you find one in a log, a
screenshot or a public repo, report it here rather than testing what it can do.
