// SEESAWS (src/mg/seesaw.wat): the field for the crowd, the planks answering
// their load SS_LAG ticks late through their rings, a ball riding a plank and
// rolling off its low end, the grip and the gaps, the creak, the cuts and the
// drops, the outs and the end, the prediction through all of it (as deep as
// the host predicts and deeper), rounds of AI balls, the client module, and
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
import * as MC from '../src/mg/seesaw.mjs'; // SS_*: the minigame's own constants
import seesaw, { stage, at as atPlank, dims, slopeAt, topAt, standing, degOf } from '../client/mg/seesaw.mjs';

const TICK = 0.008;
const f = Math.fround;
const UP = 12288, DOWN = 4096; // yaws toward -z and +z (1/16384 turn)

// A room of n balls on Seesaws, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7, debug = true } = {}) {
  const sim = await newParty(debug);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_SEESAW + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// The next step plays tick t into play (the clock moved; the round's end with it).
function at(g, t) {
  const now = g.v.tick;
  g.dv.setUint32(L.HDR_START, now - t, true);
  g.dv.setUint32(L.HDR_UNTIL, now - t + MC.SS_LEN, true);
}
const playT = (g) => g.v.party().t; // the tick into play the next step plays
const pa = (k) => L.PG_S + MC.SS_PLANKS + k * MC.SS_PSIZE;
const ringA = (k, t) => L.PG_BIG + MC.SS_SLOPES + 4 * ((k << Math.log2(MC.SS_RING)) | (t & (MC.SS_RING - 1)));
const ring = (g, k, t) => g.dv.getFloat32(ringA(k, t), true);
// Plank k held at slope s from now: its head (s, still) and every tick of its ring.
function hold(g, k, s) {
  g.dv.setFloat32(pa(k) + MC.SS_P_G, s, true);
  g.dv.setFloat32(pa(k) + MC.SS_P_W, 0, true);
  for (let i = 0; i < MC.SS_RING; i++) g.dv.setFloat32(ringA(k, i), s, true);
}
// Ball p on plank k at (dx, dz) from its pivot, on its top as the next tick has it (or y over it), rolling at (vx, vz).
function put(g, p, k, dx, dz, { y = 0, vx = 0, vz = 0, ground = true } = {}) {
  const pl = stage(g.v, true).planks[k];
  g.dv.setFloat32(rec(p) + L.P_PX, f(pl.x + dx), true);
  g.dv.setFloat32(rec(p) + L.P_PZ, f(pl.z + dz), true);
  g.dv.setFloat32(rec(p) + L.P_PY, f(topAt(ring(g, k, playT(g)), f(f(pl.z + dz) - pl.z)) + y), true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE | (ground ? L.PF_GROUND : 0));
}
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
// Where ball p is on the planks as the sim found it on the tick just played: [k, dz], and how far over the top it is.
function where(g, p) {
  const st = stage(g.v, true), b = g.v.partier(p), t = playT(g) - 1;
  const [k, dz] = atPlank(st, b.pos[0], b.pos[2], t);
  return { k, dz, over: k < 0 ? NaN : f(b.pos[1] - topAt(ring(g, k, t), dz)), b };
}
// $ss_tick's step of a plank's head, in f32 as the sim works it: [g, w] from [g, w] and the load.
function head(g0, w0, load) {
  let w = f(f(w0 * f(MC.SS_DAMP)) + f(f(load * f(MC.SS_TQ)) - f(g0 * f(MC.SS_LVL))));
  w = Math.min(Math.max(w, f(-MC.SS_WMAX)), f(MC.SS_WMAX));
  let g = f(g0 + w);
  if (Math.abs(g) > f(MC.SS_GMAX)) { g = Math.sign(g) * f(MC.SS_GMAX); w = 0; }
  return [g, w];
}

