export default {
  name: 'Reaction–Diffusion',
  description: 'Two simulated chemicals react and spread into organic patterns.',
  params: [
    { key: 'pattern', label: 'Pattern', min: 0, max: 5, step: 1, value: 0, labels: ['Coral', 'Mitosis', 'Maze', 'Worms', 'Spots', 'Holes'], help: 'Feed and kill rates for the Gray–Scott model; each grows differently.' },
    { key: 'res', label: 'Detail', min: 80, max: 320, step: 10, value: 180, help: 'Simulation cells across the canvas. Higher is finer but slower.' },
    { key: 'seeds', label: 'Seeds', min: 1, max: 40, step: 1, value: 12, help: 'Starting spots where the reaction begins.' },
    { key: 'speed', label: 'Speed', min: 2, max: 30, step: 1, value: 12, help: 'Simulation steps per frame.' },
    { key: 'duration', label: 'Duration', min: 100, max: 900, step: 10, value: 400, help: 'Frames to run before stopping.' },
    { key: 'contrast', label: 'Contrast', min: 0.5, max: 3, step: 0.05, value: 1, help: 'How strongly concentration maps onto the palette.' },
  ],
  create({ ctx, w, h, rng, bg, inks, p }) {
    // Gray–Scott feed/kill rates for each pattern.
    const [f, k] = [[0.0545, 0.062], [0.0367, 0.0649], [0.029, 0.057], [0.078, 0.061], [0.03, 0.062], [0.039, 0.058]][p.pattern];
    const cell = Math.min(w, h) / p.res;
    const gw = Math.max(8, Math.round(w / cell)), gh = Math.max(8, Math.round(h / cell)), N = gw * gh;
    let A = new Float32Array(N).fill(1), B = new Float32Array(N);
    let A2 = new Float32Array(N), B2 = new Float32Array(N);

    for (let i = 0; i < p.seeds; i++) {
      const cx = Math.floor(rng() * gw), cy = Math.floor(rng() * gh);
      const r = 2 + Math.floor(rng() * Math.max(2, gw / 30));
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          B[((cy + dy + gh) % gh) * gw + (cx + dx + gw) % gw] = 1;
        }
      }
    }

    // Color lookup: background → inks along concentration of B.
    const stops = [bg, ...inks].map(c => { const v = parseInt(c.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; });
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255 * (stops.length - 1), a = Math.floor(t), b = Math.min(a + 1, stops.length - 1), u = t - a;
      for (let c = 0; c < 3; c++) lut[i * 3 + c] = stops[a][c] + (stops[b][c] - stops[a][c]) * u;
    }

    const small = document.createElement('canvas');
    small.width = gw; small.height = gh;
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(gw, gh);

    const iterate = () => {
      for (let y = 0; y < gh; y++) {
        const ym = ((y - 1 + gh) % gh) * gw, y0 = y * gw, yp = ((y + 1) % gh) * gw;
        for (let x = 0; x < gw; x++) {
          const xm = (x - 1 + gw) % gw, xp = (x + 1) % gw, i = y0 + x;
          const a = A[i], b = B[i];
          const la = 0.2 * (A[y0 + xm] + A[y0 + xp] + A[ym + x] + A[yp + x])
            + 0.05 * (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp]) - a;
          const lb = 0.2 * (B[y0 + xm] + B[y0 + xp] + B[ym + x] + B[yp + x])
            + 0.05 * (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp]) - b;
          const abb = a * b * b;
          A2[i] = a + la - abb + f * (1 - a);
          B2[i] = b + 0.5 * lb + abb - (k + f) * b;
        }
      }
      [A, A2] = [A2, A];
      [B, B2] = [B2, B];
    };

    let frame = 0;
    return {
      progress: () => frame / p.duration,
      step() {
        for (let i = 0; i < p.speed; i++) iterate();
        const d = img.data;
        for (let i = 0, j = 0; i < N; i++, j += 4) {
          const li = Math.min(255, Math.max(0, B[i] * 2.5 * p.contrast * 255 | 0)) * 3;
          d[j] = lut[li]; d[j + 1] = lut[li + 1]; d[j + 2] = lut[li + 2]; d[j + 3] = 255;
        }
        sctx.putImageData(img, 0, 0);
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(small, 0, 0, w, h);
        return ++frame >= p.duration;
      },
    };
  },
};
