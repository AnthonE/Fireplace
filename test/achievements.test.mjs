// Fireplace's achievements (client/achievements.mjs): tests over a tally of
// game results, each result read from the confirmed world while a game's
// end is held, counted once.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/layout.mjs';
import { View } from '../src/view.mjs';
import { ACHIEVEMENTS, byId, emptyTally, record, readResult, eloStats, tallyOfStats, statsReport, GAME_KEYS, STORE_ID } from '../client/achievements.mjs';
import { LADDERS } from '../net/elo.mjs';

const inFont = (s) => [...s].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 95);
let n = 0;
const res = (o) => ({ key: `1:${++n}:${o.game ?? L.G_BUMPER}`, game: L.G_BUMPER, place: 5, got: 0, field: 8, ...o });
const play = (results, t = emptyTally()) => {
  const opened = [];
  for (const r of results) { const x = record(t, r, 1e12); t = x.tally; opened.push(...x.opened); }
  return { t, opened };
};

test('ids unique, names and lines in the font and short enough for the TV', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) {
    assert.ok(inFont(a.name) && a.name.length <= 18, a.name);
    assert.ok(inFont(a.about) && a.about.length <= 46, a.about);
  }
});

test('a first game, a marshmallow, a win, then two and three in a row', () => {
  assert.deepEqual(play([res({})]).opened, ['chair']);
  assert.deepEqual(play([res({ place: 3, got: 1 })]).opened, ['chair', 'toasted']);
  assert.deepEqual(play([res({ place: 1, got: 3 })]).opened, ['chair', 'toasted', 'golden']);
  const { t, opened } = play([res({ place: 1, got: 3 }), res({ place: 1, got: 3 })]);
  assert.ok(opened.includes('roll') && !opened.includes('hattrick'));
  assert.ok(play([res({ place: 1, got: 3 })], t).opened.includes('hattrick'));
  // a loss between them breaks the run; a game this slot sat out does not
  const broke = play([res({ place: 1 }), res({ place: 2 }), res({ place: 1 })]);
  assert.equal(broke.t.best, 1);
  const sat = play([res({ place: 1 }), res({ place: 0 }), res({ place: 1 })]);
  assert.equal(sat.t.best, 2);
});

test('a result is counted once, and one this slot was not in is not counted', () => {
  const r = res({ place: 1, got: 3 });
  const once = play([r, r, { ...r }]);
  assert.equal(once.t.games, 1);
  assert.equal(once.t.mallows, 3);
  assert.equal(play([res({ place: 0, got: 0 })]).t.games, 0);
});

test('the long ones: every game played and won, every step, a full house, 25 and 100 marshmallows, 25 games', () => {
  const four = [L.G_GOLF, L.G_ARENA, L.G_BUMPER, L.G_PARTY];
  let x = play(four.slice(0, 3).map((game) => res({ game, place: 4 })));
  assert.ok(!x.opened.includes('playlist'));
  x = play([res({ game: L.G_PARTY, place: 4 })], x.t);
  assert.deepEqual(x.opened, ['playlist']);
  assert.ok(play(four.map((game) => res({ game, place: 1, got: 3 }))).opened.includes('allround'));
  assert.ok(play([1, 2, 3].map((place) => res({ place }))).opened.includes('podium'));
  assert.ok(!play([1, 2].map((place) => res({ place }))).opened.includes('podium'));
  assert.ok(play([res({ field: 32 })]).opened.includes('crowd'));
  assert.ok(!play([res({ field: 31 })]).opened.includes('crowd'));
  const many = play(Array.from({ length: 34 }, () => res({ place: 1, got: 3 })));
  assert.ok(many.opened.includes('bag') && many.opened.includes('campfire') && many.opened.includes('regular'));
  assert.equal(many.t.mallows, 102);
  assert.ok(play([res({ game: L.G_FLIGHT, place: 1, got: 3 })]).opened.includes('ace'));
  assert.ok(!play([res({ game: L.G_FLIGHT, place: 2, got: 2 })]).opened.includes('ace'));
  const all = ACHIEVEMENTS.map((a) => a.id);
  assert.deepEqual(Object.keys(play([...[...four, L.G_FLIGHT].map((game) => res({ game, place: 1, got: 3, field: 40 })), res({ place: 2 }), res({ place: 3 }), ...Array.from({ length: 34 }, () => res({ place: 1, got: 3 }))]).t.got).sort(), [...all].sort());
});

