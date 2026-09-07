"use client";

import { useRef, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

/**
 * Blur fade — adapted from the Magic UI "Blur Fade"
 * (https://magicui.design/docs/components/blur-fade).
 *
 * Relationship to `components/ui/reveal.tsx`: `Reveal` is the app-side
 * primitive and stays as it is. This adds the two things the landing page
 * needed and `Reveal` does not have:
 *
 * 1. **A blur term.** Opacity+translate alone reads as a generic dashboard
 *    fade. The short blur-out is what makes a section arrive rather than just
 *    appear, and it is the single cheapest borrowing from the Alche reference
 *    in §03.
 * 2. **Index-driven stagger without a parent orchestrator.** Sections here are
 *    mapped from arrays, so each child knows its own index. `delay = index *
 *    step` keeps the stagger in the child and avoids wrapping every grid in a
 *    motion parent.
 *
 * Direction is expressed in **logical** terms (`start`/`end`, not left/right)
 * and flipped for RTL, because Arabic is a supported locale — a hardcoded
 * `x: -24` slides the wrong way in Arabic.
 *
 * Reduced motion returns the children with no wrapper animation at all, rather
 * than a fast one, so nothing moves and nothing blurs.
 */
export function BlurFade({
  children,
  className,
  delay = 0,
  direction = "up",
  distance = 20,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "start" | "end" | "none";
  distance?: number;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, margin: "-64px" });
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  const offset: { x?: number; y?: number } =
    direction === "up"
      ? { y: distance }
      : direction === "down"
        ? { y: -distance }
        : direction === "start"
          ? { x: distance }
          : direction === "end"
            ? { x: -distance }
            : {};

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, filter: "blur(8px)", ...offset }}
      animate={
        inView
          ? { opacity: 1, filter: "blur(0px)", x: 0, y: 0 }
          : { opacity: 0, filter: "blur(8px)", ...offset }
      }
      transition={{
        duration: 0.55,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
