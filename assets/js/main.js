// Entry point. Each effect lives in its own module and boots on its own,
// so one failing effect never takes the page down with it.

import { createDirector } from './director.js';
import { initScene } from './scene.js';
import { initAurora } from './aurora.js';
import { initTopo } from './topo.js';
import { initGlass } from './glass.js';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const KEY = 'aurora-effects';

function saved() {
  try { return localStorage.getItem(KEY); } catch (err) { return null; }
}
function save(value) {
  try { localStorage.setItem(KEY, value); } catch (err) { /* private mode: nothing to keep */ }
}

// Effects are on unless the visitor turned them off, or asked the system for less motion
// and has not turned them on here.
const fx = {
  on: saved() === 'on' || (saved() !== 'off' && !reduced.matches),
  subs: new Set(),
  set(value) {
    if (value === this.on) return;
    this.on = value;
    root.classList.toggle('calm', !value);
    this.subs.forEach((fn) => {
      try { fn(value); } catch (err) { console.error(err); }
    });
  },
  watch(fn) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
};

root.classList.add('js');
root.classList.toggle('calm', !fx.on);

const director = createDirector(fx);

function boot(name, fn) {
  try {
    return fn();
  } catch (err) {
    console.error(`[${name}]`, err);
    return null;
  }
}

const scene = boot('scene', () => initScene({ fx, director }));
boot('aurora', () => initAurora({ fx, director }));
boot('topo', () => initTopo({ fx, director }));
boot('glass', () => initGlass({ fx, director }));

// ----- Effects toggle -----
const toggle = document.querySelector('.fx-toggle');
if (toggle) {
  const sync = () => {
    toggle.setAttribute('aria-pressed', String(fx.on));
    toggle.title = fx.on ? 'Turn the aurora effects off' : 'Turn the aurora effects on';
  };
  toggle.addEventListener('click', () => {
    fx.set(!fx.on);
    save(fx.on ? 'on' : 'off');
    sync();
  });
  sync();
}

// ----- Reveal sections as they scroll into view -----
const reveals = [...document.querySelectorAll('[data-reveal]')];
if ('IntersectionObserver' in window) {
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      seen.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  reveals.forEach((el) => seen.observe(el));
} else {
  reveals.forEach((el) => el.classList.add('in'));
}

// ----- Nav: mark the section you are in -----
const links = [...document.querySelectorAll('.nav-links a')];
const targets = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
if (targets.length && 'IntersectionObserver' in window) {
  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const a of links) {
        const here = a.getAttribute('href') === `#${entry.target.id}`;
        if (here) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      }
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  targets.forEach((el) => spy.observe(el));
}

director.start();
