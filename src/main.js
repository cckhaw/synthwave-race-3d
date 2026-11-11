import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import './style.css';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { createWorld, LANES, ROAD_HALF_WIDTH, WORLDS } from './world.js';
import { makeCar, makeTruck, makeNitro } from './vehicles.js';
import { Sparks, SpeedLines } from './particles.js';
import { Rivals } from './rivals.js';
import { createSpeedometer } from './speedometer.js';
import * as scores from './leaderboard.js';
import * as globalBoard from './global.js';

// ------------------------------------------------------------------ tuning
const BASE_SPEED = 45; // world units / second
const MAX_EXTRA_SPEED = 60;
const TRAFFIC_SPEED = 14;
const SPAWN_Z = -430;
const STEER_SPEED = 15;
const BOOST_FACTOR = 1.65;
const BOOST_DRAIN = 1 / 3.2; // energy per second while boosting
const BOOST_REGEN = 1 / 10;
const BOOST_MIN = 0.3;
const FOV_NORMAL = 64;
const FOV_BOOST = 96;
const POSITION_BONUS = [1.5, 1.25, 1.1, 1]; // score multiplier for 1st..4th
const WORLD_KEY = 'synthwave-racer-3d:world';
const TRAFFIC = [
  [0x1fbf4a, 0xffffff],
  [0x12b5c9, 0xffd23f],
  [0xffc91a, 0x1b1b1f],
  [0x7a3cff, 0xffd23f],
  [0xf23a2a, 0xffffff],
  [0xf4f6f8, 0x1668ff],
  [0xff7a1a, 0x1b1b1f],
];

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// ------------------------------------------------------------------- setup
const canvas = $('game');
const coarse = window.matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV_NORMAL, 1, 0.5, 2600);

const sparks = new Sparks(scene);
const speedLines = new SpeedLines(scene);

// The world and the player's car are rebuilt whenever a world is picked.
let world = null;
let player = null;
let worldId = null;

function setWorld(id) {
  const def = WORLDS.find((w) => w.id === id) || WORLDS[0];
  if (def.id === worldId) return;
  worldId = def.id;
  world?.dispose();
  world = createWorld(scene, renderer, def.id);

  const x = player ? player.position.x : LANES[1];
  if (player) scene.remove(player);
  player = makeCar(def.car, { wing: true, accent: def.accent, nitro: true, blueLamps: !!def.blueLamps });
  player.position.x = x;
  scene.add(player);

  try {
    localStorage.setItem(WORLD_KEY, def.id);
  } catch {
    /* storage unavailable */
  }
  scores.recoverUnfinishedRun(def.id);
  game.best = scores.worldBest(def.id);
  ui.best.textContent = fmt(game.best);
  refreshBoard('start');
  for (const card of document.querySelectorAll('.world-card')) {
    const selected = card.dataset.world === def.id;
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  }
}

function savedWorld() {
  try {
    return localStorage.getItem(WORLD_KEY);
  } catch {
    return null;
  }
}

const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: coarse ? 0 : 4 }),
);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let aspect = 1;
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  aspect = w / h;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

const audio = new AudioEngine();
const input = new Input(canvas);

// --------------------------------------------------------------------- hud
const ui = {
  hud: $('hud'),
  score: $('score'),
  best: $('best'),
  position: $('position'),
  tags: $('tags'),
  finalPlace: $('final-place'),
  name: $('driver-name'),
  mult: $('multiplier'),
  boost: $('btn-boost'),
  start: $('overlay-start'),
  pause: $('overlay-pause'),
  over: $('overlay-over'),
  finalScore: $('final-score'),
  newBest: $('new-best'),
  touch: $('touch-controls'),
  btnPause: $('btn-pause'),
  btnMute: $('btn-mute'),
};
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

