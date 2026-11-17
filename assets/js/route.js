// "The route so far": a 3D topographic map. Scrolling moves a rider along a trail
// from the trailhead to the summit, and the checkpoints beside the map light up.
//
// WebGL2 draws the terrain (contour lines computed per pixel) and the trail dots.
// Labels and the rider are plain HTML placed by projecting 3D points to the screen.
// Without WebGL2 a flat SVG route does the same job.

const C1 = [0.424, 0.898, 0.733]; // mint, low ground
const C2 = [0.769, 0.647, 0.984]; // violet, high ground
const BG = [0.027, 0.055, 0.106];
const GRID = 150;                 // terrain cells per side
const GAP = 0.035;                // height between contour lines
const DOTS = 260;                 // trail dots

// ----- Terrain shape -----
function hash(i, j) {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) {
  let v = 0;
  let a = 0.5;
  for (let o = 0; o < 4; o++) {
    v += a * vnoise(x, y);
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.2;
    a *= 0.5;
  }
  return v;
}
const bell = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / s);

// x runs left to right, z runs back (-1) to front (+1). The summit sits back right.
function height(x, z) {
  let h = 0.13 * fbm(x * 2.1 + 5.3, z * 2.1 + 1.9);
  h += 0.62 * bell(x, z, 0.34, -0.36, 0.085);
  h += 0.3 * bell(x, z, -0.44, -0.14, 0.07);
  h += 0.17 * bell(x, z, 0.64, 0.32, 0.05);
  h -= 0.05 * bell(x, z, -0.08, 0.5, 0.1);
  const rough = Math.abs(fbm(x * 5.3 + 2, z * 5.3 + 8) - 0.47) * 2;
  h += 0.09 * rough * Math.min(1, h / 0.35);
  return Math.max(0, h);
}

// The trail: a smooth curve through hand-placed waypoints, resampled to even steps.
const WAY = [[-0.8, 0.8], [-0.52, 0.66], [-0.22, 0.72], [0.1, 0.58], [0.36, 0.42], [0.3, 0.18], [0.04, 0.1], [-0.16, -0.06], [0, -0.24], [0.22, -0.2], [0.36, -0.3], [0.34, -0.36]];

function buildTrail() {
  const cat = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  const dense = [];
  for (let i = 0; i < WAY.length - 1; i++) {
    const p0 = WAY[Math.max(0, i - 1)];
    const p1 = WAY[i];
    const p2 = WAY[i + 1];
    const p3 = WAY[Math.min(WAY.length - 1, i + 2)];
    for (let s = 0; s < 24; s++) {
      const t = s / 24;
      const x = cat(p0[0], p1[0], p2[0], p3[0], t);
      const z = cat(p0[1], p1[1], p2[1], p3[1], t);
      dense.push([x, height(x, z) + 0.014, z]);
    }
  }
  const end = WAY[WAY.length - 1];
  dense.push([end[0], height(end[0], end[1]) + 0.014, end[1]]);

  const lens = [0];
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i];
    lens.push(lens[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const total = lens[lens.length - 1];
  // position at a fraction t of the whole trail
  return (t) => {
    const want = Math.min(1, Math.max(0, t)) * total;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < want) i++;
    const span = lens[i] - lens[i - 1] || 1;
    const k = (want - lens[i - 1]) / span;
    const a = dense[i - 1];
    const b = dense[i];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  };
}

// ----- Small matrix kit (column-major, like WebGL) -----
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function lookAt(eye, at) {
  let zx = eye[0] - at[0];
  let zy = eye[1] - at[1];
  let zz = eye[2] - at[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  // up is +y
  let xx = zz;
  let xy = 0;
  let xz = -zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xz /= len;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
  ]);
}
function multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

// ----- Shaders -----
const TERRAIN_VERT = `#version 300 es
in vec3 aPos;
uniform mat4 uMVP;
out float vH;
out vec2 vXZ;
void main() {
  vH = aPos.y;
  vXZ = aPos.xz;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const TERRAIN_FRAG = `#version 300 es
