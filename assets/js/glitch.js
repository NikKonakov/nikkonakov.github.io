// When the aurora surges, the readouts act up: digits scramble, the colours split,
// sparks fly off, and then every number snaps back to its real value.
// Screen readers only ever get the real value.

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const DIGITS = '0123456789';
const NOISE = '#%/?=+';

function scramble(text, amount) {
  let out = '';
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') out += Math.random() < amount ? DIGITS[Math.floor(Math.random() * 10)] : ch;
    else if (ch !== ' ' && Math.random() < amount * 0.22) out += pick(NOISE);
    else out += ch;
  }
  return out;
}

export function initGlitch({ fx, director, scene }) {
  const canvas = document.querySelector('.sparks');
  const ctx = canvas ? canvas.getContext('2d') : null;

  // ----- Sparks: one fixed canvas above the page -----
  const sparks = [];
  const arcs = [];
  let raf = 0;
  let last = 0;
  let scale = 1;

  function fit() {
    if (!canvas) return;
    scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * scale);
    canvas.height = Math.round(innerHeight * scale);
  }
  function kick() {
    if (raf || !ctx) return;
    last = performance.now();
    raf = requestAnimationFrame(step);
  }
  function emit(x, y, count, warm, power = 1) {
    if (!ctx) return;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      const speed = rand(110, 430) * power;
      sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0, max: rand(0.25, 0.8), w: rand(0.8, 1.9), warm });
    }
    kick();
  }
  function bolt(x0, y0, x1, y1) {
    if (!ctx) return;
    const pts = [];
    const steps = 7;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const off = i === 0 || i === steps ? 0 : rand(-1, 1) * len * 0.16;
      pts.push(x0 + dx * t - (dy / len) * off, y0 + dy * t + (dx / len) * off);
    }
    arcs.push({ pts, life: 0, max: rand(0.06, 0.14) });
    kick();
  }
  function step(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life += dt;
      if (s.life >= s.max) { sparks.splice(i, 1); continue; }
      s.vy += 900 * dt;
      s.vx *= 1 - 1.5 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k = 1 - s.life / s.max; // 1 hot, 0 cold
      const r = s.warm ? 255 : Math.round(120 + 135 * k);
      const g = s.warm ? Math.round(170 + 80 * k) : 255;
      const b = s.warm ? Math.round(70 + 170 * k) : Math.round(190 + 60 * k);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(0.95 * k).toFixed(3)})`;
      ctx.lineWidth = s.w * (0.5 + 0.7 * k);
      ctx.beginPath();
      ctx.moveTo(s.x - s.vx * 0.028, s.y - s.vy * 0.028);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }

    for (let i = arcs.length - 1; i >= 0; i--) {
      const a = arcs[i];
      a.life += dt;
      if (a.life >= a.max) { arcs.splice(i, 1); continue; }
      const k = 1 - a.life / a.max;
      ctx.shadowColor = 'rgba(108,229,187,0.9)';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = `rgba(235,255,246,${(0.9 * k).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(a.pts[0], a.pts[1]);
      for (let p = 2; p < a.pts.length; p += 2) ctx.lineTo(a.pts[p], a.pts[p + 1]);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    if (sparks.length || arcs.length) {
      raf = requestAnimationFrame(step);
    } else {
      raf = 0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  }
  fit();
  addEventListener('resize', fit);

  // ----- Readouts -----
  const nums = [...document.querySelectorAll('[data-glitch]')].map((el) => {
    const text = el.textContent.trim();
    const real = document.createElement('span');
    real.className = 'sr';
    real.textContent = text;
    const show = document.createElement('span');
    show.className = 'g';
    show.setAttribute('aria-hidden', 'true');
    show.textContent = text;
    show.dataset.text = text;
    el.textContent = '';
    el.append(real, show);
    return { el, show, text, visible: false, busy: false, next: Infinity };
  });

  if ('IntersectionObserver' in window) {
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const n = nums.find((item) => item.el === entry.target);
        if (!n) continue;
        n.visible = entry.isIntersecting;
        // the first hiccup comes soon after a readout scrolls into view
        if (n.visible) n.next = performance.now() + rand(1800, 4500);
      }
    }, { threshold: 0.6 });
    nums.forEach((n) => seen.observe(n.el));
  }

  function settle(n) {
    n.show.textContent = n.text;
    n.show.dataset.text = n.text;
    n.show.classList.remove('is-glitch');
    n.busy = false;
  }

  function burst(n, strong) {
    if (n.busy || !fx.on || !n.visible) return;
    n.busy = true;
    const t0 = performance.now();
    const len = strong ? rand(750, 1150) : rand(380, 680);
    let swapAt = 0;
    n.show.classList.add('is-glitch');

    const box = () => n.show.getBoundingClientRect();
    const sparkAt = (count) => {
      const r = box();
      if (!r.width) return;
      const side = Math.random();
      const x = side < 0.4 ? r.left : side < 0.8 ? r.right : rand(r.left, r.right);
      const y = side < 0.8 ? rand(r.top + r.height * 0.3, r.bottom) : r.top + r.height * 0.3;
      emit(x, y, count, false, strong ? 1 : 0.75);
      if (Math.random() < (strong ? 0.8 : 0.4)) {
        bolt(rand(r.left - 6, r.right + 6), rand(r.top, r.bottom), rand(r.left - 16, r.right + 16), rand(r.top - 10, r.bottom + 10));
      }
    };
    sparkAt(strong ? 18 : 9);

    const frame = (now) => {
      const u = (now - t0) / len;
      if (u >= 1 || !fx.on) { settle(n); return; }
      if (now - swapAt > 55) {
        swapAt = now;
        const calm = u > 0.74; // the value starts to come back before the end
        const text = scramble(n.text, calm ? 0.22 : 0.75);
        n.show.textContent = text;
        n.show.dataset.text = text;
        const s = n.show.style;
        const amp = calm ? 0.4 : 1;
        s.setProperty('--gx', (rand(-3, 3) * amp).toFixed(1));
        s.setProperty('--gy', (rand(-1.5, 1.5) * amp).toFixed(1));
        s.setProperty('--gs', (rand(-7, 7) * amp).toFixed(1));
        s.setProperty('--split', (rand(1, 4) * amp).toFixed(1));
        s.setProperty('--c1', `${Math.round(rand(0, 55))}%`);
        s.setProperty('--c2', `${Math.round(rand(20, 70))}%`);
        s.setProperty('--c3', `${Math.round(rand(30, 80))}%`);
        s.setProperty('--c4', `${Math.round(rand(0, 40))}%`);
        if (Math.random() < (strong ? 0.3 : 0.15)) sparkAt(strong ? 5 : 3);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // Power-line poles in the hero throw warm sparks.
  function poleSparks(count) {
    const list = scene && scene.emitters ? scene.emitters() : [];
    if (!list.length) return;
    const p = pick(list);
    emit(p.x, p.y, count, true, 0.8);
  }

  director.on('frame', (state, dt, now) => {
    for (const n of nums) {
      if (n.visible && !n.busy && now >= n.next) {
        burst(n, false);
        n.next = now + rand(8000, 16000);
      }
    }
    if (state.surge > 0.5 && Math.random() < dt * 1.3) poleSparks(Math.round(rand(4, 9)));
  });

  director.on('surge', () => {
    for (const n of nums) {
      if (!n.visible) continue;
      setTimeout(() => burst(n, true), rand(250, 1700));
      setTimeout(() => burst(n, false), rand(2900, 4600));
      n.next = performance.now() + rand(9000, 16000);
    }
    setTimeout(() => poleSparks(14), 500);
  });

  fx.watch((on) => {
    if (on) return;
    nums.forEach(settle);
    sparks.length = 0;
    arcs.length = 0;
  });

  return {
    // for manual testing: glitch every visible readout now
    test() { nums.forEach((n) => burst(n, true)); }
  };
}
