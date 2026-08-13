"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ChevronsUpDownIcon,
  GaugeIcon,
  LayersIcon,
  type LucideIcon,
  MonitorSmartphoneIcon,
  Settings2Icon,
  SlashIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import { signOut } from "@/lib/auth-client";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: GaugeIcon },
  { href: "/groups", label: "Groups", icon: LayersIcon },
  { href: "/devices", label: "Devices", icon: MonitorSmartphoneIcon },
  { href: "/settings", label: "Settings", icon: Settings2Icon },
];

/** The shell's single <h1>: the current section's name, derived from the route
 *  so pages don't each repeat their own title. */
export function PageTitle() {
  const pathname = usePathname();
  const current = NAV.find((n) => pathname.startsWith(n.href));
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="hidden text-muted-foreground sm:inline">UsageFleet</span>
      <SlashIcon className="hidden size-3 text-muted-foreground/50 sm:inline" aria-hidden />
      <h1 className="truncate font-heading font-medium">{current?.label ?? "Dashboard"}</h1>
    </div>
  );
}

function NavUser({ email }: { email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent" />}
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium uppercase"
          aria-hidden
        >
          {email.slice(0, 2)}
        </span>
        <span className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">{email}</span>
          <span className="truncate text-xs text-muted-foreground">Signed in</span>
        </span>
        <ChevronsUpDownIcon className="ml-auto size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-56">
        <DropdownMenuItem
          disabled={pending}
          onClick={async () => {
            setPending(true);
            const request = (async () => {
              const result = await signOut();
              if (result.error) throw new Error("Sign out failed");
            })();
            try {
              await toast.promise(request, {
                loading: { title: "Signing out…" },
                success: { title: "Signed out" },
                error: {
                  title: "Couldn't sign out",
                  description: "Please sign in again if your session remains active.",
                  priority: "high",
                },
              });
            } catch {
              // Keep the existing best-effort redirect; the toast reports the failure.
            } finally {
              router.push("/login");
              router.refresh();
              setPending(false);
            }
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
                aria-hidden
              >
                <GaugeIcon className="size-4" />
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-heading font-medium">UsageFleet</span>
                <span className="truncate text-xs text-muted-foreground">
                  Usage across groups and devices
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((n) => (
                <SidebarMenuItem key={n.href}>
                  <SidebarMenuButton
                    isActive={pathname.startsWith(n.href)}
                    tooltip={n.label}
                    render={<Link href={n.href} />}
                  >
                    <n.icon />
                    <span>{n.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <NavUser email={email} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
