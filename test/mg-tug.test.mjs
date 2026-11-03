// TUG O WAR (src/mg/tug.wat): the decks, the band and the pit for 1 to 256
// balls, each side on its own deck; the floor, the rail and a front tipping;
// a holder dug in along the rope, free across it, none on the other deck or
// in the air; the pull from the keys, the sides' roots, the rope easing
// toward their difference and the losers dragged; a pull won past the
// closing line, the losers reeled in and gripped till they hop; the front
// tipping them into the mud and back on their deck after; the next set;
// first to three, the places and a knock's points; the clock's decider and a
// draw; the prediction bit for bit, as deep as it runs, through all but the
// rope's live drag; the client module and its AI; rounds of AI balls; and
// what a tick of 256 balls costs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/tug.mjs'; // TW_*: the minigame's own constants
import tug, { stage, winAt, holds, onDeck, into, dir } from '../client/mg/tug.mjs';

const TICK = 0.008;
const f = Math.fround;
const G2 = MC.TW_GAP / 2;
// a yaw (1/16384 turn) along (dx, dz)
const turn = (dx, dz) => Math.round(Math.atan2(dz, dx) / (2 * Math.PI) * 16384) & 16383;
const AWAY = [turn(-1, 0), turn(1, 0)]; // away from the pit, by side
const INTO = [turn(1, 0), turn(-1, 0)];
const ACROSS = turn(0, 1);
const go = (yaw, more = {}) => partyWord({ yaw, move: 1, ...more });
const still = partyWord({});

// A room of n balls in Tug o' War, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7, debug = true } = {}) {
  const sim = await newParty(debug);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_TUG + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
const H = (k) => L.PG_H + k;
// The next step plays tick t into play.
function at(g, t) {
  const now = g.v.tick;
  g.dv.setUint32(L.HDR_START, now - t, true);
  g.dv.setUint32(L.HDR_UNTIL, now - t + MC.TW_LEN, true);
}
const playT = (g) => g.v.party().t; // the tick into play the next step plays
// The balls of each side, [red, blue].
const sides = (g, n) => [0, 1].map((s) => [...Array(n).keys()].filter((p) => g.v.partier(p).side === s));
// Ball p u m into its own side's deck from the front edge (or side s's), dz from the rope, still on it (or y over it).
function put(g, p, u, dz = 0, { side, vx = 0, vz = 0, y = 0 } = {}) {
  const s = side ?? g.v.partier(p).side, cx = g.v.party().cx;
  g.dv.setFloat32(rec(p) + L.P_PX, f(cx + dir(s) * (G2 + u)), true);
  g.dv.setFloat32(rec(p) + L.P_PY, PLAT_Y + y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, f(cx + dz), true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, (g.dv.getUint8(rec(p) + L.P_FL) & L.PF_BLUE) | L.PF_LIVE | (y > 0 ? 0 : L.PF_GROUND));
}
// How far ball p is into its own deck, and across from the rope.
const uOf = (g, p) => into(stage(g.v), g.v.partier(p).side, g.v.partier(p).pos[0]);
const zOf = (g, p) => g.v.partier(p).pos[2] - g.v.party().cx;
// The rope and its phase set: { ph, at, from, m, v, np, tipAt, tips } as given.
function rope(g, o) {
  const u32 = { ph: MC.TW_PHASE, at: MC.TW_AT, from: MC.TW_FROM, np: MC.TW_NP, tipAt: MC.TW_TIPAT, tips: MC.TW_TIPS };
  for (const [k, a] of Object.entries(u32)) if (o[k] !== undefined) g.dv.setUint32(H(a), o[k], true);
  if (o.m !== undefined) g.dv.setFloat32(H(MC.TW_M), o.m, true);
  if (o.v !== undefined) g.dv.setFloat32(H(MC.TW_V), o.v, true);
}
// A pull on from now (none to come from the set), the flag at m moving v.
const pulling = (g, { m = 0, v = 0, from = playT(g), np = 1 } = {}) => rope(g, { ph: MC.TW_P_PULL, from, m, v, np });
// The set held: nobody pulls till asked.
const hold = (g) => rope(g, { ph: MC.TW_P_SET, at: 1e8 });
// FX of kind since the ring held n0.
const fxOf = (g, n0, kind) => { const out = []; for (let i = n0; i < g.v.fxCount(); i++) { const x = g.v.fx(i); if (x.kind === kind) out.push(x); } return out; };
const holding = (g) => [0, 1].map((s) => g.dv.getUint16(L.PG_S + MC.TW_HOLD + 2 * s, true));

test('the stage for 1, 8, 64 and 256: two decks over the mud sized for the crowd, the band, PK_SCORE red against blue; each side in rows on its own deck, apart', async () => {
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party(), st = stage(g.v), q = f(Math.sqrt(n));
    assert.equal(r.game, L.MG_TUG);
    assert.deepEqual([r.kind, r.len, r.teams, !!(r.flags & L.PGF_BUMPS), r.respawn, r.floor], [L.PK_SCORE, MC.TW_LEN, true, true, MC.TW_RESPAWN, PLAT_Y - MC.TW_MUD]);
    assert.equal(st.d, f(f(q * f(MC.TW_DK)) + MC.TW_D0), `${n}: the decks' length`);
    assert.equal(st.hw, f(f(q * f(MC.TW_WK)) + MC.TW_W0));
    assert.equal(st.band, f(f(q * f(MC.TW_BK)) + f(MC.TW_B0)));
    assert.equal(r.size, f(st.d + G2));
    assert.deepEqual([st.phase, st.at, st.m, st.v, st.tipAt, st.np], [MC.TW_P_SET, MC.TW_SET0, 0, 0, 0, 0]);
    const [red, blue] = sides(g, n);
    assert.ok(Math.abs(red.length - blue.length) <= 1, `${n}: ${red.length} against ${blue.length}`);
    const seen = new Set();
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p), u = into(st, b.side, b.pos[0]);
      assert.equal(b.pos[1], PLAT_Y, `${n}: P${p + 1} on a deck`);
      assert.ok(u >= MC.TW_FRONT - 1e-4 && u <= st.d - 2 && Math.abs(b.pos[2] - st.cx) <= st.hw - 1.5, `${n}: P${p + 1} on its own deck, ${u.toFixed(1)} m in`);
      assert.ok(onDeck(st, b.pos[0], b.pos[2], 0));
      const key = `${b.pos[0].toFixed(2)},${b.pos[2].toFixed(2)}`;
      assert.ok(!seen.has(key), `${n}: P${p + 1} apart`);
      seen.add(key);
    }
  }
});

