"use client";

/**
 * Reveal primitives for the public surfaces.
 *
 * THE VISIBILITY RULE (non-negotiable)
 * ------------------------------------
 * The reference site we were shown fails exactly here: its headings are split
 * into per-letter spans that stay stuck mid-animation, so real content is
 * illegible or invisible. Two rules prevent us from repeating that:
 *
 *   1. Nothing is hidden in markup. Every element renders fully visible.
 *      The "hidden" state is applied by JS *after* mount, so with JS disabled,
 *      blocked, or still loading, all text and imagery is simply there.
 *   2. Every animation has a guaranteed terminal state. Inline styles are
 *      cleared once the transition ends, so an element can never be left
 *      stranded at partial opacity.
 *
 * Text is revealed at WORD level, never per letter - per-letter reveals are
 * what make a page feel machine-generated, and they are a legibility hazard.
 *
 * These use CSS transitions driven by IntersectionObserver rather than a
 * motion library, because a library's `initial` prop serialises into the SSR
 * HTML as `opacity: 0` - which would break rule 1.
 */

import {
  createElement,
  useEffect,
  useRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import { useExperience } from "@/lib/experience";
import { translateSource } from "@/lib/i18n/source-catalog";
import { EASE_CSS } from "./design-system";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(REDUCE_QUERY).matches
  );
}

/**
 * Clear every inline style this module applies. Called on transition end and
 * on unmount so an element is never left in an animating state.
 */
function settle(el: HTMLElement) {
  el.style.transition = "";
  el.style.opacity = "";
  el.style.transform = "";
  el.style.clipPath = "";
  el.style.willChange = "";
  el.dataset.revealed = "true";
}

/* ------------------------------------------------------------ ScrollReveal */

export type ScrollRevealProps = {
  children: ReactNode;
  /** Delay in ms. Use with `index` inside a group instead of hand-tuning. */
  delay?: number;
  /** Rise distance. 16px is the house default; 24px for flagship blocks. */
  y?: number;
  /** Duration in ms. Arrival should never feel rushed: >=350ms. */
  duration?: number;
  /** Fraction of the element that must be visible to trigger. */
  threshold?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  id?: string;
};

/**
 * Canonical entrance: fade + rise + a 0.98 scale settle. Fires once.
 */
export function ScrollReveal({
  children,
  delay = 0,
  y = 16,
  duration = 350,
  threshold = 0.2,
  as = "div",
  className,
  style,
  id,
}: ScrollRevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reduced motion: leave the element exactly as rendered - visible.
    if (prefersReducedMotion()) {
      el.dataset.revealed = "true";
      return;
    }

    let timer: number | undefined;

    // Apply the hidden state only now, post-mount.
    el.style.opacity = "0";
    el.style.transform = `translate3d(0, ${y}px, 0) scale(0.98)`;
    el.style.willChange = "opacity, transform";
    el.dataset.revealed = "false";

    const reveal = () => {
      el.style.transition = [
        `opacity ${duration}ms ${EASE_CSS.enter} ${delay}ms`,
        `transform ${duration}ms ${EASE_CSS.enter} ${delay}ms`,
      ].join(", ");
      el.style.opacity = "1";
      el.style.transform = "translate3d(0, 0, 0) scale(1)";
      // Guaranteed terminal state, even if transitionend never fires.
      timer = window.setTimeout(() => settle(el), duration + delay + 80);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        reveal();
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
      // If we unmount mid-animation, never leave the node transparent.
      settle(el);
    };
  }, [delay, duration, threshold, y]);

  return createElement(
    as,
    { ref, className, style, id, "data-revealed": "true" },
    children,
  );
}

/* ----------------------------------------------------------- StaggerGroup */

export type StaggerGroupProps = {
  children: ReactNode[];
  /** Per-child delay in ms. House value is 70ms. */
  step?: number;
  /** Delay before the first child, in ms. */
  lead?: number;
  /** Cap the cascade so long lists never feel slow. */
  max?: number;
  y?: number;
  as?: ElementType;
  className?: string;
  childClassName?: string;
};

/**
 * Wraps each child in a ScrollReveal with an incrementing delay.
 * Only one stagger group should be visible per viewport - beyond that the
 * cascade reads as lag rather than choreography.
 */
export function StaggerGroup({
  children,
  step = 70,
  lead = 50,
  max = 6,
  y = 16,
  as = "div",
  className,
  childClassName,
}: StaggerGroupProps) {
  return createElement(
    as,
    { className },
    children.map((child, index) => (
      <ScrollReveal
        key={index}
        delay={lead + Math.min(index, max) * step}
        y={y}
        className={childClassName}
      >
        {child}
      </ScrollReveal>
    )),
  );
}

/* --------------------------------------------------------- WordMaskReveal */

export type WordMaskRevealProps = {
  /** Plain text. Word-level splitting only - never per character. */
  text: string;
  /** Per-word delay in ms. */
  step?: number;
  lead?: number;
  duration?: number;
  /**
   * Draw a 1px azure leading edge that travels with each word as it rises.
   * Reserve this for the hero - it is a signature moment, not a default.
   */
  leadingEdge?: boolean;
  as?: ElementType;
  className?: string;
  /** Words to render in the accent colour, matched case-insensitively. */
  accentWords?: string[];
};

