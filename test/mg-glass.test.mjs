// GLASS BRIDGE (src/mg/glass.wat): the bridges laid out for the crowd and the
// answers from the seed, the gaps a hop clears and a roll doesn't, tempered
// glass that holds, glass that cracks, holds you and goes for good, the
// finish, the places and the clock, bumps onto bad glass, the prediction bit
// for bit through all of it, and rounds of AI balls that see only what a
// player sees and still get across.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, seed as pSeed, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/glass.mjs'; // GB_*: the minigame's own constants
import glass, { stage, panelOf, panelIndex, cellOf, supportAt, known, standings } from '../client/mg/glass.mjs';

const C = L.B_CX;
const TICK = 0.008;
const PITCH = MC.GB_LP + MC.GB_G;
const BP = 2 * MC.GB_WP + MC.GB_GIN + MC.GB_GB;

// A room of n balls on the glass, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7, debug = true } = {}) {
  const sim = await newParty(debug);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_GLASS + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step, S: stage(v) };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// Ball p at (x, z) on the glass's top (or y), rolling at (vx, vz).
function put(g, p, x, z, { y = PLAT_Y, vx = 0, vz = 0, ground = true } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE | (ground ? L.PF_GROUND : 0));
}
// The side of row k of bridge b that shatters (the sim's own, which the brain never reads).
const badSide = (g, b, k) => g.dv.getUint8(L.PG_S + MC.GB_BAD + b * g.S.nr + k);
const panel = (g, b, k, s) => panelOf(g.S, panelIndex(g.S, b, k, s));
const tempered = (g, b, k) => panel(g, b, k, 1 - badSide(g, b, k));
const shatters = (g, b, k) => panel(g, b, k, badSide(g, b, k));
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const f = v.fx(k); if (f.kind === kind) out.push(f); } return out; };
const still = partyWord({ yaw: 0 });
const ahead = partyWord({ yaw: 0, move: 1 });

test('the stage for 1, 8, 64 and 256: a bridge for every 8, more rows for a crowd on one, decks either end, every ball on the start deck before its bridge', async () => {
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const nb = Math.ceil(n / MC.GB_PER), nr = MC.GB_ROW0 + (Math.ceil(n / nb) >> 1);
    const S = g.S;
    assert.deepEqual([r.game, S.nb, S.nr], [L.MG_GLASS, nb, nr], `${n} balls`);
    assert.deepEqual([r.kind, r.len, r.respawn, r.flags], [L.PK_SCORE, MC.GB_LEN0 + nr * MC.GB_LENK, 0x7fffffff, L.PGF_BUMPS | L.PGF_NOKICK]);
    assert.deepEqual([r.hop, r.idle], [Math.fround(MC.GB_HOP), Math.fround(MC.GB_IDLE)]);
    // the stage centred on PG_CX, the decks and rows along +x, the bridges across
    const len = MC.GB_DS + MC.GB_G + nr * PITCH + MC.GB_DF, wid = nb * BP - MC.GB_GB;
    assert.ok(Math.abs(S.x0 - MC.GB_DS + len / 2 - C) < 1e-3 && Math.abs(S.fx - (S.x0 + MC.GB_G + nr * PITCH)) < 1e-3);
    assert.ok(Math.abs((S.zl + S.zr) / 2 - C) < 1e-3 && Math.abs(S.zr - S.zl - wid) < 1e-3);
    assert.ok(Math.abs(r.size - Math.max(len, wid + 2 * MC.GB_EDGE) / 2) < 1e-3);
    assert.ok(S.zl - MC.GB_EDGE > 0 && S.zr + MC.GB_EDGE < L.WORLD, 'in the world');
    // every panel whole; past them nothing
    for (let c = 0; c < MC.GB_NBMAX * MC.GB_NRMAX * 2; c++) assert.equal(cellOf(g.v, c), c < 2 * nb * nr ? 1 : 0);
    // what holds where: the decks, the panels, the gaps between
    const P = panel(g, nb - 1, nr - 1, 1);
    assert.equal(supportAt(S, S.x0 - 1, S.zl), -2);
    assert.equal(supportAt(S, S.fx + 1, S.zr), -3);
    assert.equal(supportAt(S, P.cx, P.cz), P.c);
    assert.equal(supportAt(S, S.x0 + MC.GB_G / 2, S.zl + 1), -1, 'the first gap');
    assert.equal(supportAt(S, P.cx, P.z0 - MC.GB_GIN / 2), -1, 'between a pair');
    const used = [];
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y);
      assert.equal(supportAt(S, b.pos[0], b.pos[2]), -2, `${n}: P${p + 1} on the start deck`);
      const [z0, z1] = [S.zl + (p % nb) * BP, S.zl + (p % nb) * BP + BP - MC.GB_GB];
      assert.ok(b.pos[2] > z0 && b.pos[2] < z1, `${n}: P${p + 1} before bridge ${p % nb}`);
      for (const [x, z] of used) assert.ok(Math.hypot(x - b.pos[0], z - b.pos[2]) >= 2.4, `${n}: P${p + 1} has room`);
      used.push([b.pos[0], b.pos[2]]);
    }
  }
});

