import { TAU } from './math.js';

// Records a mode's drawing as SVG. Implements only the slice of the canvas 2D
// API that vector modes use; modes get SvgPath instances from env.path().

const num = n => Math.round(n * 100) / 100;

export class SvgPath {
  constructor() {
    this.d = [];
    this.open = false;
    this.x = this.y = this.sx = this.sy = 0;
  }

  moveTo(x, y) {
    this.d.push(`M${num(x)} ${num(y)}`);
    this.open = true;
    this.x = this.sx = x;
    this.y = this.sy = y;
  }

  lineTo(x, y) {
    if (!this.open) return this.moveTo(x, y);
    this.d.push(`L${num(x)} ${num(y)}`);
    this.x = x;
    this.y = y;
  }

  closePath() {
    if (!this.open) return;
    this.d.push('Z');
    this.x = this.sx;
    this.y = this.sy;
  }

  rect(x, y, w, h) {
    this.moveTo(x, y);
    this.d.push(`h${num(w)}v${num(h)}h${num(-w)}Z`);
  }

  // Canvas semantics: joins to the arc's start with a line if a subpath is open.
  arc(cx, cy, r, a0, a1, ccw = false) {
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    if (!this.open) this.moveTo(x0, y0);
    else if (Math.hypot(x0 - this.x, y0 - this.y) > 1e-6) this.lineTo(x0, y0);
    const sweepFlag = ccw ? 0 : 1;
    let sweep = ccw ? a0 - a1 : a1 - a0;
    if (sweep >= TAU - 1e-9) {
      // A full circle can't be one SVG arc. Use quarters, not halves: with
      // rounded endpoints a half-circle's chord can exceed the diameter, and
      // SVG then silently enlarges the radius.
      const dir = ccw ? -1 : 1;
      for (let q = 1; q <= 4; q++) {
        const a = a0 + dir * q * Math.PI / 2;
        this.d.push(`A${num(r)} ${num(r)} 0 0 ${sweepFlag} ${num(cx + r * Math.cos(a))} ${num(cy + r * Math.sin(a))}`);
      }
      this.x = x0;
      this.y = y0;
      return;
    }
    sweep = ((sweep % TAU) + TAU) % TAU;
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    this.d.push(`A${num(r)} ${num(r)} 0 ${sweep > Math.PI ? 1 : 0} ${sweepFlag} ${num(x1)} ${num(y1)}`);
    this.x = x1;
    this.y = y1;
  }

  addPath(other) {
    this.d.push(...other.d);
    if (other.open) {
      this.open = true;
      this.x = other.x;
      this.y = other.y;
    }
  }

  toString() {
    return this.d.join('');
  }
}

export class SvgContext {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.els = [];
    this.globalAlpha = 1;
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.imageSmoothingEnabled = true;
    this.imageSmoothingQuality = 'low';
  }

  setTransform() {} // SVG stays in CSS pixels; the viewBox does the scaling

  opacity() {
    return this.globalAlpha < 1 ? ` opacity="${num(this.globalAlpha)}"` : '';
  }

  fillRect(x, y, w, h) {
    this.els.push(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="${this.fillStyle}"${this.opacity()}/>`);
  }

  fill(path) {
    const d = path.toString();
    if (d) this.els.push(`<path d="${d}" fill="${this.fillStyle}"${this.opacity()}/>`);
  }

  stroke(path) {
    const d = path.toString();
    if (!d) return;
    // Canvas's default miter limit is 10; SVG's is 4.
    const join = this.lineJoin === 'miter' ? ' stroke-miterlimit="10"' : ` stroke-linejoin="${this.lineJoin}"`;
    this.els.push(`<path d="${d}" fill="none" stroke="${this.strokeStyle}" stroke-width="${num(this.lineWidth)}" stroke-linecap="${this.lineCap}"${join}${this.opacity()}/>`);
  }

  drawImage() {
    throw new Error('drawImage is not supported in SVG export');
  }

  toString() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}">\n${this.els.join('\n')}\n</svg>\n`;
  }
}
