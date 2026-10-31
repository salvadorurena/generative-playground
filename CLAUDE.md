# Generative Playground

A browser-based generative art toy: pick a mode, tweak sliders, export PNG/SVG/video. Plain HTML/CSS/JS — no build step, no dependencies, no framework. User-facing docs are in README.md.

## Running

```bash
python3 tests/server.py
```

Then open http://localhost:5173. This is a plain static server plus one endpoint that lets the test page save its baseline (localhost only). `python3 -m http.server 5173` also works if you don't need to update baselines. `.claude/launch.json` runs the same server for the Claude desktop preview pane (`playground`).

## Testing

Open http://localhost:5173/tests/ — it runs automatically. Every case in `CASES` (`tests/run.js`) renders through the app's own `startRender`/`compose` (exposed as `window.__playground`) at 320×200 and checks:

1. **Matches baseline** — exact pixel hash from `tests/baseline.json`, or a thumbnail within `CLOSE` (other browsers/GPUs antialias slightly differently).
2. **Deterministic** — a re-render is bit-identical (one retry, since Chrome can switch a canvas between GPU and CPU raster mid-run).
3. **Resolution independent** — 1× and 2× renders match once area-averaged to a thumbnail.
4. **SVG vs canvas** (vector modes, cases without finish effects) — the SVG must decode as an image, and its elements replayed onto a GPU canvas must match the canvas render. Don't compare against the browser's own SVG rasterization: its antialiasing leaves seams between abutting shapes, which hides real bugs in noise.

Run it before and after any refactor. If a change is *meant* to alter output (new default, palette tweak), check the "Now" column looks right, then click **Update baseline** (needs `tests/server.py`) and commit `tests/baseline.json` with the change. When adding a mode, add at least a default case plus one variant. `window.testResults` holds the summary for scripted checks.

## Files

Native ES modules, loaded from `index.html` via `<script type="module" src="src/main.js">`. They need an HTTP server — opening `index.html` as a `file://` URL won't work.

- `index.html` — layout: control panel (`#panel`) and canvas stage (`#stage`).
- `style.css` — dark UI; colors in `:root` variables; stacks vertically under 760px; `body.presenting` hides the panel.
- `src/modes/` — one file per mode (`export default { name, params, create }`); `index.js` registers them in `MODES` (its order is the menu order). Modes are self-contained: they import nothing but `TAU` and get everything else through `create(env)`.
- `src/random.js` — `mulberry32` seeded RNG and `makeNoise` (seeded 2D Perlin, ~[-1, 1]).
- `src/palettes.js` — `PALETTES`: first color is the background, the rest are inks.
- `src/render.js` — pure rendering, no UI or app state. `startRender(w, h, k, spec)` draws a mode onto an offscreen *art* canvas at pixel scale `k`; `startSvgRender(w, h, spec)` runs the same mode against an SVG recorder; `compose()` copies art to a target and layers finish effects (grain/vignette/glow) on top.
- `src/svg.js` — `SvgContext`/`SvgPath`: the subset of the canvas 2D API vector modes use (`fill`, `stroke`, `fillRect`, styles, `globalAlpha`; paths: `moveTo`, `lineTo`, `arc`, `rect`, `closePath`, `addPath`). Full circles are written as four quarter arcs — half-circle arcs with rounded endpoints get silently enlarged by SVG.
- `src/state.js` — `state`, `ASPECTS`, `POST_PARAMS`; `snapshot()`/`applySnapshot()` (the serializable description of a piece, shared by the URL hash and favorites); `currentSpec()`/`currentLook()` turn state into `startRender`/`compose` arguments. Slider locks (`state.locks`) are session-only.
- `src/main.js` — the app shell, in sections:
  - **Render loop**: `restart()` sizes the canvas and starts a render; `loop()` steps it (respecting `pace`) and recomposes when needed.
  - **Export**: `savePng()` re-renders offscreen at the chosen scale (same seed → same image), composes, downloads. Capped at 4096² px area (Safari limit). `saveSvg()` for modes with `vector: true` (finish effects not included). Both step via `runToEnd()`, which reports progress.
  - **Video**: `toggleRecording()` restarts the piece and records the visible canvas (`captureStream` + `MediaRecorder`, MP4 if supported else WebM) until it finishes, plus a short hold.
  - **Favorites**: stored in `localStorage` (`gp:favorites`) as snapshot + JPEG thumbnail, max 60.
  - **UI**: `makeSlider()` builds sliders from schemas (optional lock toggle, value `labels`, `help` tooltip); progress bar from the runner's `progress()`; `?` shortcut dialog (`#help`); keyboard shortcuts; present mode.
  - Sets `window.__playground` (`MODES`, `PALETTES`, `startRender`, `compose`) for the test page.
