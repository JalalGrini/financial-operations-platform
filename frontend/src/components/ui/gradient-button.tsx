'use client';
import { cn } from "@/lib/utils";
import React from "react";

interface GradientButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: "primary" | "secondary"; }

export function GradientButton({ children, className, variant = "primary", ...props }: GradientButtonProps) {
  return (
    <button
      className={cn("group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
        variant === "primary" && "bg-gradient-to-r from-primary to-[hsl(197_100%_41%)] text-white hover:from-primary/90 hover:to-[hsl(197_100%_35%)]",
        variant === "secondary" && "border border-border/60 bg-background text-foreground hover:border-primary/40 hover:bg-primary/5",
        className)}
      {...props}
    >
      <span className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)" }} />
      {children}
    </button>
  );
}
