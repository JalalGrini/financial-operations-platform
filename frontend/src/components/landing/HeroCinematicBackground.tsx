"use client";

/**
 * Cinematic photographic hero. The office still is uploaded as a WebGL
 * texture and graded in-shader. This is decoration only: aria-hidden,
 * pointer-events none, paused offscreen / when the tab is hidden, and a
 * static <img> if WebGL cannot compile or the texture fails to load.
 */

import { useEffect, useRef, useState } from "react";
import { HERO_FRAGMENT_SHADER, HERO_VERTEX_SHADER } from "./hero-cinematic-shaders";

export const HERO_OFFICE_PHOTO = "/images/landing/hero-office-hi.jpg";

type Rgb = [number, number, number];

export type HeroCinematicBackgroundProps = {
  className?: string;
  /** Enable cursor parallax. Ignored on touch pointers and reduced motion. */
  interactive?: boolean;
};

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
  const hp = (((h % 360) + 360) % 360) / 60;
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
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[HeroCinematicBackground] shader compile failed:",
        gl.getShaderInfoLog(shader),
      );
    }
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function FallbackPhoto({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={["pointer-events-none absolute inset-0 overflow-hidden", className ?? ""].join(
        " ",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={HERO_OFFICE_PHOTO}
        alt=""
        className="h-full w-full scale-110 object-cover"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(8 14 32 / 0.42) 0%, rgb(8 14 32 / 0.58) 46%, hsl(var(--background)) 100%)," +
            "radial-gradient(120% 90% at 38% 40%, transparent 28%, rgb(6 10 24 / 0.55) 100%)",
        }}
      />
    </div>
  );
}

