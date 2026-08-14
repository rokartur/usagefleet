import { createFileRoute } from "@tanstack/react-router";
import { siteUrl } from "@/lib/site";

// Served, not static, because the Sitemap line needs this deployment's absolute
// origin. Everything behind sign-in is listed so crawlers don't spend budget on
// URLs that only ever answer with a redirect to /login.
const DISALLOW = ["/api/", "/dashboard", "/devices", "/groups", "/billing", "/settings"];

function GET() {
  const body = [
    "User-agent: *",
    ...DISALLOW.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${siteUrl()}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "max-age=3600" },
  });
}

export const Route = createFileRoute("/robots.txt")({
  server: { handlers: { GET: () => GET() } },
});