test('the floor: the decks hold a ball, the pit and their sides don\'t, the rail along each back stops one; a front tipped drops what is on it for TW_TIP, its own side\'s only', async () => {
  const g = await room(3, { seed: 3 });
  hold(g);
  const st = stage(g.v);
  const [red, blue] = sides(g, 3);
  const [a, b] = red.length === 2 ? red : blue, c = red.length === 2 ? blue[0] : red[0];
  const s = g.v.partier(a).side, out = st.band + 2;
  // on the deck, over the pit, off a side
  put(g, a, 6, out);
  put(g, b, -0.6, out);
  put(g, c, 6, st.hw + 0.6);
  for (let k = 0; k < 40; k++) g.step();
  assert.equal(g.v.partier(a).pos[1], PLAT_Y, 'on the deck');
  assert.ok(g.v.partier(b).pos[1] < PLAT_Y - 0.5 && g.v.partier(c).pos[1] < PLAT_Y - 0.5, 'into the pit, and off a side');
  // rolled flat out into the rail: stopped a ball's radius short of the deck's back, still on
  put(g, a, st.d - 6, out, { vx: dir(s) * 10 });
  for (let k = 0; k < 100; k++) g.step([[L.EV_INPUT, a, go(AWAY[s])]]);
  assert.ok(Math.abs(uOf(g, a) - (st.d - 1)) < 1e-4 && g.v.partier(a).pos[1] === PLAT_Y, `at the rail: ${uOf(g, a).toFixed(3)}`);
  // side s's front tipped 10 ticks on: a and b on it, c on the other side's front
  put(g, a, 2, out);
  put(g, b, MC.TW_APRON + 0.5, out);
  put(g, c, 2, out);
  const t0 = playT(g);
  rope(g, { tipAt: t0 + 10, tips: s });
  for (let k = 0; k < 10; k++) g.step();
  assert.ok([a, b, c].every((p) => g.v.partier(p).pos[1] === PLAT_Y), 'all up till it tips');
  g.step();
  for (let k = 0; k < 30; k++) g.step();
  assert.ok(g.v.partier(a).pos[1] < PLAT_Y - 0.4, 'the front tipped: a falls');
  assert.ok(g.v.partier(b).pos[1] === PLAT_Y && g.v.partier(c).pos[1] === PLAT_Y, 'behind it, and the other side\'s front, hold');
  // a ball put on it as it tips back up stays
  at(g, t0 + MC.TW_TIP + 20);
  put(g, b, 2, out);
  for (let k = 0; k < 30; k++) g.step();
  assert.equal(g.v.partier(b).pos[1], PLAT_Y, 'back up after TW_TIP');
});

test('holding: a ball on its own deck in the band holds the rope, dug in along it whatever its keys, rolling across it as ever and free once out of the band; none on the other deck or in the air', async () => {
  const g = await room(2, { seed: 4 });
  hold(g);
  const st = stage(g.v);
  const [[r], [b]] = sides(g, 2);
  put(g, r, 8, 0);
  put(g, b, 8, st.band + 2);
  g.step();
  assert.deepEqual(holding(g), [1, 0], 'red holds, blue (out of the band) does not');
  assert.ok(holds(st, g.v.partier(r)) && !holds(st, g.v.partier(b)), 'the client agrees');
  const x0 = g.v.partier(r).pos[0];
  for (const w of [go(AWAY[0]), go(INTO[0]), go(AWAY[0], { use: 1 })]) for (let k = 0; k < 60; k++) g.step([[L.EV_INPUT, r, w]]);
  assert.ok(Math.abs(g.v.partier(r).pos[0] - x0) < 1e-3, `dug in: ${(g.v.partier(r).pos[0] - x0).toFixed(5)} m`);
  assert.equal(g.v.partier(r).vel[0], 0);
  // across: it rolls, x held, till it is out of the band; then free
  let left = -1;
  for (let k = 0; k < 120; k++) {
    g.step([[L.EV_INPUT, r, go(ACROSS)]]);
    if (left < 0 && zOf(g, r) > st.band) left = k;
    if (left < 0) assert.ok(Math.abs(g.v.partier(r).pos[0] - x0) < 1e-3);
  }
  assert.ok(left > 0 && zOf(g, r) > st.band + 1, `across and out at ${left}`);
  assert.deepEqual(holding(g), [0, 0]);
  const x1 = g.v.partier(r).pos[0];
  for (let k = 0; k < 40; k++) g.step([[L.EV_INPUT, r, go(AWAY[0])]]);
  assert.ok(g.v.partier(r).pos[0] < x1 - 0.3, 'out of the band it rolls along');
  // on blue's deck in the band, red holds nothing; nor does a ball in the air over its own
  put(g, r, 8, 0, { side: 1 });
  put(g, b, 8, 0, { y: 1.5 });
  g.step([[L.EV_INPUT, r, go(AWAY[0])], [L.EV_INPUT, b, go(AWAY[1])]]);
  assert.deepEqual(holding(g), [0, 0]);
  const xr = g.v.partier(r).pos[0], xb = g.v.partier(b).pos[0];
  for (let k = 0; k < 10; k++) g.step();
  assert.ok(g.v.partier(r).pos[0] < xr - 0.05 && g.v.partier(b).pos[0] > xb + 0.01, 'both roll along');
  // a hop lets go: in the air its keys move it along
  put(g, b, 8, 0);
  g.step();
  assert.deepEqual(holding(g), [0, 1]);
  const xh = g.v.partier(b).pos[0];
  for (let k = 0; k < 30; k++) g.step([[L.EV_INPUT, b, go(AWAY[1], { hop: k === 0 ? 1 : 0 })]]);
  assert.ok(g.v.partier(b).pos[0] > xh + 0.05, 'hopped, it rolls on');
});