precision highp float;
in float vH;
in vec2 vXZ;
uniform float uPhase;
uniform float uPower;
uniform float uGap;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uBg;
out vec4 outColor;
void main() {
  // contour lines: wherever the height crosses a multiple of the gap
  float f = (vH + uPhase) / uGap;
  float w = fwidth(f);
  float d = abs(fract(f - 0.5) - 0.5);
  float line = (1.0 - smoothstep(w * 0.7, w * 1.7, d)) * (1.0 - smoothstep(0.35, 0.8, w));
  float f5 = f / 5.0;
  float w5 = fwidth(f5);
  float d5 = abs(fract(f5 - 0.5) - 0.5);
  float major = (1.0 - smoothstep(w5 * 0.5, w5 * 1.5, d5)) * (1.0 - smoothstep(0.3, 0.7, w5));
  float k = clamp(vH / 0.72, 0.0, 1.0);
  vec3 lineCol = mix(uC1, uC2, smoothstep(0.3, 0.95, k));
  float glow = max(line * 0.5, major * 0.85);
  vec3 col = uBg * (1.0 + 0.9 * k) + lineCol * (0.035 + 0.075 * k) + lineCol * glow * (0.45 + 0.65 * uPower);
  // the map fades out toward its rim
  float edge = 1.0 - smoothstep(0.7, 0.98, length(vXZ));
  outColor = vec4(col * edge, edge);
}`;

const DOT_VERT = `#version 300 es
in vec3 aPos;
in float aT;
uniform mat4 uMVP;
uniform float uProg;
uniform float uPx;
out float vOn;
void main() {
  vOn = step(aT, uProg);
  gl_Position = uMVP * vec4(aPos, 1.0);
  gl_PointSize = max(2.0, uPx * mix(0.008, 0.015, vOn) / gl_Position.w);
}`;

const DOT_FRAG = `#version 300 es
precision highp float;
in float vOn;
uniform vec3 uCol;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.3, 0.5, d)) * mix(0.34, 1.0, vOn);
  vec3 c = mix(vec3(0.62, 0.7, 0.78), uCol, vOn);
  outColor = vec4(c * a, a);
}`;

function program(gl, vert, frag) {
  const make = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s) || 'shader failed');
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, make(gl.VERTEX_SHADER, vert));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p) || 'link failed');
  return p;
}

function buildScene(gl, at) {
  const terrain = program(gl, TERRAIN_VERT, TERRAIN_FRAG);
  const dots = program(gl, DOT_VERT, DOT_FRAG);

  // terrain mesh
  const side = GRID + 1;
  const pos = new Float32Array(side * side * 3);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const x = (i / GRID) * 2 - 1;
      const z = (j / GRID) * 2 - 1;
      const k = (j * side + i) * 3;
      pos[k] = x;
      pos[k + 1] = height(x, z);
      pos[k + 2] = z;
    }
  }
  const idx = new Uint32Array(GRID * GRID * 6);
  let n = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      idx[n++] = a; idx[n++] = c; idx[n++] = b;
      idx[n++] = b; idx[n++] = c; idx[n++] = d;
    }
  }
  const terrainVao = gl.createVertexArray();
  gl.bindVertexArray(terrainVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
  const tPos = gl.getAttribLocation(terrain, 'aPos');
  gl.enableVertexAttribArray(tPos);
  gl.vertexAttribPointer(tPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

  // trail dots: x, y, z, t
  const trail = new Float32Array(DOTS * 4);
  for (let i = 0; i < DOTS; i++) {
    const t = i / (DOTS - 1);
    const p = at(t);
    trail.set([p[0], p[1], p[2], t], i * 4);
  }
  const dotsVao = gl.createVertexArray();
  gl.bindVertexArray(dotsVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, trail, gl.STATIC_DRAW);
  const dPos = gl.getAttribLocation(dots, 'aPos');
  const dT = gl.getAttribLocation(dots, 'aT');
  gl.enableVertexAttribArray(dPos);
  gl.vertexAttribPointer(dPos, 3, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(dT);
  gl.vertexAttribPointer(dT, 1, gl.FLOAT, false, 16, 12);
  gl.bindVertexArray(null);

  const loc = (p, names) => Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(p, name)]));
  return {
    terrain, dots, terrainVao, dotsVao, count: idx.length,
    ut: loc(terrain, ['uMVP', 'uPhase', 'uPower', 'uGap', 'uC1', 'uC2', 'uBg']),
    ud: loc(dots, ['uMVP', 'uProg', 'uPx', 'uCol'])
  };
}

export function initRoute({ fx, director }) {
  const root = document.documentElement;
  const section = document.querySelector('.route');
  if (!section) return null;
  const track = section.querySelector('.route-track');
  const stage = section.querySelector('.route-stage');
  const canvas = stage.querySelector('.terrain');
  const pinsBox = stage.querySelector('.pins');
  const hud = stage.querySelector('.hud-text');
  const list = section.querySelector('.checkpoints');
  const cps = [...list.querySelectorAll('.cp')];
  const flatTrail = stage.querySelector('.flat-trail');
  const flatRider = stage.querySelector('.flat-rider');
  const count = cps.length;
  const at = buildTrail();

  let target = 0;   // where the scroll says the rider should be, 0..1
  let q = 0;        // where the rider is (eased)
  let shownCur = -1;
  let shownFill = -1;

  // ----- Scroll to progress -----
  function readScroll() {
    const r = track.getBoundingClientRect();
    const span = r.height - innerHeight;
    const p = span > 40 ? -r.top / span : (r.top < innerHeight * 0.4 ? 1 : 0);
    target = Math.min(1, Math.max(0, (p - 0.03) / 0.87)); // a short pause at both ends
    root.classList.toggle('route-on', r.top < innerHeight * 0.55 && r.bottom > innerHeight * 0.45);
  }

  // ----- Checkpoint list -----
  function paintList() {
    const posn = q * (count - 1);
    const cur = Math.min(count - 1, Math.floor(posn + 0.03)); // a checkpoint counts just before the rider touches it
    if (cur !== shownCur) {
      shownCur = cur;
      cps.forEach((cp, i) => {
        cp.classList.toggle('is-on', i <= cur);
        cp.classList.toggle('is-current', i === cur);
      });
      if (hud) hud.textContent = `Checkpoint ${cur + 1} of ${count}`;
    }
    const node = (i) => cps[i].offsetTop + 12;
    const fill = cur >= count - 1 ? node(count - 1) - 12 : node(cur) + (node(cur + 1) - node(cur)) * Math.max(0, posn - cur) - 12;
    if (Math.abs(fill - shownFill) > 0.5) {
      shownFill = fill;
      list.style.setProperty('--fill', `${Math.max(0, fill).toFixed(1)}px`);
    }
  }

  // ----- Flat fallback -----
  let flatLen = 0;
  function paintFlat() {
    if (!flatTrail || !flatTrail.getTotalLength) return;
    if (!flatLen) flatLen = flatTrail.getTotalLength();
    flatTrail.style.strokeDasharray = `${flatLen.toFixed(1)} ${flatLen.toFixed(1)}`;
    flatTrail.style.strokeDashoffset = (flatLen * (1 - q)).toFixed(1);
    const p = flatTrail.getPointAtLength(flatLen * q);
    if (flatRider) {
      flatRider.setAttribute('cx', p.x.toFixed(1));
      flatRider.setAttribute('cy', p.y.toFixed(1));
    }
  }

  // ----- 3D -----
  let gl = null;
  let scene3d = null;
  try {
    gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true });
    if (gl) scene3d = buildScene(gl, at);
  } catch (err) {
    console.error('[route]', err);
    gl = null;
    scene3d = null;
  }
  const has3d = !!(gl && scene3d);
  root.classList.toggle('has-3d', has3d);

  // pins and the rider are HTML on top of the canvas
  const pins = [];
  let rider = null;
  if (has3d && pinsBox) {
    cps.forEach((cp, i) => {
      const pin = document.createElement('span');
      pin.className = 'pin';
      const tag = document.createElement('span');
      tag.className = 'pin-tag';
      tag.textContent = cp.dataset.pin || `Checkpoint ${i + 1}`;
      const stem = document.createElement('span');
      stem.className = 'pin-stem';
      pin.append(tag, stem);
      pinsBox.append(pin);
      const p = at(i / (count - 1));
      pins.push({ el: pin, p: [p[0], p[1] + 0.02, p[2]], t: i / (count - 1) });
    });
    rider = document.createElement('span');
    rider.className = 'rider';
    pinsBox.append(rider);
  }

  let lost = false;
  if (has3d) {
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
    canvas.addEventListener('webglcontextrestored', () => {
      try { scene3d = buildScene(gl, at); lost = false; } catch (err) { console.error('[route]', err); }
    });
  }

  let dprCap = 2;
  let phase = 0;
  let sway = 0;
  const ptr = { x: 0, aim: 0 };

  function paint3d() {
    if (!has3d || lost) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const s = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = Math.round(cw * s);
    const h = Math.round(ch * s);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

    // The camera circles the map as the rider climbs.
    const fov = 0.56;
    const angle = -0.62 + q * 0.95 + sway + ptr.x * 0.1;
    const eye = [Math.sin(angle) * 2.85, 1.5, Math.cos(angle) * 2.85];
    const mvp = multiply(perspective(fov, w / h, 0.1, 20), lookAt(eye, [0, 0.2, 0]));

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(scene3d.terrain);
    gl.uniformMatrix4fv(scene3d.ut.uMVP, false, mvp);
    gl.uniform1f(scene3d.ut.uPhase, phase);
    gl.uniform1f(scene3d.ut.uPower, director.state.aurora);
    gl.uniform1f(scene3d.ut.uGap, GAP);
    gl.uniform3fv(scene3d.ut.uC1, C1);
    gl.uniform3fv(scene3d.ut.uC2, C2);
    gl.uniform3fv(scene3d.ut.uBg, BG);
    gl.depthMask(true);
    gl.bindVertexArray(scene3d.terrainVao);
    gl.drawElements(gl.TRIANGLES, scene3d.count, gl.UNSIGNED_INT, 0);

    gl.useProgram(scene3d.dots);
    gl.uniformMatrix4fv(scene3d.ud.uMVP, false, mvp);
    gl.uniform1f(scene3d.ud.uProg, q);
    gl.uniform1f(scene3d.ud.uPx, h * 0.5 / Math.tan(fov / 2));
    gl.uniform3f(scene3d.ud.uCol, 0.93, 1.0, 0.96);
    gl.depthMask(false);
    gl.bindVertexArray(scene3d.dotsVao);
    gl.drawArrays(gl.POINTS, 0, DOTS);
    gl.bindVertexArray(null);
    gl.depthMask(true);

    // HTML overlays
    const place = (el, p, lift) => {
      const cw4 = mvp[3] * p[0] + mvp[7] * p[1] + mvp[11] * p[2] + mvp[15];
      if (cw4 <= 0.01) { el.style.visibility = 'hidden'; return; }
      const x = ((mvp[0] * p[0] + mvp[4] * p[1] + mvp[8] * p[2] + mvp[12]) / cw4 * 0.5 + 0.5) * cw;
      const y = (1 - ((mvp[1] * p[0] + mvp[5] * p[1] + mvp[9] * p[2] + mvp[13]) / cw4 * 0.5 + 0.5)) * ch;
      el.style.visibility = '';
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)${lift}`;
    };
    for (const pin of pins) {
      place(pin.el, pin.p, ' translate(-50%, -100%)');
      pin.el.classList.add('is-shown');
      pin.el.classList.toggle('is-on', q >= pin.t - 0.008);
    }
    if (rider) place(rider, at(q), '');
  }

  function paint() {
    paintList();
    if (has3d) paint3d(); else paintFlat();
  }

  // ----- Loop -----
  let visible = false;
  let raf = 0;
  let last = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    q += (target - q) * (1 - Math.pow(0.0015, dt));
    if (Math.abs(target - q) < 0.0004) q = target;
    phase += dt * 0.004;
    sway = 0.06 * Math.sin(now / 1000 * 0.35);
    ptr.x += (ptr.aim - ptr.x) * 0.06;
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
  // With effects off nothing moves on its own: the map follows the scroll and that is all.
  function still() {
    q = target;
    sway = 0;
    ptr.x = 0;
    paint();
  }

  addEventListener('scroll', () => {
    readScroll();
    if (!fx.on) still();
  }, { passive: true });
  addEventListener('resize', () => {
    readScroll();
    shownFill = -1;
    if (!raf) still();
  });
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    if (r.width) ptr.aim = ((e.clientX - r.left) / r.width - 0.5) * 2;
  }, { passive: true });
  stage.addEventListener('pointerleave', () => { ptr.aim = 0; });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) { readScroll(); run(); if (!fx.on) still(); } else halt();
    }, { rootMargin: '200px 0px' }).observe(track);
  } else {
    visible = true;
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? halt() : run()));
  fx.watch((on) => { if (on) run(); else { halt(); still(); } });
  director.on('lite', () => { dprCap = 1; });

  readScroll();
  still();
  run();
  return { has3d };
}
