// A field radio docked in the corner. Dead while the power is out; when the aurora
// comes it picks up transmissions (about me) through the static, then loses them again.
// It can pass time until the next aurora. Sound stays off until you turn it on.

const rand = (a, b) => a + Math.random() * (b - a);
const NOISE = '░▒▓#%&*/<>=+';
const noise = (n) => {
  let out = '';
  for (let i = 0; i < n; i++) out += NOISE[Math.floor(Math.random() * NOISE.length)];
  return out;
};

const LINES = [
  'Signal acquired. This is Nikita Konakov, Calgary, Alberta.',
  'Software developer. I build mobile and web apps with React Native, Next.js and TypeScript.',
  'Latest project: TrackPeloton, a fitness app for athletes and coaches. Team of five, 45,000+ lines of code.',
  'Also shipped: a Moodle platform in Docker, a library system migration and a school website.',
  'Diploma in Software Development, SAIT, 2025.',
  'Off the clock: orange-level volunteer at AARCS, the Alberta Animal Rescue Crew Society.',
  'Reach me on LinkedIn. My code is on GitHub. Over.'
];

const KEY = 'radio';
function saved() {
  try { return localStorage.getItem(KEY); } catch (err) { return null; }
}
function save(value) {
  try { localStorage.setItem(KEY, value); } catch (err) { /* private mode */ }
}

// Everything you hear is made here, nothing is downloaded: band-limited static,
// a mains hum while the power is live, and a slow open chord for the aurora itself.
function createSound() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);

  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const hiss = ctx.createBufferSource();
  hiss.buffer = buffer;
  hiss.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1900;
  band.Q.value = 0.8;
  const hissGain = ctx.createGain();
  hissGain.gain.value = 0;
  hiss.connect(band).connect(hissGain).connect(master);
  hiss.start();

  const humGain = ctx.createGain();
  humGain.gain.value = 0;
  humGain.connect(master);
  for (const [freq, level, type] of [[60, 0.6, 'sine'], [120, 0.32, 'triangle'], [180, 0.1, 'sine']]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(humGain);
    osc.start();
  }

  const toneGain = ctx.createGain();
  toneGain.gain.value = 0;
  const tremolo = ctx.createGain();
  tremolo.gain.value = 0.65;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.3;
  lfo.connect(lfoDepth).connect(tremolo.gain);
  lfo.start();
  toneGain.connect(tremolo).connect(master);
  for (const [freq, cents, level] of [[110, 0, 0.5], [164.81, 4, 0.34], [220, -3, 0.24], [329.63, 6, 0.1]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.detune.value = cents;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(toneGain);
    osc.start();
  }

  function crackle(strength) {
    const t = ctx.currentTime;
    const dur = 0.02 + Math.random() * 0.06;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * strength, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(high).connect(g).connect(master);
    src.start(t, Math.random() * 1.5, dur + 0.02);
  }

  let tuneAt = 0;
  return {
    update(state, now) {
      if (now - tuneAt < 90) return;
      tuneAt = now;
      const t = ctx.currentTime;
      hissGain.gain.setTargetAtTime(0.006 + 0.03 * state.aurora * (0.4 + 0.6 * state.power), t, 0.15);
      humGain.gain.setTargetAtTime(0.045 * state.power, t, 0.04);
      toneGain.gain.setTargetAtTime(0.05 * Math.max(0, state.aurora - 0.3) / 0.7, t, 0.6);
      if (state.power > 0.5 && Math.random() < 0.18) crackle(0.4 + Math.random() * 0.5);
    },
    crackle,
    on() { return ctx.resume(); },
    off() { return ctx.suspend(); }
  };
}

