// Party's teams (PGF_TEAMS): the deal onto two sides for 1 to 256 balls,
// joins to the smaller side, the sides' scores and PG_TWIN, a team round's
// places and points (PK_OUT and PK_SCORE, and a draw), teammates passing
// through each other and spared a blast, the side in the prediction, and the
// client's readers. FORCE_TEAMS plays any minigame in teams; Parry Ball's
// disc is the stage here, its orbs idled (nobody falls off it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y, B_RAD, SIDES } from '../src/party-view.mjs';
import { Partier, team } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as PY from '../src/mg/parry.mjs';

const C = L.B_CX;
const rec = (p) => L.PLAYERS + p * L.PSIZE;

// A room of n balls on the debug build (a NaN traps), minigame mg forced, in
// teams unless asked not to, stepped into play unless asked not to, the orbs idle.
async function room({ seed = 7, n = 2, mg = L.MG_PARRY, teams = true, play = true } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, (mg + 1) | (teams ? L.FORCE_TEAMS : 0), true);
  const step = (recs = []) => {
    sim.feedPlayers(recs);
    sim.x.step();
    assert.equal(sim.error().code, 0, 'no trap');
    for (let k = 0; k < PY.PY_NMAX; k++) dv.setUint8(L.PG_S + PY.PY_ORB + k * PY.PY_OSIZE + PY.PY_OST, PY.PY_IDLE);
  };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const sides = (g, n) => Array.from({ length: n }, (_, p) => g.v.partier(p).side);
const sink = (g, p) => g.dv.setFloat32(rec(p) + L.P_PY, g.v.party().floor - L.OUT_DEPTH - 1, true);
const hurry = (g) => g.dv.setUint32(L.HDR_UNTIL, g.v.tick, true);
// the next round's countdown
function next(g) {
  const round = g.v.hole().hole;
  while (g.v.hole().hole === round || g.v.hole().state !== L.H_COUNT) { hurry(g); g.step(); }
}
function put(g, p, x, z, { vx = 0, vz = 0 } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, PLAT_Y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
}

test('the layout: a team round\'s header in golf\'s tee, cup and par fields, inside the prediction\'s copy; PF_BLUE the arena\'s side bit', () => {
  for (const a of [L.PG_TSCORE, L.PG_TSCORE + 4, L.PG_TSIDE, L.PG_TK, L.PG_TN, L.PG_TWIN]) {
    assert.ok(a >= L.HDR_TEE && a < L.HDR_LIVE, 'golf\'s fields');
    assert.ok(![L.BH_N0, L.BH_LEFT, L.BH_WINNER].includes(a), 'not party\'s own');
    assert.ok(a + 4 - L.REGION <= L.PRED_COPY);
  }
  assert.equal(new Set([L.PG_TSCORE, L.PG_TSCORE + 4, L.PG_TSIDE, L.PG_TK, L.PG_TN, L.PG_TWIN]).size, 6);
  assert.equal(L.PF_BLUE & (L.PF_LIVE | L.PF_GROUND | L.PF_DEAD | L.PF_FALL | L.PF_STOMP), 0);
  assert.equal(L.FORCE_TEAMS & 0xff, 0, 'clear of the minigame\'s number');
  assert.deepEqual(SIDES.map((s) => s.name), ['RED', 'BLUE']);
});