// ------------------------------------------------------------ leaderboards
// Two panels (start screen, game-over screen) share one Global / This device
// toggle. Global falls back to the device table when the API is unreachable.
const boards = {
  start: { title: $('board-title'), list: $('board-start'), note: $('board-note'), tabs: $('board-tabs') },
  over: { title: $('board-over-title'), list: $('board-over'), note: $('board-over-note'), tabs: $('board-over-tabs') },
};
let boardMode = 'global'; // 'global' | 'device'
const lastRun = { localRank: -1, global: null }; // result of the run just finished

async function refreshBoard(which) {
  const board = boards[which];
  const world = worldId;
  const isOver = which === 'over';
  board.title.textContent = `Top ${scores.MAX_ENTRIES} · ${WORLDS.find((w) => w.id === world).name}`;
  for (const tab of board.tabs.children) {
    const selected = tab.dataset.mode === boardMode;
    tab.classList.toggle('selected', selected);
    tab.setAttribute('aria-pressed', String(selected));
  }
  const showDevice = (note) => {
    scores.renderBoard(board.list, scores.getBoard(world), isOver ? lastRun.localRank : -1);
    board.note.textContent = note;
  };
  if (boardMode === 'device') return showDevice('Scores set on this device');

  if (isOver && lastRun.global) {
    const { rank, entries } = lastRun.global;
    scores.renderBoard(board.list, entries, rank ? rank - 1 : -1);
    board.note.textContent = rank ? `Your global rank: #${rank}` : 'All players, worldwide';
    return;
  }
  board.note.textContent = 'Loading global scores…';
  const entries = await globalBoard.fetchTop(world);
  if (world !== worldId || boardMode !== 'global' || (isOver && lastRun.global)) return; // superseded
  if (!entries) return showDevice('Global board unavailable — showing this device');
  scores.renderBoard(board.list, entries);
  board.note.textContent = 'All players, worldwide';
}

for (const which of Object.keys(boards)) {
  boards[which].tabs.addEventListener('click', (e) => {
    const mode = e.target.dataset?.mode;
    if (!mode) return;
    boardMode = mode;
    e.target.blur();
    refreshBoard(which);
  });
}

const speedometer = createSpeedometer($('speedometer'));
const rivals = new Rivals(scene, ui.tags);

// ------------------------------------------------------------------- state
const game = {
  state: 'menu', // menu | playing | paused | crashed | over
  time: 0,
  speed: 28,
  score: 0,
  best: 0,
  position: 4,
  bestSaveTimer: 0,
  energy: 0.5,
  boosting: false,
  boostBlend: 0,
  targetX: LANES[1],
  velX: 0,
  spawnDist: 0,
  nextGap: 80,
  safeLane: 1,
  crashTimer: 0,
  shake: 0,
  exhaustTimer: 0,
};
const obstacles = [];
const pickups = [];
let useTouchUi = coarse;
document.body.classList.toggle('touch', coarse);

function clearEntities() {
  for (const o of obstacles) scene.remove(o);
  for (const p of pickups) scene.remove(p);
  obstacles.length = 0;
  pickups.length = 0;
}

function startGame() {
  audio.init();
  audio.resume();
  audio.startMusic();
  audio.startEngine();
  input.reset();
  clearEntities();

  Object.assign(game, {
    state: 'playing',
    time: 0,
    speed: 30,
    score: 0,
    position: rivals.total,
    energy: 0.5,
    boosting: false,
    targetX: LANES[1],
    velX: 0,
    spawnDist: 0,
    nextGap: 110,
    safeLane: 1,
    shake: 0,
  });
  player.visible = true;
  player.position.set(LANES[1], 0, 0);
  player.rotation.set(0, 0, 0);
  rivals.reset();
  scores.setName(ui.name.value);
  globalBoard.beginRun(worldId);
  ui.name.blur();

  ui.start.classList.add('hidden');
  ui.over.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.btnPause.classList.remove('hidden');
  ui.touch.classList.toggle('hidden', !useTouchUi);
  ui.boost.classList.remove('hidden');
}

function setPaused(paused) {
  if (paused && game.state === 'playing') {
    game.state = 'paused';
    audio.suspend();
    ui.pause.classList.remove('hidden');
  } else if (!paused && game.state === 'paused') {
    game.state = 'playing';
    audio.resume();
    input.reset();
    ui.pause.classList.add('hidden');
  }
}

