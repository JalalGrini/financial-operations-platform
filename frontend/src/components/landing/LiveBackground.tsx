"use client";

/**
 * Live WebGL ambient background for the public surfaces.
 *
 * WHY RAW WebGL AND NOT three.js
 * ------------------------------
 * The ThreeUI reference components all `import * as THREE from "three"`, and
 * `three` is not installed and cannot be installed (the build environment has
 * no network). A single full-screen quad with one fragment shader reproduces
 * the same class of visual for ~4KB instead of ~600KB, so this is the better
 * engineering choice regardless.
 *
 * DESIGN CONTRACT
 * - Colours are read from the brand CSS tokens at runtime, never hardcoded,
 *   so the shader follows the theme and any future token change.
 * - `u_dark` is animated rather than switched, which lets the palette
 *   cross-fade in step with the View Transitions theme wipe.
 * - Purely decorative: `aria-hidden`, `pointer-events: none`.
 * - Degrades in this order: animated shader -> single static frame
 *   (reduced motion) -> CSS gradient (no WebGL / context lost).
 *
 * PERFORMANCE
 * - DPR capped at 1.5; above that cost doubles for no visible gain.
 * - rAF is cancelled entirely when offscreen or when the tab is hidden.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE_FRAGMENT_SHADER, LIVE_VERTEX_SHADER } from "./live-background-shaders";

type Rgb = [number, number, number];

export type LiveBackgroundProps = {
  /**
   * Global amplitude of the effect. 1 = hero. Use lower values behind
   * content-heavy sections so text always wins.
   */
  intensity?: number;
  /** Enable cursor parallax. Ignored on touch pointers. */
  interactive?: boolean;
  className?: string;
};

/* --------------------------------------------------------------- utilities */

/**
 * Parse a Tailwind/shadcn HSL token body such as `"226 41% 38%"` into linear
 * 0..1 RGB. Returns null when the token is missing or malformed so the caller
 * can fall back rather than render black.
 */
function parseHslToken(raw: string): Rgb | null {
  const cleaned = raw.trim().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!cleaned) return null;

  const parts = cleaned.split(" ").slice(0, 3);
  if (parts.length < 3) return null;

  const h = Number.parseFloat(parts[0]);
  const s = Number.parseFloat(parts[1]) / 100;
  const l = Number.parseFloat(parts[2]) / 100;
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) {
    return null;
  }

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;

  let rgb: Rgb;
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}

function readToken(styles: CSSStyleDeclaration, name: string, fallback: Rgb): Rgb {
  return parseHslToken(styles.getPropertyValue(name)) ?? fallback;
}

function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // Surfacing this in dev prevents a silent black rectangle.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[LiveBackground] shader compile failed:", gl.getShaderInfoLog(shader));
    }
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/* -------------------------------------------------------------- component */

