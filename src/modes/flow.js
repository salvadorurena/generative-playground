import { TAU } from '../math.js';

export default {
  name: 'Flow Field',
  description: 'Particles drift through a noise field, leaving ink trails.',
  params: [
    { key: 'count', label: 'Particles', min: 100, max: 5000, step: 100, value: 1800, help: 'How many particles trace the field at once. More means denser ink.' },
    { key: 'scale', label: 'Noise scale', min: 0.5, max: 10, step: 0.1, value: 2.5, help: 'Size of the swirls: low gives broad currents, high gives tight eddies.' },
    { key: 'curl', label: 'Turbulence', min: 0.5, max: 4, step: 0.1, value: 1.5, help: 'How sharply the field twists. High values make knots and loops.' },
    { key: 'speed', label: 'Speed', min: 0.5, max: 4, step: 0.1, value: 1.2, help: 'How far each particle moves per step. Higher gives longer, smoother strokes.' },
    { key: 'alpha', label: 'Ink opacity', min: 0.02, max: 0.6, step: 0.01, value: 0.12, help: 'Opacity of each stroke. Low values build up slowly into soft gradients.' },
    { key: 'width', label: 'Line width', min: 0.3, max: 3, step: 0.1, value: 0.8, help: 'Stroke thickness in pixels.' },
  ],
  create({ ctx, w, h, rng, noise, inks, p, path }) {
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
      progress: () => frame / 500,
      step() {
        const paths = inks.map(() => path());
        for (let sub = 0; sub < 4; sub++) {
          for (const pt of parts) {
            const a = noise(pt.x * s + ox, pt.y * s + oy) * TAU * p.curl;
            const nx = pt.x + Math.cos(a) * p.speed;
            const ny = pt.y + Math.sin(a) * p.speed;
            const trail = paths[pt.c];
            trail.moveTo(pt.x, pt.y);
            trail.lineTo(nx, ny);
            pt.x = nx; pt.y = ny;
            if (--pt.life < 0 || nx < 0 || ny < 0 || nx > w || ny > h) spawn(pt);
          }
        }
        ctx.globalAlpha = p.alpha;
        ctx.lineWidth = p.width;
        ctx.lineCap = 'round';
        paths.forEach((shape, i) => {
          ctx.strokeStyle = inks[i];
          ctx.stroke(shape);
        });
        return ++frame >= 500;
      },
    };
  },
};
