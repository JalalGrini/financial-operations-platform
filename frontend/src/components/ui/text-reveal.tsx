"use client";
import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * TextReveal
 * Splits text into words that each fade+slide in on mount.
 * Lightweight — uses CSS animations only, no Framer dep.
 * Inspired by Motion Primitives text-reveal pattern.
 */
export function TextReveal({
  text,
  className,
  wordClassName,
  delay = 0,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
}) {
  const words = text.split(" ");
  return (
    <span className={cn("inline", className)} aria-label={text}>
      {words.map((word, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn(
            "inline-block animate-word-in opacity-0",
            "motion-reduce:animate-none motion-reduce:opacity-100",
            wordClassName,
          )}
          style={{
            animationDelay: `${delay + i * 55}ms`,
            animationFillMode: "forwards",
          }}
        >
          {word}{" "}
        </span>
      ))}
    </span>
  );
}