test('which panel of a pair shatters is the seed\'s: $p_seed pair by pair, both sides on every bridge, the bridges and the rounds each their own', async () => {
  const g = await room(64, { play: false, seed: 11 });
  const { nb, nr } = g.S;
  const all = [];
  for (let b = 0; b < nb; b++) {
    const row = [];
    for (let k = 0; k < nr; k++) {
      assert.equal(badSide(g, b, k), pSeed(g.v, MC.GB_KSEED + b * nr + k) & 1, `bridge ${b} row ${k}`);
      row.push(badSide(g, b, k));
    }
    assert.ok(row.includes(0) && row.includes(1), `bridge ${b}: ${row}`);
    all.push(row.join(''));
  }
  assert.ok(new Set(all).size >= nb - 1, `the bridges' answers ${all}`);
  const h = await room(64, { play: false, seed: 12 });
  const other = Array.from({ length: nb }, (_, b) => Array.from({ length: nr }, (_, k) => badSide(h, b, k)).join(''));
  assert.notDeepEqual(other, all, 'another room, other answers');
});

test('a gap is a hop: rolling flat out off the deck falls in and is out for good; a hop at the lip lands on the first row', async () => {
  const g = await room(2);
  const S = g.S;
  const T = tempered(g, 0, 0);
  // flat out (10 m/s) and still pushing off the lip: down, and never back
  put(g, 0, S.x0 - 0.5, T.cz, { vx: 10 });
  put(g, 1, S.x0 - 6, T.cz + 6);
  let k = 0;
  for (; k < 400 && !g.v.partier(0).out; k++) {
    g.step([[L.EV_INPUT, 0, ahead]]);
    if (g.v.partier(0).pos[0] > S.x0 + 0.1 && !g.v.partier(0).out) assert.ok(!g.v.partier(0).ground, 'nothing holds it over the gap');
  }
  const b = g.v.partier(0);
  assert.ok(b.out && b.outAt > 0, `out ${k} ticks on`);
  assert.equal(b.score, 0, 'off the deck: no row reached');
  for (let i = 0; i < 400; i++) g.step();
  assert.ok(g.v.partier(0).out, 'and stays out');
  // a hop from a run-up lands on row 0's glass, and that is its row
  const h = await room(2);
  const T2 = tempered(h, 0, 0);
  put(h, 0, h.S.x0 - 4.2, T2.cz);
  put(h, 1, h.S.x0 - 6, T2.cz + 6);
  let hopped = false, n = 0;
  for (; n < 400 && !(hopped && h.v.partier(0).ground); n++) {
    const x = h.v.partier(0).pos[0];
    const hop = !hopped && x > h.S.x0 - 0.4;
    hopped ||= hop;
    h.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, move: 1, hop: hop ? 1 : 0 })]]);
  }
  const c = h.v.partier(0);
  assert.ok(c.ground && !c.out, 'landed');
  assert.equal(supportAt(h.S, c.pos[0], c.pos[2]), T2.c, 'on row 0\'s tempered glass');
  h.step();
  assert.equal(h.v.partier(0).m, 1, 'its row, from push');
  // rolled across a row's gap even at 14 m/s, a ball drops too far to roll up onto the next
  put(h, 0, T2.x1 - 0.3, T2.cz, { vx: 14 });
  for (let i = 0; i < 40; i++) h.step([[L.EV_INPUT, 0, ahead]]);
  assert.ok(h.v.partier(0).pos[1] < PLAT_Y - 0.5, `under the glass at ${h.v.partier(0).pos[1]}`);
});