test('a result is read from the world as it is held: the game, the place, the marshmallows, who was in it', () => {
  const buf = new SharedArrayBuffer(L.PAGES * 65536);
  const v = new View(buf);
  v.dv.setUint32(L.FP_GAME, L.G_ARENA, true);
  v.dv.setUint16(L.FP_COUNT + 2, 6, true);
  [[3, 1, 3], [9, 2, 2], [40, 3, 1], [41, 4, 0]].forEach(([p, place, got]) => { v.u8[L.FP_LAST + p] = place; v.u8[L.FP_GOT + p] = got; });
  assert.deepEqual(readResult(v, 9, 123456), { key: '123456:6:1', game: L.G_ARENA, place: 2, got: 2, field: 4 });
  assert.equal(readResult(v, 5, 123456).place, 0);
});

// Elo Pros's rules for combining a stat's reports (scry-forge meter/gamestats.py apply_reports)
function fold(held, reps, defs) {
  const agg = new Map(defs.stats.map((s) => [s.id, s.agg]));
  for (const rep of reps) {
    for (const [id, v] of Object.entries(rep.stats)) {
      const cur = held.stats[id], a = agg.get(id);
      held.stats[id] = cur === undefined || a === 'latest' ? v : a === 'sum' ? cur + v : a === 'max' ? Math.max(cur, v) : Math.min(cur, v);
    }
    for (const id of rep.unlock) held.got[id] ??= 1;
    for (const a of defs.achievements) if (a.progress && !held.got[a.id] && held.stats[a.progress.stat] >= a.progress.max) held.got[a.id] = 1;
  }
  return held;
}
const answer = (held, defs) => ({
  stats: defs.stats.map((s) => ({ id: s.id, value: held.stats[s.id] ?? null })),
  achievements: defs.achievements.map((a) => ({ id: a.id, earned: !!held.got[a.id], unlocked_at: held.got[a.id] ?? null })),
});

test("elo.json's stats block: ids and lines Elo Pros takes, a stat per thing a test reads, the counted ones as progress", () => {
  const defs = eloStats();
  assert.deepEqual(GAME_KEYS, LADDERS, 'the stats name each game as its ladder does');
  assert.equal(GAME_KEYS.length, L.GAMES.length);
  for (const s of defs.stats) assert.match(s.id, /^[a-z0-9_.:]{1,64}$/, s.id);
  assert.equal(new Set(defs.stats.map((s) => s.id)).size, defs.stats.length);
  for (const a of defs.achievements) {
    assert.match(a.id, /^[A-Z0-9_]{1,64}$/, a.id);
    assert.ok(a.name.length <= 48 && a.desc.length <= 200, a.id);
    if (a.progress) assert.ok(defs.stats.some((s) => s.id === a.progress.stat && s.agg !== 'min'), a.id);
  }
  assert.deepEqual(defs.achievements.map((a) => a.id), ACHIEVEMENTS.map((a) => STORE_ID(a.id)));
  // a progress row unlocks at the same count its test does
  for (const a of defs.achievements.filter((x) => x.progress)) {
    const id = a.id.toLowerCase(), t = { ...emptyTally(), [a.progress.stat === 'mallows' ? 'mallows' : 'games']: a.progress.max };
    assert.ok(byId.get(id).test(t) && !byId.get(id).test({ ...t, mallows: t.mallows && t.mallows - 1, games: t.games && t.games - 1 }), id);
  }
});

test('a tally reported game by game comes back whole from what Elo Pros keeps, and opens nothing twice', () => {
  const defs = eloStats();
  const games = [L.G_GOLF, L.G_ARENA, L.G_BUMPER, L.G_PARTY, L.G_FLIGHT];
  const results = Array.from({ length: 60 }, (_, i) => res({ game: games[i % 5], place: [1, 1, 2, 1, 3, 5, 1, 0][i % 8], got: [3, 3, 2, 3, 1, 0, 3, 0][i % 8], field: 4 + (i % 40) }));
  let t = emptyTally(), held = { stats: {}, got: {} };
  const unlocked = [];
  results.forEach((r, i) => {
    // every 7 games the relay starts over from Elo Pros's answer, as a new room would
    if (i % 7 === 6) t = tallyOfStats(answer(held, defs));
    const x = record(t, r, 1e12);
    const rep = statsReport('0x' + 'ab'.repeat(20), t, x.tally, r, x.opened);
    if (r.place) assert.ok(rep); else assert.equal(rep, null);
    if (rep) { held = fold(held, [rep], defs); unlocked.push(...rep.unlock); assert.equal(rep.scores.mallows, x.tally.mallows); }
    t = x.tally;
  });
  const back = tallyOfStats(answer(held, defs));
  for (const k of ['games', 'mallows', 'wins', 'streak', 'best', 'places', 'played', 'won', 'crowd']) assert.equal(back[k], t[k], k);
  assert.deepEqual(Object.keys(back.got).sort(), Object.keys(t.got).sort());
  assert.equal(new Set(unlocked).size, unlocked.length, 'each unlock reported once');
  assert.deepEqual(tallyOfStats(null), emptyTally(), 'no answer is a first game');
});
