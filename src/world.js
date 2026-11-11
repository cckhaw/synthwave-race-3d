// Static scenery: sky, sun, stars, neon grid, highway and low-poly mountains.
// Nothing here really moves — textures and tiles scroll to fake travel.

import * as THREE from 'three';

export const ROAD_HALF_WIDTH = 6;
export const LANE_WIDTH = 3;
export const LANES = [-4.5, -1.5, 1.5, 4.5];
export const FOG_COLOR = 0x2b0a4a;

const GRID_CELL = 5;
const ROAD_TILE = 12;
const MOUNTAIN_LEN = 300;

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture() {
  return canvasTexture(4, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#02000d');
    grad.addColorStop(0.22, '#0d0230');
    grad.addColorStop(0.36, '#3d0c63');
    grad.addColorStop(0.42, '#2b0a4a');
    grad.addColorStop(1, '#2b0a4a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function sunTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 30, 0, h - 30);
    grad.addColorStop(0, '#fff27a');
    grad.addColorStop(0.45, '#ff9a3c');
    grad.addColorStop(0.75, '#ff2d95');
    grad.addColorStop(1, '#b3149e');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 30, 0, Math.PI * 2);
    g.fill();
    // Classic horizontal cut-outs, getting thicker toward the bottom.
    g.globalCompositeOperation = 'destination-out';
    let y = h * 0.52;
    let bar = 5;
    while (y < h) {
      g.fillRect(0, y, w, bar);
      y += bar + 26 - bar * 0.5;
      bar += 3.2;
    }
  });
}

function glowTexture(inner, outer) {
  return canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function gridTexture() {
  const tex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#0a0118';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff2d95';
    g.lineWidth = 5;
    g.strokeRect(0, 0, w, h);
    g.strokeStyle = '#ffb3dc';
    g.lineWidth = 1.5;
    g.strokeRect(0, 0, w, h);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function roadTexture() {
  const tex = canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#07010f';
    g.fillRect(0, 0, w, h);
    // Neon shoulders.
    g.fillStyle = '#00f0ff';
    g.fillRect(0, 0, 10, h);
    g.fillRect(w - 10, 0, 10, h);
    g.fillStyle = '#eaffff';
    g.fillRect(3, 0, 4, h);
    g.fillRect(w - 7, 0, 4, h);
    // Dashed lane dividers.
    g.fillStyle = '#ff9be0';
    for (let lane = 1; lane < LANES.length; lane++) {
      const x = (w / LANES.length) * lane;
      g.fillRect(x - 3, 0, 6, h * 0.45);
    }
  });
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function mountainGeometry() {
  const segX = 14;
  const segZ = 30;
  const width = 140;
  const geo = new THREE.PlaneGeometry(width, MOUNTAIN_LEN, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  // Heights repeat along Z so consecutive tiles join seamlessly.
  const heights = [];
  for (let j = 0; j < segZ; j++) {
    heights.push(Array.from({ length: segX + 1 }, () => Math.random()));
  }
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const col = Math.round(((pos.getX(i) + width / 2) / width) * segX);
    const row = Math.round(((pos.getZ(i) + MOUNTAIN_LEN / 2) / MOUNTAIN_LEN) * segZ) % segZ;
    const rise = Math.pow(col / segX, 1.25);
    pos.setY(i, col === 0 ? 0 : (0.25 + heights[row][col]) * rise * 46);
  }
  geo.translate(width / 2, 0, 0); // inner edge sits on x = 0
  return geo;
}

export function createWorld(scene, renderer) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  scene.background = skyTexture();
  scene.fog = new THREE.Fog(FOG_COLOR, 70, 330);

  scene.add(new THREE.HemisphereLight(0x8a5cff, 0x1a0030, 1.4));
  const sunLight = new THREE.DirectionalLight(0xff5fb0, 2.6);
  sunLight.position.set(0, 30, -60);
  scene.add(sunLight);

  // --- Sun -------------------------------------------------------------
  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(250, 250),
    new THREE.MeshBasicMaterial({ map: sunTexture(), transparent: true, fog: false, depthWrite: false }),
  );
  sun.position.set(0, 88, -760);
  scene.add(sun);

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 620),
    new THREE.MeshBasicMaterial({
      map: glowTexture('rgba(255,60,160,0.55)', 'rgba(255,60,160,0)'),
      transparent: true,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.position.set(0, 80, -770);
  scene.add(halo);

  // --- Stars -----------------------------------------------------------
  const starCount = 350;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() * 2 - 1) * 900;
    starPos[i * 3 + 1] = 120 + Math.random() * 520;
    starPos[i * 3 + 2] = -780 - Math.random() * 60;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.6 }),
  );
  scene.add(stars);

  // --- Neon grid floor -------------------------------------------------
  const gridTex = gridTexture();
  gridTex.repeat.set(800 / GRID_CELL, 800 / GRID_CELL);
  gridTex.anisotropy = maxAniso;
  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800),
    new THREE.MeshBasicMaterial({ map: gridTex }),
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.set(0, -0.05, -340);
  scene.add(grid);

  // --- Highway ---------------------------------------------------------
  const roadTex = roadTexture();
  roadTex.repeat.set(1, 800 / ROAD_TILE);
  roadTex.anisotropy = maxAniso;
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2 + 0.6, 800),
    new THREE.MeshBasicMaterial({ map: roadTex }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -340);
  scene.add(road);

  // --- Mountains -------------------------------------------------------
  const mGeo = mountainGeometry();
  const mFill = new THREE.MeshBasicMaterial({ color: 0x12032b, side: THREE.DoubleSide });
  const mWire = new THREE.MeshBasicMaterial({ color: 0xb026ff, wireframe: true, transparent: true, opacity: 0.55 });
  const mountainTiles = [];
  for (let k = 0; k < 3; k++) {
    for (const side of [-1, 1]) {
      const tile = new THREE.Group();
      tile.add(new THREE.Mesh(mGeo, mFill));
      const wire = new THREE.Mesh(mGeo, mWire);
      wire.position.y = 0.05;
      tile.add(wire);
      tile.scale.x = side;
      tile.position.x = side * 14;
      tile.userData.index = k;
      scene.add(tile);
      mountainTiles.push(tile);
    }
  }

  let travelled = 0;

  function update(dt, speed) {
    travelled += speed * dt;
    gridTex.offset.y = (travelled / GRID_CELL) % 1;
    roadTex.offset.y = (travelled / ROAD_TILE) % 1;
    const s = travelled % MOUNTAIN_LEN;
    for (const tile of mountainTiles) tile.position.z = s - tile.userData.index * MOUNTAIN_LEN;
  }

  update(0, 0);
  return { update };
}
