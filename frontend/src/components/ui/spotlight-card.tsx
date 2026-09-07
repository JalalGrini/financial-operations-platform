"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Spotlight card — adapted from the Aceternity UI "Card Spotlight"
 * (https://ui.aceternity.com/components/card-spotlight) and the same
 * pointer-tracking idea in Magic UI's "Magic Card".
 *
 * Adaptations that matter:
 *
 * 1. **Brand gradient, two stops.** The reference paints a single neutral white
 *    or violet radial. This one runs the logo's azure into the logo's orange,
 *    so the highlight is the brand identity rather than a generic glow. That is
 *    the specific thing the owner asked for: the grading, not just the blue.
 * 2. **No state update per pointer move.** The reference stores x/y in React
 *    state, which re-renders the subtree on every `mousemove`. This writes CSS
 *    custom properties straight onto the node, so the browser composites it and
 *    React does no work. Only the boolean "is hovered" is state, and it changes
 *    twice per hover.
 * 3. **Hover is an enhancement, never a requirement.** §32 forbids any critical
 *    feature depending on hover; the card's content is fully readable with the
 *    spotlight at zero opacity, which is its state on touch devices.
 *
 * Rendered as a plain element by default so it can wrap `<article>` semantics
 * without adding a redundant div.
 */
export function SpotlightCard({
  children,
  className,
  as: Tag = "div",
  radius = 320,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "section";
  radius?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(false);

  const handleMove = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      onMouseMove={handleMove}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      style={{ ["--spot-radius" as string]: `${radius}px` }}
      className={cn("efop-spotlight group/spot relative", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "efop-spotlight-glow pointer-events-none absolute inset-0 transition-opacity duration-300",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      {children}
    </Tag>
  );
}
