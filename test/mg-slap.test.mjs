// SLAP HAPPY (src/mg/slap.wat): the islands for the crowd and the sea
// between them, the swing (its wind-up, cone, reach and cooldown, glove by
// glove), the fling, the credit and the points, the respawn pads and their
// shelter, the clock, the prediction through all of a ball's own, and
// rounds of AI balls playing it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/slap.mjs'; // SL_*: the minigame's own constants
import sl, { stage, islandAt, gloveOf, swingOf, sheltered, GLOVES } from '../client/mg/slap.mjs';

const C = L.B_CX;
const TICK = 0.008;
const f32 = Math.fround;
const Y = (a) => Math.round(a / (2 * Math.PI) * 16384) & 16383;

// A room of n balls in SLAP HAPPY, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_SLAP + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step, n, uses: [] };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// The next step plays tick t into play (the clock moved, the round's end with it).
function at(g, t) {
  const now = g.v.tick;
  g.dv.setUint32(L.HDR_START, now - t, true);
  g.dv.setUint32(L.HDR_UNTIL, now - t + MC.SL_LEN, true);
}
// Ball p at (x, z) on the ground (or at y in the air), rolling at (vx, vz).
function put(g, p, x, z, { y = PLAT_Y, vx = 0, vz = 0, ground = true } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE | (ground ? L.PF_GROUND : 0));
  g.dv.setUint32(rec(p) + L.B_OUTAT, 0, true);
}
// Every ball but the ones named parked on a line across the far side of the main island, apart and still.
function park(g, keep) {
  const st = stage(g.v);
  for (let p = 0, k = 0; p < g.n; p++) if (!keep.includes(p)) put(g, p, C - st.rm + 2 + 2.5 * (k % 6), C - st.rm * 0.5 + 2.5 * Math.floor(k++ / 6));
}
const score = (g, p) => g.dv.getUint16(rec(p) + L.PG_SCORE, true);
const setScore = (g, p, s) => g.dv.setUint16(rec(p) + L.PG_SCORE, s, true);
const fxs = (v, kind, from = 0) => { const out = []; for (let k = Math.max(from, v.fxCount() - L.FX_MAX); k < v.fxCount(); k++) { const f = v.fx(k); if (f.kind === kind) out.push(f); } return out; };
// Steps with these words for these slots (the rest keep theirs) n times.
const hold = (g, words, n = 1) => { for (let k = 0; k < n; k++) g.step(Object.entries(words).map(([p, w]) => [L.EV_INPUT, Number(p), w])); };
// Slot p's word: a press of use (its counter on one), or still holding the counter where it is.
const press = (g, p, yaw = 0, move = 0) => { g.uses[p] = ((g.uses[p] ?? 0) + 1) & 3; return partyWord({ yaw: Y(yaw), move, use: g.uses[p] }); };
const still = (g, p, yaw = 0, move = 0) => partyWord({ yaw: Y(yaw), move, use: g.uses[p] ?? 0 });
// The islands for n balls, as $sl_setup lays them out.
function sizes(n) {
  const rm = Math.min(f32(f32(f32(Math.sqrt(n)) * MC.SL_RK) + MC.SL_R0), MC.SL_RMAX);
  const ns = Math.min(MC.SL_K0 + Math.trunc(f32(rm * MC.SL_KK)), MC.SL_KMAX);
  const sr = f32(f32(rm * f32(MC.SL_SK)) + f32(MC.SL_S0));
  return { rm, ns, sr, ring: f32(f32(rm + f32(MC.SL_GAP)) + sr) };
}
// A room of 2 whose slot 0 wears glove k.
async function roomWith(k, n = 2) {
  for (let s = 1; ; s++) {
    const g = await room(n, { seed: s });
    if (gloveOf(g.v, 0) === k) return g;
  }
}

test('the islands for 1, 8, 64 and 256: the main one and a ring of small ones a hop off it, sized for the crowd, every ball on the main one', async () => {
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party(), st = stage(g.v), want = sizes(n);
    assert.equal(r.game, L.MG_SLAP);
    assert.deepEqual([r.kind, r.len, r.respawn], [L.PK_SCORE, MC.SL_LEN, MC.SL_RESPAWN]);
    assert.deepEqual([st.rm, st.sats.length, st.sr, st.ring], [want.rm, want.ns, want.sr, want.ring], `${n}`);
    assert.equal(r.size, f32(want.ring + want.sr));
    assert.ok(want.ns >= 5 && want.ns <= MC.SL_KMAX);
    // the small ones round the ring, evenly, none touching another
    for (const s of st.sats) assert.ok(Math.abs(Math.hypot(s.x - C, s.z - C) - st.ring) < 2e-3, `${n}: small island ${s.k} on the ring`);
    for (let k = 0; k < st.sats.length; k++) {
      const a = st.sats[k], b = st.sats[(k + 1) % st.sats.length];
      assert.ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - 2 * st.ring * Math.sin(Math.PI / st.sats.length)) < 0.03, `${n}: evenly`);
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 2 * st.sr + 2, `${n}: apart`);
    }
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y, `${n}: P${p + 1} on the ground`);
      assert.ok(Math.hypot(b.pos[0] - C, b.pos[2] - C) < st.rm * MC.SL_SPAWN + 1e-3, `${n}: P${p + 1} on the main island`);
    }
  }
});