test('the pull: a holder\'s share of its keys away from the pit; each side the root of its sum over half the room; the rope easing toward TW_K times the difference, held to TW_VMAX; the losing side\'s holders dragged with it, the winners not; a point a second of pulling', async () => {
  const g = await room(4, { seed: 5 });
  const st = stage(g.v);
  const [red, blue] = sides(g, 4);
  red.forEach((p, i) => put(g, p, 6 + 3 * i, 0.5 - i));
  blue.forEach((p, i) => put(g, p, 6 + 3 * i, 0.5 - i));
  // the set: holding, nobody pulls
  hold(g);
  g.step(red.map((p) => [L.EV_INPUT, p, go(AWAY[0])]));
  assert.deepEqual([holding(g), stage(g.v).sum], [[2, 2], [0, 0]]);
  // red pulls flat out, blue holds with no keys
  pulling(g);
  const keys = [...red.map((p) => [L.EV_INPUT, p, go(AWAY[0])]), ...blue.map((p) => [L.EV_INPUT, p, still])];
  g.step(keys);
  const h = f(2);
  const want = f(f(f(f(f(Math.sqrt(f(0 / h))) - f(Math.sqrt(f(2 / h)))) * MC.TW_K) * f(MC.TW_EASE)));
  let s = stage(g.v);
  assert.deepEqual(s.sum, [2, 0]);
  assert.equal(s.v, want, 'the rope eased toward red');
  assert.equal(s.m, f(want * f(TICK)));
  const bx = blue.map((p) => uOf(g, p)), rx = red.map((p) => uOf(g, p));
  let vmax = 0, dragged = 0;
  for (let k = 0; k < 120; k++) {
    const v0 = stage(g.v).v;
    g.step(keys);
    dragged += -v0 * TICK;
    vmax = Math.max(vmax, Math.abs(stage(g.v).v));
  }
  s = stage(g.v);
  assert.ok(s.v < -4.5 && vmax <= MC.TW_VMAX, `toward red at ${s.v.toFixed(2)} m/s, never past ${vmax}`);
  blue.forEach((p, i) => assert.ok(Math.abs(uOf(g, p) - (bx[i] - dragged)) < 2e-3, `blue dragged ${dragged.toFixed(2)} m toward the pit: ${(bx[i] - uOf(g, p)).toFixed(3)}`));
  red.forEach((p, i) => assert.ok(Math.abs(uOf(g, p) - rx[i]) < 1e-3, 'red held'));
  // pulling at an angle: its share; toward the pit: nothing
  pulling(g, { m: 0, v: 0 });
  g.step([[L.EV_INPUT, red[0], go(turn(-1, 1))], [L.EV_INPUT, red[1], go(INTO[0])]]);
  assert.ok(Math.abs(stage(g.v).sum[0] - Math.SQRT1_2) < 1e-6 && stage(g.v).sum[1] === 0, `${stage(g.v).sum}`);
  // three against two: the bigger side's edge is the roots', not the counts'
  const g5 = await room(5, { seed: 9 });
  const [r5, b5] = sides(g5, 5);
  const [big, small] = r5.length === 3 ? [r5, b5] : [b5, r5];
  [...r5, ...b5].forEach((p, i) => put(g5, p, 6 + i, 0));
  pulling(g5);
  g5.step([...r5.map((p) => [L.EV_INPUT, p, go(AWAY[0])]), ...b5.map((p) => [L.EV_INPUT, p, go(AWAY[1])])]);
  const h5 = f(2.5), sb = b5.length, sr = r5.length, v5 = stage(g5.v).v;
  assert.equal(v5, f(f(f(f(f(Math.sqrt(f(sb / h5))) - f(Math.sqrt(f(sr / h5)))) * MC.TW_K) * f(MC.TW_EASE))));
  const linear = (sb - sr) / 2.5 * MC.TW_K * MC.TW_EASE;
  assert.ok(Math.sign(v5) === Math.sign(linear) && Math.abs(v5) < 0.55 * Math.abs(linear), `three against two: ${v5}, half the linear edge ${linear}`);
  assert.ok(big.length === 3 && small.length === 2);
  // a point a second of pulling
  const g2 = await room(2, { seed: 6 });
  const [[r2]] = sides(g2, 2);
  put(g2, r2, 9, 0);
  pulling(g2);
  for (let k = 0; k < MC.TW_PT; k++) g2.step([[L.EV_INPUT, r2, go(AWAY[0])]]);
  assert.equal(g2.v.partier(r2).score, 1);
});

