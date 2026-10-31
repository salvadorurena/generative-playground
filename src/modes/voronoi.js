export default {
  name: 'Voronoi Mosaic',
  params: [
    { key: 'cells', label: 'Cells', min: 20, max: 2000, step: 10, value: 400 },
    { key: 'order', label: 'Order', min: 0, max: 1, step: 0.01, value: 0.2 },
    { key: 'cluster', label: 'Clustering', min: 0, max: 1, step: 0.01, value: 0.4 },
    { key: 'regions', label: 'Color regions', min: 0.5, max: 8, step: 0.1, value: 2 },
    { key: 'lead', label: 'Lead width', min: 0, max: 8, step: 0.1, value: 2.5 },
    { key: 'shade', label: 'Shading', min: 0, max: 1, step: 0.01, value: 0.4 },
  ],
  create({ ctx, w, h, rng, noise, bg, inks, p }) {
    const n = p.cells;
    const cs = 3 / Math.min(w, h), ox = rng() * 1000;

    // Sites: blend uniform-random (thinned by noise for clustering) with a hex-ish grid.
    const cols = Math.max(1, Math.round(Math.sqrt(n * w / h))), rows = Math.ceil(n / cols);
    const sites = [];
    for (let i = 0; i < n; i++) {
      let rx, ry;
      do {
        rx = rng() * w; ry = rng() * h;
      } while (rng() > 1 - p.cluster + p.cluster * ((noise(rx * cs + ox, ry * cs) + 1) / 2) ** 2);
      const row = Math.floor(i / cols);
      const gx = ((i % cols) + 0.5 + (row % 2) * 0.5) * w / cols + (rng() - 0.5) * w / cols * 0.3;
      const gy = (row + 0.5) * h / rows + (rng() - 0.5) * h / rows * 0.3;
      sites.push({ x: rx + (gx - rx) * p.order, y: ry + (gy - ry) * p.order, r: rng() });
    }
    sites.sort((a, b) => Math.hypot(a.x - w / 2, a.y - h / 2) - Math.hypot(b.x - w / 2, b.y - h / 2));

    // Keep the half-plane closer to the site than to (dx, dy) away; Sutherland–Hodgman.
    const clip = (poly, mx, my, dx, dy) => {
      const out = [];
      for (let i = 0; i < poly.length; i += 2) {
        const j = (i + 2) % poly.length;
        const ax = poly[i], ay = poly[i + 1], bx = poly[j], by = poly[j + 1];
        const da = (ax - mx) * dx + (ay - my) * dy, db = (bx - mx) * dx + (by - my) * dy;
        if (da <= 0) out.push(ax, ay);
        if ((da <= 0) !== (db <= 0)) {
          const t = da / (da - db);
          out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
        }
      }
      return out;
    };

    const m = p.lead + 1;
    const cellPoly = s => {
      let poly = [-m, -m, w + m, -m, w + m, h + m, -m, h + m];
      const others = sites.map(o => ({ o, d: (o.x - s.x) ** 2 + (o.y - s.y) ** 2 }))
        .filter(e => e.d > 0).sort((a, b) => a.d - b.d);
      let r2 = Infinity;
      for (const { o, d } of others) {
        if (d > 4 * r2) break; // bisector is beyond the cell's farthest vertex
        poly = clip(poly, (s.x + o.x) / 2, (s.y + o.y) / 2, o.x - s.x, o.y - s.y);
        r2 = 0;
        for (let i = 0; i < poly.length; i += 2) r2 = Math.max(r2, (poly[i] - s.x) ** 2 + (poly[i + 1] - s.y) ** 2);
      }
      return poly;
    };

    const perFrame = Math.ceil(n / 90);
    let next = 0;
    return {
      step() {
        const fills = new Map(), lead = new Path2D();
        for (const s of sites.slice(next, next + perFrame)) {
          const poly = cellPoly(s);
          if (poly.length < 6) continue;
          const n01 = (noise(s.x * cs * p.regions / 3 + ox + 50, s.y * cs * p.regions / 3) + 1) / 2;
          const ci = Math.min(inks.length - 1, Math.floor((n01 + (s.r - 0.5) * 0.4) * inks.length));
          const level = Math.floor(s.r * 3);
          const key = `${Math.max(0, ci)}:${level}`;
          if (!fills.has(key)) fills.set(key, new Path2D());
          const path = new Path2D();
          path.moveTo(poly[0], poly[1]);
          for (let i = 2; i < poly.length; i += 2) path.lineTo(poly[i], poly[i + 1]);
          path.closePath();
          fills.get(key).addPath(path);
          lead.addPath(path);
        }
        next += perFrame;
        ctx.lineJoin = 'round';
        for (const [key, path] of fills) {
          const [ci, level] = key.split(':').map(Number);
          ctx.globalAlpha = 1 - p.shade * level * 0.3;
          ctx.fillStyle = inks[ci];
          ctx.fill(path);
        }
        if (p.lead > 0) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = bg;
          ctx.lineWidth = p.lead;
          ctx.stroke(lead);
        }
        return next >= sites.length;
      },
    };
  },
};