function crash(obstacle) {
  game.state = 'crashed';
  game.crashTimer = 1.1;
  game.boosting = false;
  game.shake = 1;
  player.visible = false;
  audio.stopEngine();
  audio.crash();
  const palette = [new THREE.Color(2.4, 1.1, 0.2), new THREE.Color(2.2, 0.4, 0.1), new THREE.Color(0xfff3c4), new THREE.Color(0x2a2a30), new THREE.Color(0xff1f8f)];
  sparks.burst(player.position.x, 0.6, -1, palette, 260);
  sparks.burst(obstacle.position.x, 0.8, obstacle.position.z + obstacle.userData.half.l, palette, 80);
  if (navigator.vibrate) navigator.vibrate(180);
}

function showMenu() {
  if (game.state !== 'over') return;
  clearEntities();
  game.state = 'menu';
  player.visible = true;
  rivals.hide();
  refreshBoard('start');
  ui.over.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.start.classList.remove('hidden');
}

function showGameOver() {
  game.state = 'over';
  const result = { name: scores.getName(), score: game.score, place: game.position };
  const world = worldId;
  const { rank } = scores.addScore(world, result);
  lastRun.localRank = rank;
  lastRun.global = null;
  globalBoard.submit(world, result).then((submitted) => {
    if (!submitted || world !== worldId || game.state !== 'over') return;
    lastRun.global = submitted;
    refreshBoard('over');
  });
  scores.clearRunInProgress(worldId);
  game.best = scores.worldBest(worldId);
  ui.finalScore.textContent = fmt(game.score);
  ui.finalPlace.textContent = `Finished ${scores.ordinal(game.position)} of ${rivals.total}`;
  ui.best.textContent = fmt(game.best);
  ui.newBest.classList.toggle('hidden', rank !== 0);
  refreshBoard('over');
  ui.over.classList.remove('hidden');
  ui.touch.classList.add('hidden');
  ui.boost.classList.add('hidden');
  ui.btnPause.classList.add('hidden');
}

// ---------------------------------------------------------------- spawning
function spawnRow() {
  const difficulty = Math.min(game.time / 90, 1);
  // The guaranteed-free lane only drifts one lane per row, so there is
  // always a reachable path through the traffic.
  game.safeLane = clamp(game.safeLane + Math.floor(Math.random() * 3) - 1, 0, LANES.length - 1);
  const candidates = LANES.map((_, i) => i).filter((i) => i !== game.safeLane);
  candidates.sort(() => Math.random() - 0.5);
  const maxBlocked = difficulty > 0.45 ? 3 : 2;
  const blocked = candidates.slice(0, 1 + Math.floor(Math.random() * maxBlocked));

  for (const lane of blocked) {
    const [color, accent] = TRAFFIC[Math.floor(Math.random() * TRAFFIC.length)];
    const vehicle = Math.random() < 0.2 ? makeTruck(color) : makeCar(color, { accent, wing: Math.random() < 0.4 });
    vehicle.position.set(LANES[lane], 0, SPAWN_Z - Math.random() * 8);
    scene.add(vehicle);
    obstacles.push(vehicle);
  }

  if (Math.random() < 0.38) {
    const free = LANES.map((_, i) => i).filter((i) => !blocked.includes(i));
    const orb = makeNitro();
    orb.position.set(LANES[free[Math.floor(Math.random() * free.length)]], 0, SPAWN_Z - 22);
    scene.add(orb);
    pickups.push(orb);
  }

  game.nextGap = THREE.MathUtils.lerp(78, 44, difficulty) + Math.random() * 26;
}

function overlaps(entity, shrink) {
  const half = entity.userData.half;
  return (
    Math.abs(entity.position.x - player.position.x) < (0.9 + half.w) * shrink &&
    Math.abs(entity.position.z - player.position.z) < (2.05 + half.l) * shrink
  );
}