test('the field for 1, 8, 64 and 256: planks sized for the crowd in a filled grid, its knobs and paces, every ball on a plank, apart, each plank balanced', async () => {
  for (const [n, k, cols] of [[1, 2, 2], [8, 3, 3], [64, 18, 9], [256, 48, 12]]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party(), st = stage(g.v, true);
    assert.equal(r.game, L.MG_SEESAW);
    assert.deepEqual([r.kind, r.len, st.K, st.cols, st.rows], [L.PK_OUT, MC.SS_LEN, k, cols, k / cols], `${n} balls`);
    assert.equal(st.keep, Math.max(1, Math.floor(k / MC.SS_KEEPK)));
    assert.equal(g.dv.getUint32(L.PG_H + MC.SS_CUTI, true), Math.max(MC.SS_CUTMIN, Math.floor(MC.SS_CUTSPAN / k)));
    assert.equal(g.dv.getUint32(L.PG_H + MC.SS_DROPI, true), Math.max(MC.SS_DROPMIN, Math.floor(MC.SS_DROPSPAN / Math.max(1, k - st.keep))));
    assert.equal(r.floor, f(PLAT_Y - MC.SS_PL * MC.SS_GMAX - 1), 'the lowest floor: a low end at the stop, and a metre');
    // centred on the stage's centre, the pivots on the grid
    const xs = st.planks.map((p) => p.x), zs = st.planks.map((p) => p.z);
    assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - r.cx) < 1e-3 && Math.abs((Math.min(...zs) + Math.max(...zs)) / 2 - r.cx) < 1e-3);
    assert.ok(r.size >= (Math.max(...xs) - Math.min(...xs)) / 2 + MC.SS_PW - 1e-3 && r.size >= (Math.max(...zs) - Math.min(...zs)) / 2 + MC.SS_PL - 1e-3);
    const load = new Array(k).fill(0), count = new Array(k).fill(0);
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y, `${n}: P${p + 1} on the top`);
      const [kk, dz] = atPlank(st, b.pos[0], b.pos[2], 0);
      assert.ok(kk >= 0, `${n}: P${p + 1} on a plank`);
      load[kk] += dz;
      count[kk]++;
      for (let q = 0; q < p; q++) {
        const c = g.v.partier(q);
        assert.ok(Math.hypot(b.pos[0] - c.pos[0], b.pos[2] - c.pos[2]) >= 2 - 1e-4, `${n}: P${p + 1} and P${q + 1} apart`);
      }
    }
    assert.ok(load.every((x) => Math.abs(x) < 1e-3), `${n}: every plank balanced`);
    assert.ok(Math.max(...count) - Math.min(...count) <= 1, `${n}: dealt evenly, ${count}`);
    // the gaps and the edges as $ss_at has them: just inside a plank is on it, just past is not
    const p0 = st.planks[0];
    for (const [dx, dz, on] of [[MC.SS_PW - 0.01, 0, true], [MC.SS_PW + 0.01, 0, false], [0, MC.SS_PL - 0.01, true], [0, MC.SS_PL + 0.01, false], [MC.SS_SX / 2, 0, false]]) {
      assert.equal(atPlank(st, p0.x + dx, p0.z + dz, 0)[0] >= 0, on, `${dx}, ${dz}`);
    }
  }
});

test('the lag: a ball off the pivot leaves its plank level for SS_LAG ticks, then it tips that way, the head stepped as the formula has it, into the ring SS_LAG on; it stops at SS_GMAX and rolls the ball off its low end; empty, it levels slowly, never past level', async () => {
  // balls 1 and 2 balanced on plank 1, so the round plays on once ball 0 is out
  const g = await room(3, { seed: 3 });
  at(g, 400);
  put(g, 0, 0, 0, 5);
  put(g, 1, 1, 0, -2);
  put(g, 2, 1, 0, 2);
  const t0 = playT(g);
  let [hg, hw] = [g.dv.getFloat32(pa(0) + MC.SS_P_G, true), g.dv.getFloat32(pa(0) + MC.SS_P_W, true)];
  const seen = [];
  for (let i = 0; i < 1400 && !g.v.partier(0).out; i++) {
    const t = playT(g);
    g.step();
    const load = g.dv.getFloat32(pa(0) + MC.SS_P_LOAD, true);
    const w = where(g, 0);
    if (w.k === 0 && w.b.ground) assert.equal(load, f(g.v.partier(0).pos[2] - stage(g.v).planks[0].z), 'the load: the ball\'s metres along');
    [hg, hw] = head(hg, hw, load);
    assert.equal(g.dv.getFloat32(pa(0) + MC.SS_P_G, true), hg, `the head at ${t}`);
    assert.equal(ring(g, 0, t + MC.SS_LAG), hg, `the ring at ${t + MC.SS_LAG}`);
    seen.push([t, ring(g, 0, t)]);
  }
  const slope = (t) => seen.find((s) => s[0] === t)?.[1];
  for (let t = t0; t < t0 + MC.SS_LAG; t++) assert.equal(slope(t), 0, `still level at ${t}`);
  assert.ok(slope(t0 + MC.SS_LAG + 1) > 0, 'then it tips toward the ball');
  const stop = seen.find((s) => s[1] === f(MC.SS_GMAX));
  assert.ok(stop && stop[0] - t0 < MC.SS_LAG + 3 * 125, `at the stop ${(stop[0] - t0) * TICK} s on`);
  assert.ok(g.v.partier(0).out, 'off the low end and out');
  assert.ok(g.v.partier(0).pos[2] > stage(g.v).planks[0].z + MC.SS_PL, 'off the +z end');
  // empty: it levels, slowly, from where its head is
  const from = g.dv.getFloat32(pa(0) + MC.SS_P_G, true);
  let last = from;
  for (let i = 0; i < 250; i++) {
    g.step();
    const x = g.dv.getFloat32(pa(0) + MC.SS_P_G, true);
    assert.ok(x <= last && x >= 0, 'easing toward level, never past');
    last = x;
  }
  assert.ok(from > 0.2 && last > from * 0.25 && last < from * 0.75, `levelling: ${from.toFixed(3)} to ${last.toFixed(3)} in 2 s`);
});

