'use strict';

// Renders every case through the app's own startRender/compose (via the
// window.__playground hook) and checks three things:
//   1. Matches baseline — same pixels as tests/baseline.json (exact hash, or a
//      near-identical thumbnail if another browser/GPU antialiases differently).
//   2. Deterministic — rendering twice gives the same pixels.
//   3. Resolution independent — a 2× render matches 1× once both are averaged
//      down to a thumbnail.
//   4. SVG matches canvas — for vector modes, the exported SVG decodes as an
//      image (valid file) and, redrawn element by element on a GPU canvas like
//      the app's, matches the canvas render. (Comparing against the browser's
//      SVG rasterizer instead would mostly measure antialiasing differences:
//      it leaves seams between abutting shapes that GPU canvas doesn't.)
// Thumbnails use an exact area average rather than drawImage scaling, which
// samples instead of averaging for large reductions and varies by browser.

const W = 320, H = 200;
const THUMB_W = 80, THUMB_H = 50; // W and H must be integer multiples of these
const CLOSE = 0.75;    // mean per-channel thumbnail diff (0–255) still counted as a baseline match
const DET_TOL = 0.5;   // full-res mean diff tolerated between two runs (GPU raster jitter)
const RES_TOL = 5;     // thumbnail diff allowed between 1× and 2× (thin-line antialiasing)
const SVG_TOL = 0.5;   // thumbnail diff allowed between replayed SVG and canvas

const NO_POST = { grain: 0, vignette: 0, glow: 0 };

// Params not listed use the mode's defaults. Finish effects are off unless `post` is given.
const CASES = [
  { name: 'flow', mode: 'flow', palette: 'Ember', seed: 1 },
  { name: 'flow-ink-curly', mode: 'flow', palette: 'Ink', seed: 2, params: { curl: 3, width: 2 } },
  { name: 'attractor', mode: 'attractor', palette: 'Neon', seed: 1 },
  { name: 'attractor-alt', mode: 'attractor', palette: 'Moss', seed: 3, params: { a: 1.7, b: 1.7, c: 0.06, d: 1.2 } },
  { name: 'bloom', mode: 'bloom', palette: 'Lagoon', seed: 1 },
  { name: 'bloom-tree', mode: 'bloom', palette: 'Dusk', seed: 4, params: { symmetry: 1, branches: 3, depth: 7 } },
  { name: 'circles', mode: 'circles', palette: 'Ember', seed: 1 },
  { name: 'circles-rings', mode: 'circles', palette: 'Ink', seed: 5, params: { style: 1 } },
  { name: 'voronoi', mode: 'voronoi', palette: 'Dusk', seed: 1 },
  { name: 'voronoi-ordered', mode: 'voronoi', palette: 'Neon', seed: 6, params: { order: 1, lead: 0 } },
  { name: 'truchet', mode: 'truchet', palette: 'Lagoon', seed: 1 },
  { name: 'truchet-triangles', mode: 'truchet', palette: 'Moss', seed: 7, params: { style: 3 } },
  { name: 'diffusion', mode: 'diffusion', palette: 'Neon', seed: 1 },
  { name: 'diffusion-maze', mode: 'diffusion', palette: 'Ember', seed: 8, params: { pattern: 2 } },
  { name: 'finish-dark', mode: 'flow', palette: 'Ember', seed: 1, post: { grain: 0.5, vignette: 0.6, glow: 0.7 } },
  { name: 'finish-light', mode: 'bloom', palette: 'Ink', seed: 2, post: { grain: 0.3, vignette: 0.4, glow: 0.6 } },
];

const $ = id => document.getElementById(id);
const nextFrame = () => new Promise(r => requestAnimationFrame(r));

function loadApp() {
  return new Promise((resolve, reject) => {
    const frame = $('app');
    frame.addEventListener('load', () => {
      const pg = frame.contentWindow.__playground;
      pg ? resolve(pg) : reject(new Error('App loaded but window.__playground is missing'));
    }, { once: true });
    frame.src = '../index.html';
  });
}

