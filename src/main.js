import { MODES } from './modes/index.js';
import { PALETTES } from './palettes.js';
import { startRender, compose } from './render.js';
import {
  ASPECTS, POST_PARAMS, state, snapshot, applySnapshot, readHash, writeHash, currentSpec, currentLook,
} from './state.js';

// App shell: render loop, controls, export, video and favorites.

const $ = id => document.getElementById(id);
const view = $('canvas');
const stage = $('stage');
const statusEl = $('status');

let render = null, size = { w: 1, h: 1, dpr: 1 };
let done = false, paused = false, dirty = true, needsCompose = false, frames = 0;
let presenting = false, exporting = false, exportMsg = '';
let flashMsg = '', flashUntil = 0;
let tick = 0;

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
  if (recorder && (w !== size.w || h !== size.h)) stopRecording();
  view.style.width = w + 'px';
  view.style.height = h + 'px';
  view.width = Math.round(w * dpr);
  view.height = Math.round(h * dpr);
  view.classList.toggle('framed', state.aspect !== 'fill');
  size = { w, h, dpr };
  render = startRender(w, h, dpr, currentSpec());
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
  if (recordPending) {
    recordPending = false;
    beginRecording();
  }
  if (!paused && !done && ++tick % (MODES[state.mode].pace || 1) === 0) {
    done = render.runner.step();
    frames++;
    needsCompose = true;
  }
  if (recorder) {
    // Repaint every frame so the stream keeps producing frames; hold the finished piece briefly.
    needsCompose = true;
    if (done && --recordHold <= 0) stopRecording();
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
  else if (recorder) text = `● Recording · ${((performance.now() - recordStart) / 1000).toFixed(1)}s`;
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

const EXPORT_SIZES = { screen: 'Screen', x2: '2×', print: 'Print' };
const MAX_EXPORT_AREA = 4096 * 4096; // Safari's canvas area limit

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

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

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
      const job = startRender(w, h, k, currentSpec());
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
    download(blob, name);
    flash(`Saved ${out.width}×${out.height} PNG`);
  } catch {
    flash('Export failed — try a smaller size');
  } finally {
    exporting = false;
    saveBtn.disabled = false;
  }
}

// ---------- Video ----------
// Records the visible canvas from frame 0 until the piece finishes (plus a short hold).

const recordBtn = $('record');
const RECORD_HOLD_FRAMES = 90;
let recorder = null, recordPending = false, recordHold = 0, recordStart = 0;

function pickVideoType() {
  if (!window.MediaRecorder || !view.captureStream) return null;
  return ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find(t => MediaRecorder.isTypeSupported(t)) ?? null;
}

function toggleRecording() {
  if (recorder) stopRecording();
  else if (!recordPending) startRecording();
}

function startRecording() {
  if (!pickVideoType()) {
    flash('Video recording isn’t supported in this browser');
    return;
  }
  if (paused) togglePause();
  dirty = true; // restart the piece, then begin recording on the next loop tick
  recordPending = true;
}

function beginRecording() {
  const type = pickVideoType();
  const stream = view.captureStream(60);
  const chunks = [];
  const name = `${state.mode}-${state.palette.toLowerCase()}-${state.seed}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
  recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12e6 });
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    download(new Blob(chunks, { type: type.split(';')[0] }), name);
    flash('Saved video');
  };
  recorder.start();
  recordHold = RECORD_HOLD_FRAMES;
  recordStart = performance.now();
  paintRecordButton();
}

function stopRecording() {
  if (!recorder) return;
  const r = recorder;
  recorder = null;
  r.stop();
  paintRecordButton();
}

function paintRecordButton() {
  recordBtn.classList.toggle('recording', !!recorder);
  recordBtn.innerHTML = `${recorder ? 'Stop recording' : 'Record video'} <kbd>V</kbd>`;
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
  const fmt = v => q.labels ? q.labels[v] : Number(v).toFixed(decimals(q.step));
  out.textContent = fmt(input.value);
  input.addEventListener('input', () => {
    values[q.key] = Number(input.value);
    out.textContent = fmt(input.value);
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
recordBtn.addEventListener('click', toggleRecording);

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) setPresenting(false);
});

window.addEventListener('keydown', e => {
  if (e.target.matches('input[type="number"], select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'r') randomize();
  else if (key === 's') savePng();
  else if (key === 'f') setPresenting(!presenting);
  else if (key === 'v') toggleRecording();
  else if (key === 'escape') setPresenting(false);
  else if (key === ' ') { e.preventDefault(); togglePause(); }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { dirty = true; }, 150);
});

// Test hook: tests/index.html renders cases through this.
window.__playground = { MODES, PALETTES, startRender, compose };

readHash();
syncControls();
renderFavorites();
writeHash();
loop();