test('a ball rides a plank: on its top every tick as it tips; on a slope with no keys it rolls down it, pulled SS_PULL a unit of slope; at the stop, keys held uphill, it barely climbs', async () => {
  const g = await room(1, { seed: 4 });
  at(g, 600);
  // a plank tipping from level to the stop and back over 2 s, ring written
  for (let i = 0; i < MC.SS_RING; i++) g.dv.setFloat32(ringA(0, i), 0, true);
  const t0 = playT(g);
  for (let i = 0; i < 250; i++) g.dv.setFloat32(ringA(0, t0 + i), f(MC.SS_GMAX * Math.sin(i / 250 * Math.PI)), true);
  put(g, 0, 0, 0.5, -1);
  for (let i = 0; i < 240; i++) {
    // keys toward the pivot: it rides back and forth over it
    g.step([[L.EV_INPUT, 0, partyWord({ yaw: where(g, 0).dz > 0 ? UP : DOWN, move: 1 })]]);
    const w = where(g, 0);
    assert.equal(w.k, 0);
    assert.ok(w.b.ground && Math.abs(w.over) < 1e-4, `on the top at ${playT(g)}: ${w.over}`);
  }
  // held at 0.4: no keys, it rolls down toward +z, the pull SS_PULL * 0.4
  hold(g, 0, 0.4);
  put(g, 0, 0, 0, -3);
  const idle = [[L.EV_INPUT, 0, partyWord({})]];
  g.step(idle);
  const v0 = g.v.partier(0).vel[2];
  for (let i = 0; i < 49; i++) g.step(idle);
  // a tick: the roll's drag (no keys: PG_IDLE), then the pull
  let want = v0;
  for (let i = 0; i < 49; i++) want = want * g.v.party().idle + 0.4 * MC.SS_PULL * TICK;
  const vz = g.v.partier(0).vel[2];
  assert.ok(vz > 1 && Math.abs(vz - want) < 0.01 * want, `${vz.toFixed(3)} m/s down it, ${want.toFixed(3)} reckoned`);
  assert.ok(where(g, 0).b.ground);
  // at the stop, climbing: slower than 1.5 m/s after a second, but up
  hold(g, 0, MC.SS_GMAX);
  put(g, 0, 0, 0, 2);
  for (let i = 0; i < 125; i++) g.step([[L.EV_INPUT, 0, partyWord({ yaw: UP, move: 1 })]]);
  const b = g.v.partier(0);
  assert.ok(b.vel[2] < 0 && b.vel[2] > -1.5 && where(g, 0).dz < 2, `climbing at ${b.vel[2].toFixed(2)} m/s`);
});

test('the grip and the gaps: a ball under the top by less than SS_GRIP is lifted onto it, deeper falls through; over a gap it falls; a hop at speed clears one onto the next plank', async () => {
  const g = await room(1, { seed: 5 });
  at(g, 500);
  hold(g, 0, 0);
  hold(g, 1, 0.1);
  put(g, 0, 0, 0, 2, { y: -(MC.SS_GRIP - 0.2), ground: false });
  g.step();
  assert.ok(g.v.partier(0).ground && Math.abs(where(g, 0).over) < 1e-4, 'lifted onto it');
  put(g, 0, 0, 0, 2, { y: -(MC.SS_GRIP + 0.5), ground: false });
  for (let i = 0; i < 60; i++) g.step();
  assert.ok(!g.v.partier(0).ground && g.v.partier(0).pos[1] < PLAT_Y - 3, 'falls through');
  // over the gap between planks 0 and 1, rolling slowly: it falls and goes out
  put(g, 0, 0, MC.SS_SX / 2, 0, { ground: false });
  for (let i = 0; i < 400 && !g.v.partier(0).out; i++) g.step();
  assert.ok(g.v.partier(0).out, 'into the sea');
  // a fresh round: from plank 0's middle, rolling at plank 1, a hop at the edge clears the gap
  const h = await room(1, { seed: 5 });
  at(h, 500);
  hold(h, 0, 0);
  hold(h, 1, 0);
  put(h, 0, 0, -1, 0);
  const st = stage(h.v, true);
  let hopped = false;
  for (let i = 0; i < 250; i++) {
    const b = h.v.partier(0), edge = b.pos[0] - st.planks[0].x > MC.SS_PW - 0.4;
    hopped ||= edge;
    h.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, move: 1, hop: edge ? 1 : 0 })]]);
    if (hopped && h.v.partier(0).ground) break;
  }
  const w = where(h, 0);
  assert.ok(hopped && w.k === 1 && w.b.ground && !w.b.out, `landed on plank ${w.k}`);
});

test('a hard tip coming creaks as its head passes SS_GHARD, SS_LAG before the plank gets there, once until it eases under SS_GSOFT', async () => {
  const g = await room(2, { seed: 6 });
  at(g, 400);
  put(g, 0, 0, 0, 6);
  put(g, 1, 1, 0, 0);
  const k0 = g.v.fxCount();
  let fx = null, t1 = 0;
  for (let i = 0; i < 600 && !fx; i++) {
    t1 = playT(g);
    g.step([[L.EV_INPUT, 0, partyWord({ yaw: UP, move: 0 })]]);
    fx = fxs(g.v, MC.SS_FX_CREAK, k0)[0];
  }
  assert.ok(fx, 'a creak');
  const st = stage(g.v, true);
  assert.equal(fx.shot, 0);
  assert.deepEqual([fx.owner, fx.pos[0], fx.pos[2]], [255, st.planks[0].x, st.planks[0].z]);
  assert.ok(fx.size >= MC.SS_GHARD && ring(g, 0, t1 + MC.SS_LAG - 1) < MC.SS_GHARD, 'as the head passes it');
  assert.ok(slopeAt(st, 0, t1) < MC.SS_GHARD && slopeAt(st, 0, t1 + MC.SS_LAG) === fx.size, 'the plank gets there SS_LAG on');
  // pinned at the stop: no more; then emptied and levelled under SS_GSOFT, then loaded again: a second
  for (let i = 0; i < 200; i++) { put(g, 0, 0, 0, 6); g.step(); }
  assert.equal(fxs(g.v, MC.SS_FX_CREAK, k0).length, 1, 'once');
  put(g, 0, 1, 0, 1);
  for (let i = 0; i < 1200 && g.dv.getFloat32(pa(0) + MC.SS_P_G, true) >= MC.SS_GSOFT; i++) { put(g, 0, 1, 0, 1); g.step(); }
  assert.equal(g.dv.getUint8(pa(0) + MC.SS_P_HARD), 0, 'eased: the latch is off');
  for (let i = 0; i < 600 && fxs(g.v, MC.SS_FX_CREAK, k0).length < 2; i++) { put(g, 0, 0, 0, 6); g.step(); }
  assert.equal(fxs(g.v, MC.SS_FX_CREAK, k0).length, 2, 'and again');
});