- `tests/` — visual regression page (`index.html`, `run.js`), its `baseline.json`, and the dev `server.py`.

## Adding a mode

Create `src/modes/myMode.js` and add it to `src/modes/index.js`:

```js
export default {
  name: 'Display Name',
  description: 'One sentence shown under the Mode menu.',
  vector: true, // optional: only paths/fills/strokes (no drawImage, no per-pixel work, sane element count) → SVG export
  pace: 1, // optional: preview/recording calls step() every `pace` frames (for modes with few frames)
  params: [{ key, label, min, max, step, value, help, labels? }, ...], // help: tooltip text; labels: names for integer values 0..max
  create({ ctx, w, h, rng, noise, bg, inks, p, path }) {
    // set up; draw in CSS pixels (w × h), canvas is already cleared to bg
    // create paths with path(), never `new Path2D()` — SVG export swaps in its own path type
    return {
      progress: () => fraction, // optional 0–1, drives the progress bar
      step() { /* draw one frame */ return finished; },
    };
  },
};
```

Sliders, locks, randomize, URL sharing, favorites and export all work automatically from the schema. Then add cases for it in `tests/run.js` and update the baseline.

## Conventions

- **Determinism**: all randomness inside a mode must come from `env.rng` / `env.noise` so a seed + params always reproduces the same image. `Math.random()` is only for picking new seeds and randomizing sliders.
- **Performance**: batch drawing — build one `Path2D` per color and stroke/fill once per frame rather than per shape. Cap work per frame and return `true` from `step()` when done so the loop idles.
- **Resolution independence**: modes run at any pixel scale — draw only in CSS-pixel units (`w`, `h`); never read `canvas.width` inside a mode. Export relies on this.
- **Paths come from `env.path()`**, and modes only use the canvas calls `SvgContext` implements, so vector modes stay exportable. Don't name a local variable `path` — it shadows the factory.
- **Finish effects belong in `compose()`**, never in a mode — they must not accumulate across frames, and changing them recomposes without re-rendering.
- **Keep params sane under Randomize**: any slider combination should produce something on-canvas without freezing the tab (e.g. Bloom auto-fits its size and caps segment count). Keep every `step()` under ~40ms even at max settings.
- **Sizes relative to the canvas**: express lengths as a fraction of `Math.min(w, h)` (or tiles/cells across) so a piece looks the same at every window size.
- **Noise for color regions**: Perlin output clusters near 0 — stretch it before bucketing into palette colors or only the middle ink shows up.
- **Grid-based modes** (Reaction–Diffusion) simulate on a small canvas sized from `w/h` and `drawImage` it scaled up; detail doesn't increase on high-res export, it's smoothed.
- Match the existing style: 2-space indent, single quotes, semicolons, terse comments only where the math isn't obvious.
- No external libraries or build tooling unless there's a strong reason.

## Keyboard shortcuts

`R` randomize · `S` save PNG · `V` record/stop video · `F` present (fullscreen) · `Esc` exit present · `Space` pause/resume · `?` shortcut list
