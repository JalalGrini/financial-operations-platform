"use client";

/**
 * Sticky top bar shell.
 *
 * This component owns only the scroll BEHAVIOUR; the brand, navigation,
 * controls and actions are passed in as children from the page. That split is
 * deliberate: the page stays the single place where the real navigation
 * targets and the experience controls are declared, and this file stays a
 * presentational shell with no content of its own.
 *
 * At the top of the document the bar is transparent so the live background
 * runs edge to edge. Past ~24px it earns a translucent surface, a hairline
 * and a soft shadow, so navigation never sits illegibly on moving imagery.
 *
 * The bar never auto-hides. Hiding navigation on scroll is a common trick,
 * but it makes the page feel unstable and hides a real control, which the
 * visibility rules for these pages forbid.
 */

import { useEffect, useRef, useState } from "react";
import { CONTAINER } from "./design-system";

export function TopBar({ children }: { children: React.ReactNode }) {
  const [lifted, setLifted] = useState(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const read = () => {
      frame.current = null;
      setLifted(window.scrollY > 24);
    };
    const onScroll = () => {
      // Coalesce to one read per frame: scroll fires far more often than the
      // screen refreshes, and this listener must never be the cause of jank.
      if (frame.current === null) frame.current = requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <header
      data-lifted={lifted}
      className={[
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,box-shadow] duration-300",
        lifted
          ? "border-b border-[hsl(var(--primary)/0.10)] bg-background/80 shadow-[0_1px_24px_-8px_hsl(var(--primary)/0.25)] backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      ].join(" ")}
    >
      <div className={`${CONTAINER} flex h-16 items-center justify-between gap-6`}>
        {children}
      </div>
    </header>
  );
}

export default TopBar;
