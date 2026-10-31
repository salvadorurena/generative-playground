'use strict';

const TAU = Math.PI * 2;

// ---------- Randomness ----------

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Classic 2D Perlin noise, seeded. Returns roughly [-1, 1].
function makeNoise(rng) {
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;

  return (x, y) => {
    const fx = Math.floor(x), fy = Math.floor(y);
    const X = fx & 255, Y = fy & 255;
    x -= fx; y -= fy;
    const u = fade(x), v = fade(y);
    const a = p[X] + Y, b = p[X + 1] + Y;
    return lerp(
      lerp(grad(p[a], x, y), grad(p[b], x - 1, y), u),
      lerp(grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1), u),
      v
    );
  };
}

// ---------- Palettes (first color is the background) ----------

const PALETTES = {
  Ember:  ['#120b0b', '#ff4e2a', '#ffb03b', '#f7e07e', '#c72c41'],
  Lagoon: ['#05141c', '#0fb5ae', '#4fd1c5', '#a7f3d0', '#3b82f6'],
  Neon:   ['#0a0118', '#ff2e88', '#7a5cff', '#00e5ff', '#f9f871'],
  Moss:   ['#0f1a12', '#6a994e', '#a7c957', '#f2e8cf', '#bc4749'],
  Dusk:   ['#1a1423', '#e07a5f', '#f2cc8f', '#81b29a', '#9d8df1'],
  Ink:    ['#f4efe6', '#1b1b1b', '#3d3d3d', '#8a8072', '#c0392b'],
};

// ---------- Modes ----------
// Each mode has a param schema and create(env) -> { step() } where step
// draws one frame and returns true when the piece is finished.

