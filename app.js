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

// ---------- Canvas & finish options ----------

const ASPECTS = {
  fill: 'Fill window',
  '1:1': 'Square 1:1',
  '4:5': 'Portrait 4:5',
  '9:16': 'Story 9:16',
  '3:2': 'Landscape 3:2',
  '16:9': 'Wide 16:9',
};

const POST_PARAMS = [
  { key: 'grain', label: 'Grain', min: 0, max: 1, step: 0.01, value: 0.2 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, value: 0.3 },
  { key: 'glow', label: 'Glow', min: 0, max: 1, step: 0.01, value: 0 },
];

const EXPORT_SIZES = { screen: 'Screen', x2: '2×', print: 'Print' };
const MAX_EXPORT_AREA = 4096 * 4096; // Safari's canvas area limit

// ---------- State ----------

const state = {
  mode: 'flow',
  palette: 'Ember',
  aspect: 'fill',
  seed: Math.floor(Math.random() * 1e6),
  params: Object.fromEntries(
    Object.entries(MODES).map(([k, m]) => [k, Object.fromEntries(m.params.map(q => [q.key, q.value]))])
  ),
  locks: Object.fromEntries(Object.keys(MODES).map(k => [k, new Set()])),
  post: Object.fromEntries(POST_PARAMS.map(q => [q.key, q.value])),
};

// A snapshot is everything needed to reproduce a piece; used by the URL hash and favorites.
function snapshot() {
  return {
    m: state.mode, p: state.palette, s: state.seed, a: state.aspect,
    v: { ...state.params[state.mode] }, x: { ...state.post },
  };
}

function applySnapshot(h) {
  if (MODES[h.m]) state.mode = h.m;
  if (PALETTES[h.p]) state.palette = h.p;
  if (Number.isFinite(h.s)) state.seed = h.s;
  if (ASPECTS[h.a]) state.aspect = h.a;
  if (h.v) Object.assign(state.params[state.mode], h.v);
  if (h.x) Object.assign(state.post, h.x);
}

function readHash() {
  try {
    applySnapshot(JSON.parse(decodeURIComponent(location.hash.slice(1))));
  } catch { /* no or bad hash */ }
}

function writeHash() {
  history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify(snapshot())));
}

// ---------- Rendering ----------
// Modes draw onto an offscreen "art" canvas; compose() copies it to the
// target and layers the finish effects on top, so effects never accumulate.

function startRender(w, h, k) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);

  const colors = PALETTES[state.palette];
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, w, h);

  const rng = mulberry32(state.seed);
  const runner = MODES[state.mode].create({
    ctx, w, h, rng,
    noise: makeNoise(rng),
    bg: colors[0],
    inks: colors.slice(1),
    p: { ...state.params[state.mode] },
  });
  return { canvas, runner };
}

function currentLook() {
  return { post: { ...state.post }, bg: PALETTES[state.palette][0], seed: state.seed };
}

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
}

let grainTile = null, grainSeed = null;
function getGrainTile(seed) {
  if (grainTile && grainSeed === seed) return grainTile;
  const t = document.createElement('canvas');
  t.width = t.height = 128;
  const g = t.getContext('2d');
  const img = g.createImageData(128, 128);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rng() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = t;
  grainSeed = seed;
  return t;
}

const glowCanvas = document.createElement('canvas');
const glowCtx = glowCanvas.getContext('2d');

