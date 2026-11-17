// Liquid glass behaviour.
//  1. Rim light: every pane's edge highlight points at the pointer.
//  2. Tilt: panes lean toward the pointer in 3D, inner layers shift for depth.
//  3. Refraction: in desktop Chromium the pane edges bend what is behind them,
//     like the bevel of a thick slab of glass. Other browsers keep the blur.

const NS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';

// A lens map for one pane. Red is the horizontal push, green the vertical,
// blue marks the bezel. Only a band along the edge pushes; the middle is neutral.
function lensMap(w, h, radius, bezel) {
  const sc = 0.5;
  const cw = Math.max(2, Math.round(w * sc));
  const ch = Math.max(2, Math.round(h * sc));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext('2d');
  const img = g.createImageData(cw, ch);
  const d = img.data;
  const hw = w / 2;
  const hh = h / 2;
  const r = Math.min(radius, hw, hh);
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const x = (i + 0.5) / sc - hw;
      const y = (j + 0.5) / sc - hh;
      const qx = Math.abs(x) - (hw - r);
      const qy = Math.abs(y) - (hh - r);
      // signed distance to the rounded rectangle, negative inside
      const dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      const depth = -dist;
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy) || 1;
        nx = (qx / len) * Math.sign(x);
        ny = (qy / len) * Math.sign(y);
      } else if (qx > qy) {
        nx = Math.sign(x);
      } else {
        ny = Math.sign(y);
      }
      // u is 1 on the edge and 0 where the bezel ends
      const u = Math.min(1, Math.max(0, 1 - depth / bezel));
      const f = u * u;
      const k = (j * cw + i) * 4;
      d[k] = 128 + nx * f * 127;
      d[k + 1] = 128 + ny * f * 127;
      d[k + 2] = 255 * u * u * (3 - 2 * u); // blue: where the clear, bending rim shows
      d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

