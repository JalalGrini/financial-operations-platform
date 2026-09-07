// GLSL for the landing page live background — v2: Radar + Constellation.
//
// Design concept: "Operations Command" — a dark night-vision field of
// drifting constellation nodes connected by thin lines, swept by a slow
// brand-orange radar arm. The arm illuminates every node it passes,
// making the network briefly glow before fading. This ties directly to
// what Groupe 3.R.B does: coordinated security operations, real-time
// monitoring, and multi-site management.
//
// Layers (back to front):
//   1. Organic fBm atmosphere   — deep azure/indigo ambient depth
//   2. Constellation nodes      — slowly drifting points in a grid
//   3. Connection lines         — thin links between nearby stars
//   4. Radar sweep arm          — brand-orange, slow rotation, glowing tail
//   5. Vignette                 — keeps typography column calm
//
// All colours come from brand CSS tokens — never hardcoded.
// Light mode tints rather than emits, so contrast ratios are preserved.

export const LIVE_VERTEX_SHADER = /* glsl */ `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const LIVE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_dark;        // 0 = light palette, 1 = dark palette
uniform float u_intensity;   // global amplitude
uniform float u_pointer;     // 0..1 pointer influence strength
uniform vec2  u_pointerPos;
uniform vec3  u_indigo;
uniform vec3  u_azure;
uniform vec3  u_orange;
uniform vec3  u_baseLight;
uniform vec3  u_baseDark;

/* ─── noise utilities ──────────────────────────────────────────── */

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),               hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p  = rot * p * 2.02;
    a *= 0.5;
  }
  return v;
}

/* ─── radar sweep ──────────────────────────────────────────────── */

// Returns 0..1 intensity of the orange sweep arm at screen point st.
// The arm rotates counter-clockwise; a 120-degree glowing tail fades
// behind it so the sweep feels physical rather than digital.
float radarSweep(vec2 st, float t, vec2 bias) {
  vec2 p = st - bias;
  float angle     = atan(p.y, p.x);           // -PI .. PI
  float sweepAngle = mod(t * 0.75, 6.28318);  // current arm angle
  float diff = mod(angle - sweepAngle + 12.56637, 6.28318); // 0 = at arm

  float r = length(p);
  // Radial falloff: brighter near centre, fades at edges.
  float radialFade = exp(-r * 1.0) * smoothstep(0.05, 0.25, r);

  // Glowing tail: full at the arm (diff=0), gone at ~120 deg behind.
  float tail = smoothstep(2.1, 0.0, diff) * radialFade;
  // Sharp leading edge flash.
  float edge = smoothstep(0.05, 0.0, diff) * radialFade * 1.8;

  return clamp(tail + edge, 0.0, 1.0);
}

/* ─── constellation ────────────────────────────────────────────── */

// Grid of slowly drifting point lights.
float constellation(vec2 st, float t, out vec2 nearestStar, out float nearestDist) {
  float result = 0.0;
  float scale  = 4.2;
  nearestDist  = 999.0;
  nearestStar  = st;

  vec2 gridST = st * scale;
  vec2 cell   = floor(gridST);

  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      vec2 nb = cell + vec2(float(dx), float(dy));
      float h1 = hash(nb);
      float h2 = hash(nb + vec2(13.7, 41.3));
      float h3 = hash(nb + vec2(7.1,  2.9));

      // Each star drifts gently within its grid cell.
      vec2 offset = vec2(
        0.5 + 0.28 * sin(t * (0.35 + h1 * 0.55) + h1 * 6.28318),
        0.5 + 0.28 * cos(t * (0.28 + h2 * 0.48) + h2 * 6.28318)
      );

      vec2 starWorld = (nb + offset) / scale;
      float dist = length(st - starWorld);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestStar = starWorld;
      }

      // Star brightness pulses independently.
      float pulse = 0.55 + 0.45 * sin(t * (0.9 + h3 * 1.8) + h3 * 6.28318);
      // Point light falloff.
      float glow  = pulse * 0.055 / (dist * scale * 1.6 + 0.018);
      result += glow;
    }
  }
  return clamp(result, 0.0, 1.0);
}

/* ─── connection lines ─────────────────────────────────────────── */

// Thin lines between constellation stars within a threshold distance.
float connectionLines(vec2 st, float t) {
  float result = 0.0;
  float scale  = 4.2;
  float maxDist = 0.26;  // world-space connection threshold

  vec2 gridST = st * scale;
  vec2 cell   = floor(gridST);

  // Only check right + up + diagonal pairs to avoid double-counting.
  for (int dxa = 0; dxa <= 1; dxa++) {
    for (int dya = -1; dya <= 1; dya++) {
      if (dxa == 0 && dya <= 0) continue;

      vec2 cellA = cell;
      vec2 cellB = cell + vec2(float(dxa), float(dya));

      float hA1 = hash(cellA);
      float hA2 = hash(cellA + vec2(13.7, 41.3));
      float hB1 = hash(cellB);
      float hB2 = hash(cellB + vec2(13.7, 41.3));

      vec2 posA = (cellA + vec2(
        0.5 + 0.28 * sin(t * (0.35 + hA1 * 0.55) + hA1 * 6.28318),
        0.5 + 0.28 * cos(t * (0.28 + hA2 * 0.48) + hA2 * 6.28318)
      )) / scale;

      vec2 posB = (cellB + vec2(
        0.5 + 0.28 * sin(t * (0.35 + hB1 * 0.55) + hB1 * 6.28318),
        0.5 + 0.28 * cos(t * (0.28 + hB2 * 0.48) + hB2 * 6.28318)
      )) / scale;

      float sep = length(posB - posA);
      if (sep > maxDist) continue;

      // Distance from current fragment to the line segment A→B.
      vec2 ab = posB - posA;
      float tParam = clamp(dot(st - posA, ab) / dot(ab, ab), 0.0, 1.0);
      float lineDist = length(st - (posA + tParam * ab));

      float lineGlow = smoothstep(0.007, 0.0, lineDist);
      // Lines fade as the stars drift farther apart.
      lineGlow *= 1.0 - sep / maxDist;
      result   += lineGlow * 0.6;
    }
  }
  return clamp(result, 0.0, 1.0);
}

/* ─── main ─────────────────────────────────────────────────────── */

void main() {
  // Aspect-correct, origin-centred coordinates.
  vec2 st = (gl_FragCoord.xy - 0.5 * u_resolution) / max(u_resolution.y, 1.0);
  float t = u_time * 0.32;

  // Pointer parallax — gentle pull toward cursor.
  vec2 pointer = (u_pointerPos - 0.5 * u_resolution) / max(u_resolution.y, 1.0);
  vec2 pull    = pointer * 0.10 * u_pointer;

  vec3 base = mix(u_baseLight, u_baseDark, u_dark);
  vec3 col  = base;

  /* ── Layer 1: organic atmosphere ─────────────────────────────── */
  vec2 q = vec2(
    fbm(st * 1.3 + pull + vec2(0.0,  t * 0.13)),
    fbm(st * 1.3 + pull + vec2(5.2, -t * 0.11))
  );
  float flow = fbm(st * 1.9 + 0.45 * (q - 0.5) + vec2(t * 0.7, -t * 0.5));

  float atmosGain = mix(0.06, 0.22, u_dark) * u_intensity;
  col += u_azure  * flow         * atmosGain * 0.75;
  col += u_indigo * (1.0 - flow) * atmosGain * 0.55;

  /* ── Layer 2: constellation ───────────────────────────────────── */
  vec2  nearestStar;
  float nearestDist;
  float stars = constellation(st + pull * 0.35, t, nearestStar, nearestDist);

  float starGain = mix(0.18, 0.62, u_dark) * u_intensity;
  col += u_azure * stars * starGain;
  // Subtle indigo halo on each star.
  col += u_indigo * stars * starGain * 0.45;

  /* ── Layer 3: connection lines ────────────────────────────────── */
  float lines    = connectionLines(st + pull * 0.25, t);
  float lineGain = mix(0.06, 0.28, u_dark) * u_intensity;
  col += u_azure  * lines * lineGain;
  col += u_indigo * lines * lineGain * 0.6;

  /* ── Layer 4: radar sweep (brand orange) ──────────────────────── */
  vec2  radarBias = pull * 0.45;
  float radar     = radarSweep(st, t, radarBias);
  float radarGain = mix(0.25, 0.65, u_dark) * u_intensity;

  // Base orange sweep.
  col += u_orange * radar * radarGain;
  // The sweep illuminates stars it passes — they flare orange.
  col += u_orange * stars * radar * radarGain * 2.8;
  // The sweep lights up the network lines too.
  col += u_orange * lines * radar * radarGain * 2.0;
  // Soft azure afterglow in the wake of the sweep.
  col += u_azure  * radar * radarGain * 0.35;

  /* ── Vignette ─────────────────────────────────────────────────── */
  float vig = smoothstep(1.38, 0.14, length(st * vec2(0.80, 1.0)));
  col = mix(base, col, 0.18 + 0.82 * vig);

  /* ── Light mode: tint paper instead of emitting light ────────── */
  // Keeps headline contrast ratios intact on light backgrounds.
  col = mix(mix(base, col, 0.58), col, u_dark);

  /* ── Ordered dither removes gradient banding ──────────────────── */
  float grain = (hash(gl_FragCoord.xy * 0.5 + fract(u_time * 0.09) * 13.0) - 0.5);
  col += grain * mix(0.005, 0.011, u_dark);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
