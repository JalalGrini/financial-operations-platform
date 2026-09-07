"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Receipt,
  AtSign,
  BarChart3,
  CalendarDays,
  Menu,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { collaborationApi } from "@/features/collaboration/api";
import { SourceText } from "@/components/i18n/SourceText";

const ITEMS = [
  { labelKey: "Dashboard",        href: "/dashboard",         icon: LayoutDashboard },
  { labelKey: "Financial Records", href: "/financial-records",  icon: Receipt },
  { labelKey: "Tagged for me",     href: "/tagged",            icon: AtSign },
  { labelKey: "Deadlines",         href: "/deadlines",         icon: CalendarDays },
  { labelKey: "Reports Registry",  href: "/reports",           icon: BarChart3 },
] as const;

export function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const notifQuery = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: collaborationApi.unreadCount,
    staleTime: 60_000,
  });
  const unread = notifQuery.data?.count ?? 0;

  return (
    <nav
      aria-label={sourceText("Mobile primary navigation")}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      {ITEMS.map(({ labelKey, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const label = sourceText(labelKey);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition-colors"
          >
            {/* Spring-scaled icon */}
            <motion.span
              animate={{ scale: active ? 1.18 : 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className={cn(
                "relative flex h-7 w-7 items-center justify-center rounded-xl transition-colors",
                active ? "bg-primary/12 text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {/* Unread dot on tagged */}
              {href === "/tagged" && unread > 0 && (
                <motion.span
                  key={unread}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 600, damping: 28 }}
                  className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
                >
                  {unread > 9 ? "9+" : unread}
                </motion.span>
              )}
            </motion.span>

            {/* Label — visible only when active to reduce clutter */}
            <AnimatePresence initial={false}>
              {active && (
                <motion.span
                  key="label"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.18 }}
                  className="text-primary"
                >
                  {label}
                </motion.span>
              )}
            </AnimatePresence>
            {!active && <span className="text-muted-foreground opacity-0">{label}</span>}

            {/* Active underline pip */}
            {active && (
              <motion.span
                layoutId="bottom-nav-pip"
                className="absolute bottom-0.5 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
              />
            )}
          </Link>
        );
      })}

      {/* More button */}
      <button
        onClick={onMore}
        aria-label={sourceText("More navigation options")}
        className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-xl text-muted-foreground">
          <Menu className="h-5 w-5" />
        </span>
        <span className="opacity-0">{sourceText("More")}</span>
      </button>
    </nav>
  );
}
