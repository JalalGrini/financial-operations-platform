/**
 * Photographic WebGL treatment for the homepage hero.
 *
 * The office still is the picture. The shader only grades it: cover-fit,
 * a slow Ken Burns pan, navy scrim, vignette, grain, a hint of warmth and
 * edge chromatic, and a few soft orbs that read as the photograph's bokeh.
 */

export const HERO_VERTEX_SHADER = /* glsl */ `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const HERO_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 v_uv;

uniform sampler2D u_image;
uniform vec2  u_resolution;
uniform vec2  u_texSize;
uniform float u_time;
uniform vec2  u_pointer;
uniform float u_motion;
uniform vec3  u_navy;
uniform vec3  u_pageBg;
uniform float u_scrim;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 coverUv(vec2 uv) {
  float ra = u_resolution.x / max(u_resolution.y, 1.0);
  float ia = u_texSize.x / max(u_texSize.y, 1.0);
  vec2 scale = vec2(1.0);
  if (ra > ia) {
    scale.y = ia / ra;
  } else {
    scale.x = ra / ia;
  }
  return (uv - 0.5) / scale + 0.5;
}

void main() {
  vec2 uv = coverUv(v_uv);

  float t = u_time * u_motion;
  float zoom = mix(1.0, 1.12, u_motion);
  vec2 pan = vec2(
    sin(t * 0.045) * 0.028,
    cos(t * 0.033) * 0.018
  );
  pan += u_pointer * 0.022 * u_motion;

  vec2 sampleUv = (uv - 0.5) / zoom + 0.5 + pan;
  sampleUv = clamp(sampleUv, 0.002, 0.998);
  vec2 texUv = vec2(sampleUv.x, 1.0 - sampleUv.y);

  vec2 ca = (sampleUv - 0.5) * 0.0028 * u_motion;
  float r = texture2D(u_image, texUv + vec2(ca.x, 0.0)).r;
  float g = texture2D(u_image, texUv).g;
  float b = texture2D(u_image, texUv - vec2(ca.x, 0.0)).b;
  vec3 color = vec3(r, g, b);

  color *= vec3(1.05, 1.0, 0.92);

  vec2 st = v_uv;
  float orbs = 0.0;
  orbs += smoothstep(0.22, 0.0, length(st - vec2(0.78, 0.82))) * 0.18;
  orbs += smoothstep(0.14, 0.0, length(st - vec2(0.62, 0.88))) * 0.10;
  orbs += smoothstep(0.10, 0.0, length(st - vec2(0.88, 0.70))) * 0.08;
  orbs += smoothstep(0.08, 0.0, length(st - vec2(0.18, 0.22))) * 0.06;
  color += vec3(1.0, 0.86, 0.62) * orbs * (0.35 + 0.15 * u_motion);

  float well = 1.0 - smoothstep(0.12, 0.72, st.x);
  float overlay = u_scrim + well * 0.12;
  color = mix(color, u_navy, overlay);

  float vig = smoothstep(1.15, 0.28, length(st - vec2(0.42, 0.42)) * 1.22);
  color *= mix(0.62, 1.0, vig);

  float grain = (hash(gl_FragCoord.xy + vec2(t * 37.0, t * 19.0)) - 0.5) * 0.045;
  color += grain;

  float bottomFade = smoothstep(0.22, 0.0, st.y);
  color = mix(color, u_pageBg, bottomFade);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
