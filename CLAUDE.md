# Generative Playground

A browser-based generative art toy: pick a mode, tweak sliders, export PNGs. Plain HTML/CSS/JS — no build step, no dependencies, no framework.

## Running

Serve the folder statically:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. `.claude/launch.json` has the same config for the Claude desktop preview pane (`playground`).

## Files

- `index.html` — layout: control panel (`#panel`) and canvas stage (`#stage`).
- `style.css` — dark UI; colors in `:root` variables; stacks vertically under 760px; `body.presenting` hides the panel.
- `app.js` — everything else, in sections:
  - **Randomness**: `mulberry32` seeded RNG and `makeNoise` (seeded 2D Perlin, ~[-1, 1]).
  - **Palettes**: `PALETTES` — first color is the background, the rest are inks.
  - **Modes**: `MODES` — Flow Field, Clifford Attractor, Fractal Bloom.
  - **Canvas & finish options**: `ASPECTS`, `POST_PARAMS` (grain/vignette/glow), `EXPORT_SIZES`.
  - **State**: `state`, plus `snapshot()`/`applySnapshot()` — the serializable description of a piece, shared by the URL hash and favorites. Slider locks (`state.locks`) are session-only.
  - **Rendering**: `startRender(w, h, k)` draws a mode onto an offscreen *art* canvas at pixel scale `k`; `compose()` copies art to a target and layers finish effects on top. `loop()` steps the preview and recomposes when needed.
  - **Export**: `savePng()` re-renders offscreen at the chosen scale (same seed → same image), composes, downloads. Capped at 4096² px area (Safari limit).
  - **Favorites**: stored in `localStorage` (`gp:favorites`) as snapshot + JPEG thumbnail, max 60.
  - **UI**: `makeSlider()` builds sliders from schemas (with optional lock toggle).

## Adding a mode

Add an entry to `MODES`:

```js
myMode: {
  name: 'Display Name',
  params: [{ key, label, min, max, step, value }, ...],
  create({ ctx, w, h, rng, noise, bg, inks, p }) {
    // set up; draw in CSS pixels (w × h), canvas is already cleared to bg
    return { step() { /* draw one frame */ return finished; } };
  },
}
```

Sliders, locks, randomize, URL sharing, favorites and export all work automatically from the schema.

## Conventions

- **Determinism**: all randomness inside a mode must come from `env.rng` / `env.noise` so a seed + params always reproduces the same image. `Math.random()` is only for picking new seeds and randomizing sliders.
- **Performance**: batch drawing — build one `Path2D` per color and stroke/fill once per frame rather than per shape. Cap work per frame and return `true` from `step()` when done so the loop idles.
- **Resolution independence**: modes run at any pixel scale — draw only in CSS-pixel units (`w`, `h`); never read `canvas.width` inside a mode. Export relies on this.
- **Finish effects belong in `compose()`**, never in a mode — they must not accumulate across frames, and changing them recomposes without re-rendering.
- **Keep params sane under Randomize**: any slider combination should produce something on-canvas without freezing the tab (e.g. Bloom auto-fits its size and caps segment count).
- Match the existing style: 2-space indent, single quotes, semicolons, terse comments only where the math isn't obvious.
- No external libraries or build tooling unless there's a strong reason.

## Keyboard shortcuts

`R` randomize · `S` save PNG · `F` present (fullscreen) · `Esc` exit present · `Space` pause/resume
