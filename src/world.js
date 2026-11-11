// Scenery for every selectable world. Nothing really travels — textures and
// props scroll, and a vertex-shader "bend" makes the road ramp and curve.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const ROAD_HALF_WIDTH = 6;
export const LANE_WIDTH = 3;
export const LANES = [-4.5, -1.5, 1.5, 4.5];

const TRACK_LEN = 570;
const TRACK_Z = -215;
const NEAR_Z = 70; // props recycle once they pass this
const SEA_Y = -46;

/** Player-facing world list (also drives the menu cards). */
export const WORLDS = [
  {
    id: 'sky',
    name: 'Sky Stunt',
    car: 0xff1f8f,
    accent: 0x1b1b1f,
    blueLamps: true,
    thumb: { sky: '#2b90ee', horizon: '#c9ecff', ground: '#12a5c4', road: '#ff9a1f' },
  },
  {
    id: 'country',
    name: 'Country Road',
    car: 0xe8261c,
    accent: 0x1b1b1f,
    thumb: { sky: '#9db0b3', horizon: '#dfe6df', ground: '#7f9457', road: '#6f6f6c' },
  },
  {
    id: 'snow',
    name: 'Alpine Snow',
    car: 0x1557d6,
    accent: 0xf2f4f7,
    thumb: { sky: '#2f7fd6', horizon: '#e8f3ff', ground: '#f1f6fb', road: '#7d858c' },
  },
  {
    id: 'circuit',
    name: 'Sunset Circuit',
    car: 0xffc21a,
    accent: 0x1b1b1f,
    thumb: { sky: '#5a86cc', horizon: '#ffd9ae', ground: '#58a83c', road: '#4b4d52' },
  },
];

const THEMES = {
  sky: {
    sky: [[0, '#0e63d6'], [0.2, '#2b90ee'], [0.36, '#8fd0fb'], [0.43, '#c9ecff']],
    fog: [0xc9ecff, 230, 480],
    env: { top: '#1d6fe0', horizon: '#ffffff', ground: '#ffb040', low: '#a85a10' },
    hemi: [0xffffff, 0xffb070, 1.5],
    sun: [0xfff4dd, 2.4],
    glare: [1.15, 1.1, 0.95],
    clouds: { count: 14, color: 0xffffff, opacity: 1 },
    bend: { curve: 1, rise: 0.00028, riseAmp: 0.00014 },
  },
  country: {
    sky: [[0, '#8fa5ad'], [0.25, '#b4c4c6'], [0.43, '#dfe6df']],
    fog: [0xdfe6df, 170, 470],
    env: { top: '#9db0b3', horizon: '#f2f4ee', ground: '#8a8f7a', low: '#4c5040' },
    hemi: [0xf2f6f4, 0x8f9a72, 1.7],
    sun: [0xfff6e6, 1.5],
    clouds: { count: 10, color: 0xeef2f0, opacity: 0.55 },
    bend: { curve: 0.8, rise: 0.00003, riseAmp: 0.00011 },
  },
  snow: {
    sky: [[0, '#1f6fd0'], [0.22, '#4f9be6'], [0.38, '#b9dcf8'], [0.43, '#e8f3ff']],
    fog: [0xe8f3ff, 190, 480],
    env: { top: '#2f7fd6', horizon: '#ffffff', ground: '#dfe9f2', low: '#8a97a6' },
    hemi: [0xffffff, 0xcfe0f2, 1.7],
    sun: [0xffffff, 2.0],
    glare: [1.1, 1.1, 1.1],
    clouds: { count: 9, color: 0xffffff, opacity: 0.9 },
    bend: { curve: 0.9, rise: 0.00005, riseAmp: 0.00006 },
  },
  circuit: {
    sky: [[0, '#3f6fc0'], [0.18, '#7f9fd6'], [0.31, '#f0b9a0'], [0.4, '#ffd3a0'], [0.43, '#ffe2bd']],
    fog: [0xffe2bd, 210, 490],
    env: { top: '#5a86cc', horizon: '#ffe9c8', ground: '#7a8a5a', low: '#3a3f34' },
    hemi: [0xfff0dc, 0x86a05a, 1.5],
    sun: [0xffd9a8, 2.3],
    glare: [1.2, 0.95, 0.7],
    clouds: { count: 12, color: 0xffc9a8, opacity: 0.85 },
    bend: { curve: 1, rise: 0.00002, riseAmp: 0.00005 },
  },
};