test('tempered glass holds whoever stands on it for good, marked stood on (an FX) the first time, and the ball\'s row is the furthest it stood on', async () => {
  const g = await room(2);
  const T = tempered(g, 0, 3), B = shatters(g, 0, 3);
  put(g, 0, T.cx, T.cz);
  put(g, 1, g.S.x0 - 5, T.cz);
  const seen = g.v.fxCount();
  g.step();
  assert.equal(cellOf(g.v, T.c), 2, 'stood on');
  const safe = fxs(g.v, MC.GB_FX_SAFE, seen);
  assert.equal(safe.length, 1);
  assert.deepEqual([safe[0].owner, safe[0].shot, safe[0].size], [0, T.c, 3]);
  assert.ok(Math.abs(safe[0].pos[0] - T.cx) < 1e-3 && Math.abs(safe[0].pos[2] - T.cz) < 1e-3);
  for (let k = 0; k < 1500; k++) g.step();
  const b = g.v.partier(0);
  assert.ok(!b.out && b.ground, 'still on it');
  assert.equal(supportAt(g.S, b.pos[0], b.pos[2]), T.c);
  assert.equal(b.m, 4, 'row 3 (the fourth)');
  assert.equal(fxs(g.v, MC.GB_FX_SAFE, seen).length, 1, 'marked once');
  assert.equal(cellOf(g.v, B.c), 1, 'its partner still whole');
  assert.equal(known(g.v, g.S, 0, 3), T.s, 'and anyone can tell which holds');
});

test('glass that shatters cracks the tick a ball lands, holds GB_HOLD (0.32 s) more, then goes for good: the ball falls and is out, scored by the row it fell from', async () => {
  const g = await room(3);
  const B = shatters(g, 0, 2), T = tempered(g, 0, 2);
  put(g, 0, B.cx, B.cz + 0.5, { y: PLAT_Y + 1.5, ground: false });
  put(g, 1, g.S.x0 - 5, B.cz);
  put(g, 2, g.S.x0 - 5, B.cz + 4);
  const seen = g.v.fxCount();
  while (!g.v.partier(0).ground) { assert.equal(cellOf(g.v, B.c), 1, 'whole under a ball in the air'); g.step(); }
  const t0 = g.v.tick - 1;
  assert.equal(cellOf(g.v, B.c), t0 + MC.GB_HOLD, 'cracked on the tick it landed');
  const crack = fxs(g.v, MC.GB_FX_CRACK, seen);
  assert.equal(crack.length, 1);
  assert.deepEqual([crack[0].owner, crack[0].shot, crack[0].tick, crack[0].size], [0, B.c, t0, 2]);
  assert.equal(known(g.v, g.S, 0, 2), T.s, 'its partner is known to hold');
  while (g.v.tick < t0 + MC.GB_HOLD) { g.step(); assert.ok(g.v.partier(0).ground, `held at ${g.v.tick - 1 - t0}`); }
  const drop = fxs(g.v, MC.GB_FX_DROP, seen);
  assert.equal(drop.length, 1);
  assert.deepEqual([drop[0].owner, drop[0].shot, drop[0].tick], [255, B.c, t0 + MC.GB_HOLD - 1]);
  g.step();
  assert.ok(!g.v.partier(0).ground, 'gone from under it');
  let k = 0;
  while (!g.v.partier(0).out && k++ < 400) g.step();
  const b = g.v.partier(0);
  assert.ok(b.out, `out ${k} ticks after`);
  assert.deepEqual([b.m, b.score], [3, 6], 'row 2 reached, scored twice that and none for standing');
  // gone for good: a ball put on it later falls straight through, and nothing cracks again
  put(g, 1, B.cx, B.cz);
  g.step();
  assert.ok(!g.v.partier(1).ground);
  for (let i = 0; i < 50; i++) g.step();
  assert.ok(g.v.partier(1).pos[1] < PLAT_Y - 1, 'through');
  assert.equal(fxs(g.v, MC.GB_FX_CRACK, seen).length, 1);
  // and its partner holds
  put(g, 2, T.cx, T.cz);
  for (let i = 0; i < 300; i++) g.step();
  assert.ok(g.v.partier(2).ground && !g.v.partier(2).out);
});

test('a ball on cracked glass sinks in: a hop off it is undone, its speed bleeds away, and it goes down with the glass', async () => {
  const g = await room(2);
  const B = shatters(g, 0, 4);
  put(g, 0, B.x0 + 2, B.cz, { vx: 7 });
  put(g, 1, g.S.x0 - 5, B.cz);
  g.step([[L.EV_INPUT, 0, ahead]]);
  const t0 = g.v.tick - 1;
  assert.equal(cellOf(g.v, B.c), t0 + MC.GB_HOLD);
  const hop = partyWord({ yaw: 0, move: 1, hop: 1 });
  for (let k = 0; k < MC.GB_HOLD - 2; k++) {
    g.step([[L.EV_INPUT, 0, hop]]);
    const b = g.v.partier(0);
    assert.equal(b.pos[1], PLAT_Y, `down on the glass ${k + 1} ticks on`);
    assert.ok(b.vel[1] <= 0);
    if (k === 15) assert.ok(Math.hypot(b.vel[0], b.vel[2]) < 0.8, `slowed to ${Math.hypot(b.vel[0], b.vel[2]).toFixed(2)} m/s`);
  }
  assert.equal(supportAt(g.S, g.v.partier(0).pos[0], g.v.partier(0).pos[2]), B.c, 'never got off it');
  for (let k = 0; k < 300 && !g.v.partier(0).out; k++) g.step([[L.EV_INPUT, 0, hop]]);
  assert.ok(g.v.partier(0).out);
});