test('the cuts: from SS_CUT0 a plank drawn every SS_CUTI is cut SS_CUTWARN later, shorter or narrower, shown coming; on its tick a ball on what goes falls and one inside stays', async () => {
  const kinds = new Set();
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    const g = await room(2, { seed });
    const cuti = g.dv.getUint32(L.PG_H + MC.SS_CUTI, true);
    at(g, MC.SS_CUT0 - MC.SS_CUTWARN - 2);
    put(g, 0, 0, 0, 0);
    put(g, 1, 1, 0, 0);
    const k0 = g.v.fxCount(), w0 = playT(g) + 2;
    g.step(); g.step();
    assert.equal(fxs(g.v, MC.SS_FX_WARN, k0).length, 0, 'none before SS_CUT0 - SS_CUTWARN');
    g.step();
    const warn = fxs(g.v, MC.SS_FX_WARN, k0);
    assert.equal(warn.length, 1, 'one drawn');
    const k = warn[0].shot & 255, kind = warn[0].shot >> 8;
    kinds.add(kind);
    assert.ok(kind === MC.SS_K_SHORT || kind === MC.SS_K_NARROW);
    assert.equal(warn[0].size, MC.SS_CUTWARN);
    assert.equal(g.dv.getUint32(pa(k) + MC.SS_P_CUT, true), MC.SS_CUT0, 'cut at SS_CUT0');
    assert.equal(g.dv.getUint8(pa(k) + MC.SS_P_KIND), kind);
    // both balls on it: one on what goes, one inside what stays
    hold(g, k, 0);
    const out = kind === MC.SS_K_SHORT ? [0, MC.SS_PL - 1] : [MC.SS_PW - 0.6, 0], inn = kind === MC.SS_K_SHORT ? [0, MC.SS_PL * MC.SS_CUTL - 1] : [MC.SS_PW * MC.SS_CUTW - 0.5, -2];
    put(g, 0, k, ...out);
    put(g, 1, k, ...inn);
    while (playT(g) < MC.SS_CUT0) { g.step(); put(g, 0, k, ...out); put(g, 1, k, ...inn); }
    const st = stage(g.v, true);
    assert.deepEqual(dims(st.planks[k], MC.SS_CUT0 - 1), [f(MC.SS_PW), f(MC.SS_PL)]);
    assert.deepEqual(dims(st.planks[k], MC.SS_CUT0), kind === MC.SS_K_SHORT ? [f(MC.SS_PW), f(MC.SS_PL * MC.SS_CUTL)] : [f(MC.SS_PW * MC.SS_CUTW), f(MC.SS_PL)]);
    g.step();
    assert.equal(fxs(g.v, MC.SS_FX_GO, k0).filter((x) => x.shot === (k | (kind << 8))).length, 1, 'the cut, on its tick');
    for (let i = 0; i < 300 && !g.v.partier(0).out; i++) { hold(g, k, 0); g.step(); }
    assert.ok(g.v.partier(0).out && !g.v.partier(1).out, 'the one on what went fell; the one inside stayed');
    assert.equal(fxs(g.v, MC.SS_FX_WARN, k0).length, 1 + Math.floor((playT(g) - 1 - w0) / cuti), 'the next on the beat');
  }
  assert.equal(kinds.size, 2, 'both kinds');
});