export function LiveBackground({
  intensity = 1,
  interactive = true,
  className,
}: LiveBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [supported, setSupported] = useState(true);

  // Mutable render state kept in refs so the rAF loop never re-subscribes.
  const frameRef = useRef<number | null>(null);
  const visibleRef = useRef(true);
  const darkRef = useRef(0); // animated current value
  const darkTargetRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0, tx: 0, ty: 0, strength: 0 });
  const intensityRef = useRef(intensity);

  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);

  /** Read the brand tokens currently in effect. Re-run on theme change. */
  const readPalette = useCallback(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      indigo: readToken(styles, "--primary", [0.224, 0.286, 0.533]),
      azure: readToken(styles, "--brand-blue-500", [0.0, 0.588, 0.824]),
      orange: readToken(styles, "--brand-orange-500", [0.941, 0.51, 0.078]),
      baseLight: readToken(styles, "--background", [0.957, 0.961, 0.973]),
      baseDark: readToken(styles, "--landing-ink", [0.043, 0.055, 0.09]),
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");

    const gl =
      (canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
        preserveDrawingBuffer: false,
      }) as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

    if (!gl) {
      setSupported(false);
      return;
    }

    /* ---------------------------------------------------------- program */

    const vs = compile(gl, gl.VERTEX_SHADER, LIVE_VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, LIVE_FRAGMENT_SHADER);
    const program = vs && fs ? gl.createProgram() : null;

    if (!vs || !fs || !program) {
      setSupported(false);
      return;
    }

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[LiveBackground] link failed:", gl.getProgramInfoLog(program));
      }
      setSupported(false);
      return;
    }
    gl.useProgram(program);

    // Full-screen quad as two triangles in clip space.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPosition = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const u = {
      resolution: gl.getUniformLocation(program, "u_resolution"),
      time: gl.getUniformLocation(program, "u_time"),
      dark: gl.getUniformLocation(program, "u_dark"),
      intensity: gl.getUniformLocation(program, "u_intensity"),
      pointer: gl.getUniformLocation(program, "u_pointer"),
      pointerPos: gl.getUniformLocation(program, "u_pointerPos"),
      indigo: gl.getUniformLocation(program, "u_indigo"),
      azure: gl.getUniformLocation(program, "u_azure"),
      orange: gl.getUniformLocation(program, "u_orange"),
      baseLight: gl.getUniformLocation(program, "u_baseLight"),
      baseDark: gl.getUniformLocation(program, "u_baseDark"),
    };

    let palette = readPalette();
    const uploadPalette = () => {
      gl.uniform3fv(u.indigo, palette.indigo);
      gl.uniform3fv(u.azure, palette.azure);
      gl.uniform3fv(u.orange, palette.orange);
      gl.uniform3fv(u.baseLight, palette.baseLight);
      gl.uniform3fv(u.baseDark, palette.baseDark);
    };
    uploadPalette();

    /* ----------------------------------------------------------- sizing */

    let width = 0;
    let height = 0;

    const resize = () => {
      // Cap DPR: beyond 1.5 the fill cost doubles with no perceptible gain.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.resolution, w, h);
      pointerRef.current.x = w / 2;
      pointerRef.current.y = h / 2;
      pointerRef.current.tx = w / 2;
      pointerRef.current.ty = h / 2;
    };
    resize();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reduceMotion.matches) renderOnce();
    });
    resizeObserver.observe(canvas);

    /* ------------------------------------------------------ theme target */

    const syncDarkTarget = () => {
      darkTargetRef.current = document.documentElement.classList.contains("dark") ? 1 : 0;
    };
    syncDarkTarget();
    // On first paint, adopt the theme immediately - only later changes animate.
    darkRef.current = darkTargetRef.current;

    const themeObserver = new MutationObserver(() => {
      syncDarkTarget();
      // Tokens differ per theme, so re-read them on every theme change.
      palette = readPalette();
      uploadPalette();
      if (reduceMotion.matches) {
        darkRef.current = darkTargetRef.current;
        renderOnce();
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    /* ---------------------------------------------------------- pointer */

    const onPointerMove = (event: PointerEvent) => {
      if (!interactive || !finePointer.matches) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      pointerRef.current.tx = (event.clientX - rect.left) * dpr;
      // WebGL's origin is bottom-left; the DOM's is top-left.
      pointerRef.current.ty = (rect.height - (event.clientY - rect.top)) * dpr;
      pointerRef.current.strength = 1;
    };
    if (interactive) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    /* ------------------------------------------------------------ render */

    const draw = (timeSeconds: number) => {
      const p = pointerRef.current;
      gl.uniform1f(u.time, timeSeconds);
      gl.uniform1f(u.dark, darkRef.current);
      gl.uniform1f(u.intensity, intensityRef.current);
      gl.uniform1f(u.pointer, p.strength);
      gl.uniform2f(u.pointerPos, p.x, p.y);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    function renderOnce() {
      // A representative still frame: t>0 so it is not the degenerate t=0 field.
      draw(12);
    }

    const start = performance.now();
    let last = start;

    const loop = (now: number) => {
      frameRef.current = requestAnimationFrame(loop);
      if (!visibleRef.current || document.hidden) return;

      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      // Ease the theme uniform toward its target: this is what makes the
      // palette cross-fade land together with the circular theme wipe.
      const d = darkTargetRef.current - darkRef.current;
      if (Math.abs(d) > 0.001) {
        darkRef.current += d * Math.min(1, dt * 4.5);
      } else {
        darkRef.current = darkTargetRef.current;
      }

      // Lerp the pointer so fast cursor moves read as inertia, not jitter.
      const p = pointerRef.current;
      p.x += (p.tx - p.x) * Math.min(1, dt * 3.2);
      p.y += (p.ty - p.y) * Math.min(1, dt * 3.2);

      draw((now - start) / 1000);
    };

    const startLoop = () => {
      if (frameRef.current !== null) return;
      last = performance.now();
      frameRef.current = requestAnimationFrame(loop);
    };

    const stopLoop = () => {
      if (frameRef.current === null) return;
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };

    /* ------------------------------------------------- pause when unseen */

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        visibleRef.current = entries.some((entry) => entry.isIntersecting);
        if (!reduceMotion.matches) {
          if (visibleRef.current) startLoop();
          else stopLoop();
        }
      },
      { rootMargin: "120px" },
    );
    intersectionObserver.observe(canvas);

    const onVisibility = () => {
      if (reduceMotion.matches) return;
      if (document.hidden) stopLoop();
      else if (visibleRef.current) startLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    /* -------------------------------------------------- reduced motion */

    const onReduceChange = () => {
      if (reduceMotion.matches) {
        stopLoop();
        darkRef.current = darkTargetRef.current;
        renderOnce();
      } else {
        startLoop();
      }
    };
    reduceMotion.addEventListener("change", onReduceChange);

    if (reduceMotion.matches) renderOnce();
    else startLoop();

    /* --------------------------------------------------- context loss */

    const onContextLost = (event: Event) => {
      event.preventDefault();
      stopLoop();
      setSupported(false);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    /* ------------------------------------------------------- teardown */

    return () => {
      stopLoop();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMotion.removeEventListener("change", onReduceChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      if (interactive) window.removeEventListener("pointermove", onPointerMove);

      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // Free the drawing buffer eagerly; browsers cap live WebGL contexts.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [interactive, readPalette]);

  /*
   * Fallback. Rendered when WebGL is unavailable or the context was lost.
   * Uses the same three brand tokens and the same compositional idea
   * (two ribbons + three drifting lights) so the page never looks broken.
   */
  if (!supported) {
    return (
      <div
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-0 overflow-hidden",
          className ?? "",
        ].join(" ")}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 12% 22%, hsl(var(--primary)/0.22), transparent 62%)," +
              "radial-gradient(100% 70% at 88% 28%, hsl(var(--brand-blue-500)/0.20), transparent 60%)," +
              "radial-gradient(90% 60% at 55% 92%, hsl(var(--brand-orange-500)/0.10), transparent 58%)," +
              "linear-gradient(180deg, hsl(var(--background)), hsl(var(--background)))",
          }}
        />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={[
        "pointer-events-none absolute inset-0 h-full w-full",
        className ?? "",
      ].join(" ")}
    />
  );
}

export default LiveBackground;
