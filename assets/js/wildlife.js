// Under the aurora something stirs in the treeline: a pair of eyes glows between
// the pines, blinks, and is gone. Never more than two at once.

const rand = (a, b) => a + Math.random() * (b - a);

export function initWildlife({ fx, director }) {
  const pairs = [...document.querySelectorAll('.eyes .pair')].map((el) => ({ el, until: 0, blink: 0 }));
  if (!pairs.length) return null;
  const live = new Set();
  let nextAt = Infinity;

  // Phones crop the left of the scene, so only pick eyes that are on screen.
  const onScreen = (pair) => {
    const r = pair.el.getBoundingClientRect();
    return r.width > 0 && r.left > 8 && r.right < innerWidth - 8 && r.bottom > 0 && r.top < innerHeight;
  };
  const show = (pair, now) => {
    pair.until = now + rand(5000, 9000);
    pair.blink = now + rand(900, 2600);
    pair.el.classList.add('on');
    live.add(pair);
  };
  const hide = (pair) => {
    pair.el.classList.remove('on', 'blink');
    live.delete(pair);
  };
  const hideAll = () => [...live].forEach(hide);

  director.on('phase', (phase) => {
    if (phase === 'active') nextAt = performance.now() + rand(700, 1600);
    else { nextAt = Infinity; hideAll(); }
  });
  director.on('frame', (state, dt, now) => {
    if (state.phase !== 'active') return;
    if (live.size < 2 && now >= nextAt) {
      const free = pairs.filter((pair) => !live.has(pair) && onScreen(pair));
      if (free.length) show(free[Math.floor(Math.random() * free.length)], now);
      nextAt = now + rand(2500, 6000);
    }
    for (const pair of live) {
      if (now >= pair.until) { hide(pair); continue; }
      if (now >= pair.blink) {
        pair.el.classList.add('blink');
        setTimeout(() => pair.el.classList.remove('blink'), 140);
        pair.blink = now + rand(1600, 4200);
      }
    }
  });
  fx.watch((on) => { if (!on) hideAll(); });
  return {};
}