test('a pull won: the flag past the line, closing in from TW_WIN0 to TW_WIN1, scores its side; the losers\' front to tip TW_LAG on; the rope reels them in at TW_REEL, gripped across it till a hop lets go; the winners not', async () => {
  const g = await room(2, { seed: 8 });
  const st = stage(g.v);
  const [[r], [b]] = sides(g, 2);
  put(g, r, 9, 0);
  put(g, b, 9, 0);
  // halfway through the closing, the line is halfway in
  const t0 = playT(g), from = t0 - MC.TW_CLOSE / 2, line = (MC.TW_WIN0 + MC.TW_WIN1) / 2;
  assert.equal(winAt({ phase: MC.TW_P_PULL, from }, t0), line);
  assert.equal(winAt({ phase: MC.TW_P_PULL, from }, from + 10 * MC.TW_CLOSE), MC.TW_WIN1);
  pulling(g, { m: line - 0.1, v: 2, from, np: 1 });
  g.step();
  assert.equal(stage(g.v).phase, MC.TW_P_PULL, 'short of it');
  const n0 = g.v.fxCount();
  pulling(g, { m: line - 0.01, v: 2, from: playT(g) - MC.TW_CLOSE / 2, np: 1 });
  const tw = playT(g);
  g.step();
  const s = stage(g.v);
  assert.deepEqual([s.phase, s.score, s.tipAt, s.tips, s.at, s.v], [MC.TW_P_REEL, [0, 1], tw + MC.TW_LAG, 0, tw + MC.TW_LAG + MC.TW_TIP, MC.TW_REEL]);
  assert.deepEqual(s.log, [{ k: 0, side: 1, decider: false, ticks: MC.TW_CLOSE / 2 }]);
  const won = fxOf(g, n0, MC.TW_FX_WON);
  assert.equal(won.length, 1);
  assert.equal(won[0].shot, 1 | (1 << 2));
  // the reel: red, holding, dragged toward the pit at TW_REEL whatever its keys, across too; blue not
  const ur = uOf(g, r), zr = zOf(g, r), ub = uOf(g, b);
  for (let k = 0; k < 100; k++) g.step([[L.EV_INPUT, r, go(k & 32 ? ACROSS : AWAY[0])], [L.EV_INPUT, b, go(AWAY[1])]]);
  assert.ok(Math.abs(uOf(g, r) - (ur - 100 * MC.TW_REEL * TICK)) < 2e-3, `reeled ${(ur - uOf(g, r)).toFixed(3)} m`);
  assert.ok(Math.abs(zOf(g, r) - zr) < 1e-4, 'gripped across');
  assert.ok(Math.abs(uOf(g, b) - ub) < 1e-3, 'the winners stay');
  // a hop lets go for the hop: in the air it isn't reeled, and its keys move it across
  const u1 = uOf(g, r), z1 = zOf(g, r);
  g.step([[L.EV_INPUT, r, go(ACROSS, { hop: 1 })]]);
  let air = 0;
  for (; air < 200 && !g.v.partier(r).ground; air++) g.step([[L.EV_INPUT, r, go(ACROSS)]]);
  assert.ok(air > 50 && Math.abs(uOf(g, r) - u1) < 0.05 && zOf(g, r) > z1 + 0.3, `${air} ticks up, ${(u1 - uOf(g, r)).toFixed(3)} m reeled, ${(zOf(g, r) - z1).toFixed(2)} across`);
  // landing in the band it has the rope again, and is reeled on
  const u2 = uOf(g, r);
  for (let k = 0; k < 20; k++) g.step([[L.EV_INPUT, r, go(ACROSS)]]);
  assert.ok(Math.abs(u2 - uOf(g, r) - 19 * MC.TW_REEL * TICK) < 0.03, `reeled again: ${(u2 - uOf(g, r)).toFixed(3)}`);
});

test('the tip: TW_LAG after the pull, the losers\' front drops whoever is on it into the mud for TW_TIP, a splash; back on its deck in front of its rail TW_RESPAWN after; then the next pull set TW_SET, the flag in the middle', async () => {
  const g = await room(3, { seed: 10 });
  const st = stage(g.v);
  const [red, blue] = sides(g, 3);
  const [a, b] = red.length === 2 ? red : blue, c = red.length === 2 ? blue[0] : red[0];
  const s = g.v.partier(a).side, out = st.band + 2;
  put(g, a, 2, out); // on its front
  put(g, b, MC.TW_APRON + 2, out); // behind it
  put(g, c, 2, out); // on the winners' front
  const t0 = playT(g);
  rope(g, { ph: MC.TW_P_REEL, tipAt: t0 + 50, tips: s, at: t0 + 50 + MC.TW_TIP, np: 1, m: dir(1 - s) * 6, v: dir(1 - s) * MC.TW_REEL });
  const n0 = g.v.fxCount();
  let fell = -1, down = -1, back = -1;
  for (let k = 0; k < 600; k++) {
    g.step();
    const pa = g.v.partier(a);
    if (fell < 0 && pa.pos[1] < PLAT_Y) fell = playT(g) - 1;
    if (down < 0 && pa.out) down = k;
    if (down >= 0 && back < 0 && !pa.out) back = k;
  }
  assert.equal(fell, t0 + 51, 'it falls from the tick the front tips');
  assert.ok(g.v.partier(b).pos[1] === PLAT_Y && g.v.partier(c).pos[1] === PLAT_Y, 'the rest hold');
  const tip = fxOf(g, n0, MC.TW_FX_TIP), mud = fxOf(g, n0, MC.TW_FX_MUD);
  assert.deepEqual([tip.length, tip[0].shot], [1, s]);
  assert.deepEqual([mud.length, mud[0].owner, mud[0].shot, mud[0].pos[1]], [1, a, 255, PLAT_Y - MC.TW_MUD]);
  assert.equal(back - down, MC.TW_RESPAWN, 'back after TW_RESPAWN');
  const pa = g.v.partier(a);
  assert.ok(Math.abs(into(st, s, pa.pos[0]) - (st.d - MC.TW_BACK)) < 1e-3 && Math.abs(pa.pos[2] - st.cx) <= st.hw * 0.7 + 1e-3, 'in front of its rail');
  // the set after the tip, the flag in the middle; the pull TW_SET later
  const s1 = stage(g.v);
  assert.deepEqual([s1.phase, s1.m, s1.v, s1.at], [MC.TW_P_SET, 0, 0, t0 + 50 + MC.TW_TIP + MC.TW_SET]);
  while (playT(g) <= s1.at) g.step();
  const p2 = fxOf(g, n0, MC.TW_FX_PULL);
  assert.deepEqual([stage(g.v).phase, stage(g.v).from, stage(g.v).np, p2.length, p2[0].shot], [MC.TW_P_PULL, s1.at, 2, 1, 2]);
});