/**
 * Hero headline reveal: each word rises out of its own mask.
 *
 * The whole phrase is present in the DOM as real text from the first byte,
 * so it is selectable, translatable, readable by screen readers, and fully
 * visible without JS. Masking is layered on afterwards.
 */
export function WordMaskReveal({
  text,
  step = 55,
  lead = 80,
  duration = 620,
  leadingEdge = false,
  as = "span",
  className,
  accentWords,
}: WordMaskRevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const { locale } = useExperience();
  const resolved = translateSource(text, locale);
  const words = resolved.split(" ").filter(Boolean);
  const accent = new Set((accentWords ?? []).map((w) => w.toLowerCase()));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      el.dataset.revealed = "true";
      return;
    }

    const inners = Array.from(
      el.querySelectorAll<HTMLElement>("[data-word-inner]"),
    );
    const edges = Array.from(el.querySelectorAll<HTMLElement>("[data-word-edge]"));
    if (inners.length === 0) return;

    const timers: number[] = [];

    inners.forEach((inner) => {
      inner.style.transform = "translate3d(0, 108%, 0)";
      inner.style.willChange = "transform";
    });
    edges.forEach((edge) => {
      edge.style.opacity = "0";
      edge.style.transform = "scaleX(0)";
    });
    el.dataset.revealed = "false";

    const reveal = () => {
      inners.forEach((inner, index) => {
        const delay = lead + index * step;
        inner.style.transition = `transform ${duration}ms ${EASE_CSS.enter} ${delay}ms`;
        inner.style.transform = "translate3d(0, 0, 0)";

        const edge = edges[index];
        if (edge) {
          // The edge brightens as the word arrives, then wipes away -
          // it reads as the word being "printed" onto the page.
          edge.style.transition = [
            `opacity 200ms ${EASE_CSS.mid} ${delay}ms`,
            `transform 420ms ${EASE_CSS.enter} ${delay}ms`,
          ].join(", ");
          edge.style.opacity = "1";
          edge.style.transform = "scaleX(1)";
          timers.push(
            window.setTimeout(() => {
              edge.style.transition = `opacity 320ms ${EASE_CSS.exit}`;
              edge.style.opacity = "0";
            }, delay + 300),
          );
        }
      });

      const total = lead + inners.length * step + duration + 120;
      timers.push(
        window.setTimeout(() => {
          inners.forEach((inner) => {
            inner.style.transition = "";
            inner.style.transform = "";
            inner.style.willChange = "";
          });
          edges.forEach((edge) => {
            edge.style.transition = "";
            edge.style.opacity = "0";
            edge.style.transform = "";
          });
          el.dataset.revealed = "true";
        }, total),
      );
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        reveal();
      },
      { threshold: 0.15 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
      inners.forEach((inner) => {
        inner.style.transition = "";
        inner.style.transform = "";
        inner.style.willChange = "";
      });
      edges.forEach((edge) => {
        edge.style.opacity = "0";
      });
      el.dataset.revealed = "true";
    };
  }, [duration, lead, resolved, step]);

  return createElement(
    as,
    { ref, className, "data-revealed": "true" },
    words.map((word, index) => (
      <span
        key={`${word}-${index}`}
        className="relative inline-block overflow-hidden align-bottom"
        // Descenders (g, y, p) would be clipped by an exact-height mask.
        style={{ paddingBottom: "0.12em", marginBottom: "-0.12em" }}
      >
        <span data-word-inner className="inline-block">
          {accent.has(word.toLowerCase()) ? (
            <span className="text-[hsl(var(--brand-orange-500))]">{word}</span>
          ) : (
            word
          )}
        </span>
        {leadingEdge ? (
          <span
            data-word-edge
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[0.14em] left-0 h-px w-full origin-left bg-[hsl(var(--brand-blue-500))] opacity-0"
          />
        ) : null}
        {index < words.length - 1 ? <span>&nbsp;</span> : null}
      </span>
    )),
  );
}

/* ------------------------------------------------------------- StatCounter */

export type StatCounterProps = {
  value: number;
  /** Rendered before/after the number, e.g. "+" or "%". */
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
  /** Locale-aware grouping. Defaults to plain digits for stability. */
  format?: (value: number) => string;
};

/**
 * Counts up once, with a decelerating tail so it reads as a measured
 * instrument rather than a slot machine.
 *
 * The final value is what renders server-side, so the real number is present
 * without JS and for screen readers.
 */
export function StatCounter({
  value,
  prefix = "",
  suffix = "",
  duration = 1500,
  className,
  format,
}: StatCounterProps) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const render = format ?? ((n: number) => String(n));
    let frame: number | null = null;

    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        // Quintic ease-out: ~85% of the distance in the first third, then a
        // long settle. That tail is what makes it feel deliberate.
        const eased = 1 - Math.pow(1 - t, 5);
        el.textContent = `${prefix}${render(Math.round(value * eased))}${suffix}`;
        if (t < 1) frame = requestAnimationFrame(tick);
        else el.textContent = `${prefix}${render(value)}${suffix}`;
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        run();
      },
      { threshold: 0.6 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      // Terminal state: the true value, always.
      el.textContent = `${prefix}${render(value)}${suffix}`;
    };
  }, [duration, format, prefix, suffix, value]);

  return (
    <span ref={ref} className={className}>
      {`${prefix}${format ? format(value) : value}${suffix}`}
    </span>
  );
}
