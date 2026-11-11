// Client for the global leaderboard API. Every call fails soft (returns
// null) so the game keeps working on the per-device tables when the API is
// offline, not configured, or the player has no connection.

const ENDPOINT = '/api/leaderboard';
const CACHE_MS = 15000;

const cache = new Map(); // world -> { at, entries }
let runToken = Promise.resolve(null);

async function request(url, init) {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return await res.json(); // throws on the SPA fallback page in local dev
  } catch {
    return null;
  }
}

const validEntries = (data) => (Array.isArray(data?.entries) ? data.entries : null);

/** Top entries for a world, or null if the global board is unavailable. */
export async function fetchTop(world) {
  const hit = cache.get(world);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.entries;
  const entries = validEntries(await request(`${ENDPOINT}?world=${encodeURIComponent(world)}`));
  if (entries) cache.set(world, { at: Date.now(), entries });
  return entries;
}

/** Call when a race starts: the server times the run from this moment. */
export function beginRun(world) {
  runToken = request(`${ENDPOINT}?start=1&world=${encodeURIComponent(world)}`).then((data) => data?.token ?? null);
}

/** Submit the finished run. Resolves to { rank, entries } or null. */
export async function submit(world, { name, score, place }) {
  const token = await runToken;
  runToken = Promise.resolve(null); // tokens are single-use
  if (!token) return null;
  const data = await request(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ world, name, score: Math.floor(score), place, token }),
  });
  const entries = validEntries(data);
  if (!entries) return null;
  cache.set(world, { at: Date.now(), entries });
  return { rank: data.rank ?? null, entries };
}