// ---------------------------------------------------------------- bending
// Shared uniforms: view-space offset proportional to distance squared.
export const bend = { x: { value: 0 }, y: { value: 0.00028 } };

/** Patch a material so its geometry follows the curved road. */
export function bendable(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBendX = bend.x;
    shader.uniforms.uBendY = bend.y;
    shader.vertexShader =
      'uniform float uBendX;\nuniform float uBendY;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          float bendZ = mvPosition.z * mvPosition.z;
          mvPosition.x += uBendX * bendZ;
          mvPosition.y += uBendY * bendZ;
          gl_Position = projectionMatrix * mvPosition;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'bend';
  return material;
}

// --------------------------------------------------------------- textures
function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function repeating(tex) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function skyTexture(stops) {
  return canvasTexture(4, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    for (const [at, color] of stops) grad.addColorStop(at, color);
    grad.addColorStop(1, stops[stops.length - 1][1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/** Equirectangular sky used only for glossy reflections on the cars. */
function environmentTexture({ top, horizon, ground, low }) {
  const tex = canvasTexture(512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, top);
    grad.addColorStop(0.5, horizon);
    grad.addColorStop(0.56, ground);
    grad.addColorStop(1, low);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const sun = g.createRadialGradient(150, 60, 0, 150, 60, 70);
    sun.addColorStop(0, 'rgba(255,255,255,1)');
    sun.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, w, h);
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

function cloudTexture() {
  return canvasTexture(256, 128, (g, w, h) => {
    for (let i = 0; i < 16; i++) {
      const x = 40 + Math.random() * (w - 80);
      const y = h * 0.62 - Math.random() * 30 * Math.sin((x / w) * Math.PI);
      const r = 18 + Math.random() * 26;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

function glowTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function stuntTrackTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const stripes = 12;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? '#ffb52e' : '#ff8f17';
      g.fillRect((w / stripes) * i, 0, w / stripes + 1, h);
    }
    const shade = g.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(120,40,0,0.20)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    shade.addColorStop(1, 'rgba(120,40,0,0.20)');
    g.fillStyle = shade;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(110,40,0,0.45)';
    g.fillRect(0, 0, w, 5);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    for (let lane = 1; lane < LANES.length; lane++) {
      g.fillRect((w / LANES.length) * lane - 4, h * 0.2, 8, h * 0.45);
    }
    g.fillRect(6, 0, 8, h);
    g.fillRect(w - 14, 0, 8, h);
  });
}

/** Speckled asphalt with worn wheel tracks; `markings` paints the lines. */
function asphaltTexture(base, markings) {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.10)';
      const s = 1 + Math.random() * 2.5;
      g.fillRect(Math.random() * w, Math.random() * h, s, s);
    }
    // Darker wheel tracks in each lane.
    for (let lane = 0; lane < LANES.length; lane++) {
      for (const off of [-0.26, 0.26]) {
        const x = (w / LANES.length) * (lane + 0.5 + off);
        const grad = g.createLinearGradient(x - 16, 0, x + 16, 0);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.16)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(x - 16, 0, 32, h);
      }
    }
    // Tar seams and patches give a sense of speed.
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, 0, w, 4);
    g.fillRect(0, h * 0.47, w * 0.5, 3);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 70, 14 + Math.random() * 40);
    }
    markings(g, w, h);
  });
}

function countryRoadTexture() {
  return asphaltTexture('#75746f', (g, w, h) => {
    g.fillStyle = '#e8b21c';
    g.fillRect(w / 2 - 11, 0, 7, h);
    g.fillRect(w / 2 + 4, 0, 7, h);
    g.fillStyle = 'rgba(245,245,240,0.9)';
    g.fillRect(12, 0, 8, h);
    g.fillRect(w - 20, 0, 8, h);
    g.strokeStyle = 'rgba(30,30,30,0.5)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      let x = Math.random() * w;
      let y = Math.random() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) g.lineTo((x += Math.random() * 30 - 15), (y += 14 + Math.random() * 18));
      g.stroke();
    }
  });
}