test('the ground: a ball stands on any island and drops into the sea between them; the gap is a hop at 7 m/s', async () => {
  const g = await room(2, { seed: 5 });
  const st = stage(g.v);
  const s = st.sats[0], d = Math.hypot(s.x - C, s.z - C), ux = (s.x - C) / d, uz = (s.z - C) / d;
  park(g, [0]);
  // where the client says island and sea, the sim agrees
  const spots = [[C, C, 0], [C + ux * (st.rm - 0.3), C + uz * (st.rm - 0.3), 0], [s.x, s.z, 1], [s.x + uz * (st.sr - 0.3), s.z - ux * (st.sr - 0.3), 1],
    [C + ux * (st.rm + MC.SL_GAP / 2), C + uz * (st.rm + MC.SL_GAP / 2), -1], [C + ux * (st.ring + st.sr + 1), C + uz * (st.ring + st.sr + 1), -1],
    [C - uz * st.ring, C + ux * st.ring, -1]];
  for (const [x, z, want] of spots) {
    const k = islandAt(st, x, z);
    assert.equal(k < 0 ? -1 : k === 0 ? 0 : 1, want, `islandAt ${x.toFixed(1)}, ${z.toFixed(1)}`);
    if (want === 1) assert.equal(k, 1);
    put(g, 0, x, z);
    hold(g, { 0: still(g, 0) }, 30);
    const b = g.v.partier(0);
    assert.equal(b.pos[1] === PLAT_Y && b.ground, want >= 0, `${want >= 0 ? 'stands' : 'drops'} at ${(x - C).toFixed(1)}, ${(z - C).toFixed(1)}`);
  }
  // rolling out to the small island at 7 m/s: a hop at the edge lands on it; no hop, the sea
  for (const hop of [1, 0]) {
    put(g, 0, C + ux * (st.rm - 0.4), C + uz * (st.rm - 0.4), { vx: ux * 7, vz: uz * 7 });
    const yaw = Math.atan2(uz, ux);
    hold(g, { 0: partyWord({ yaw: Y(yaw), move: 1, hop, use: g.uses[0] ?? 0 }) }, 1);
    hold(g, { 0: still(g, 0, yaw, 1) }, 100);
    const b = g.v.partier(0);
    assert.equal(islandAt(st, b.pos[0], b.pos[2]) === 1 && b.pos[1] === PLAT_Y, !!hop, hop ? 'over the gap' : 'into it');
  }
});

test('a swing: the press winds the glove up, and SL_GWIND ticks on it lands on the ball ahead in reach, flung away from the slapper and up, a quarter of its own way kept', async () => {
  const g = await roomWith(MC.SL_G_CLASSIC);
  at(g, 300);
  put(g, 0, C - 3, C);
  put(g, 1, C, C + 0.4, { vz: 2 });
  hold(g, { 0: press(g, 0), 1: still(g, 1) });
  const m = g.v.partier(0).m;
  assert.equal(m >>> 16, 301, 'the press\'s tick into play, + 1');
  assert.ok(m & MC.SL_M_IN);
  // the swing as the client sees it
  assert.ok(swingOf(g.v, 0, 301).winding && !swingOf(g.v, 0, 301).ready);
  let k = 0;
  const n0 = g.v.fxCount();
  while (!fxs(g.v, MC.SL_FX_SLAP, n0).length && k < 100) { hold(g, { 0: still(g, 0), 1: still(g, 1) }); k++; }
  assert.equal(k, MC.SL_GWIND[MC.SL_G_CLASSIC], 'lands SL_GWIND ticks after the press');
  const f = fxs(g.v, MC.SL_FX_SLAP, n0)[0];
  assert.deepEqual([f.owner, f.shot], [0, 1]);
  const b = g.v.partier(1);
  const fl = MC.SL_GFLING[0] / 100, d = Math.hypot(3, b.pos[2] - C);
  // the way from slapper to slapped (as the slap found it: both had rolled a tick since)
  assert.ok(b.vel[0] > fl * 0.95 && b.vel[0] < fl * 1.01, `flung out at ${b.vel[0].toFixed(2)}`);
  assert.ok(Math.abs(b.vel[2] - (b.pos[2] - C) / d * fl) < 0.6 && b.vel[2] > 0.5, `its own way kept: ${b.vel[2].toFixed(2)}`);
  assert.equal(b.vel[1], f32(f32(MC.SL_GUP[0]) * f32(0.01)), 'and up');
  assert.ok(!b.ground);
  assert.equal(b.hitBy, 0);
  assert.equal(g.dv.getUint8(L.PG_S + MC.SL_REC + 8), 1, 'marked as slot 0\'s');
  // the slapper itself is untouched
  assert.deepEqual(g.v.partier(0).vel, [0, 0, 0]);
  // it flies 7 m and more before it's down
  let air = 0;
  while (!g.v.partier(1).ground && air < 200) { hold(g, { 0: still(g, 0), 1: still(g, 1) }); air++; }
  assert.ok(g.v.partier(1).pos[0] - C > 6.5, `landed ${(g.v.partier(1).pos[0] - C).toFixed(1)} m on, after ${air} ticks`);
});

