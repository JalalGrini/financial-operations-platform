"use client";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { collaborationApi } from "@/features/collaboration/api";
import { Menu, Bell } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  NAVIGATION,
  canAccessNavigationItem,
} from "@/lib/navigation";
import { sourceText } from "@/lib/i18n/source-catalog";
import { SourceText } from "@/components/i18n/SourceText";

export function Header() {
  const { user } = useAuth();
  const pathname = usePathname();
  const filteredNav = NAVIGATION.filter((item) =>
    canAccessNavigationItem(user, item),
  );
  const sections = Array.from(new Set(filteredNav.map((item) => item.section)));
  // Longest matching href wins, so /personnel/payroll does not resolve to
  // /personnel. Used for the desktop breadcrumb below.
  const activeItem = filteredNav
    .filter(
      (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
  /**
   * Live unread count for the header bell.
   *
   * This was `const unreadCount = 0` behind a "TODO: wire to real notification
   * count API". Because the badge only renders when the count is above zero, the
   * bell could never show one - the notification indicator was permanently dead
   * while looking deliberately built.
   *
   * The endpoint already existed and was already in use:
   * `collaborationApi.unreadCount` backs the dashboard KPI and
   * `components/collaboration/GlobalControls.tsx`. The same query key
   * ["notifications","count"] is reused so all three share one cache entry and
   * one refetch rather than polling the endpoint three times.
   */
  const unreadQuery = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: collaborationApi.unreadCount,
    // Matches GlobalControls so the two cannot disagree on screen.
    refetchInterval: 60000,
    staleTime: 60000,
    // The header renders on every protected route, including before a session is
    // established; a 401 here must not surface as an error toast.
    enabled: Boolean(user),
  });
  const unreadCount = unreadQuery.data?.count ?? 0;

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center justify-between px-4 lg:px-6">
        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={sourceText("Open navigation")}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" size="default" className="p-0">
            {/* Brand header */}
            <div className="flex h-16 shrink-0 items-center border-b border-border px-4">
              <Logo size={32} showText />
            </div>

            {/* Nav items */}
            <ScrollArea className="flex-1 px-3 py-4">
              {sections.map((section) => (
                <div key={section} className="mb-5">
                  <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                    <SourceText source={section} />
                  </p>
                  <div className="space-y-1">
                    {filteredNav
                      .filter((item) => item.section === section)
                      .map((item) => {
                        const isActive =
                          pathname === item.href ||
                          pathname.startsWith(item.href + "/");
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                              "flex items-center gap-3 min-h-11 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150",
                              isActive
                                ? "bg-[hsl(var(--sidebar-active))] text-primary shadow-[inset_3px_0_0_hsl(var(--primary))]"
                                : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                            )}
                            aria-current={isActive ? "page" : undefined}
                          >
                            <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                            <SourceText source={item.name} />
                          </Link>
                        );
                      })}
                  </div>
                </div>
              ))}
            </ScrollArea>
          </SheetContent>
        </Sheet>

        {/* Desktop: brand mark plus where you are. The bar was empty here,
            which left the whole strip looking unfinished next to the heavy
            hero below it. Section over page mirrors the hero's own
            eyebrow-over-title rhythm so the two read as one unit. */}
        <div className="hidden min-w-0 items-center gap-3 lg:flex">
          {activeItem ? (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                <SourceText source={activeItem.section} />
              </span>
              <span className="block truncate text-sm font-bold tracking-tight text-foreground">
                <SourceText source={activeItem.name} />
              </span>
            </span>
          ) : (
            <Logo size={32} showText />
          )}
        </div>

        {/* Right side */}
        <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/notifications"
            className="relative grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={sourceText("Notifications")}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
                aria-label={`${unreadCount} unread notifications`}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
