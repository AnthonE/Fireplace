// Fireplace's achievements: what a player has done in the room, kept in this
// browser (localStorage, like the room's theme and the look). Each one is a
// test over a tally of results, and a result is what the confirmed world
// holds while a game's end is on screen (FP_STAGE 1): the game, where this
// slot came (FP_LAST), the marshmallows it got (FP_GOT) and how many were in
// it. So the tests read the same bits on every machine; this page only keeps
// its own slot's. Some open a look (client/looks.mjs `unlock`).
//
// The list is append-only and an id never changes: a browser keeps ids.
import * as L from '../src/layout.mjs';

const ALL4 = (1 << L.G_GOLF) | (1 << L.G_ARENA) | (1 << L.G_BUMPER) | (1 << L.G_PARTY);
const bits = (m) => { let n = 0; for (; m; m &= m - 1) n++; return n; };

// test(t): is it earned on this tally; have(t): how far along, for the list
export const ACHIEVEMENTS = [
  { id: 'chair', name: 'PULL UP A CHAIR', about: 'PLAY A GAME IN THE ROOM', test: (t) => t.games >= 1 },
  { id: 'toasted', name: 'TOASTED', about: 'FINISH IN THE TOP THREE', test: (t) => t.mallows >= 1 },
  { id: 'golden', name: 'GOLDEN BROWN', about: 'WIN A GAME', test: (t) => t.wins >= 1 },
  { id: 'roll', name: 'ON A ROLL', about: 'WIN TWO GAMES IN A ROW', test: (t) => t.best >= 2 },
  { id: 'hattrick', name: 'HAT TRICK', about: 'WIN THREE GAMES IN A ROW', test: (t) => t.best >= 3 },
  { id: 'podium', name: 'EVERY STEP', about: 'FINISH FIRST, SECOND AND THIRD', test: (t) => t.places === 7, have: (t) => [bits(t.places), 3] },
  { id: 'bag', name: 'A BAG OF THEM', about: '25 MARSHMALLOWS IN ALL', test: (t) => t.mallows >= 25, have: (t) => [t.mallows, 25] },
  { id: 'campfire', name: 'CAMPFIRE', about: '100 MARSHMALLOWS IN ALL', test: (t) => t.mallows >= 100, have: (t) => [t.mallows, 100] },
  { id: 'regular', name: 'A REGULAR', about: 'PLAY 25 GAMES', test: (t) => t.games >= 25, have: (t) => [t.games, 25] },
  { id: 'playlist', name: 'THE WHOLE PLAYLIST', about: 'PLAY GOLF, THE ARENA, BUMPER BALLS AND PARTY', test: (t) => (t.played & ALL4) === ALL4, have: (t) => [bits(t.played & ALL4), 4] },
  { id: 'allround', name: 'ALL-ROUNDER', about: 'WIN GOLF, THE ARENA, BUMPER BALLS AND PARTY', test: (t) => (t.won & ALL4) === ALL4, have: (t) => [bits(t.won & ALL4), 4] },
  { id: 'crowd', name: 'A FULL HOUSE', about: 'PLAY A GAME WITH 32 OR MORE IN IT', test: (t) => t.crowd >= 32 },
  { id: 'ace', name: 'ACE', about: 'WIN A DOGFIGHT', test: (t) => ((t.won >> L.G_FLIGHT) & 1) === 1 },
];
export const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export const emptyTally = () => ({ v: 1, games: 0, mallows: 0, wins: 0, streak: 0, best: 0, played: 0, won: 0, places: 0, crowd: 0, got: {}, last: '' });

// A game's result for one slot, read from the confirmed world while it is
// held: { key, game, place (0: not in it), got, field }. key names the game
// in its room, so a keyframe that shows the same end twice counts it once.
export function readResult(view, slot, room) {
  const dv = view.dv;
  let field = 0;
  for (let p = 0; p < L.NPLAYER; p++) if (view.u8[L.FP_LAST + p]) field++;
  const game = dv.getUint32(L.FP_GAME, true);
  return { key: `${room >>> 0}:${dv.getUint16(L.FP_COUNT + 2, true)}:${game}`, game, place: view.u8[L.FP_LAST + slot], got: view.u8[L.FP_GOT + slot], field };
}

// The tally after one result, and the achievements it opened (in list order).
// A result this tally has already counted, or one this slot wasn't in, changes nothing.
export function record(tally, r, now = Date.now()) {
  const t = { ...tally, got: { ...tally.got } };
  if (!r.place || r.key === t.last) return { tally: tally, opened: [] };
  t.last = r.key;
  t.games++;
  t.mallows += r.got;
  t.played |= 1 << r.game;
  t.crowd = Math.max(t.crowd, r.field);
  if (r.place <= 3) t.places |= 1 << (r.place - 1);
  if (r.place === 1) { t.wins++; t.won |= 1 << r.game; t.streak++; t.best = Math.max(t.best, t.streak); } else t.streak = 0;
  const opened = [];
  for (const a of ACHIEVEMENTS) if (!t.got[a.id] && a.test(t)) { t.got[a.id] = Math.floor(now / 1000); opened.push(a.id); }
  return { tally: t, opened };
}

