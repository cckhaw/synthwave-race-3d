// Glossy arcade vehicle and pickup models. Geometries and materials are
// built once and shared between every instance.

import * as THREE from 'three';
import { bendable } from './world.js';

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
export const GLOW_TEXTURE = radialTexture([
  [0, 'rgba(255,255,255,1)'],
  [0.4, 'rgba(255,255,255,0.4)'],
  [1, 'rgba(255,255,255,0)'],
]);
const SHADOW_TEXTURE = radialTexture([
  [0, 'rgba(0,0,0,0.75)'],
  [0.55, 'rgba(0,0,0,0.5)'],
  [1, 'rgba(0,0,0,0)'],
]);

// ---------------------------------------------------------------- materials
const paints = new Map();
function paint(color) {
  if (!paints.has(color)) {
    paints.set(
      color,
      bendable(new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.2, envMapIntensity: 1.25 })),
    );
  }
  return paints.get(color);
}
const glassMat = bendable(new THREE.MeshStandardMaterial({ color: 0x0b1220, metalness: 0.9, roughness: 0.08, envMapIntensity: 1.6 }));
const darkMat = bendable(new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.3, roughness: 0.6 }));
const tyreMat = bendable(new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 }));
const rimMat = bendable(new THREE.MeshStandardMaterial({ color: 0xcfd6e0, metalness: 0.9, roughness: 0.25 }));
const chromeMat = bendable(new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.15 }));
// Colours above 1.0 are picked up by the bloom pass.
const blueLightMat = bendable(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.95, 2.2) }));
const redLightMat = bendable(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.35, 0.08, 0.06) }));
const shadowMat = bendable(
  new THREE.MeshBasicMaterial({
    map: SHADOW_TEXTURE,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  }),
);
const flameOuterMat = bendable(
  new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.08, 0.5, 2.4),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  }),
);
const flameCoreMat = bendable(
  new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.75, 1.5, 2.6),
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  }),
);

// --------------------------------------------------------------- geometries
/** Extrude a side profile (x = length, y = height) across the car's width. */
function profileGeometry(points, width, bevel) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 1,
  });
  geo.rotateY(-Math.PI / 2); // profile length -> Z (front is -Z), extrusion -> X
  geo.translate(width / 2 - bevel, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

const carBodyGeo = profileGeometry(
  [
    [-2.0, 0.3],
    [-1.92, 0.5],
    [-1.0, 0.68],
    [0.2, 0.74],
    [1.3, 0.8],
    [1.98, 0.9],
    [2.05, 0.42],
    [1.9, 0.24],
    [-1.85, 0.22],
  ],
  1.9,
  0.14,
);
const carCabinGeo = profileGeometry(
  [
    [-0.85, 0.66],
    [-0.2, 1.1],
    [0.55, 1.12],
    [1.35, 0.78],
  ],
  1.42,
  0.1,
);
const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.34, 16);
wheelGeo.rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.36, 10);
rimGeo.rotateZ(Math.PI / 2);
const roundLightGeo = new THREE.CircleGeometry(0.2, 16);
const lightBarGeo = new THREE.BoxGeometry(0.5, 0.07, 0.05);
const diffuserGeo = new THREE.BoxGeometry(1.5, 0.22, 0.12);
const exhaustGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.25, 10);
exhaustGeo.rotateX(Math.PI / 2);
const wingGeo = new THREE.BoxGeometry(1.95, 0.07, 0.42);
const wingPostGeo = new THREE.BoxGeometry(0.08, 0.3, 0.2);
const mirrorGeo = new THREE.BoxGeometry(0.26, 0.12, 0.16);
const stripeGeo = new THREE.BoxGeometry(0.34, 0.02, 1.1);
const planeGeo = new THREE.PlaneGeometry(1, 1);
planeGeo.rotateX(-Math.PI / 2);
const flameGeo = new THREE.ConeGeometry(0.17, 1, 10, 1, true);
flameGeo.rotateX(Math.PI / 2); // tip points backwards (+Z)
flameGeo.translate(0, 0, 0.5);

const vanBoxGeo = profileGeometry(
  [
    [-2.2, 0.55],
    [-2.2, 3.0],
    [3.5, 3.0],
    [3.5, 0.55],
  ],
  2.4,
  0.12,
);
const vanCabGeo = profileGeometry(
  [
    [-4.0, 0.5],
    [-4.0, 1.5],
    [-3.6, 2.4],
    [-2.35, 2.4],
    [-2.35, 0.5],
  ],
  2.3,
  0.12,
);
const vanDoorGeo = new THREE.BoxGeometry(1.9, 1.9, 0.06);
const vanLightGeo = new THREE.BoxGeometry(0.22, 0.5, 0.06);
const vanBumperGeo = new THREE.BoxGeometry(2.3, 0.26, 0.2);

// ------------------------------------------------------------------ helpers
function shadow(w, l) {
  const mesh = new THREE.Mesh(planeGeo, shadowMat);
  mesh.scale.set(w, 1, l);
  mesh.position.y = 0.03;
  return mesh;
}

