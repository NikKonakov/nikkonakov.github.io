// The aurora director: one clock for the whole night.
//
//   quiet     the power is out, it may snow, the sky is dark
//   arriving  the sky blooms green and the power stutters back on
//   active    aurora overhead: lights on, radios talk, wildlife stirs
//   fading    the power dies and the sky goes dark again
//
// Every effect reads the same state:
//   phase    which part of the night it is
//   aurora   0..1  sky energy, smooth
//   power    0..1  electricity; it stutters while it comes and goes
//   lamp     0..1  power, smoothed, for soft glows
//   flick    always 1; kept for older readers
//   snow     0..1  how hard it snows (only in the quiet, never under the aurora)
//   warp     0..1  "pass time" fast-forward; decays on its own
//   surge    1 while the power is live, else 0
//   nextIn   seconds until the next aurora, during the quiet

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const ease = (x) => x * x * (3 - 2 * x);

const DARK_SKY = 0.08;
const LENGTH = {
  intro: 3.2,
  arriving: 5.5,
  active: () => rand(26, 34),
  fading: 4.5,
  quiet: () => rand(20, 30)
};
// With effects off the page holds one calm, powered frame.
const CALM = { phase: 'calm', aurora: 0.62, power: 1, lamp: 0.8, flick: 1, snow: 0, warp: 0, surge: 0, nextIn: 0 };

