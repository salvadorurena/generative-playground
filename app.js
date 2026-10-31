'use strict';

const TAU = Math.PI * 2;

// ---------- Randomness ----------

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Classic 2D Perlin noise, seeded. Returns roughly [-1, 1].
function makeNoise(rng) {
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;

  return (x, y) => {
    const fx = Math.floor(x), fy = Math.floor(y);
    const X = fx & 255, Y = fy & 255;
    x -= fx; y -= fy;
    const u = fade(x), v = fade(y);
    const a = p[X] + Y, b = p[X + 1] + Y;
    return lerp(
      lerp(grad(p[a], x, y), grad(p[b], x - 1, y), u),
      lerp(grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1), u),
      v
    );
  };
}

// ---------- Palettes (first color is the background) ----------

const PALETTES = {
  Ember:  ['#120b0b', '#ff4e2a', '#ffb03b', '#f7e07e', '#c72c41'],
  Lagoon: ['#05141c', '#0fb5ae', '#4fd1c5', '#a7f3d0', '#3b82f6'],
  Neon:   ['#0a0118', '#ff2e88', '#7a5cff', '#00e5ff', '#f9f871'],
  Moss:   ['#0f1a12', '#6a994e', '#a7c957', '#f2e8cf', '#bc4749'],
  Dusk:   ['#1a1423', '#e07a5f', '#f2cc8f', '#81b29a', '#9d8df1'],
  Ink:    ['#f4efe6', '#1b1b1b', '#3d3d3d', '#8a8072', '#c0392b'],
};

// ---------- Modes ----------
// Each mode has a param schema and create(env) -> { step() } where step
// draws one frame and returns true when the piece is finished.