async function loadBaseline() {
  try {
    const res = await fetch('baseline.json', { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function render(pg, c, k) {
  const defaults = Object.fromEntries(pg.MODES[c.mode].params.map(q => [q.key, q.value]));
  const spec = { mode: c.mode, palette: c.palette, seed: c.seed, params: { ...defaults, ...c.params } };
  const job = pg.startRender(W, H, k, spec);
  for (let n = 0; !job.runner.step() && n < 5000; n++);
  const out = document.createElement('canvas');
  out.width = job.canvas.width;
  out.height = job.canvas.height;
  out.getContext('2d', { willReadFrequently: true }); // CPU-backed: bit-stable readback
  pg.compose(out, job.canvas, W, H, k, { post: { ...NO_POST, ...c.post }, bg: pg.PALETTES[c.palette][0], seed: c.seed });
  return out;
}

// Exported SVG for a case. Throws if the browser can't decode it as an image.
async function renderSvg(pg, c) {
  const defaults = Object.fromEntries(pg.MODES[c.mode].params.map(q => [q.key, q.value]));
  const job = pg.startSvgRender(W, H, { mode: c.mode, palette: c.palette, seed: c.seed, params: { ...defaults, ...c.params } });
  for (let n = 0; !job.runner.step() && n < 5000; n++);
  const text = job.svg.toString();
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    await imageFrom(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  return text;
}

// Draws the SVG's <rect>/<path> elements onto a GPU canvas with the same
// attributes, so path data and styling are checked without rasterizer noise.
function replaySvg(text) {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  for (const m of text.matchAll(/<(rect|path) ([^>]*)\/>/g)) {
    const a = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(v => [v[1], v[2]]));
    ctx.globalAlpha = Number(a.opacity ?? 1);
    if (m[1] === 'rect') {
      ctx.fillStyle = a.fill;
      ctx.fillRect(+a.x, +a.y, +a.width, +a.height);
      continue;
    }
    const path = new Path2D(a.d);
    if (a.fill !== 'none') {
      ctx.fillStyle = a.fill;
      ctx.fill(path);
    }
    if (a.stroke) {
      ctx.strokeStyle = a.stroke;
      ctx.lineWidth = Number(a['stroke-width'] ?? 1);
      ctx.lineCap = a['stroke-linecap'] ?? 'butt';
      ctx.lineJoin = a['stroke-linejoin'] ?? 'miter';
      ctx.miterLimit = Number(a['stroke-miterlimit'] ?? 4);
      ctx.stroke(path);
    }
  }
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  out.getContext('2d', { willReadFrequently: true }).drawImage(cv, 0, 0);
  return out;
}

function pixels(canvas) {
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
}

// FNV-1a over the RGBA bytes.
function hash(canvas) {
  const d = pixels(canvas);
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i++) {
    h ^= d[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Area-average a canvas down to THUMB_W × THUMB_H (exact for integer factors).
function thumb(source) {
  const f = source.width / THUMB_W;
  const d = pixels(source);
  const sum = new Float32Array(THUMB_W * THUMB_H * 3);
  for (let y = 0; y < source.height; y++) {
    const row = Math.floor(y / f) * THUMB_W;
    for (let x = 0; x < source.width; x++) {
      const i = (y * source.width + x) * 4, o = (row + Math.floor(x / f)) * 3;
      sum[o] += d[i]; sum[o + 1] += d[i + 1]; sum[o + 2] += d[i + 2];
    }
  }
  const t = document.createElement('canvas');
  t.width = THUMB_W;
  t.height = THUMB_H;
  const ctx = t.getContext('2d');
  const img = ctx.createImageData(THUMB_W, THUMB_H);
  for (let i = 0, j = 0; i < sum.length; i += 3, j += 4) {
    img.data[j] = sum[i] / (f * f);
    img.data[j + 1] = sum[i + 1] / (f * f);
    img.data[j + 2] = sum[i + 2] / (f * f);
    img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return t;
}

// Draw a decoded baseline image onto a canvas at thumbnail size (it already is one).
function canvasFrom(img) {
  const c = document.createElement('canvas');
  c.width = THUMB_W;
  c.height = THUMB_H;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

function diff(a, b) {
  const da = pixels(a), db = pixels(b);
  let sum = 0;
  for (let i = 0; i < da.length; i += 4) {
    sum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
  }
  return sum / (da.length / 4 * 3);
}

function imageFrom(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// 0 when a re-render is bit-identical. Chrome can move canvases between GPU and
// CPU raster mid-run, which shifts antialiasing slightly, so a mismatch gets one
// retry; real nondeterminism (e.g. Math.random in a mode) fails both.
function determinism(pg, c, a, h) {
  const b = render(pg, c, 1);
  if (hash(b) === h) return 0;
  const retry = render(pg, c, 1);
  const hr = hash(retry);
  if (hr === h || hr === hash(b)) return 0;
  return Math.min(diff(a, b), diff(a, retry));
}

function chip(kind, text) {
  return `<span class="chip ${kind}">${text}</span>`;
}

let results = [];

async function run() {
  $('run').disabled = $('update').disabled = true;
  const rows = $('rows');
  rows.innerHTML = '';
  results = [];
  const summary = $('summary');
  summary.className = '';

  const [pg, baseline] = await Promise.all([loadApp(), loadBaseline()]);
  const expected = baseline?.cases ?? {};

  for (const [i, c] of CASES.entries()) {
    summary.textContent = `Running ${i + 1}/${CASES.length}: ${c.name}…`;
    await nextFrame();

    const a = render(pg, c, 1);
    const h = hash(a);
    const t = thumb(a);
    const r = {
      name: c.name,
      hash: h,
      thumb: t.toDataURL('image/png'),
      detDiff: determinism(pg, c, a, h),
      resDiff: diff(t, thumb(render(pg, c, 2))),
      // Finish effects are raster-only, so only plain cases can be compared with SVG.
      svgDiff: pg.MODES[c.mode].vector && !c.post ? diff(t, thumb(replaySvg(await renderSvg(pg, c)))) : null,
    };

    const ref = expected[c.name];
    let refThumb = null;
    if (!ref) {
      r.baseline = 'missing';
    } else if (ref.hash === h) {
      r.baseline = 'exact';
    } else {
      refThumb = canvasFrom(await imageFrom(ref.thumb));
      r.baseDiff = diff(t, refThumb);
      r.baseline = r.baseDiff <= CLOSE ? 'close' : 'fail';
    }
    r.ok = r.baseline !== 'fail' && r.detDiff <= DET_TOL && r.resDiff <= RES_TOL && (r.svgDiff ?? 0) <= SVG_TOL;
    results.push(r);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="name">${c.name}</td>
      <td>${ref ? `<img alt="baseline" src="${ref.thumb}">` : '<span class="none">none</span>'}</td>
      <td></td>
      <td>${{
        exact: chip('pass', 'exact'),
        close: chip('warn', `close · Δ${r.baseDiff?.toFixed(2)}`),
        fail: chip('fail', `changed · Δ${r.baseDiff?.toFixed(2)}`),
        missing: chip('warn', 'no baseline'),
      }[r.baseline]}</td>
      <td>${r.detDiff === 0 ? chip('pass', 'yes') : chip(r.detDiff <= DET_TOL ? 'warn' : 'fail', `${r.detDiff <= DET_TOL ? '≈' : 'no'} · Δ${r.detDiff.toFixed(2)}`)}</td>
      <td>${r.resDiff <= RES_TOL ? chip('pass', `Δ${r.resDiff.toFixed(2)}`) : chip('fail', `Δ${r.resDiff.toFixed(2)}`)}</td>
      <td>${r.svgDiff === null ? '<span class="none">—</span>' : chip(r.svgDiff <= SVG_TOL ? 'pass' : 'fail', `Δ${r.svgDiff.toFixed(2)}`)}</td>`;
    const shown = document.createElement('canvas');
    shown.width = W;
    shown.height = H;
    shown.getContext('2d').drawImage(a, 0, 0, W, H);
    tr.children[2].appendChild(shown);
    rows.appendChild(tr);
  }

  const failed = results.filter(r => !r.ok).length;
  const missing = results.filter(r => r.baseline === 'missing').length;
  summary.className = failed ? 'fail' : 'pass';
  summary.textContent = failed
    ? `${failed} of ${results.length} cases failed.`
    : `All ${results.length} cases passed${missing ? ` (${missing} have no baseline yet — click Update baseline)` : ''}.`;
  document.title = `${failed ? '✗' : '✓'} Playground Tests`;
  window.testResults = { passed: results.length - failed, failed, missing, cases: results.map(({ thumb, ...r }) => r) };
  $('run').disabled = $('update').disabled = false;
}

// One case per line so baseline diffs stay readable in git.
function baselineJson() {
  const lines = results.map(r => `    ${JSON.stringify(r.name)}: ${JSON.stringify({ hash: r.hash, thumb: r.thumb })}`);
  return `{\n  "version": 1,\n  "size": [${W}, ${H}],\n  "cases": {\n${lines.join(',\n')}\n  }\n}\n`;
}

async function updateBaseline() {
  const json = baselineJson();
  try {
    const res = await fetch('baseline.json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json });
    if (!res.ok) throw new Error(res.status);
  } catch {
    // Static hosting can't save files: hand the baseline over as a download instead.
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'baseline.json';
    a.click();
    $('summary').textContent = 'This server can’t save files — downloaded baseline.json instead. Move it into tests/.';
    return;
  }
  await run();
}

$('run').addEventListener('click', run);
$('update').addEventListener('click', updateBaseline);
run().catch(err => {
  $('summary').className = 'fail';
  $('summary').textContent = `Error: ${err.message}`;
});