// ------------------------------------------------------------------ update
const exhaustNormal = new THREE.Color(0.9, 0.95, 1.0);
const exhaustBoost = new THREE.Color(0.1, 0.55, 2.2);
const exhaustHot = new THREE.Color(0.8, 1.4, 2.4);

function updatePlaying(dt) {
  game.time += dt;

  // --- turbo ---
  const wantsBoost = input.boost || input.takeBoostTap();
  if (!game.boosting && wantsBoost && game.energy >= BOOST_MIN) {
    game.boosting = true;
    audio.boost();
  }
  if (game.boosting) {
    game.energy -= BOOST_DRAIN * dt;
    if (game.energy <= 0) {
      game.energy = 0;
      game.boosting = false;
    }
  } else {
    game.energy = Math.min(1, game.energy + BOOST_REGEN * dt);
  }

  // --- speed ---
  const cruise = BASE_SPEED + Math.min(game.time * 1.0, MAX_EXTRA_SPEED);
  let target = cruise;
  if (game.boosting) target *= BOOST_FACTOR;
  else if (input.brake) target *= 0.62;
  game.speed = damp(game.speed, target, game.boosting ? 3.5 : 1.8, dt);

  // --- steering: continuous axis + swipe lane snapping ---
  const limit = ROAD_HALF_WIDTH - 1.0;
  game.targetX += input.steer * STEER_SPEED * dt;
  const shift = input.takeLaneShift();
  if (shift) {
    let nearest = 0;
    LANES.forEach((x, i) => {
      if (Math.abs(x - game.targetX) < Math.abs(LANES[nearest] - game.targetX)) nearest = i;
    });
    game.targetX = LANES[clamp(nearest + shift, 0, LANES.length - 1)];
  }
  game.targetX = clamp(game.targetX, -limit, limit);
  const prevX = player.position.x;
  player.position.x = damp(prevX, game.targetX, 14, dt);
  game.velX = damp(game.velX, (player.position.x - prevX) / dt, 12, dt);
  player.rotation.z = clamp(-game.velX * 0.014, -0.3, 0.3);
  player.rotation.y = clamp(-game.velX * 0.012, -0.25, 0.25);

  // --- score ---
  const mult = currentMultiplier();
  game.score += game.speed * dt * 0.12 * mult;
  if (game.score > game.best) game.best = game.score;
  game.bestSaveTimer += dt;
  if (game.bestSaveTimer > 1) {
    game.bestSaveTimer = 0;
    scores.saveRunInProgress(worldId, game.score); // persist continuously, not just on game over
  }

  // --- rivals ---
  rivals.update(dt, {
    cruise,
    playerSpeed: game.speed,
    playerX: player.position.x,
    trafficSpeed: TRAFFIC_SPEED,
    obstacles,
    playerSolid: true,
  });
  game.position = rivals.playerPosition();

  // --- traffic ---
  game.spawnDist += (game.speed - TRAFFIC_SPEED) * dt;
  if (game.spawnDist >= game.nextGap) {
    game.spawnDist = 0;
    spawnRow();
  }
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.position.z += (game.speed - TRAFFIC_SPEED) * dt;
    if (overlaps(o, 0.88)) {
      crash(o);
      return;
    }
    if (o.position.z > 16) {
      scene.remove(o);
      obstacles.splice(i, 1);
    }
  }
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.position.z += game.speed * dt;
    p.userData.core.rotation.y += dt * 3;
    p.userData.core.position.y = 1.25 + Math.sin(game.time * 4 + i) * 0.15;
    if (overlaps(p, 1.1)) {
      game.energy = Math.min(1, game.energy + 0.3);
      game.score += 150 * mult;
      audio.pickup();
      for (let n = 0; n < 24; n++) {
        sparks.emit(p.position.x, 1.1, p.position.z, (Math.random() - 0.5) * 12, Math.random() * 9, 6 + Math.random() * 10, 0.5, exhaustBoost, 12);
      }
      scene.remove(p);
      pickups.splice(i, 1);
    } else if (p.position.z > 16) {
      scene.remove(p);
      pickups.splice(i, 1);
    }
  }

  // --- exhaust trail ---
  game.exhaustTimer -= dt;
  if (game.exhaustTimer <= 0 && game.boosting) {
    game.exhaustTimer = game.boosting ? 0.008 : 0.05;
    const color = game.boosting ? (Math.random() < 0.3 ? exhaustHot : exhaustBoost) : exhaustNormal;
    for (const side of [-0.42, 0.42]) {
      sparks.emit(
        player.position.x + side + (Math.random() - 0.5) * 0.15,
        0.3 + Math.random() * 0.08,
        2.4 + game.boostBlend * 1.6,
        (Math.random() - 0.5) * 1.2,
        Math.random() * 0.8,
        game.speed * (game.boosting ? 0.5 : 0.3),
        game.boosting ? 0.55 : 0.35,
        color,
      );
    }
  }

  audio.setEngine(game.speed, game.boosting);
}

