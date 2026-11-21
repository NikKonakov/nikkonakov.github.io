// Fluorescent tubes, one hanging over each section. They strike on when the aurora
// brings the power back, a tired one flickers now and then, and they die when it goes.
// Their light falls on the room behind the glass panels, so the panels catch it.

const rand = (a, b) => a + Math.random() * (b - a);

// [brightness, how long to hold it in ms]: the stutter of a cold fluorescent start
const STRIKE = [[1, 60], [0, 130], [1, 40], [0, 280], [0.55, 80], [0, 100], [1, 0]];
const DIE = [[0.4, 70], [1, 60], [0, 150], [0.6, 40], [0, 0]];
const TIRED = [[0.2, 60], [1, 90], [0, 120], [1, 0]];

export function initPower({ fx, director }) {
  const sections = [...document.querySelectorAll('main > .section')];
  const tubes = sections.map((section) => {
    const el = document.createElement('div');
    el.className = 'tube';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="tube-glass"></span>';
    section.prepend(el);
    return { el, timers: [], lit: 0 };
  });
  if (!tubes.length) return null;

  const set = (tube, value) => {
    tube.lit = value;
    tube.el.style.setProperty('--tube', String(value));
  };
  const stop = (tube) => {
    tube.timers.forEach(clearTimeout);
    tube.timers = [];
  };
  const play = (tube, steps, delay) => {
    stop(tube);
    let at = delay;
    for (const [value, ms] of steps) {
      tube.timers.push(setTimeout(() => set(tube, value), at));
      at += ms * rand(0.6, 1.4);
    }
  };

  director.on('surge', () => tubes.forEach((tube) => play(tube, STRIKE, rand(0, 1500))));
  director.on('phase', (phase) => {
    if (phase === 'fading') tubes.forEach((tube) => play(tube, DIE, rand(300, 2200)));
    if (phase === 'quiet') tubes.forEach((tube) => { stop(tube); set(tube, 0); });
  });
  director.on('frame', (state, dt) => {
    if (state.phase !== 'active' || Math.random() > dt * 0.16) return;
    const tube = tubes[Math.floor(Math.random() * tubes.length)];
    if (tube.lit === 1) play(tube, TIRED, 0);
  });

  // With effects off the lights simply stay on.
  const calm = () => tubes.forEach((tube) => { stop(tube); set(tube, 1); });
  fx.watch((on) => { if (!on) calm(); });
  if (!fx.on) calm();
  return {};
}
