"use client";
import Link from "next/link";
import { Bell, CheckCheck, ArrowRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collaborationApi, type Notification } from "@/features/collaboration/api";
import { useExperience } from "@/lib/experience";
import { useState } from "react";
import { SourceText } from "@/components/i18n/SourceText";
import { SwitchMode } from "@/components/ui/switch-mode";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { motion, AnimatePresence } from "framer-motion";

import { sourceText } from "@/lib/i18n/source-catalog";
export function GlobalControls() {
  const { t } = useExperience();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const count = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: collaborationApi.unreadCount,
    refetchInterval: 60000,
  });
  const list = useQuery({
    queryKey: ["notifications", "preview"],
    queryFn: () => collaborationApi.notifications(false),
    enabled: open,
  });
  const read = useMutation({
    mutationFn: (id: string) => collaborationApi.read(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: collaborationApi.readAll,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const rows: Notification[] = list.data?.results ?? [];
  const unreadCount = count.data?.count ?? 0;

  return (
    <div className="relative z-10 flex shrink-0 items-center gap-2">
      <LanguageSwitcher />

      {/* Animated light/dark toggle */}
      <SwitchMode />

      {/* Notification bell */}
      <div className="relative">
        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => setOpen(!open)}
          aria-label={t("notifications")}
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none transition-colors"
        >
          <Bell className="h-4 w-4" />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                className="absolute -top-0.5 -end-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-white"
              >
                {Math.min(unreadCount, 99)}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        <AnimatePresence>
          {open && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40"
                onClick={() => setOpen(false)}
              />
              <motion.div
                key="panel"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                className="absolute end-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-border/60 bg-popover shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{t("notifications")}</span>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAll.mutate()}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <CheckCheck size={11} /> {sourceText("All read")}
                      </button>
                    )}
                    <Link href="/notifications" onClick={() => setOpen(false)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors">
                      {sourceText("All")} <ArrowRight size={11} />
                    </Link>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {list.isLoading ? (
                    <div className="space-y-0">
                      {[0,1,2].map((i) => (
                        <div key={i} className="flex items-start gap-3 border-b border-border/30 px-4 py-3 last:border-0">
                          <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-muted animate-pulse" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3.5 w-3/4 rounded bg-muted animate-pulse" />
                            <div className="h-3 w-full rounded bg-muted/60 animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : rows.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <Bell className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">{t("emptyNotifications")}</p>
                    </div>
                  ) : (
                    rows.slice(0, 6).map((n, i) => (
                      <motion.div
                        key={n.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 25 }}
                      >
                        <Link
                          href={n.destination || "/notifications"}
                          onClick={() => { if (!n.read_at) read.mutate(n.id); setOpen(false); }}
                          className={`flex items-start gap-3 border-b border-border/30 px-4 py-3 last:border-0 transition-colors hover:bg-accent ${!n.read_at ? "bg-primary/5" : ""}`}
                        >
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                            <Bell size={12} className="text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold line-clamp-1">{n.title}</p>
                            <p className="line-clamp-2 text-[11px] text-muted-foreground">{n.message}</p>
                          </div>
                          {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                        </Link>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