test('the end: first to TW_BEST, over once its losers have tipped, every ball of the side 1st with a win, the rest placed by their points; a foe knocked into the mud TW_PT_KO to its knocker', async () => {
  const g = await room(4, { seed: 11 });
  const [red, blue] = sides(g, 4);
  const st = stage(g.v);
  hold(g);
  red.forEach((p, i) => put(g, p, 8, st.band + 2 + 2 * i));
  blue.forEach((p, i) => put(g, p, 8, st.band + 2 + 2 * i));
  // red[0] bumped blue[0] a second ago: it rolls into the pit
  g.dv.setUint8(rec(blue[0]) + L.B_HITBY, red[0]);
  g.dv.setUint16(rec(blue[0]) + L.B_HITT, 250, true);
  put(g, blue[0], -0.5, 0);
  const n0 = g.v.fxCount();
  for (let k = 0; k < 400 && !g.v.partier(blue[0]).out; k++) g.step();
  const mud = fxOf(g, n0, MC.TW_FX_MUD);
  assert.deepEqual([mud.length, mud[0].owner, mud[0].shot], [1, blue[0], red[0]]);
  assert.deepEqual([g.v.partier(red[0]).score, g.v.partier(red[0]).kos], [MC.TW_PT_KO, 1]);
  for (let k = 0; k < MC.TW_RESPAWN + 200; k++) g.step();
  // two pulls each... red takes the third
  g.dv.setUint32(L.PG_TSCORE, MC.TW_BEST - 1, true);
  g.dv.setUint32(L.PG_TSCORE + 4, MC.TW_BEST - 1, true);
  g.dv.setUint16(rec(blue[0]) + L.PG_SCORE, 9, true);
  g.dv.setUint16(rec(blue[1]) + L.PG_SCORE, 2, true);
  pulling(g, { m: -5.99, v: -2, np: 5 });
  const tw = playT(g);
  g.step();
  assert.deepEqual([stage(g.v).phase, stage(g.v).score], [MC.TW_P_DONE, [MC.TW_BEST, MC.TW_BEST - 1]]);
  while (g.v.hole().state === L.H_PLAY) g.step();
  assert.equal(playT(g) - 1, tw + MC.TW_LAG + MC.TW_TIP, 'over once the losers have tipped');
  const r = g.v.party();
  assert.equal(r.twin, 1);
  for (const p of red) assert.deepEqual([g.v.partier(p).place, g.v.partier(p).wins, g.v.partier(p).pts], [1, 1, 10], `red P${p + 1}`);
  assert.deepEqual(blue.map((p) => g.v.partier(p).place), [3, 4], 'blue by points');
  assert.deepEqual(blue.map((p) => g.v.partier(p).pts), [4, 1]);
});

test('the clock: pulls level, the flag\'s side of the middle takes the decider and the round; dead in the middle it\'s a draw', async () => {
  for (const [m, win] of [[-0.4, 1], [0.25, 2], [0, 3]]) {
    const g = await room(2, { seed: 12 });
    const [[r], [b]] = sides(g, 2);
    put(g, r, 9, 0);
    put(g, b, 9, 0);
    g.dv.setUint32(L.PG_TSCORE, 1, true);
    g.dv.setUint32(L.PG_TSCORE + 4, 1, true);
    at(g, MC.TW_LEN - 2);
    pulling(g, { m, v: 0, np: 3, from: MC.TW_LEN - 600 });
    const n0 = g.v.fxCount();
    for (let k = 0; k < 2; k++) g.step();
    assert.equal(g.v.hole().state, L.H_PLAY, 'still on before the clock');
    g.step();
    assert.equal(g.v.hole().state, L.H_OVER, 'over at the clock');
    const won = fxOf(g, n0, MC.TW_FX_WON), st = stage(g.v);
    assert.equal(g.v.party().twin, win);
    if (win === 3) assert.deepEqual([won.length, st.score], [0, [1, 1]]);
    else {
      assert.deepEqual([won.length, won[0].shot & 3, st.score[win - 1], st.log.at(-1).decider], [1, (win - 1) | 2, 2, true]);
      assert.equal(g.v.partier(win === 1 ? r : b).place, 1);
    }
  }
});