const MODES = {
  flow: {
    name: 'Flow Field',
    params: [
      { key: 'count', label: 'Particles', min: 100, max: 5000, step: 100, value: 1800 },
      { key: 'scale', label: 'Noise scale', min: 0.5, max: 10, step: 0.1, value: 2.5 },
      { key: 'curl', label: 'Turbulence', min: 0.5, max: 4, step: 0.1, value: 1.5 },
      { key: 'speed', label: 'Speed', min: 0.5, max: 4, step: 0.1, value: 1.2 },
      { key: 'alpha', label: 'Ink opacity', min: 0.02, max: 0.6, step: 0.01, value: 0.12 },
      { key: 'width', label: 'Line width', min: 0.3, max: 3, step: 0.1, value: 0.8 },
    ],
    create({ ctx, w, h, rng, noise, inks, p }) {
      const s = p.scale / Math.min(w, h);
      const ox = rng() * 1000, oy = rng() * 1000;
      const spawn = pt => {
        pt.x = rng() * w;
        pt.y = rng() * h;
        pt.life = 50 + rng() * 250;
      };
      const parts = [];
      for (let i = 0; i < p.count; i++) {
        const pt = { c: i % inks.length };
        spawn(pt);
        parts.push(pt);
      }
      let frame = 0;
      return {
        step() {
          const paths = inks.map(() => new Path2D());
          for (let sub = 0; sub < 4; sub++) {
            for (const pt of parts) {
              const a = noise(pt.x * s + ox, pt.y * s + oy) * TAU * p.curl;
              const nx = pt.x + Math.cos(a) * p.speed;
              const ny = pt.y + Math.sin(a) * p.speed;
              const path = paths[pt.c];
              path.moveTo(pt.x, pt.y);
              path.lineTo(nx, ny);
              pt.x = nx; pt.y = ny;
              if (--pt.life < 0 || nx < 0 || ny < 0 || nx > w || ny > h) spawn(pt);
            }
          }
          ctx.globalAlpha = p.alpha;
          ctx.lineWidth = p.width;
          ctx.lineCap = 'round';
          paths.forEach((path, i) => {
            ctx.strokeStyle = inks[i];
            ctx.stroke(path);
          });
          return ++frame >= 500;
        },
      };
    },
  },

  attractor: {
    name: 'Clifford Attractor',
    params: [
      { key: 'a', label: 'a', min: -3, max: 3, step: 0.01, value: -1.4 },
      { key: 'b', label: 'b', min: -3, max: 3, step: 0.01, value: 1.6 },
      { key: 'c', label: 'c', min: -3, max: 3, step: 0.01, value: 1.0 },
      { key: 'd', label: 'd', min: -3, max: 3, step: 0.01, value: 0.7 },
      { key: 'density', label: 'Points / frame', min: 5000, max: 60000, step: 1000, value: 25000 },
      { key: 'alpha', label: 'Ink opacity', min: 0.02, max: 0.5, step: 0.01, value: 0.08 },
      { key: 'zoom', label: 'Zoom', min: 0.5, max: 1.5, step: 0.01, value: 0.9 },
    ],
    create({ ctx, w, h, rng, inks, p }) {
      const xr = 1 + Math.abs(p.c), yr = 1 + Math.abs(p.d);
      const scale = Math.min(w / (2 * xr), h / (2 * yr)) * p.zoom;
      const cx = w / 2, cy = h / 2;
      const maxStep = 2 * Math.max(xr, yr);
      let x = rng() * 0.2, y = rng() * 0.2;
      const iterate = () => {
        const nx = Math.sin(p.a * y) + p.c * Math.cos(p.a * x);
        const ny = Math.sin(p.b * x) + p.d * Math.cos(p.b * y);
        const dist = Math.hypot(nx - x, ny - y);
        x = nx; y = ny;
        return dist;
      };
      for (let i = 0; i < 100; i++) iterate();
      let frame = 0;
      return {
        step() {
          const paths = inks.map(() => new Path2D());
          for (let i = 0; i < p.density; i++) {
            const dist = iterate();
            const ci = Math.min(inks.length - 1, Math.floor((dist / maxStep) * inks.length * 1.5));
            paths[ci].rect(cx + x * scale, cy + y * scale, 1, 1);
          }
          ctx.globalAlpha = p.alpha;
          paths.forEach((path, i) => {
            ctx.fillStyle = inks[i];
            ctx.fill(path);
          });
          return ++frame >= 240;
        },
      };
    },
  },

  bloom: {
    name: 'Fractal Bloom',
    pace: 5, // few, heavy frames: hold each level so the growth is visible
    params: [
      { key: 'depth', label: 'Depth', min: 2, max: 11, step: 1, value: 8 },
      { key: 'branches', label: 'Branches', min: 2, max: 4, step: 1, value: 2 },
      { key: 'spread', label: 'Spread (°)', min: 5, max: 120, step: 1, value: 28 },
      { key: 'ratio', label: 'Length ratio', min: 0.5, max: 0.85, step: 0.01, value: 0.72 },
      { key: 'jitter', label: 'Jitter', min: 0, max: 1, step: 0.01, value: 0.2 },
      { key: 'symmetry', label: 'Symmetry', min: 1, max: 12, step: 1, value: 6 },
      { key: 'size', label: 'Fill', min: 0.3, max: 1.3, step: 0.01, value: 0.9 },
      { key: 'width', label: 'Line width', min: 0.5, max: 6, step: 0.1, value: 2.5 },
    ],
    create({ ctx, w, h, rng, inks, p }) {
      // Keep the segment count sane: branches^depth * symmetry.
      let depth = p.depth;
      while (depth > 2 && Math.pow(p.branches, depth) * p.symmetry > 250000) depth--;

      const spread = p.spread * Math.PI / 180;
      const levels = Array.from({ length: depth }, () => new Path2D());
      const branch = (x, y, a, len, d) => {
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        levels[d].moveTo(x, y);
        levels[d].lineTo(x2, y2);
        if (d + 1 >= depth) return;
        for (let i = 0; i < p.branches; i++) {
          const off = (i / (p.branches - 1) - 0.5) * 2 * spread;
          const jit = (rng() - 0.5) * p.jitter * spread;
          const nl = len * p.ratio * (1 + (rng() - 0.5) * p.jitter * 0.4);
          branch(x2, y2, a + off + jit, nl, d + 1);
        }
      };

      // Size the trunk so the full reach (len * sum of ratio^d) fills the canvas.
      const single = p.symmetry === 1;
      const cx = w / 2, cy = single ? h * 0.92 : h / 2;
      const room = single ? h * 0.85 : Math.min(w, h) / 2;
      const reach = (1 - Math.pow(p.ratio, depth)) / (1 - p.ratio);
      const len = room * p.size / reach;
      for (let k = 0; k < p.symmetry; k++) {
        branch(cx, cy, -Math.PI / 2 + k * TAU / p.symmetry, len, 0);
      }

      // Grow one level per frame.
      let frame = 0;
      return {
        step() {
          const d = frame;
          ctx.globalAlpha = 0.9;
          ctx.lineCap = 'round';
          ctx.strokeStyle = inks[d % inks.length];
          ctx.lineWidth = Math.max(0.3, p.width * (1 - d / depth));
          ctx.stroke(levels[d]);
          return ++frame >= depth;
        },
      };
    },
  },
  circles: {
    name: 'Circle Packing',
    pace: 3,
    params: [
      { key: 'count', label: 'Max circles', min: 50, max: 3000, step: 50, value: 800 },
      { key: 'maxSize', label: 'Max size (%)', min: 2, max: 30, step: 0.5, value: 10 },
      { key: 'minSize', label: 'Min size (%)', min: 0.2, max: 3, step: 0.1, value: 0.5 },
      { key: 'padding', label: 'Padding (%)', min: 0, max: 2, step: 0.05, value: 0.3 },
      { key: 'variation', label: 'Size variation', min: 0, max: 1, step: 0.01, value: 0.5 },
      { key: 'style', label: 'Style', min: 0, max: 2, step: 1, value: 2, labels: ['Solid', 'Rings', 'Targets'] },
      { key: 'rings', label: 'Rings', min: 2, max: 8, step: 1, value: 4 },
      { key: 'width', label: 'Ring width', min: 0.5, max: 4, step: 0.1, value: 1.2 },
    ],
    create({ ctx, w, h, rng, noise, bg, inks, p }) {
      const unit = Math.min(w, h) / 100;
      const maxR = p.maxSize * unit, minR = p.minSize * unit, pad = p.padding * unit;
      const ns = 2 / Math.min(w, h), ox = rng() * 1000;
      const circles = [];
      let frame = 0, idle = 0;

      const drawNew = list => {
        const levels = p.style === 0 ? 1 : p.rings;
        for (let k = 0; k < levels; k++) {
          // One path per color per ring level; circles never overlap, so levels can batch.
          const paths = new Map();
          for (const c of list) {
            const color = p.style === 2 && k % 2 ? bg : inks[(c.ci + (p.style === 1 ? k : 0)) % inks.length];
            const rr = p.style === 1 ? c.r * (1 - k / levels) - p.width / 2 : c.r * (1 - k / levels);
            if (rr <= 0) continue;
            if (!paths.has(color)) paths.set(color, new Path2D());
            const path = paths.get(color);
            path.moveTo(c.x + rr, c.y);
            path.arc(c.x, c.y, rr, 0, TAU);
          }
          ctx.globalAlpha = 1;
          ctx.lineWidth = p.width;
          for (const [color, path] of paths) {
            if (p.style === 1) { ctx.strokeStyle = color; ctx.stroke(path); }
            else { ctx.fillStyle = color; ctx.fill(path); }
          }
        }
      };

      return {
        step() {
          const added = [];
          for (let attempt = 0; attempt < 400 && circles.length < p.count; attempt++) {
            const x = rng() * w, y = rng() * h;
            const n01 = (noise(x * ns + ox, y * ns) + 1) / 2;
            let r = Math.min(x, y, w - x, h - y) - pad;
            const cap = maxR * (1 - p.variation * n01);
            if (r > cap) r = cap;
            for (let i = 0; i < circles.length && r >= minR; i++) {
              const c = circles[i];
              const d = Math.hypot(c.x - x, c.y - y) - c.r - pad;
              if (d < r) r = d;
            }
            const pick = rng();
            if (r < minR) continue;
            const c = { x, y, r, ci: Math.floor(pick * inks.length) };
            circles.push(c);
            added.push(c);
          }
          if (added.length) { drawNew(added); idle = 0; } else idle++;
          return ++frame >= 900 || circles.length >= p.count || idle > 40;
        },
      };
    },
  },

  voronoi: {
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
  },

  truchet: {
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
  },

  diffusion: {
    name: 'Reaction–Diffusion',
    params: [
      { key: 'pattern', label: 'Pattern', min: 0, max: 5, step: 1, value: 0, labels: ['Coral', 'Mitosis', 'Maze', 'Worms', 'Spots', 'Holes'] },
      { key: 'res', label: 'Detail', min: 80, max: 320, step: 10, value: 180 },
      { key: 'seeds', label: 'Seeds', min: 1, max: 40, step: 1, value: 12 },
      { key: 'speed', label: 'Speed', min: 2, max: 30, step: 1, value: 12 },
      { key: 'duration', label: 'Duration', min: 100, max: 900, step: 10, value: 400 },
      { key: 'contrast', label: 'Contrast', min: 0.5, max: 3, step: 0.05, value: 1 },
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
  },
};

// ---------- Canvas & finish options ----------

const ASPECTS = {
  fill: 'Fill window',
  '1:1': 'Square 1:1',
  '4:5': 'Portrait 4:5',
  '9:16': 'Story 9:16',
  '3:2': 'Landscape 3:2',
  '16:9': 'Wide 16:9',
};

const POST_PARAMS = [
  { key: 'grain', label: 'Grain', min: 0, max: 1, step: 0.01, value: 0.2 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, value: 0.3 },
  { key: 'glow', label: 'Glow', min: 0, max: 1, step: 0.01, value: 0 },
];

const EXPORT_SIZES = { screen: 'Screen', x2: '2×', print: 'Print' };
const MAX_EXPORT_AREA = 4096 * 4096; // Safari's canvas area limit

// ---------- State ----------

const state = {
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
function snapshot() {
  return {
    m: state.mode, p: state.palette, s: state.seed, a: state.aspect,
    v: { ...state.params[state.mode] }, x: { ...state.post },
  };
}

function applySnapshot(h) {
  if (MODES[h.m]) state.mode = h.m;
  if (PALETTES[h.p]) state.palette = h.p;
  if (Number.isFinite(h.s)) state.seed = h.s;
  if (ASPECTS[h.a]) state.aspect = h.a;
  if (h.v) Object.assign(state.params[state.mode], h.v);
  if (h.x) Object.assign(state.post, h.x);
}

function readHash() {
  try {
    applySnapshot(JSON.parse(decodeURIComponent(location.hash.slice(1))));
  } catch { /* no or bad hash */ }
}

function writeHash() {
  history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify(snapshot())));
}

