// DISASTER ISLAND (src/mg/disaster.wat): the island for the crowd as setup
// lays it (its terraced cells, houses with their crates, rocks, the spots),
// the round's disasters (their kinds, calls, lengths and calms, harder each
// time), the rim crumbling in the calms, the houses' walls and roofs, each
// disaster on a ball (a flood's current and drowning, a meteor, a tornado's
// pull and fling, a quake's shoves and fissures, a tsunami's waves and the
// lee, a bolt), a shared win, the prediction through all of it, rounds of AI
// balls, the client module and a tick's cost at 256 balls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/disaster.mjs'; // ND_*: the minigame's own constants
import disaster, { stage, cellOf, dropOf, holds, rimAt, waterAt, funnelAt, fissureW, onFissure, frontsAt, alongAcross, inLee, onOb, surfaceAt, isBolt, nowAt, calledAt, NAMES } from '../client/mg/disaster.mjs';

const C = L.B_CX;
const S = MC.ND_S;
const TICK = 0.008;
const f = Math.fround;

// A room of n balls on Disaster Island, on the debug build (a NaN traps),
// stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7, debug = true } = {}) {
  const sim = await newParty(debug);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_DISASTER + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
// The first room from seed0 on whose round a disaster of kind comes (one
// `want` likes): the room and that disaster as the client reads it.
async function roomWith(kind, n = 1, { seed0 = 1, want = () => true, debug = true } = {}) {
  for (let seed = seed0; ; seed++) {
    const g = await room(n, { seed, debug });
    const s = stage(g.v, true);
    const D = s.dis.find((E) => E.kind === kind && want(E, s));
    if (D) return { g, D, seed };
  }
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// Ball p at (x, z) on the ground there (or y), rolling at (vx, vz).
function put(g, p, x, z, { y = null, vx = 0, vy = 0, vz = 0, ground = true } = {}) {
  if (y === null) y = surfaceAt(g.v, stage(g.v), x, z, Math.max(0, tp(g)))[0];
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, vy, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE | (ground ? L.PF_GROUND : 0));
}
// The next step plays tick t into play (the clock moved; the round's end with it).
function at(g, t) {
  const now = g.v.tick;
  g.dv.setUint32(L.HDR_START, now - t, true);
  g.dv.setUint32(L.HDR_UNTIL, now - t + g.v.party().len, true);
}
const tp = (g) => g.v.party().t;
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
const vel = (v, p) => v.partier(p).vel;
// How far (x, z) is from house or rock O's footprint.
const edge = (O, x, z) => (O.round ? Math.hypot(x - O.x, z - O.z) - O.hx : Math.hypot(Math.max(0, Math.abs(x - O.x) - O.hx), Math.max(0, Math.abs(z - O.z) - O.hz)));
// A spot on turf (flat: a cell and its neighbours one height; a cell h high
// if asked) standing through tick `until`, 3 m in from the rim, clear of every
// house and rock by `clear`, one `ok` likes, nearest (x, z).
function open(g, x = C, z = C, { clear = 2.5, until = 0, h = -1, flat = h < 0, ok = () => true } = {}) {
  const s = stage(g.v);
  const hAt = new Map(s.cells.filter((T) => T.drop > until + 1).map((T) => [T.c, T.h]));
  let best = null, bd = Infinity;
  for (const T of s.cells) {
    if (T.rho > s.rad - 3 || !hAt.has(T.c) || (h >= 0 && T.h !== h)) continue;
    if (flat && ![[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => hAt.get(cellOf(T.q + a, T.r + b)) === T.h)) continue;
    if (s.obs.some((O) => edge(O, T.x, T.z) < clear) || !ok(T)) continue;
    const d = Math.hypot(T.x - x, T.z - z);
    if (d < bd) { bd = d; best = T; }
  }
  return best;
}

test('the island for 1, 8, 64 and 256: a disc of terraced turf sized for the crowd, houses with crates and rocks on it, every ball on its own spot', async () => {
  assert.deepEqual([MC.ND_FX_CALL, MC.ND_FX_STRIKE, MC.ND_FX_HIT, MC.ND_FX_QUAKE], [0, 1, 2, 3].map((k) => L.FX_MG + 4 * L.MG_DISASTER + k));
  assert.ok(MC.ND_W === 2 * MC.ND_N && MC.ND_N * S >= MC.ND_RMAX + S);
  // PG_BIG's parts in order, none overlapping, all inside it
  const parts = [[MC.ND_DROP, 2 * MC.ND_W * MC.ND_W], [MC.ND_HGT, MC.ND_W * MC.ND_W], [MC.ND_OBS, MC.ND_NOBMAX * MC.ND_OBSZ], [MC.ND_DIS, MC.ND_NDMAX * MC.ND_DSZ],
    [MC.ND_LO, 2 * MC.ND_NB], [MC.ND_HI, 2 * MC.ND_NB], [MC.ND_SPN, 8 * L.NPLAYER], [MC.ND_EVS, MC.ND_NEMAX * MC.ND_ESZ]];
  for (let k = 1; k < parts.length; k++) assert.ok(parts[k - 1][0] + parts[k - 1][1] <= parts[k][0], `part ${k}`);
  assert.ok(MC.ND_EVS + MC.ND_NEMAX * MC.ND_ESZ <= L.PG_BIG_SIZE && 40 + MC.ND_NFMAX * MC.ND_FSZ <= MC.ND_DSZ);
  assert.ok(MC.ND_FELL + 2 * L.NPLAYER <= L.PG_S_SIZE && MC.ND_COUNT + 4 <= L.PG_H_SIZE);
  assert.ok(MC.ND_NB * MC.ND_BUCKET > MC.ND_LMAX, 'the buckets run past the round');
  let last = 0;
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const rad = Math.min(MC.ND_R0 + MC.ND_RK * Math.sqrt(n), MC.ND_RMAX);
    assert.equal(r.game, L.MG_DISASTER);
    assert.ok(Math.abs(r.size - rad) < 1e-4, `${r.size} m for ${n}`);
    assert.ok(r.size > last, 'grows with the crowd');
    last = r.size;
    assert.deepEqual([r.kind, r.floor, r.idle, r.hop, r.flags & L.PGF_BUMPS], [L.PK_OUT, PLAT_Y, f(MC.ND_IDLE), f(MC.ND_HOP), L.PGF_BUMPS]);
    const s = stage(g.v, true);
    assert.equal(s.rad, r.size);
    assert.ok(Math.abs(s.rmin - (MC.ND_RMIN0 + MC.ND_RMINK * rad)) < 1e-4);
    // every cell whose centre is on the disc, and none past it; a step at most between neighbours, the rim's flat
    let count = 0;
    for (let rr = -MC.ND_N; rr < MC.ND_N; rr++) for (let q = -MC.ND_N; q < MC.ND_N; q++) {
      const on = Math.hypot((q + 0.5) * S, (rr + 0.5) * S) <= rad;
      assert.equal(dropOf(g.v, cellOf(q, rr)) !== 0, on, `cell ${q} ${rr}`);
      count += on;
    }
    assert.equal(s.cells.length, count);
    assert.equal(g.dv.getUint32(L.PG_H + MC.ND_COUNT, true), count);
    const hAt = new Map(s.cells.map((T) => [T.c, T.h]));
    for (const T of s.cells) {
      assert.ok(T.h <= MC.ND_HK);
      if (T.rho > rad - MC.ND_HS) assert.equal(T.h, 0, 'the beach is flat');
      for (const [dq, dr] of [[1, 0], [0, 1]]) {
        const h = hAt.get(cellOf(T.q + dq, T.r + dr));
        if (h !== undefined) assert.ok(Math.abs(h - T.h) <= 1, 'a step a cell at most');
      }
    }
    assert.equal(s.maxH, MC.ND_HK, 'a hill');
    // the houses (each with its crate against a wall) and rocks, apart and inside
    const houses = s.obs.filter((O) => O.kind === MC.ND_HOUSE), rocks = s.obs.filter((O) => O.kind === MC.ND_ROCK);
    assert.equal(houses.length, s.obs.filter((O) => O.kind === MC.ND_CRATE).length);
    assert.ok(houses.length >= 1 && houses.length <= 1 + Math.floor(rad / MC.ND_PERH), `${houses.length} houses`);
    assert.ok(rocks.length >= 1 && rocks.length <= 1 + Math.floor(rad / MC.ND_PERR), `${rocks.length} rocks`);
    for (const O of s.obs) {
      assert.ok(Math.hypot(O.x - C, O.z - C) + Math.hypot(O.hx, O.hz) <= rad - MC.ND_GAP + 1e-3, 'inside the rim');
      const h = O.top - O.base;
      if (O.kind === MC.ND_HOUSE) {
        assert.ok(h >= MC.ND_HT0 - 1e-4 && h <= MC.ND_HT0 + MC.ND_HTK + 1e-4 && O.hx >= MC.ND_HX0 && O.hx <= MC.ND_HX0 + MC.ND_HXK);
        const cr = s.obs[O.k + 1];
        assert.equal(cr.kind, MC.ND_CRATE);
        const gx = Math.abs(cr.x - O.x) - O.hx - cr.hx, gz = Math.abs(cr.z - O.z) - O.hz - cr.hz;
        assert.ok(Math.abs(Math.max(gx, gz)) < 1e-4, 'the crate stands against a wall');
        assert.ok(Math.abs(cr.top - cr.base - MC.ND_CH) < 1e-4);
      }
      if (O.kind === MC.ND_ROCK) assert.ok(O.round && h >= MC.ND_RT0 - 1e-4 && h <= MC.ND_RT0 + MC.ND_RTK + 1e-4);
    }
    // every ball on the ground at its spot, on the island, clear of the houses and rocks, none on another
    const at0 = [];
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], surfaceAt(g.v, s, b.pos[0], b.pos[2], 0)[0], `${n}: P${p + 1} on the turf`);
      assert.ok(Math.hypot(b.pos[0] - C, b.pos[2] - C) <= rad - 2.5 + 1e-3, `${n}: P${p + 1} inside the rim`);
      for (const O of s.obs) assert.ok(!onOb(O, b.pos[0], b.pos[2], MC.ND_CLEAR) && Math.hypot(b.pos[0] - O.x, b.pos[2] - O.z) > Math.min(O.hx, O.round ? O.hx : O.hz) + MC.ND_CLEAR, `${n}: P${p + 1} clear of ${O.k}`);
      at0.push(b.pos);
    }
    for (let p = 1; p < n; p++) for (let q = 0; q < p; q++) assert.ok(Math.hypot(at0[p][0] - at0[q][0], at0[p][2] - at0[q][2]) > 2, `${n}: P${p + 1} and P${q + 1} apart`);
  }
});

