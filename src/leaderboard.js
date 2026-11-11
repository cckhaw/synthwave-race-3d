// Per-world top-score tables, stored in localStorage on this device.

const PREFIX = 'synthwave-racer-3d';
export const MAX_ENTRIES = 5;
const NAME_LENGTH = 10;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(`${PREFIX}:${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — scores last for this session only */
  }
}

export function cleanName(name) {
  const cleaned = String(name ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 _-]/g, '')
    .trim()
    .slice(0, NAME_LENGTH);
  return cleaned || 'YOU';
}

export const getName = () => cleanName(read('name', 'YOU'));
export const setName = (name) => write('name', cleanName(name));

export function getBoard(world) {
  const board = read(`board:${world}`, []);
  if (!Array.isArray(board)) return [];
  return board
    .filter((e) => e && Number.isFinite(e.score) && e.score > 0)
    .map((e) => ({ name: cleanName(e.name), score: Math.floor(e.score), place: e.place ?? null }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);
}

/** Insert a result. Returns the new board and the entry's index (-1 if it missed the table). */
export function addScore(world, { name, score, place = null }) {
  const entry = { name: cleanName(name), score: Math.floor(score), place };
  if (entry.score <= 0) return { board: getBoard(world), rank: -1 };
  const board = getBoard(world);
  let rank = board.findIndex((e) => entry.score > e.score);
  if (rank === -1) rank = board.length;
  board.splice(rank, 0, entry);
  board.length = Math.min(board.length, MAX_ENTRIES);
  write(`board:${world}`, board);
  return { board, rank: rank < MAX_ENTRIES ? rank : -1 };
}

export const worldBest = (world) => getBoard(world)[0]?.score ?? 0;

// The run in progress is saved continuously, so a score is not lost if the
// tab closes mid-race; it is folded into the table on the next visit.
export const saveRunInProgress = (world, score) => write(`live:${world}`, Math.floor(score));
export const clearRunInProgress = (world) => write(`live:${world}`, 0);

export function recoverUnfinishedRun(world) {
  const score = Number(read(`live:${world}`, 0)) || 0;
  if (score > 0) {
    addScore(world, { name: getName(), score });
    clearRunInProgress(world);
  }
}

/** Carry the single pre-worlds high score over to the first world. */
export function migrateLegacyBest(firstWorld) {
  const legacy = Number(read('best', 0)) || 0;
  if (legacy > 0 && getBoard(firstWorld).length === 0) addScore(firstWorld, { name: getName(), score: legacy });
  try {
    localStorage.removeItem(`${PREFIX}:best`);
  } catch {
    /* ignore */
  }
}

const ORDINALS = ['1st', '2nd', '3rd', '4th'];
export const ordinal = (n) => ORDINALS[n - 1] ?? `${n}th`;

/** Render entries ({ name, score, place }) into an <ol>, padding with empty rows. */
export function renderBoard(list, board, highlight = -1) {
  list.replaceChildren();
  for (let i = 0; i < MAX_ENTRIES; i++) {
    const entry = board[i];
    const row = document.createElement('li');
    if (i === highlight) row.className = 'mine';
    const cells = entry
      ? [i + 1, cleanName(entry.name), entry.place ? ordinal(entry.place) : '', Math.floor(entry.score).toLocaleString('en-US')]
      : [i + 1, '—', '', ''];
    for (const [k, text] of cells.entries()) {
      const cell = document.createElement('span');
      cell.className = ['lb-rank', 'lb-name', 'lb-place', 'lb-score'][k];
      cell.textContent = text; // names are user input: never inject as HTML
      row.appendChild(cell);
    }
    list.appendChild(row);
  }
}
