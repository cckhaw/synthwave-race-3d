// AI rival racers. Each rival is tracked by its distance ahead of (+) or
// behind (-) the player, steers around traffic, and wears a position tag.

import * as THREE from 'three';
import { makeCar } from './vehicles.js';
import { bend, LANES } from './world.js';
import { ordinal } from './leaderboard.js';

const RIVALS = [
  { name: 'Viper', color: 0x1fbf4a, accent: 0xffffff, skill: 0.985 },
  { name: 'Blaze', color: 0xff7a1a, accent: 0x1b1b1f, skill: 1.0 },
  { name: 'Nova', color: 0x7a3cff, accent: 0xffd23f, skill: 1.02 },
];
const START_GAPS = [14, 27, 40];
const START_LANES = [0, 2, 3];
const CAR_HALF = { w: 0.9, l: 2.05 };
const VISIBLE_AHEAD = 470;
const VISIBLE_BEHIND = 25;

const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Rivals {
  /** @param {HTMLElement} tagLayer container for the floating position tags */
  constructor(scene, tagLayer) {
    this.cars = RIVALS.map((def) => {
      const mesh = makeCar(def.color, { wing: true, accent: def.accent, nitro: true });
      mesh.visible = false;
      scene.add(mesh);
      const tag = document.createElement('div');
      tag.className = 'pos-tag hidden';
      tagLayer.appendChild(tag);
      return { def, mesh, tag, rel: 0, speed: 0, lane: 0, x: 0, vx: 0, boostLeft: 0, boostTimer: 0, tagText: '' };
    });
    this.total = this.cars.length + 1;
    this.scratch = new THREE.Vector3();
  }

  reset() {
    this.cars.forEach((car, i) => {
      car.rel = START_GAPS[i];
      car.speed = 30;
      car.lane = START_LANES[i];
      car.x = LANES[car.lane];
      car.vx = 0;
      car.boostLeft = 0;
      car.boostTimer = 5 + Math.random() * 8;
      car.mesh.visible = true;
      car.mesh.position.set(car.x, 0, -car.rel);
      car.mesh.rotation.set(0, 0, 0);
    });
  }

  hide() {
    for (const car of this.cars) {
      car.mesh.visible = false;
      car.tag.classList.add('hidden');
    }
  }

  /** Player's race position, 1 = leading. */
  playerPosition() {
    return 1 + this.cars.filter((car) => car.rel > 0).length;
  }

  /**
   * @param {object} ctx
   * @param {number} ctx.cruise    un-boosted target speed for this moment of the run
   * @param {number} ctx.playerSpeed
   * @param {number} ctx.playerX
   * @param {number} ctx.trafficSpeed
   * @param {THREE.Object3D[]} ctx.obstacles
   * @param {boolean} ctx.playerSolid  false once the player has crashed
   */
  update(dt, ctx) {
    // Everything a rival has to avoid, in player-relative coordinates.
    const blockers = ctx.obstacles.map((o) => ({ x: o.position.x, z: o.position.z, half: o.userData.half, speed: ctx.trafficSpeed }));
    if (ctx.playerSolid) blockers.push({ x: ctx.playerX, z: 0, half: CAR_HALF, speed: ctx.playerSpeed });
    const rivalBlockers = this.cars.map((car) => ({ x: car.x, z: -car.rel, half: CAR_HALF, speed: car.speed, owner: car }));

    for (const car of this.cars) {
      const z = -car.rel;
      const others = blockers.concat(rivalBlockers.filter((b) => b.owner !== car));

      // --- pace: cruise, rubber-banding and the odd nitro burst ---
      let target = ctx.cruise * car.def.skill;
      if (car.rel > 70) target *= 1 - Math.min(0.3, (car.rel - 70) / 300);
      if (car.rel < -40) target *= 1 + Math.min(0.35, (-car.rel - 40) / 150);
      car.boostTimer -= dt;
      if (car.boostTimer <= 0) {
        car.boostLeft = 1.4 + Math.random() * 1.2;
        car.boostTimer = 7 + Math.random() * 9;
      }
      if (car.boostLeft > 0) {
        car.boostLeft -= dt;
        target *= 1.3;
      }

      // --- traffic: change lane if blocked, otherwise brake behind it ---
      const look = 24 + Math.max(0, car.speed - ctx.trafficSpeed) * 0.6;
      const inLane = (b, laneX) => Math.abs(b.x - laneX) < CAR_HALF.w + b.half.w + 0.35;
      const ahead = (laneX) => {
        let nearest = null;
        for (const b of others) {
          const gap = z - CAR_HALF.l - (b.z + b.half.l); // free road between us
          if (!inLane(b, laneX) || b.z >= z || gap > look) continue;
          if (!nearest || gap < nearest.gap) nearest = { gap, speed: b.speed };
        }
        return nearest;
      };
      const laneFree = (laneX) =>
        !others.some((b) => inLane(b, laneX) && b.z - b.half.l < z + CAR_HALF.l + 3 && b.z + b.half.l > z - look);

      const blocker = ahead(LANES[car.lane]);
      if (blocker && blocker.speed < car.speed) {
        const options = [car.lane - 1, car.lane + 1].filter((l) => l >= 0 && l < LANES.length && laneFree(LANES[l]));
        if (options.length) {
          car.lane = options[Math.floor(Math.random() * options.length)];
        } else {
          target = Math.min(target, blocker.speed + Math.max(0, blocker.gap) * 2);
          if (blocker.gap < 0.6) car.speed = Math.min(car.speed, blocker.speed);
        }
      }

      car.speed = damp(car.speed, target, car.boostLeft > 0 ? 3 : 1.6, dt);
      car.rel = clamp(car.rel + (car.speed - ctx.playerSpeed) * dt, -170, 420);

      // --- contact with the player: a nudge, never a wreck ---
      if (ctx.playerSolid && Math.abs(car.x - ctx.playerX) < 1.75 && Math.abs(car.rel) < 4.1) {
        if (car.rel >= 0) {
          car.rel = 4.1;
          car.speed = Math.max(car.speed, ctx.playerSpeed);
        } else {
          car.rel = -4.1;
          car.speed = Math.min(car.speed, ctx.playerSpeed);
        }
        const away = car.x >= ctx.playerX ? 1 : -1;
        const escape = car.lane + away;
        if (escape >= 0 && escape < LANES.length && Math.abs(LANES[car.lane] - ctx.playerX) < 1.8) car.lane = escape;
      }

      // --- steering and presentation ---
      const prevX = car.x;
      car.x = damp(car.x, LANES[car.lane], 6, dt);
      car.vx = damp(car.vx, (car.x - prevX) / dt, 10, dt);
      car.mesh.visible = car.rel > -VISIBLE_BEHIND && car.rel < VISIBLE_AHEAD;
      car.mesh.position.set(car.x, 0, -car.rel);
      car.mesh.rotation.z = clamp(-car.vx * 0.014, -0.25, 0.25);
      car.mesh.rotation.y = clamp(-car.vx * 0.012, -0.2, 0.2);
      const flame = (car.boostLeft > 0 ? 2.4 : 0.55) * (0.85 + Math.random() * 0.3);
      for (const f of car.mesh.userData.flames) f.scale.set(1, 1, flame);
    }
  }

  /** Place each tag over its car, following the same bend the shader applies. */
  updateTags(camera, width, height, show) {
    const placed = []; // screen spots already taken, so close tags stack instead of overlapping
    // Nearest car first: its tag keeps its spot and farther ones move up.
    for (const car of [...this.cars].sort((a, b) => a.rel - b.rel)) {
      const visible = show && car.mesh.visible && car.rel > 4 && car.rel < 330;
      car.tag.classList.toggle('hidden', !visible);
      if (!visible) continue;

      const place = 1 + this.cars.filter((o) => o.rel > car.rel).length + (car.rel < 0 ? 1 : 0);
      const text = ordinal(place);
      if (text !== car.tagText) {
        car.tagText = text;
        car.tag.textContent = text;
        car.tag.dataset.place = place;
      }

      const v = this.scratch.set(car.x, 2.5, -car.rel).applyMatrix4(camera.matrixWorldInverse);
      const depth = -v.z;
      const zz = v.z * v.z;
      v.x += bend.x.value * zz;
      v.y += bend.y.value * zz;
      v.applyMatrix4(camera.projectionMatrix);
      const scale = clamp(34 / depth, 0.5, 1.25);
      const sx = (v.x * 0.5 + 0.5) * width;
      let sy = (-v.y * 0.5 + 0.5) * height;
      for (const spot of placed) {
        if (Math.abs(spot.x - sx) < 58 * scale + 20 && Math.abs(spot.y - sy) < 30) sy = spot.y - 30;
      }
      placed.push({ x: sx, y: sy });
      car.tag.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    }
  }
}