test('the drops: from SS_DROP0 a plank drawn every SS_DROPI drops SS_DROPWARN later, shown coming; SS_KEEP stand to the end; a ball on a dropped plank falls and is out', async () => {
  const g = await room(64, { seed: 21, debug: false });
  const st0 = stage(g.v, true), dropi = g.dv.getUint32(L.PG_H + MC.SS_DROPI, true);
  assert.deepEqual([st0.K, st0.keep], [18, 2]);
  // everyone parked on the pivots, still; the clock to the first drawing
  // dealt round the planks, 2.5 m apart along each, balanced
  const park = () => { for (let p = 0; p < 64; p++) { const j = Math.floor(p / st0.K), cnt = p % st0.K < 64 % st0.K ? 4 : 3; put(g, p, p % st0.K, 0, (j - (cnt - 1) / 2) * 2.5); } };
  at(g, MC.SS_DROP0 - MC.SS_DROPWARN);
  park();
  const k0 = g.v.fxCount();
  g.step();
  const w = fxs(g.v, MC.SS_FX_WARN, k0).filter((x) => x.shot >> 8 === MC.SS_K_DROP);
  assert.equal(w.length, 1);
  const k = w[0].shot & 255;
  assert.equal(g.dv.getUint32(pa(k) + MC.SS_P_DROP, true), MC.SS_DROP0);
  const onIt = [...Array(64).keys()].filter((p) => p % st0.K === k);
  while (playT(g) < MC.SS_DROP0) { park(); g.step(); }
  assert.ok(onIt.every((p) => g.v.partier(p).ground), 'up through the warning');
  assert.ok(!standing(stage(g.v, true).planks[k], MC.SS_DROP0) && standing(stage(g.v, true).planks[k], MC.SS_DROP0 - 1));
  for (let i = 0; i < 260; i++) g.step();
  assert.equal(fxs(g.v, MC.SS_FX_GO, k0).filter((x) => x.shot === (k | (MC.SS_K_DROP << 8))).length, 1, 'the drop, on its tick');
  assert.ok(onIt.every((p) => g.v.partier(p).out), 'every ball on it out');
  assert.ok([...Array(64).keys()].filter((p) => !onIt.includes(p)).every((p) => !g.v.partier(p).out), 'the rest up');
  // the clock on to each drawing: one a beat while more than SS_KEEP stand, then none
  for (let beat = 1; beat < st0.K + 3; beat++) {
    at(g, MC.SS_DROP0 - MC.SS_DROPWARN + beat * dropi);
    g.step();
  }
  assert.equal(g.dv.getUint32(L.PG_S + MC.SS_NDROP, true), st0.K - st0.keep);
  const st = stage(g.v, true);
  assert.equal(st.planks.filter((p) => !p.drop).length, st0.keep, 'SS_KEEP never drop');
});

test('the end: the last ball on wins, 10 points to 1, every out a splash on the sea; balls a plank dumps together share the win, one that went first does not', async () => {
  const g = await room(3, { seed: 8 });
  at(g, 900);
  const k0 = g.v.fxCount();
  put(g, 0, 0, 0, 0);
  put(g, 1, 1, MC.SS_SX / 2, 0, { ground: false }); // over the gap
  put(g, 2, 1, 0, 0);
  for (let i = 0; i < 40; i++) g.step();
  put(g, 2, 1, MC.SS_SX / 2 + 0.5, 0, { ground: false }); // 40 ticks later
  for (let i = 0; i < 600 && g.v.party().state === L.H_PLAY; i++) g.step();
  assert.equal(g.v.party().state, L.H_OVER);
  assert.deepEqual([0, 1, 2].map((p) => g.v.partier(p).place), [1, 3, 2]);
  assert.deepEqual([0, 1, 2].map((p) => g.v.partier(p).pts), [10, 1, 5]);
  assert.equal(g.v.party().winner, 0);
  const sp = fxs(g.v, MC.SS_FX_SPLASH, k0);
  assert.deepEqual(sp.map((x) => x.owner), [1, 2]);
  assert.ok(sp.every((x) => x.pos[1] === 0), 'on the sea');
  // two dumped together: they share the win
  const h = await room(2, { seed: 9 });
  at(h, 900);
  put(h, 0, 0, MC.SS_SX / 2, 0, { ground: false });
  put(h, 1, 0, -MC.SS_SX / 2, 0, { ground: false });
  for (let i = 0; i < 600 && h.v.party().state === L.H_PLAY; i++) h.step();
  assert.deepEqual([h.v.partier(0).place, h.v.partier(1).place], [1, 1]);
  assert.equal(h.v.party().winner, 255, 'two winners');
  // SS_TIE ticks apart still share it; more, and the first goes out in its place
  for (const [gap, places] of [[MC.SS_TIE, [1, 1]], [MC.SS_TIE + 30, [2, 1]]]) {
    const q = await room(2, { seed: 10 });
    at(q, 900);
    put(q, 0, 0, MC.SS_SX / 2, 0, { ground: false });
    put(q, 1, 1, 0, 0);
    for (let i = 0; i < gap; i++) q.step();
    put(q, 1, 1, MC.SS_SX / 2, 0, { ground: false });
    for (let i = 0; i < 600 && q.v.party().state === L.H_PLAY; i++) q.step();
    const fell = [0, 1].map((p) => q.dv.getUint16(L.PG_S + MC.SS_FELL + 2 * p, true));
    assert.ok(fell[0] > 0 && fell[1] - fell[0] === gap, `their falls noted, ${fell}`);
    assert.deepEqual([q.v.partier(0).place, q.v.partier(1).place], places, `${gap} ticks apart`);
  }
});