export function createDirector(fx) {
  const root = document.documentElement;
  const subs = { frame: new Set(), phase: new Set(), surge: new Set(), drop: new Set(), brownout: new Set(), lite: new Set() };
  const state = {
    time: 0, phase: 'quiet', phaseT: 0, phaseLen: LENGTH.intro,
    aurora: DARK_SKY, power: 0, lamp: 0, flick: 1, snow: 0, warp: 0, surge: 0, nextIn: LENGTH.intro,
    lite: false
  };

  let raf = 0;
  let last = 0;
  let skyFrom = DARK_SKY;
  let first = true;       // the opening quiet is short and clear
  let powered = false;    // 'surge' has fired for this aurora
  let dropped = false;    // 'drop' has fired for this aurora
  let stutterAt = 0;
  let stutter = 0;
  let brownAt = 0;
  let brownUntil = 0;
  let cssAt = 0;
  let cssPower = -1;
  let frames = 0;
  let slowFrames = 0;

  const emit = (name, ...args) => subs[name].forEach((fn) => {
    try { fn(...args); } catch (err) { console.error(err); }
  });

  function writeCss(now, force) {
    const p = Math.round(state.power * 100) / 100;
    if (force || p !== cssPower) {
      cssPower = p;
      root.style.setProperty('--power', p.toFixed(2));
    }
    if (force || now - cssAt > 70) {
      cssAt = now;
      root.style.setProperty('--aurora', state.aurora.toFixed(3));
      root.style.setProperty('--lamp', state.lamp.toFixed(3));
    }
  }

  function enter(phase, len) {
    state.phase = phase;
    state.phaseT = 0;
    state.phaseLen = len;
    skyFrom = state.aurora;
    root.dataset.phase = phase;
    if (phase === 'arriving') { powered = false; dropped = false; }
    if (phase === 'active') brownAt = state.time + rand(6, 11);
    if (phase === 'quiet') first = false;
    emit('phase', phase, state);
  }
  function advance() {
    if (state.phase === 'quiet') enter('arriving', LENGTH.arriving);
    else if (state.phase === 'arriving') enter('active', LENGTH.active());
    else if (state.phase === 'active') enter('fading', LENGTH.fading);
    else enter('quiet', LENGTH.quiet());
  }

  // Power that cannot make up its mind: a new value every 50 to 170 ms.
  function stuttering(now, onChance) {
    if (now >= stutterAt) {
      stutter = Math.random() < onChance ? pick([1, 1, 0.75]) : pick([0, 0, 0.3]);
      stutterAt = now + rand(50, 170);
    }
    return stutter;
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
    state.phaseT += dt;
    state.warp = Math.max(0, state.warp - dt / 1.6);
    if (state.phaseT >= state.phaseLen) advance();

    const t = state.time;
    const p = Math.min(1, state.phaseT / state.phaseLen);
    let sky = DARK_SKY;
    let power = 0;

    if (state.phase === 'quiet') {
      sky = DARK_SKY + 0.02 * Math.sin(t * 0.3);
    } else if (state.phase === 'arriving') {
      sky = skyFrom + (0.92 - skyFrom) * ease(p);
      if (p >= 0.36 && !powered) {
        powered = true;
        emit('surge', state);
      }
      power = p < 0.36 ? 0 : p < 0.72 ? stuttering(now, 0.55 + p * 0.5) : 1;
    } else if (state.phase === 'active') {
      sky = 0.86 + 0.08 * Math.sin(t * 0.21) + 0.05 * Math.sin(t * 0.083 + 2);
      power = 1;
      if (t >= brownAt) {
        brownAt = t + rand(7, 13);
        brownUntil = now + rand(260, 520);
        emit('brownout', state);
      }
      if (now < brownUntil) power = stuttering(now, 0.45);
    } else if (state.phase === 'fading') {
      sky = skyFrom + (DARK_SKY - skyFrom) * ease(p);
      power = p < 0.15 ? 1 : p < 0.7 ? stuttering(now, 1 - (p - 0.15) / 0.55) : 0;
      if (p >= 0.7 && !dropped) {
        dropped = true;
        emit('drop', state);
      }
    }

    state.aurora += (sky - state.aurora) * (1 - Math.pow(0.12, dt));
    state.power = power;
    state.lamp += (power - state.lamp) * (1 - Math.pow(0.0005, dt));
    state.surge = power > 0.5 && (state.phase === 'arriving' || state.phase === 'active') ? 1 : 0;
    state.nextIn = state.phase === 'quiet' ? Math.max(0, state.phaseLen - state.phaseT) : 0;

    // Snow only falls in the quiet, and the sky clears before the aurora comes.
    const snowing = state.phase === 'quiet' && !first && state.nextIn > 9 && state.warp < 0.05 ? 1 : 0;
    state.snow += (snowing - state.snow) * (1 - Math.pow(state.warp > 0 ? 0.01 : 0.6, dt));

    writeCss(now, false);
    emit('frame', state, dt, now);
  }

  function holdCalm() {
    Object.assign(state, CALM);
    root.dataset.phase = 'calm';
    writeCss(0, true);
  }
  function start(resume) {
    if (raf) return;
    if (resume) {
      // Coming back from calm: the lights are already on, so carry on under the aurora.
      Object.assign(state, { aurora: CALM.aurora, power: 1, lamp: 1, snow: 0, warp: 0 });
      enter('active', rand(14, 20));
      powered = true;
      emit('surge', state);
    } else {
      root.dataset.phase = state.phase;
      writeCss(0, true);
    }
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    holdCalm();
  }

  fx.watch((on) => (on ? start(true) : stop()));

  return {
    state,
    on(name, fn) { subs[name].add(fn); return () => subs[name].delete(fn); },
    start() { if (fx.on) start(false); else holdCalm(); },
    stop,
    // Skip the wait: time runs fast and the aurora arrives in about a second.
    passTime() {
      if (!raf || state.phase !== 'quiet') return false;
      state.warp = 1;
      state.phaseLen = Math.min(state.phaseLen, state.phaseT + 1.1);
      return true;
    },
    // ?debug: jump to the next part of the night
    next() { if (raf) advance(); },
    // ?debug: bring the aurora in right now, whatever the phase
    surge() {
      if (!raf) return;
      state.warp = 0.6;
      enter('arriving', LENGTH.arriving);
    }
  };
}
