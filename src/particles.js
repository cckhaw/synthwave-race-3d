// Additive particle effects: exhaust / explosion sparks and velocity streaks.

import * as THREE from 'three';
import { GLOW_TEXTURE } from './vehicles.js';

/** Fixed-size pool of glowing point sprites. */
export class Sparks {
  constructor(scene, count = 700) {
    this.count = count;
    this.cursor = 0;
    this.pos = new Float32Array(count * 3).fill(9999);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count).fill(1);
    this.gravity = new Float32Array(count);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.6,
        map: GLOW_TEXTURE,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, color, gravity = 0) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.count;
    const k = i * 3;
    this.pos[k] = x;
    this.pos[k + 1] = y;
    this.pos[k + 2] = z;
    this.vel[k] = vx;
    this.vel[k + 1] = vy;
    this.vel[k + 2] = vz;
    this.base[k] = color.r;
    this.base[k + 1] = color.g;
    this.base[k + 2] = color.b;
    this.life[i] = this.maxLife[i] = life;
    this.gravity[i] = gravity;
  }

  burst(x, y, z, colors, n = 220) {
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2;
      const up = Math.random();
      const power = 6 + Math.random() * 22;
      const r = Math.sqrt(1 - up * up);
      this.emit(
        x + (Math.random() - 0.5),
        y + Math.random(),
        z + (Math.random() - 0.5) * 2,
        Math.cos(theta) * r * power,
        up * power * 0.9,
        Math.sin(theta) * r * power,
        0.7 + Math.random() * 1.1,
        colors[i % colors.length],
        22,
      );
    }
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[k + 1] = 9999;
        continue;
      }
      this.vel[k + 1] -= this.gravity[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.05 && this.gravity[i]) {
        this.pos[k + 1] = 0.05;
        this.vel[k + 1] *= -0.4;
      }
      const f = this.life[i] / this.maxLife[i]; // additive blending: fade = darken
      this.col[k] = this.base[k] * f;
      this.col[k + 1] = this.base[k + 1] * f;
      this.col[k + 2] = this.base[k + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

/** Streaks of light rushing past the camera; they stretch with speed. */
export class SpeedLines {
  constructor(scene, count = 150) {
    this.count = count;
    this.seed = new Float32Array(count * 3);
    this.pos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) this.respawn(i, -Math.random() * 300 + 10);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.material = new THREE.LineBasicMaterial({
      color: 0xaeeaff,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  respawn(i, z) {
    const x = (Math.random() * 2 - 1) * 48;
    // Keep the space right above the road clear so traffic stays readable.
    const y = Math.abs(x) < 8 ? 4.5 + Math.random() * 14 : 0.4 + Math.random() * 18;
    this.seed[i * 3] = x;
    this.seed[i * 3 + 1] = y;
    this.seed[i * 3 + 2] = z;
  }

  update(dt, speed, boost) {
    const len = 0.6 + speed * (0.05 + boost * 0.11);
    for (let i = 0; i < this.count; i++) {
      const s = i * 3;
      this.seed[s + 2] += speed * 1.25 * dt;
      if (this.seed[s + 2] > 14) this.respawn(i, -290 - Math.random() * 30);
      const k = i * 6;
      this.pos[k] = this.pos[k + 3] = this.seed[s];
      this.pos[k + 1] = this.pos[k + 4] = this.seed[s + 1];
      this.pos[k + 2] = this.seed[s + 2];
      this.pos[k + 5] = this.seed[s + 2] - len;
    }
    this.material.opacity = 0.22 + boost * 0.55;
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