function snowRoadTexture() {
  return asphaltTexture('#868d93', (g, w, h) => {
    g.fillStyle = 'rgba(250,252,255,0.92)';
    for (const lane of [1, 3]) g.fillRect((w / 4) * lane - 4, h * 0.15, 8, h * 0.45);
    g.fillRect(16, 0, 8, h);
    g.fillRect(w - 24, 0, 8, h);
    g.fillStyle = '#e9b52a';
    g.fillRect(w / 2 - 7, h * 0.1, 14, h * 0.55);
    // Snow drifting in from the shoulders.
    for (const [x0, x1] of [[0, 70], [w, w - 70]]) {
      const grad = g.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.75)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(Math.min(x0, x1), 0, 70, h);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 3 + Math.random() * 8, 0, 0, 7);
      g.fill();
    }
  });
}

function circuitRoadTexture() {
  return asphaltTexture('#4d4f55', (g, w, h) => {
    // Red / white kerbs with a white track-limit line inside.
    const blocks = 4;
    for (let i = 0; i < blocks; i++) {
      g.fillStyle = i % 2 ? '#f4f4f4' : '#d8231d';
      g.fillRect(0, (h / blocks) * i, 22, h / blocks + 1);
      g.fillRect(w - 22, (h / blocks) * i, 22, h / blocks + 1);
    }
    g.fillStyle = 'rgba(250,250,250,0.95)';
    g.fillRect(24, 0, 7, h);
    g.fillRect(w - 31, 0, 7, h);
    // Rubbered-in racing line.
    const grad = g.createLinearGradient(w * 0.3, 0, w * 0.7, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(w * 0.3, 0, w * 0.4, h);
  });
}

function groundTexture(base, flecks, blobs = []) {
  return repeating(
    canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (const [color, n, size] of blobs) {
        g.fillStyle = color;
        for (let i = 0; i < n; i++) {
          g.beginPath();
          g.ellipse(Math.random() * w, Math.random() * h, size * (0.5 + Math.random()), size * (0.3 + Math.random() * 0.6), Math.random() * 3, 0, 7);
          g.fill();
        }
      }
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = flecks[i % flecks.length];
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, 2 + Math.random() * 4);
      }
    }),
  );
}

function seaTexture() {
  return repeating(
    canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#12a5c4';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        g.strokeStyle = Math.random() < 0.5 ? 'rgba(170,245,255,0.5)' : 'rgba(0,90,140,0.35)';
        g.lineWidth = 1 + Math.random() * 2;
        const x = Math.random() * w;
        const y = Math.random() * h;
        const len = 10 + Math.random() * 34;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + len / 2, y - 3, x + len, y);
        g.stroke();
      }
    }),
  );
}

function stripeTexture(a = '#e3211c', b = '#f4f4f4') {
  return repeating(
    canvasTexture(64, 8, (g, w, h) => {
      g.fillStyle = b;
      g.fillRect(0, 0, w, h);
      g.fillStyle = a;
      g.fillRect(0, 0, w / 2, h);
    }),
  );
}

/** Steel guard rail: one post per tile, transparent between the beams. */
function guardRailTexture() {
  return repeating(
    canvasTexture(128, 64, (g, w, h) => {
      g.fillStyle = '#6f7780';
      g.fillRect(w / 2 - 5, 14, 10, h - 14);
      const beam = g.createLinearGradient(0, 8, 0, 34);
      beam.addColorStop(0, '#f2f5f8');
      beam.addColorStop(0.5, '#aab3bc');
      beam.addColorStop(1, '#dfe5ea');
      g.fillStyle = beam;
      g.fillRect(0, 8, w, 26);
      g.fillStyle = 'rgba(60,70,80,0.5)';
      g.fillRect(0, 20, w, 2);
    }),
  );
}

/** Concrete wall with a chain-link fence and posts above it. */
function fenceTexture() {
  return repeating(
    canvasTexture(128, 128, (g, w, h) => {
      g.strokeStyle = 'rgba(210,215,220,0.75)';
      g.lineWidth = 1;
      for (let i = -h; i < w + h; i += 9) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + h * 0.72, h * 0.72);
        g.moveTo(i + h * 0.72, 0);
        g.lineTo(i, h * 0.72);
        g.stroke();
      }
      g.fillStyle = '#8b9096';
      g.fillRect(w / 2 - 3, 0, 6, h);
      g.fillRect(0, 0, w, 4);
      g.fillStyle = '#b9b6ad';
      g.fillRect(0, h * 0.72, w, h * 0.28);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, h * 0.72, w, 3);
    }),
  );
}

