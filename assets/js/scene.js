// The hero scene around the aurora: stars, and mountain layers that shift
// with the pointer and the scroll so the ridges read as near and far.

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function initScene({ fx }) {
  const hero = document.querySelector('.hero');
  if (!hero) return null;
  const starCanvas = hero.querySelector('.stars');
  const layers = [...hero.querySelectorAll('.layer')].map((el) => ({ el, depth: parseFloat(el.dataset.depth) || 0 }));
  const emitters = [...hero.querySelectorAll('.emitter')];

  // ----- Stars -----
  const ctx = starCanvas ? starCanvas.getContext('2d') : null;
  let stars = [];
  let scale = 1;
  let twinkle = 0;

  function seedStars() {
    if (!ctx) return;
    const cw = starCanvas.clientWidth;
    const ch = starCanvas.clientHeight;
    if (!cw || !ch) return;
    scale = Math.min(window.devicePixelRatio || 1, 2);
    starCanvas.width = Math.round(cw * scale);
    starCanvas.height = Math.round(ch * scale);
    const rnd = seeded(11);
    const count = Math.round(Math.min(420, (cw * ch) / 4600));
    stars = [];
    for (let i = 0; i < count; i++) {
      const big = rnd() > 0.93;
      stars.push({
        x: rnd() * cw,
        y: Math.pow(rnd(), 1.25) * ch * 0.8,
        r: big ? 1.1 + rnd() * 0.7 : 0.45 + rnd() * 0.6,
        a: big ? 0.75 + rnd() * 0.25 : 0.25 + rnd() * 0.55,
        p: rnd() * 6.283,
        s: 0.5 + rnd() * 1.6,
        warm: rnd() > 0.8
      });
    }
    paintStars(0);
  }

  function paintStars(t) {
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, starCanvas.width, starCanvas.height);
    for (const st of stars) {
      const a = st.a * (0.68 + 0.32 * Math.sin(t * st.s + st.p));
      ctx.globalAlpha = a;
      ctx.fillStyle = st.warm ? '#FFE9C9' : '#EAF2FF';
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, 6.283);
      ctx.fill();
      if (st.r > 1.1) {
        ctx.globalAlpha = a * 0.16;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r * 3.2, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ----- Parallax -----
  let raf = 0;
  let visible = true;
  const ptr = { x: 0, y: 0 };
  const aim = { x: 0, y: 0 };

  function place() {
    const y = window.scrollY;
    for (const l of layers) {
      const far = 1 - l.depth;
      const tx = -ptr.x * 16 * l.depth;
      const ty = y * 0.11 * far - ptr.y * 5 * l.depth;
      l.el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
    }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    ptr.x += (aim.x - ptr.x) * 0.06;
    ptr.y += (aim.y - ptr.y) * 0.06;
    place();
    if (now - twinkle > 140) {
      twinkle = now;
      paintStars(now / 1000);
    }
  }
  function run() {
    if (raf || !visible || !fx.on || document.hidden) return;
    raf = requestAnimationFrame(frame);
  }
  function halt() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    if (!r.width || !r.height) return;
    aim.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    aim.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { aim.x = 0; aim.y = 0; });

  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) run(); else halt();
  }).observe(hero);
  document.addEventListener('visibilitychange', () => (document.hidden ? halt() : run()));

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(seedStars, 150);
  });

  fx.watch((on) => {
    if (on) { run(); return; }
    halt();
    ptr.x = ptr.y = aim.x = aim.y = 0;
    for (const l of layers) l.el.style.transform = '';
    paintStars(0);
  });

  seedStars();
  run();

  return {
    // Where the power-line poles are on screen right now, for sparks.
    emitters() {
      if (!visible) return [];
      return emitters.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }).filter((p) => p.x > 0 && p.x < innerWidth && p.y > 0 && p.y < innerHeight);
    }
  };
}