test('the disasters: the seed\'s, never one of the last two, the first hitting ND_FIRST in, each called ND_WARN ahead and 12 to 20 s long, the calms shorter each time; every kind comes up; later ones are harder; the round 90 to 120 s', async () => {
  const seen = new Set();
  const rate = [[], []]; // strikes a second per level, meteors and bolts
  for (let seed = 1; seed <= 14; seed++) {
    const g = await room(8, { play: false, seed });
    const s = stage(g.v, true);
    const len = g.v.party().len;
    assert.ok(len >= 90 / TICK && len <= MC.ND_LMAX, `${len * TICK} s`);
    assert.ok(s.dis.length >= 5 && s.dis.length <= MC.ND_NDMAX, `${s.dis.length} disasters`);
    assert.equal(s.dis[0].t0, MC.ND_FIRST);
    assert.equal(len, s.dis.at(-1).t1 + MC.ND_TAIL);
    for (const D of s.dis) {
      seen.add(D.kind);
      assert.equal(D.call, D.t0 - MC.ND_WARN);
      assert.equal(D.lv, Math.min(D.j, MC.ND_LVMAX));
      assert.ok(D.t1 - D.t0 >= MC.ND_DUR0 && D.t1 - D.t0 <= MC.ND_DUR0 + MC.ND_DURK, `${D.t1 - D.t0} ticks`);
      assert.ok(D.t0 <= MC.ND_LAST && D.t1 <= MC.ND_LMAX - MC.ND_TAIL);
      if (D.j >= 1) assert.notEqual(D.kind, s.dis[D.j - 1].kind, 'never the same twice running');
      if (D.j >= 2) assert.notEqual(D.kind, s.dis[D.j - 2].kind, 'nor the one before');
      if (D.j >= 1) assert.equal(D.t0 - s.dis[D.j - 1].t1, Math.max(MC.ND_CALM1, MC.ND_CALM0 - (D.j - 1) * MC.ND_CALMK), 'the calm');
      // the strikes: in order, inside the disaster, on the island as it stands
      if (D.kind === MC.ND_METEOR || D.kind === MC.ND_LIGHTNING) {
        assert.ok(D.e1 > D.e0, 'strikes');
        for (let e = D.e0; e < D.e1; e++) {
          assert.ok(s.et[e] >= D.t0 + 60 && s.et[e] < D.t1 - 30 && (e === D.e0 || s.et[e] >= s.et[e - 1]));
          assert.equal(isBolt(s, e), D.kind === MC.ND_LIGHTNING);
          assert.equal(s.ej[e], D.j);
          if (s.eo[e]) assert.ok(s.et[e] < s.obs[s.eo[e] - 1].drop && onOb(s.obs[s.eo[e] - 1], s.ex[e], s.ez[e]), 'on a roof or rock standing');
          else assert.ok(Math.hypot(s.ex[e] - C, s.ez[e] - C) < D.rad, 'on the island');
        }
        rate[D.kind === MC.ND_LIGHTNING ? 1 : 0].push([D.lv, (D.e1 - D.e0) / ((D.t1 - D.t0) * TICK) / (Math.PI * D.rad * D.rad)]);
      }
      if (D.kind === MC.ND_FLOOD) assert.ok(Math.abs(D.depth - (MC.ND_FD0 + MC.ND_FDK * D.lv)) < 1e-5);
      if (D.kind === MC.ND_TORNADO) assert.ok(D.pull > MC.ND_TP0 - 1e-5 && Math.abs(D.pull - (MC.ND_TP0 + MC.ND_TPUP * D.lv)) < 1e-4 && D.rp >= MC.ND_TR0);
      if (D.kind === MC.ND_QUAKE) assert.ok(D.per === Math.trunc(f(MC.ND_QP0 - D.lv * MC.ND_QPK)) && D.fis.length === MC.ND_NF0 + (D.lv >= MC.ND_NFLV ? 1 : 0));
      if (D.kind === MC.ND_TSUNAMI) assert.ok(D.nw >= MC.ND_NW0 && D.nw <= MC.ND_NWMAX && Math.abs(D.c - (MC.ND_WC0 + MC.ND_WCK * D.lv)) < 1e-4);
    }
    // the radius each hits with: the rim as it stands, less its jitter
    for (const D of s.dis) assert.ok(Math.abs(D.rad - rimAt(s, D.t0)) < 0.05 && D.rad <= s.rad && D.rad >= s.rmin - 1e-4);
    // the bolts aim for roofs and rocks a share of the time
    const bolts = s.dis.filter((D) => D.kind === MC.ND_LIGHTNING).flatMap((D) => Array.from({ length: D.e1 - D.e0 }, (_, k) => D.e0 + k));
    for (const e of bolts) if (s.eo[e]) assert.ok(s.ek[e] & MC.ND_EV_ROOF);
  }
  assert.equal(seen.size, MC.ND_KINDS, 'every kind');
  // harder later: a level's strikes a second for the island's area
  let compared = 0;
  for (const r of rate) {
    const lo = r.filter(([lv]) => lv <= 1), hi = r.filter(([lv]) => lv >= 3);
    if (!lo.length || !hi.length) continue;
    const mean = (a) => a.reduce((x, [, y]) => x + y, 0) / a.length;
    assert.ok(mean(hi) > mean(lo) * 1.3, `${mean(lo)} early, ${mean(hi)} late`);
    compared++;
  }
  assert.equal(compared, 2, 'meteors and bolts both');
  // another round, another sequence
  const a = await room(8, { play: false, seed: 3 }), b = await room(8, { play: false, seed: 4 });
  assert.notDeepEqual(stage(a.v, true).dis.map((D) => D.kind), stage(b.v, true).dis.map((D) => D.kind));
});

test('the rim crumbles in the calms only, in from the edge to ND_RMIN: a cell holds through the tick before its own and drops a ball on it; a house goes with its cell; the core never goes', async () => {
  const g = await room(2, { seed: 5 });
  const s = stage(g.v, true);
  let gone = 0;
  for (const T of s.cells) {
    if (T.drop === MC.ND_NEVER) { assert.ok(T.rho <= s.rmin + S, 'the core stays'); continue; }
    gone++;
    assert.ok(T.rho > s.rmin, 'past the last line');
    const j = s.dis.findIndex((D, k) => k + 1 < s.dis.length && T.drop > D.t1 && T.drop <= s.dis[k + 1].t0);
    assert.ok(j >= 0, `cell ${T.c} goes at ${T.drop}, in a calm`);
  }
  assert.ok(gone > s.cells.length / 3, `${gone} of ${s.cells.length} go`);
  // the outer ring goes before the inner, mostly
  const ring = (a, b) => s.cells.filter((T) => T.drop !== MC.ND_NEVER && T.rho > a && T.rho <= b).map((T) => T.drop);
  const mid = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  assert.ok(mid(ring(s.rad - 3, s.rad)) < mid(ring(s.rmin, s.rmin + 3)));
  for (const O of s.obs) {
    const c = s.cells.find((T) => T.q === Math.floor((O.x - C) / S) && T.r === Math.floor((O.z - C) / S));
    assert.equal(O.drop, c.drop, `house or rock ${O.k} goes with its cell`);
  }
  // a cell with a ball on it: held through drop - 1, gone at drop, the ball falls and is out
  const T = s.cells.filter((X) => X.drop !== MC.ND_NEVER && X.h === 0 && !s.obs.some((O) => Math.hypot(X.x - O.x, X.z - O.z) < Math.hypot(O.hx, O.hz) + 3)).sort((a, b) => a.drop - b.drop)[4];
  assert.ok(holds(g.v, T.c, T.drop - 1) && !holds(g.v, T.c, T.drop));
  const quiet = s.dis.findIndex((D) => D.t1 < T.drop && T.drop <= s.dis[D.j + 1].t0);
  assert.ok(quiet >= 0);
  at(g, T.drop - 30);
  const P = open(g, C, C, { until: T.drop + 400 });
  put(g, 0, P.x, P.z);
  put(g, 1, T.x, T.z);
  for (let k = 0; k < 30; k++) { g.step(); assert.ok(g.v.partier(1).ground, `held at ${tp(g)}`); }
  assert.equal(tp(g), T.drop);
  for (let k = 0; k < 400 && !g.v.partier(1).out; k++) g.step();
  assert.ok(g.v.partier(1).out, 'down with it and out');
  assert.equal(g.v.partier(0).place, 1, 'the one left on wins');
});