test('the prediction matches the confirmed ball bit for bit, 1, 6 and 30 ahead: riding a plank it tips itself, rolling down a steep one, hopping a gap, through a cut and a drop', async () => {
  // one ball alone, so nothing bumps it (bumps are the confirmed world's)
  const g = await room(1, { seed: 16 });
  const roam = (n, seed) => Array.from({ length: n }, (_, i) => partyWord({ yaw: (i * seed) & 16383, move: (i >> 4) % 3 === 0 ? 0 : 1, hop: i % 61 === 0 ? 1 : 0 }));
  // in chunks while it's on a plank (an out is the confirmed world's)
  const run = (words) => {
    let k = 0, n = 0;
    for (; k < words.length; k += 30) {
      const w = where(g, 0);
      if (w.b.out || w.b.falling) break;
      n += predicted(g, words.slice(k, k + 30));
    }
    return [k, n];
  };
  // its own weight tipping it, roaming
  at(g, 300);
  put(g, 0, 0, 0, 3);
  for (let i = 0; i < MC.SS_LAG; i++) g.step();
  let [k, n] = run(roam(330, 97));
  assert.ok(n >= 150, `tipping: ${n} compared over ${k} ticks`);
  // a steep one, no keys: down it and off the low end
  at(g, 2000);
  hold(g, 0, 0.55);
  put(g, 0, 0, 0, 0);
  [k, n] = run(Array(600).fill(partyWord({})));
  assert.ok(k < 600 && n > 60, `rolled off after ${k} ticks, ${n} compared`);
  // across a gap, hopping at the edge, plank 1 tipping under it
  at(g, 2600);
  hold(g, 0, 0);
  for (let i = 0; i < MC.SS_RING; i++) g.dv.setFloat32(ringA(1, i), f(0.3 * Math.sin(i / 70)), true);
  put(g, 0, 0, -2.5, 0);
  const st = stage(g.v, true), roll = partyWord({ yaw: 0, move: 1 });
  n = 0;
  while (g.v.partier(0).pos[0] - st.planks[0].x < MC.SS_PW - 1) n += predicted(g, [roll, roll, roll]);
  n += predicted(g, [...Array(4).fill(partyWord({ yaw: 0, move: 1, hop: 1 })), ...Array(80).fill(roll)]);
  assert.ok(where(g, 0).k === 1 && n >= 100, `on plank ${where(g, 0).k}, ${n} compared`);
  // a cut and a drop, roaming over them
  at(g, MC.SS_CUT0 - MC.SS_CUTWARN);
  g.step();
  const ck = g.dv.getUint32(pa(0) + MC.SS_P_CUT, true) ? 0 : 1;
  hold(g, ck, 0.05);
  put(g, 0, ck, 0, 0);
  [k, n] = run(roam(MC.SS_CUTWARN + 120, 211));
  assert.ok(n >= 150, `through a cut: ${n}`);
  at(g, MC.SS_DROP0 - MC.SS_DROPWARN);
  put(g, 0, 0, 0, 0);
  hold(g, 0, 0); hold(g, 1, 0);
  g.step();
  const dk = g.dv.getUint32(pa(0) + MC.SS_P_DROP, true) ? 0 : 1;
  put(g, 0, dk, 0, 0);
  for (let i = 0; i < MC.SS_DROPWARN - 40; i++) g.step([[L.EV_INPUT, 0, partyWord({})]]);
  [k, n] = run(Array(200).fill(partyWord({ yaw: UP, move: 1 })));
  assert.ok(n >= 30 && g.v.partier(0).falling, `through the drop: ${n} compared, falling`);
});

test('the prediction 201 ticks ahead (as deep as the host predicts), and SS_LAG - 1, matches the confirmed ball bit for bit on a plank tipping under it while another ball moves its load', async () => {
  assert.ok(MC.SS_LAG - 1 >= 201 && MC.SS_RING >= 2 * MC.SS_LAG, 'the ring runs further ahead than the host predicts');
  for (const depth of [201, MC.SS_LAG - 1]) {
    const g = await room(4, { seed: 30 });
    at(g, 500);
    // ball 0 in plank 0's -x lane, ball 1 in its +x lane (3.2 m apart across: they never touch, and nothing pushes
    // either across), moved along it by hand as the world steps; balls 2 and 3 still on plank 1
    put(g, 0, 0, -1.6, 1);
    put(g, 2, 1, 0, -2);
    put(g, 3, 1, 0, 2);
    const other = (i) => put(g, 1, 0, 1.6, f(-3 - 3 * Math.sin(i / 70)));
    // ball 0's keys: toward the pivot when more than a metre and a half off it, else none
    const steer = () => { const dz = where(g, 0).dz; return Math.abs(dz) > 1.5 ? partyWord({ yaw: dz > 0 ? UP : DOWN, move: 1 }) : partyWord({}); };
    for (let i = 0; i < 400; i++) { other(i); g.step([[L.EV_INPUT, 0, steer()]]); }
    // a dry run for ball 0's words, then back to where it started and the run itself
    const snap = g.sim.u8.slice(L.REGION, L.REGION + L.REGION_SIZE);
    const words = [];
    for (let i = 0; i < depth; i++) { other(400 + i); words.push(steer()); g.step([[L.EV_INPUT, 0, words[i]]]); }
    g.sim.u8.set(snap, L.REGION);
    const t0 = playT(g);
    for (let i = 0; i < depth; i++) g.dv.setUint32(L.PWORDS + 4 * i, words[i], true);
    g.sim.x.predict(0, depth);
    const pred = g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE);
    const loads = new Set(), slopes = new Set();
    for (let i = 0; i < depth; i++) {
      other(400 + i);
      g.step([[L.EV_INPUT, 0, words[i]]]);
      loads.add(g.dv.getFloat32(pa(0) + MC.SS_P_LOAD, true));
      slopes.add(ring(g, 0, t0 + i));
    }
    const b = g.v.partier(0), w = where(g, 0);
    assert.ok(!b.out && w.k === 0 && b.ground, `ball 0 still on plank 0 (${w.k})`);
    const lo = Math.min(...slopes), hi = Math.max(...slopes);
    assert.ok(hi - lo > 0.1, `the plank tipped under it: ${lo.toFixed(3)} to ${hi.toFixed(3)}`);
    assert.ok(loads.size > depth / 2, 'its load moving all the while');
    assert.deepEqual(pred, g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE), `predicted ${depth} ahead`);
  }
});