const MODES = {
  flow: {
    name: 'Flow Field',
    params: [
      { key: 'count', label: 'Particles', min: 100, max: 5000, step: 100, value: 1800 },
      { key: 'scale', label: 'Noise scale', min: 0.5, max: 10, step: 0.1, value: 2.5 },
      { key: 'curl', label: 'Turbulence', min: 0.5, max: 4, step: 0.1, value: 1.5 },
      { key: 'speed', label: 'Speed', min: 0.5, max: 4, step: 0.1, value: 1.2 },
      { key: 'alpha', label: 'Ink opacity', min: 0.02, max: 0.6, step: 0.01, value: 0.12 },
      { key: 'width', label: 'Line width', min: 0.3, max: 3, step: 0.1, value: 0.8 },
    ],
    create({ ctx, w, h, rng, noise, inks, p }) {
      const s = p.scale / Math.min(w, h);
      const ox = rng() * 1000, oy = rng() * 1000;
      const spawn = pt => {
        pt.x = rng() * w;
        pt.y = rng() * h;
        pt.life = 50 + rng() * 250;
      };
      const parts = [];
      for (let i = 0; i < p.count; i++) {
        const pt = { c: i % inks.length };
        spawn(pt);
        parts.push(pt);
      }
      let frame = 0;
      return {
        step() {
          const paths = inks.map(() => new Path2D());
          for (let sub = 0; sub < 4; sub++) {
            for (const pt of parts) {
              const a = noise(pt.x * s + ox, pt.y * s + oy) * TAU * p.curl;
              const nx = pt.x + Math.cos(a) * p.speed;
              const ny = pt.y + Math.sin(a) * p.speed;
              const path = paths[pt.c];
              path.moveTo(pt.x, pt.y);
              path.lineTo(nx, ny);
              pt.x = nx; pt.y = ny;
              if (--pt.life < 0 || nx < 0 || ny < 0 || nx > w || ny > h) spawn(pt);
            }
          }
          ctx.globalAlpha = p.alpha;
          ctx.lineWidth = p.width;
          ctx.lineCap = 'round';
          paths.forEach((path, i) => {
            ctx.strokeStyle = inks[i];
            ctx.stroke(path);
          });
          return ++frame >= 500;
        },
      };
    },
  },

  attractor: {
    name: 'Clifford Attractor',
    params: [
      { key: 'a', label: 'a', min: -3, max: 3, step: 0.01, value: -1.4 },
      { key: 'b', label: 'b', min: -3, max: 3, step: 0.01, value: 1.6 },
      { key: 'c', label: 'c', min: -3, max: 3, step: 0.01, value: 1.0 },
      { key: 'd', label: 'd', min: -3, max: 3, step: 0.01, value: 0.7 },
      { key: 'density', label: 'Points / frame', min: 5000, max: 60000, step: 1000, value: 25000 },
      { key: 'alpha', label: 'Ink opacity', min: 0.02, max: 0.5, step: 0.01, value: 0.08 },
      { key: 'zoom', label: 'Zoom', min: 0.5, max: 1.5, step: 0.01, value: 0.9 },
    ],
    create({ ctx, w, h, rng, inks, p }) {
      const xr = 1 + Math.abs(p.c), yr = 1 + Math.abs(p.d);
      const scale = Math.min(w / (2 * xr), h / (2 * yr)) * p.zoom;
      const cx = w / 2, cy = h / 2;
      const maxStep = 2 * Math.max(xr, yr);
      let x = rng() * 0.2, y = rng() * 0.2;
      const iterate = () => {
        const nx = Math.sin(p.a * y) + p.c * Math.cos(p.a * x);
        const ny = Math.sin(p.b * x) + p.d * Math.cos(p.b * y);
        const dist = Math.hypot(nx - x, ny - y);
        x = nx; y = ny;
        return dist;
      };
      for (let i = 0; i < 100; i++) iterate();
      let frame = 0;
      return {
        step() {
          const paths = inks.map(() => new Path2D());
          for (let i = 0; i < p.density; i++) {
            const dist = iterate();
            const ci = Math.min(inks.length - 1, Math.floor((dist / maxStep) * inks.length * 1.5));
            paths[ci].rect(cx + x * scale, cy + y * scale, 1, 1);
          }
          ctx.globalAlpha = p.alpha;
          paths.forEach((path, i) => {
            ctx.fillStyle = inks[i];
            ctx.fill(path);
          });
          return ++frame >= 240;
        },
      };
    },
  },

  bloom: {
    name: 'Fractal Bloom',
    params: [
      { key: 'depth', label: 'Depth', min: 2, max: 11, step: 1, value: 8 },
      { key: 'branches', label: 'Branches', min: 2, max: 4, step: 1, value: 2 },
      { key: 'spread', label: 'Spread (°)', min: 5, max: 120, step: 1, value: 28 },
      { key: 'ratio', label: 'Length ratio', min: 0.5, max: 0.85, step: 0.01, value: 0.72 },
      { key: 'jitter', label: 'Jitter', min: 0, max: 1, step: 0.01, value: 0.2 },
      { key: 'symmetry', label: 'Symmetry', min: 1, max: 12, step: 1, value: 6 },
      { key: 'size', label: 'Fill', min: 0.3, max: 1.3, step: 0.01, value: 0.9 },
      { key: 'width', label: 'Line width', min: 0.5, max: 6, step: 0.1, value: 2.5 },
    ],
    create({ ctx, w, h, rng, inks, p }) {
      // Keep the segment count sane: branches^depth * symmetry.
      let depth = p.depth;
      while (depth > 2 && Math.pow(p.branches, depth) * p.symmetry > 250000) depth--;

      const spread = p.spread * Math.PI / 180;
      const levels = Array.from({ length: depth }, () => new Path2D());
      const branch = (x, y, a, len, d) => {
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        levels[d].moveTo(x, y);
        levels[d].lineTo(x2, y2);
        if (d + 1 >= depth) return;
        for (let i = 0; i < p.branches; i++) {
          const off = (i / (p.branches - 1) - 0.5) * 2 * spread;
          const jit = (rng() - 0.5) * p.jitter * spread;
          const nl = len * p.ratio * (1 + (rng() - 0.5) * p.jitter * 0.4);
          branch(x2, y2, a + off + jit, nl, d + 1);
        }
      };

      // Size the trunk so the full reach (len * sum of ratio^d) fills the canvas.
      const single = p.symmetry === 1;
      const cx = w / 2, cy = single ? h * 0.92 : h / 2;
      const room = single ? h * 0.85 : Math.min(w, h) / 2;
      const reach = (1 - Math.pow(p.ratio, depth)) / (1 - p.ratio);
      const len = room * p.size / reach;
      for (let k = 0; k < p.symmetry; k++) {
        branch(cx, cy, -Math.PI / 2 + k * TAU / p.symmetry, len, 0);
      }

      // Grow one level per frame.
      let frame = 0;
      return {
        step() {
          const d = frame;
          ctx.globalAlpha = 0.9;
          ctx.lineCap = 'round';
          ctx.strokeStyle = inks[d % inks.length];
          ctx.lineWidth = Math.max(0.3, p.width * (1 - d / depth));
          ctx.stroke(levels[d]);
          return ++frame >= depth;
        },
      };
    },
  },
};

// ---------- State ----------

const state = {
  mode: 'flow',
  palette: 'Ember',
  seed: Math.floor(Math.random() * 1e6),
  params: Object.fromEntries(
    Object.entries(MODES).map(([k, m]) => [k, Object.fromEntries(m.params.map(q => [q.key, q.value]))])
  ),
};