// ---------- Rendering ----------
// Modes draw onto an offscreen "art" canvas; compose() copies it to the
// target and layers the finish effects on top, so effects never accumulate.

function startRender(w, h, k) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);

  const colors = PALETTES[state.palette];
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, w, h);

  const rng = mulberry32(state.seed);
  const runner = MODES[state.mode].create({
    ctx, w, h, rng,
    noise: makeNoise(rng),
    bg: colors[0],
    inks: colors.slice(1),
    p: { ...state.params[state.mode] },
  });
  return { canvas, runner };
}

function currentLook() {
  return { post: { ...state.post }, bg: PALETTES[state.palette][0], seed: state.seed };
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
function compose(out, art, w, h, k, look) {
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

const $ = id => document.getElementById(id);
const view = $('canvas');
const stage = $('stage');
const statusEl = $('status');

let render = null, size = { w: 1, h: 1, dpr: 1 };
let done = false, paused = false, dirty = true, needsCompose = false, frames = 0;
let presenting = false, exporting = false, exportMsg = '';
let flashMsg = '', flashUntil = 0;
let tick = 0;

function canvasSize() {
  const pad = state.aspect === 'fill' || presenting ? 0 : 24;
  const aw = stage.clientWidth - pad * 2, ah = stage.clientHeight - pad * 2;
  if (state.aspect === 'fill') return { w: Math.max(1, aw), h: Math.max(1, ah) };
  const [a, b] = state.aspect.split(':').map(Number);
  let w = aw, h = aw * b / a;
  if (h > ah) { h = ah; w = ah * a / b; }
  return { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
}

function restart() {
  const dpr = window.devicePixelRatio || 1;
  const { w, h } = canvasSize();
  if (recorder && (w !== size.w || h !== size.h)) stopRecording();
  view.style.width = w + 'px';
  view.style.height = h + 'px';
  view.width = Math.round(w * dpr);
  view.height = Math.round(h * dpr);
  view.classList.toggle('framed', state.aspect !== 'fill');
  size = { w, h, dpr };
  render = startRender(w, h, dpr);
  done = false;
  frames = 0;
  updateExportLabels();
}

function loop() {
  requestAnimationFrame(loop);
  if (dirty) {
    dirty = false;
    restart();
    needsCompose = true;
  }
  if (recordPending) {
    recordPending = false;
    beginRecording();
  }
  if (!paused && !done && ++tick % (MODES[state.mode].pace || 1) === 0) {
    done = render.runner.step();
    frames++;
    needsCompose = true;
  }
  if (recorder) {
    // Repaint every frame so the stream keeps producing frames; hold the finished piece briefly.
    needsCompose = true;
    if (done && --recordHold <= 0) stopRecording();
  }
  if (needsCompose) {
    needsCompose = false;
    compose(view, render.canvas, size.w, size.h, size.dpr, currentLook());
  }
  updateStatus();
}

function updateStatus() {
  let text;
  if (performance.now() < flashUntil) text = flashMsg;
  else if (recorder) text = `● Recording · ${((performance.now() - recordStart) / 1000).toFixed(1)}s`;
  else if (exporting) text = exportMsg;
  else text = done ? `Done · ${frames} frames` : paused ? 'Paused' : `Rendering · frame ${frames}`;
  if (statusEl.textContent !== text) statusEl.textContent = text;
}

function flash(msg) {
  flashMsg = msg;
  flashUntil = performance.now() + 2200;
}

function schedule() {
  dirty = true;
  writeHash();
}

// ---------- Export ----------

const exportSel = $('exportSize');
const saveBtn = $('save');

function exportScale(choice) {
  const { w, h, dpr } = size;
  let k = choice === 'print' ? 4096 / Math.max(w, h) : choice === 'x2' ? dpr * 2 : dpr;
  if (w * k * h * k > MAX_EXPORT_AREA) k = Math.sqrt(MAX_EXPORT_AREA / (w * h));
  return k;
}

function updateExportLabels() {
  for (const opt of exportSel.options) {
    const k = exportScale(opt.value);
    opt.text = `${EXPORT_SIZES[opt.value]} · ${Math.round(size.w * k)}×${Math.round(size.h * k)}`;
  }
}

const nextFrame = () => new Promise(r => requestAnimationFrame(r));

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function savePng() {
  if (exporting) return;
  exporting = true;
  saveBtn.disabled = true;
  try {
    const { w, h, dpr } = size;
    const k = exportScale(exportSel.value);
    const look = currentLook();
    const name = `${state.mode}-${state.palette.toLowerCase()}-${state.seed}.png`;
    let out = view;
    // Re-render offscreen unless the on-screen piece is already the requested size.
    if (k !== dpr || !done) {
      const job = startRender(w, h, k);
      let n = 0, t = performance.now();
      exportMsg = 'Exporting…';
      while (!job.runner.step()) {
        n++;
        if (performance.now() - t > 24) {
          exportMsg = `Exporting · frame ${n}`;
          await nextFrame();
          t = performance.now();
        }
      }
      out = document.createElement('canvas');
      out.width = job.canvas.width;
      out.height = job.canvas.height;
      compose(out, job.canvas, w, h, k, look);
    }
    const blob = await new Promise(r => out.toBlob(r, 'image/png'));
    if (!blob) throw new Error('toBlob failed');
    download(blob, name);
    flash(`Saved ${out.width}×${out.height} PNG`);
  } catch {
    flash('Export failed — try a smaller size');
  } finally {
    exporting = false;
    saveBtn.disabled = false;
  }
}

// ---------- Video ----------
// Records the visible canvas from frame 0 until the piece finishes (plus a short hold).

const recordBtn = $('record');
const RECORD_HOLD_FRAMES = 90;
let recorder = null, recordPending = false, recordHold = 0, recordStart = 0;

function pickVideoType() {
  if (!window.MediaRecorder || !view.captureStream) return null;
  return ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find(t => MediaRecorder.isTypeSupported(t)) ?? null;
}

function toggleRecording() {
  if (recorder) stopRecording();
  else if (!recordPending) startRecording();
}

function startRecording() {
  if (!pickVideoType()) {
    flash('Video recording isn’t supported in this browser');
    return;
  }
  if (paused) togglePause();
  dirty = true; // restart the piece, then begin recording on the next loop tick
  recordPending = true;
}

function beginRecording() {
  const type = pickVideoType();
  const stream = view.captureStream(60);
  const chunks = [];
  const name = `${state.mode}-${state.palette.toLowerCase()}-${state.seed}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
  recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12e6 });
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    download(new Blob(chunks, { type: type.split(';')[0] }), name);
    flash('Saved video');
  };
  recorder.start();
  recordHold = RECORD_HOLD_FRAMES;
  recordStart = performance.now();
  paintRecordButton();
}

function stopRecording() {
  if (!recorder) return;
  const r = recorder;
  recorder = null;
  r.stop();
  paintRecordButton();
}

function paintRecordButton() {
  recordBtn.classList.toggle('recording', !!recorder);
  recordBtn.innerHTML = `${recorder ? 'Stop recording' : 'Record video'} <kbd>V</kbd>`;
}

// ---------- Favorites ----------

const FAV_KEY = 'gp:favorites';
const favBox = $('favorites');

function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; }
}

function storeFavorites() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); return true; } catch { return false; }
}

let favorites = loadFavorites();

function addFavorite() {
  const t = document.createElement('canvas');
  const s = 200 / Math.max(view.width, view.height);
  t.width = Math.round(view.width * s);
  t.height = Math.round(view.height * s);
  t.getContext('2d').drawImage(view, 0, 0, t.width, t.height);
  favorites.unshift({ id: Date.now().toString(36), snap: snapshot(), thumb: t.toDataURL('image/jpeg', 0.8) });
  favorites = favorites.slice(0, 60);
  flash(storeFavorites() ? 'Saved to favorites' : 'Saved for this visit only (storage unavailable)');
  renderFavorites();
}

function renderFavorites() {
  favBox.innerHTML = '';
  if (!favorites.length) {
    favBox.innerHTML = '<p class="empty">Save a piece you like to keep it here.</p>';
    return;
  }
  for (const f of favorites) {
    const item = document.createElement('div');
    item.className = 'fav';
    const load = document.createElement('button');
    load.type = 'button';
    load.className = 'load';
    load.title = `${MODES[f.snap.m]?.name ?? f.snap.m} · ${f.snap.p} · seed ${f.snap.s}`;
    load.innerHTML = `<img alt="${load.title}" src="${f.thumb}">`;
    load.addEventListener('click', () => {
      applySnapshot(f.snap);
      syncControls();
      schedule();
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.title = 'Remove';
    del.textContent = '×';
    del.addEventListener('click', () => {
      favorites = favorites.filter(x => x.id !== f.id);
      storeFavorites();
      renderFavorites();
    });
    item.append(load, del);
    favBox.append(item);
  }
}

// ---------- UI ----------

const modeSel = $('mode'), paletteSel = $('palette'), aspectSel = $('aspect'), seedInput = $('seed');

const decimals = step => (String(step).split('.')[1] || '').length;

const LOCK_ICON = {
  on: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  off: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 5.8-1" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};

// Builds a labelled slider bound to values[q.key]. Pass a Set as `locks` to add a lock toggle.
function makeSlider(q, values, onChange, locks) {
  const label = document.createElement('label');
  label.className = 'field';
  label.innerHTML = `<span class="head"><span class="label">${q.label}</span><span class="right"><output></output></span></span>`;
  const out = label.querySelector('output');
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', min: q.min, max: q.max, step: q.step });
  input.value = values[q.key];
  const fmt = v => q.labels ? q.labels[v] : Number(v).toFixed(decimals(q.step));
  out.textContent = fmt(input.value);
  input.addEventListener('input', () => {
    values[q.key] = Number(input.value);
    out.textContent = fmt(input.value);
    onChange();
  });

  if (locks) {
    const lock = document.createElement('button');
    lock.type = 'button';
    lock.className = 'lock';
    const paint = () => {
      const on = locks.has(q.key);
      lock.innerHTML = on ? LOCK_ICON.on : LOCK_ICON.off;
      lock.setAttribute('aria-pressed', on);
      lock.title = on ? 'Locked: Randomize keeps this value' : 'Lock this value during Randomize';
    };
    lock.addEventListener('click', e => {
      e.preventDefault();
      locks.has(q.key) ? locks.delete(q.key) : locks.add(q.key);
      paint();
    });
    paint();
    label.querySelector('.right').appendChild(lock);
  }

  label.appendChild(input);
  return label;
}

function buildParams() {
  const box = $('params');
  box.innerHTML = '';
  for (const q of MODES[state.mode].params) {
    box.appendChild(makeSlider(q, state.params[state.mode], schedule, state.locks[state.mode]));
  }
}

function buildPost() {
  const box = $('post');
  box.innerHTML = '';
  for (const q of POST_PARAMS) {
    box.appendChild(makeSlider(q, state.post, () => { needsCompose = true; writeHash(); }));
  }
}

function syncControls() {
  modeSel.value = state.mode;
  paletteSel.value = state.palette;
  aspectSel.value = state.aspect;
  seedInput.value = state.seed;
  $('swatches').innerHTML = PALETTES[state.palette].map(c => `<span style="background:${c}"></span>`).join('');
  buildParams();
  buildPost();
}

function newSeed() {
  state.seed = Math.floor(Math.random() * 1e6);
  seedInput.value = state.seed;
}

function randomize() {
  newSeed();
  const locks = state.locks[state.mode];
  for (const q of MODES[state.mode].params) {
    if (locks.has(q.key)) continue;
    const steps = Math.round((q.max - q.min) / q.step);
    const v = q.min + Math.floor(Math.random() * (steps + 1)) * q.step;
    state.params[state.mode][q.key] = Number(v.toFixed(decimals(q.step)));
  }
  syncControls();
  schedule();
}

function togglePause() {
  paused = !paused;
  $('pause').innerHTML = `${paused ? 'Resume' : 'Pause'} <kbd>Space</kbd>`;
}

async function copyLink() {
  writeHash();
  try {
    await navigator.clipboard.writeText(location.href);
    flash('Link copied');
  } catch {
    // Fallback for browsers/frames that block the async clipboard API.
    const ta = document.createElement('textarea');
    ta.value = location.href;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    flash(ok ? 'Link copied' : 'Copy failed — use the address bar');
  }
}

let hintTimer;
function setPresenting(on) {
  if (presenting === on) return;
  presenting = on;
  document.body.classList.toggle('presenting', on);
  if (on) {
    document.documentElement.requestFullscreen?.().catch(() => {});
    $('hint').classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => $('hint').classList.remove('show'), 2500);
  } else if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  dirty = true;
}

for (const [k, m] of Object.entries(MODES)) modeSel.add(new Option(m.name, k));
for (const k of Object.keys(PALETTES)) paletteSel.add(new Option(k, k));
for (const [k, label] of Object.entries(ASPECTS)) aspectSel.add(new Option(label, k));
for (const k of Object.keys(EXPORT_SIZES)) exportSel.add(new Option(EXPORT_SIZES[k], k));

modeSel.addEventListener('change', () => { state.mode = modeSel.value; syncControls(); schedule(); });
paletteSel.addEventListener('change', () => { state.palette = paletteSel.value; syncControls(); schedule(); });
aspectSel.addEventListener('change', () => { state.aspect = aspectSel.value; schedule(); });
seedInput.addEventListener('change', () => { state.seed = Math.floor(Number(seedInput.value) || 0); schedule(); });
$('reseed').addEventListener('click', () => { newSeed(); schedule(); });
$('randomize').addEventListener('click', randomize);
$('pause').addEventListener('click', togglePause);
$('share').addEventListener('click', copyLink);
$('present').addEventListener('click', () => setPresenting(true));
$('favorite').addEventListener('click', addFavorite);
saveBtn.addEventListener('click', savePng);
recordBtn.addEventListener('click', toggleRecording);

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) setPresenting(false);
});

window.addEventListener('keydown', e => {
  if (e.target.matches('input[type="number"], select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'r') randomize();
  else if (key === 's') savePng();
  else if (key === 'f') setPresenting(!presenting);
  else if (key === 'v') toggleRecording();
  else if (key === 'escape') setPresenting(false);
  else if (key === ' ') { e.preventDefault(); togglePause(); }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { dirty = true; }, 150);
});

readHash();
syncControls();
renderFavorites();
writeHash();
loop();
