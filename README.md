# Generative Playground

A browser toy for making generative art. Pick a mode, tweak the sliders, and export what you like as a print-quality PNG, an SVG, or a video of it being drawn.

**Try it:** https://salvadorurena.github.io/generative-playground/

Plain HTML, CSS and JavaScript (ES modules). No build step, no dependencies.

## Modes

| Mode | What it does | SVG |
|---|---|:-:|
| Flow Field | Particles drift through a noise field, leaving ink trails. | |
| Clifford Attractor | Millions of points from a chaotic equation build up a figure. | |
| Fractal Bloom | Branches split recursively and repeat around the center. | ✓ |
| Circle Packing | Circles grow into the gaps until they touch. | ✓ |
| Voronoi Mosaic | Stained glass: each cell is the area closest to one seed point. | ✓ |
| Truchet Tiles | Simple rotated tiles that join into mazes and weaves. | ✓ |
| Reaction–Diffusion | Two simulated chemicals react and spread into organic patterns. | |

Every slider has a **?** with a short explanation.

## Features

- **Seeded and shareable.** The same seed and settings always produce the same image. The URL holds the whole piece, so **Copy link** shares exactly what you see.
- **Six palettes** and canvas shapes from full-window to square, portrait, story and widescreen.
- **Finish effects:** grain, vignette and glow, applied on top without re-rendering.
- **Randomize with locks.** Lock the sliders you like and randomize the rest.
- **Favorites.** Save pieces with thumbnails (stored in your browser) and restore them with one click.
- **Export:**
  - **PNG** at screen size, 2×, or 4096 px on the long side for printing. High-res exports are re-rendered, not upscaled.
  - **SVG** for the shape-based modes, for Illustrator, Figma, Inkscape or a pen plotter. Finish effects are pixel-only and not included.
  - **Video** of the piece being drawn: MP4 where the browser supports it, otherwise WebM.
- **Present mode.** Fullscreen with the panel hidden.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `R` | Randomize (locked sliders stay put) |
| `Space` | Pause / resume |
| `S` | Save PNG |
| `V` | Record / stop video |
| `F` | Present fullscreen |
| `Esc` | Leave present mode |
| `?` | Show all shortcuts |

## Running locally

The app uses ES modules, so it has to be served over HTTP; opening `index.html` as a file won't work.

```bash
python3 tests/server.py
```

Then open http://localhost:5173. Any static server works, for example `python3 -m http.server 5173`. `tests/server.py` additionally lets the test page save a new baseline.

## Tests

Open http://localhost:5173/tests/ (or the [live test page](https://salvadorurena.github.io/generative-playground/tests/)). It renders every mode with fixed seeds and checks that:

1. the output matches the saved baseline (`tests/baseline.json`),
2. rendering is deterministic,
3. a 2× render matches 1× (resolution independence, which high-res export relies on), and
4. for vector modes, the exported SVG is valid and draws the same image as the canvas.

If you change something on purpose that alters the output, check the new images and click **Update baseline**.

## Project structure

```
index.html, style.css     page and styles
src/main.js               app shell: render loop, controls, export, video, favorites
src/render.js             startRender / startSvgRender / compose (no UI code)
src/svg.js                records a mode's drawing as SVG
src/state.js              app state, URL hash, finish and aspect options
src/random.js             seeded RNG and Perlin noise
src/palettes.js           color palettes
src/modes/                one file per mode, registered in modes/index.js
tests/                    visual regression page, baseline, dev server
```

## Adding a mode

Create `src/modes/yourMode.js` exporting `{ name, description, params, create }` and add it to `src/modes/index.js`. Sliders, tooltips, randomize, sharing, favorites and export all work from the `params` schema. Then add test cases in `tests/run.js` and update the baseline. [CLAUDE.md](CLAUDE.md) has the full contract and the rules modes must follow, such as determinism and resolution independence.

## Browser support

Developed and tested in Chrome. It only uses standard APIs (canvas 2D, ES modules, `MediaRecorder`), so recent Edge, Safari and Firefox should work too. Video is saved as MP4 where the browser can record it, otherwise WebM. High-res PNG exports are capped at 16.7 megapixels to stay within Safari's canvas limit.