test('the cone and the reach: the nearest in front within reach and SL_DY is hit, the lower slot on a tie; behind, out of reach, over it or sheltered, a miss', async () => {
  const g = await roomWith(MC.SL_G_CLASSIC, 4);
  const reach = MC.SL_GREACH[0] / 100;
  let n = 0;
  const swing = (yaw, place) => {
    at(g, 1000 + 400 * n++);
    put(g, 0, C, C);
    place();
    const n0 = g.v.fxCount();
    hold(g, { 0: press(g, 0, yaw) });
    hold(g, { 0: still(g, 0, yaw) }, MC.SL_GWIND[0]);
    const f = fxs(g.v, MC.SL_FX_SLAP, n0);
    assert.equal(f.length, 1, 'one slap');
    return f[0].shot;
  };
  const far = (p) => put(g, p, C - 9, C - 6 + 3 * p);
  // nearest ahead of two
  assert.equal(swing(0, () => { put(g, 1, C + 3.3, C - 1.3); put(g, 2, C + 2.4, C + 0.6); far(3); }), 2);
  // a tie by distance: the lower slot
  assert.equal(swing(0, () => { put(g, 1, C + 2.5, C - 1.25); put(g, 2, C + 2.5, C + 1.25); far(3); }), 1);
  // the edge of the cone (60 degrees), just in and just out
  const at60 = (a) => [C + 2.5 * Math.cos(a), C + 2.5 * Math.sin(a)];
  assert.equal(swing(0, () => { put(g, 1, ...at60(Math.PI / 3 - 0.06)); far(2); far(3); }), 1);
  assert.equal(swing(0, () => { put(g, 1, ...at60(Math.PI / 3 + 0.06)); far(2); far(3); }), 255, 'outside the cone');
  // behind; facing it
  assert.equal(swing(0, () => { put(g, 1, C - 2.5, C); far(2); far(3); }), 255, 'behind');
  assert.equal(swing(Math.PI, () => { put(g, 1, C - 2.5, C); far(2); far(3); }), 1, 'turned round');
  // the reach, centre to centre
  assert.equal(swing(0, () => { put(g, 1, C + reach - 0.05, C); far(2); far(3); }), 1);
  assert.equal(swing(0, () => { put(g, 1, C + reach + 0.05, C); far(2); far(3); }), 255, 'out of reach');
  // over it (a ball high in the air) is clear
  assert.equal(swing(0, () => { put(g, 1, C + 2, C, { y: PLAT_Y + MC.SL_DY + 0.8, ground: false }); far(2); far(3); }), 255, 'over it');
  // a ball just back on a pad is sheltered
  assert.equal(swing(0, () => { put(g, 1, C + 2, C); g.dv.setUint32(rec(1) + L.B_OUTAT, g.v.tick - MC.SL_RESPAWN - 20, true); far(2); far(3); }), 255, 'sheltered');
  assert.equal(swing(0, () => { put(g, 1, C + 2, C); g.dv.setUint32(rec(1) + L.B_OUTAT, g.v.tick - MC.SL_RESPAWN - MC.SL_SAFE - 2, true); far(2); far(3); }), 1, 'shelter gone');
  // a miss's FX at the glove
  const miss = fxs(g.v, MC.SL_FX_SLAP).filter((f) => f.shot === 255).pop();
  assert.ok(Math.abs(miss.pos[0] - (C + 2)) < 0.01 && miss.size === 0);
});

