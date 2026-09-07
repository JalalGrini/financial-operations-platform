'use client';
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface LocaleOption { code: string; label: string; flag?: string; }
export interface AnimatedLocaleSelectorProps {
  locales: LocaleOption[];
  current: string;
  onChange: (code: string) => void;
  className?: string;
}

export function AnimatedLocaleSelector({ locales, current, onChange, className }: AnimatedLocaleSelectorProps) {
  const [open, setOpen] = useState(false);
  const active = locales.find((l) => l.code === current) ?? locales[0];
  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AnimatePresence mode="wait">
          <motion.span key={active.code} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }} className="flex items-center gap-1.5">
            {active.flag && <span aria-hidden>{active.flag}</span>}
            <span>{active.label}</span>
          </motion.span>
        </AnimatePresence>
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.ul role="listbox" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }} className="absolute end-0 top-full z-50 mt-1 min-w-[8rem] overflow-hidden rounded-lg border bg-popover py-1 shadow-lg">
              {locales.map((locale) => (
                <li key={locale.code} role="option" aria-selected={locale.code === current} onClick={() => { onChange(locale.code); setOpen(false); }} className={cn("flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors", locale.code === current ? "bg-accent text-accent-foreground font-medium" : "text-popover-foreground hover:bg-muted")}>
                  {locale.flag && <span aria-hidden>{locale.flag}</span>}
                  {locale.label}
                </li>
              ))}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
