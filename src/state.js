import { MODES } from './modes/index.js';
import { PALETTES } from './palettes.js';

export const ASPECTS = {
  fill: 'Fill window',
  '1:1': 'Square 1:1',
  '4:5': 'Portrait 4:5',
  '9:16': 'Story 9:16',
  '3:2': 'Landscape 3:2',
  '16:9': 'Wide 16:9',
};

export const POST_PARAMS = [
  { key: 'grain', label: 'Grain', min: 0, max: 1, step: 0.01, value: 0.2, help: 'Film-grain noise over the whole image.' },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, value: 0.3, help: 'Darkens the edges to pull the eye inward.' },
  { key: 'glow', label: 'Glow', min: 0, max: 1, step: 0.01, value: 0, help: 'Soft halo around bright areas. On light palettes it adds a soft shadow instead.' },
];

export const state = {
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
export function snapshot() {
  return {
    m: state.mode, p: state.palette, s: state.seed, a: state.aspect,
    v: { ...state.params[state.mode] }, x: { ...state.post },
  };
}

export function applySnapshot(h) {
  if (MODES[h.m]) state.mode = h.m;
  if (PALETTES[h.p]) state.palette = h.p;
  if (Number.isFinite(h.s)) state.seed = h.s;
  if (ASPECTS[h.a]) state.aspect = h.a;
  if (h.v) Object.assign(state.params[state.mode], h.v);
  if (h.x) Object.assign(state.post, h.x);
}

export function readHash() {
  try {
    applySnapshot(JSON.parse(decodeURIComponent(location.hash.slice(1))));
  } catch { /* no or bad hash */ }
}

export function writeHash() {
  history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify(snapshot())));
}

export function currentSpec() {
  return { mode: state.mode, palette: state.palette, seed: state.seed, params: { ...state.params[state.mode] } };
}

export function currentLook() {
  return { post: { ...state.post }, bg: PALETTES[state.palette][0], seed: state.seed };
}