// w, h are CSS-pixel dimensions; k is the pixel scale of art/out.
function compose(out, art, w, h, k, look) {
  const ctx = out.getContext('2d');
  const { post } = look;
  const W = art.width, H = art.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(art, 0, 0);

  if (post.glow > 0) {
    // Blur a quarter-size copy: much cheaper than blurring at full size.
    glowCanvas.width = Math.max(1, Math.round(W / 4));
    glowCanvas.height = Math.max(1, Math.round(H / 4));
    glowCtx.filter = `blur(${Math.max(1, Math.min(w, h) * k * 0.012 / 4)}px)`;
    glowCtx.drawImage(art, 0, 0, glowCanvas.width, glowCanvas.height);
    ctx.globalCompositeOperation = isLight(look.bg) ? 'multiply' : 'screen';
    ctx.globalAlpha = post.glow;
    ctx.drawImage(glowCanvas, 0, 0, W, H);
  }

  if (post.vignette > 0) {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.hypot(w, h) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${post.vignette * 0.8})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  if (post.grain > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const pattern = ctx.createPattern(getGrainTile(look.seed), 'repeat');
    pattern.setTransform(new DOMMatrix().scale(Math.max(1, k / 2)));
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = post.grain * 0.35;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

const $ = id => document.getElementById(id);
const view = $('canvas');
const stage = $('stage');
const statusEl = $('status');

let render = null, size = { w: 1, h: 1, dpr: 1 };
let done = false, paused = false, dirty = true, needsCompose = false, frames = 0;
let presenting = false, exporting = false, exportMsg = '';
let flashMsg = '', flashUntil = 0;

function canvasSize() {
  const pad = state.aspect === 'fill' || presenting ? 0 : 24;
  const aw = stage.clientWidth - pad * 2, ah = stage.clientHeight - pad * 2;
  if (state.aspect === 'fill') return { w: Math.max(1, aw), h: Math.max(1, ah) };
  const [a, b] = state.aspect.split(':').map(Number);
  let w = aw, h = aw * b / a;
  if (h > ah) { h = ah; w = ah * a / b; }
  return { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
}

function restart() {
  const dpr = window.devicePixelRatio || 1;
  const { w, h } = canvasSize();
  view.style.width = w + 'px';
  view.style.height = h + 'px';
  view.width = Math.round(w * dpr);
  view.height = Math.round(h * dpr);
  view.classList.toggle('framed', state.aspect !== 'fill');
  size = { w, h, dpr };
  render = startRender(w, h, dpr);
  done = false;
  frames = 0;
  updateExportLabels();
}

function loop() {
  requestAnimationFrame(loop);
  if (dirty) {
    dirty = false;
    restart();
    needsCompose = true;
  }
  if (!paused && !done) {
    done = render.runner.step();
    frames++;
    needsCompose = true;
  }
  if (needsCompose) {
    needsCompose = false;
    compose(view, render.canvas, size.w, size.h, size.dpr, currentLook());
  }
  updateStatus();
}

function updateStatus() {
  let text;
  if (performance.now() < flashUntil) text = flashMsg;
  else if (exporting) text = exportMsg;
  else text = done ? `Done · ${frames} frames` : paused ? 'Paused' : `Rendering · frame ${frames}`;
  if (statusEl.textContent !== text) statusEl.textContent = text;
}

function flash(msg) {
  flashMsg = msg;
  flashUntil = performance.now() + 2200;
}

function schedule() {
  dirty = true;
  writeHash();
}

// ---------- Export ----------

const exportSel = $('exportSize');
const saveBtn = $('save');

function exportScale(choice) {
  const { w, h, dpr } = size;
  let k = choice === 'print' ? 4096 / Math.max(w, h) : choice === 'x2' ? dpr * 2 : dpr;
  if (w * k * h * k > MAX_EXPORT_AREA) k = Math.sqrt(MAX_EXPORT_AREA / (w * h));
  return k;
}

function updateExportLabels() {
  for (const opt of exportSel.options) {
    const k = exportScale(opt.value);
    opt.text = `${EXPORT_SIZES[opt.value]} · ${Math.round(size.w * k)}×${Math.round(size.h * k)}`;
  }
}

const nextFrame = () => new Promise(r => requestAnimationFrame(r));

async function savePng() {
  if (exporting) return;
  exporting = true;
  saveBtn.disabled = true;
  try {
    const { w, h, dpr } = size;
    const k = exportScale(exportSel.value);
    const look = currentLook();
    const name = `${state.mode}-${state.palette.toLowerCase()}-${state.seed}.png`;
    let out = view;
    // Re-render offscreen unless the on-screen piece is already the requested size.
    if (k !== dpr || !done) {
      const job = startRender(w, h, k);
      let n = 0, t = performance.now();
      exportMsg = 'Exporting…';
      while (!job.runner.step()) {
        n++;
        if (performance.now() - t > 24) {
          exportMsg = `Exporting · frame ${n}`;
          await nextFrame();
          t = performance.now();
        }
      }
      out = document.createElement('canvas');
      out.width = job.canvas.width;
      out.height = job.canvas.height;
      compose(out, job.canvas, w, h, k, look);
    }
    const blob = await new Promise(r => out.toBlob(r, 'image/png'));
    if (!blob) throw new Error('toBlob failed');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flash(`Saved ${out.width}×${out.height} PNG`);
  } catch {
    flash('Export failed — try a smaller size');
  } finally {
    exporting = false;
    saveBtn.disabled = false;
  }
}

// ---------- Favorites ----------

const FAV_KEY = 'gp:favorites';
const favBox = $('favorites');

function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; }
}

function storeFavorites() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); return true; } catch { return false; }
}