test('the finish: onto the finish deck a ball is across, out of play, parked; its order (shared on a tick) and score; the round goes on for the rest', async () => {
  const g = await room(4);
  const S = g.S;
  const [z0] = [S.zl + 2];
  put(g, 3, S.x0 - 5, z0);
  const seen = g.v.fxCount();
  put(g, 0, S.fx + 1, z0);
  g.step();
  let a = g.v.partier(0);
  assert.ok(a.out && a.ground, 'out of play, standing');
  assert.deepEqual([a.score, a.m], [MC.GB_SFIN, MC.GB_M_HOME | 1]);
  assert.ok(a.pos[0] >= S.fx + MC.GB_PARK - 1e-3 && a.pos[0] < S.fx + MC.GB_DF, `parked at ${a.pos[0]}`);
  const home = fxs(g.v, MC.GB_FX_HOME, seen);
  assert.deepEqual([home.length, home[0].owner, home[0].shot], [1, 0, 1]);
  put(g, 1, S.fx + 1.5, z0 + 3);
  put(g, 2, S.fx + 2, z0 + 6);
  g.step();
  for (const p of [1, 2]) assert.deepEqual([g.v.partier(p).out, g.v.partier(p).score, g.v.partier(p).m], [true, MC.GB_SFIN - 1, MC.GB_M_HOME | 2], `P${p + 1} shares 2nd`);
  const spots = [0, 1, 2].map((p) => g.v.partier(p).pos);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][2] - spots[j][2]) >= MC.GB_PARKD - 1e-3, 'each its own spot');
  assert.equal(g.dv.getUint32(L.PG_H + MC.GB_FIN, true), 3);
  for (let i = 0; i < 200; i++) g.step();
  assert.equal(g.v.hole().state, L.H_PLAY, 'P4 still to cross');
  const list = standings(g.v);
  assert.deepEqual(list.map((e) => [e.slot, e.rank]), [[0, 1], [1, 2], [2, 2], [3, 4]]);
});

test('the clock, and the places: across by order, then by the row reached, one still standing ahead of one fallen from the same row; points 10 down to 1; over early once nobody is left out there', async () => {
  const g = await room(6);
  const S = g.S;
  const T4 = tempered(g, 0, 4), T1 = tempered(g, 0, 1), T3 = tempered(g, 0, 3);
  put(g, 0, S.fx + 1, S.zl + 2);
  put(g, 1, T4.cx, T4.cz); // stands on row 4
  put(g, 2, T4.cx - 3, T4.cz + (T4.s ? -1.2 : 1.2)); // on row 4 too, then off its side
  put(g, 3, T1.cx, T1.cz); // row 1
  put(g, 4, T3.cx, T3.cz); // row 3
  put(g, 5, S.x0 - 5, S.zl + 5); // never left the deck
  g.step();
  g.step();
  put(g, 2, T4.cx - 3, T4.s ? T4.z0 - 0.3 : T4.z1 + 0.3, { vz: 0 });
  g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 400, true);
  while (g.v.hole().state === L.H_PLAY) g.step();
  const v = g.v;
  assert.ok(v.partier(2).out, 'P3 fell');
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((p) => v.partier(p).score), [MC.GB_SFIN, 11, 10, 5, 9, 1]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((p) => v.partier(p).place), [1, 2, 3, 5, 4, 6]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((p) => v.partier(p).pts), [10, 8, 6, 2, 4, 1]);
  assert.equal(v.party().winner, 0);
  // and over before the clock when nobody is left out there: the tick the last one goes
  const h = await room(3);
  const T2 = tempered(h, 0, 2), B5 = shatters(h, 0, 5);
  put(h, 0, h.S.fx + 1, h.S.zl + 2);
  put(h, 1, T2.cx, T2.cz);
  put(h, 2, B5.cx, B5.cz);
  h.step();
  put(h, 1, T2.x1 + 1, T2.cz); // over the gap past row 2
  let k = 0;
  while (h.v.hole().state === L.H_PLAY && k++ < 600) h.step();
  assert.equal(h.v.hole().state, L.H_OVER, `over ${k} ticks on, long before the clock`);
  assert.deepEqual([0, 1, 2].map((p) => h.v.partier(p).place), [1, 3, 2], 'row 5 fallen ahead of row 2 fallen');
});

