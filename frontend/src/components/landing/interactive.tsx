"use client";

/**
 * Pointer-driven interaction primitives.
 *
 * All of these are ENHANCEMENTS: every component here renders a complete,
 * usable control before any listener is attached. If JS never runs, the
 * button is still a button and the card is still a card. Nothing here gates
 * content behind a hover state - hover-only content is invisible on touch
 * devices and to keyboard users, so it is banned on these pages.
 *
 * Cursor effects are suppressed on coarse pointers (they cost work and
 * deliver nothing) and under prefers-reduced-motion.
 */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { EASE_CSS, FOCUS_RING, RADIUS } from "./design-system";

function canAnimate(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ---------------------------------------------------------- MagneticButton */

type MagneticBaseProps = {
  children: ReactNode;
  /** Visual weight. Orange is the accent and stays inside the 5% budget. */
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  /** Max pixels of pull toward the cursor. Above ~8px it feels unstable. */
  strength?: number;
  className?: string;
};

type MagneticButtonProps = MagneticBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof MagneticBaseProps> & {
    href?: undefined;
  };

type MagneticLinkProps = MagneticBaseProps & {
  /** Internal route or anchor. Renders next/link. */
  href: string;
  ariaLabel?: string;
};

const VARIANT: Record<NonNullable<MagneticBaseProps["variant"]>, string> = {
  // The single strongest CTA. Orange, used sparingly.
  primary:
    "bg-[hsl(var(--brand-orange-500))] text-[hsl(var(--landing-ink))] hover:brightness-[1.06] shadow-[0_10px_28px_-10px_hsl(var(--brand-orange-500)/0.65)]",
  // Structural indigo: the default for most actions.
  secondary:
    "bg-[hsl(var(--primary))] text-primary-foreground hover:brightness-[1.08] shadow-[0_10px_28px_-12px_hsl(var(--primary)/0.55)]",
  ghost:
    "border border-[hsl(var(--primary)/0.22)] bg-background/70 text-foreground backdrop-blur-xl hover:border-[hsl(var(--brand-blue-500)/0.55)] hover:bg-background/90",
};

const SIZE = {
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-14 px-8 text-base",
} as const;

function magneticClasses(
  variant: NonNullable<MagneticBaseProps["variant"]>,
  size: NonNullable<MagneticBaseProps["size"]>,
  className?: string,
) {
  return [
    "group relative inline-flex items-center justify-center gap-2 overflow-hidden font-semibold",
    RADIUS.pill,
    SIZE[size],
    VARIANT[variant],
    FOCUS_RING,
    "transition-[filter,border-color,background-color,box-shadow] duration-150",
    "disabled:pointer-events-none disabled:opacity-60",
    className ?? "",
  ].join(" ");
}

/**
 * Shared magnetic behaviour: the element leans a few pixels toward the
 * cursor and springs back on leave. A sheen sweeps across on hover.
 */
function useMagnetic(strength: number) {
  const ref = useRef<HTMLElement | null>(null);

  const onMove = useCallback(
    (event: React.PointerEvent) => {
      const el = ref.current;
      if (!el || !canAnimate()) return;
      const rect = el.getBoundingClientRect();
      const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      el.style.transition = "transform 80ms linear";
      el.style.transform = `translate3d(${(dx * strength).toFixed(2)}px, ${(
        dy * strength
      ).toFixed(2)}px, 0)`;
      // Feeds the hover sheen position.
      el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      el.style.setProperty("--my", `${event.clientY - rect.top}px`);
    },
    [strength],
  );

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Slight overshoot on the way back: that is what makes it feel physical.
    el.style.transition = `transform 420ms ${EASE_CSS.enter}`;
    el.style.transform = "translate3d(0, 0, 0)";
  }, []);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el) el.style.transform = "";
    };
  }, []);

  return { ref, onMove, onLeave };
}