test('every glove plays its numbers: wind-up, cooldown, reach and fling; the client reads the seed\'s glove as the sim does', async () => {
  const seen = new Set();
  for (let k = 0; k < 4; k++) {
    const g = await roomWith(k);
    seen.add(gloveOf(g.v, 0));
    const reach = MC.SL_GREACH[k] / 100, fling = MC.SL_GFLING[k] / 100;
    at(g, 500);
    put(g, 0, C - 3, C);
    put(g, 1, C - 3 + reach - 0.1, C);
    const n0 = g.v.fxCount();
    hold(g, { 0: press(g, 0) });
    let t = 0;
    while (!fxs(g.v, MC.SL_FX_SLAP, n0).length) { hold(g, { 0: still(g, 0) }); t++; }
    assert.equal(t, MC.SL_GWIND[k], `${GLOVES[k]}: wind-up`);
    const f = fxs(g.v, MC.SL_FX_SLAP, n0)[0];
    assert.equal(f.shot, 1, `${GLOVES[k]}: reaches ${reach} m`);
    assert.equal(f.size, f32(f32(MC.SL_GFLING[k]) * f32(0.01)));
    assert.ok(Math.abs(g.v.partier(1).vel[0] - fling) < 0.05, `${GLOVES[k]}: flung at ${fling}`);
    // a press before the cooldown's end is dropped; one on it swings
    const first = g.v.partier(0).m >>> 16;
    hold(g, { 0: still(g, 0) }, MC.SL_GCOOL[k] - t - 2);
    hold(g, { 0: press(g, 0) });
    assert.equal(g.v.partier(0).m >>> 16, first, `${GLOVES[k]}: still cooling`);
    hold(g, { 0: press(g, 0) });
    assert.equal(g.v.partier(0).m >>> 16, first + MC.SL_GCOOL[k], `${GLOVES[k]}: cooled after ${MC.SL_GCOOL[k]} ticks`);
  }
  assert.equal(seen.size, 4);
  // across a room, the gloves are the seed's, all four in use
  const g = await room(40, { seed: 3 });
  const count = [0, 0, 0, 0];
  for (let p = 0; p < 40; p++) count[gloveOf(g.v, p)]++;
  assert.ok(count.every((c) => c >= 4), `gloves ${count}`);
});

test('no swing from a press made before play, while going over or while down; the first press back swings', async () => {
  const g = await room(2, { play: false });
  // pressed in the countdown: taken at play's start
  hold(g, { 0: press(g, 0) });
  while (g.v.hole().state !== L.H_PLAY) hold(g, { 0: still(g, 0) });
  hold(g, { 0: still(g, 0) }, 3);
  assert.equal(g.v.partier(0).m, MC.SL_M_IN | g.uses[0], 'in, the counter taken, no swing');
  // going over the edge (PF_FALL): the press is taken, no swing
  const st = stage(g.v);
  put(g, 0, C + st.rm + 1, C, { y: PLAT_Y - 2, ground: false });
  hold(g, { 0: still(g, 0) });
  assert.ok(g.v.partier(0).falling);
  hold(g, { 0: press(g, 0) });
  assert.equal(g.v.partier(0).m >>> 16, 0, 'no swing over the sea');
  // pressed while down: back on a pad, still no swing
  while (!g.v.partier(0).out) hold(g, { 0: still(g, 0) });
  hold(g, { 0: press(g, 0) });
  while (g.v.partier(0).out) hold(g, { 0: still(g, 0) });
  hold(g, { 0: still(g, 0) }, 5);
  assert.equal(g.v.partier(0).m, MC.SL_M_IN | g.uses[0], 'back in, no swing');
  hold(g, { 0: press(g, 0) });
  assert.ok(g.v.partier(0).m >>> 16 > 0, 'the next press swings');
});

test('a ball slapped into the sea pays its slapper a point and costs itself one, not below 0; KO and the sea\'s FX to the slapper; two in the last 15 s', async () => {
  const g = await roomWith(MC.SL_G_CLASSIC, 3);
  const st = stage(g.v);
  // a line clear of the small islands: halfway between two
  const a = Math.atan2(st.sats[0].z - C, st.sats[0].x - C) + Math.PI / st.sats.length, ux = Math.cos(a), uz = Math.sin(a);
  const go = (t, s1) => {
    at(g, t);
    put(g, 0, C + ux * (st.rm - 4.5), C + uz * (st.rm - 4.5));
    put(g, 1, C + ux * (st.rm - 1.8), C + uz * (st.rm - 1.8));
    put(g, 2, C - ux * 5, C - uz * 5);
    setScore(g, 1, s1);
    const n0 = g.v.fxCount();
    hold(g, { 0: press(g, 0, a) });
    while (!g.v.partier(1).out) hold(g, { 0: still(g, 0, a) });
    return n0;
  };
  let n0 = go(400, 0);
  assert.equal(score(g, 0), 1, 'a point');
  assert.equal(score(g, 1), 0, 'not below 0');
  assert.equal(g.v.partier(0).kos, 1);
  const sink = fxs(g.v, L.FX_SINK, n0).pop();
  assert.deepEqual([sink.owner, sink.shot], [1, 0]);
  const sc = fxs(g.v, MC.SL_FX_SCORE, n0).pop();
  assert.deepEqual([sc.owner, sc.shot, sc.size], [0, 1, 1]);
  assert.equal(sl.sink(sink, (p) => `P${p + 1}`), 'P1 SLAPPED P2 INTO THE SEA');
  while (g.v.partier(1).out) g.step();
  n0 = go(MC.SL_DOUBLE + 50, 6);
  assert.equal(score(g, 0), 3, 'two in the last 15 s');
  assert.equal(score(g, 1), 5, 'a point off');
  assert.equal(fxs(g.v, MC.SL_FX_SCORE, n0).pop().size, 2);
});

