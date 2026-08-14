import { siteUrl } from "@/lib/site";

/** The hosted service, which is also install.sh's built-in DEFAULT_ENDPOINT
 *  (apps/web/public/install.sh). Self-hosted deployments have to spell the
 *  endpoint out; on the hosted one the flag would just be noise. */
const HOSTED_ORIGIN = "https://usagefleet.com";

/** Stand-in used where the plaintext token isn't available any more (it is
 *  shown once, at device creation). Loud enough that nobody pastes it as-is. */
export const TOKEN_PLACEHOLDER = "PASTE_YOUR_DEVICE_TOKEN";

/** The copy-paste installer one-liners for one device token, per shell.
 *  Everything (script, checksums, binaries) is served by this deployment, so
 *  the origin here is both where the script comes from and where the collector
 *  reports to. */
export function installCommands(token: string) {
  const origin = siteUrl();
  const selfHosted = origin !== HOSTED_ORIGIN;
  return [
    {
      id: "unix",
      label: "macOS / Linux",
      command: `curl -sSL ${origin}/install.sh | sh -s -- --token ${token}${
        selfHosted ? ` --endpoint ${origin}` : ""
      }`,
    },
    {
      id: "windows",
      label: "Windows",
      command: `$s = irm ${origin}/install.ps1; & ([scriptblock]::Create($s)) -Token ${token}${
        selfHosted ? ` -Endpoint ${origin}` : ""
      }`,
    },
  ] as const;
}