function currentMultiplier() {
  const fromSpeed = 1 + Math.max(0, game.speed - BASE_SPEED) / 40;
  return fromSpeed * (game.boosting ? 2 : 1) * POSITION_BONUS[game.position - 1];
}

function updateCrashed(dt) {
  game.speed = damp(game.speed, 0, 4, dt);
  for (const o of obstacles) o.position.z += (game.speed - TRAFFIC_SPEED) * dt; // traffic drives on
  rivals.update(dt, {
    cruise: BASE_SPEED + Math.min(game.time, MAX_EXTRA_SPEED),
    playerSpeed: game.speed,
    playerX: player.position.x,
    trafficSpeed: TRAFFIC_SPEED,
    obstacles,
    playerSolid: false,
  });
  game.crashTimer -= dt;
  if (game.crashTimer <= 0 && game.state === 'crashed') showGameOver();
}

function updateCamera(dt, t) {
  game.boostBlend = damp(game.boostBlend, game.boosting ? 1 : 0, game.boosting ? 5 : 2.5, dt);
  const portrait = clamp(1.25 - aspect, 0, 0.8);
  const fov = FOV_NORMAL + (FOV_BOOST - FOV_NORMAL) * game.boostBlend + portrait * 10;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  const menu = game.state === 'menu';
  const follow = 0.6 + portrait * 0.4;
  const tx = menu ? Math.sin(t * 0.3) * 2.5 : player.position.x * follow;
  camera.position.x = damp(camera.position.x, tx, 6, dt);
  camera.position.y = 3.3 + portrait * 2.6 + game.boostBlend * -0.35;
  camera.position.z = 7.8 + portrait * 6 - game.boostBlend * 1.2;

  game.shake = Math.max(0, game.shake - dt * 1.4);
  const s = game.shake * game.shake * 0.9 + game.boostBlend * 0.035;
  camera.position.x += (Math.random() - 0.5) * s;
  camera.position.y += (Math.random() - 0.5) * s;
  camera.lookAt(camera.position.x * 0.85, 1.2, -14);
  camera.rotation.z += -game.velX * 0.0015 * (game.state === 'playing' ? 1 : 0);
}