function addWheels(group, x, zs, scale = 1) {
  for (const z of zs) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, tyreMat);
      wheel.add(new THREE.Mesh(rimGeo, rimMat));
      wheel.scale.setScalar(scale);
      wheel.position.set(side * x, 0.4 * scale, z);
      group.add(wheel);
    }
  }
}

function addFlame(group, x, y, z) {
  const flame = new THREE.Group();
  flame.add(new THREE.Mesh(flameGeo, flameOuterMat));
  const core = new THREE.Mesh(flameGeo, flameCoreMat);
  core.scale.set(0.5, 0.5, 0.6);
  flame.add(core);
  flame.position.set(x, y, z);
  group.add(flame);
  return flame;
}

function finish(group) {
  group.traverse((o) => (o.frustumCulled = false)); // bounds ignore the track bend
  return group;
}

// ------------------------------------------------------------------- models
export function makeCar(color, { wing = false, accent = 0xffffff, nitro = false, blueLamps = false } = {}) {
  const car = new THREE.Group();

  car.add(new THREE.Mesh(carBodyGeo, paint(color)));
  car.add(new THREE.Mesh(carCabinGeo, glassMat));

  const stripe = new THREE.Mesh(stripeGeo, paint(accent));
  stripe.position.set(0, 0.905, 1.5);
  stripe.rotation.x = -0.135;
  car.add(stripe);

  // Rear fascia: round lamps, light bars, diffuser and twin exhausts.
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(roundLightGeo, blueLamps ? blueLightMat : redLightMat);
    lamp.position.set(side * 0.62, 0.66, 2.2);
    car.add(lamp);
    const bar = new THREE.Mesh(lightBarGeo, blueLamps ? blueLightMat : redLightMat);
    bar.position.set(side * 0.2, 0.66, 2.19);
    car.add(bar);
    const pipe = new THREE.Mesh(exhaustGeo, chromeMat);
    pipe.position.set(side * 0.42, 0.3, 2.14);
    car.add(pipe);
    const mirror = new THREE.Mesh(mirrorGeo, paint(color));
    mirror.position.set(side * 0.98, 0.86, -0.45);
    car.add(mirror);
  }
  const diffuser = new THREE.Mesh(diffuserGeo, darkMat);
  diffuser.position.set(0, 0.3, 2.12);
  car.add(diffuser);

  if (wing) {
    const blade = new THREE.Mesh(wingGeo, paint(accent));
    blade.position.set(0, 1.2, 1.78);
    car.add(blade);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(wingPostGeo, darkMat);
      post.position.set(side * 0.62, 1.04, 1.78);
      car.add(post);
    }
  }

  addWheels(car, 0.9, [-1.25, 1.3]);
  car.add(shadow(3.2, 5.6));

  car.userData.flames = nitro ? [addFlame(car, -0.42, 0.3, 2.24), addFlame(car, 0.42, 0.3, 2.24)] : [];
  car.userData.half = { w: 0.9, l: 2.05 };
  return finish(car);
}

export function makeTruck(color) {
  const truck = new THREE.Group();

  truck.add(new THREE.Mesh(vanBoxGeo, paint(0xf2f4f7)));
  truck.add(new THREE.Mesh(vanCabGeo, paint(color)));

  const door = new THREE.Mesh(vanDoorGeo, paint(color));
  door.position.set(0, 1.85, 3.62);
  truck.add(door);
  const bumper = new THREE.Mesh(vanBumperGeo, darkMat);
  bumper.position.set(0, 0.6, 3.6);
  truck.add(bumper);
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(vanLightGeo, redLightMat);
    lamp.position.set(side * 1.05, 1.2, 3.63);
    truck.add(lamp);
  }

  addWheels(truck, 1.08, [-3.1, 1.6, 2.7], 1.25);
  truck.add(shadow(4.2, 10.5));
  truck.userData.flames = [];
  truck.userData.half = { w: 1.2, l: 3.9 };
  return finish(truck);
}

// Nitro canister pickup.
const bottleGeo = new THREE.CapsuleGeometry(0.3, 0.7, 4, 12);
const capGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.22, 10);
const bandGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.2, 12);
const ringGeo = new THREE.TorusGeometry(0.95, 0.06, 6, 28);
const bottleMat = bendable(new THREE.MeshStandardMaterial({ color: 0x1668ff, metalness: 0.7, roughness: 0.18, envMapIntensity: 1.4 }));

export function makeNitro() {
  const pickup = new THREE.Group();
  const core = new THREE.Group();
  const bottle = new THREE.Mesh(bottleGeo, bottleMat);
  const cap = new THREE.Mesh(capGeo, chromeMat);
  cap.position.y = 0.72;
  const band = new THREE.Mesh(bandGeo, paint(0xffffff));
  bottle.add(cap, band);
  bottle.rotation.z = 0.35;
  core.add(bottle);
  const ring = new THREE.Mesh(ringGeo, blueLightMat);
  core.add(ring);
  core.position.y = 1.25;
  pickup.add(core);
  pickup.add(shadow(1.8, 1.8));
  pickup.userData.core = core;
  pickup.userData.half = { w: 0.9, l: 0.9 };
  return finish(pickup);
}
