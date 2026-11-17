// The living map behind the lower sections: contour lines of a slow, drifting
// height field. The pointer raises a small hill, so the lines bend around it.
// Glass panels in front of it blur and refract these lines.

const CELL = 18;      // grid step in CSS px
const STEP = 0.06;    // height between two contour lines
const RGB = '108,229,187';

function hash(i, j) {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function noise(x, y) {
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

export function initTopo({ fx, director }) {
  const canvas = document.querySelector('.backdrop .topo');
  const hero = document.querySelector('.hero');
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let grid = new Float32Array(0);
  let cols = 0;
  let rows = 0;
  const pts = new Float32Array(8);
  const ptr = { x: 0.7, y: 0.4, at: -1e9 };
  const bump = { x: 0.7, y: 0.4 };
  let shown = 0;
  let time = Math.random() * 100;
  let cell = CELL;

  function draw(power) {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const s = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(cw * s);
    const h = Math.round(ch * s);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

    const idle = performance.now() - ptr.at > 3000;
    const tx = idle ? 0.7 + 0.2 * Math.sin(time * 0.21) : ptr.x;
    const ty = idle ? 0.45 + 0.3 * Math.sin(time * 0.17 + 1) : ptr.y;
    bump.x += (tx - bump.x) * 0.12;
    bump.y += (ty - bump.y) * 0.12;

    cols = Math.ceil(cw / cell) + 1;
    rows = Math.ceil(ch / cell) + 1;
    if (grid.length !== cols * rows) grid = new Float32Array(cols * rows);
    const ox = time * 7;
    const oy = time * 4 + window.scrollY * 0.3; // the map scrolls slower than the page: depth
    const bx = bump.x * cw;
    const by = bump.y * ch;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = i * cell;
        const y = j * cell;
        const dx = x - bx;
        const dy = y - by;
        grid[j * cols + i] =
          0.62 * noise((x + ox) / 270, (y + oy) / 270) +
          0.38 * noise((x - ox * 0.6) / 115 + 31.7, (y + oy * 0.7) / 115 + 12.3) +
          0.2 * Math.exp(-(dx * dx + dy * dy) / 26000);
      }
    }

    // Marching squares: one short segment per cell and level.
    const minor = new Path2D();
    const major = new Path2D();
    const cs = cell * s;
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = grid[j * cols + i];
        const b = grid[j * cols + i + 1];
        const c = grid[(j + 1) * cols + i + 1];
        const d = grid[(j + 1) * cols + i];
        const lo = Math.min(a, b, c, d);
        const hi = Math.max(a, b, c, d);
        const l1 = Math.floor(hi / STEP);
        for (let l = Math.ceil(lo / STEP); l <= l1; l++) {
          const L = l * STEP;
          const path = l % 4 === 0 ? major : minor;
          const x0 = i * cs;
          const y0 = j * cs;
          let n = 0;
          let t;
          if ((a > L) !== (b > L)) { t = (L - a) / (b - a); pts[n++] = x0 + t * cs; pts[n++] = y0; }
          if ((b > L) !== (c > L)) { t = (L - b) / (c - b); pts[n++] = x0 + cs; pts[n++] = y0 + t * cs; }
          if ((d > L) !== (c > L)) { t = (L - d) / (c - d); pts[n++] = x0 + t * cs; pts[n++] = y0 + cs; }
          if ((a > L) !== (d > L)) { t = (L - a) / (d - a); pts[n++] = x0; pts[n++] = y0 + t * cs; }
          if (n >= 4) { path.moveTo(pts[0], pts[1]); path.lineTo(pts[2], pts[3]); }
          if (n === 8) { path.moveTo(pts[4], pts[5]); path.lineTo(pts[6], pts[7]); }
        }
      }
    }
    const k = 0.75 + 0.5 * power;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineWidth = s;
    ctx.strokeStyle = `rgba(${RGB},${(0.11 * k).toFixed(3)})`;
    ctx.stroke(minor);
    ctx.lineWidth = 1.5 * s;
    ctx.strokeStyle = `rgba(${RGB},${(0.24 * k).toFixed(3)})`;
    ctx.stroke(major);
  }

  // Nothing to draw while the hero still covers the whole window.
  const covered = () => hero && hero.getBoundingClientRect().bottom >= innerHeight;

  director.on('frame', (state, dt, now) => {
    if (now - shown < 45 || covered()) return;
    time += (now - shown > 500 ? 0.045 : (now - shown) / 1000);
    shown = now;
    draw(state.aurora);
  });
  director.on('lite', () => { cell = 26; });

  addEventListener('pointermove', (e) => {
    ptr.x = e.clientX / innerWidth;
    ptr.y = e.clientY / innerHeight;
    ptr.at = performance.now();
  }, { passive: true });

  // With effects off the map holds still: one frame, redrawn only when the window changes.
  const still = () => draw(0.55);
  let resizeTimer = 0;
  addEventListener('resize', () => {
    if (fx.on) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(still, 150);
  });
  fx.watch((on) => { if (!on) still(); });
  still();
  return {};
}