test('a house\'s walls and a rock\'s are solid to a ball below their tops, ND_BOUNCE of its speed back; their tops are ground; a run, a hop onto the crate and another takes a ball up onto the roof', async () => {
  const g = await room(1, { seed: 7 });
  at(g, 60);
  const s = stage(g.v, true);
  const O = s.obs.find((X) => X.kind === MC.ND_HOUSE), cr = s.obs[O.k + 1], R = s.obs.find((X) => X.kind === MC.ND_ROCK);
  const ax = Math.abs(O.x - cr.x) > Math.abs(O.z - cr.z);
  const ux = ax ? Math.sign(O.x - cr.x) : 0, uz = ax ? 0 : Math.sign(O.z - cr.z);
  // rolled at the wall opposite the crate at 8 m/s: kept a radius off it, 0.3 of its speed back
  const hw = ax ? O.hx : O.hz;
  put(g, 0, O.x + ux * (hw + 1.5), O.z + uz * (hw + 1.5), { vx: -ux * 8, vz: -uz * 8 });
  let back = 0;
  for (let k = 0; k < 40; k++) {
    g.step();
    const b = g.v.partier(0);
    const off = ax ? Math.abs(b.pos[0] - O.x) - O.hx : Math.abs(b.pos[2] - O.z) - O.hz;
    assert.ok(off >= 1 - 1e-3, `a radius off the wall: ${off}`);
    back = Math.max(back, (b.vel[0] * ux + b.vel[2] * uz));
  }
  assert.ok(back > 0.3 * 8 * 0.8 && back < 0.3 * 8 * 1.01, `${back} m/s back`);
  // a rock too, round
  put(g, 0, R.x + R.hx + 1.6, R.z, { vx: -6 });
  for (let k = 0; k < 40; k++) { g.step(); const b = g.v.partier(0); assert.ok(Math.hypot(b.pos[0] - R.x, b.pos[2] - R.z) >= R.hx + 1 - 1e-3); }
  // dropped over the roof, it lands on it and stays
  put(g, 0, O.x, O.z, { y: O.top + 2, ground: false });
  for (let k = 0; k < 80; k++) g.step();
  assert.equal(g.v.partier(0).pos[1], f(O.top), 'on the roof');
  assert.ok(g.v.partier(0).ground);
  // from 3 m behind the crate: roll at it, hop on, hop again, and up
  const g2 = await room(1, { seed: 7 });
  at(g2, 60);
  put(g2, 0, cr.x - ux * 3, cr.z - uz * 3);
  const yaw = Math.round(Math.atan2(uz, ux) / (2 * Math.PI) * 16384) & 16383;
  let up = -1, onCrate = false;
  for (let k = 0; k < 250 && up < 0; k++) {
    g2.step([[L.EV_INPUT, 0, partyWord({ yaw, move: 1, hop: k >= 14 ? 1 : 0 })]]);
    const b = g2.v.partier(0);
    if (b.ground && Math.abs(b.pos[1] - cr.top) < 1e-3) onCrate = true;
    if (b.ground && Math.abs(b.pos[1] - O.top) < 1e-3) up = k;
  }
  assert.ok(onCrate && up > 0, `onto the crate, then the roof at ${up}`);
});

test('a flood: the water rises from under the rim over ND_FRISE to its depth and drains by the end; its current drags a ball outward, and a ball under it ND_BREATH ticks drowns; on a roof it\'s dry, and breath comes back two a tick', async () => {
  const { g, D } = await roomWith(MC.ND_FLOOD, 3, { want: (E, s) => E.j <= 1 && s.obs.some((X) => X.kind === MC.ND_HOUSE && X.drop > E.t1) });
  const s = stage(g.v);
  const P = open(g, C, C, { until: D.t1, h: 0 }), Q = open(g, P.x, P.z, { until: D.t1, h: 0, ok: (T) => Math.hypot(T.x - P.x, T.z - P.z) > 4 });
  const O = s.obs.find((X) => X.kind === MC.ND_HOUSE && X.drop > D.t1);
  assert.ok(O, 'a house standing through it');
  assert.ok(Math.abs(waterAt(D, D.t0) - (PLAT_Y - 0.5)) < 1e-6 && Math.abs(waterAt(D, D.t0 + MC.ND_FRISE) - (PLAT_Y + D.depth)) < 1e-5 && waterAt(D, D.t1) <= PLAT_Y - 0.5 + 1e-6);
  // before it hits, nothing; once full, a ball standing low is slowed, then dragged outward and counts its breath
  at(g, D.t0 - 20);
  put(g, 0, P.x, P.z);
  put(g, 1, O.x, O.z, { y: O.top });
  put(g, 2, Q.x, Q.z, { vx: 0, vz: 0 });
  for (let k = 0; k < 20; k++) g.step();
  assert.deepEqual([vel(g.v, 0), g.v.partier(0).m & 0xfff], [[0, 0, 0], 0], 'nothing before it hits');
  at(g, D.t0 + MC.ND_FRISE + 2);
  put(g, 2, Q.x, Q.z);
  g.step();
  const q = g.v.partier(2), out = [Q.x - C, Q.z - C], ol = Math.hypot(...out);
  const a = (MC.ND_FA0 + MC.ND_FAK * D.lv) * TICK;
  assert.ok(Math.abs((q.vel[0] * out[0] + q.vel[2] * out[1]) / ol - a) < 1e-3 * a + 1e-5, `outward at ${(q.vel[0] * out[0] + q.vel[2] * out[1]) / ol}`);
  assert.equal(q.m & 0xfff, 1, 'under');
  // held still under it: a tick of breath each, then drowned (going down through the floor) and out
  let seen = g.v.fxCount();
  for (let k = 1; k < MC.ND_BREATH - 1; k++) {
    put(g, 0, P.x, P.z);
    put(g, 2, Q.x, Q.z);
    g.step();
  }
  assert.equal(g.v.partier(2).m & 0xfff, MC.ND_BREATH - 1);
  // ball 0 out into the air a moment: two back a tick
  put(g, 0, P.x, P.z, { y: PLAT_Y + D.depth + 0.5, ground: false });
  put(g, 2, Q.x, Q.z);
  g.step();
  const b0 = g.v.partier(0).m & 0xfff;
  assert.equal(b0, MC.ND_BREATH - 1 - 2, 'breath back two a tick');
  put(g, 2, Q.x, Q.z);
  g.step();
  assert.ok(g.v.partier(2).falling, 'drowned');
  const hit = fxs(g.v, MC.ND_FX_HIT, seen).find((x) => x.owner === 2);
  assert.equal(hit?.shot, MC.ND_HIT_DROWN);
  assert.equal(g.v.partier(2).m >>> 12 & 15, MC.ND_HIT_DROWN);
  assert.equal(g.v.partier(1).m & 0xfff, 0, 'dry on the roof');
  assert.deepEqual(vel(g.v, 1), [0, 0, 0]);
  for (let k = 0; k < 400 && !g.v.partier(2).out; k++) { put(g, 1, O.x, O.z, { y: O.top }); g.step(); }
  assert.ok(g.v.partier(2).out, 'out');
  // draining: past its end, nothing
  at(g, D.t1 + 5);
  put(g, 0, P.x, P.z);
  g.step();
  assert.deepEqual(vel(g.v, 0), [0, 0, 0]);
});

// A strike of disaster D on open turf (no house or rock within 4 m, flat round it), from the k-th on.
function strikeIn(s, D, k = 0, roof = false) {
  for (let e = D.e0 + k; e < D.e1; e++) {
    if (!!s.eo[e] !== roof) continue;
    if (!roof && (s.obs.some((O) => Math.hypot(s.ex[e] - O.x, s.ez[e] - O.z) < Math.hypot(O.hx, O.hz) + 4) || Math.hypot(s.ex[e] - C, s.ez[e] - C) > D.rad - 4)) continue;
    // none other landing near on its tick
    if ([...Array(D.e1 - D.e0).keys()].some((i) => D.e0 + i !== e && Math.abs(s.et[D.e0 + i] - s.et[e]) < 3)) continue;
    return e;
  }
  return -1;
}

