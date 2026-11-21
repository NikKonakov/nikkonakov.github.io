// Light snow over the hero while the power is out. The sky clears before the aurora.

const rand = (a, b) => a + Math.random() * (b - a);

export function initSnow({ fx, director }) {
  const hero = document.querySelector('.hero');
  const canvas = hero && hero.querySelector('.snowfall');
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return null;

  let flakes = [];
  let scale = 1;
  let cw = 0;
  let ch = 0;
  let raf = 0;
  let last = 0;
  let visible = true;
  let blank = true;

  function seed() {
    cw = canvas.clientWidth;
    ch = canvas.clientHeight;
    if (!cw || !ch) return;
    scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * scale);
    canvas.height = Math.round(ch * scale);
    const count = Math.round(Math.min(220, Math.max(40, (cw * ch) / 9000)));
    flakes = [];
    for (let i = 0; i < count; i++) {
      const depth = rand(0.35, 1);
      flakes.push({
        x: rand(0, cw), y: rand(0, ch), depth,
        r: 0.6 + 2.0 * depth, vy: 12 + 44 * depth, a: 0.3 + 0.6 * depth,
        freq: rand(0.4, 1.3), phase: rand(0, 6.283)
      });
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const st = director.state;
    if (st.snow < 0.01) {
      if (!blank) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); blank = true; }
      return;
    }
    blank = false;
    const t = now / 1000;
    const speed = 1 + 3 * st.warp;
    const wind = 16 * Math.sin(t * 0.11) + 7 * Math.sin(t * 0.37);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#EEF4FF';
    for (const f of flakes) {
      f.y += f.vy * dt * speed;
      f.x += (wind * f.depth + Math.sin(t * f.freq + f.phase) * 10) * dt * speed;
      if (f.y > ch + 4) { f.y = -4; f.x = rand(0, cw); }
      if (f.x > cw + 4) f.x = -4; else if (f.x < -4) f.x = cw + 4;
      ctx.globalAlpha = st.snow * f.a;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
  let timer = 0;
  addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(seed, 150); });
  fx.watch((on) => {
    if (on) { run(); return; }
    halt();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    blank = true;
  });

  seed();
  run();
  return {};
}