function readHash() {
  try {
    const h = JSON.parse(decodeURIComponent(location.hash.slice(1)));
    if (MODES[h.m]) state.mode = h.m;
    if (PALETTES[h.p]) state.palette = h.p;
    if (Number.isFinite(h.s)) state.seed = h.s;
    if (h.v) Object.assign(state.params[state.mode], h.v);
  } catch { /* no or bad hash */ }
}

function writeHash() {
  const h = { m: state.mode, p: state.palette, s: state.seed, v: state.params[state.mode] };
  history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify(h)));
}

// ---------- Rendering ----------

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
let runner = null, done = false, paused = false, dirty = true, frames = 0;

function restart() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = PALETTES[state.palette];
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, w, h);

  const rng = mulberry32(state.seed);
  runner = MODES[state.mode].create({
    ctx, w, h, rng,
    noise: makeNoise(rng),
    bg: colors[0],
    inks: colors.slice(1),
    p: state.params[state.mode],
  });
  done = false;
  frames = 0;
}

function loop() {
  requestAnimationFrame(loop);
  if (dirty) {
    dirty = false;
    restart();
  }
  if (!paused && !done) {
    done = runner.step();
    frames++;
  }
  statusEl.textContent = done ? `Done · ${frames} frames` : paused ? 'Paused' : `Rendering · frame ${frames}`;
}

function schedule() {
  dirty = true;
  writeHash();
}

// ---------- UI ----------

const $ = id => document.getElementById(id);
const modeSel = $('mode'), paletteSel = $('palette'), seedInput = $('seed');

const decimals = step => (String(step).split('.')[1] || '').length;

function buildParams() {
  const box = $('params');
  box.innerHTML = '';
  for (const q of MODES[state.mode].params) {
    const label = document.createElement('label');
    label.className = 'field';
    label.innerHTML = `<span class="head"><span class="label">${q.label}</span><output></output></span>`;
    const out = label.querySelector('output');
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: q.min, max: q.max, step: q.step });
    input.value = state.params[state.mode][q.key];
    out.textContent = Number(input.value).toFixed(decimals(q.step));
    input.addEventListener('input', () => {
      state.params[state.mode][q.key] = Number(input.value);
      out.textContent = Number(input.value).toFixed(decimals(q.step));
      schedule();
    });
    label.appendChild(input);
    box.appendChild(label);
  }
}

function syncControls() {
  modeSel.value = state.mode;
  paletteSel.value = state.palette;
  seedInput.value = state.seed;
  $('swatches').innerHTML = PALETTES[state.palette].map(c => `<span style="background:${c}"></span>`).join('');
  buildParams();
}

function newSeed() {
  state.seed = Math.floor(Math.random() * 1e6);
  seedInput.value = state.seed;
}

function randomize() {
  newSeed();
  for (const q of MODES[state.mode].params) {
    const steps = Math.round((q.max - q.min) / q.step);
    const v = q.min + Math.floor(Math.random() * (steps + 1)) * q.step;
    state.params[state.mode][q.key] = Number(v.toFixed(decimals(q.step)));
  }
  syncControls();
  schedule();
}

function togglePause() {
  paused = !paused;
  $('pause').innerHTML = `${paused ? 'Resume' : 'Pause'} <kbd>Space</kbd>`;
}

function savePng() {
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.mode}-${state.palette.toLowerCase()}-${state.seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

for (const [k, m] of Object.entries(MODES)) modeSel.add(new Option(m.name, k));
for (const k of Object.keys(PALETTES)) paletteSel.add(new Option(k, k));

modeSel.addEventListener('change', () => { state.mode = modeSel.value; syncControls(); schedule(); });
paletteSel.addEventListener('change', () => { state.palette = paletteSel.value; syncControls(); schedule(); });
seedInput.addEventListener('change', () => { state.seed = Math.floor(Number(seedInput.value) || 0); schedule(); });
$('reseed').addEventListener('click', () => { newSeed(); schedule(); });
$('randomize').addEventListener('click', randomize);
$('pause').addEventListener('click', togglePause);
$('save').addEventListener('click', savePng);

window.addEventListener('keydown', e => {
  if (e.target.matches('input[type="number"], select') || e.metaKey || e.ctrlKey) return;
  if (e.key === 'r' || e.key === 'R') randomize();
  else if (e.key === 's' || e.key === 'S') savePng();
  else if (e.key === ' ') { e.preventDefault(); togglePause(); }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { dirty = true; }, 150);
});

readHash();
syncControls();
writeHash();
loop();