test('the prediction matches the confirmed ball bit for bit: across its deck into the band, dug in, out across it, off the front into the pit; reeled in after a pull lost, a hop letting go, onto its front as it tips and into the mud', async () => {
  const g = await room(3, { seed: 13 });
  const st = stage(g.v);
  const s = g.v.partier(0).side, a = dir(s);
  for (const p of [1, 2]) put(g, p, st.d - 2, (p === 1 ? 1 : -1) * (st.hw - 2), { side: 1 - s }); // out of the way on the other deck
  hold(g);
  put(g, 0, 8, -st.band - 3);
  const w = (dx, dz, more) => go(turn(a * dx, dz), more);
  const words = [
    ...Array.from({ length: 70 }, () => w(0, 1)), // across into the band
    ...Array.from({ length: 80 }, (_, k) => (k & 16 ? w(1, 0) : w(-1, 0))), // dug in, pulling and pushing
    ...Array.from({ length: 110 }, (_, k) => w(0, 1, { hop: k === 60 ? 1 : 0 })), // out across
    ...Array.from({ length: 230 }, (_, k) => w(-1, 0.1, { hop: k === 40 ? 1 : 0 })), // to the front and off it
  ];
  let held = 0, low = 0;
  const watch = () => { if (holding(g)[s]) held++; low = Math.min(low, g.v.partier(0).pos[1] - PLAT_Y); };
  assert.ok(predicted({ ...g, step: (recs) => { g.step(recs); watch(); } }, words) >= words.length);
  assert.ok(held > 40 && low < -2, `held ${held} ticks, fell ${(-low).toFixed(1)} m`);
  assert.ok(!g.v.partier(0).out);
  // a pull lost: reeled from 4.5 m in, a hop, onto the front as it tips 120 ticks on
  const h = await room(3, { seed: 13 });
  for (const p of [1, 2]) put(h, p, st.d - 2, (p === 1 ? 1 : -1) * (st.hw - 2), { side: 1 - s });
  put(h, 0, MC.TW_APRON + 0.5, 0);
  const t0 = playT(h);
  rope(h, { ph: MC.TW_P_REEL, tipAt: t0 + 120, tips: s, at: t0 + 120 + MC.TW_TIP, np: 1, m: -a * 6, v: -a * MC.TW_REEL });
  const reel = Array.from({ length: 220 }, (_, k) => go(turn(a * (k & 8 ? 1 : 0.2), 1), { hop: k === 80 ? 1 : 0 }));
  let gripped = 0;
  const watch2 = () => { if (holding(h)[s]) gripped++; };
  assert.ok(predicted({ ...h, step: (recs) => { h.step(recs); watch2(); } }, reel) >= reel.length);
  assert.ok(gripped > 60 && h.v.partier(0).pos[1] < PLAT_Y - 2, `reeled ${gripped} ticks, then into the mud`);
});

test('the prediction as deep as it runs: 201 ticks across a pull won (its ball off the rope), and PRED_MAX - 1 through the reel and the tip from a holder, and through the reel\'s end into the set', async () => {
  const deep = async (setup, depth, wordAt, steps) => {
    const g = await room(3, { seed: 14 });
    const s = g.v.partier(0).side;
    for (const p of [1, 2]) put(g, p, 10, (p === 1 ? 1 : -1) * 4, { side: 1 - s });
    setup(g, s);
    for (let i = 0; i < steps; i++) g.step([[L.EV_INPUT, 0, wordAt(-1 - i, s)]]);
    const words = Array.from({ length: depth }, (_, i) => wordAt(i, s));
    for (let i = 0; i < depth; i++) g.dv.setUint32(L.PWORDS + 4 * i, words[i], true);
    g.sim.x.predict(0, depth);
    const pred = g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE);
    const phases = new Set();
    for (let i = 0; i < depth; i++) { g.step([[L.EV_INPUT, 0, words[i]]]); phases.add(stage(g.v).phase); }
    assert.deepEqual(pred, g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE), `predicted ${depth} ahead`);
    return { g, s, phases };
  };
  // the pull is won 10 ticks into the run, its ball rolling about its front out of the band
  const wander = (i, s) => go(turn(Math.cos(i / 30), Math.sin(i / 23)));
  const a = await deep((g, s) => { put(g, 0, 3, 5); pulling(g, { m: dir(s) * 5.9, v: dir(s) * 0.5, np: 1 }); }, 201, wander, 0);
  assert.ok(a.phases.has(MC.TW_P_REEL) && !a.g.v.partier(0).out, 'across the win');
  // from 60 ticks after a pull lost, a holder 9 m in, reeled onto its front as it tips
  const pull = (i, s) => go(AWAY[s]);
  const lost = (g, s) => { put(g, 0, 9, 0.3); pulling(g, { m: -dir(s) * 5.99, v: -dir(s) * 2, np: 1 }); };
  const b = await deep(lost, L.PRED_MAX - 1, pull, 60);
  assert.ok(b.g.v.partier(0).pos[1] < PLAT_Y - 1, 'into the mud');
  // from just before the tip, a holder far back: the reel ends, the set comes
  const c = await deep((g, s) => { put(g, 0, 15, 0.3); pulling(g, { m: -dir(s) * 5.99, v: -dir(s) * 2, np: 1 }); }, L.PRED_MAX - 1, pull, MC.TW_LAG - 10);
  assert.ok(c.phases.has(MC.TW_P_SET) && holding(c.g)[c.s] === 1, 'still holding into the set');
});