test('a meteor lands on its ring on its tick: a ball under it is knocked off the spot, harder nearer the middle, and up; one past its reach not; its FX on the tick', async () => {
  const { g, D } = await roomWith(MC.ND_METEOR, 1);
  const s = stage(g.v);
  const e = strikeIn(s, D);
  assert.ok(e >= 0);
  const r = s.er[e];
  assert.ok(r >= MC.ND_MR0 - 1e-5 && r <= MC.ND_MR0 + MC.ND_MRK + 1e-5);
  const seeds = [];
  for (const [off, hit] of [[0.4, true], [0.8, true], [1.05, false]]) {
    const h = (await roomWith(MC.ND_METEOR, 1)).g;
    at(h, s.et[e] - 4);
    put(h, 0, s.ex[e] + off * r, s.ez[e]);
    const seen = h.v.fxCount();
    for (let k = 0; k < 4; k++) { h.step(); assert.deepEqual(vel(h.v, 0), [0, 0, 0], 'not yet'); }
    h.step();
    const st = fxs(h.v, MC.ND_FX_STRIKE, seen);
    assert.ok(st.length === 1 && st[0].shot === e && Math.abs(st[0].pos[0] - s.ex[e]) < 1e-3 && Math.abs(st[0].size - r) < 1e-5, 'its FX');
    const v = vel(h.v, 0);
    if (!hit) { assert.deepEqual([v[0], v[2]], [0, 0], 'past its reach'); continue; }
    const k = MC.ND_MKICK * (1 - MC.ND_MFALL * off);
    assert.ok(Math.abs(v[0] - k) < 0.05 && Math.abs(v[2]) < 1e-3, `knocked off at ${v[0]}`);
    assert.ok(v[1] > MC.ND_MUPV - 0.3, 'and up');
    const fh = fxs(h.v, MC.ND_FX_HIT, seen);
    assert.ok(fh.length === 1 && fh[0].shot === MC.ND_HIT_METEOR && fh[0].owner === 0);
    seeds.push(v[0]);
  }
  assert.ok(seeds[0] > seeds[1], 'harder nearer the middle');
});

test('lightning: a bolt on its spot throws a ball there off and up, one well over it not; it strikes roofs and rocks while they stand, ND_LROOF of the time', async () => {
  const { g, D } = await roomWith(MC.ND_LIGHTNING, 1);
  const s = stage(g.v);
  const e = strikeIn(s, D);
  assert.ok(e >= 0 && Math.abs(s.er[e] - MC.ND_LR) < 1e-5);
  for (const [y, hit] of [[0, true], [MC.ND_LOVER + 0.5, false]]) {
    const h = (await roomWith(MC.ND_LIGHTNING, 1)).g;
    at(h, s.et[e] - 3);
    put(h, 0, s.ex[e] + 1, s.ez[e], { y: s.ey[e] + y, ground: !y });
    if (y) h.dv.setFloat32(rec(0) + L.P_VY, 0, true);
    const seen = h.v.fxCount();
    for (let k = 0; k < 4; k++) {
      if (y) put(h, 0, s.ex[e] + 1, s.ez[e], { y: s.ey[e] + y, ground: false });
      h.step();
    }
    const v = vel(h.v, 0);
    const fh = fxs(h.v, MC.ND_FX_HIT, seen);
    if (!hit) { assert.equal(fh.length, 0, 'over it'); continue; }
    assert.ok(fh.length === 1 && fh[0].shot === MC.ND_HIT_BOLT);
    assert.ok(v[0] >= MC.ND_LKICK - 0.2 && v[1] >= MC.ND_LUPV - 0.3, `thrown at ${v}`);
  }
  // a bolt on a roof: a ball up there is thrown off it
  const er = strikeIn(s, D, 0, true);
  assert.ok(er >= 0, 'one on a roof or rock');
  const O = s.obs[s.eo[er] - 1];
  assert.ok(s.et[er] < O.drop && Math.abs(s.ey[er] - O.top) < 1e-5);
  const h = (await roomWith(MC.ND_LIGHTNING, 1)).g;
  at(h, s.et[er] - 3);
  put(h, 0, s.ex[er], s.ez[er], { y: O.top });
  const seen = h.v.fxCount();
  for (let k = 0; k < 4; k++) h.step();
  assert.ok(fxs(h.v, MC.ND_FX_HIT, seen).some((x) => x.shot === MC.ND_HIT_BOLT), 'struck on the roof');
  // the share on roofs and rocks, over a few rounds
  let on = 0, all = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const r = await room(8, { play: false, seed });
    const t = stage(r.v, true);
    for (const E of t.dis) if (E.kind === MC.ND_LIGHTNING) for (let k = E.e0; k < E.e1; k++) { all++; on += t.eo[k] ? 1 : 0; }
  }
  assert.ok(all > 50 && on / all > MC.ND_LROOF * 0.6 && on / all < MC.ND_LROOF * 1.2, `${on} of ${all} on roofs and rocks`);
});

// A tick of tornado D whose funnel is out in the open (clear of the houses
// and rocks by `clear`, well in from the rim), from tick `from` on.
function openFunnel(s, D, from, clear = 6) {
  for (let t = from; t < D.t1 - 200; t += 10) {
    const [x, z] = funnelAt(D, t);
    if (Math.hypot(x - C, z - C) < D.rad - 8 && !s.obs.some((O) => edge(O, x, z) < clear)) return t;
  }
  return -1;
}

test('a tornado wanders its path: within its reach a ball is pulled in and swung round, in its core lifted and once ND_TFLY up flung out; past its reach, nothing; it touches down and lifts over ND_TRAMP', async () => {
  const { g, D } = await roomWith(MC.ND_TORNADO, 1, { want: (E, s) => openFunnel(s, E, E.t0 + MC.ND_TRAMP) > 0 });
  const s = stage(g.v);
  assert.ok(Math.abs(funnelAt(D, D.t0)[2]) < 1e-9 && funnelAt(D, D.t0 + MC.ND_TRAMP)[2] === 1 && funnelAt(D, D.t1)[2] === 0);
  const t = openFunnel(s, D, D.t0 + MC.ND_TRAMP);
  // pulled: 4 m off, toward it and round it
  at(g, t);
  let [fx, fz] = funnelAt(D, t);
  put(g, 0, fx + 4, fz);
  g.step();
  let v = vel(g.v, 0);
  assert.ok(v[0] < -0.02 && Math.abs(v[2]) > 0.01, `pulled in and round: ${v}`);
  const k = D.pull * (1 - 4 / D.rp) * TICK;
  assert.ok(Math.abs(-v[0] - k) < 0.02 * k, `${-v[0]} in, ${k} by its numbers`);
  // let it: in, up, flung out (an FX), well clear of where it was
  const seen = g.v.fxCount();
  let top = 0, flung = null;
  for (let n = 0; n < 600 && !flung; n++) {
    g.step();
    const b = g.v.partier(0);
    top = Math.max(top, b.pos[1] - PLAT_Y);
    flung = fxs(g.v, MC.ND_FX_HIT, seen).find((x) => x.shot === MC.ND_HIT_TORNADO);
  }
  assert.ok(flung, 'flung');
  assert.ok(top > MC.ND_TFLY, `lifted ${top.toFixed(1)} m`);
  v = vel(g.v, 0);
  assert.ok(Math.hypot(v[0], v[2]) > MC.ND_TFLING * 0.9, `out at ${Math.hypot(v[0], v[2])}`);
  // past its reach: nothing
  const h = (await roomWith(MC.ND_TORNADO, 1, { want: (E, s2) => E.j === D.j && s2.seed === s.seed })).g;
  at(h, t);
  [fx, fz] = funnelAt(D, t);
  const far = open(h, fx, fz, { until: D.t1, flat: false, ok: (T) => Math.hypot(T.x - fx, T.z - fz) > D.rp + 1.5 });
  put(h, 0, far.x, far.z);
  for (let n = 0; n < 3; n++) h.step();
  assert.deepEqual(vel(h.v, 0), [0, 0, 0]);
});

