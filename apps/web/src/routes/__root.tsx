/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
// Self-hosted replacement for next/font/google; sets the --font-inter var that
// styles/globals.css feeds into --font-sans.
import "@fontsource-variable/inter";
// The one subset any page here actually renders. Imported for its URL so the
// preload below points at the same hashed asset the @font-face rule requests.
import interLatin from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import "@/styles/globals.css";

/** Applies the stored theme before the first paint. next-themes injects the
 *  same logic, but at the top of <body>, which is late enough that a refresh
 *  flashes the light palette. Mirrors the ThemeProvider props below: storage
 *  key "theme", class attribute, dark default. */
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme")||"dark";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){}`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_NAME },
      { name: "description", content: SITE_DESCRIPTION },
      // Browser chrome follows the same two backgrounds the app paints.
      { name: "theme-color", content: "#ffffff", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#000000", media: "(prefers-color-scheme: dark)" },
      // Defaults for every page; the landing route overrides the ones that
      // describe the page itself (title, description, canonical URL).
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:type", content: "website" },
      { property: "og:title", content: SITE_NAME },
      { property: "og:description", content: SITE_DESCRIPTION },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      // Starts the font fetch with the stylesheet instead of after it, so text
      // paints in Inter rather than swapping out of the fallback mid-load.
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: interLatin,
        crossOrigin: "anonymous",
      },
    ],
    scripts: [{ children: THEME_SCRIPT }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes writes the theme class on <html>
    // before hydration, so the server markup intentionally differs.
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