test('the credit: a slap counts 3 s on the island and on through the fall; past it, or a bump alone, and the fall pays nobody', async () => {
  const g = await roomWith(MC.SL_G_CLASSIC, 3);
  const st = stage(g.v);
  const a = Math.atan2(st.sats[0].z - C, st.sats[0].x - C) + Math.PI / st.sats.length, ux = Math.cos(a), uz = Math.sin(a);
  // slapped in the middle, and it stays on: put over the edge 2.9 s later, the slapper's
  const slapMid = (t) => {
    at(g, t);
    put(g, 0, C - 1.5, C); put(g, 1, C + 1, C); put(g, 2, C - 8, C - 8);
    hold(g, { 0: press(g, 0) });
    hold(g, { 0: still(g, 0), 1: partyWord({ yaw: Y(Math.PI), move: 1 }) }, MC.SL_GWIND[0]);
    assert.equal(g.v.partier(1).hitBy, 0);
    hold(g, { 0: still(g, 0), 1: partyWord({ yaw: Y(Math.PI), move: 1 }) }, 150);
    assert.ok(g.v.partier(1).ground && islandAt(st, g.v.partier(1).pos[0], g.v.partier(1).pos[2]) === 0, 'still on');
  };
  const over = (wait) => {
    hold(g, { 0: still(g, 0), 1: partyWord({ yaw: 0, move: 0 }) }, wait);
    put(g, 1, C + ux * (st.rm + 1.2), C + uz * (st.rm + 1.2), { y: PLAT_Y - 1.5, ground: false });
    const n0 = g.v.fxCount();
    while (!g.v.partier(1).out) g.step();
    return fxs(g.v, L.FX_SINK, n0).pop().shot;
  };
  slapMid(300);
  assert.equal(over(MC.SL_CREDIT - 150 - 5), 0, 'within 3 s');
  while (g.v.partier(1).out) g.step();
  slapMid(1300);
  assert.equal(over(MC.SL_CREDIT - 150 + 5), 255, 'past 3 s');
  assert.equal(score(g, 0), 1);
  while (g.v.partier(1).out) g.step();
  // a bump alone over the edge: nobody's, though bumper would have counted it
  at(g, 2500);
  put(g, 1, C + ux * (st.rm - 1.2), C + uz * (st.rm - 1.2));
  put(g, 2, C + ux * (st.rm - 3.4), C + uz * (st.rm - 3.4), { vx: ux * 9, vz: uz * 9 });
  put(g, 0, C - 8, C + 8);
  const n0 = g.v.fxCount();
  for (let k = 0; k < 400 && !g.v.partier(1).out; k++) g.step();
  assert.ok(g.v.partier(1).out, 'bumped off');
  assert.ok(fxs(g.v, L.FX_BUMP, n0).length >= 1, 'a hard bump');
  assert.equal(fxs(g.v, L.FX_SINK, n0).pop().shot, 255);
  assert.deepEqual([score(g, 2), g.v.partier(2).kos], [0, 0]);
});

