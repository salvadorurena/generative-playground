import { TAU } from '../math.js';

export default {
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
};