function Sheen() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      style={{
        background:
          "radial-gradient(120px circle at var(--mx, 50%) var(--my, 50%), hsl(0 0% 100% / 0.28), transparent 70%)",
      }}
    />
  );
}

export function MagneticButton({
  children,
  variant = "secondary",
  size = "md",
  strength = 6,
  className,
  ...rest
}: MagneticButtonProps) {
  const { ref, onMove, onLeave } = useMagnetic(strength);
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={magneticClasses(variant, size, className)}
      {...rest}
    >
      <Sheen />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}

export function MagneticLink({
  children,
  href,
  variant = "secondary",
  size = "md",
  strength = 6,
  className,
  ariaLabel,
}: MagneticLinkProps) {
  const { ref, onMove, onLeave } = useMagnetic(strength);
  return (
    <Link
      ref={ref as React.Ref<HTMLAnchorElement>}
      href={href}
      aria-label={ariaLabel}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={magneticClasses(variant, size, className)}
    >
      <Sheen />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </Link>
  );
}

/* ------------------------------------------------------------ SpotlightCard */

export type SpotlightCardProps = {
  children: ReactNode;
  className?: string;
  /** Spotlight tint. Indigo by default; azure for interactive contexts. */
  tone?: "indigo" | "azure";
  /** Add a hairline that brightens on hover. */
  hairline?: boolean;
};

/**
 * Cursor-tracked spotlight, in the manner of the SkiperUI feature cards.
 *
 * The spotlight is decoration layered over content that is already fully
 * visible - it never reveals anything. Radius sits at 12px so any nested
 * element can step down by >=4px and still look intentional.
 */
export function SpotlightCard({
  children,
  className,
  tone = "indigo",
  hairline = true,
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  const onMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !canAnimate()) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--x", `${event.clientX - rect.left}px`);
    el.style.setProperty("--y", `${event.clientY - rect.top}px`);
    el.style.setProperty("--spot", "1");
  }, []);

  const onLeave = useCallback(() => {
    ref.current?.style.setProperty("--spot", "0");
  }, []);

  const tint =
    tone === "azure"
      ? "hsl(var(--brand-blue-500) / 0.16)"
      : "hsl(var(--primary) / 0.14)";

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={[
        "group relative isolate overflow-hidden bg-[hsl(var(--glass))] dark:bg-[hsl(var(--brand-surface))]",
        RADIUS.card,
        hairline
          ? "border border-[hsl(var(--primary)/0.10)] transition-colors duration-200 hover:border-[hsl(var(--brand-blue-500)/0.45)]"
          : "",
        "transition-transform duration-300 hover:-translate-y-0.5",
        className ?? "",
      ].join(" ")}
      style={{ "--spot": 0 } as React.CSSProperties}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: "var(--spot, 0)",
          background: `radial-gradient(340px circle at var(--x, 50%) var(--y, 50%), ${tint}, transparent 68%)`,
        }}
      />
      {/* Top inner highlight: reads as a physical edge catching light. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------- TiltPanel */

export type TiltPanelProps = {
  children: ReactNode;
  className?: string;
  /** Max rotation in degrees. Keep <=6 or it reads as a gimmick. */
  max?: number;
};

/**
 * Subtle 3D tilt for the hero stage. Perspective is applied on a wrapper so
 * the child keeps its own stacking context and text stays crisp.
 */
export function TiltPanel({ children, className, max = 5 }: TiltPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  const onMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el || !canAnimate()) return;
      const rect = el.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      el.style.transition = "transform 120ms linear";
      el.style.transform = `rotateY(${(px * max).toFixed(2)}deg) rotateX(${(
        -py * max
      ).toFixed(2)}deg)`;
    },
    [max],
  );

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = `transform 620ms ${EASE_CSS.enter}`;
    el.style.transform = "rotateY(0deg) rotateX(0deg)";
  }, []);

  return (
    <div style={{ perspective: "1400px" }} className={className}>
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ transformStyle: "preserve-3d" }}
      >
        {children}
      </div>
    </div>
  );
}
