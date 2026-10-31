import { MODES } from './modes/index.js';
import { PALETTES } from './palettes.js';
import { mulberry32, makeNoise } from './random.js';

// Rendering: no UI or app state in here, so tests and export can drive it directly.
// Modes draw onto an offscreen "art" canvas; compose() copies it to the
// target and layers the finish effects on top, so effects never accumulate.

// spec: { mode, palette, seed, params } — see currentSpec() in state.js.
export function startRender(w, h, k, spec) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);

  const colors = PALETTES[spec.palette];
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, w, h);

  const rng = mulberry32(spec.seed);
  const runner = MODES[spec.mode].create({
    ctx, w, h, rng,
    noise: makeNoise(rng),
    bg: colors[0],
    inks: colors.slice(1),
    p: { ...spec.params },
  });
  return { canvas, runner };
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
export function compose(out, art, w, h, k, look) {
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
