// Low-poly vehicle and pickup models. Geometries and materials are built
// once and shared; spawning an obstacle is just a cheap Object3D clone.

import * as THREE from 'three';

const bodyMat = new THREE.MeshStandardMaterial({
  color: 0x1a0a33,
  metalness: 0.7,
  roughness: 0.3,
  flatShading: true,
});
const glassMat = new THREE.MeshStandardMaterial({ color: 0x05020c, metalness: 0.9, roughness: 0.15, flatShading: true });
const wheelMat = new THREE.MeshBasicMaterial({ color: 0x050308 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2040 });

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
export const GLOW_TEXTURE = glowTexture();

// Sports-car body: a box with a wedge nose (front faces -Z).
const carBodyGeo = new THREE.BoxGeometry(1.7, 0.46, 3.9);
{
  const p = carBodyGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < 0 && p.getY(i) > 0) p.setY(i, -0.05);
    if (p.getZ(i) < 0) p.setX(i, p.getX(i) * 0.86);
  }
  carBodyGeo.computeVertexNormals();
}
const carCabinGeo = new THREE.BoxGeometry(1.45, 0.42, 1.9);
{
  const p = carCabinGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      p.setX(i, p.getX(i) * 0.72);
      p.setZ(i, p.getZ(i) * 0.5 + 0.1);
    }
  }
  carCabinGeo.computeVertexNormals();
}
const carBodyEdges = new THREE.EdgesGeometry(carBodyGeo);
const carCabinEdges = new THREE.EdgesGeometry(carCabinGeo);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 8);
wheelGeo.rotateZ(Math.PI / 2);
const tailGeo = new THREE.BoxGeometry(1.5, 0.1, 0.06);
const spoilerGeo = new THREE.BoxGeometry(1.7, 0.06, 0.35);
const glowPlaneGeo = new THREE.PlaneGeometry(1, 1);
glowPlaneGeo.rotateX(-Math.PI / 2);

const truckGeo = new THREE.BoxGeometry(2.3, 2.5, 6.2);
const truckEdges = new THREE.EdgesGeometry(truckGeo);
const truckCabGeo = new THREE.BoxGeometry(2.1, 1.7, 1.5);
const truckCabEdges = new THREE.EdgesGeometry(truckCabGeo);
const truckTailGeo = new THREE.BoxGeometry(2.0, 0.14, 0.06);

const lineMats = new Map();
function lineMat(color) {
  if (!lineMats.has(color)) lineMats.set(color, new THREE.LineBasicMaterial({ color }));
  return lineMats.get(color);
}

function underglow(color, w, l) {
  const mesh = new THREE.Mesh(
    glowPlaneGeo,
    new THREE.MeshBasicMaterial({
      map: GLOW_TEXTURE,
      color,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  mesh.scale.set(w, 1, l);
  mesh.position.y = 0.04;
  return mesh;
}

function addWheels(group, x, zs) {
  for (const z of zs) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(side * x, 0.36, z);
      group.add(wheel);
    }
  }
}

export function makeCar(color, { spoiler = false } = {}) {
  const car = new THREE.Group();

  const body = new THREE.Mesh(carBodyGeo, bodyMat);
  body.position.y = 0.52;
  body.add(new THREE.LineSegments(carBodyEdges, lineMat(color)));
  car.add(body);

  const cabin = new THREE.Mesh(carCabinGeo, glassMat);
  cabin.position.set(0, 0.96, 0.45);
  cabin.add(new THREE.LineSegments(carCabinEdges, lineMat(color)));
  car.add(cabin);

  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.position.set(0, 0.6, 1.96);
  car.add(tail);

  if (spoiler) {
    const wing = new THREE.Mesh(spoilerGeo, new THREE.MeshBasicMaterial({ color }));
    wing.position.set(0, 1.0, 1.75);
    car.add(wing);
  }

  addWheels(car, 0.82, [-1.2, 1.25]);
  car.add(underglow(color, 3.4, 6));
  car.userData.half = { w: 0.85, l: 1.95 };
  return car;
}

export function makeTruck(color) {
  const truck = new THREE.Group();

  const box = new THREE.Mesh(truckGeo, bodyMat);
  box.position.set(0, 1.85, 0.6);
  box.add(new THREE.LineSegments(truckEdges, lineMat(color)));
  truck.add(box);

  const cab = new THREE.Mesh(truckCabGeo, glassMat);
  cab.position.set(0, 1.45, -3.3);
  cab.add(new THREE.LineSegments(truckCabEdges, lineMat(color)));
  truck.add(cab);

  for (const y of [0.85, 2.9]) {
    const tail = new THREE.Mesh(truckTailGeo, tailMat);
    tail.position.set(0, y, 3.72);
    truck.add(tail);
  }

  addWheels(truck, 1.05, [-3.2, 1.2, 2.6]);
  truck.add(underglow(color, 4.2, 10));
  truck.userData.half = { w: 1.15, l: 3.9 };
  return truck;
}

const orbGeo = new THREE.OctahedronGeometry(0.6, 0);
const orbEdges = new THREE.EdgesGeometry(orbGeo);
const orbMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.55 });

export function makeOrb() {
  const orb = new THREE.Group();
  const core = new THREE.Mesh(orbGeo, orbMat);
  core.add(new THREE.LineSegments(orbEdges, lineMat(0xffffff)));
  core.position.y = 1.1;
  orb.add(core);
  orb.add(underglow(0x00f0ff, 2.6, 2.6));
  orb.userData.core = core;
  orb.userData.half = { w: 0.8, l: 0.8 };
  return orb;
}
