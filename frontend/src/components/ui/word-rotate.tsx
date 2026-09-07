"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * WordRotate
 * Cycles through a list of words with a smooth cross-fade.
 * Inspired by Motion Primitives — adapted for EFOP.
 * Respects prefers-reduced-motion.
 */
export function WordRotate({
  words,
  interval = 2600,
  className,
}: {
  words: string[];
  interval?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (words.length < 2) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % words.length);
        setVisible(true);
      }, 220);
    }, interval);
    return () => clearInterval(id);
  }, [words, interval]);

  return (
    <span
      className={cn(
        "inline-block transition-all duration-200",
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1",
        "motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none",
        className,
      )}
    >
      {words[index]}
    </span>
  );
}