export const gotSet = (t) => new Set(Object.keys(t.got));

// Elo Pros keeps the same achievements per wallet (scry-forge
// meter/gamestats.py): the relay runs record() for each signed-in slot, on a
// tally rebuilt from what Elo Pros holds for that wallet, and reports what a
// game added. The stats are a tally's fields as Elo Pros combines them (a sum
// per game, the extremes kept), so the tally comes back from them whole.
// Every test above only ever turns true as a tally grows, so a tally that
// came back short (Elo Pros not reached) opens fewer, never a wrong one.
export const GAME_KEYS = ['golf', 'arena', 'bumper', 'party', 'dogfight']; // by G_*; net/elo.mjs LADDERS
export const STORE_ID = (id) => id.toUpperCase();
const PROGRESS = { bag: ['mallows', 25], campfire: ['mallows', 100], regular: ['games', 25] };
const sentence = (s) => (s[0] + s.slice(1).toLowerCase()).replace(/\bdogfight\b/g, 'Dogfight');

// elo.json's stats block (tools/elo.mjs writes it from this list).
export function eloStats() {
  const perGame = (k, what) => GAME_KEYS.map((g, i) => ({ id: `${k}.${g}`, name: `${what} ${sentence(L.GAMES[i])}`.slice(0, 48), agg: 'sum' }));
  return {
    stats: [
      { id: 'games', name: 'Games played', agg: 'sum' },
      { id: 'mallows', name: 'Marshmallows', agg: 'sum' },
      { id: 'wins', name: 'Wins', agg: 'sum' },
      { id: 'streak', name: 'Wins in a row now', agg: 'latest' },
      { id: 'best_streak', name: 'Most wins in a row', agg: 'max' },
      { id: 'place.1', name: 'Firsts', agg: 'sum' },
      { id: 'place.2', name: 'Seconds', agg: 'sum' },
      { id: 'place.3', name: 'Thirds', agg: 'sum' },
      { id: 'crowd', name: 'Most in one game', agg: 'max' },
      ...perGame('played', 'Played'), ...perGame('won', 'Won'),
    ],
    achievements: ACHIEVEMENTS.map((a) => ({
      id: STORE_ID(a.id), name: sentence(a.name), desc: sentence(a.about),
      ...(PROGRESS[a.id] ? { progress: { stat: PROGRESS[a.id][0], max: PROGRESS[a.id][1] } } : {}),
    })),
    boards: [{ id: 'mallows', name: 'Marshmallows', sort: 'desc', keep: 'best' }],
  };
}

// A tally from Elo Pros's answer for one wallet (GET /api/gamestats/<slug>/of/<wallet>).
export function tallyOfStats(answer) {
  const t = emptyTally();
  const v = new Map((answer?.stats || []).map((s) => [s.id, Number.isSafeInteger(s.value) ? s.value : 0]));
  const n = (id) => Math.max(0, v.get(id) || 0);
  t.games = n('games'); t.mallows = n('mallows'); t.wins = n('wins');
  t.streak = n('streak'); t.best = Math.max(n('best_streak'), t.streak); t.crowd = n('crowd');
  for (let p = 1; p <= 3; p++) if (n(`place.${p}`)) t.places |= 1 << (p - 1);
  GAME_KEYS.forEach((g, i) => { if (n(`played.${g}`)) t.played |= 1 << i; if (n(`won.${g}`)) t.won |= 1 << i; });
  const ids = new Map(ACHIEVEMENTS.map((a) => [STORE_ID(a.id), a.id]));
  for (const a of answer?.achievements || []) if (a.earned && ids.has(a.id)) t.got[ids.get(a.id)] = a.unlocked_at || 0;
  return t;
}

// What one counted result adds, as a report for Elo Pros: the sums by how
// much, the kept ones as they now stand, the unlocks record() opened, and the
// marshmallow board's score. Null when the result changed nothing.
export function statsReport(wallet, before, after, r, opened) {
  if (after === before) return null;
  const stats = { games: 1, streak: after.streak, best_streak: after.best, crowd: r.field };
  if (r.got) stats.mallows = r.got;
  if (r.place === 1) stats.wins = 1;
  if (r.place <= 3) stats[`place.${r.place}`] = 1;
  const g = GAME_KEYS[r.game];
  if (g) { stats[`played.${g}`] = 1; if (r.place === 1) stats[`won.${g}`] = 1; }
  return { wallet, stats, unlock: opened.map(STORE_ID), scores: { mallows: after.mallows } };
}

const KEY = 'fireplace.achievements';
export function loadTally() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (t && t.v === 1) return { ...emptyTally(), ...t, got: { ...t.got } };
  } catch { /* none, or not readable */ }
  return emptyTally();
}
export function saveTally(t) {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* private window: this visit only */ }
}