function tyreWallTexture() {
  return repeating(
    canvasTexture(64, 32, (g, w, h) => {
      g.fillStyle = '#e9e9e6';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8231d';
      g.fillRect(0, 0, w / 2, h);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, h - 5, w, 5);
      g.fillRect(0, 0, 2, h);
      g.fillRect(w / 2, 0, 2, h);
    }),
  );
}

// ------------------------------------------------------------ prop models
function part(geometry, color, x = 0, y = 0, z = 0) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  geo.translate(x, y, z);
  const c = new THREE.Color(color);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function squash(geometry, sx, sy, sz) {
  geometry.scale(sx, sy, sz);
  return geometry;
}

const PROPS = {
  pine: () =>
    mergeGeometries([
      part(new THREE.CylinderGeometry(0.25, 0.38, 1.8, 5), 0x5a4030, 0, 0.9, 0),
      part(new THREE.ConeGeometry(2.3, 2.8, 7), 0x1f6b3a, 0, 3.0, 0),
      part(new THREE.ConeGeometry(1.8, 2.5, 7), 0x237a42, 0, 4.6, 0),
      part(new THREE.ConeGeometry(1.2, 2.2, 7), 0x278548, 0, 6.1, 0),
      part(new THREE.ConeGeometry(1.45, 1.5, 7), 0xf4f8fc, 0, 3.85, 0),
      part(new THREE.ConeGeometry(1.12, 1.35, 7), 0xf4f8fc, 0, 5.35, 0),
      part(new THREE.ConeGeometry(0.8, 1.4, 7), 0xffffff, 0, 6.6, 0),
    ]),
  tree: () =>
    mergeGeometries([
      part(new THREE.CylinderGeometry(0.22, 0.34, 3.2, 5), 0x6a4a2f, 0, 1.6, 0),
      part(squash(new THREE.IcosahedronGeometry(1.9, 0), 1, 0.85, 1), 0x3fae3a, 0, 4.1, 0),
      part(new THREE.IcosahedronGeometry(1.3, 0), 0x55c247, 0.9, 5.0, 0.4),
      part(new THREE.IcosahedronGeometry(1.2, 0), 0x2f9632, -0.9, 3.6, -0.5),
    ]),
  bush: () =>
    mergeGeometries([
      part(squash(new THREE.IcosahedronGeometry(1.5, 0), 1.3, 0.8, 1.1), 0x4f7a35, 0, 0.8, 0),
      part(squash(new THREE.IcosahedronGeometry(1.1, 0), 1.1, 0.9, 1), 0x648f3e, 1.4, 0.7, 0.5),
      part(squash(new THREE.IcosahedronGeometry(1.0, 0), 1, 0.8, 1.2), 0x3e6a2d, -1.3, 0.6, -0.4),
    ]),
  pole: () =>
    mergeGeometries([
      part(new THREE.CylinderGeometry(0.14, 0.18, 9.5, 6), 0x66523f, 0, 4.75, 0),
      part(new THREE.BoxGeometry(2.6, 0.16, 0.16), 0x5a4836, 0, 8.6, 0),
      part(new THREE.BoxGeometry(1.6, 0.14, 0.14), 0x5a4836, 0, 7.8, 0),
    ]),
  hill: (color) => mergeGeometries([part(new THREE.IcosahedronGeometry(1, 1), color)]),
  gantry: (banner, trim) =>
    mergeGeometries([
      part(new THREE.BoxGeometry(0.5, 8, 0.5), 0x8d949c, -9, 4, 0),
      part(new THREE.BoxGeometry(0.5, 8, 0.5), 0x8d949c, 9, 4, 0),
      part(new THREE.BoxGeometry(18.5, 1.9, 0.5), banner, 0, 7.6, 0),
      part(new THREE.BoxGeometry(18.5, 0.3, 0.56), trim, 0, 6.75, 0),
      part(new THREE.BoxGeometry(18.5, 0.3, 0.56), trim, 0, 8.45, 0),
    ]),
  roadSign: () =>
    mergeGeometries([
      part(new THREE.BoxGeometry(0.4, 8.5, 0.4), 0x8d949c, 9, 4.25, 0),
      part(new THREE.BoxGeometry(11, 0.4, 0.4), 0x8d949c, 3.7, 8.4, 0),
      part(new THREE.BoxGeometry(5.2, 2.6, 0.2), 0x1f8a4c, 3.4, 7.0, 0.1),
      part(new THREE.BoxGeometry(4.6, 0.25, 0.24), 0xf4f8fc, 3.4, 7.5, 0.12),
      part(new THREE.BoxGeometry(3.2, 0.25, 0.24), 0xf4f8fc, 2.7, 6.6, 0.12),
    ]),
};