// A round of Partier balls steered by this minigame's brain (tools/genparty.mjs), recorded as a log.
async function aiRound(balls, ticks, seed) {
  let start = -1, over = -1, seen = 0, outs = 0, at15 = -1, at45 = -1;
  let places = null, pts = null;
  const { log, sim } = await playParty({ bytes: partyBytes(true), seed, mg: L.MG_SEESAW, bots: balls, ticks, onTick: (t, s, v) => {
    const g = v.party();
    for (; seen < v.fxCount(); seen++) outs += v.fx(seen).kind === L.FX_SINK;
    if (start < 0 && g.state === L.H_PLAY) start = t;
    if (start >= 0 && at15 < 0 && t - start >= 15 / TICK) at15 = g.left;
    if (start >= 0 && at45 < 0 && t - start >= 45 / TICK) at45 = g.left;
    if (start >= 0 && over < 0 && g.state === L.H_OVER) {
      over = t;
      places = [...Array(balls).keys()].map((p) => v.partier(p).place);
      pts = [...Array(balls).keys()].map((p) => v.partier(p).pts);
    }
  } });
  return { log, sim, start, over, outs, at15, at45, places, pts };
}

for (const [balls, ticks, seed] of [[8, 13500, 21], [64, 13500, 22]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, most up 15 s in, some off by the end, a winner or the clock; equal on 1 and 4 threads`, async () => {
    const r = await aiRound(balls, ticks, seed);
    assert.equal(r.sim.error().code, 0);
    assert.ok(r.over > 0, 'the round ended');
    const secs = (r.over - r.start) * TICK;
    assert.ok(secs > 45 && secs <= MC.SS_LEN * TICK + 0.01, `${secs.toFixed(1)} s of play`);
    assert.ok(r.at15 >= balls - Math.max(1, balls / 16), `${r.at15} of ${balls} still on 15 s in`);
    assert.ok(r.at45 >= balls / 2, `${r.at45} of ${balls} still on 45 s in`);
    assert.ok(r.outs >= balls / 4 && r.outs < balls, `${r.outs} off`);
    assert.ok(r.places.every((x) => x >= 1 && x <= balls), `places ${r.places}`);
    assert.ok(r.pts.every((x) => x >= 1 && x <= 10), `points ${r.pts}`);
    assert.ok(r.places.includes(1) && r.pts.includes(10), 'somebody won');
    const parsed = parseLog(r.log);
    const n = r.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('the client module: draws the planks at the sim\'s slopes and the ghost of the one coming, a cut and a drop flashing and falling; frames the field; its HUD lines; its brain', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const g = await room(8, { seed: 41 });
  const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], paint: null };
  const lines = [];
  const hctx = { put: (x, y, s, c) => lines.push([y, s, c]), centre: (y, s, c) => lines.push([y, s, c]), right: (y, s, c) => lines.push([y, s, c]), rows: 44, C: {}, slot: 0, now: 0 };
  const draw = () => {
    out.scene.clear(); lines.length = 0;
    const me = g.v.partier(0);
    seesaw.draw(g.v, { tick: g.v.tick, ptick: g.v.tick, dt: 0, now: 1000, slot: 0, me, pme: me }, out);
    for (let k = 0; k < out.scene.count * 16; k++) assert.ok(Number.isFinite(out.scene.data[k]), 'finite');
    seesaw.hud(g.v, { ...hctx, me, t: playT(g) * TICK + 1e-6 });
    for (const l of lines) assert.ok(l[1].length <= 80, l[1]);
    return lines.map((l) => l[1]).join(' | ');
  };
  const st0 = stage(g.v, true);
  // a plank tipping: ball 0 on plank 0 far out, the plank written to tip to the stop over the next 1.6 s
  at(g, 1000);
  put(g, 0, 0, 0, 3);
  const t0 = playT(g);
  for (let i = 0; i < MC.SS_RING; i++) g.dv.setFloat32(ringA(0, t0 + i), f(Math.min(MC.SS_GMAX, i * 0.003)), true);
  g.step();
  let text = draw();
  // plank 0's slab is its first solid: turned by atan of its slope
  const d = out.scene.data, roll = ((d[3] >> 2) / 65536) * 2 * Math.PI;
  assert.ok(Math.abs(Math.tan(roll > Math.PI ? roll - 2 * Math.PI : roll) - ring(g, 0, playT(g))) < 1e-3, 'the slab at the sim\'s slope');
  const glows = () => { const n = []; for (let k = 0; k < out.scene.count; k++) if (out.scene.data[k * 16 + 11] === 5) n.push(k); return n; };
  assert.ok(glows().length >= 4, 'the ghost and its arrowhead');
  assert.ok(text.includes(`YOUR PLANK ${degOf(ring(g, 0, playT(g)))} DEG`) && /TIPS TO \d+ DEG IN/.test(text) && text.includes('GET HIGH: GO'), text);
  assert.ok(text.includes(`PLANKS ${st0.K} OF ${st0.K}`), text);
  // level and still: no ghost
  for (let k = 0; k < st0.K; k++) hold(g, k, 0);
  g.step();
  draw();
  assert.equal(glows().length, 0, 'nothing coming, nothing glowing');
  assert.ok(out.scene.count >= 3 * st0.K && out.scene.count < 40 * st0.K, `${out.scene.count} solids`);
  // a cut coming and a drop coming: they glow and the HUD says so
  at(g, MC.SS_CUT0 - MC.SS_CUTWARN);
  g.step();
  const ck = st0.planks.findIndex((p) => g.dv.getUint32(pa(p.k) + MC.SS_P_CUT, true));
  put(g, 0, ck, 0, 0);
  g.step();
  text = draw();
  assert.ok(glows().length >= 2 && /YOUR PLANK GETS (SHORTER|NARROWER) IN/.test(text), text);
  at(g, MC.SS_DROP0 - MC.SS_DROPWARN);
  g.step();
  const dk = st0.planks.findIndex((p) => g.dv.getUint32(pa(p.k) + MC.SS_P_DROP, true));
  put(g, 0, dk, 0, 0);
  g.step();
  text = draw();
  assert.ok(text.includes('YOUR PLANK DROPS IN') && text.includes('HOP OFF'), text);
  const fr = seesaw.frame(g.v);
  assert.deepEqual([fr.shape, fr.centre[0], fr.radius], ['square', g.v.party().cx, g.v.party().size + 1]);
  assert.ok(seesaw.hint.length <= 70);
  // danger: off the planks 1; on a steep plank the low end worse than the high; the middle of a level one 0; a plank about to drop bad
  for (let k = 0; k < st0.K; k++) hold(g, k, 0);
  hold(g, 2, 0.5);
  g.step();
  const st = stage(g.v, true), tk = g.v.tick + 10, p2 = st.planks[2], p1 = st.planks[1];
  assert.equal(seesaw.brain.danger(g.v, p2.x + MC.SS_SX / 2, p2.z, tk), 1);
  const lo = seesaw.brain.danger(g.v, p2.x, p2.z + MC.SS_PL - 2, tk), hi = seesaw.brain.danger(g.v, p2.x, p2.z - MC.SS_PL + 2, tk);
  assert.ok(lo > 0.5 && hi < lo / 2, `near the low end ${lo.toFixed(2)}, the high ${hi.toFixed(2)}`);
  assert.equal(seesaw.brain.danger(g.v, p1.x, p1.z, tk), 0, 'the middle of a level plank');
  assert.ok(seesaw.brain.danger(g.v, st.planks[dk].x, st.planks[dk].z, tk) >= 0.6, 'a plank about to drop');
  // goal: uphill of a slope coming; think: off the plank dropping, across to a neighbour, hopping at its edge
  hold(g, 1, 0.4);
  g.step();
  const bot = new Partier(0, 3, 0.8);
  put(g, 0, 1, 0, 0);
  g.step();
  const gl = seesaw.brain.goal(g.v, g.v.partier(0), { at: g.v.tick, pos: [p1.x, p1.z], skill: 0.8, slot: 0, mem: {} });
  assert.ok(gl[1] < p1.z - 1, `the goal ${(gl[1] - p1.z).toFixed(1)} m up the coming slope`);
  const b = { ...bot, pos: [st.planks[dk].x, st.planks[dk].z], vel: [0, 0], mem: {}, rand: () => 0 };
  const word = seesaw.brain.think(g.v, g.v.partier(0), b, g.v.tick + 8);
  assert.ok(word && b.mem.cross && Math.abs(st.planks[b.mem.cross.k].c - st.planks[dk].c) === 1, 'off to a neighbour across');
  // and the whole AI ball (client/party-bot.mjs, its words landing 8 ticks late) on a plank of its own with a crowd
  // of scripted balls rocking it from 40 s: it stays on for 20 s, crossing when its plank drops
  const h = await room(4, { seed: 43 });
  at(h, 5000);
  const ai = new Partier(0, 5, 0.8);
  const late = [];
  for (let i = 0; i < 2500; i++) {
    late.push(ai.think(h.v, h.v.tick + 8, 8));
    const rock = [1, 2, 3].map((p) => [L.EV_INPUT, p, partyWord({ yaw: (i >> 7) & 1 ? UP : DOWN, move: 1 })]);
    h.step([[L.EV_INPUT, 0, late.length > 8 ? late.shift() : partyWord({})], ...rock]);
  }
  assert.ok(!h.v.partier(0).out && h.v.party().state === L.H_PLAY, 'still on');
});

test('a tick of 256 balls: the field, the loads and the rings cost little', async (t) => {
  const g = await room(256, { seed: 50, debug: false });
  // the AI balls, their words landing 8 ticks late; only the sim's steps timed
  const ai = Array.from({ length: 256 }, (_, p) => new Partier(p, 9, 0.4 + 0.5 * ((p * 7) % 256) / 256));
  const late = ai.map(() => []);
  let ms = 0, n = 0;
  for (let i = 0; i < 1500; i++) {
    const recs = ai.map((b, p) => { late[p].push(b.think(g.v, g.v.tick + 8, 8)); return [L.EV_INPUT, p, late[p].length > 8 ? late[p].shift() : partyWord({})]; });
    const a = performance.now();
    g.step(recs);
    if (i >= 500) { ms += performance.now() - a; n++; }
  }
  ms /= n;
  const left = g.v.party().left;
  t.diagnostic(`${ms.toFixed(3)} ms a tick at 256 balls, ${left} of them still on`);
  assert.ok(left > 200, `${left} on`);
  assert.ok(ms < 2, `${ms.toFixed(3)} ms a tick`);
});
