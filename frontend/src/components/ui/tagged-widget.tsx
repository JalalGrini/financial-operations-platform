"use client";

import React, { useState } from "react";
import {
  AnimatePresence,
  motion,
  MotionConfig,
} from "framer-motion";
import Link from "next/link";
import { AtSign, X, CheckCheck, ArrowRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collaborationApi, Mention } from "@/features/collaboration/api";
import { sourceText } from "@/lib/i18n/source-catalog";

const springIn: any = { type: "spring", stiffness: 600, damping: 60, mass: 3 };
const springOut: any = { type: "spring", stiffness: 600, damping: 60, mass: 2 };

function isResolved(row: Mention): boolean {
  return Boolean(row.resolved_at || row.read_at);
}

export function TaggedWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["mentions", "widget"],
    queryFn: collaborationApi.mentions,
    refetchInterval: 60_000,
  });

  const resolve = useMutation({
    mutationFn: collaborationApi.resolve,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mentions"] }),
  });

  const resolveAll = useMutation({
    mutationFn: async () => {
      const rows: Mention[] = query.data?.results ?? query.data ?? [];
      const unresolved = rows.filter((r) => !isResolved(r));
      await Promise.all(unresolved.map((r) => collaborationApi.resolve(r.id)));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mentions"] }),
  });

  const rows: Mention[] = query.data?.results ?? query.data ?? [];
  const unresolved = rows.filter((r) => !isResolved(r));
  const resolved = rows.filter((r) => isResolved(r));
  const preview = unresolved.slice(0, 4);
  const resolvedPreview = resolved.slice(0, 4);
  const badgeCount = unresolved.length;

  if (rows.length === 0 && !isOpen) return null;

  return (
    <div className="fixed top-20 end-4 z-40 sm:end-6">
      <MotionConfig transition={isOpen ? springIn : springOut}>
        <AnimatePresence mode="popLayout" initial={false}>
          {!isOpen ? (
            <motion.button
              key="collapsed"
              layoutId="tagged-disclosure"
              onClick={() => setIsOpen(true)}
              style={{ borderRadius: 32 }}
              className="flex cursor-pointer items-center gap-3 bg-gradient-to-br from-indigo-600 to-purple-600 px-5 py-3 shadow-xl shadow-indigo-900/30 transition-shadow hover:shadow-2xl"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              <motion.span
                layoutId="tagged-icon"
                className="text-white"
              >
                <AtSign size={18} strokeWidth={2.5} />
              </motion.span>
              <motion.span
                layoutId="tagged-title"
                className="text-sm font-semibold text-white whitespace-nowrap"
              >
                {sourceText("Tagged")}
              </motion.span>
              {badgeCount > 0 && (
                <motion.div
                  layoutId="tagged-badge"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[12px] font-bold text-indigo-700"
                >
                  {badgeCount > 9 ? "9+" : badgeCount}
                </motion.div>
              )}
            </motion.button>
          ) : (
            <motion.div
              key="expanded"
              layoutId="tagged-disclosure"
              className="w-[340px] bg-white dark:bg-neutral-900 shadow-2xl shadow-black/20"
              style={{ borderRadius: 20 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <motion.span layoutId="tagged-icon" className="text-indigo-600 dark:text-indigo-400">
                    <AtSign size={18} strokeWidth={2.5} />
                  </motion.span>
                  <motion.h2 layoutId="tagged-title" className="text-sm font-bold text-neutral-900 dark:text-white">
                    {sourceText("Tagged for me")}
                  </motion.h2>
                </div>
                <div className="flex items-center gap-1.5">
                  {badgeCount > 0 && (
                    <motion.div layoutId="tagged-badge" className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-[12px] font-bold text-indigo-700 dark:text-indigo-300">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </motion.div>
                  )}
                  <motion.button
                    onClick={() => setIsOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                    whileTap={{ scale: 0.9 }}
                  >
                    <X size={14} strokeWidth={2.5} />
                  </motion.button>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-1.5 px-3 pb-3">
                {query.isLoading ? (
                  <div className="space-y-2 py-2">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 animate-pulse"
                      />
                    ))}
                  </div>
                ) : preview.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-4 text-center text-sm text-neutral-400 dark:text-neutral-500"
                  >
                    {sourceText("All caught up!")} ✨
                  </motion.div>
                ) : (
                  preview.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        delay: index * 0.05 + 0.1,
                        type: "spring",
                        stiffness: 300,
                        damping: 22,
                      }}
                      whileHover={{ scale: 1.01 }}
                      className="group flex cursor-pointer items-start gap-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                    >
                      <Link
                        href={item.destination || "/tagged"}
                        className="flex-1 min-w-0"
                        onClick={() => setIsOpen(false)}
                      >
                        <p className="text-[13px] font-semibold text-neutral-900 dark:text-white truncate">
                          {item.target_label}
                        </p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                          {item.tagged_by_name}{item.message ? ` — ${item.message}` : ""}
                        </p>
                      </Link>
                      <button
                        onClick={(e) => { e.stopPropagation(); resolve.mutate(item.id); }}
                        className="mt-0.5 shrink-0 rounded-full p-1 text-neutral-300 dark:text-neutral-600 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
                        title={sourceText("Mark resolved")}
                      >
                        <CheckCheck size={13} />
                      </button>
                    </motion.div>
                  ))
                )}

                {resolvedPreview.length > 0 && (
                  <div className="pt-1">
                    <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      {sourceText("Resolved")} · {sourceText("Read")}
                    </p>
                    {resolvedPreview.map((item) => (
                      <Link
                        key={item.id}
                        href={item.destination || "/tagged"}
                        onClick={() => setIsOpen(false)}
                        className="flex items-start gap-3 rounded-2xl px-3 py-2 text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium line-through decoration-neutral-300">
                            {item.target_label}
                          </p>
                          <p className="truncate text-[11px]">
                            {item.tagged_by_name}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-neutral-100 dark:border-neutral-800 px-3 py-2.5 flex items-center justify-between">
                <button
                  onClick={() => { resolveAll.mutate(); setIsOpen(false); }}
                  disabled={resolveAll.isPending || unresolved.length === 0}
                  className="text-[12px] font-medium text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-40"
                >
                  {sourceText("Mark all read")}
                </button>
                <Link
                  href="/tagged"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-1 text-[12px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                >
                  {sourceText("See all")} <ArrowRight size={12} />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