test('down 2 s, then back on a small island\'s pad, dropping in from 6 m; sheltered 1.5 s more', async () => {
  const g = await room(2, { seed: 11 });
  const st = stage(g.v);
  put(g, 0, C + st.rm + 1, C + 0.1, { y: PLAT_Y - 1, ground: false });
  while (!g.v.partier(0).out) g.step();
  const down = g.v.partier(0).outAt;
  while (g.v.partier(0).out) g.step();
  const b = g.v.partier(0);
  assert.equal(g.v.tick - 1 - down, MC.SL_RESPAWN, 'back after 2 s');
  const k = islandAt(st, b.pos[0], b.pos[2]);
  assert.ok(k > 0, 'on a small island');
  const s = st.sats[k - 1];
  assert.ok(Math.hypot(b.pos[0] - s.x, b.pos[2] - s.z) < st.sr * MC.SL_PAD + 1e-3, 'on its pad');
  assert.ok(!b.ground && b.pos[1] > PLAT_Y + 5, 'dropping in');
  assert.ok(sheltered(g.v, b, g.v.tick), 'sheltered');
  for (let j = 0; j < 150; j++) g.step();
  assert.ok(g.v.partier(0).ground && g.v.partier(0).pos[1] === PLAT_Y, 'on the pad');
  // respawns spread over the small islands
  const pads = new Set();
  for (let r = 0; r < 12; r++) {
    put(g, 0, C + st.rm + 1, C + 0.1, { y: PLAT_Y - 1, ground: false });
    while (!g.v.partier(0).out) g.step();
    while (g.v.partier(0).out) g.step();
    pads.add(islandAt(st, g.v.partier(0).pos[0], g.v.partier(0).pos[2]));
  }
  assert.ok(pads.size >= 3 && !pads.has(-1) && !pads.has(0), `pads ${[...pads]}`);
});

test('the clock: double points called at 75 s; placed by points at 90 s, ties sharing', async () => {
  const g = await room(3);
  at(g, MC.SL_DOUBLE - 2);
  const n0 = g.v.fxCount();
  g.step(); g.step();
  assert.equal(fxs(g.v, MC.SL_FX_CALL, n0).length, 0);
  g.step();
  assert.equal(fxs(g.v, MC.SL_FX_CALL, n0).length, 1, 'on the tick');
  at(g, MC.SL_LEN - 3);
  setScore(g, 0, 4); setScore(g, 1, 4); setScore(g, 2, 1);
  for (let k = 0; k < 6 && g.v.hole().state === L.H_PLAY; k++) g.step();
  assert.equal(g.v.hole().state, L.H_OVER);
  assert.deepEqual([0, 1, 2].map((p) => g.v.partier(p).place), [1, 1, 3]);
});

test('the prediction matches the confirmed ball bit for bit: rolling, a hop over a gap, swings through their wind-ups and cooldowns, misses, off the edge', async () => {
  const g = await roomWith(MC.SL_G_QUICK);
  const st = stage(g.v);
  const ns = st.sats.length, s = st.sats[1], d = Math.hypot(s.x - C, s.z - C), ux = (s.x - C) / d, uz = (s.z - C) / d, a = Math.atan2(uz, ux);
  const far = st.sats[1 + (ns >> 1)];
  put(g, 1, far.x, far.z);
  // out to the edge at 9 m/s facing a small island, a hop over the gap, pushing back once over, swinging as it goes
  at(g, 200);
  put(g, 0, C + ux * (st.rm - 3), C + uz * (st.rm - 3), { vx: ux * 9, vz: uz * 9 });
  const u0 = g.uses[0] ?? 0;
  const run = Array.from({ length: 300 }, (_, k) => partyWord({
    yaw: Y(k < 90 ? a : a + Math.PI), move: k < 140 ? 1 : 0, hop: k === 25 ? 1 : 0, use: (u0 + Math.floor(k / 40)) & 3 }));
  g.uses[0] = (u0 + Math.floor(299 / 40)) & 3;
  assert.ok(predicted(g, run) >= 300);
  const b = g.v.partier(0);
  assert.equal(islandAt(st, b.pos[0], b.pos[2]), 2, 'over on the small island');
  assert.ok(b.m >>> 16 > 0, 'swung');
  // fast presses through the cooldown, turning, a hop, misses in the air
  at(g, 900);
  put(g, 0, C, C);
  const v0 = g.uses[0];
  const swings = Array.from({ length: 200 }, (_, k) => partyWord({ yaw: Y(k * 0.03), move: k % 50 < 30 ? 1 : 0, hop: k === 60 ? 1 : 0, use: (v0 + (k >> 3)) & 3 }));
  g.uses[0] = (v0 + (199 >> 3)) & 3;
  const n0 = g.v.fxCount();
  assert.ok(predicted(g, swings) >= 200);
  assert.ok(fxs(g.v, MC.SL_FX_SLAP, n0).length >= 2, 'swung and missed');
  // off the edge into the sea between two small islands (till it's down: that's the confirmed world's)
  const m = Math.atan2(st.sats[0].z - C, st.sats[0].x - C) + Math.PI / ns, mx = Math.cos(m), mz = Math.sin(m);
  at(g, 1400);
  put(g, 0, C + mx * (st.rm - 2), C + mz * (st.rm - 2), { vx: mx * 6, vz: mz * 6 });
  const sea = Array.from({ length: 110 }, () => partyWord({ yaw: Y(m), move: 1, use: g.uses[0] }));
  assert.ok(predicted(g, sea) >= 110);
  assert.ok(g.v.partier(0).falling, 'over the edge');
});