function debounce(fn, ms = 160) {
  let timer = 0;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

export function initGlass({ fx, director }) {
  const spots = [...document.querySelectorAll('[data-spot]')];
  const tilts = [...document.querySelectorAll('[data-tilt]')];

  // ----- 1. Rim light -----
  let px = 0;
  let py = 0;
  let queued = false;
  let movedAt = -1e9;
  let idleTick = 0;

  function aim(x, y) {
    const vh = innerHeight;
    for (const el of spots) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -120 || r.top > vh + 120) continue;
      el.style.setProperty('--mx', `${(x - r.left).toFixed(1)}px`);
      el.style.setProperty('--my', `${(y - r.top).toFixed(1)}px`);
    }
  }
  function request() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      aim(px, py);
    });
  }
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    px = e.clientX;
    py = e.clientY;
    movedAt = performance.now();
    request();
  }, { passive: true });
  addEventListener('scroll', () => {
    if (performance.now() - movedAt < 4000) request();
  }, { passive: true });

  // With no pointer around (or on touch screens) a slow light sweeps the panes instead.
  director.on('frame', (state, dt, now) => {
    if (now - movedAt < 3500 || ++idleTick % 3) return;
    const t = now / 1000;
    aim(innerWidth * (0.5 + 0.46 * Math.sin(t * 0.31)), innerHeight * (0.45 + 0.42 * Math.sin(t * 0.23 + 1.3)));
  });

  // ----- 2. Tilt -----
  for (const el of tilts) {
    const layers = [...el.querySelectorAll('[data-depth]')].map((node) => ({ node, depth: parseFloat(node.dataset.depth) || 0 }));
    let active = false;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let max = 5;

    const apply = () => {
      el.style.setProperty('--ry', `${(-cx * max).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(cy * max).toFixed(2)}deg`);
      for (const l of layers) {
        l.node.style.setProperty('--px', (cx * l.depth).toFixed(2));
        l.node.style.setProperty('--py', (cy * l.depth).toFixed(2));
      }
    };
    const loop = () => {
      cx += (tx - cx) * 0.14;
      cy += (ty - cy) * 0.14;
      apply();
      if (active || Math.abs(tx - cx) > 0.003 || Math.abs(ty - cy) > 0.003) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = 0;
        cx = cy = 0;
        apply();
        el.classList.remove('is-tilting');
      }
    };
    el.addEventListener('pointerenter', (e) => {
      if (!fx.on || e.pointerType === 'touch') return;
      active = true;
      max = el.offsetWidth > 700 ? 2.6 : 5;
      el.classList.add('is-tilting');
      if (!raf) raf = requestAnimationFrame(loop);
    });
    el.addEventListener('pointermove', (e) => {
      if (!active) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
    });
    el.addEventListener('pointerleave', () => {
      active = false;
      tx = 0;
      ty = 0;
    });
  }

  // ----- 3. Refraction -----
  const ua = navigator.userAgent;
  const canRefract = /Chrome\//.test(ua) && !/Mobile|Android/.test(ua) &&
    matchMedia('(pointer: fine)').matches &&
    typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url(#lens)');
  const defs = document.querySelector('.defs');
  const lenses = [];

  const make = (name, attrs) => {
    const node = document.createElementNS(NS, name);
    for (const key of Object.keys(attrs)) node.setAttribute(key, String(attrs[key]));
    return node;
  };

  if (canRefract && defs && 'ResizeObserver' in window) {
    let seq = 0;
    for (const el of document.querySelectorAll('[data-liquid]')) {
      const id = `lens-${++seq}`;
      const clear = el.dataset.liquid === 'clear';
      const strength = clear ? -44 : -72; // negative: the rim shows what lies further inside the pane
      const filter = make('filter', { id, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
      const image = make('feImage', { preserveAspectRatio: 'none', result: 'map' });
      const bend = (scale, result) => make('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale, xChannelSelector: 'R', yChannelSelector: 'G', result });
      const keep = (source, values, result) => make('feColorMatrix', { in: source, type: 'matrix', values, result });
      const add = (a, b, result) => make('feComposite', { in: a, in2: b, operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result });
      const merge = make('feMerge', {});
      merge.append(make('feMergeNode', { in: 'soft' }), make('feMergeNode', { in: 'rim' }));
      filter.append(
        image,
        // the middle of the pane: frosted
        make('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: clear ? 3.5 : 11, result: 'soft' }),
        // the rim: sharp but bent, each colour a little differently, like a prism
        bend(strength, 'bendR'), keep('bendR', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', 'red'),
        bend(strength * 0.94, 'bendG'), keep('bendG', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', 'green'),
        bend(strength * 0.88, 'bendB'), keep('bendB', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', 'blue'),
        add('red', 'green', 'redGreen'),
        add('redGreen', 'blue', 'bent'),
        keep('map', '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 0', 'mask'),
        make('feComposite', { in: 'bent', in2: 'mask', operator: 'in', result: 'rim' }),
        merge
      );
      defs.append(filter);

      let key = '';
      const size = () => {
        const w = Math.round(el.offsetWidth);
        const h = Math.round(el.offsetHeight);
        if (!w || !h || `${w}x${h}` === key) return;
        key = `${w}x${h}`;
        const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
        const bezel = clear ? Math.min(h / 2, 18) : Math.min(30, Math.min(w, h) * 0.2);
        const url = lensMap(w, h, radius, bezel);
        for (const node of [filter, image]) {
          node.setAttribute('x', '0');
          node.setAttribute('y', '0');
          node.setAttribute('width', String(w));
          node.setAttribute('height', String(h));
        }
        image.setAttribute('href', url);
        image.setAttributeNS(XLINK, 'xlink:href', url);
        el.style.setProperty('--lens', `url(#${id})`);
      };
      size();
      new ResizeObserver(debounce(size)).observe(el);
      lenses.push(el);
    }
    // If the page cannot keep up, fall back to plain frosted glass.
    director.on('lite', () => {
      for (const el of lenses) el.style.removeProperty('--lens');
    });
  }

  return { refracts: lenses.length };
}