test('the deal for 1, 2, 3, 16 and 256: two sides as even as can be, red with the odd one, shuffled from the round\'s seed; spawn told each ball\'s side and its place in it', async () => {
  for (const n of [1, 2, 3, 16, 256]) {
    const g = await room({ seed: 11 + n, n, play: false });
    const r = g.v.party();
    assert.ok(r.teams && (r.flags & L.PGF_TEAMS));
    const s = sides(g, n);
    const blue = s.filter((x) => x === 1).length;
    assert.deepEqual([n - blue, blue], [Math.ceil(n / 2), Math.floor(n / 2)], `${n}: ${n - blue} red, ${blue} blue`);
    assert.deepEqual(r.tn, [n - blue, blue], 'PG_TN');
    // the last placed: its side, and how many of its side came before it in slot order
    const last = n - 1;
    assert.equal(g.dv.getUint32(L.PG_TSIDE, true), s[last]);
    assert.equal(g.dv.getUint32(L.PG_TK, true), s.slice(0, last).filter((x) => x === s[last]).length);
    assert.deepEqual([r.tscore, r.twin], [[0, 0], 0]);
    if (n >= 16) assert.ok(s.some((x, p) => x !== (p & 1)), 'not by slot');
  }
  // the same seed deals the same; another round, or another room, deals anew
  const a = await room({ seed: 5, n: 16, play: false });
  const b = await room({ seed: 5, n: 16, play: false });
  const c = await room({ seed: 6, n: 16, play: false });
  assert.deepEqual(sides(a, 16), sides(b, 16));
  assert.notDeepEqual(sides(a, 16), sides(c, 16));
  const first = sides(a, 16);
  next(a);
  assert.notDeepEqual(sides(a, 16), first, 'dealt anew');
  assert.equal(sides(a, 16).filter((x) => x).length, 8);
  // teams off: the next round has no sides at all
  a.dv.setUint32(L.PG_FORCE, L.MG_PARRY + 1, true);
  next(a);
  assert.ok(!a.v.party().teams);
  assert.deepEqual(sides(a, 16), Array(16).fill(0));
  assert.deepEqual([a.v.party().tn, a.v.party().tscore], [[0, 0], [0, 0]]);
});

test('joins: in the countdown the sides dealt again with the newcomer, even; in play to the smaller side, red on a tie, watching a PK_OUT round or falling into a PK_SCORE one on its side', async () => {
  const g = await room({ n: 4, play: false });
  g.step([[L.EV_JOIN, 4]]);
  assert.deepEqual(g.v.party().tn, [3, 2]);
  g.step([[L.EV_JOIN, 5]]);
  assert.deepEqual(g.v.party().tn, [3, 3]);
  assert.equal(sides(g, 6).filter((x) => x).length, 3);
  const reds = sides(g, 6).map((x, p) => [x, p]).filter(([x]) => x === 0).map(([, p]) => p);
  g.step([[L.EV_LEAVE, reds[0]], [L.EV_LEAVE, reds[1]]]);
  g.step([[L.EV_JOIN, 6]]);
  assert.deepEqual(g.v.party().tn, [3, 2], 'five in, dealt again');
  // in play, a tie: red; then blue
  const t = await room({ n: 4 });
  const before = sides(t, 4);
  t.step([[L.EV_JOIN, 4]]);
  assert.equal(t.v.partier(4).side, 0, 'a tie: red');
  t.step([[L.EV_JOIN, 5]]);
  assert.equal(t.v.partier(5).side, 1);
  assert.deepEqual(sides(t, 4), before, 'nobody else moved');
  // in play, PK_OUT: on the smaller side, watching
  const o = await room({ n: 3 });
  assert.deepEqual(o.v.party().tn, [2, 1]);
  o.step([[L.EV_JOIN, 3]]);
  const b = o.v.partier(3);
  assert.ok(b.out && b.side === 1, 'blue, watching');
  // in play, PK_SCORE: falling in, spawned as its side's
  const s = await room({ n: 5 });
  s.dv.setUint32(L.PG_KIND, L.PK_SCORE, true);
  s.step([[L.EV_JOIN, 5]]);
  const j = s.v.partier(5);
  assert.ok(!j.out && j.side === 1 && j.pos[1] > PLAT_Y + 5, 'blue, falling in');
  assert.equal(s.dv.getUint32(L.PG_TSIDE, true), 1);
});

