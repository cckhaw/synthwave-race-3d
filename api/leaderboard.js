// Global leaderboard API (Vercel Function, Web-standard handlers).
//
//   GET  /api/leaderboard?world=sky           -> { entries: [{ name, score, place }] }
//   GET  /api/leaderboard?start=1&world=sky   -> { token }   (call when a race starts)
//   POST /api/leaderboard { world, name, score, place, token }
//                                             -> { rank, entries }
//
// Scores live in one Redis sorted set per world, reached over the Upstash
// REST API. Needs KV_REST_API_URL + KV_REST_API_TOKEN (set by the Vercel
// Upstash integration) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const WORLDS = ['sky', 'country', 'snow', 'circuit'];
const TOP = 5; // rows returned to the game
const KEEP = 200; // rows kept per world
const NAME_LENGTH = 10;
const MAX_RUN_SECONDS = 6 * 60 * 60;
const POSTS_PER_MINUTE = 12;
// Upper bound on how fast points can be earned (flat-out nitro in 1st place
// plus a pickup every second is ~1,300/s). Scores must fit the real time
// elapsed since the race token was issued.
const MAX_POINTS_PER_SECOND = 1300;
const SCORE_HEAD_START = 400;
const BLOCKED_NAMES = /FUCK|SHIT|CUNT|NIGG|FAG|RAPE|NAZI|BITCH|PENIS|VAGIN/;

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

function config() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

/** Run Redis commands in one round trip; returns their results in order. */
async function redis({ url, token }, commands) {
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const results = await res.json();
  const failed = results.find((r) => r.error);
  if (failed) throw new Error(`redis: ${failed.error}`);
  return results.map((r) => r.result);
}

function cleanName(name) {
  const cleaned = String(name ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 _-]/g, '')
    .trim()
    .slice(0, NAME_LENGTH);
  return !cleaned || BLOCKED_NAMES.test(cleaned.replace(/[^A-Z]/g, '')) ? 'RACER' : cleaned;
}

// Race tokens: "<issued ms>.<world>.<hmac>". Signed with a key derived from
// the database credential, so no extra secret has to be configured.
const sign = (cfg, payload) =>
  createHmac('sha256', `synthwave-racer-3d:${cfg.token}`).update(payload).digest('hex').slice(0, 40);

function issueToken(cfg, world) {
  const payload = `${Date.now()}.${world}`;
  return `${payload}.${sign(cfg, payload)}`;
}

/** @returns {number | null} seconds since the token was issued, or null if invalid */
function tokenAge(cfg, token, world) {
  const [issued, tokenWorld, mac] = String(token ?? '').split('.');
  if (!issued || tokenWorld !== world || !mac) return null;
  const expected = Buffer.from(sign(cfg, `${issued}.${tokenWorld}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const age = (Date.now() - Number(issued)) / 1000;
  return Number.isFinite(age) && age >= 0 && age <= MAX_RUN_SECONDS ? age : null;
}

// Sorted-set members are "<name>|<place>|<nonce>" so equal names stay distinct.
function parseEntries(flat) {
  const entries = [];
  for (let i = 0; i < flat.length; i += 2) {
    const [name, place] = String(flat[i]).split('|');
    entries.push({ name, score: Number(flat[i + 1]), place: Number(place) || null });
  }
  return entries;
}

const boardKey = (world) => `lb:${world}`;
const topCommand = (world) => ['ZRANGE', boardKey(world), 0, TOP - 1, 'REV', 'WITHSCORES'];

export async function GET(request) {
  const cfg = config();
  if (!cfg) return json({ error: 'not_configured' }, 503);
  const params = new URL(request.url).searchParams;
  const world = params.get('world');
  if (!WORLDS.includes(world)) return json({ error: 'unknown_world' }, 400);

  if (params.has('start')) return json({ token: issueToken(cfg, world) });

  try {
    const [flat] = await redis(cfg, [topCommand(world)]);
    // Let the CDN absorb repeat reads for a few seconds.
    return json({ entries: parseEntries(flat) }, 200, { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' });
  } catch {
    return json({ error: 'unavailable' }, 502);
  }
}

export async function POST(request) {
  const cfg = config();
  if (!cfg) return json({ error: 'not_configured' }, 503);

  let body;
  try {
    const text = await request.text();
    if (text.length > 600) return json({ error: 'too_large' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  const world = body?.world;
  const score = Math.floor(Number(body?.score));
  const place = Math.floor(Number(body?.place));
  if (!WORLDS.includes(world)) return json({ error: 'unknown_world' }, 400);
  if (!Number.isFinite(score) || score <= 0) return json({ error: 'bad_score' }, 400);
  if (![1, 2, 3, 4].includes(place)) return json({ error: 'bad_place' }, 400);

  const age = tokenAge(cfg, body.token, world);
  if (age === null) return json({ error: 'bad_token' }, 403);
  if (score > SCORE_HEAD_START + age * MAX_POINTS_PER_SECOND) return json({ error: 'implausible_score' }, 422);

  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const rateKey = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
  const usedKey = `used:${String(body.token).split('.').pop()}`;
  const member = `${cleanName(body.name)}|${place}|${randomBytes(4).toString('hex')}`;

  try {
    // Rate limit and single-use check first; only then write the score.
    const [hits, , fresh] = await redis(cfg, [
      ['INCR', rateKey],
      ['EXPIRE', rateKey, 90],
      ['SET', usedKey, 1, 'NX', 'EX', MAX_RUN_SECONDS],
    ]);
    if (hits > POSTS_PER_MINUTE) return json({ error: 'rate_limited' }, 429);
    if (fresh !== 'OK') return json({ error: 'token_used' }, 409);

    const [, , rank, flat] = await redis(cfg, [
      ['ZADD', boardKey(world), score, member],
      ['ZREMRANGEBYRANK', boardKey(world), 0, -(KEEP + 1)],
      ['ZREVRANK', boardKey(world), member],
      topCommand(world),
    ]);
    return json({ rank: rank === null ? null : rank + 1, entries: parseEntries(flat) });
  } catch {
    return json({ error: 'unavailable' }, 502);
  }
}
