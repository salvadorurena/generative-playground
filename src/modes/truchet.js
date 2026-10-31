import { TAU } from '../math.js';

export default {
  name: 'Truchet Tiles',
  description: 'Simple rotated tiles that join into mazes and weaves.',
  vector: true, // draws only paths, so it can export SVG
  params: [
    { key: 'tiles', label: 'Tiles across', min: 4, max: 60, step: 1, value: 16, help: 'Tiles across the shorter side of the canvas.' },
    { key: 'style', label: 'Style', min: 0, max: 3, step: 1, value: 1, labels: ['Arcs', 'Outlined arcs', 'Diagonals', 'Triangles'], help: 'The motif drawn on each tile.' },
    { key: 'width', label: 'Line width', min: 0.05, max: 0.5, step: 0.01, value: 0.18, help: 'Line thickness relative to the tile.' },
    { key: 'bias', label: 'Flow', min: 0, max: 1, step: 0.01, value: 0.3, help: 'How much a smooth noise field orients the tiles. 0 is coin flips; higher makes longer, flowing paths.' },
    { key: 'colors', label: 'Colors', min: 1, max: 4, step: 1, value: 3, help: 'How many palette inks to use.' },
    { key: 'regions', label: 'Color regions', min: 0.5, max: 6, step: 0.1, value: 1.5, help: 'Size of the color patches.' },
  ],
  create({ ctx, w, h, rng, noise, bg, inks, p, path }) {
    const s = Math.min(w, h) / p.tiles;
    const cols = Math.ceil(w / s), rows = Math.ceil(h / s);
    const x0 = (w - cols * s) / 2, y0 = (h - rows * s) / 2;
    const ns = 1.5 / Math.min(w, h), ox = rng() * 1000;
    const nc = Math.min(p.colors, inks.length);

    const tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * s, y = y0 + r * s;
        const r1 = rng(), r2 = rng();
        const flip = r1 < p.bias ? noise(x * ns + ox, y * ns) > 0 : r2 < 0.5;
        // Perlin values cluster near 0; stretch them so every color gets used.
        const n01 = Math.min(1, Math.max(0, (noise(x * ns * p.regions + ox + 99, y * ns * p.regions) * 1.8 + 1) / 2));
        const ci = Math.min(nc - 1, Math.floor(n01 * nc));
        const d = Math.hypot(x + s / 2 - w / 2, y + s / 2 - h / 2) + rng() * s * 2;
        tiles.push({ x, y, flip, ci, d });
      }
    }
    tiles.sort((a, b) => a.d - b.d); // ripple out from the center

    const addTile = (target, t) => {
      const { x, y } = t, hs = s / 2;
      if (p.style <= 1) {
        if (!t.flip) {
          target.moveTo(x + hs, y); target.arc(x, y, hs, 0, Math.PI / 2);
          target.moveTo(x + hs, y + s); target.arc(x + s, y + s, hs, Math.PI, Math.PI * 1.5);
        } else {
          target.moveTo(x + s, y + hs); target.arc(x + s, y, hs, Math.PI / 2, Math.PI);
          target.moveTo(x, y + hs); target.arc(x, y + s, hs, Math.PI * 1.5, TAU);
        }
      } else if (p.style === 2) {
        if (!t.flip) { target.moveTo(x, y); target.lineTo(x + s, y + s); }
        else { target.moveTo(x + s, y); target.lineTo(x, y + s); }
      } else {
        if (!t.flip) { target.moveTo(x, y); target.lineTo(x + s, y); target.lineTo(x, y + s); }
        else { target.moveTo(x + s, y); target.lineTo(x + s, y + s); target.lineTo(x, y); }
        target.closePath();
      }
    };

    const perFrame = Math.ceil(tiles.length / 60);
    let next = 0;
    return {
      progress: () => Math.min(1, next / tiles.length),
      step() {
        const paths = inks.map(() => path()), all = path();
        for (const t of tiles.slice(next, next + perFrame)) {
          addTile(paths[t.ci], t);
          addTile(all, t);
        }
        next += perFrame;
        ctx.globalAlpha = 1;
        ctx.lineCap = p.style === 2 ? 'round' : 'butt';
        if (p.style === 1) {
          ctx.strokeStyle = bg;
          ctx.lineWidth = p.width * s * 1.7;
          ctx.stroke(all);
        }
        ctx.lineWidth = p.width * s;
        paths.forEach((shape, i) => {
          if (p.style === 3) { ctx.fillStyle = inks[i]; ctx.fill(shape); }
          else { ctx.strokeStyle = inks[i]; ctx.stroke(shape); }
        });
        return next >= tiles.length;
      },
    };
  },
};