test('bumps are on: a ball rolled hard into one on tempered glass shoves it across onto the glass beside, which cracks under it; the knock-out is the shover\'s', async () => {
  const g = await room(2, { seed: 3 });
  const T = tempered(g, 0, 2), B = shatters(g, 0, 2);
  const dir = B.cz > T.cz ? 1 : -1;
  const edge = dir > 0 ? T.z1 : T.z0;
  put(g, 1, T.cx, edge - dir * 1.1);
  put(g, 0, T.cx, edge - dir * 4.1, { vz: dir * 9 });
  const seen = g.v.fxCount();
  const toward = partyWord({ yaw: dir > 0 ? 4096 : 12288, move: 1 });
  let k = 0;
  while (!g.v.partier(1).out && k++ < 400) g.step([[L.EV_INPUT, 0, k < 22 ? toward : still]]);
  const crack = fxs(g.v, MC.GB_FX_CRACK, seen);
  assert.ok(crack.length === 1 && crack[0].owner === 1 && crack[0].shot === B.c, 'P2 landed on the glass beside and cracked it');
  assert.ok(fxs(g.v, L.FX_BUMP, seen).length >= 1, 'a hard bump');
  assert.ok(g.v.partier(1).out && !g.v.partier(0).out);
  const sink = fxs(g.v, L.FX_SINK, seen)[0];
  assert.deepEqual([sink.owner, sink.shot, g.v.partier(0).kos], [1, 0, 1], 'P1 knocked P2 out');
});

// Slot 0 predicted through words in one run, then the confirmed world stepped
// through them: the same position on every tick, the same record at the end,
// and the cracks the prediction made (in its FX ring) the ones the confirmed
// world made under it.
function aheadRun(g, words) {
  const n = words.length;
  for (let i = 0; i < n; i++) g.dv.setUint32(L.PWORDS + 4 * i, words[i], true);
  g.sim.x.predict(0, n);
  const t0 = g.v.tick;
  const track = Array.from({ length: n }, (_, k) => [0, 4, 8].map((o) => g.dv.getFloat32(L.PTRACK + 16 * k + o, true)));
  const player = g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE);
  const cracks = fxs(new View(g.sim.memory.buffer, L.PRED_D), MC.GB_FX_CRACK).map((f) => [f.tick - t0, f.shot]);
  const seen = g.v.fxCount();
  for (let k = 0; k < n; k++) {
    g.step([[L.EV_INPUT, 0, words[k]]]);
    assert.deepEqual(g.v.partier(0).pos, track[k], `predicted ${k + 1} of ${n}`);
  }
  assert.deepEqual(player, g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE), `the record, ${n} ahead`);
  const mine = fxs(g.v, MC.GB_FX_CRACK, seen).filter((f) => f.owner === 0).map((f) => [f.tick - t0, f.shot]);
  assert.deepEqual(cracks, mine, 'its cracks');
  return { cracks, track };
}

test('the prediction is exact however far ahead it runs: it cracks its own ball\'s glass as it lands, holds it there through every hop, and drops it through', async () => {
  // from on it, 2 m and 6 m up: as far as PRED_MAX and short of the confirmed world's out, 14 m under
  for (const [n, up] of [[MC.GB_HOLD + 30, 0], [201, 2], [L.PRED_MAX, 6]]) {
    const g = await room(2);
    const B = shatters(g, 0, 3);
    put(g, 0, B.cx, B.cz, { vx: 3, y: PLAT_Y + up, ground: !up });
    put(g, 1, g.S.x0 - 5, B.cz);
    const hop = partyWord({ yaw: 0, move: 1, hop: 1 });
    const { cracks, track } = aheadRun(g, Array.from({ length: n }, (_, k) => (k % 3 ? hop : ahead)));
    assert.equal(cracks.length, 1);
    const [t0, c] = cracks[0];
    assert.equal(c, B.c);
    assert.ok(up ? t0 > 40 : t0 === 0, `cracked ${t0} in`);
    for (let k = t0; k < t0 + MC.GB_HOLD; k++) assert.equal(track[k][1], PLAT_Y, `held ${k - t0} on`);
    assert.ok(track[n - 1][1] < PLAT_Y - 0.3 && !g.v.partier(0).out, `through, at ${track[n - 1][1]}`);
  }
});