test('a team PK_OUT round: the last side in wins, every ball of it 1st, out or not, a win each; the other side after them by its own score; a watcher isn\'t placed', async () => {
  const g = await room({ n: 6, seed: 21 });
  const s = sides(g, 6);
  const red = [0, 1, 2, 3, 4, 5].filter((p) => s[p] === 0), blue = [0, 1, 2, 3, 4, 5].filter((p) => s[p] === 1);
  assert.deepEqual([red.length, blue.length], [3, 3]);
  sink(g, red[0]);
  g.step();
  assert.ok(g.v.partier(red[0]).out);
  assert.equal(g.v.hole().state, L.H_PLAY, 'red has two left');
  g.step([[L.EV_JOIN, 6]]);
  assert.ok(g.v.partier(6).out && g.v.partier(6).side === 0, 'a watcher, red on the tie');
  [[blue[0], 5], [blue[1], 2], [blue[2], 2]].forEach(([p, k]) => g.dv.setUint16(rec(p) + L.PG_SCORE, k, true));
  sink(g, blue[0]);
  sink(g, blue[1]);
  g.step();
  assert.equal(g.v.hole().state, L.H_PLAY, 'blue has one left');
  sink(g, blue[2]);
  g.step();
  const r = g.v.party();
  assert.equal(r.state, L.H_OVER, 'no blue left');
  assert.equal(r.twin, 1, 'red won');
  assert.equal(r.winner, 255, 'a shared win');
  const at = (k) => [...red, ...blue].map((p) => g.v.partier(p)[k]);
  assert.deepEqual(at('place'), [1, 1, 1, 4, 5, 5]);
  assert.deepEqual(at('pts'), [10, 10, 10, 4, 2, 2]);
  assert.deepEqual(at('wins'), [1, 1, 1, 0, 0, 0]);
  assert.deepEqual(at('rounds'), [1, 1, 1, 1, 1, 1]);
  assert.deepEqual([g.v.partier(6).place, g.v.partier(6).pts, g.v.partier(6).wins], [0, 0, 0], 'not in it');
  // at the clock with both sides in, the side with more in wins
  const c = await room({ n: 5, seed: 3 });
  const cs = sides(c, 5);
  sink(c, cs.indexOf(1));
  c.step();
  hurry(c);
  c.step();
  assert.equal(c.v.party().twin, 1, '3 red against 2 blue, one blue out: red');
  assert.deepEqual(sides(c, 5).map((x, p) => c.v.partier(p).place === 1), cs.map((x) => x === 0));
});

test('a team PK_SCORE round at the clock: the side with the higher PG_TSCORE wins; PG_TWIN the minigame set wins over the scores; a draw places as without teams', async () => {
  const play = async (seed, tscore, own, twin = 0) => {
    const g = await room({ n: 4, seed });
    g.dv.setUint32(L.PG_KIND, L.PK_SCORE, true);
    g.dv.setUint32(L.PG_TSCORE, tscore[0], true);
    g.dv.setUint32(L.PG_TSCORE + 4, tscore[1], true);
    if (twin) g.dv.setUint32(L.PG_TWIN, twin, true);
    const s = sides(g, 4);
    const red = [0, 1, 2, 3].filter((p) => s[p] === 0), blue = [0, 1, 2, 3].filter((p) => s[p] === 1);
    [...red, ...blue].forEach((p, k) => g.dv.setUint16(rec(p) + L.PG_SCORE, own[k], true));
    hurry(g);
    g.step();
    assert.equal(g.v.hole().state, L.H_OVER);
    const at = (k) => [...red, ...blue].map((p) => g.v.partier(p)[k]);
    return { r: g.v.party(), place: at('place'), pts: at('pts'), wins: at('wins') };
  };
  // red 3, blue 7: blue's both 1st; red's by their own, 4 then 1
  let x = await play(31, [3, 7], [1, 4, 0, 9]);
  assert.equal(x.r.twin, 2);
  assert.deepEqual(x.place, [4, 3, 1, 1]);
  assert.deepEqual(x.pts, [1, 4, 10, 10]);
  assert.deepEqual(x.wins, [0, 0, 1, 1]);
  // the minigame said red, whatever the scores
  x = await play(32, [0, 50], [0, 0, 5, 5], 1);
  assert.equal(x.r.twin, 1);
  assert.deepEqual(x.place, [1, 1, 3, 3]);
  assert.deepEqual(x.pts, [10, 10, 4, 4]);
  // even: a draw (3), placed by everyone's own score as without teams
  x = await play(33, [6, 6], [2, 8, 8, 1]);
  assert.equal(x.r.twin, 3);
  assert.deepEqual(x.place, [3, 1, 1, 4]);
  assert.deepEqual(x.pts, [4, 10, 10, 1]);
  assert.deepEqual(x.wins, [0, 1, 1, 0]);
});

