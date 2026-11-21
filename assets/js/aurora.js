// The aurora over the hero.
// WebGL2 draws three curtains of light with a fragment shader.
// Without WebGL2 the same idea is painted on a 2D canvas, softer and cheaper.

const GREEN = [0.24, 1.0, 0.56];  // mostly green, like the real thing over the north
const VIOLET = [0.72, 0.42, 1.0];

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uPower;
uniform float uPtr;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec4 uSafe; // box behind the hero copy: left, bottom, right, top
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return v;
}

// One curtain: a wavy lower edge, light fading upward from it, fine vertical rays.
vec3 curtain(vec2 uv, float aspect, float seed, float base, float tall, float pace) {
  float t = uTime * pace;
  float x = uv.x * aspect;
  float warp = fbm(vec2(x * 0.8 + seed, t * 0.21));
  float xs = x + 0.45 * (warp - 0.5) + t * 0.025;
  float edge = base + 0.36 * (fbm(vec2(xs * 0.75 + seed * 3.1, t * 0.16)) - 0.5) + 0.05 * sin(xs * 1.7 + t * 0.4 + seed * 2.0) + 0.02 * sin(xs * 4.3 - t * 0.6 + seed);
  float y = uv.y - edge;
  float h = tall * (0.65 + 0.7 * fbm(vec2(xs * 1.2 - seed, t * 0.11)));
  float body = smoothstep(-0.012, 0.018, y) * exp(-max(y, 0.0) / h);
  float rays = 0.3 + 0.7 * smoothstep(0.28, 0.72, fbm(vec2(xs * 16.0, t * 0.45 + seed)));
  float fine = 0.72 + 0.28 * noise(vec2(xs * 70.0, t * 1.1 + seed));
  float patchy = smoothstep(0.3, 0.62, fbm(vec2(xs * 0.5 + seed * 5.0, t * 0.06)));
  float k = clamp(y / (h * 2.4), 0.0, 1.0);
  vec3 c = mix(uC1, uC2, smoothstep(0.32, 1.0, k));
  c = mix(c, vec3(0.86, 1.0, 0.93), 0.35 * (1.0 - smoothstep(0.0, 0.05, y)));
  return c * body * rays * fine * patchy;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec3 col = curtain(uv, aspect, 1.0, 0.6, 0.2, 1.0);
  col += 0.75 * curtain(uv, aspect, 4.7, 0.72, 0.15, 0.8);
  col += 0.6 * curtain(uv, aspect, 9.3, 0.5, 0.24, 1.25);
  float side = 0.55 + 0.45 * smoothstep(0.0, 0.5, uv.x);
  float flare = 1.0 + 0.55 * exp(-pow((uv.x - uPtr) / 0.16, 2.0));
  // almost nothing in the dark, a full sky when the aurora is up
  col *= (0.02 + 1.3 * smoothstep(0.02, 1.0, uPower)) * side * flare;
  col = 1.0 - exp(-col * 1.7);
  // the light parts around the words, so the copy always has contrast
  float inX = smoothstep(uSafe.x - 0.1, uSafe.x + 0.02, uv.x) * (1.0 - smoothstep(uSafe.z - 0.02, uSafe.z + 0.1, uv.x));
  float inY = smoothstep(uSafe.y - 0.12, uSafe.y + 0.02, uv.y) * (1.0 - smoothstep(uSafe.w - 0.02, uSafe.w + 0.12, uv.y));
  col *= 1.0 - 0.8 * inX * inY;
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  outColor = vec4(col, a);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    console.error('[aurora] shader:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function glPainter(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true });
  } catch (err) {
    gl = null;
  }
  if (!gl) return null;

  let prog = null;
  let u = null;
  let scale = 0.6;
  let lost = false;

  function setup() {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
      console.error('[aurora] link:', gl.getProgramInfoLog(prog));
      return false;
    }
    u = {};
    for (const name of ['uRes', 'uTime', 'uPower', 'uPtr', 'uC1', 'uC2', 'uSafe']) u[name] = gl.getUniformLocation(prog, name);
    return true;
  }
  if (!setup()) return null;

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  canvas.addEventListener('webglcontextrestored', () => { lost = !setup(); });

  return {
    kind: 'webgl2',
    draw(time, power, ptr, safe) {
      if (lost) return;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (!cw || !ch) return;
      const s = Math.min(window.devicePixelRatio || 1, 1.5) * scale;
      const w = Math.max(2, Math.round(cw * s));
      const h = Math.max(2, Math.round(ch * s));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uPower, power);
      gl.uniform1f(u.uPtr, ptr);
      gl.uniform3fv(u.uC1, GREEN);
      gl.uniform3fv(u.uC2, VIOLET);
      gl.uniform4fv(u.uSafe, safe);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    lite() { scale = 0.4; }
  };
}