// The words a driver plays for slot 0 in a fresh room (setup run on it, and
// what it returns before every step): forward, a hop at every lip, a few
// ticks of no keys; and the step after which it first stood on row 1.
async function driven(n, setup, ticks, { seed = 7 } = {}) {
  const g = await room(n, { seed });
  const script = setup(g);
  const words = [];
  let land = -1;
  for (let k = 0; k < ticks; k++) {
    script?.(g, k);
    const b = g.v.partier(0);
    const c = supportAt(g.S, b.pos[0], b.pos[2]);
    const box = c >= 0 ? panelOf(g.S, c) : { x1: g.S.x0 };
    const hop = b.ground && c !== -1 && c !== -3 && b.pos[0] > box.x1 - 0.5;
    words.push(partyWord({ yaw: 0, move: k % 160 < 150 ? 1 : 0, hop: hop ? 1 : 0 }));
    g.step([[L.EV_INPUT, 0, words.at(-1)]]);
    const a = g.v.partier(0), c1 = supportAt(g.S, a.pos[0], a.pos[2]);
    if (land < 0 && a.ground && c1 >= 0 && panelOf(g.S, c1).k === 1) land = k;
    if (a.out) return { words: words.slice(0, k), land };
  }
  return { words, land };
}
// The rest of a room of 24 out of the way, at the back of the start deck.
const crowdBack = (g, from = 1) => { for (let p = from; p < 24; p++) put(g, p, g.S.x0 - 8 - 1.6 * (p >> 4), g.S.zl + 1 + (p % 16) * 2.5); };
// A bridge whose row 0 holds where row 1 shatters, straight on.
const straight = (g) => { for (let b = 0; b < g.S.nb; b++) if (1 - badSide(g, b, 0) === badSide(g, b, 1)) return b; return -1; };

test('the prediction matches the confirmed ball bit for bit, tick by tick, from the deck over the gaps onto tempered glass and onto glass that shatters under it', async () => {
  const setup = (g) => {
    const b = straight(g);
    assert.ok(b >= 0, 'a bridge to run');
    crowdBack(g);
    put(g, 0, g.S.x0 - 4.2, tempered(g, b, 0).cz);
  };
  const { words, land } = await driven(24, setup, 900);
  assert.ok(land > 100 && words.length > land + MC.GB_HOLD + 100, `on row 1 at ${land}, out after ${words.length}`);
  const g = await room(24);
  setup(g);
  assert.ok(predicted(g, words) >= words.length);
  const b = g.v.partier(0);
  assert.ok(b.falling && b.m === 2, `crossed row 0, going down through row 1 (${b.m})`);
});

test('the prediction is exact onto glass another ball cracked: it knows the confirmed world\'s crack, sinks in and goes down with it', async () => {
  const base = (g) => { crowdBack(g); put(g, 0, g.S.x0 - 4.2, tempered(g, straight(g), 0).cz); };
  const { land } = await driven(24, base, 900);
  assert.ok(land > 100, `P1 alone comes down on row 1 at ${land}`);
  // P2 onto the far end of that glass 35 ticks before P1 comes down on it: every prediction 30 ahead knows
  const setup = (g) => {
    base(g);
    const B = shatters(g, straight(g), 1);
    return (h, k) => { if (k === land - 35) put(h, 1, B.x1 - 0.8, B.cz); };
  };
  const { words } = await driven(24, setup, 900);
  const g = await room(24);
  const script = setup(g);
  const step = g.step;
  let k = 0;
  g.step = (recs) => { script(g, k++); step(recs); };
  const seen = g.v.fxCount();
  assert.ok(predicted(g, words) >= land + MC.GB_HOLD + 50);
  const cracks = fxs(g.v, MC.GB_FX_CRACK, seen);
  assert.ok(cracks.length >= 1 && cracks[0].owner === 1, 'P2 cracked it');
  assert.ok(!cracks.some((f) => f.owner === 0), 'P1 came down on it cracked');
  assert.ok(g.v.partier(0).falling && g.v.partier(1).falling, 'and both go down with it');
});

// A round of Partier balls (client/party-bot.mjs, steered by this minigame's
// brain) on the debug build, as tools/genparty.mjs plays one: the log, how the
// round went.
async function aiRound(balls, seed) {
  const stats = { start: -1, over: -1, homes: [], cracks: 0, falls: 0, places: null, pts: null, winner: -1, rows: null };
  let seen = 0;
  const { log } = await playParty({ bytes: partyBytes(true), seed, mg: L.MG_GLASS, bots: balls, ticks: 16000, delay: 6, onTick: (t, s, v) => {
    assert.equal(s.error().code, 0, 'no trap');
    const g = v.party();
    if (stats.start < 0 && g.state === L.H_PLAY) { stats.start = t; seen = v.fxCount(); }
    if (stats.start >= 0 && stats.over < 0) {
      for (; seen < v.fxCount(); seen++) {
        const x = v.fx(seen);
        if (x.kind === MC.GB_FX_HOME) stats.homes.push((t - stats.start) * TICK);
        if (x.kind === MC.GB_FX_CRACK) stats.cracks++;
        if (x.kind === L.FX_SINK) stats.falls++;
      }
    }
    if (stats.over < 0 && stats.start >= 0 && g.state === L.H_OVER) {
      stats.over = t;
      stats.winner = g.winner;
      stats.places = [...Array(balls).keys()].map((p) => v.partier(p).place);
      stats.pts = [...Array(balls).keys()].map((p) => v.partier(p).pts);
      stats.rows = [...Array(balls).keys()].map((p) => v.partier(p).m);
    }
  } });
  return { log, stats };
}

