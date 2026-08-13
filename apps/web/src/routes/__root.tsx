/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
// Self-hosted replacement for next/font/google; sets the --font-inter var that
// styles/globals.css feeds into --font-sans.
import "@fontsource-variable/inter";
import appCss from "@/styles/globals.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "UsageFleet" },
      { name: "description", content: "Track AI usage across groups and devices." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
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