// 2D fallback: each curtain is a row of thin vertical gradient strips,
// drawn on a small buffer and scaled up so it comes out soft.
function flatPainter(canvas) {
  let view = canvas;
  let ctx = view.getContext('2d');
  if (!ctx) {
    // The canvas was already claimed by a failed WebGL attempt: swap in a fresh one.
    view = canvas.cloneNode(false);
    canvas.replaceWith(view);
    ctx = view.getContext('2d');
    if (!ctx) return null;
  }
  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d');
  const strip = document.createElement('canvas');
  strip.width = 1;
  strip.height = 64;
  const rgb = (c) => c.map((v) => Math.round(v * 255)).join(',');
  const g = strip.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, `rgba(${rgb(VIOLET)},0)`);
  grad.addColorStop(0.4, `rgba(${rgb(VIOLET)},0.22)`);
  grad.addColorStop(0.78, `rgba(${rgb(GREEN)},0.7)`);
  grad.addColorStop(0.93, `rgba(${rgb(GREEN)},1)`);
  grad.addColorStop(1, `rgba(${rgb(GREEN)},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 64);

  const BASE = [0.44, 0.32, 0.54];
  const TALL = [0.46, 0.36, 0.3];
  const GLOW = [0.8, 0.55, 0.45];
  const PACE = [0.16, 0.12, 0.2];
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  return {
    kind: '2d',
    draw(time, power, ptr, safe) {
      const cw = view.clientWidth;
      const ch = view.clientHeight;
      if (!cw || !ch) return;
      const s = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(cw * s);
      const h = Math.round(ch * s);
      if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
      const bw = Math.max(48, Math.round(cw / 6));
      const bh = Math.max(36, Math.round(ch / 6));
      if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
      bctx.globalCompositeOperation = 'source-over';
      bctx.globalAlpha = 1;
      bctx.clearRect(0, 0, bw, bh);
      bctx.globalCompositeOperation = 'lighter';
      const gain = 0.03 + 1.25 * smooth(0.02, 1, power);
      for (let k = 0; k < 3; k++) {
        const sp = PACE[k];
        for (let x = 0; x < bw; x++) {
          const uu = x / (bw - 1);
          const y0 = bh * (BASE[k] + 0.07 * Math.sin(uu * 3.2 + time * sp + k * 1.9) + 0.035 * Math.sin(uu * 8.1 - time * sp * 1.7 + k * 4.2));
          const tall = bh * TALL[k] * (0.75 + 0.25 * Math.sin(uu * 5.3 + time * 0.11 + k * 2.4));
          const rays = 0.5 + 0.3 * Math.sin(uu * 46 + time * 0.6 + 2.2 * Math.sin(uu * 11 - time * 0.23 + k)) + 0.2 * Math.sin(uu * 120 - time * 0.9 + k * 3);
          const env = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(uu * 2.4 - time * 0.07 + k * 2.1));
          const side = 0.55 + 0.45 * smooth(0, 0.5, uu);
          const flare = 0.55 * Math.exp(-Math.pow((uu - ptr) / 0.14, 2));
          const calm = 1 - 0.8 * smooth(safe[0] - 0.1, safe[0] + 0.02, uu) * (1 - smooth(safe[2] - 0.02, safe[2] + 0.1, uu));
          const a = GLOW[k] * gain * rays * env * side * (0.8 + flare) * calm;
          if (a < 0.004) continue;
          bctx.globalAlpha = a > 1 ? 1 : a;
          bctx.drawImage(strip, 0, 0, 1, 64, x, y0 - tall, 1, tall);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(buf, 0, 0, bw, bh, 0, 0, w, h);
    },
    lite() {}
  };
}

export function initAurora({ fx, director }) {
  const hero = document.querySelector('.hero');
  const canvas = hero && hero.querySelector('.aurora');
  if (!canvas) return null;
  const painter = glPainter(canvas) || flatPainter(canvas);
  if (!painter) return null;

  let raf = 0;
  let visible = true;
  let last = 0;
  let time = 30 + Math.random() * 60;
  let ptr = 0.62;
  let ptrAim = 0.62;
  let ptrAt = -1e9;

  // Where the hero copy sits, as fractions of the hero (y measured from the bottom).
  let safe = [0, 0, 0, 0];
  function measure() {
    const r = hero.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let x0 = 1;
    let y0 = 1;
    let x1 = 0;
    let y1 = 0;
    for (const el of hero.querySelectorAll('.hero-copy > *')) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const b = range.getBoundingClientRect();
      if (!b.width) continue;
      x0 = Math.min(x0, (b.left - r.left) / r.width);
      x1 = Math.max(x1, (b.right - r.left) / r.width);
      y0 = Math.min(y0, (b.top - r.top) / r.height);
      y1 = Math.max(y1, (b.bottom - r.top) / r.height);
    }
    if (x1 > x0) safe = [x0, 1 - y1, x1, 1 - y0];
  }

  const paint = () => painter.draw(time, director.state.aurora, ptr, safe);

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt * (1 + 10 * director.state.warp); // "pass time" makes the sky race
    const aim = now - ptrAt > 3000 ? 0.62 + 0.26 * Math.sin(time * 0.13) : ptrAim;
    ptr += (aim - ptr) * (1 - Math.pow(0.9, dt * 60));
    paint();
  }
  function run() {
    if (raf || !visible || !fx.on || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function halt() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) run(); else halt();
  }).observe(hero);
  document.addEventListener('visibilitychange', () => (document.hidden ? halt() : run()));
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    if (r.width) { ptrAim = (e.clientX - r.left) / r.width; ptrAt = performance.now(); }
  }, { passive: true });
  addEventListener('resize', () => { measure(); if (!raf) paint(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); if (!raf) paint(); });
  fx.watch((on) => { if (on) run(); else { halt(); paint(); } });
  director.on('lite', () => painter.lite());

  measure();
  paint();
  run();
  return { kind: painter.kind };
}
