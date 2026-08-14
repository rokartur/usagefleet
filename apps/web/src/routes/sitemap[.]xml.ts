import { createFileRoute } from "@tanstack/react-router";
import { siteUrl } from "@/lib/site";

// Only pages a signed-out visitor can actually load. /login is deliberately out:
// it is indexable but worthless as a search result, and it is in robots.txt's
// disallow neighbourhood anyway.
const PATHS = ["/"];

function GET() {
  const origin = siteUrl();
  const urls = PATHS.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "max-age=3600",
      },
    },
  );
}

export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: () => GET() } },
});
