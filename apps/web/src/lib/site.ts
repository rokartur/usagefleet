/** Canonical origin of this deployment, without a trailing slash.
 *
 *  On the server it comes from BETTER_AUTH_URL, the same value OAuth callbacks
 *  are built from, so SEO URLs can't drift from the domain the app actually
 *  answers on. In the browser the current origin is already the truth, which
 *  also keeps `head()` producing the same markup on both sides of hydration.
 */
export function siteUrl(): string {
  const origin =
    typeof window === "undefined"
      ? (process.env.BETTER_AUTH_URL ?? "http://localhost:3000")
      : window.location.origin;
  return origin.replace(/\/+$/, "");
}

export const SITE_NAME = "UsageFleet";

export const SITE_DESCRIPTION =
  "Track Claude Code token usage and spend across every device and group in your fleet, live in the 5-hour window.";
