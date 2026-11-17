// The aurora director: one clock that decides how strong the aurora is right now.
// Everything else (sky, lights, glitching numbers, the map) listens to it.
//
//   aurora  0..1  sky energy, smooth
//   lamp    0..1  how bright the lights are, smooth
//   flick   0..1  fast flicker for small lights only
//
// Every 16 to 28 seconds a surge rolls in: the sky brightens, lights stutter on,
// then everything settles back.

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const ease = (x) => x * x * (3 - 2 * x);

const REST = { aurora: 0.55, lamp: 0.5, flick: 1 };

export function createDirector(fx) {
  const root = document.documentElement;
  const subs = { frame: new Set(), surge: new Set(), lite: new Set() };
  const state = { time: 0, aurora: REST.aurora, lamp: REST.lamp, flick: REST.flick, surge: 0, lite: false };

  let raf = 0;
  let last = 0;
  let surging = false;
  let surgeStart = 0;
  let surgeLen = 0;
  let surgeAt = rand(4, 7); // the first one comes early, so a visitor sees it
  let phase = 0;
  let flickNext = 0;
  let blinkAt = rand(9, 15);
  let blinkLeft = 0;
  let cssAt = 0;
  let cssFlick = -1;
  let slowFrames = 0;
  let frames = 0;

  const emit = (name, ...args) => subs[name].forEach((fn) => {
    try { fn(...args); } catch (err) { console.error(err); }
  });

  function writeCss(now, force) {
    if (state.flick !== cssFlick) {
      cssFlick = state.flick;
      root.style.setProperty('--flick', state.flick.toFixed(2));
    }
    if (force || now - cssAt > 80) {
      cssAt = now;
      root.style.setProperty('--aurora', state.aurora.toFixed(3));
      root.style.setProperty('--lamp', state.lamp.toFixed(3));
    }
  }

  function rest() {
    surging = false;
    state.aurora = REST.aurora;
    state.lamp = REST.lamp;
    state.flick = REST.flick;
    state.surge = 0;
    writeCss(0, true);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (document.hidden) return;

    // If the page cannot keep up, tell the heavy effects to step down once.
    frames++;
    if (!state.lite && frames > 45) {
      slowFrames = dt > 0.034 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
      if (slowFrames > 90) {
        state.lite = true;
        root.classList.add('lite');
        emit('lite');
      }
    }

    state.time += dt;
    const t = state.time;

    if (!surging && t >= surgeAt) {
      surging = true;
      surgeStart = t;
      surgeLen = rand(6.5, 9);
      emit('surge', state);
    }
    let env = 0;
    if (surging) {
      phase = (t - surgeStart) / surgeLen;
      if (phase >= 1) {
        surging = false;
        surgeAt = t + rand(16, 28);
      } else {
        env = phase < 0.18 ? ease(phase / 0.18) : phase < 0.7 ? 1 : 1 - ease((phase - 0.7) / 0.3);
      }
    }
    state.surge = env;

    const base = 0.5 + 0.12 * Math.sin(t * 0.21) + 0.08 * Math.sin(t * 0.083 + 2);
    state.aurora = base + (1 - base) * env;
    state.lamp += (0.4 + 0.6 * env - state.lamp) * (1 - Math.pow(0.03, dt));

    // Flicker. Unstable while the surge builds, mostly steady at its peak,
    // and a rare double blink in the quiet between surges.
    if (now >= flickNext) {
      if (surging && phase < 0.42) {
        state.flick = pick([0.12, 0.3, 1, 0.55, 1, 0.2, 1, 0.8]);
        flickNext = now + rand(50, 160);
      } else if (surging && phase < 0.7) {
        state.flick = Math.random() < 0.12 ? 0.35 : 1;
        flickNext = now + rand(80, 420);
      } else if (blinkLeft > 0) {
        state.flick = blinkLeft % 2 === 0 ? 0.3 : 1;
        blinkLeft--;
        flickNext = now + rand(60, 130);
      } else {
        state.flick = 1;
        flickNext = now + 220;
        if (!surging && t >= blinkAt) {
          blinkLeft = 4;
          blinkAt = t + rand(9, 16);
        }
      }
    }

    writeCss(now, false);
    emit('frame', state, dt, now);
  }

  function start() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    rest();
  }

  fx.watch((on) => (on ? start() : stop()));

  return {
    state,
    on(name, fn) { subs[name].add(fn); return () => subs[name].delete(fn); },
    start() { if (fx.on) start(); else rest(); },
    stop
  };
}
