'use client';
import { motion } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Tab { id: string; label: string; }
interface AnimatedTabsProps { tabs: Tab[]; defaultTab?: string; onChange?: (id: string) => void; className?: string; }

export function AnimatedTabs({ tabs, defaultTab, onChange, className }: AnimatedTabsProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);
  return (
    <div className={cn("flex gap-1 rounded-lg bg-muted p-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => { setActive(tab.id); onChange?.(tab.id); }}
          className={cn("relative px-4 py-1.5 text-sm font-medium transition-colors duration-150 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {active === tab.id && (
            <motion.span layoutId="tab-indicator" className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ type: "spring", stiffness: 400, damping: 35 }} />
          )}
          <span className="relative">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
