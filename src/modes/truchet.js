import { TAU } from '../math.js';

export default {
  name: 'Truchet Tiles',
  params: [
    { key: 'tiles', label: 'Tiles across', min: 4, max: 60, step: 1, value: 16 },
    { key: 'style', label: 'Style', min: 0, max: 3, step: 1, value: 1, labels: ['Arcs', 'Outlined arcs', 'Diagonals', 'Triangles'] },
    { key: 'width', label: 'Line width', min: 0.05, max: 0.5, step: 0.01, value: 0.18 },
    { key: 'bias', label: 'Flow', min: 0, max: 1, step: 0.01, value: 0.3 },
    { key: 'colors', label: 'Colors', min: 1, max: 4, step: 1, value: 3 },
    { key: 'regions', label: 'Color regions', min: 0.5, max: 6, step: 0.1, value: 1.5 },
  ],
  create({ ctx, w, h, rng, noise, bg, inks, p }) {
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

    const addTile = (path, t) => {
      const { x, y } = t, hs = s / 2;
      if (p.style <= 1) {
        if (!t.flip) {
          path.moveTo(x + hs, y); path.arc(x, y, hs, 0, Math.PI / 2);
          path.moveTo(x + hs, y + s); path.arc(x + s, y + s, hs, Math.PI, Math.PI * 1.5);
        } else {
          path.moveTo(x + s, y + hs); path.arc(x + s, y, hs, Math.PI / 2, Math.PI);
          path.moveTo(x, y + hs); path.arc(x, y + s, hs, Math.PI * 1.5, TAU);
        }
      } else if (p.style === 2) {
        if (!t.flip) { path.moveTo(x, y); path.lineTo(x + s, y + s); }
        else { path.moveTo(x + s, y); path.lineTo(x, y + s); }
      } else {
        if (!t.flip) { path.moveTo(x, y); path.lineTo(x + s, y); path.lineTo(x, y + s); }
        else { path.moveTo(x + s, y); path.lineTo(x + s, y + s); path.lineTo(x, y); }
        path.closePath();
      }
    };

    const perFrame = Math.ceil(tiles.length / 60);
    let next = 0;
    return {
      step() {
        const paths = inks.map(() => new Path2D()), all = new Path2D();
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
        paths.forEach((path, i) => {
          if (p.style === 3) { ctx.fillStyle = inks[i]; ctx.fill(path); }
          else { ctx.strokeStyle = inks[i]; ctx.stroke(path); }
        });
        return next >= tiles.length;
      },
    };
  },
};