const fmt = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function initRadio({ fx, director }) {
  const box = document.querySelector('.radio');
  if (!box) return null;
  const $ = (sel) => box.querySelector(sel);
  const fab = $('.radio-fab');
  const hideBtn = $('.radio-hide');
  const soundBtn = $('.radio-sound');
  const passBtn = $('.radio-pass');
  const status = $('.radio-status');
  const textEl = $('.radio-text');
  const nextEl = $('.radio-next');
  const scope = $('.radio-scope');
  const sctx = scope ? scope.getContext('2d') : null;

  // ----- open and close -----
  // Open over the hero; it tucks itself into a small button while you read the sections,
  // unless you open it there yourself.
  const hero = document.querySelector('.hero');
  const pref = saved();
  let wantOpen = pref ? pref === 'open' : innerWidth >= 900;
  let inHero = true;
  let pinned = false;
  let forced = false; // the visitor opened it themselves this visit
  const body = $('.radio-body');
  const copy = hero ? [...hero.querySelectorAll('.actions, .aurora-note')] : [];
  // On short screens the open radio would sit on the hero buttons: then it waits as a button.
  const crowded = () => {
    const r = body && body.getBoundingClientRect();
    if (!r || !r.width) return false;
    return copy.some((el) => {
      const c = el.getBoundingClientRect();
      return c.width && r.left < c.right && c.left < r.right && r.top < c.bottom && c.top < r.bottom;
    });
  };
  const render = () => {
    let open = wantOpen && (inHero || pinned);
    box.dataset.open = String(open);
    if (open && !forced && crowded()) {
      open = false;
      box.dataset.open = 'false';
    }
    if (!open && body && body.contains(document.activeElement) && fab) fab.focus();
    if (fab) fab.setAttribute('aria-expanded', String(open));
  };
  addEventListener('resize', () => { if (!forced) render(); });
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inHero = entries[entries.length - 1].intersectionRatio >= 0.35;
      if (inHero) pinned = false;
      render();
    }, { threshold: [0, 0.35, 1] }).observe(hero);
  }
  if (fab) fab.addEventListener('click', () => {
    wantOpen = true;
    forced = true;
    pinned = !inHero;
    save('open');
    render();
    if (hideBtn) hideBtn.focus();
  });
  if (hideBtn) hideBtn.addEventListener('click', () => {
    wantOpen = false;
    forced = false;
    pinned = false;
    save('closed');
    render();
    if (fab) fab.focus();
  });
  render();

  // ----- sound -----
  let sound = null;
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      const on = soundBtn.getAttribute('aria-pressed') !== 'true';
      if (on && !sound) sound = createSound();
      if (!sound) return;
      soundBtn.setAttribute('aria-pressed', String(on));
      if (on) sound.on(); else sound.off();
    });
  }

  // ----- pass time -----
  let passingUntil = 0;
  if (passBtn) {
    passBtn.addEventListener('click', () => {
      if (director.passTime()) passingUntil = performance.now() + 1100;
    });
  }

  // ----- a live wire bites -----
  let zapUntil = 0;
  addEventListener('aurora:zap', () => {
    zapUntil = performance.now() + 1300;
    if (sound && soundBtn.getAttribute('aria-pressed') === 'true') { sound.crackle(1.6); sound.crackle(1.1); }
  });

  // ----- the transmission -----
  let line = 0;
  let pos = 0;
  let hold = 0;
  let activity = 0;
  director.on('surge', () => { line = 0; pos = 0; hold = 0; });

  const put = (el, value) => { if (el && el.textContent !== value) el.textContent = value; };

  function decode(state, dt, now) {
    if (now < passingUntil) return 'Time passes…';
    if (state.phase === 'quiet') return 'Static. The power is out.';
    if (state.phase === 'fading') {
      return state.power > 0.5 ? `…${noise(3)} signal ${noise(2)} los${noise(1)}…` : 'Signal lost.';
    }
    if (state.power < 0.5) { activity = 0.3; return `Searching ${noise(10 + Math.floor(Math.random() * 8))}`; }

    const text = LINES[line];
    if (pos < text.length) {
      pos = Math.min(text.length, pos + dt * 34);
      activity = 1;
    } else {
      hold += dt;
      activity *= 0.94;
      if (hold > 2.6) {
        hold = 0;
        pos = 0;
        line = (line + 1) % LINES.length;
      }
    }
    const n = Math.floor(pos);
    let out = text.slice(0, n);
    if (n < text.length) out += noise(2 + Math.floor(Math.random() * 3));
    if (n > 6 && Math.random() < 0.05) {
      const i = Math.floor(Math.random() * n);
      out = out.slice(0, i) + noise(1) + out.slice(i + 1);
    }
    return out;
  }

  function label(state, now) {
    if (now < zapUntil) return 'Live wire!';
    switch (state.phase) {
      case 'quiet': return 'No signal';
      case 'arriving': return state.power > 0.5 ? 'Signal rising' : 'Searching';
      case 'active': return 'Aurora · live';
      case 'fading': return 'Signal fading';
      default: return '';
    }
  }

  function foot(state) {
    switch (state.phase) {
      case 'quiet': return `Aurora in ${fmt(state.nextIn)}`;
      case 'arriving': return 'Aurora arriving';
      case 'active': return `Transmission ${line + 1} of ${LINES.length}`;
      case 'fading': return 'Power failing';
      default: return '';
    }
  }

  function drawScope(state, now) {
    if (!sctx || box.dataset.open !== 'true') return;
    const w = scope.clientWidth;
    const h = scope.clientHeight;
    if (!w || !h) return;
    const s = Math.min(window.devicePixelRatio || 1, 2);
    if (scope.width !== Math.round(w * s)) { scope.width = Math.round(w * s); scope.height = Math.round(h * s); }
    sctx.setTransform(s, 0, 0, s, 0, 0);
    sctx.clearRect(0, 0, w, h);
    sctx.strokeStyle = 'rgba(235,241,247,0.07)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    for (let i = 1; i < 8; i++) {
      const x = Math.round((w * i) / 8) + 0.5;
      sctx.moveTo(x, 0);
      sctx.lineTo(x, h);
    }
    sctx.moveTo(0, Math.round(h / 2) + 0.5);
    sctx.lineTo(w, Math.round(h / 2) + 0.5);
    sctx.stroke();

    const live = state.power > 0.5;
    const t = now / 1000;
    const amp = (live ? 0.18 + 0.62 * activity : 0.05) * h * 0.5;
    sctx.lineWidth = 1.5;
    sctx.strokeStyle = live ? 'rgba(108,229,187,0.95)' : 'rgba(165,178,196,0.5)';
    sctx.shadowColor = live ? 'rgba(108,229,187,0.8)' : 'transparent';
    sctx.shadowBlur = live ? 6 : 0;
    sctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const u = x / w;
      const y = live
        ? Math.sin(u * 23 + t * 9) * 0.5 + Math.sin(u * 61 - t * 14) * 0.28 + (Math.random() - 0.5) * 0.55
        : (Math.random() - 0.5) * 0.7;
      if (x === 0) sctx.moveTo(x, h / 2 + y * amp); else sctx.lineTo(x, h / 2 + y * amp);
    }
    sctx.stroke();
    sctx.shadowBlur = 0;
  }

  let paintAt = 0;
  let lastPhase = '';
  director.on('frame', (state, dt, now) => {
    if (sound && soundBtn.getAttribute('aria-pressed') === 'true') sound.update(state, now);
    if (now - paintAt < 33) return;
    const step = Math.min(0.1, (now - paintAt) / 1000);
    paintAt = now;
    if (state.phase !== lastPhase) {
      lastPhase = state.phase;
      box.dataset.phase = state.phase;
      if (passBtn) {
        // the button hides once pressed: hand keyboard focus to the next control
        if (state.phase !== 'quiet' && document.activeElement === passBtn && soundBtn) soundBtn.focus();
        passBtn.disabled = state.phase !== 'quiet';
      }
    }
    put(status, label(state, now));
    put(textEl, decode(state, step, now));
    put(nextEl, foot(state));
    drawScope(state, now);
  });

  // effects off: the radio is hidden by CSS, and goes quiet
  fx.watch((on) => { if (!on && sound) { sound.off(); soundBtn.setAttribute('aria-pressed', 'false'); } });

  box.dataset.phase = director.state.phase;
  return {};
}
