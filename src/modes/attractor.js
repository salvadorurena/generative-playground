export default {
  name: 'Clifford Attractor',
  description: 'Millions of points from a chaotic equation build up a figure.',
  params: [
    { key: 'a', label: 'a', min: -3, max: 3, step: 0.01, value: -1.4, help: 'In x′ = sin(a·y) + c·cos(a·x). Tiny changes reshape the whole figure.' },
    { key: 'b', label: 'b', min: -3, max: 3, step: 0.01, value: 1.6, help: 'In y′ = sin(b·x) + d·cos(b·y). Tiny changes reshape the whole figure.' },
    { key: 'c', label: 'c', min: -3, max: 3, step: 0.01, value: 1.0, help: 'Horizontal spread: the weight of cos(a·x) in x′.' },
    { key: 'd', label: 'd', min: -3, max: 3, step: 0.01, value: 0.7, help: 'Vertical spread: the weight of cos(b·y) in y′.' },
    { key: 'density', label: 'Points / frame', min: 5000, max: 60000, step: 1000, value: 25000, help: 'Points plotted per frame. Higher fills in faster.' },
    { key: 'alpha', label: 'Ink opacity', min: 0.02, max: 0.5, step: 0.01, value: 0.08, help: 'Opacity of each point. Lower reveals more detail in dense areas.' },
    { key: 'zoom', label: 'Zoom', min: 0.5, max: 1.5, step: 0.01, value: 0.9, help: 'Scale of the figure within the canvas.' },
  ],
  create({ ctx, w, h, rng, inks, p, path }) {
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
      progress: () => frame / 240,
      step() {
        const paths = inks.map(() => path());
        for (let i = 0; i < p.density; i++) {
          const dist = iterate();
          const ci = Math.min(inks.length - 1, Math.floor((dist / maxStep) * inks.length * 1.5));
          paths[ci].rect(cx + x * scale, cy + y * scale, 1, 1);
        }
        ctx.globalAlpha = p.alpha;
        paths.forEach((shape, i) => {
          ctx.fillStyle = inks[i];
          ctx.fill(shape);
        });
        return ++frame >= 240;
      },
    };
  },
};