test('the client module: draws the decks, the flap swinging down, the band, the rope and its flag, the lines; frames the stage; its HUD and FX; its brain holds and pulls, lets go at the edge, gets off a front about to tip, and a raider hops the pit at speed', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const g = await room(4, { seed: 15 });
  const st0 = stage(g.v);
  const [red, blue] = sides(g, 4);
  const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], paint: null };
  const lines = [];
  const hctx = { put: (x, y, s, c) => lines.push([y, s, c]), centre: (y, s, c) => lines.push([y, s, c]), right: (y, s, c) => lines.push([y, s, c]), rows: 44, C: {}, slot: red[0], now: 0 };
  const draw = () => {
    out.scene.clear(); out.glow.length = 0; lines.length = 0;
    const me = g.v.partier(red[0]);
    tug.draw(g.v, { tick: g.v.tick, ptick: g.v.tick, dt: 0.004, now: 1000, slot: red[0], me, pme: me }, out);
    for (let k = 0; k < out.scene.count * 16; k++) assert.ok(Number.isFinite(out.scene.data[k]), 'finite');
    tug.hud(g.v, { ...hctx, me, t: g.v.party().t * TICK });
    for (const l of lines) assert.ok(l[1].length <= 80, l[1]);
    return lines.map((l) => l[1]).join(' | ');
  };
  at(g, 600);
  put(g, red[0], 8, 0);
  put(g, blue[0], 8, 0);
  pulling(g, { m: -2.5, v: -1 });
  g.step();
  let text = draw();
  assert.ok(out.scene.count > 30 && out.scene.count < 200, `${out.scene.count} solids`);
  assert.ok(text.includes('ON THE ROPE  RED 2  BLUE 2') && text.includes('FLAG 2.5 M TO RED') && text.includes('ROLL AWAY FROM THE MUD'), text);
  // the flag: a cloth in red, at the rope's middle moved on dt
  const cloth = [...Array(out.scene.count).keys()].map((k) => out.scene.data.slice(k * 16, k * 16 + 16)).find((d) => Math.abs(d[4] - 0.06) < 1e-6 && Math.abs(d[6] - 0.45) < 1e-6);
  assert.ok(cloth && Math.abs(cloth[0] - (st0.cx + stage(g.v).m + stage(g.v).v * 0.004)) < 1e-3 && cloth[8] > 0.9, 'the flag, red');
  // the flap (red's, after the mud and its boards): down while its front tips
  const flap = () => out.scene.data[2 * 16 + 1];
  const up = flap();
  rope(g, { ph: MC.TW_P_REEL, tipAt: playT(g) - 10, tips: 0, at: playT(g) + 100 });
  g.step();
  text = draw();
  assert.ok(flap() < up - 1, `red's flap swung down: ${up.toFixed(2)} to ${flap().toFixed(2)}`);
  const fr = tug.frame(g.v);
  assert.deepEqual([fr.shape, fr.centre[0]], ['square', st0.cx]);
  assert.ok(tug.hint.length <= 70 && /^[ -_]*$/.test(tug.hint));
  // FX: banners and feed lines
  const said = [];
  const fctx = { slot: red[0], view: g.v, banner: (t) => said.push(t), feed: (t) => said.push(t), glow: () => {}, sound: {}, name: (p) => `P${p + 1}` };
  tug.fx({ kind: MC.TW_FX_PULL, owner: 255, shot: 2, pos: [0, 0, 0], size: 0 }, fctx);
  tug.fx({ kind: MC.TW_FX_WON, owner: 255, shot: 1 | (2 << 2), pos: [0, 0, 0], size: 7.2 }, fctx);
  tug.fx({ kind: MC.TW_FX_WON, owner: 255, shot: 0 | 2 | (3 << 2), pos: [0, 0, 0], size: 7.2 }, fctx);
  assert.deepEqual(said, ['PULL 2!', 'PULL 2 LOST  GET OFF THE FRONT!', 'BLUE TAKES PULL 2 IN 7.2 S', 'YOUR SIDE TAKES THE DECIDER!', 'RED TAKES THE DECIDER IN 7.2 S']);
  assert.equal(tug.sink({ owner: 1, shot: 255 }, (p) => `P${p + 1}`), 'P2 IN THE MUD');
  // the brain: danger off the decks and on a front about to tip; a holder pulls away; at the edge being dragged, lets go
  const tk = g.v.tick + 8;
  assert.equal(tug.brain.danger(g.v, st0.cx, st0.cx, tk), 1, 'the pit');
  assert.equal(tug.brain.danger(g.v, st0.cx - G2 - 2, st0.cx, tk), 1, 'red\'s front tipping');
  assert.equal(tug.brain.danger(g.v, st0.cx + G2 + 8, st0.cx + 4, tk), 0, 'mid deck');
  rope(g, { tipAt: 0 });
  pulling(g, { m: 0, v: 0 });
  g.step();
  const bot = (p, pos, vel = [0, 0]) => ({ slot: p, at: g.v.tick + 8, pos, vel, skill: 0.8, mem: {}, rand: () => 0.5 });
  const me = g.v.partier(red[0]);
  const think = (p, pos, vel) => tug.brain.think(g.v, g.v.partier(p), bot(p, pos, vel), g.v.tick + 8);
  const pulls = think(red[0], [me.pos[0], me.pos[2]]);
  assert.ok(pulls && Math.cos(pulls.yaw) < -0.99 && pulls.move === 1 && !pulls.hop, `a red holder pulls toward -x: ${JSON.stringify(pulls)}`);
  pulling(g, { m: 1, v: 3 });
  g.step();
  put(g, red[0], 1, 0);
  g.step();
  const edge = think(red[0], [g.v.partier(red[0]).pos[0], g.v.partier(red[0]).pos[2]]);
  assert.ok(edge && Math.abs(Math.sin(edge.yaw)) > 0.99 && edge.move === 1, `at the edge, dragged: lets go sideways ${JSON.stringify(edge)}`);
  // a raider: the one of a side's job, at the front edge flat out toward the pit, hops
  const g8 = await room(16, { seed: 16 });
  const [r8] = sides(g8, 16);
  const st8 = stage(g8.v);
  let hopped = null;
  for (const p of r8) {
    const b = { slot: p, at: g8.v.tick + 8, pos: [st8.cx - G2 - 1, st8.cx + st8.band + 1.2], vel: [9, 0], skill: 0.8, mem: { go: true }, rand: () => 0.5 };
    const word = tug.brain.think(g8.v, g8.v.partier(p), b, g8.v.tick + 8);
    if (word?.hop) hopped = p;
  }
  assert.ok(hopped !== null, 'a red raider hops the pit');
  // and the whole AI ball (client/party-bot.mjs), its words 8 ticks late, alone against a still foe: it pulls the flag home
  const one = await room(2, { seed: 17 });
  const [[ra], [bb]] = sides(one, 2);
  const ai = new Partier(ra, 3, 0.8);
  const late = [];
  for (let i = 0; i < 2500 && stage(one.v).score[0] < 1; i++) {
    late.push(ai.think(one.v, one.v.tick + 8, 8));
    one.step([[L.EV_INPUT, ra, late.length > 8 ? late.shift() : still], [L.EV_INPUT, bb, still]]);
  }
  assert.equal(stage(one.v).score[0], 1, 'red takes a pull alone');
});

