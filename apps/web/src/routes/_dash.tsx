import { createFileRoute, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { AppSidebar, PageTitle } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/session";

/** Guards every dashboard route and hands the shell what it needs. Throwing the
 *  redirect from here (via requireUser) stops the child loaders from running. */
const dashShell = createServerFn().handler(async () => {
  const user = await requireUser();
  // Restore the collapsed/expanded sidebar across reloads (cookie set
  // client-side by SidebarProvider) so the first paint doesn't flip.
  return { email: user.email, sidebarOpen: getCookie("sidebar_state") !== "false" };
});

export const Route = createFileRoute("/_dash")({
  loader: () => dashShell(),
  component: DashLayout,
});

function DashLayout() {
  const { email, sidebarOpen } = Route.useLoaderData();
  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar email={email} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <PageTitle />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
