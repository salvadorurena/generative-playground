import { TAU } from '../math.js';

export default {
  name: 'Circle Packing',
  description: 'Circles grow into the gaps until they touch.',
  vector: true, // draws only paths, so it can export SVG
  pace: 3,
  params: [
    { key: 'count', label: 'Max circles', min: 50, max: 3000, step: 50, value: 800, help: 'Stop after this many circles.' },
    { key: 'maxSize', label: 'Max size (%)', min: 2, max: 30, step: 0.5, value: 10, help: 'Largest radius, as a percent of the canvas.' },
    { key: 'minSize', label: 'Min size (%)', min: 0.2, max: 3, step: 0.1, value: 0.5, help: 'Smallest radius allowed. Smaller fills the gaps more completely.' },
    { key: 'padding', label: 'Padding (%)', min: 0, max: 2, step: 0.05, value: 0.3, help: 'Gap between neighboring circles.' },
    { key: 'variation', label: 'Size variation', min: 0, max: 1, step: 0.01, value: 0.5, help: 'How much a noise field shrinks circles in some areas. 0 is uniform.' },
    { key: 'style', label: 'Style', min: 0, max: 2, step: 1, value: 2, labels: ['Solid', 'Rings', 'Targets'], help: 'Solid discs, outlined rings, or alternating target bands.' },
    { key: 'rings', label: 'Rings', min: 2, max: 8, step: 1, value: 4, help: 'Concentric bands per circle (Rings and Targets styles).' },
    { key: 'width', label: 'Ring width', min: 0.5, max: 4, step: 0.1, value: 1.2, help: 'Outline thickness for the Rings style.' },
  ],
  create({ ctx, w, h, rng, noise, bg, inks, p, path }) {
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
          if (!paths.has(color)) paths.set(color, path());
          const shape = paths.get(color);
          shape.moveTo(c.x + rr, c.y);
          shape.arc(c.x, c.y, rr, 0, TAU);
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth = p.width;
        for (const [color, shape] of paths) {
          if (p.style === 1) { ctx.strokeStyle = color; ctx.stroke(shape); }
          else { ctx.fillStyle = color; ctx.fill(shape); }
        }
      }
    };

    return {
      progress: () => Math.max(circles.length / p.count, frame / 900),
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
};