test('bumps: teammates pass through each other and foes bump; with PGF_MATES teammates bump too; a POW spares its own side', async () => {
  const g = await room({ n: 4, seed: 41 });
  const s = sides(g, 4);
  const [r0, r1] = [0, 1, 2, 3].filter((p) => s[p] === 0), [b0, b1] = [0, 1, 2, 3].filter((p) => s[p] === 1);
  assert.ok(g.v.party().flags & L.PGF_BUMPS);
  put(g, r0, C, C, { vx: 2 });
  put(g, r1, C + 1.2, C, { vx: -2 });
  put(g, b0, C, C + 10, { vx: 2 });
  put(g, b1, C + 1.2, C + 10, { vx: -2 });
  g.step();
  const gap = (p, q) => Math.hypot(g.v.partier(p).pos[0] - g.v.partier(q).pos[0], g.v.partier(p).pos[2] - g.v.partier(q).pos[2]);
  assert.ok(gap(r0, r1) < 1.2, `teammates through each other: ${gap(r0, r1)}`);
  assert.ok(gap(b0, b1) < 1.2, `blue's too: ${gap(b0, b1)}`);
  // red against blue: apart
  put(g, r0, C, C - 10, { vx: 2 });
  put(g, b0, C + 1.2, C - 10, { vx: -2 });
  put(g, r1, C - 20, C);
  put(g, b1, C + 20, C);
  g.step();
  assert.ok(gap(r0, b0) >= 2 * B_RAD - 1e-4, `foes bump: ${gap(r0, b0)}`);
  assert.equal(g.v.partier(r0).hitBy, b0);
  // PGF_MATES: teammates bump
  g.dv.setUint32(L.PG_FLAGS, g.v.party().flags | L.PGF_MATES, true);
  put(g, r0, C, C, { vx: 2 });
  put(g, r1, C + 1.2, C, { vx: -2 });
  g.step();
  assert.ok(gap(r0, r1) >= 2 * B_RAD - 1e-4, `with PGF_MATES: ${gap(r0, r1)}`);
  // a POW from r0, a teammate and a foe 2 m off it: the foe is shoved, the teammate not
  g.dv.setUint32(L.PG_FLAGS, g.v.party().flags & ~L.PGF_MATES, true);
  put(g, r0, C, C);
  put(g, r1, C + 2.5, C);
  put(g, b0, C - 2.5, C);
  put(g, b1, C + 20, C + 20);
  g.dv.setUint8(rec(r0) + L.B_ITEM, L.PU_POW);
  g.step([[L.EV_INPUT, r0, partyWord({ yaw: 0, use: 1 })]]);
  assert.equal(g.v.partier(r0).item, 0, 'used');
  assert.ok(Math.hypot(...g.v.partier(b0).vel) > 3, 'the foe shoved');
  assert.equal(Math.hypot(...g.v.partier(r1).vel), 0, 'the teammate spared');
});

test('the prediction carries a ball\'s side in its record, bit for bit, rolling through its teammates', async () => {
  // a room where slot 0 is blue
  let g = null;
  for (let seed = 50; !g; seed++) { const t = await room({ n: 4, seed }); if (t.v.partier(0).side === 1) g = t; }
  const mate = [1, 2, 3].find((p) => g.v.partier(p).side === 1);
  put(g, 0, C - 4, C);
  put(g, mate, C, C);
  const words = Array.from({ length: 120 }, (_, k) => partyWord({ yaw: k < 60 ? 0 : 8192, move: 1, hop: k === 30 ? 1 : 0 }));
  assert.ok(predicted(g, words) >= words.length);
  assert.ok(g.v.partier(0).side === 1 && !g.v.partier(0).out);
});

test('the client: party() and partier() read the sides, team() hands an AI ball its teammates and its foes, and a Partier thinks in a team round', async () => {
  const g = await room({ n: 6, seed: 61 });
  const r = g.v.party();
  assert.ok(r.teams);
  assert.deepEqual(r.tn, [3, 3]);
  g.dv.setUint32(L.PG_TSCORE + 4, 9, true);
  assert.deepEqual(g.v.party().tscore, [0, 9]);
  const t = team(g.v, 0);
  const s0 = g.v.partier(0).side;
  assert.equal(t.side, s0);
  assert.equal(t.mates.length, 2);
  assert.equal(t.foes.length, 3);
  assert.ok(t.mates.every((b) => b.side === s0 && b.slot !== 0) && t.foes.every((b) => b.side !== s0));
  const bot = new Partier(0, 3, 0.8);
  const w = bot.think(g.v, g.v.tick, 0);
  assert.ok(Number.isInteger(w));
  assert.equal(bot.side, s0);
  // outside a team round: no side, everyone a foe
  const o = await room({ n: 3, teams: false });
  assert.ok(!o.v.party().teams);
  assert.deepEqual(team(o.v, 1), { side: -1, mates: [], foes: team(o.v, 1).foes });
  assert.equal(team(o.v, 1).foes.length, 2);
});
