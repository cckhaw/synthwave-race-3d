// Scenery: daylight sky, clouds, ocean, islands and a striped stunt track
// floating above the sea. Nothing really travels — textures and props
// scroll, and a vertex-shader "bend" makes the track ramp and curve.

import * as THREE from 'three';

export const ROAD_HALF_WIDTH = 6;
export const LANE_WIDTH = 3;
export const LANES = [-4.5, -1.5, 1.5, 4.5];
export const FOG_COLOR = 0xc9ecff;

const TRACK_LEN = 570;
const TRACK_Z = -215;
const TRACK_TILE = 16;
const BLOCK_LEN = 4;
const PILLAR_GAP = 120;
const ARCH_GAP = 260;
const SEA_Y = -46;

// ---------------------------------------------------------------- bending
// Shared uniforms: view-space offset proportional to distance squared.
export const bend = { x: { value: 0 }, y: { value: 0.00028 } };

/** Patch a material so its geometry follows the curved track. */
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

function skyTexture() {
  return canvasTexture(4, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0e63d6');
    grad.addColorStop(0.2, '#2b90ee');
    grad.addColorStop(0.36, '#8fd0fb');
    grad.addColorStop(0.43, '#c9ecff');
    grad.addColorStop(1, '#c9ecff');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/** Equirectangular sky used only for glossy reflections on the cars. */
function environmentTexture() {
  const tex = canvasTexture(512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1d6fe0');
    grad.addColorStop(0.42, '#bfe6ff');
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(0.56, '#ffb040');
    grad.addColorStop(1, '#a85a10');
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
    grad.addColorStop(0, 'rgba(255,255,240,1)');
    grad.addColorStop(0.25, 'rgba(255,250,210,0.5)');
    grad.addColorStop(1, 'rgba(255,250,210,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function trackTexture() {
  const tex = canvasTexture(512, 512, (g, w, h) => {
    // Longitudinal orange / amber stripes.
    const stripes = 12;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? '#ffb52e' : '#ff8f17';
      g.fillRect((w / stripes) * i, 0, w / stripes + 1, h);
    }
    // Soft cross-shading and expansion joints so speed is readable.
    const shade = g.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(120,40,0,0.20)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    shade.addColorStop(1, 'rgba(120,40,0,0.20)');
    g.fillStyle = shade;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(110,40,0,0.45)';
    g.fillRect(0, 0, w, 5);
    // White lane dashes.
    g.fillStyle = 'rgba(255,255,255,0.92)';
    for (let lane = 1; lane < LANES.length; lane++) {
      g.fillRect((w / LANES.length) * lane - 4, h * 0.2, 8, h * 0.45);
    }
    // Solid edge lines.
    g.fillRect(6, 0, 8, h);
    g.fillRect(w - 14, 0, 8, h);
  });
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function seaTexture() {
  const tex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#12a5c4';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const light = Math.random() < 0.5;
      g.strokeStyle = light ? 'rgba(170,245,255,0.5)' : 'rgba(0,90,140,0.35)';
      g.lineWidth = 1 + Math.random() * 2;
      const x = Math.random() * w;
      const y = Math.random() * h;
      const len = 10 + Math.random() * 34;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len / 2, y - 3, x + len, y);
      g.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function stripeTexture() {
  const tex = canvasTexture(64, 8, (g, w, h) => {
    g.fillStyle = '#f4f4f4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e3211c';
    g.fillRect(0, 0, w / 2, h);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ------------------------------------------------------------------ world
export function createWorld(scene, renderer) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  scene.background = skyTexture();
  scene.fog = new THREE.Fog(FOG_COLOR, 230, 480);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envSource = environmentTexture();
  scene.environment = pmrem.fromEquirectangular(envSource).texture;
  envSource.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xffffff, 0xffb070, 1.5));
  const sunLight = new THREE.DirectionalLight(0xfff4dd, 2.4);
  sunLight.position.set(-40, 70, 50);
  scene.add(sunLight);

  // --- Sun glare and clouds (far backdrop, unaffected by fog) -----------
  const glare = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: new THREE.Color(1.15, 1.1, 0.95),
      transparent: true,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glare.position.set(-620, 640, -1900);
  scene.add(glare);

  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTexture(), transparent: true, fog: false, depthWrite: false });
  const cloudGeo = new THREE.PlaneGeometry(1, 1);
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    const w = 420 + Math.random() * 520;
    cloud.scale.set(w, w * (0.28 + Math.random() * 0.14), 1);
    cloud.position.set((Math.random() * 2 - 1) * 2200, 130 + Math.random() * 760, -1850 - i);
    cloud.renderOrder = -1;
    scene.add(cloud);
    clouds.push(cloud);
  }

  // --- Ocean ------------------------------------------------------------
  const seaTex = seaTexture();
  seaTex.repeat.set(70, 70);
  seaTex.anisotropy = maxAniso;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), new THREE.MeshBasicMaterial({ map: seaTex }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, SEA_Y, -900);
  scene.add(sea);

  // --- Islands ----------------------------------------------------------
  const sand = new THREE.MeshLambertMaterial({ color: 0xe2c285, flatShading: true });
  const grass = new THREE.MeshLambertMaterial({ color: 0x58b04a, flatShading: true });
  const islands = [];
  for (let i = 0; i < 9; i++) {
    const radius = 40 + Math.random() * 70;
    const height = 30 + Math.random() * 80;
    const island = new THREE.Group();
    const base = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7, 2), sand);
    base.position.y = height / 2;
    island.add(base);
    if (i % 2 === 0) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.52, height * 0.5, 7), grass);
      cap.position.y = height * 0.76;
      island.add(cap);
    }
    const side = i % 2 ? 1 : -1;
    island.position.set(side * (210 + Math.random() * 330), SEA_Y - 2, -Math.random() * 1000);
    island.rotation.y = Math.random() * 6;
    scene.add(island);
    islands.push(island);
  }

  // --- Track ------------------------------------------------------------
  const trackTex = trackTexture();
  trackTex.repeat.set(1, TRACK_LEN / TRACK_TILE);
  trackTex.anisotropy = maxAniso;
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2 + 0.6, TRACK_LEN, 1, 60),
    bendable(new THREE.MeshLambertMaterial({ map: trackTex })),
  );
  track.rotation.x = -Math.PI / 2;
  track.position.set(0, 0, TRACK_Z);
  track.frustumCulled = false;
  scene.add(track);

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 2.2, 1.2, TRACK_LEN, 1, 1, 60),
    bendable(new THREE.MeshLambertMaterial({ color: 0xc8560c })),
  );
  slab.position.set(0, -0.62, TRACK_Z);
  slab.frustumCulled = false;
  scene.add(slab);

  // Red / white barrier blocks along both edges.
  const blocksPerSide = Math.ceil(TRACK_LEN / BLOCK_LEN);
  const barriers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.75, 0.85, BLOCK_LEN),
    bendable(new THREE.MeshLambertMaterial()),
    blocksPerSide * 2,
  );
  const m = new THREE.Matrix4();
  const red = new THREE.Color(0xe3211c);
  const white = new THREE.Color(0xf6f6f6);
  for (let i = 0; i < blocksPerSide; i++) {
    for (const [s, side] of [-1, 1].entries()) {
      const index = i * 2 + s;
      m.setPosition(side * (ROAD_HALF_WIDTH + 0.7), 0.4, 70 - i * BLOCK_LEN);
      barriers.setMatrixAt(index, m);
      barriers.setColorAt(index, i % 2 ? white : red);
    }
  }
  barriers.frustumCulled = false;
  scene.add(barriers);

  // Support pillars down into the sea.
  const pillarMat = bendable(new THREE.MeshLambertMaterial({ color: 0xe9eef5 }));
  const pillarGeo = new THREE.BoxGeometry(4, 160, 4);
  const pillars = new THREE.Group();
  for (let k = 0; k < Math.ceil(TRACK_LEN / PILLAR_GAP); k++) {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(0, -81, 60 - k * PILLAR_GAP);
    pillar.frustumCulled = false;
    pillars.add(pillar);
  }
  scene.add(pillars);

  // Striped stunt arches over the track.
  const archTex = stripeTexture();
  archTex.repeat.set(14, 1);
  const archGeo = new THREE.TorusGeometry(10.5, 0.75, 8, 28, Math.PI);
  const archMat = bendable(new THREE.MeshLambertMaterial({ map: archTex }));
  const arches = new THREE.Group();
  for (let k = 0; k < Math.ceil(TRACK_LEN / ARCH_GAP); k++) {
    const arch = new THREE.Mesh(archGeo, archMat);
    arch.position.set(0, -0.4, 40 - k * ARCH_GAP);
    arch.frustumCulled = false;
    arches.add(arch);
  }
  scene.add(arches);

  let travelled = 0;

  function update(dt, speed) {
    travelled += speed * dt;
    trackTex.offset.y = (travelled / TRACK_TILE) % 1;
    seaTex.offset.y = (travelled / (3600 / 70)) % 1;
    barriers.position.z = travelled % (BLOCK_LEN * 2);
    pillars.position.z = travelled % PILLAR_GAP;
    arches.position.z = travelled % ARCH_GAP;

    for (const island of islands) {
      island.position.z += speed * dt;
      if (island.position.z > 160) island.position.z -= 1100;
    }
    for (const cloud of clouds) {
      cloud.position.x += dt * 4;
      if (cloud.position.x > 2400) cloud.position.x = -2400;
    }

    // The track sweeps left / right and ramps up toward the sky.
    bend.x.value = Math.sin(travelled * 0.0011) * 0.0004 + Math.sin(travelled * 0.0029) * 0.00016;
    bend.y.value = 0.00028 + Math.sin(travelled * 0.0008) * 0.00014;
  }

  update(0, 0);
  return { update };
}
