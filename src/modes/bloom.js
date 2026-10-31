import { TAU } from '../math.js';

export default {
  name: 'Fractal Bloom',
  description: 'Branches split recursively and repeat around the center.',
  vector: true, // draws only paths, so it can export SVG
  pace: 5, // few, heavy frames: hold each level so the growth is visible
  params: [
    { key: 'depth', label: 'Depth', min: 2, max: 11, step: 1, value: 8, help: 'Levels of branching. Each level multiplies the number of tips.' },
    { key: 'branches', label: 'Branches', min: 2, max: 4, step: 1, value: 2, help: 'How many twigs split off each branch.' },
    { key: 'spread', label: 'Spread (°)', min: 5, max: 120, step: 1, value: 28, help: 'Angle between sibling branches.' },
    { key: 'ratio', label: 'Length ratio', min: 0.5, max: 0.85, step: 0.01, value: 0.72, help: 'Each branch’s length relative to its parent.' },
    { key: 'jitter', label: 'Jitter', min: 0, max: 1, step: 0.01, value: 0.2, help: 'Random variation in angles and lengths. 0 is perfectly regular.' },
    { key: 'symmetry', label: 'Symmetry', min: 1, max: 12, step: 1, value: 6, help: 'Copies arranged around the center. 1 grows a single tree.' },
    { key: 'size', label: 'Fill', min: 0.3, max: 1.3, step: 0.01, value: 0.9, help: 'How much of the canvas the bloom fills.' },
    { key: 'width', label: 'Line width', min: 0.5, max: 6, step: 0.1, value: 2.5, help: 'Trunk thickness; branches taper toward the tips.' },
  ],
  create({ ctx, w, h, rng, inks, p, path }) {
    // Keep the segment count sane: branches^depth * symmetry.
    let depth = p.depth;
    while (depth > 2 && Math.pow(p.branches, depth) * p.symmetry > 250000) depth--;

    const spread = p.spread * Math.PI / 180;
    const levels = Array.from({ length: depth }, () => path());
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
      progress: () => frame / depth,
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
};