test('the prediction across the countdown\'s end: its own ball in the round from play\'s first tick, a press made in the countdown not swinging', async () => {
  const g = await room(2, { play: false, seed: 4 });
  while (g.v.hole().until - g.v.tick > 10) g.step();
  const words = Array.from({ length: 50 }, (_, k) => partyWord({ yaw: 0, move: 1, use: k < 5 ? 1 : k < 30 ? 2 : 3 }));
  assert.ok(predicted(g, words) >= 50);
  assert.equal(g.v.hole().state, L.H_PLAY);
  assert.ok(g.v.partier(0).m >>> 16 > 0, 'a press in play swings');
});

// A round of Partier balls on the debug build: no trap, a round played to its end, equal on every tick on 1 and 4 threads.
for (const [balls, sd] of [[8, 3], [64, 5]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, slaps land, knock-offs scored, the points spread; equal on 1 and 4 threads`, async () => {
    let start = -1, over = -1, places = null, scores = null, trap = 0, slaps = 0, misses = 0, kos = 0, falls = 0, seen = 0, onMain = 0, samples = 0;
    const was = [];
    const ticks = L.P_COUNT + MC.SL_LEN + 80 + balls;
    const { log } = await playParty({ bytes: partyBytes(true), seed: sd, mg: L.MG_SLAP, bots: balls, ticks, delay: 6, onTick: (t, s, v) => {
      if (s.error().code) trap = s.error().code;
      const g = v.party();
      if (start < 0 && g.state === L.H_PLAY) start = t;
      for (; seen < v.fxCount(); seen++) {
        const f = v.fx(seen);
        if (f.kind === MC.SL_FX_SLAP) { if (f.shot === 255) misses++; else slaps++; }
        if (f.kind === MC.SL_FX_SCORE) kos++;
      }
      if (over < 0 && start >= 0 && g.state === L.H_OVER) {
        over = t;
        places = [...Array(balls).keys()].map((p) => v.partier(p).place);
        scores = [...Array(balls).keys()].map((p) => v.partier(p).score);
      }
      if (g.state !== L.H_PLAY) return;
      for (let p = 0; p < balls; p++) { const o = v.partier(p).out; if (o && !was[p]) falls++; was[p] = o; }
      if (g.t % 125 === 0) {
        const st = stage(v);
        for (let p = 0; p < balls; p++) { const b = v.partier(p); if (!b.out && !b.falling) { samples++; if (islandAt(st, b.pos[0], b.pos[2]) === 0) onMain++; } }
      }
    } });
    assert.equal(trap, 0, 'no trap');
    assert.equal(over - start, MC.SL_LEN, 'at the clock');
    assert.ok(places.every((x) => x >= 1 && x <= balls) && places.includes(1), `places ${places}`);
    assert.ok(slaps >= balls * 8 && slaps > misses, `${slaps} slaps landed, ${misses} missed`);
    assert.ok(kos >= balls * 1.5 && kos <= falls, `${kos} knock-offs scored of ${falls} falls`);
    assert.ok(falls <= balls * 10, `${falls} falls`);
    assert.ok(scores.filter((x) => x > 0).length >= balls / 2 && Math.max(...scores) >= 4, `scores ${scores}`);
    assert.ok(onMain / samples > 0.55, `${(100 * onMain / samples).toFixed(0)}% of the time on the main island`);
    const parsed = parseLog(log);
    const n = over + 40;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('the client module: draws the countdown, play and double time, frames the islands, its HUD lines fit; its brain keeps off the sea, slaps a rival in reach and hops home', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  for (const n of [3, 140]) {
    const g = await room(n, { play: false, seed: 41 + n });
    const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null };
    const lines = [];
    const hctx = { put: (x, y, s, c) => lines.push([y, s, c]), centre: (y, s, c) => lines.push([y, s, c]), right: (y, s, c) => lines.push([y, s, c]), rows: 44, C: {}, slot: 0, now: 0 };
    for (const t of [-1, 10, 400, MC.SL_DOUBLE + 5, MC.SL_LEN - 20]) {
      if (t >= 0) {
        while (g.v.hole().state !== L.H_PLAY) g.step();
        at(g, t);
        hold(g, { 0: press(g, 0) });
        hold(g, { 0: still(g, 0) }, 5);
      }
      out.scene.clear(); out.decals.length = 0; out.beams.length = 0; out.glow.length = 0; lines.length = 0;
      sl.draw(g.v, { tick: g.v.tick, t: (t + 0.5) * TICK, pt: (t + 0.5) * TICK, dt: 0, now: 0, slot: 0, me: g.v.partier(0), pme: g.v.partier(0), ptick: g.v.tick, pview: g.v, own: null }, out);
      const st = stage(g.v);
      assert.ok(out.scene.count >= 5 * (1 + st.sats.length) + n && out.scene.count < 3000, `${out.scene.count} solids`);
      for (let k = 0; k < out.scene.count * 16; k++) assert.ok(Number.isFinite(out.scene.data[k]), 'finite');
      assert.ok(out.decals.length >= 1 + 2 * st.sats.length, 'the edges and the pads');
      if (t >= 0) assert.ok(out.beams.length >= 3, 'the wind-up\'s cone');
      assert.equal(sl.env, t >= MC.SL_DOUBLE ? 'sunset' : 'day');
      if (t >= 0) {
        sl.hud(g.v, { ...hctx, me: g.v.partier(0), t: (t + 0.5) * TICK });
        const text = lines.map((l) => l[1]).join(' | ');
        assert.ok(text.includes(`${GLOVES[gloveOf(g.v, 0)]} GLOVE`) && /OF \d+/.test(text), text);
        assert.ok(text.includes(t >= MC.SL_DOUBLE ? 'DOUBLE POINTS' : 'DOUBLE IN'), text);
        for (const l of lines) assert.ok(l[1].length <= 30, l[1]);
      }
      const fr = sl.frame(g.v);
      assert.equal(fr.shape, 'disc');
      assert.equal(fr.radius, g.v.party().size);
    }
  }
  // the brain, on a room of 3
  const g = await room(3, { seed: 9 });
  const st = stage(g.v);
  at(g, 600);
  const me = () => g.v.partier(0);
  assert.equal(sl.brain.danger(g.v, C + st.rm + 1, C, g.v.tick, me()), 1, 'the gap');
  assert.equal(sl.brain.danger(g.v, C, C, g.v.tick, me()), 0);
  assert.ok(sl.brain.danger(g.v, C + st.rm - 0.5, C + 0.01, g.v.tick, me()) >= 0.5);
  // a rival in reach ahead: it slaps, turned to it
  put(g, 0, C, C); put(g, 1, C + 0.5, C + 2.4); put(g, 2, st.sats[2].x, st.sats[2].z);
  g.step();
  const bot = { slot: 0, skill: 1, pos: [C, C], vel: [0, 0], at: g.v.tick, lag: 0, mem: {}, rand: () => 0 };
  let s = sl.brain.think(g.v, me(), bot, g.v.tick);
  assert.ok(s?.use, 'slaps');
  assert.ok(Math.abs(s.yaw - Math.atan2(2.4, 0.5)) < 0.2, `at it: ${s.yaw.toFixed(2)}`);
  // through the wind-up it keeps facing it; then it waits the cooldown out
  s = sl.brain.think(g.v, me(), bot, g.v.tick + 4);
  assert.ok(s && !s.use && Math.abs(s.yaw - Math.atan2(2.4, 0.5)) < 0.3);
  assert.equal(sl.brain.think(g.v, me(), bot, g.v.tick + 60), null);
  // its goal: just inside a rival out by the edge
  put(g, 1, C + st.rm - 2, C);
  g.step();
  const goal = sl.brain.goal(g.v, me(), { ...bot, at: g.v.tick, mem: {} });
  assert.ok(Math.abs(goal[0] - (C + st.rm - 4.2)) < 0.3 && Math.abs(goal[1] - C) < 0.3, `goal ${goal.map((x) => (x - C).toFixed(1))}`);
  // on a small island: a run at the main one, a hop at the edge
  const sat = st.sats[0], dd = Math.hypot(sat.x - C, sat.z - C), ux = (C - sat.x) / dd, uz = (C - sat.z) / dd;
  put(g, 0, sat.x, sat.z);
  g.step();
  s = sl.brain.think(g.v, me(), { ...bot, pos: [sat.x, sat.z], vel: [0, 0], mem: {} }, g.v.tick);
  assert.ok(s.move === 1 && !s.hop);
  const edge = [sat.x + ux * (st.sr - 0.6), sat.z + uz * (st.sr - 0.6)];
  put(g, 0, ...edge);
  g.step();
  s = sl.brain.think(g.v, me(), { ...bot, pos: edge, vel: [ux * 8, uz * 8], mem: {} }, g.v.tick);
  assert.ok(s.hop && Math.abs(s.yaw - Math.atan2(uz, ux)) < 0.05, 'hops for home');
  assert.ok(sl.hint.length <= 70 && sl.rules.length <= 76);
});