for (const [balls, seed] of [[8, 6], [64, 7]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, they cross on the trail and guess at the front, some get across, the rest fall by the glass; places and points for all; equal on 1 and 4 threads`, async () => {
    const { log, stats } = await aiRound(balls, seed);
    assert.ok(stats.over > 0, 'the round ended');
    const secs = (stats.over - stats.start) * TICK;
    assert.ok(stats.homes.length >= Math.max(1, balls / 16), `${stats.homes.length} of ${balls} across in ${secs.toFixed(1)} s`);
    assert.ok(stats.homes[0] > 20, `the first across at ${stats.homes[0].toFixed(1)} s`);
    assert.equal(stats.homes.length + stats.falls, balls, 'everyone across or down: over before the clock');
    assert.ok(stats.cracks >= 3 && stats.falls >= stats.cracks - 1, `${stats.cracks} cracks, ${stats.falls} falls`);
    assert.ok(stats.places.every((x) => x >= 1 && x <= balls), `places ${stats.places}`);
    assert.ok(stats.pts.every((x) => x >= 1 && x <= 10), `points ${stats.pts}`);
    assert.ok(stats.winner >= 0 && stats.places[stats.winner] === 1, 'somebody won');
    const parsed = parseLog(log);
    const n = stats.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('the AI ball sees only what a player sees: the answers flipped under it change none of its words; and it takes the side the broken glass gives away', async () => {
  const g = await room(16, { seed: 9 });
  const bots = Array.from({ length: 16 }, (_, p) => new Partier(p, 5, 0.3 + 0.04 * p));
  const n = g.S.nb * g.S.nr;
  const flip = () => { for (let q = 0; q < n; q++) g.dv.setUint8(L.PG_S + MC.GB_BAD + q, g.dv.getUint8(L.PG_S + MC.GB_BAD + q) ^ 1); };
  const stub = (bot) => ({ slot: bot.slot, skill: bot.skill, pos: [...bot.pos], vel: [...bot.vel], mem: structuredClone(bot.mem), rng: bot.rng, rand: Partier.prototype.rand });
  let checked = 0;
  for (let t = 0; t < 4000 && g.v.hole().state === L.H_PLAY; t++) {
    const recs = bots.map((b) => [L.EV_INPUT, b.slot, b.think(g.v, g.v.tick + 6, 12)]);
    if (t % 25 === 0) {
      for (const b of bots) {
        const me = g.v.partier(b.slot);
        const a = glass.brain.think(g.v, me, stub(b), g.v.tick);
        flip();
        const c = glass.brain.think(g.v, me, stub(b), g.v.tick);
        const d0 = glass.brain.danger(g.v, me.pos[0] + 3, me.pos[2], g.v.tick);
        flip();
        assert.deepEqual(c, a, `P${b.slot + 1} at ${t}`);
        assert.equal(glass.brain.danger(g.v, me.pos[0] + 3, me.pos[2], g.v.tick), d0);
        checked++;
      }
    }
    g.step(recs);
  }
  assert.ok(checked > 1000, `${checked} thinks`);
  // a ball on row 2's glass, row 3's one panel broken: it goes for the other
  const h = await room(2, { seed: 4 });
  const T2 = tempered(h, 0, 2), B3 = shatters(h, 0, 3);
  h.dv.setUint32(L.PG_S + MC.GB_CELLS + 4 * B3.c, h.v.tick - 50, true);
  put(h, 0, T2.x1 - 4.2, T2.cz);
  put(h, 1, h.S.x0 - 5, T2.cz);
  h.step();
  const bot = new Partier(0, 3, 0.8);
  bot.think(h.v, h.v.tick, 0);
  const T = bot.mem.T;
  assert.ok(T && supportAt(h.S, T[0], T[1]) === tempered(h, 0, 3).c, `its target ${T}`);
});

test('the client module: draws the decks, the rails and every panel whole, cracked and in shards; frames the stage; writes its HUD lines; its FX and the feed\'s fall line', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const g = await room(4, { seed: 5 });
  const S = g.S;
  const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null };
  const lines = [];
  const hctx = { put: (x, y, s, c) => lines.push([y, s, c]), centre: (y, s, c) => lines.push([y, s, c]), right: (y, s, c) => lines.push([y, s, c]), rows: 44, C: {}, slot: 0, now: 0 };
  const draw = (ptick = g.v.tick) => {
    out.scene.clear(); lines.length = 0;
    glass.draw(g.v, { tick: g.v.tick, ptick, dt: 0, now: 0, slot: 0, me: g.v.partier(0) }, out);
    for (let k = 0; k < out.scene.count * 16; k++) assert.ok(Number.isFinite(out.scene.data[k]), 'finite');
    glass.hud(g.v, { ...hctx, me: g.v.partier(0), t: g.v.party().t * TICK });
    for (const l of lines) assert.ok(l[1].length <= 40, l[1]);
    return lines.map((l) => l[1]).join(' | ');
  };
  let text = draw();
  const solids = 4 + S.nb * (2 + S.nr + 1 + 2 * S.nr);
  assert.equal(out.scene.count, solids, 'decks, line, rails, ties and every panel');
  assert.match(text, new RegExp(`^${S.nr} ROWS TO CROSS`));
  assert.match(text, /ROW 1: NOBODY KNOWS/);
  const B = shatters(g, 0, 0), T = tempered(g, 0, 0);
  put(g, 1, B.cx, B.cz);
  g.step();
  text = draw();
  assert.match(text, new RegExp(`ROW 1: THE ${T.s ? 'RIGHT' : 'LEFT'} HOLDS`));
  for (let k = 0; k < MC.GB_HOLD + 10; k++) g.step();
  draw();
  assert.equal(out.scene.count, solids + 5, 'a broken panel is six shards');
  draw(g.v.tick + 400);
  assert.equal(out.scene.count, solids - 1, 'then nothing');
  put(g, 0, T.cx, T.cz);
  g.step();
  text = draw();
  assert.match(text, /ROW 1 OF \d+/);
  assert.match(text, /\d(ST|ND|RD|TH) OF 4/);
  put(g, 2, S.fx + 1, S.zl + 2);
  g.step();
  text = draw();
  assert.match(text, /1 OF 4 ACROSS/);
  const fr = glass.frame(g.v);
  assert.equal(fr.shape, 'square');
  assert.ok(Math.abs(fr.centre[0] - C) < 1e-3 && Math.abs(fr.centre[2] - C) < 1e-3 && fr.radius === g.v.party().size);
  assert.equal(glass.facing(), 0);
  assert.ok(glass.hint.length <= 70 && glass.rules.length <= 70);
  assert.deepEqual([glass.ownScore, glass.outForGood], [true, true]);
  // the FX: each kind a sound and a glow, a banner when it's yours
  const said = [], heard = [], glows = [];
  const fctx = { slot: 0, glow: (x) => glows.push(x), sound: new Proxy({}, { get: (_, k) => () => heard.push(k) }), banner: (s) => said.push(s), feed: (s) => said.push(s), name: (p) => (p === 0 ? 'YOU' : `P${p + 1}`), dist: 5, view: g.v };
  for (const kind of [MC.GB_FX_CRACK, MC.GB_FX_DROP, MC.GB_FX_SAFE, MC.GB_FX_HOME]) glass.fx({ tick: 0, kind, owner: 0, shot: 1, pos: [C, PLAT_Y, C], size: 1 }, fctx);
  assert.deepEqual(said, ['IT CRACKS!', 'TEMPERED!', 'ACROSS 1ST!']);
  assert.ok(heard.includes('crackle') && heard.includes('blast') && heard.includes('holed') && glows.length >= 15);
  assert.equal(glass.sink({ owner: 1, shot: 255 }, fctx.name, g.v), 'P2 FELL AT ROW 1');
});

test('a tick of 256 balls, AI balls on the bridges, on the release build', async (t) => {
  const g = await room(256, { debug: false, seed: 5 });
  const bots = Array.from({ length: 256 }, (_, p) => new Partier(p, 5, 0.3 + 0.6 * ((p * 5) % 256) / 256));
  let ms = 0, n = 0;
  for (let k = 0; k < 3000 && g.v.hole().state === L.H_PLAY; k++) {
    g.sim.feedPlayers(bots.map((b) => [L.EV_INPUT, b.slot, b.think(g.v, g.v.tick, 0)]));
    const a = performance.now();
    g.sim.x.step();
    if (k >= 500) { ms += performance.now() - a; n++; }
  }
  const left = g.v.party().left;
  t.diagnostic(`${(ms / n).toFixed(3)} ms a tick over ${n} ticks, 256 balls (${left} still on the bridges at the end)`);
  assert.ok(n >= 2000 && left > 64, `${n} ticks timed, ${left} left`);
  assert.ok(ms / n < 2, `${(ms / n).toFixed(3)} ms`);
});