test('an earthquake shoves a ball on the ground every period for ND_QLEN ticks the seed\'s way and jolts it up, not one in the air; its fissures open on their ticks to their width, and a ball over one falls through; an FX each', async () => {
  const { g, D } = await roomWith(MC.ND_QUAKE, 2, { want: (E) => E.j <= 2 });
  const s = stage(g.v);
  const P = open(g, C, C, { until: D.t1, flat: false }), Q = open(g, P.x, P.z, { until: D.t1, flat: false, ok: (T) => Math.hypot(T.x - P.x, T.z - P.z) > 4 });
  assert.ok(D.per > MC.ND_QLEN && Math.abs(D.push - (MC.ND_QA0 + MC.ND_QAK * D.lv)) < 1e-4);
  at(g, D.t0 + MC.ND_Q0);
  put(g, 0, P.x, P.z);
  put(g, 1, Q.x, Q.z, { y: Q.top + 3, ground: false });
  let seen = g.v.fxCount();
  g.step();
  let v = vel(g.v, 0);
  assert.ok(Math.abs(Math.hypot(v[0], v[2]) - D.push * TICK) < 1e-5, `shoved at ${Math.hypot(v[0], v[2])}`);
  assert.deepEqual([vel(g.v, 1)[0], vel(g.v, 1)[2]], [0, 0], 'not in the air');
  const q = fxs(g.v, MC.ND_FX_QUAKE, seen);
  assert.ok(q.length === 1 && q[0].shot === 0 && Math.abs(q[0].size - D.push) < 1e-5, 'the shove\'s FX');
  // all ND_QLEN of it one way, a jolt up at its end; then nothing till the next
  const dir = Math.atan2(v[2], v[0]);
  for (let k = 1; k < MC.ND_QLEN; k++) {
    put(g, 0, P.x, P.z);
    g.step();
    v = vel(g.v, 0);
    assert.ok(Math.abs(Math.atan2(v[2], v[0]) - dir) < 1e-4 && Math.abs(Math.hypot(v[0], v[2]) - D.push * TICK) < 1e-5);
  }
  assert.ok(Math.abs(v[1] - MC.ND_QJOLT) < 1e-6 && !g.v.partier(0).ground, 'jolted up');
  for (let k = 0; k < D.per - MC.ND_QLEN; k++) {
    put(g, 0, P.x, P.z);
    g.step();
    assert.deepEqual(vel(g.v, 0), [0, 0, 0], 'between shoves');
  }
  put(g, 0, P.x, P.z);
  g.step();
  assert.ok(Math.hypot(vel(g.v, 0)[0], vel(g.v, 0)[2]) > 0, 'the next');
  // the fissures, in turn, each FX on its tick
  for (const F of D.fis) {
    assert.equal(F.open, D.t0 + MC.ND_QFIRST + F.k * MC.ND_QSTAG);
    assert.ok(F.hl > 0 && Math.abs(Math.hypot(F.lx, F.lz) - 1) < 1e-5);
    assert.equal(fissureW(D, F, F.open - 1), 0);
    assert.ok(Math.abs(fissureW(D, F, F.open + MC.ND_QOPEN) - D.w) < 1e-6);
  }
  const F = D.fis[0];
  // a spot on its line still on the island, clear of the houses and rocks
  let x = 0, z = 0;
  for (let t = -F.hl * 0.8; t <= F.hl * 0.8; t += 0.25) {
    x = F.x + F.lx * t; z = F.z + F.lz * t;
    const T = s.cells.find((X) => X.q === Math.floor((x - C) / S) && X.r === Math.floor((z - C) / S));
    if (T && T.drop > D.t1 && T.rho < s.rad - 3 && !s.obs.some((O) => edge(O, x, z) < 2)) break;
  }
  at(g, F.open - 20);
  seen = g.v.fxCount();
  for (let k = 0; k < 20; k++) { put(g, 0, x, z); put(g, 1, P.x, P.z); g.step(); assert.ok(g.v.partier(0).ground, 'held till it opens'); }
  for (let k = 0; k < 10; k++) { put(g, 1, P.x, P.z); g.step(); }
  assert.ok(!g.v.partier(0).ground && g.v.partier(0).pos[1] < surfaceAt(g.v, s, x, z, F.open - 30)[0] - 0.05, 'through it');
  assert.ok(fxs(g.v, MC.ND_FX_QUAKE, seen).some((e) => e.shot === 0x100), 'its FX');
  for (let k = 0; k < 400 && !g.v.partier(0).out; k++) { put(g, 1, P.x, P.z); g.step(); }
  assert.ok(g.v.partier(0).out, 'out');
});

test('a tsunami: its waves cross the island from one side, ND_WD deep; one carries a ball its way, up to ND_WU of its speed, the front a hit; not in the lee of a house or rock, nor a ball up on a roof', async () => {
  const { g, D } = await roomWith(MC.ND_TSUNAMI, 1, { want: (E, s) => s.obs.some((O) => O.kind === MC.ND_HOUSE && O.drop > E.t1) });
  const s = stage(g.v);
  assert.ok(D.nw >= MC.ND_NW0 && D.gap > 0 && Math.abs(Math.hypot(D.dx, D.dz) - 1) < 1e-5);
  // a wave reaches a spot when its front does
  const arrive = (x, z, k = 0) => D.t0 + k * D.gap + Math.ceil((alongAcross(s, D, x, z)[0] - D.a0) / (D.c * TICK));
  const P = open(g, C, C, { until: D.t1 });
  const ta = arrive(P.x, P.z);
  at(g, ta - 10);
  put(g, 0, P.x, P.z);
  const seen = g.v.fxCount();
  for (let k = 0; k < 9; k++) { g.step(); assert.deepEqual(vel(g.v, 0), [0, 0, 0], 'before it'); }
  for (let k = 0; k < 6; k++) g.step();
  const v = vel(g.v, 0), along = v[0] * D.dx + v[2] * D.dz;
  assert.ok(along > 1 && along <= MC.ND_WU * D.c + 1e-3, `carried at ${along}`);
  assert.ok(fxs(g.v, MC.ND_FX_HIT, seen).some((x) => x.shot === MC.ND_HIT_WAVE), 'hit by its front');
  for (const [front] of frontsAt(D, ta + 2).slice(0, 1)) assert.ok(front >= alongAcross(s, D, P.x, P.z)[0]);
  // in a house's lee, the wave goes over: nothing
  const O = s.obs.find((X) => X.kind === MC.ND_HOUSE && X.drop > D.t1);
  const ea = O.hx * Math.abs(D.dx) + O.hz * Math.abs(D.dz);
  const [oa, ob] = alongAcross(s, D, O.x, O.z);
  const al = oa + ea + 1.6;
  const lx = C + D.dx * al - D.dz * ob, lz = C + D.dz * al + D.dx * ob;
  assert.ok(inLee(s, D, ta, lx, lz));
  const h = (await roomWith(MC.ND_TSUNAMI, 1, { want: (E, s2) => s2.seed === s.seed && E.j === D.j })).g;
  const tl = arrive(lx, lz);
  at(h, tl - 5);
  for (let k = 0; k < 40; k++) { put(h, 0, lx, lz); h.step(); assert.deepEqual(vel(h.v, 0), [0, 0, 0], 'in the lee'); }
  // up on its roof, over the water: nothing
  at(h, arrive(O.x, O.z) - 5);
  for (let k = 0; k < 40; k++) { put(h, 0, O.x, O.z, { y: O.top }); h.step(); assert.deepEqual(vel(h.v, 0), [0, 0, 0], 'on the roof'); }
});

test('the calls: each disaster\'s FX as it\'s called, as it hits and as it\'s over, its kind and its number; nothing between', async () => {
  const g = await room(1, { seed: 6 });
  const s = stage(g.v, true);
  const P = open(g, C, C, { until: MC.ND_LMAX, flat: false });
  let all = 0;
  for (const D of s.dis) {
    for (const [t, phase] of [[D.call, 0], [D.t0, 1], [D.t1, 2]]) {
      at(g, t - 2);
      const seen = g.v.fxCount();
      for (let k = 0; k < 4; k++) { put(g, 0, P.x, P.z); g.step(); }
      const c = fxs(g.v, MC.ND_FX_CALL, seen);
      assert.equal(c.length, 1, `${NAMES[D.kind]} ${phase}`);
      assert.deepEqual([c[0].shot, c[0].size, (c[0].tick - g.v.party().start) | 0], [D.kind | (phase << 8), D.j, t]);
      all++;
    }
    // the calm to the next's call
    const next = s.dis[D.j + 1];
    if (!next) continue;
    assert.ok(next.call > D.t1, 'called once the last is over');
    at(g, D.t1 + 1);
    const seen = g.v.fxCount();
    for (let k = 0; k < Math.min(60, next.call - D.t1 - 1); k++) { put(g, 0, P.x, P.z); g.step(); }
    assert.equal(fxs(g.v, MC.ND_FX_CALL, seen).length, 0, 'the calm');
  }
  assert.equal(all, 3 * s.dis.length);
  // the clock and the HUD agree with it
  assert.equal(nowAt(s, s.dis[1].t0), s.dis[1]);
  assert.equal(nowAt(s, s.dis[1].t0 - 1), null);
  assert.equal(calledAt(s, s.dis[1].call), s.dis[1]);
});