export function HeroCinematicBackground({
  className,
  interactive = true,
}: HeroCinematicBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [supported, setSupported] = useState(true);

  const frameRef = useRef<number | null>(null);
  const visibleRef = useRef(true);
  const pointerRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    let cancelled = false;

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

    const vs = compile(gl, gl.VERTEX_SHADER, HERO_VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, HERO_FRAGMENT_SHADER);
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
        console.warn(
          "[HeroCinematicBackground] link failed:",
          gl.getProgramInfoLog(program),
        );
      }
      setSupported(false);
      return;
    }
    gl.useProgram(program);

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
      image: gl.getUniformLocation(program, "u_image"),
      resolution: gl.getUniformLocation(program, "u_resolution"),
      texSize: gl.getUniformLocation(program, "u_texSize"),
      time: gl.getUniformLocation(program, "u_time"),
      pointer: gl.getUniformLocation(program, "u_pointer"),
      motion: gl.getUniformLocation(program, "u_motion"),
      navy: gl.getUniformLocation(program, "u_navy"),
      pageBg: gl.getUniformLocation(program, "u_pageBg"),
      scrim: gl.getUniformLocation(program, "u_scrim"),
    };

    gl.uniform3f(u.navy, 0.035, 0.055, 0.125);
    gl.uniform1f(u.scrim, 0.56);
    gl.uniform1i(u.image, 0);

    const uploadPageBg = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(
        "--background",
      );
      const rgb = parseHslToken(raw) ?? [0.957, 0.961, 0.973];
      gl.uniform3fv(u.pageBg, rgb);
    };
    uploadPageBg();

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

    let texReady = false;
    let width = 0;
    let height = 0;

    const resize = () => {
      if (gl.isContextLost()) return;
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
    };

    const sourceForGpu = (source: HTMLImageElement): TexImageSource => {
      const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096, 1920);
      const longest = Math.max(source.naturalWidth, source.naturalHeight);
      if (longest <= max) return source;
      const scale = max / longest;
      const stamp = document.createElement("canvas");
      stamp.width = Math.max(1, Math.round(source.naturalWidth * scale));
      stamp.height = Math.max(1, Math.round(source.naturalHeight * scale));
      const ctx = stamp.getContext("2d");
      if (!ctx) return source;
      ctx.drawImage(source, 0, 0, stamp.width, stamp.height);
      return stamp;
    };

    const uploadTexture = (source: HTMLImageElement) => {
      if (cancelled || gl.isContextLost() || !source.naturalWidth) return;
      try {
        const gpuSource = sourceForGpu(source);
        resize();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gpuSource);
        const texW =
          gpuSource instanceof HTMLCanvasElement ? gpuSource.width : source.naturalWidth;
        const texH =
          gpuSource instanceof HTMLCanvasElement ? gpuSource.height : source.naturalHeight;
        gl.uniform2f(u.texSize, texW, texH);
        texReady = true;
        renderOnce();
        canvas.style.opacity = "1";
        if (!reduceMotion.matches && visibleRef.current) startLoop();
      } catch {
        if (!cancelled) setSupported(false);
      }
    };

    const image = new Image();
    image.onload = () => uploadTexture(image);
    image.onerror = () => {
      if (!cancelled) setSupported(false);
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (texReady) renderOnce();
    });
    resizeObserver.observe(canvas);

    const themeObserver = new MutationObserver(() => {
      uploadPageBg();
      if (texReady && reduceMotion.matches) renderOnce();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const onPointerMove = (event: PointerEvent) => {
      if (!interactive || !finePointer.matches || reduceMotion.matches) return;
      const rect = canvas.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      const ny = 1 - ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2;
      pointerRef.current.tx = Math.max(-1, Math.min(1, nx));
      pointerRef.current.ty = Math.max(-1, Math.min(1, ny));
    };
    if (interactive) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    const draw = (timeSeconds: number) => {
      if (!texReady) return;
      const p = pointerRef.current;
      gl.uniform1f(u.time, timeSeconds);
      gl.uniform2f(u.pointer, p.x, p.y);
      gl.uniform1f(u.motion, reduceMotion.matches ? 0 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    function renderOnce() {
      draw(reduceMotion.matches ? 0 : 8);
    }

    const start = performance.now();
    let last = start;

    const loop = (now: number) => {
      frameRef.current = requestAnimationFrame(loop);
      if (!visibleRef.current || document.hidden || !texReady) return;

      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      const p = pointerRef.current;
      p.x += (p.tx - p.x) * Math.min(1, dt * 2.4);
      p.y += (p.ty - p.y) * Math.min(1, dt * 2.4);

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

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        visibleRef.current = entries.some((entry) => entry.isIntersecting);
        if (!reduceMotion.matches) {
          if (visibleRef.current && texReady) startLoop();
          else stopLoop();
        }
      },
      { rootMargin: "120px" },
    );
    intersectionObserver.observe(canvas);

    const onVisibility = () => {
      if (reduceMotion.matches) return;
      if (document.hidden) stopLoop();
      else if (visibleRef.current && texReady) startLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onReduceChange = () => {
      if (reduceMotion.matches) {
        stopLoop();
        pointerRef.current.x = 0;
        pointerRef.current.y = 0;
        pointerRef.current.tx = 0;
        pointerRef.current.ty = 0;
        renderOnce();
      } else if (texReady) {
        startLoop();
      }
    };
    reduceMotion.addEventListener("change", onReduceChange);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      stopLoop();
      setSupported(false);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    resize();
    image.src = HERO_OFFICE_PHOTO;
    const kick = () => {
      if (cancelled || texReady) return;
      if (image.naturalWidth) uploadTexture(image);
    };
    if (typeof image.decode === "function") {
      void image.decode().then(kick).catch(kick);
    } else if (image.complete) {
      kick();
    }

    return () => {
      cancelled = true;
      stopLoop();
      image.onload = null;
      image.onerror = null;
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMotion.removeEventListener("change", onReduceChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      if (interactive) window.removeEventListener("pointermove", onPointerMove);
      if (!gl.isContextLost()) {
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
    };
  }, [interactive]);

  if (!supported) {
    return <FallbackPhoto className={className} />;
  }

  return (
    <>
      <FallbackPhoto className={className} />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-0 z-[1] h-full w-full opacity-0 transition-opacity duration-700",
          className ?? "",
        ].join(" ")}
      />
    </>
  );
}

export default HeroCinematicBackground;