// A round of AI balls (client/party-bot.mjs) steered by this minigame's brain on the debug build, stats from it.
async function aiRound(balls, ticks, seed) {
  const s = { start: -1, over: -1, pulls: [], muds: 0, tips: 0, hold: [0, 0], n: 0, raid: 0, places: null, sides: null, twin: 0, score: null };
  let seen = 0;
  const r = await playParty({ bytes: partyBytes(true), mg: L.MG_TUG, bots: balls, ticks, seed, onTick: (t, sim, v) => {
    const g = v.party();
    for (; seen < v.fxCount(); seen++) {
      const x = v.fx(seen);
      if (s.over >= 0) continue;
      if (x.kind === MC.TW_FX_WON) s.pulls.push({ side: x.shot & 1, secs: x.size, decider: !!(x.shot & 2) });
      if (x.kind === MC.TW_FX_MUD) s.muds++;
      if (x.kind === MC.TW_FX_TIP) s.tips++;
    }
    if (s.start < 0 && g.state === L.H_PLAY) s.start = t;
    if (s.over < 0 && g.state === L.H_PLAY) {
      const st = stage(v);
      if (st.phase === MC.TW_P_PULL) { s.hold[0] += st.hold[0]; s.hold[1] += st.hold[1]; s.n++; }
      for (let p = 0; p < balls; p++) { const b = v.partier(p); if (b.live && !b.out && b.ground && into(st, b.side, b.pos[0]) < -MC.TW_GAP) s.raid++; }
    }
    if (s.over < 0 && s.start >= 0 && g.state === L.H_OVER) {
      s.over = t;
      s.twin = g.twin;
      s.score = g.tscore;
      s.places = [...Array(balls).keys()].map((p) => v.partier(p).place);
      s.sides = [...Array(balls).keys()].map((p) => v.partier(p).side);
    }
  } });
  return { ...r, s };
}

for (const [balls, ticks, seed] of [[8, 17000, 3], [64, 17000, 2]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, both sides on the rope, raiders over the pit, pulls fought for seconds each and won by best of five, losers in the mud, the winners 1st; equal on 1 and 4 threads`, async (t) => {
    const { log, sim, s } = await aiRound(balls, ticks, seed);
    assert.equal(sim.error().code, 0);
    assert.ok(s.over > 0, 'the round ended');
    t.diagnostic(`${((s.over - s.start) * TICK).toFixed(1)} s, pulls ${s.pulls.map((p) => `${'RB'[p.side]}${p.decider ? '*' : ''}${p.secs.toFixed(1)}`).join(' ')}, ${s.score}; ${s.muds} into the mud; holding ${(s.hold[0] / s.n).toFixed(1)} and ${(s.hold[1] / s.n).toFixed(1)} of ${balls / 2}`);
    assert.ok(s.pulls.length >= MC.TW_BEST && s.pulls.length <= 2 * MC.TW_BEST - 1, `${s.pulls.length} pulls`);
    assert.ok(s.pulls.every((p) => p.secs > 1.5), 'no pull over at once');
    assert.ok(s.pulls.reduce((a, p) => a + p.secs, 0) / s.pulls.length > 5, 'pulls fought for');
    assert.equal(Math.max(...s.score), MC.TW_BEST, 'won by best of five');
    for (const x of [0, 1]) assert.ok(s.hold[x] / s.n > balls / 2 * 0.6, `side ${x} on the rope: ${(s.hold[x] / s.n).toFixed(1)}`);
    assert.ok(s.raid > 0 && s.muds >= s.pulls.length && s.tips === s.pulls.length, `raiders over: ${s.raid} ball-ticks; ${s.muds} in the mud`);
    s.sides.forEach((x, p) => assert.equal(s.places[p] === 1, x === s.twin - 1, `P${p + 1}: the winners share 1st`));
    const parsed = parseLog(log);
    const n = s.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('a tick of 256 balls, AI balls pulling and raiding, on the release build', async (t) => {
  const g = await room(256, { seed: 50, debug: false });
  const ai = Array.from({ length: 256 }, (_, p) => new Partier(p, 9, 0.4 + 0.5 * ((p * 7) % 256) / 256));
  const late = ai.map(() => []);
  let ms = 0, n = 0;
  for (let i = 0; i < 1500; i++) {
    const recs = ai.map((b, p) => { late[p].push(b.think(g.v, g.v.tick + 8, 8)); return [L.EV_INPUT, p, late[p].length > 8 ? late[p].shift() : still]; });
    const a = performance.now();
    g.step(recs);
    if (i >= 500) { ms += performance.now() - a; n++; }
  }
  ms /= n;
  const st = stage(g.v);
  t.diagnostic(`${ms.toFixed(3)} ms a tick at 256 balls; on the rope ${st.hold}`);
  assert.ok(st.hold[0] > 64 && st.hold[1] > 64, `${st.hold} on the rope`);
  assert.ok(ms < 2, `${ms.toFixed(3)} ms a tick`);
});