test('the last balls on, all off in one disaster, share the win though they go over the edge ticks apart; off in two, the last on wins; a real tsunami washing two off together', async () => {
  // by hand: off 40 ticks apart in one disaster, and either side of a call
  for (const [cross, shared] of [[false, true], [true, false]]) {
    const h = await room(3, { seed: 12 });
    const s = stage(h.v, true);
    const D = s.dis[1];
    at(h, D.t0 + 100);
    put(h, 0, C, C);
    h.dv.setUint8(rec(0) + L.P_FL, L.PF_LIVE | L.PF_DEAD);
    const r = s.rad + 3;
    put(h, 1, C + r, C, { y: PLAT_Y - 0.5, ground: false });
    for (let k = 0; k < 40; k++) h.step();
    if (cross) at(h, s.dis[2].call + 5);
    put(h, 2, C - r, C, { y: PLAT_Y - 0.5, ground: false });
    for (let k = 0; k < 400 && h.v.party().state === L.H_PLAY; k++) h.step();
    assert.equal(h.v.party().state, L.H_OVER);
    assert.deepEqual([1, 2].map((q) => h.v.partier(q).place), shared ? [1, 1] : [2, 1], `across a call: ${cross}`);
    assert.equal(h.v.party().winner, shared ? 255 : 2);
  }
  // a real one: two balls downstream of a tsunami, no lee, washed off its far side
  const { g, D } = await roomWith(MC.ND_TSUNAMI, 3, { want: (E) => E.j <= 2 });
  const s = stage(g.v);
  const free = (T) => !inLee(s, D, D.t0 + 300, T.x, T.z) && alongAcross(s, D, T.x, T.z)[0] > 2;
  // side by side across its way, as far from the far rim
  const room2 = (T) => { const [al, ac] = alongAcross(s, D, T.x, T.z); return Math.sqrt(Math.max(0, D.rad * D.rad - ac * ac)) - al; };
  const A = open(g, C + D.dx * (D.rad - 5), C + D.dz * (D.rad - 5), { until: D.t1, flat: false, ok: free });
  const B = open(g, A.x - D.dz * 3, A.z + D.dx * 3, { until: D.t1, flat: false, ok: (T) => free(T) && Math.hypot(T.x - A.x, T.z - A.z) > 2.4 && Math.abs(room2(T) - room2(A)) < 1 });
  at(g, D.t0 - 5);
  put(g, 0, C, C);
  g.dv.setUint8(rec(0) + L.P_FL, L.PF_LIVE | L.PF_DEAD);
  put(g, 1, A.x, A.z);
  put(g, 2, B.x, B.z);
  const fell = [0, 0];
  for (let k = 0; k < 3000 && g.v.party().state === L.H_PLAY; k++) {
    g.step();
    for (const q of [1, 2]) if (!fell[q - 1] && g.v.partier(q).falling) fell[q - 1] = g.v.tick;
  }
  assert.ok(fell[0] && fell[1], `washed off on ticks ${fell}`);
  for (const q of [1, 2]) assert.equal(g.v.partier(q).m >>> 12 & 15, MC.ND_HIT_WAVE, `P${q + 1} hit by the wave`);
  assert.equal(g.v.party().state, L.H_OVER);
  assert.equal(g.v.party().winner, 255, 'shared');
  assert.deepEqual([1, 2].map((q) => g.v.partier(q).place), [1, 1]);
});

test('the prediction matches the confirmed ball bit for bit through every disaster: a flood\'s current and breath, meteors, a tornado\'s pull and fling, a quake\'s shoves and fissures, a tsunami\'s waves and a lee, bolts, the walls and roofs, the crumbling rim, and a real round', async () => {
  // one ball a room (a ball alone plays till it falls): nobody to bump it, which the prediction leaves to the confirmed world
  const word = (k, yaw, move = 1, hop = 0) => partyWord({ yaw: yaw & 16383, move, hop });
  const check = (g, words) => { const n = predicted(g, words); assert.ok(n >= words.length, `${n} compared of ${words.length}`); };
  // a flood: wading about in it, under long enough to count its breath, swept outward
  {
    const { g, D } = await roomWith(MC.ND_FLOOD, 1);
    const P = open(g, C, C, { until: D.t1, h: 0 });
    at(g, D.t0 + MC.ND_FRISE - 40);
    put(g, 0, P.x, P.z);
    check(g, Array.from({ length: 190 }, (_, k) => word(k, k * 97, (k >> 5) & 1)));
    assert.ok((g.v.partier(0).m & 0xfff) > 0, 'under');
  }
  // meteors: rolling about under the rings as they land
  {
    const { g, D } = await roomWith(MC.ND_METEOR, 1);
    const s = stage(g.v);
    const e = strikeIn(s, D, 2);
    at(g, s.et[e] - 60);
    put(g, 0, s.ex[e] + 3, s.ez[e]);
    const seen = g.v.fxCount();
    check(g, Array.from({ length: 200 }, (_, k) => word(k, 8192, k > 40 && k < 58 ? 1 : 0)));
    assert.ok(fxs(g.v, MC.ND_FX_HIT, seen).length >= 1, 'hit');
  }
  // a tornado: drawn in, lifted, flung
  {
    const { g, D } = await roomWith(MC.ND_TORNADO, 1, { want: (E, s) => openFunnel(s, E, E.t0 + MC.ND_TRAMP) > 0 });
    const t = openFunnel(stage(g.v), D, D.t0 + MC.ND_TRAMP);
    at(g, t);
    const [fx, fz] = funnelAt(D, t);
    put(g, 0, fx + 4, fz);
    const seen = g.v.fxCount();
    check(g, Array.from({ length: 320 }, (_, k) => word(k, 4096 + k * 40, k > 290 ? 1 : 0)));
    assert.ok(fxs(g.v, MC.ND_FX_HIT, seen).some((x) => x.shot === MC.ND_HIT_TORNADO), 'flung');
  }
  // a quake: its shoves, then over a fissure as it opens
  {
    const { g, D } = await roomWith(MC.ND_QUAKE, 1, { want: (E) => E.j <= 2 });
    const P = open(g, C, C, { until: D.t1, flat: false });
    at(g, D.t0 + MC.ND_Q0 - 10);
    put(g, 0, P.x, P.z);
    check(g, Array.from({ length: 300 }, (_, k) => word(k, k * 211, (k >> 4) & 1, k === 150 ? 1 : 0)));
    const F = D.fis[0];
    at(g, F.open - 30);
    put(g, 0, F.x, F.z, { y: surfaceAt(g.v, stage(g.v), F.x, F.z, F.open - 30)[0] });
    check(g, Array.from({ length: 60 }, () => word(0, 0, 0)));
    assert.ok(!g.v.partier(0).ground || g.v.partier(0).falling, 'through the fissure');
  }
  // a tsunami: caught in the open, then sheltering in a lee
  {
    const { g, D } = await roomWith(MC.ND_TSUNAMI, 1, { want: (E, s) => s.obs.some((O) => O.kind === MC.ND_HOUSE && O.drop > E.t1) });
    const s = stage(g.v);
    const P = open(g, C, C, { until: D.t1, flat: false });
    const ta = D.t0 + Math.ceil((alongAcross(s, D, P.x, P.z)[0] - D.a0) / (D.c * TICK));
    at(g, ta - 30);
    put(g, 0, P.x, P.z);
    const seen = g.v.fxCount();
    check(g, Array.from({ length: 140 }, (_, k) => word(k, 2000, k & 1)));
    assert.ok(fxs(g.v, MC.ND_FX_HIT, seen).some((x) => x.shot === MC.ND_HIT_WAVE), 'hit by it');
    const O = s.obs.find((X) => X.kind === MC.ND_HOUSE && X.drop > D.t1);
    const [oa, ob] = alongAcross(s, D, O.x, O.z);
    const al = oa + O.hx * Math.abs(D.dx) + O.hz * Math.abs(D.dz) + 1.6;
    const lx = C + D.dx * al - D.dz * ob, lz = C + D.dz * al + D.dx * ob;
    at(g, D.t0 + D.gap + Math.ceil((al - D.a0) / (D.c * TICK)) - 30);
    put(g, 0, lx, lz);
    check(g, Array.from({ length: 120 }, () => word(0, 0, 0)));
  }
  // bolts: on the spots as they strike
  {
    const { g, D } = await roomWith(MC.ND_LIGHTNING, 1);
    const s = stage(g.v);
    const e = strikeIn(s, D, 1);
    at(g, s.et[e] - 20);
    put(g, 0, s.ex[e] + 0.5, s.ez[e]);
    const seen = g.v.fxCount();
    check(g, Array.from({ length: 120 }, (_, k) => word(k, 12000, k > 60 ? 1 : 0)));
    assert.ok(fxs(g.v, MC.ND_FX_HIT, seen).some((x) => x.shot === MC.ND_HIT_BOLT), 'struck');
  }
  // the walls and roofs: into a house, then up its crate onto the roof
  {
    const g = await room(1, { seed: 7 });
    at(g, 60);
    const s = stage(g.v, true);
    const O = s.obs.find((X) => X.kind === MC.ND_HOUSE), cr = s.obs[O.k + 1];
    const ax = Math.abs(O.x - cr.x) > Math.abs(O.z - cr.z);
    const ux = ax ? Math.sign(O.x - cr.x) : 0, uz = ax ? 0 : Math.sign(O.z - cr.z);
    const yaw = Math.round(Math.atan2(uz, ux) / (2 * Math.PI) * 16384);
    put(g, 0, cr.x - ux * 3, cr.z - uz * 3);
    check(g, Array.from({ length: 260 }, (_, k) => word(k, yaw + (k > 230 ? 8192 : 0), 1, k >= 14 ? 1 : 0)));
  }
  // the rim crumbling under it
  {
    const g = await room(1, { seed: 24 });
    const s = stage(g.v, true);
    const T = s.cells.filter((X) => X.drop !== MC.ND_NEVER && X.h === 0).sort((a, b) => a.drop - b.drop)[8];
    at(g, T.drop - 40);
    put(g, 0, T.x, T.z);
    check(g, Array.from({ length: 110 }, (_, k) => word(k, k * 120, (k >> 3) & 1)));
  }
  // a real round, the AI ball steering (a chunk at a time, from the world as the chunk begins) while it can't be going out
  {
    const g = await room(1, { seed: 25 });
    const s = stage(g.v, true);
    at(g, s.dis[0].call - 50);
    const bot = new Partier(0, 25, 1);
    let chunks = 0;
    const seen = g.v.fxCount();
    for (let k = 0; k < 120; k++) {
      const b = g.v.partier(0);
      if (b.out || b.falling || g.v.hole().state !== L.H_PLAY) break;
      const words = Array.from({ length: 30 }, (_, i) => bot.think(g.v, g.v.tick + i, i));
      check(g, words);
      chunks++;
    }
    assert.ok(chunks >= 60, `${chunks} chunks, through ${fxs(g.v, MC.ND_FX_CALL, seen).length} calls`);
  }
});