let favorites = loadFavorites();

function addFavorite() {
  const t = document.createElement('canvas');
  const s = 200 / Math.max(view.width, view.height);
  t.width = Math.round(view.width * s);
  t.height = Math.round(view.height * s);
  t.getContext('2d').drawImage(view, 0, 0, t.width, t.height);
  favorites.unshift({ id: Date.now().toString(36), snap: snapshot(), thumb: t.toDataURL('image/jpeg', 0.8) });
  favorites = favorites.slice(0, 60);
  flash(storeFavorites() ? 'Saved to favorites' : 'Saved for this visit only (storage unavailable)');
  renderFavorites();
}

function renderFavorites() {
  favBox.innerHTML = '';
  if (!favorites.length) {
    favBox.innerHTML = '<p class="empty">Save a piece you like to keep it here.</p>';
    return;
  }
  for (const f of favorites) {
    const item = document.createElement('div');
    item.className = 'fav';
    const load = document.createElement('button');
    load.type = 'button';
    load.className = 'load';
    load.title = `${MODES[f.snap.m]?.name ?? f.snap.m} · ${f.snap.p} · seed ${f.snap.s}`;
    load.innerHTML = `<img alt="${load.title}" src="${f.thumb}">`;
    load.addEventListener('click', () => {
      applySnapshot(f.snap);
      syncControls();
      schedule();
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.title = 'Remove';
    del.textContent = '×';
    del.addEventListener('click', () => {
      favorites = favorites.filter(x => x.id !== f.id);
      storeFavorites();
      renderFavorites();
    });
    item.append(load, del);
    favBox.append(item);
  }
}

// ---------- UI ----------

const modeSel = $('mode'), paletteSel = $('palette'), aspectSel = $('aspect'), seedInput = $('seed');

const decimals = step => (String(step).split('.')[1] || '').length;

const LOCK_ICON = {
  on: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  off: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 5.8-1" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};

// Builds a labelled slider bound to values[q.key]. Pass a Set as `locks` to add a lock toggle.
function makeSlider(q, values, onChange, locks) {
  const label = document.createElement('label');
  label.className = 'field';
  label.innerHTML = `<span class="head"><span class="label">${q.label}</span><span class="right"><output></output></span></span>`;
  const out = label.querySelector('output');
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', min: q.min, max: q.max, step: q.step });
  input.value = values[q.key];
  out.textContent = Number(input.value).toFixed(decimals(q.step));
  input.addEventListener('input', () => {
    values[q.key] = Number(input.value);
    out.textContent = Number(input.value).toFixed(decimals(q.step));
    onChange();
  });

  if (locks) {
    const lock = document.createElement('button');
    lock.type = 'button';
    lock.className = 'lock';
    const paint = () => {
      const on = locks.has(q.key);
      lock.innerHTML = on ? LOCK_ICON.on : LOCK_ICON.off;
      lock.setAttribute('aria-pressed', on);
      lock.title = on ? 'Locked: Randomize keeps this value' : 'Lock this value during Randomize';
    };
    lock.addEventListener('click', e => {
      e.preventDefault();
      locks.has(q.key) ? locks.delete(q.key) : locks.add(q.key);
      paint();
    });
    paint();
    label.querySelector('.right').appendChild(lock);
  }

  label.appendChild(input);
  return label;
}

function buildParams() {
  const box = $('params');
  box.innerHTML = '';
  for (const q of MODES[state.mode].params) {
    box.appendChild(makeSlider(q, state.params[state.mode], schedule, state.locks[state.mode]));
  }
}

function buildPost() {
  const box = $('post');
  box.innerHTML = '';
  for (const q of POST_PARAMS) {
    box.appendChild(makeSlider(q, state.post, () => { needsCompose = true; writeHash(); }));
  }
}

function syncControls() {
  modeSel.value = state.mode;
  paletteSel.value = state.palette;
  aspectSel.value = state.aspect;
  seedInput.value = state.seed;
  $('swatches').innerHTML = PALETTES[state.palette].map(c => `<span style="background:${c}"></span>`).join('');
  buildParams();
  buildPost();
}

function newSeed() {
  state.seed = Math.floor(Math.random() * 1e6);
  seedInput.value = state.seed;
}

function randomize() {
  newSeed();
  const locks = state.locks[state.mode];
  for (const q of MODES[state.mode].params) {
    if (locks.has(q.key)) continue;
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

async function copyLink() {
  writeHash();
  try {
    await navigator.clipboard.writeText(location.href);
    flash('Link copied');
  } catch {
    // Fallback for browsers/frames that block the async clipboard API.
    const ta = document.createElement('textarea');
    ta.value = location.href;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    flash(ok ? 'Link copied' : 'Copy failed — use the address bar');
  }
}

let hintTimer;
function setPresenting(on) {
  if (presenting === on) return;
  presenting = on;
  document.body.classList.toggle('presenting', on);
  if (on) {
    document.documentElement.requestFullscreen?.().catch(() => {});
    $('hint').classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => $('hint').classList.remove('show'), 2500);
  } else if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  dirty = true;
}

for (const [k, m] of Object.entries(MODES)) modeSel.add(new Option(m.name, k));
for (const k of Object.keys(PALETTES)) paletteSel.add(new Option(k, k));
for (const [k, label] of Object.entries(ASPECTS)) aspectSel.add(new Option(label, k));
for (const k of Object.keys(EXPORT_SIZES)) exportSel.add(new Option(EXPORT_SIZES[k], k));

modeSel.addEventListener('change', () => { state.mode = modeSel.value; syncControls(); schedule(); });
paletteSel.addEventListener('change', () => { state.palette = paletteSel.value; syncControls(); schedule(); });
aspectSel.addEventListener('change', () => { state.aspect = aspectSel.value; schedule(); });
seedInput.addEventListener('change', () => { state.seed = Math.floor(Number(seedInput.value) || 0); schedule(); });
$('reseed').addEventListener('click', () => { newSeed(); schedule(); });
$('randomize').addEventListener('click', randomize);
$('pause').addEventListener('click', togglePause);
$('share').addEventListener('click', copyLink);
$('present').addEventListener('click', () => setPresenting(true));
$('favorite').addEventListener('click', addFavorite);
saveBtn.addEventListener('click', savePng);

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) setPresenting(false);
});

window.addEventListener('keydown', e => {
  if (e.target.matches('input[type="number"], select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'r') randomize();
  else if (key === 's') savePng();
  else if (key === 'f') setPresenting(!presenting);
  else if (key === 'escape') setPresenting(false);
  else if (key === ' ') { e.preventDefault(); togglePause(); }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { dirty = true; }, 150);
});

readHash();
syncControls();
renderFavorites();
writeHash();
loop();