// ------------------------------------------------------------------ world
export function createWorld(scene, renderer, id = 'sky') {
  const theme = THEMES[id] || THEMES.sky;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const root = new THREE.Group();
  scene.add(root);
  const updaters = []; // (travelled, step, dt) => void

  const add = (object, { culled = false } = {}) => {
    object.frustumCulled = culled; // bounds ignore the road bend
    root.add(object);
    return object;
  };
  const propMat = bendable(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));

  // --- shared builders ---------------------------------------------------
  /** Scatter `count` props beside the road and recycle them as they pass. */
  function scatter(geometry, count, { xMin, xMax, scale = [1, 1], sides = [-1, 1], y = 0, stretch }) {
    for (let i = 0; i < count; i++) {
      const mesh = add(new THREE.Mesh(geometry, propMat));
      const side = sides[i % sides.length];
      const s = scale[0] + Math.random() * (scale[1] - scale[0]);
      mesh.position.set(side * (xMin + Math.random() * (xMax - xMin)), y, NEAR_Z - Math.random() * TRACK_LEN);
      if (stretch) mesh.scale.set(s * stretch[0], s * stretch[1], s * stretch[2]);
      else mesh.scale.setScalar(s);
      mesh.rotation.y = Math.random() * 6.28;
      updaters.push((_, step) => {
        mesh.position.z += step;
        if (mesh.position.z > NEAR_Z) mesh.position.z -= TRACK_LEN;
      });
    }
  }

  /** Evenly spaced props (poles, gantries) that slide by as one group. */
  function repeatAlong(geometry, gap, x = 0) {
    const group = add(new THREE.Group());
    for (let k = 0; k < Math.ceil(TRACK_LEN / gap); k++) {
      const mesh = new THREE.Mesh(geometry, propMat);
      mesh.position.set(x, 0, 50 - k * gap);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    updaters.push((travelled) => (group.position.z = travelled % gap));
  }

  /** Vertical textured strip running along the road (rails, fences). */
  function sideStrip(tex, x, height, tile, y = 0) {
    tex.repeat.set(TRACK_LEN / tile, 1);
    tex.anisotropy = maxAniso;
    const geo = new THREE.PlaneGeometry(TRACK_LEN, height, 60, 1);
    geo.rotateY(Math.PI / 2);
    const strip = add(
      new THREE.Mesh(geo, bendable(new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }))),
    );
    strip.position.set(x, y + height / 2, TRACK_Z);
    updaters.push((travelled) => (tex.offset.x = (travelled / tile) % 1));
  }

  function ground(tex, tile) {
    const width = 1800;
    tex.repeat.set(width / tile, TRACK_LEN / tile);
    tex.anisotropy = maxAniso;
    const mesh = add(
      new THREE.Mesh(new THREE.PlaneGeometry(width, TRACK_LEN, 30, 60), bendable(new THREE.MeshLambertMaterial({ map: tex }))),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, -0.08, TRACK_Z);
    updaters.push((travelled) => (tex.offset.y = (travelled / tile) % 1));
  }

  function road(tex, tile) {
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, TRACK_LEN / tile);
    tex.anisotropy = maxAniso;
    const mesh = add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2 + 0.6, TRACK_LEN, 1, 60),
        bendable(new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })),
      ),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0, TRACK_Z);
    updaters.push((travelled) => (tex.offset.y = (travelled / tile) % 1));
  }

  /** Distant, static mountain range (not bent, not fogged). */
  function backdrop(count, { color, cap, height, radius, y = -30 }) {
    const body = new THREE.MeshLambertMaterial({ color, flatShading: true, fog: false });
    const snowCap = cap ? new THREE.MeshLambertMaterial({ color: cap, flatShading: true, fog: false }) : null;
    for (let i = 0; i < count; i++) {
      const h = height[0] + Math.random() * (height[1] - height[0]);
      const r = radius[0] + Math.random() * (radius[1] - radius[0]);
      const x = ((i + Math.random() * 0.7) / count - 0.5) * 5200;
      const z = -1750 - Math.random() * 250;
      const peak = add(new THREE.Mesh(new THREE.ConeGeometry(r, h, 6, 1), body), { culled: true });
      peak.position.set(x, y + h / 2, z);
      peak.rotation.y = Math.random() * 6;
      if (snowCap) {
        const top = add(new THREE.Mesh(new THREE.ConeGeometry(r * 0.46, h * 0.45, 6, 1), snowCap), { culled: true });
        top.position.set(x, y + h * 0.78, z);
        top.rotation.y = peak.rotation.y;
      }
    }
  }

  // --- sky, fog, light ----------------------------------------------------
  scene.background = skyTexture(theme.sky);
  scene.fog = new THREE.Fog(...theme.fog);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envSource = environmentTexture(theme.env);
  const envTarget = pmrem.fromEquirectangular(envSource);
  scene.environment = envTarget.texture;
  envSource.dispose();
  pmrem.dispose();

  root.add(new THREE.HemisphereLight(...theme.hemi));
  const sunLight = new THREE.DirectionalLight(...theme.sun);
  sunLight.position.set(-40, 70, 50);
  root.add(sunLight);

  if (theme.glare) {
    const glare = add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(560, 560),
        new THREE.MeshBasicMaterial({
          map: glowTexture(),
          color: new THREE.Color(...theme.glare),
          transparent: true,
          fog: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
      { culled: true },
    );
    glare.position.set(id === 'circuit' ? 260 : -620, id === 'circuit' ? 170 : 640, -2100);
    glare.renderOrder = -2;
  }

  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTexture(),
    color: theme.clouds.color,
    opacity: theme.clouds.opacity,
    transparent: true,
    fog: false,
    depthWrite: false,
  });
  const cloudGeo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < theme.clouds.count; i++) {
    const cloud = add(new THREE.Mesh(cloudGeo, cloudMat), { culled: true });
    const w = 420 + Math.random() * 520;
    cloud.scale.set(w, w * (0.28 + Math.random() * 0.14), 1);
    cloud.position.set((Math.random() * 2 - 1) * 2200, 260 + Math.random() * 700, -2050 - i);
    cloud.renderOrder = -1;
    updaters.push((_, __, dt) => {
      cloud.position.x += dt * 4;
      if (cloud.position.x > 2400) cloud.position.x = -2400;
    });
  }

  // --- per-world scenery ----------------------------------------------------
  const builders = {
    sky() {
      road(stuntTrackTexture(), 16);

      const seaTex = seaTexture();
      seaTex.repeat.set(70, 70);
      seaTex.anisotropy = maxAniso;
      const sea = add(new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), new THREE.MeshBasicMaterial({ map: seaTex })), { culled: true });
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, SEA_Y, -900);
      updaters.push((travelled) => (seaTex.offset.y = (travelled / (3600 / 70)) % 1));

      const sand = new THREE.MeshLambertMaterial({ color: 0xe2c285, flatShading: true });
      const grass = new THREE.MeshLambertMaterial({ color: 0x58b04a, flatShading: true });
      for (let i = 0; i < 9; i++) {
        const radius = 40 + Math.random() * 70;
        const height = 30 + Math.random() * 80;
        const island = add(new THREE.Group(), { culled: true });
        const base = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7, 2), sand);
        base.position.y = height / 2;
        island.add(base);
        if (i % 2 === 0) {
          const top = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.52, height * 0.5, 7), grass);
          top.position.y = height * 0.76;
          island.add(top);
        }
        island.position.set((i % 2 ? 1 : -1) * (210 + Math.random() * 330), SEA_Y - 2, -Math.random() * 1000);
        island.rotation.y = Math.random() * 6;
        updaters.push((_, step) => {
          island.position.z += step;
          if (island.position.z > 160) island.position.z -= 1100;
        });
      }

      const slab = add(
        new THREE.Mesh(
          new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 2.2, 1.2, TRACK_LEN, 1, 1, 60),
          bendable(new THREE.MeshLambertMaterial({ color: 0xc8560c })),
        ),
      );
      slab.position.set(0, -0.62, TRACK_Z);

      // Red / white barrier blocks along both edges.
      const blockLen = 4;
      const perSide = Math.ceil(TRACK_LEN / blockLen);
      const barriers = add(
        new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 0.85, blockLen), bendable(new THREE.MeshLambertMaterial()), perSide * 2),
      );
      const m = new THREE.Matrix4();
      const red = new THREE.Color(0xe3211c);
      const white = new THREE.Color(0xf6f6f6);
      for (let i = 0; i < perSide; i++) {
        for (const [s, side] of [-1, 1].entries()) {
          m.setPosition(side * (ROAD_HALF_WIDTH + 0.7), 0.4, NEAR_Z - i * blockLen);
          barriers.setMatrixAt(i * 2 + s, m);
          barriers.setColorAt(i * 2 + s, i % 2 ? white : red);
        }
      }
      updaters.push((travelled) => (barriers.position.z = travelled % (blockLen * 2)));

      // Support pillars down into the sea, and striped stunt arches.
      const pillarGap = 120;
      const pillarMat = bendable(new THREE.MeshLambertMaterial({ color: 0xe9eef5 }));
      const pillarGeo = new THREE.BoxGeometry(4, 160, 4);
      const pillars = add(new THREE.Group());
      for (let k = 0; k < Math.ceil(TRACK_LEN / pillarGap); k++) {
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(0, -81, 60 - k * pillarGap);
        pillar.frustumCulled = false;
        pillars.add(pillar);
      }
      updaters.push((travelled) => (pillars.position.z = travelled % pillarGap));

      const archGap = 260;
      const archTex = stripeTexture();
      archTex.repeat.set(14, 1);
      const archGeo = new THREE.TorusGeometry(10.5, 0.75, 8, 28, Math.PI);
      const archMat = bendable(new THREE.MeshLambertMaterial({ map: archTex }));
      const arches = add(new THREE.Group());
      for (let k = 0; k < Math.ceil(TRACK_LEN / archGap); k++) {
        const arch = new THREE.Mesh(archGeo, archMat);
        arch.position.set(0, -0.4, 40 - k * archGap);
        arch.frustumCulled = false;
        arches.add(arch);
      }
      updaters.push((travelled) => (arches.position.z = travelled % archGap));
    },

    country() {
      road(countryRoadTexture(), 18);
      ground(
        groundTexture('#84975a', ['#6f8748', '#9aa867', '#5f7a3f'], [
          ['rgba(176,164,120,0.55)', 14, 26],
          ['rgba(95,120,62,0.5)', 18, 22],
        ]),
        46,
      );
      const bush = PROPS.bush();
      // Thick hedgerows hugging the verge, thinner scrub further out.
      scatter(bush, 46, { xMin: 9.5, xMax: 17, scale: [0.9, 1.9] });
      scatter(bush, 34, { xMin: 18, xMax: 90, scale: [1.2, 3.2] });
      scatter(PROPS.tree(), 20, { xMin: 22, xMax: 130, scale: [1.3, 2.4] });
      scatter(PROPS.hill(0x7d9258), 8, { xMin: 170, xMax: 520, scale: [70, 130], stretch: [1, 0.3, 1], y: -4 });

      repeatAlong(PROPS.pole(), 62, -9.6);
      for (const [dx, y] of [[-1.2, 8.6], [1.2, 8.6], [-0.7, 7.8]]) {
        const wire = add(
          new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, TRACK_LEN, 1, 1, 60), bendable(new THREE.MeshBasicMaterial({ color: 0x2c2c2c }))),
        );
        wire.position.set(-9.6 + dx, y, TRACK_Z);
      }
      backdrop(12, { color: 0xb9c6b8, height: [90, 220], radius: [380, 620] });
    },

    snow() {
      road(snowRoadTexture(), 18);
      ground(groundTexture('#f1f6fb', ['#ffffff', '#dfeaf4', '#e9f1f8'], [['rgba(190,212,232,0.55)', 16, 28]]), 52);
      sideStrip(guardRailTexture(), -(ROAD_HALF_WIDTH + 1.1), 1.1, 4);
      sideStrip(guardRailTexture(), ROAD_HALF_WIDTH + 1.1, 1.1, 4);

      const pine = PROPS.pine();
      scatter(pine, 44, { xMin: 11, xMax: 34, scale: [1.2, 2.3] });
      scatter(pine, 46, { xMin: 36, xMax: 170, scale: [1.6, 3.2] });
      scatter(PROPS.hill(0xf3f7fb), 10, { xMin: 120, xMax: 520, scale: [60, 120], stretch: [1, 0.35, 1], y: -4 });
      repeatAlong(PROPS.roadSign(), 380);
      backdrop(13, { color: 0x7f9fc4, cap: 0xffffff, height: [330, 620], radius: [330, 520] });

      // Falling snow in a box around the camera.
      const count = 500;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() * 2 - 1) * 45;
        pos[i * 3 + 1] = Math.random() * 28;
        pos[i * 3 + 2] = 12 - Math.random() * 90;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      add(
        new THREE.Points(
          geo,
          new THREE.PointsMaterial({ color: 0xffffff, size: 0.32, map: glowTexture(), transparent: true, depthWrite: false }),
        ),
      );
      updaters.push((_, step, dt) => {
        for (let i = 0; i < count; i++) {
          const k = i * 3;
          pos[k] += Math.sin(i + pos[k + 1]) * dt * 0.8;
          pos[k + 1] -= dt * (3 + (i % 5));
          pos[k + 2] += step * 0.55;
          if (pos[k + 1] < 0) pos[k + 1] += 28;
          if (pos[k + 2] > 12) pos[k + 2] -= 90;
        }
        geo.attributes.position.needsUpdate = true;
      });
    },

    circuit() {
      road(circuitRoadTexture(), 16);
      ground(
        groundTexture('#58a83c', ['#4a9632', '#6fbf4c', '#3f8a2c'], [
          ['rgba(120,190,80,0.45)', 16, 26],
          ['rgba(60,130,44,0.4)', 14, 22],
        ]),
        44,
      );
      sideStrip(fenceTexture(), -(ROAD_HALF_WIDTH + 4.5), 3.6, 6);
      sideStrip(tyreWallTexture(), ROAD_HALF_WIDTH + 4.5, 1.0, 3);

      const tree = PROPS.tree();
      scatter(tree, 30, { xMin: 15, xMax: 40, scale: [1.1, 1.9] });
      scatter(tree, 26, { xMin: 44, xMax: 170, scale: [1.5, 2.8] });
      scatter(PROPS.hill(0x5a9a3c), 9, { xMin: 110, xMax: 480, scale: [60, 120], stretch: [1, 0.55, 1], y: -6 });
      repeatAlong(PROPS.gantry(0x1668ff, 0xffd23f), 330);
      backdrop(13, { color: 0x6f9a8a, height: [200, 460], radius: [260, 440] });
    },
  };
  builders[id in builders ? id : 'sky']();

  // --- runtime ----------------------------------------------------------------
  let travelled = 0;

  function update(dt, speed) {
    const step = speed * dt;
    travelled += step;
    for (const fn of updaters) fn(travelled, step, dt);

    // The road sweeps left / right and rolls over crests.
    const b = theme.bend;
    bend.x.value = (Math.sin(travelled * 0.0011) * 0.0004 + Math.sin(travelled * 0.0029) * 0.00016) * b.curve;
    bend.y.value = b.rise + Math.sin(travelled * 0.0008) * b.riseAmp;
  }

  function dispose() {
    scene.remove(root);
    const seen = new Set();
    root.traverse((o) => {
      for (const res of [o.geometry, ...(Array.isArray(o.material) ? o.material : [o.material])]) {
        if (!res || seen.has(res)) continue;
        seen.add(res);
        res.map?.dispose();
        res.dispose();
      }
    });
    scene.background?.dispose();
    envTarget.dispose();
  }

  update(0, 0);
  return { update, dispose, id };
}
