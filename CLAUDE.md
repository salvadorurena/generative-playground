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
- `style.css` — dark UI; colors in `:root` variables; stacks vertically under 760px.
- `app.js` — everything else, in sections:
  - **Randomness**: `mulberry32` seeded RNG and `makeNoise` (seeded 2D Perlin, ~[-1, 1]).
  - **Palettes**: `PALETTES` — first color is the background, the rest are inks.
  - **Modes**: `MODES` — Flow Field, Clifford Attractor, Fractal Bloom.
  - **State**: `state` plus `readHash`/`writeHash` (URL hash holds mode, palette, seed, params).
  - **Rendering**: `restart()` sizes the canvas for DPR and calls the mode's `create`; `loop()` steps it each animation frame.
  - **UI**: controls are generated from each mode's param schema.

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

Sliders, randomize, URL sharing and export all work automatically from the schema.

## Conventions

- **Determinism**: all randomness inside a mode must come from `env.rng` / `env.noise` so a seed + params always reproduces the same image. `Math.random()` is only for picking new seeds and randomizing sliders.
- **Performance**: batch drawing — build one `Path2D` per color and stroke/fill once per frame rather than per shape. Cap work per frame and return `true` from `step()` when done so the loop idles.
- **Keep params sane under Randomize**: any slider combination should produce something on-canvas without freezing the tab (e.g. Bloom auto-fits its size and caps segment count).
- Match the existing style: 2-space indent, single quotes, semicolons, terse comments only where the math isn't obvious.
- No external libraries or build tooling unless there's a strong reason.

## Keyboard shortcuts

`R` randomize · `S` save PNG · `Space` pause/resume