// A round of AI balls (client/party-bot.mjs, this minigame's brain), as
// tools/genparty.mjs plays them: { log, sim, stats }.
async function aiRound({ bytes, seed, balls, ticks }) {
  const stats = { start: -1, over: -1, outs: [], places: null, pts: null, winner: -1, calls: 0, hits: [0, 0, 0, 0, 0, 0], dis: null };
  let seen = 0;
  const { log, sim } = await playParty({ bytes, seed, mg: L.MG_DISASTER, bots: balls, ticks, delay: 6, onTick: (t, s, v) => {
    if (s.error().code) return;
    const g = v.party();
    if (stats.start < 0 && g.state === L.H_PLAY) { stats.start = t; stats.dis = stage(v, true).dis; }
    for (; seen < v.fxCount(); seen++) {
      const x = v.fx(seen);
      if (stats.start < 0 || stats.over >= 0) continue;
      if (x.kind === MC.ND_FX_CALL) stats.calls++;
      if (x.kind === MC.ND_FX_HIT) stats.hits[x.shot]++;
      if (x.kind === L.FX_SINK) stats.outs.push((x.tick - g.start) | 0);
    }
    if (stats.over < 0 && stats.start >= 0 && g.state === L.H_OVER) {
      stats.over = t;
      stats.winner = g.winner;
      stats.places = Array.from({ length: balls }, (_, p) => v.partier(p).place);
      stats.pts = Array.from({ length: balls }, (_, p) => v.partier(p).pts);
    }
  } });
  return { log, sim, stats };
}

