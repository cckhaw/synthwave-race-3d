// Analogue speedometer drawn as inline SVG: 270° sweep, red zone, digital readout.

const NS = 'http://www.w3.org/2000/svg';
const MAX_KMH = 540;
const START = 135; // degrees, clockwise from +X (bottom-left)
const SWEEP = 270;

function el(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent?.appendChild(node);
  return node;
}

const angleFor = (kmh) => START + (Math.min(Math.max(kmh, 0), MAX_KMH) / MAX_KMH) * SWEEP;
const polar = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r];
};

function arc(from, to, r) {
  const [x0, y0] = polar(from, r);
  const [x1, y1] = polar(to, r);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

export function createSpeedometer(container) {
  const svg = el('svg', { viewBox: '0 0 200 200', role: 'img', 'aria-label': 'Speedometer' }, container);
  const defs = el('defs', {}, svg);
  const face = el('radialGradient', { id: 'speedo-face', cx: '50%', cy: '40%', r: '65%' }, defs);
  el('stop', { offset: '0', 'stop-color': '#3a1620' }, face);
  el('stop', { offset: '1', 'stop-color': '#0d0a12' }, face);
  const bezel = el('linearGradient', { id: 'speedo-bezel', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
  el('stop', { offset: '0', 'stop-color': '#ffffff' }, bezel);
  el('stop', { offset: '0.5', 'stop-color': '#8d97a5' }, bezel);
  el('stop', { offset: '1', 'stop-color': '#e8edf3' }, bezel);

  el('circle', { cx: 100, cy: 100, r: 98, fill: 'url(#speedo-bezel)' }, svg);
  el('circle', { cx: 100, cy: 100, r: 90, fill: 'url(#speedo-face)' }, svg);
  el('path', { d: arc(angleFor(420), angleFor(MAX_KMH), 80), stroke: '#e3211c', 'stroke-width': 7, fill: 'none' }, svg);

  for (let kmh = 0; kmh <= MAX_KMH; kmh += 30) {
    const major = kmh % 90 === 0;
    const a = angleFor(kmh);
    const [x0, y0] = polar(a, major ? 70 : 76);
    const [x1, y1] = polar(a, 84);
    el('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: '#fff', 'stroke-width': major ? 3 : 1.5, 'stroke-linecap': 'round' }, svg);
    if (major) {
      const [tx, ty] = polar(a, 56);
      const label = el('text', { x: tx, y: ty + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#fff' }, svg);
      label.textContent = kmh;
    }
  }

  const readout = el('text', { x: 100, y: 170, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 900, 'font-style': 'italic', fill: '#fff' }, svg);
  readout.textContent = '0';
  const unit = el('text', { x: 100, y: 183, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#ffd23f' }, svg);
  unit.textContent = 'KM/H';

  const needle = el('g', {}, svg);
  el('polygon', { points: '100,96 100,104 178,100', fill: '#ff5a1f' }, needle);
  el('circle', { cx: 100, cy: 100, r: 9, fill: '#d9dee6', stroke: '#5b6470', 'stroke-width': 2 }, svg);

  let shown = -1;
  let angle = angleFor(0);
  return {
    /** @param {number} kmh @param {number} dt seconds, for needle smoothing */
    set(kmh, dt) {
      angle += (angleFor(kmh) - angle) * (1 - Math.exp(-10 * dt));
      needle.setAttribute('transform', `rotate(${angle.toFixed(1)} 100 100)`);
      const rounded = Math.round(kmh);
      if (rounded !== shown) {
        shown = rounded;
        readout.textContent = rounded;
      }
    },
  };
}