let hudCache = '';
function updateHud() {
  const mult = currentMultiplier();
  const key = `${Math.floor(game.score)}|${game.position}|${mult.toFixed(1)}|${Math.round(game.energy * 100)}|${game.boosting}`;
  if (key === hudCache) return;
  hudCache = key;
  ui.score.textContent = fmt(game.score);
  ui.best.textContent = fmt(game.best);
  ui.position.textContent = scores.ordinal(game.position);
  ui.position.dataset.place = game.position;
  ui.mult.textContent = `x${mult.toFixed(1)}`;
  ui.mult.classList.toggle('boosting', game.boosting);
  ui.boost.style.setProperty('--energy', Math.round(game.energy * 100));
  ui.boost.classList.toggle('ready', !game.boosting && game.energy >= BOOST_MIN);
  ui.boost.classList.toggle('active', game.boosting);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (game.state === 'paused' || dt <= 0) return;

  if (game.state === 'playing') updatePlaying(dt);
  else if (game.state === 'crashed' || game.state === 'over') updateCrashed(dt);
  else if (game.state === 'menu') {
    game.speed = damp(game.speed, 34, 1, dt);
    player.position.x = Math.sin(now * 0.0006) * 3;
  }

  const flameLen = 0.55 + game.boostBlend * 2.6;
  for (const flame of player.userData.flames) {
    const flicker = 0.85 + Math.random() * 0.3;
    flame.scale.set(1 + game.boostBlend * 0.5, 1 + game.boostBlend * 0.5, flameLen * flicker);
  }

  world.update(dt, game.speed);
  speedLines.update(dt, game.speed, game.boostBlend);
  sparks.update(dt);
  updateCamera(dt, now / 1000);
  if (game.state === 'playing' || game.state === 'crashed') {
    updateHud();
    speedometer.set(game.speed * 3, dt);
  }
  camera.updateMatrixWorld();
  rivals.updateTags(camera, window.innerWidth, window.innerHeight, game.state === 'playing');
  composer.render();
}
requestAnimationFrame(frame);

// ----------------------------------------------------------------- wiring
$('btn-start').addEventListener('click', startGame);
$('btn-restart').addEventListener('click', startGame);
$('btn-resume').addEventListener('click', () => setPaused(false));
ui.btnPause.addEventListener('click', () => setPaused(game.state === 'playing'));

function toggleMute() {
  audio.setMuted(!audio.muted);
  ui.btnMute.classList.toggle('off', audio.muted);
}
ui.btnMute.addEventListener('click', (e) => {
  toggleMute();
  e.currentTarget.blur();
});

input.on('pause', () => setPaused(game.state === 'playing'));
input.on('mute', toggleMute);
input.on('confirm', () => {
  if (game.state === 'menu' || game.state === 'over') startGame();
  else if (game.state === 'paused') setPaused(false);
});
input.bindTouchButtons($('btn-left'), $('btn-right'), $('btn-boost'));

// Reveal on-screen controls the first time a touch is seen (hybrid devices).
window.addEventListener(
  'touchstart',
  () => {
    useTouchUi = true;
    document.body.classList.add('touch');
    if (game.state === 'playing') ui.touch.classList.remove('hidden');
  },
  { passive: true },
);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game.state === 'playing') setPaused(true);
    else audio.suspend();
  } else if (game.state !== 'paused') {
    audio.resume();
  }
});

// World picker cards on the start screen.
const worldList = $('world-list');
for (const [i, def] of WORLDS.entries()) {
  const card = document.createElement('button');
  card.className = 'world-card';
  card.dataset.world = def.id;
  for (const [key, value] of Object.entries(def.thumb)) card.style.setProperty(`--${key}`, value);
  card.style.setProperty('--car', `#${def.car.toString(16).padStart(6, '0')}`);
  card.innerHTML = `<span class="world-thumb"></span><span class="world-name">${i + 1}. ${def.name}</span>`;
  card.addEventListener('click', () => {
    setWorld(def.id);
    card.blur();
  });
  worldList.appendChild(card);
}
scores.migrateLegacyBest(WORLDS[0].id);
ui.name.value = scores.getName();
ui.name.addEventListener('change', () => {
  scores.setName(ui.name.value);
  ui.name.value = scores.getName();
});
setWorld(savedWorld());
$('btn-worlds').addEventListener('click', showMenu);

window.addEventListener('keydown', (e) => {
  if (game.state !== 'menu' || e.target instanceof HTMLInputElement) return;
  const index = WORLDS.findIndex((w) => w.id === worldId);
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') setWorld(WORLDS[(index + WORLDS.length - 1) % WORLDS.length].id);
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') setWorld(WORLDS[(index + 1) % WORLDS.length].id);
  else if (/^Digit[1-9]$/.test(e.code) && WORLDS[e.code.slice(5) - 1]) setWorld(WORLDS[e.code.slice(5) - 1].id);
});

// Small debugging / automation hook.
window.__synthwave = { game, obstacles, setWorld, rivals };