for (const [balls, ticks] of [[8, 16500], [64, 16500]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, none out before the first disaster and few in it, most taken by the disasters and the crumbling rim; a winner, a shared win or the clock; equal on 1 and 4 threads`, async () => {
    const { log, sim, stats } = await aiRound({ bytes: partyBytes(true), seed: balls + 5, balls, ticks });
    assert.equal(sim.error().code, 0);
    assert.ok(stats.over > 0, 'the round ended');
    const len = stats.over - stats.start;
    assert.ok(len > 30 / TICK && len <= MC.ND_LMAX + 1, `${(len * TICK).toFixed(1)} s of play`);
    const D0 = stats.dis[0];
    assert.equal(stats.outs.filter((t) => t < D0.t0).length, 0, 'none out before the first hits');
    const first = stats.outs.filter((t) => t < D0.t1).length;
    assert.ok(first <= balls / 4, `${first} of ${balls} out in the first, a ${NAMES[D0.kind]}`);
    assert.equal(stats.calls, stats.dis.reduce((n, D) => n + [D.call, D.t0, D.t1].filter((t) => t <= len).length, 0), 'every call');
    assert.ok(stats.hits.reduce((a, b) => a + b, 0) > 0, `hits ${stats.hits}`);
    assert.ok(stats.places.every((x) => x >= 1 && x <= balls), `places ${stats.places}`);
    assert.ok(stats.pts.every((x) => x >= 1 && x <= 10), `points ${stats.pts}`);
    assert.ok(stats.places.includes(1) && stats.pts.includes(10), 'somebody won');
    if (balls > 8) assert.ok(stats.outs.length >= balls / 2, `${stats.outs.length} of ${balls} out`);
    const v = new View(sim.memory.buffer);
    assert.equal(v.party().game, L.MG_DISASTER);
    const parsed = parseLog(log);
    const n = stats.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('the client module: draws the countdown and every disaster, frames the island as it stands, writes its HUD lines, banners and feed lines; its brain sees what a player does: the sea, a meteor\'s ring, a funnel, a fissure, a lee, and goes for high ground, a lee, away', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const g = await room(3, { play: false, seed: 41 });
  const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null };
  const lines = [];
  const hctx = { put: (x, y, s, c) => lines.push([y, s, c]), centre: (y, s, c) => lines.push([y, s, c]), right: (y, s, c) => lines.push([y, s, c]), rows: 44, C: {}, slot: 0, now: 0 };
  const clear = () => { out.scene.clear(); for (const k of ['decals', 'glow', 'solid', 'casters', 'beams']) out[k].length = 0; lines.length = 0; };
  const finite = () => {
    for (let k = 0; k < out.scene.count * 16; k++) assert.ok(Number.isFinite(out.scene.data[k]), 'finite');
    for (const x of [...out.solid, ...out.glow]) assert.ok(x.pos.every(Number.isFinite) && Number.isFinite(x.size));
    for (const x of out.decals) assert.ok(x.pos.every(Number.isFinite) && Number.isFinite(x.radius));
    for (const x of out.beams) assert.ok([...x.a, ...x.b].every(Number.isFinite));
  };
  disaster.draw(g.v, { tick: g.v.tick, dt: 0, now: 0, slot: 0 }, out);
  const s = stage(g.v, true);
  assert.ok(out.scene.count >= s.cells.length + s.obs.length + 2, 'every cell, house, crate and rock, and the column');
  finite();
  while (g.v.hole().state !== L.H_PLAY) g.step();
  const P = open(g, C, C, { until: MC.ND_LMAX, flat: false });
  // a moment of each: as it's called, and in the thick of it
  for (const D of s.dis) {
    for (const t of [D.call + 50, D.t0 + 700]) {
      at(g, t);
      for (let k = 0; k < 4; k++) { put(g, 0, P.x, P.z); put(g, 1, P.x + 3, P.z); put(g, 2, P.x, P.z + 3); g.step(); }
      assert.equal(g.v.hole().state, L.H_PLAY);
      clear();
      const tick = g.v.tick;
      disaster.draw(g.v, { tick, dt: 0, ptick: tick + 3.5, now: t * 8, slot: 0, cam: [C, PLAT_Y + 10, C - 20] }, out);
      finite();
      const standing = s.cells.filter((T) => T.drop > tp(g) + 3).length;
      assert.ok(out.scene.count > standing && out.scene.count <= 24000, `${out.scene.count} solids, ${standing} cells standing`);
      if (t > D.t0 && D.kind === MC.ND_TORNADO) assert.ok(out.casters.length >= 1, 'the funnel casts');
      disaster.hud(g.v, { ...hctx, me: g.v.partier(0) });
      const text = lines.map((l) => l[1]).join(' | ');
      assert.ok(text.includes(NAMES[D.kind]), text);
      for (const l of lines) assert.ok(l[1].length <= 70 && /^[ -_]*$/.test(l[1]), l[1]);
      const fr = disaster.frame(g.v);
      assert.equal(fr.shape, 'disc');
      assert.ok(Math.abs(fr.radius - (rimAt(s, tp(g)) + S * 0.7)) < 1e-3);
    }
  }
  assert.ok(disaster.hint.length <= 70 && disaster.rules.length <= 70 && /^[ -_]*$/.test(disaster.name + disaster.hint + disaster.rules));
  // its FX: the calls' banners, the feed's, a strike's flash, your own hit
  const said = [];
  const fctx = { slot: 0, now: 0, dist: 10, glow: (x) => said.push(['glow', x.size]), banner: (t) => said.push(['banner', t]), feed: (t) => said.push(['feed', t]), sound: {} };
  const fx = (kind, shot, owner = 255, size = 1) => disaster.fx({ kind, shot, owner, size, pos: [C, PLAT_Y, C], tick: 0 }, fctx);
  fx(MC.ND_FX_CALL, MC.ND_TSUNAMI);
  fx(MC.ND_FX_CALL, MC.ND_TSUNAMI | 0x100);
  fx(MC.ND_FX_CALL, MC.ND_TSUNAMI | 0x200);
  fx(MC.ND_FX_STRIKE, 3, 255, MC.ND_MR0);
  fx(MC.ND_FX_HIT, MC.ND_HIT_TORNADO, 0, 12);
  fx(MC.ND_FX_QUAKE, 0x100);
  assert.deepEqual(said.filter((x) => x[0] !== 'glow'), [['banner', 'TSUNAMI COMING!'], ['banner', 'TSUNAMI!'], ['feed', 'SURVIVED THE TSUNAMI'], ['banner', 'CAUGHT IN THE TORNADO!']]);
  assert.ok(said.filter((x) => x[0] === 'glow').length >= 3);
  // the feed: what took a ball, from its PG_M's last hit or the disaster on
  const st = g.v.party().start, pm = rec(1) + L.PG_M, nm = (p) => `P${p + 1}`;
  const D = s.dis.find((E) => E.kind !== MC.ND_QUAKE);
  const sink = { kind: L.FX_SINK, owner: 1, shot: 255, tick: (st + D.t0 + 300) >>> 0, pos: [C, PLAT_Y, C] };
  g.dv.setUint32(pm, (MC.ND_HIT_METEOR << 12) | ((D.t0 + 200) << 16), true);
  assert.equal(disaster.sink(sink, nm, g.v), 'P2 HIT BY A METEOR');
  g.dv.setUint32(pm, (MC.ND_HIT_DROWN << 12) | ((D.t0 + 299) << 16), true);
  assert.equal(disaster.sink(sink, nm, g.v), 'P2 DROWNED');
  g.dv.setUint32(pm, 0, true);
  assert.ok(disaster.sink(sink, nm, g.v).startsWith('P2 '), 'the disaster on');
  assert.equal(disaster.sink({ ...sink, shot: 0 }, nm, g.v), null, 'knocked off by a ball: the usual');
  assert.equal(disaster.sink({ ...sink, tick: (st + 10) >>> 0 }, nm, g.v), null, 'before any: the usual');
  // the AI ball's sense of it: the sea is death, a meteor's ring about to land and a funnel's core near it, a
  // fissure glowing, a tsunami's open ground but not a lee; it goes for high ground out of a flood, a lee from a
  // tsunami, away from a funnel
  const T0 = (g) => g.v.tick;
  const dz = (g, x, z, dt = 0) => disaster.brain.danger(g.v, x, z, T0(g) + dt, 0);
  // the sea
  {
    const g = await room(1, { seed: 3 });
    at(g, 100);
    g.step();
    assert.equal(dz(g, C + 200, C), 1, 'off the island');
    const P = open(g, C, C, { until: MC.ND_LMAX, flat: false });
    assert.ok(dz(g, P.x, P.z) < 0.3, 'its middle in a calm');
  }
  // a meteor ring about to land, showing
  {
    const { g, D } = await roomWith(MC.ND_METEOR, 1);
    const s = stage(g.v);
    const e = strikeIn(s, D);
    at(g, s.et[e] - 20);
    g.step();
    assert.ok(dz(g, s.ex[e], s.ez[e], 18) >= 0.95, 'under it as it lands');
    const near = [...Array(D.e1 - D.e0).keys()].map((i) => D.e0 + i).filter((k) => Math.abs(s.et[k] - s.et[e]) < 40);
    const Q = open(g, s.ex[e], s.ez[e], { until: D.t1, flat: false, ok: (T) => near.every((k) => Math.hypot(T.x - s.ex[k], T.z - s.ez[k]) > s.er[k] + 4) });
    assert.ok(dz(g, Q.x, Q.z, 18) < 0.5, 'well clear');
    // not yet showing: the AI doesn't know of it
    at(g, s.et[e] - MC.ND_MWARN - 30);
    g.step();
    const d0 = dz(g, s.ex[e], s.ez[e], 30 + MC.ND_MWARN - 2);
    const others = [...Array(D.e1 - D.e0).keys()].some((i) => D.e0 + i !== e && Math.hypot(s.ex[D.e0 + i] - s.ex[e], s.ez[D.e0 + i] - s.ez[e]) < 8);
    if (!others) assert.ok(d0 < 0.6, `unseen: ${d0}`);
  }
  // a funnel
  {
    const { g, D } = await roomWith(MC.ND_TORNADO, 1, { want: (E, s) => openFunnel(s, E, E.t0 + MC.ND_TRAMP) > 0 });
    const s = stage(g.v);
    const t = openFunnel(s, D, D.t0 + MC.ND_TRAMP);
    at(g, t);
    g.step();
    const [fx, fz] = funnelAt(D, tp(g));
    assert.ok(dz(g, fx + 1, fz) >= 0.9, 'its core');
    const P = open(g, C, C, { until: D.t1, flat: false });
    put(g, 0, fx + 5, fz);
    const goal = disaster.brain.goal(g.v, 0, { mem: {}, pos: [fx + 5, fz], vel: [0, 0] });
    assert.ok(Math.hypot(goal[0] - fx, goal[1] - fz) > 6, `away from it: ${goal}`);
    void P;
  }
  // a flood: a refuge whose top stands out of the water
  {
    const { g, D } = await roomWith(MC.ND_FLOOD, 1);
    const s = stage(g.v);
    at(g, D.call + 10);
    g.step();
    const P = open(g, C, C, { until: D.t1, flat: false });
    put(g, 0, P.x, P.z);
    const bot = { mem: {}, pos: [P.x, P.z], vel: [0, 0] };
    const goal = disaster.brain.goal(g.v, 0, bot);
    const top = surfaceAt(g.v, s, goal[0], goal[1], D.t1 - 1)[0];
    assert.ok(top >= PLAT_Y + D.depth - MC.ND_FSUB, `a refuge ${top - PLAT_Y} m up from a ${D.depth} m flood`);
  }
  // a tsunami: the lee is safe, the open isn't; it heads for a lee
  {
    const { g, D } = await roomWith(MC.ND_TSUNAMI, 1, { want: (E, s) => s.obs.some((O) => O.kind === MC.ND_HOUSE && O.drop > E.t1) });
    const s = stage(g.v);
    at(g, D.call + 10);
    g.step();
    const O = s.obs.find((X) => X.kind === MC.ND_HOUSE && X.drop > D.t1);
    const [oa, ob] = alongAcross(s, D, O.x, O.z);
    const al = oa + O.hx * Math.abs(D.dx) + O.hz * Math.abs(D.dz) + 1.6;
    const lx = C + D.dx * al - D.dz * ob, lz = C + D.dz * al + D.dx * ob;
    const edge0 = C + D.dx * (D.rad - 3), edge1 = C + D.dz * (D.rad - 3);
    assert.ok(dz(g, lx, lz, 300) < dz(g, edge0, edge1, 300), 'the lee over the open downstream');
    const P = open(g, C, C, { until: D.t1, flat: false });
    const goal = disaster.brain.goal(g.v, 0, { mem: {}, pos: [P.x, P.z], vel: [0, 0] });
    assert.ok(inLee(s, D, D.t0 + 10, goal[0], goal[1]) || alongAcross(s, D, goal[0], goal[1])[0] < 0, `a lee or upstream: ${goal}`);
  }
  // a quake: its fissures glowing, then open
  {
    const { g, D } = await roomWith(MC.ND_QUAKE, 1);
    const F = D.fis[0];
    at(g, F.open - MC.ND_QWARN + 10);
    g.step();
    assert.ok(dz(g, F.x, F.z) >= 0.7 && onFissure(F, F.x, F.z, 0.1), 'glowing');
    at(g, F.open + 20);
    g.step();
    assert.ok(dz(g, F.x, F.z) >= 0.95, 'open');
  }
});

test('a tick of 256 balls in each disaster, the first of its round, on the release build', async (t) => {
  const per = [];
  for (let kind = 0; kind < MC.ND_KINDS; kind++) {
    const { g, D } = await roomWith(kind, 256, { want: (E) => E.j === 0, debug: false });
    const words = (k) => Array.from({ length: 256 }, (_, p) => [L.EV_INPUT, p, partyWord({ yaw: (p * 997 + k * 13) & 16383, move: (p + (k >> 6)) & 1 })]);
    at(g, D.t0 + 200);
    for (let k = 0; k < 50; k++) g.step(words(k));
    const n = 600;
    let ms = 0;
    for (let k = 0; k < n; k++) {
      const recs = k % 64 ? [] : words(k);
      const a = performance.now();
      g.step(recs);
      ms += performance.now() - a;
    }
    per.push([NAMES[kind], ms / n, g.v.party().left]);
  }
  t.diagnostic(per.map(([k, ms, left]) => `${k} ${ms.toFixed(3)} ms (${left} left)`).join(', '));
  for (const [, ms] of per) assert.ok(ms < 5, `${ms.toFixed(3)} ms a tick`);
});
