// STOMPIN GROUND (src/mg/stomp.wat): the disc of flagstones for the crowd,
// the round's stompers as setup lays them, the crumbling rim, a charge on its
// arc (head on, glancing, out of reach, past a ball going out), a leap's slam,
// its standing body and its shockwave (hopped or not), the calls, a shared
// win, the prediction through all of it, rounds of AI balls, the client
// module and a tick's cost at 256 balls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/stomp.mjs'; // SG_*: the minigame's own constants
import stomp, { rimAt, cellOf, cellAt, dropOf, holds, stage, span, chargeAt, chargeEta, frontAt, waveAt, isLeap, hopWindow } from '../client/mg/stomp.mjs';

const C = L.B_CX;
const S = MC.SG_S;
const TICK = 0.008;
const TURN = (2 * Math.PI) / 2 ** 24;
const f = Math.fround;
const LO0 = L.PG_BIG + MC.SG_LO, HI0 = L.PG_BIG + MC.SG_HI, REC0 = L.PG_BIG + MC.SG_RECS;

// A room of n balls on Stompin' Ground, on the debug build (a NaN traps),
// stepped into play unless asked not to; quiet: no stompers (every bucket
// empty), so a test lays its own.
async function room(n = 2, { play = true, seed = 7, quiet = false, debug = true } = {}) {
  const sim = await newParty(debug);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_STOMP + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  if (quiet) for (let b = 0; b < MC.SG_NB; b++) { dv.setUint16(LO0 + 2 * b, 0, true); dv.setUint16(HI0 + 2 * b, 0, true); }
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// Ball p at (x, z) on the floor (or y), rolling at (vx, vz).
function put(g, p, x, z, { y = PLAT_Y, vx = 0, vz = 0, ground = true } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE | (ground ? L.PF_GROUND : 0));
}
// Every bucket scans record k too, and the client reads the schedule again.
function scan(g, k) {
  for (let b = 0; b < MC.SG_NB; b++) g.dv.setUint16(HI0 + 2 * b, Math.max(k + 1, g.dv.getUint16(HI0 + 2 * b, true)), true);
  stage(g.v, true);
}
// A charge in record k setting off from (x, z) heading yaw (radians) at v,
// tf ticks into play, round a circle of radius ra on its left (turn 1) or
// right (-1), for dur ticks; its fields as $sg_charge writes them.
function layCharge(g, k, { x, z, yaw = 0, tf, v = 12, rs = 2, ra = 1000, turn = -1, dur = 400 }) {
  const a = REC0 + k * MC.SG_REC, dv = g.dv;
  const ox = x - turn * ra * Math.sin(yaw), oz = z + turn * ra * Math.cos(yaw);
  const a0 = Math.round(Math.atan2(z - oz, x - ox) / TURN) | 0;
  const w = turn * Math.round(f(f(f(v) * f(0.008)) / f(ra)) * MC.SG_TURN);
  dv.setUint32(a, tf, true); dv.setUint32(a + 4, tf + dur, true);
  dv.setFloat32(a + 8, ox, true); dv.setFloat32(a + 12, oz, true);
  dv.setFloat32(a + 16, ra, true); dv.setFloat32(a + 20, rs, true);
  dv.setInt32(a + 24, a0, true); dv.setInt32(a + 28, w, true); dv.setFloat32(a + 32, v, true);
  dv.setUint32(a + 44, 1, true); dv.setUint8(a + 48, 2); dv.setUint16(a + 50, k, true);
  scan(g, k);
  return { tf, te: tf + dur };
}
// A leap in record k landing at (x, z) tf ticks into play; its fields as $sg_leap writes them.
function layLeap(g, k, { x, z, tf, rs = 2, rw = MC.SG_RW }) {
  const a = REC0 + k * MC.SG_REC, dv = g.dv;
  const te = tf + Math.max(MC.SG_STAY, Math.ceil(f(f(f(rw) - f(rs)) / f(MC.SG_VW * 0.008))) + 1);
  dv.setUint32(a, tf, true); dv.setUint32(a + 4, te, true);
  dv.setFloat32(a + 8, x, true); dv.setFloat32(a + 12, z, true);
  dv.setFloat32(a + 16, 0, true); dv.setFloat32(a + 20, rs, true);
  dv.setFloat32(a + 36, x - 40, true); dv.setFloat32(a + 40, z, true);
  dv.setUint32(a + 44, 1, true); dv.setUint8(a + 48, 3); dv.setUint16(a + 50, k, true); dv.setFloat32(a + 52, rw, true);
  scan(g, k);
  return { tf, te };
}
// The next step plays tick t into play (the clock moved; the round's end with it).
function at(g, t) {
  const now = g.v.tick;
  g.dv.setUint32(L.HDR_START, now - t, true);
  g.dv.setUint32(L.HDR_UNTIL, now - t + MC.SG_LEN, true);
}
// The first tick from t0 (every 25) at which no charge out comes within 6 m
// of ball 0 in the next 1.5 s: somewhere to move the clock to and hand the
// ball to an AI without a stomper already on it.
function quietFrom(g, t0) {
  const s = stage(g.v, true), b = g.v.partier(0);
  for (let t = t0; ; t += 25) {
    const [k0, k1] = span(s, t, t + 190);
    let clear = true;
    for (let k = k0; k < k1 && clear; k++) {
      if (isLeap(s, k)) { if (s.tf[k] >= t && s.tf[k] < t + 190 && Math.hypot(s.ox[k] - b.pos[0], s.oz[k] - b.pos[2]) < 6) clear = false; continue; }
      for (let u = Math.max(t, s.tf[k]); u < Math.min(t + 190, s.te[k]) && clear; u += 5) {
        const p = chargeAt(s, k, u, {});
        if (Math.hypot(p.x - b.pos[0], p.z - b.pos[2]) < 6) clear = false;
      }
    }
    if (clear) return t;
  }
}
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
const vel = (v, p) => v.partier(p).vel;
const tp = (g) => g.v.party().t;
// Every flagstone on the disc: [q, r, x, z, a (cell), rho]
function stones(v) {
  const out = [];
  for (let r = -MC.SG_N; r < MC.SG_N; r++) for (let q = -MC.SG_N; q < MC.SG_N; q++) {
    const a = cellOf(q, r);
    if (!dropOf(v, a)) continue;
    const x = C + (q + 0.5) * S, z = C + (r + 0.5) * S;
    out.push([q, r, x, z, a, Math.hypot(x - C, z - C)]);
  }
  return out;
}

test('the stage for 1, 8, 64 and 256: a disc of square flagstones sized for the crowd, each with the tick the rim takes it, every ball on it apart', async () => {
  let last = 0;
  assert.deepEqual([MC.SG_FX_LAND, MC.SG_FX_HIT, MC.SG_FX_LEAP, MC.SG_FX_CALL], [0, 1, 2, 3].map((k) => L.FX_MG + 4 * L.MG_STOMP + k));
  assert.ok(MC.SG_W === 2 * MC.SG_N && MC.SG_N * S >= MC.SG_RMAX + 1 && 2 * MC.SG_W * MC.SG_W <= MC.SG_LO);
  assert.ok(MC.SG_LO + 2 * MC.SG_NB <= MC.SG_HI && MC.SG_HI + 2 * MC.SG_NB <= MC.SG_RECS && MC.SG_RECS + MC.SG_NMAX * MC.SG_REC <= L.PG_BIG_SIZE);
  assert.ok(MC.SG_FELL + 2 * L.NPLAYER <= L.PG_S_SIZE && MC.SG_COUNT + 4 <= L.PG_H_SIZE);
  assert.ok(MC.SG_NB * MC.SG_BUCKET > MC.SG_LEN + MC.SG_TELE, 'the buckets run past the round');
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const rad = Math.min(MC.SG_R0 + MC.SG_RK * Math.sqrt(n), MC.SG_RMAX);
    assert.equal(r.game, L.MG_STOMP);
    assert.ok(Math.abs(r.size - rad) < 1e-4, `${r.size} m for ${n}`);
    assert.ok(r.size > last, 'grows with the crowd');
    last = r.size;
    assert.equal(g.dv.getFloat32(L.PG_H + MC.SG_RAD, true), r.size);
    assert.deepEqual([r.kind, r.len, r.floor, r.idle, r.hop, r.flags & L.PGF_BUMPS], [L.PK_OUT, MC.SG_LEN, PLAT_Y, f(MC.SG_IDLE), f(MC.SG_HOP), L.PGF_BUMPS]);
    const all = stones(g.v);
    assert.equal(g.dv.getUint32(L.PG_H + MC.SG_COUNT, true), all.length);
    const area = (Math.PI * r.size * r.size) / (S * S);
    assert.ok(Math.abs(all.length / area - 1) < 0.08, `${all.length} flagstones in a disc of ${r.size} m, about ${area.toFixed(0)}`);
    for (const [q, rr, x, z, a, rho] of all) {
      const drop = dropOf(g.v, a);
      assert.ok(rho <= r.size + 1e-3, `${q},${rr} on the disc`);
      if (rho <= MC.SG_RMIN - 1e-3) assert.equal(drop, MC.SG_NEVER, 'the core stays');
      else if (rho > MC.SG_RMIN + 1e-3) {
        const want = MC.SG_CRUMBLE + 1 + ((r.size - rho) / (r.size - MC.SG_RMIN)) * MC.SG_SHRINK;
        assert.ok(drop >= want - 1.01 && drop <= want + MC.SG_JIT + 0.01, `${n}: a stone at ${rho.toFixed(2)} m goes at ${drop}, from about ${want.toFixed(0)}`);
      }
      assert.equal(cellAt(x, z, C), a);
    }
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y, 'on the floor');
      assert.ok(b.ground && !b.out);
      assert.ok(dropOf(g.v, cellAt(b.pos[0], b.pos[2], C)) > 0, 'on a flagstone');
      assert.ok(Math.hypot(b.pos[0] - C, b.pos[2] - C) <= r.size * MC.SG_SPAWN + 1e-3, 'on the middle of the disc');
      for (let o = 0; o < p; o++) {
        const c = g.v.partier(o);
        assert.ok(Math.hypot(b.pos[0] - c.pos[0], b.pos[2] - c.pos[2]) >= 2, `${n}: P${p + 1} and P${o + 1} apart`);
      }
    }
  }
});

test('the round\'s stompers: waves SG_FIRST in and every gap closing to SG_GAP1, growing with the radius and the clock; charges on curving arcs from inside the rim to past it, faster by the end; leaps from SG_LEAPFROM, more of them later; the buckets hold every stomper out', async () => {
  for (const n of [1, 64, 256]) {
    const g = await room(n, { play: false, seed: 30 + n });
    const s = stage(g.v, true);
    const rad = s.r0;
    assert.equal(s.ns, g.dv.getUint32(L.PG_H + MC.SG_NS, true));
    assert.ok(s.ns > 120 && s.ns <= MC.SG_NMAX, `${s.ns} stompers`);
    const waves = [];
    for (let k = 0; k < s.ns; k++) {
      if (k) assert.ok(s.tf[k] > s.tf[k - 1], 'in the order they start');
      if (s.fl[k] & 2) waves.push({ k, tf: s.tf[k], n: s.n[k] });
      else assert.equal(s.vol[k], s.vol[k - 1]);
    }
    assert.equal(waves.length, g.dv.getUint32(L.PG_H + MC.SG_NV, true));
    assert.equal(waves[0].tf, MC.SG_FIRST);
    waves.forEach((w, i) => {
      assert.equal(s.vol[w.k], i);
      assert.equal(w.n, Math.min(MC.SG_WMAX, 1 + Math.floor(f(rad / MC.SG_PER)) + Math.floor(w.tf / MC.SG_MORE)), `wave ${i} at ${w.tf}: ${w.n}`);
      if (i + 1 < waves.length) {
        assert.equal(waves[i + 1].k, w.k + w.n);
        assert.equal(waves[i + 1].tf - w.tf, MC.SG_GAP0 - Math.floor(((MC.SG_GAP0 - MC.SG_GAP1) * Math.min(w.tf, MC.SG_RAMP)) / MC.SG_RAMP));
      } else assert.equal(s.ns, w.k + w.n);
      for (let j = 0; j < w.n; j++) assert.equal(s.tf[w.k + j], w.tf + j * MC.SG_STAG);
    });
    // the leaps: none before SG_LEAPFROM, then a share growing with the clock
    const share = (a, b) => { let l = 0, m = 0; for (let k = 0; k < s.ns; k++) if (s.tf[k] >= a && s.tf[k] < b) { m++; if (isLeap(s, k)) l++; } return [l, m]; };
    assert.equal(share(0, MC.SG_LEAPFROM)[0], 0, 'no leaps before 15 s');
    const [l1, m1] = share(MC.SG_LEAPFROM, 6000), [l2, m2] = share(8000, MC.SG_LEN);
    assert.ok(l1 / m1 > 0.12 && l1 / m1 < 0.45 && l2 / m2 > l1 / m1 - 0.05 && l2 / m2 < 0.7, `leaps ${l1}/${m1} then ${l2}/${m2}`);
    let curved = 0, charges = 0;
    for (let k = 0; k < s.ns; k++) {
      const rs = s.rs[k], rim = rimAt(rad, s.tf[k]);
      assert.ok(rs >= MC.SG_RS0 - 1e-5 && rs <= MC.SG_RS1 + 1e-5);
      if (isLeap(s, k)) {
        assert.ok(Math.hypot(s.ox[k] - C, s.oz[k] - C) <= MC.SG_TAIM * rim + 1e-3, 'lands on the disc');
        assert.ok(Math.abs(Math.hypot(s.lx[k] - C, s.lz[k] - C) - (rim + MC.SG_LAUNCH)) < 1e-3, 'from out over the sea');
        assert.equal(s.te[k] - s.tf[k], Math.max(MC.SG_STAY, Math.ceil(f(f(MC.SG_RW - rs) / f(0.088))) + 1));
        continue;
      }
      charges++;
      const v = s.v[k];
      assert.ok(v >= MC.SG_V0 - MC.SG_VJ - 1e-4 && v <= MC.SG_V0 + MC.SG_VUP + MC.SG_VJ + 1e-4, `${v} m/s`);
      assert.ok(s.ra[k] >= Math.min(rim * MC.SG_RA0, rim + 2 * rs) - 1e-3 && s.ra[k] <= rim * (MC.SG_RA0 + MC.SG_RA1) + 2 * rs + 1e-3);
      // its speed along the arc: its turn a tick times the arc's radius
      assert.ok(Math.abs((Math.abs(s.w[k]) * TURN * s.ra[k]) / TICK - v) < 0.01, 'at its own speed');
      const a = chargeAt(s, k, s.tf[k], {}), b = chargeAt(s, k, s.te[k], {});
      let near = Infinity;
      for (let t = s.tf[k]; t <= s.te[k]; t += 2) { const m = chargeAt(s, k, t, {}); near = Math.min(near, Math.hypot(m.x - C, m.z - C)); }
      const ra0 = Math.hypot(a.x - C, a.z - C), rb0 = Math.hypot(b.x - C, b.z - C);
      assert.ok(ra0 <= rim - rs - MC.SG_IN + 1e-3 && ra0 > rim - rs - MC.SG_IN - 0.6, `charge ${k} sets off at ${ra0.toFixed(2)} of ${rim.toFixed(2)}`);
      assert.ok(rb0 >= rim + rs + MC.SG_OUT - 0.05 && rb0 < rim + rs + MC.SG_OUT + 1, `and is gone at ${rb0.toFixed(2)}`);
      assert.ok(near <= MC.SG_AIM * rim + 0.05, `through the middle of the disc: ${near.toFixed(2)} m off it`);
      const turned = Math.abs(Math.atan2(a.hx * b.hz - a.hz * b.hx, a.hx * b.hx + a.hz * b.hz));
      if (turned > 0.5) curved++;
    }
    assert.ok(curved > charges * 0.6, `${curved} of ${charges} charges turn more than 30 degrees across`);
    const late = [], early = [];
    for (let k = 0; k < s.ns; k++) if (!isLeap(s, k)) (s.tf[k] < 3000 ? early : s.tf[k] > 9500 ? late : []).push(s.v[k]);
    const mean = (x) => x.reduce((p, q) => p + q, 0) / x.length;
    assert.ok(mean(late) > mean(early) + 2.5, `faster by the end: ${mean(early).toFixed(1)} to ${mean(late).toFixed(1)} m/s`);
    // the buckets: every stomper out on a tick is in its bucket's span
    for (let t = 0; t < MC.SG_LEN; t += 7) {
      const b = Math.floor(t / MC.SG_BUCKET);
      for (let k = 0; k < s.ns; k++) if (t >= s.tf[k] && t < s.te[k]) assert.ok(k >= s.lo[b] && k < s.hi[b], `stomper ${k} at ${t} in [${s.lo[b]}, ${s.hi[b]})`);
      assert.ok(s.hi[b] - s.lo[b] <= 60, `${s.hi[b] - s.lo[b]} to scan at ${t}`);
    }
  }
});

test('the rim: nothing goes before SG_CRUMBLE, then a flagstone holds through the tick before its own and drops a ball on it; the core never goes', async () => {
  const g = await room(3, { quiet: true });
  const all = stones(g.v);
  const outer = all.filter((T) => T[5] > MC.SG_RMIN + 2).sort((a, b) => b[5] - a[5]);
  const edge = outer[0], mid = outer[Math.floor(outer.length / 2)];
  put(g, 0, edge[2], edge[3]);
  put(g, 1, C + 1, C + 1);
  put(g, 2, mid[2], mid[3]);
  at(g, MC.SG_CRUMBLE - 20);
  const drop = dropOf(g.v, edge[4]);
  assert.ok(drop > MC.SG_CRUMBLE && drop <= MC.SG_CRUMBLE + 1 + MC.SG_JIT + 200);
  while (tp(g) < drop) {
    g.step();
    assert.ok(g.v.partier(0).ground, `held ${tp(g)} ticks in`);
  }
  g.step();
  assert.ok(!g.v.partier(0).ground && !g.v.partier(0).out, 'gone from under it');
  const drop2 = dropOf(g.v, mid[4]);
  assert.ok(drop2 > drop);
  at(g, drop2 - 3);
  for (let k = 0; k < 3; k++) { g.step(); assert.ok(g.v.partier(2).ground); }
  g.step();
  assert.ok(!g.v.partier(2).ground, 'and the next one in at its tick');
  at(g, MC.SG_CRUMBLE + MC.SG_SHRINK + MC.SG_JIT + 100);
  for (let k = 0; k < 20; k++) g.step();
  assert.ok(g.v.partier(1).ground && !g.v.partier(1).out);
  const t = tp(g);
  for (const T of all) assert.equal(holds(g.v, T[4], t), T[5] <= MC.SG_RMIN, `${T[0]},${T[1]} at ${T[5].toFixed(1)} m`);
  assert.ok(Math.abs(rimAt(g.v.party().size, MC.SG_CRUMBLE + MC.SG_SHRINK / 2) - (g.v.party().size + MC.SG_RMIN) / 2) < 1e-6);
});

test('a charge runs its arc as the client draws it, and sends a ball it meets head on flying along its heading and up; a glancing one aside; none out of reach or going out', async () => {
  const g = await room(3, { quiet: true, seed: 3 });
  const t0 = tp(g);
  // P1 dead ahead of a charge heading +x from 20 m out; the others far off its path
  layCharge(g, 0, { x: C - 20, z: C, tf: t0 + 2, v: 12, rs: 2 });
  put(g, 0, C - 8, C);
  put(g, 1, C + 4, C + 12);
  put(g, 2, C + 4, C - 12);
  let seen = g.v.fxCount(), hit = null;
  for (let k = 0; k < 300 && !hit; k++) {
    g.step();
    hit = fxs(g.v, MC.SG_FX_HIT, seen)[0] || null;
    if (!hit) assert.ok(Math.hypot(...vel(g.v, 0)) < 1e-6, 'still till it gets there');
  }
  assert.ok(hit && hit.owner === 0 && hit.shot === 0, 'P1 knocked');
  const s = stage(g.v);
  const c = chargeAt(s, 0, tp(g) - 1, {});
  let b = g.v.partier(0);
  assert.ok(Math.abs(Math.hypot(b.pos[0] - c.x, b.pos[2] - c.z) - 3) < 0.01, `put out of it, touching: ${Math.hypot(b.pos[0] - c.x, b.pos[2] - c.z)}`);
  const want = 12 + MC.SG_KICK + MC.SG_FLING;
  assert.ok(Math.abs(b.vel[0] - want) < 0.5 && Math.abs(b.vel[2]) < 0.5, `flying on at ${b.vel[0].toFixed(2)} m/s, about ${want}`);
  assert.ok(Math.abs(b.vel[1] - (MC.SG_POP0 + MC.SG_POP1)) < 0.3 && !b.ground, 'and up');
  assert.equal(g.dv.getUint32(rec(0) + L.PG_M, true), 1 | ((tp(g) - 1) << 16), 'the hit, by whom and when');
  assert.ok(Math.hypot(...vel(g.v, 1)) < 1e-6 && Math.hypot(...vel(g.v, 2)) < 1e-6, 'the others untouched');
  // on a tighter arc: where the client says it is, the sim meets a ball
  const g1 = await room(2, { quiet: true, seed: 5 });
  const t1 = tp(g1);
  layCharge(g1, 0, { x: C - 14, z: C - 6, yaw: 0.3, tf: t1 + 2, v: 11, rs: 2.4, ra: 22, turn: 1 });
  const s1 = stage(g1.v, true);
  const there = chargeAt(s1, 0, t1 + 2 + 140, {});
  assert.ok(Math.abs(Math.atan2(there.hz, there.hx) - 0.3) > 0.45, 'it has turned');
  put(g1, 0, there.x + there.hx * 3.6, there.z + there.hz * 3.6);
  put(g1, 1, C + 14, C + 14);
  seen = g1.v.fxCount();
  for (let k = 0; k < 220 && !fxs(g1.v, MC.SG_FX_HIT, seen).length; k++) g1.step();
  const h1 = fxs(g1.v, MC.SG_FX_HIT, seen)[0];
  assert.ok(h1, 'met where its arc goes');
  assert.ok(Math.abs((h1.tick - g1.v.party().start) - (t1 + 2 + 140)) <= 12, `on about the tick: ${(h1.tick - g1.v.party().start)} for ${t1 + 142}`);
  // glancing: off its line by most of its reach, aside more than along; a hair out of reach, untouched
  const g2 = await room(3, { quiet: true, seed: 4 });
  const t2 = tp(g2);
  layCharge(g2, 0, { x: C - 20, z: C, tf: t2 + 2, v: 12, rs: 2 });
  const s2 = stage(g2.v, true);
  const passZ = (x) => { let best = null; for (let t = t2 + 2; t < t2 + 400; t++) { const p = chargeAt(s2, 0, t, {}); if (p.x >= x) { best = p.z; break; } } return best; };
  put(g2, 0, C - 8, passZ(C - 8) + 2.85);
  put(g2, 1, C - 2, passZ(C - 2) - 3.08);
  put(g2, 2, C + 4, C - 12);
  seen = g2.v.fxCount();
  let glance = null;
  for (let k = 0; k < 300 && g2.v.partier(0).ground; k++) { g2.step(); glance ??= fxs(g2.v, MC.SG_FX_HIT, seen)[0]; }
  b = g2.v.partier(0);
  assert.ok(glance && glance.owner === 0);
  assert.ok(!b.ground && b.vel[2] > MC.SG_KICK && b.vel[2] > b.vel[0], `aside at ${b.vel[2].toFixed(2)} m/s, along at ${b.vel[0].toFixed(2)}`);
  assert.ok(b.vel[1] < MC.SG_POP0 + MC.SG_POP1 * 0.5, `and less up: ${b.vel[1].toFixed(2)}`);
  for (let k = 0; k < 160; k++) g2.step();
  assert.ok(g2.v.partier(1).ground && Math.hypot(...vel(g2.v, 1)) < 1e-6, 'a hair out of its reach: untouched');
  // a ball going out is past it: one falling, at the stomper, and one on the floor in another's path
  const g3 = await room(3, { quiet: true, seed: 5 });
  const t3 = tp(g3);
  layCharge(g3, 0, { x: C - 20, z: C + 10, tf: t3 - 100, v: 12 });
  layCharge(g3, 1, { x: C - 20, z: C - 10, tf: t3 - 100, v: 12 });
  const now = chargeAt(stage(g3.v, true), 0, t3, {});
  put(g3, 0, now.x + 0.5, now.z, { y: PLAT_Y - 0.4, ground: false });
  g3.dv.setUint8(rec(0) + L.P_FL, L.PF_LIVE | L.PF_FALL);
  put(g3, 1, now.x + 0.5, chargeAt(stage(g3.v), 1, t3, {}).z);
  put(g3, 2, C + 4, C);
  seen = g3.v.fxCount();
  g3.step();
  assert.deepEqual(fxs(g3.v, MC.SG_FX_HIT, seen).map((x) => [x.owner, x.shot]), [[1, 1]]);
  assert.ok(Math.abs(vel(g3.v, 0)[0]) < 1e-6 && vel(g3.v, 1)[0] > 12, 'the falling one untouched');
});

test('a leap\'s slam throws a ball under its ring clear and up, not one past it; then it stands, a body balls are put out of, and leaves', async () => {
  const g = await room(4, { quiet: true, seed: 8 });
  const t0 = tp(g);
  const lp = layLeap(g, 0, { x: C, z: C, tf: t0 + 3, rs: 2 });
  put(g, 0, C + 1.5, C); // under it
  put(g, 1, C, C + 2 + 1 + MC.SG_SLAMR - 0.3); // in its ring, by the edge
  put(g, 2, C - (2 + 1 + MC.SG_SLAMR + 0.3), C); // just past the ring
  put(g, 3, C + 30, C + 30);
  const seen = g.v.fxCount();
  for (let k = 0; k < 3; k++) { g.step(); assert.ok(Math.hypot(...vel(g.v, 0)) < 1e-6, 'nothing before it lands'); }
  g.step();
  assert.equal(tp(g) - 1, lp.tf);
  const hits = fxs(g.v, MC.SG_FX_HIT, seen);
  assert.deepEqual(hits.map((x) => x.owner).sort(), [0, 1], 'the two in its ring');
  const b0 = g.v.partier(0), b1 = g.v.partier(1);
  assert.ok(Math.abs(Math.hypot(b0.pos[0] - C, b0.pos[2] - C) - 3) < 1e-3, 'out of its body');
  assert.ok(Math.abs(b0.vel[0] - MC.SG_SLAMV) < 0.2 && Math.abs(b0.vel[2]) < 0.1 && b0.vel[1] >= MC.SG_SLAMUP - 0.2, `thrown out at ${b0.vel.map((x) => x.toFixed(2))}`);
  assert.ok(Math.abs(b1.vel[2] - MC.SG_SLAMV) < 0.2 && !b1.ground);
  assert.ok(Math.hypot(...vel(g.v, 2)) < 1e-6, 'past the ring: untouched by the slam');
  assert.equal(g.dv.getUint32(rec(0) + L.PG_M, true) & 0xffff, 1);
  // standing: a ball rolled into it is put out of it, back the way it came; after SG_STAY it is gone
  const g2 = await room(2, { quiet: true, seed: 9 });
  const t2 = tp(g2);
  layLeap(g2, 0, { x: C, z: C, tf: t2 - 10, rs: 2 });
  put(g2, 0, C - 3.5, C, { vx: 6 });
  put(g2, 1, C + 30, C + 30);
  let worst = 9;
  for (let k = 0; k < 40; k++) { g2.step(); worst = Math.min(worst, Math.hypot(g2.v.partier(0).pos[0] - C, g2.v.partier(0).pos[2] - C)); }
  assert.ok(worst > 3 - 0.01, `kept out of its body: ${worst.toFixed(3)}`);
  assert.ok(g2.v.partier(0).vel[0] < 0, 'and sent back');
  at(g2, t2 - 10 + MC.SG_STAY + 2);
  put(g2, 0, C - 2.5, C);
  g2.step();
  assert.ok(Math.abs(g2.v.partier(0).pos[0] - (C - 2.5)) < 1e-4, 'gone: nothing where it stood');
});

test('a shockwave knocks a ball on the floor outward as its front passes, less further out; one in the air (hopped in time) clears it; past its reach, none; the AI ball hops it', async () => {
  const g = await room(4, { quiet: true, seed: 10 });
  const t0 = tp(g);
  const lp = layLeap(g, 0, { x: C, z: C, tf: t0 + 3, rs: 2 });
  put(g, 0, C + 8, C);
  put(g, 1, C - 8, C);
  put(g, 2, C, C + MC.SG_RW + 1.5);
  put(g, 3, C, C - 12);
  const reach = (d) => { for (let el = 1; el < 400; el++) { const r1 = f(f(el * f(MC.SG_VW * 0.008)) + 2); if (r1 >= d) return el; } return -1; };
  const e8 = reach(8), e12 = reach(12);
  const seen = g.v.fxCount();
  const hitAt = new Map();
  for (let k = 0; k < 220; k++) {
    const el = tp(g) - lp.tf;
    // P2 hops so its bottom is well up as the front reaches it
    const hop = el === e8 - 22 ? 1 : 0;
    g.step([[L.EV_INPUT, 1, partyWord({ yaw: 0, move: 0, hop })]]);
    for (const x of fxs(g.v, MC.SG_FX_HIT, seen)) if (!hitAt.has(x.owner)) hitAt.set(x.owner, { el: x.tick - g.v.party().start - lp.tf, x });
    if (el === e8) assert.ok(g.v.partier(1).pos[1] > PLAT_Y + MC.SG_HW, 'P2 up as it passes');
  }
  assert.ok(hitAt.has(0) && hitAt.get(0).el === e8, `P1 knocked as the front reaches it: ${hitAt.get(0)?.el} for ${e8}`);
  assert.equal(hitAt.get(0).x.shot, 0x8000, 'by the shockwave');
  assert.ok(!hitAt.has(1), 'P2 cleared it');
  assert.ok(!hitAt.has(2), 'past its reach');
  assert.ok(hitAt.has(3) && hitAt.get(3).el === e12, 'P4 further out, later');
  const k8 = f(MC.SG_KW * (1 - MC.SG_KWF * (8.016 / MC.SG_RW))), k12 = MC.SG_KW * (1 - MC.SG_KWF * (12 / MC.SG_RW));
  assert.ok(Math.abs(hitAt.get(0).x.size - k8) < 0.15 && Math.abs(hitAt.get(3).x.size - k12) < 0.15, `outward ${hitAt.get(0).x.size.toFixed(2)} and ${hitAt.get(3).x.size.toFixed(2)}`);
  assert.ok(g.v.partier(1).ground && Math.abs(g.v.partier(1).pos[0] - (C - 8)) < 0.01, 'P2 down where it was');
  assert.equal(frontAt(stage(g.v), 0, e8) >= 8, true);
  // the AI ball, standing in the shockwave's way, hops it
  const g2 = await room(2, { quiet: true, seed: 11 });
  const t2 = tp(g2);
  layLeap(g2, 0, { x: C, z: C, tf: t2 + 3, rs: 2 });
  put(g2, 0, C + 7, C + 3);
  put(g2, 1, C - 30, C);
  const from = g2.v.fxCount();
  let hopped = -1;
  for (let k = 0; k < 200; k++) {
    const me = g2.v.partier(0);
    const bot = { slot: 0, skill: 1, mem: {}, pos: [me.pos[0], me.pos[2]], vel: [me.vel[0], me.vel[2]], at: g2.v.tick };
    const hop = hopped < 0 && stomp.brain.hop(g2.v, me, bot);
    if (hop) hopped = tp(g2);
    g2.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, move: 0, hop: hop ? 1 : 0 })]]);
  }
  assert.ok(hopped > 0, 'it hops');
  assert.equal(fxs(g2.v, MC.SG_FX_HIT, from).filter((x) => x.owner === 0).length, 0, 'clear over it');
  assert.ok(g2.v.partier(0).ground && Math.hypot(g2.v.partier(0).pos[0] - (C + 7), g2.v.partier(0).pos[2] - (C + 3)) < 0.01, 'and down where it was');
  const [up, down] = hopWindow(f(MC.SG_HOP));
  assert.ok(up < 0.08 && down > 0.65, `a hop is over the wave from ${up.toFixed(3)} to ${down.toFixed(3)} s`);
});

test('the calls: a wave\'s as its paths show, every stomper landing on its tick where it sets off, every leap taking off SG_LEAPT before, and the leaps\' and the rim\'s SG_WARN ahead', async () => {
  const g = await room(3, { seed: 15 });
  const s = stage(g.v, true);
  // the balls kept high over the middle, over every stomper's top, so none of them is knocked
  const keep = () => { for (let p = 0; p < 3; p++) put(g, p, C - 3 + 3 * p, C, { y: PLAT_Y + 20, ground: false }); };
  const seen = g.v.fxCount();
  for (let k = 0; k < MC.SG_FIRST + 300; k++) { keep(); g.step(); }
  const start = g.v.party().start;
  const calls = fxs(g.v, MC.SG_FX_CALL, seen), lands = fxs(g.v, MC.SG_FX_LAND, seen);
  const waves = [];
  for (let k = 0; k < s.ns; k++) if (s.fl[k] & 2 && s.tf[k] - MC.SG_TELE < MC.SG_FIRST + 300) waves.push(k);
  assert.ok(waves.length >= 2);
  assert.equal(calls.length, waves.length);
  calls.forEach((x, i) => {
    assert.equal(x.tick - start, s.tf[waves[i]] - MC.SG_TELE);
    assert.deepEqual([x.shot, x.size, x.owner], [s.vol[waves[i]], s.n[waves[i]], 255]);
  });
  const want = [];
  for (let k = 0; k < s.ns && s.tf[k] < MC.SG_FIRST + 300; k++) want.push(k);
  assert.deepEqual(lands.map((x) => x.shot), want);
  for (const x of lands) {
    const k = x.shot, p = chargeAt(s, k, s.tf[k], {});
    assert.equal(x.tick - start, s.tf[k]);
    assert.ok(Math.hypot(x.pos[0] - p.x, x.pos[2] - p.z) < 0.01 && x.pos[1] === PLAT_Y, 'where it sets off');
    assert.ok(Math.abs(x.size - s.rs[k]) < 1e-5);
  }
  // the leaps, from 15 s
  at(g, MC.SG_LEAPFROM + 50);
  const from = g.v.fxCount();
  for (let k = 0; k < 700; k++) { keep(); g.step(); }
  const t1 = MC.SG_LEAPFROM + 50, t2 = t1 + 700;
  const leaps = [];
  for (let k = 0; k < s.ns; k++) if (isLeap(s, k) && s.tf[k] - MC.SG_LEAPT >= t1 && s.tf[k] < t2) leaps.push(k);
  assert.ok(leaps.length >= 1, 'some leaps');
  const st2 = g.v.party().start;
  const offs = fxs(g.v, MC.SG_FX_LEAP, from), downs = fxs(g.v, MC.SG_FX_LAND, from).filter((x) => isLeap(s, x.shot));
  assert.deepEqual(offs.map((x) => x.shot).filter((k) => leaps.includes(k)), leaps);
  for (const x of offs) assert.ok(((x.tick - st2) | 0) === s.tf[x.shot] - MC.SG_LEAPT && Math.hypot(x.pos[0] - s.lx[x.shot], x.pos[2] - s.lz[x.shot]) < 1e-3);
  for (const k of leaps) {
    const d = downs.find((x) => x.shot === k);
    assert.ok(d && ((d.tick - st2) | 0) === s.tf[k] && Math.hypot(d.pos[0] - s.ox[k], d.pos[2] - s.oz[k]) < 1e-3, `leap ${k} lands on its spot`);
  }
  for (const [t, code] of [[MC.SG_LEAPFROM - MC.SG_WARN, 0x8001], [MC.SG_CRUMBLE - MC.SG_WARN, 0x8002]]) {
    at(g, t - 3);
    const k0 = g.v.fxCount();
    for (let k = 0; k < 6; k++) { keep(); g.step(); }
    const c = fxs(g.v, MC.SG_FX_CALL, k0).filter((x) => x.shot === code);
    assert.equal(c.length, 1);
    assert.equal((c[0].tick - g.v.party().start) | 0, t);
  }
});

test('the last balls on, all off one stomper, share the win though they go over the edge ticks apart; all off at once share it; off two, or one long before, the last on wins', async () => {
  // a real one: a big charge down the disc takes both off the far rim
  const g = await room(3, { quiet: true });
  const r = g.v.party().size, t = tp(g);
  put(g, 0, C, C - 12);
  g.dv.setUint8(rec(0) + L.P_FL, L.PF_LIVE | L.PF_DEAD);
  layCharge(g, 0, { x: C + r - 16, z: C, tf: t + 2, v: 14, rs: 2.6 });
  put(g, 1, C + r - 9, C + 1.8);
  put(g, 2, C + r - 5, C - 1.2);
  const fell = [0, 0];
  for (let k = 0; k < 800 && g.v.party().state === L.H_PLAY; k++) {
    g.step();
    for (const q of [1, 2]) if (!fell[q - 1] && g.v.partier(q).falling) fell[q - 1] = g.v.tick;
  }
  for (const q of [1, 2]) assert.equal(g.dv.getUint32(rec(q) + L.PG_M, true) & 0xffff, 1, `P${q + 1} hit by stomper 0`);
  assert.ok(fell[0] && fell[1] && fell[0] !== fell[1], `fell on ticks ${fell}`);
  assert.equal(g.v.party().state, L.H_OVER);
  assert.equal(g.v.party().winner, 255, 'shared');
  assert.deepEqual([1, 2].map((q) => g.v.partier(q).place), [1, 1]);
  // all off on one tick, nobody's hit
  const g1 = await room(3, { quiet: true });
  const r1 = g1.v.party().size;
  put(g1, 0, C, C);
  g1.dv.setUint8(rec(0) + L.P_FL, L.PF_LIVE | L.PF_DEAD);
  put(g1, 1, C + r1 + 3, C, { y: PLAT_Y - 0.5, ground: false });
  put(g1, 2, C - r1 - 3, C, { y: PLAT_Y - 0.5, ground: false });
  for (let k = 0; k < 100 && g1.v.hole().state === L.H_PLAY; k++) g1.step();
  assert.deepEqual([g1.v.party().state, g1.v.party().winner, g1.v.partier(1).place, g1.v.partier(2).place], [L.H_OVER, 255, 1, 1]);
  // by hand, [stomper, hit tick from now] for each, dropped 40 ticks apart: one stomper; two; one, but long before
  for (const [m1, m2, shared] of [[[5, 0], [5, 30], true], [[5, 0], [6, 0], false], [[5, 0], [5, -MC.SG_SHARE - 80], false]]) {
    const h = await room(2, { quiet: true, seed: 12 });
    at(h, 1000);
    const r2 = h.v.party().size, t2 = 1000;
    const hit = (p, [k, dt]) => h.dv.setUint32(rec(p) + L.PG_M, (k + 1) | ((t2 + dt) << 16), true);
    hit(0, m1); hit(1, m2);
    put(h, 0, C + r2 + 3, C, { y: PLAT_Y - 0.5, ground: false });
    for (let k = 0; k < 40; k++) h.step();
    put(h, 1, C - r2 - 3, C, { y: PLAT_Y - 0.5, ground: false });
    for (let k = 0; k < 400 && h.v.party().state === L.H_PLAY; k++) h.step();
    assert.equal(h.v.party().state, L.H_OVER);
    assert.deepEqual([0, 1].map((q) => h.v.partier(q).place), shared ? [1, 1] : [2, 1], `${m1} ${m2}`);
    assert.equal(h.v.party().winner, shared ? 255 : 1);
  }
});

test('the prediction matches the confirmed ball bit for bit: through a charge head on and glancing, a slam, a shockwave hopped and not, a standing leap, the crumbling rim, and the real waves', async () => {
  // one ball a room (a ball alone plays till it falls): nobody to bump it, which the prediction leaves to the confirmed world
  // A: rolling across two charges' paths, one curving
  const g = await room(1, { quiet: true, seed: 23 });
  const t = tp(g);
  layCharge(g, 0, { x: C - 20, z: C, tf: t + 2, v: 13, rs: 2 });
  layCharge(g, 1, { x: C - 4, z: C - 18, yaw: Math.PI / 2, tf: t + 30, v: 11, rs: 2.6, ra: 26, turn: 1 });
  put(g, 0, C - 6, C - 1.5);
  let seen = g.v.fxCount();
  const roll = Array.from({ length: 220 }, (_, k) => partyWord({ yaw: k < 150 ? 0 : 4096, move: k > 90 ? 1 : 0, hop: k === 190 ? 1 : 0 }));
  assert.ok(predicted(g, roll) >= roll.length);
  assert.ok(fxs(g.v, MC.SG_FX_HIT, seen).length >= 1, 'knocked');
  // B: a slam on it, then rolling into it as it stands
  const gb = await room(1, { quiet: true, seed: 26 });
  const tb = tp(gb);
  layLeap(gb, 0, { x: C - 4, z: C, tf: tb + 4, rs: 2.2 });
  put(gb, 0, C - 2.5, C + 1);
  seen = gb.v.fxCount();
  const sit = Array.from({ length: 200 }, (_, k) => partyWord({ yaw: 8192, move: k > 110 ? 1 : 0 }));
  assert.ok(predicted(gb, sit) >= sit.length);
  assert.ok(fxs(gb.v, MC.SG_FX_HIT, seen).some((x) => x.shot === 0), 'slammed');
  // B2: the shockwaves of three, one hopped, the others not
  const gw = await room(1, { quiet: true, seed: 27 });
  const tw = tp(gw);
  layLeap(gw, 0, { x: C - 7, z: C, tf: tw + 4, rs: 2 });
  layLeap(gw, 1, { x: C + 12, z: C + 1, tf: tw + 90, rs: 2 });
  layLeap(gw, 2, { x: C + 1, z: C - 9, tf: tw + 260, rs: 2.4 });
  put(gw, 0, C, C);
  seen = gw.v.fxCount();
  const hopping = Array.from({ length: 420 }, (_, k) => partyWord({ yaw: (k * 53) & 16383, move: k > 390 ? 1 : 0, hop: k >= 138 && k <= 142 ? 1 : 0 }));
  assert.ok(predicted(gw, hopping) >= hopping.length);
  const wh = fxs(gw.v, MC.SG_FX_HIT, seen).filter((x) => x.shot & 0x8000);
  assert.ok(wh.length >= 2 && !wh.some((x) => x.shot === (1 | 0x8000)), `knocked by the shockwaves of ${wh.map((x) => x.shot & 0xff)}, not the one hopped`);
  // C: on the rim as it crumbles, rolling round it
  const g2 = await room(1, { quiet: true, seed: 24 });
  const edge = stones(g2.v).filter((T) => T[5] > MC.SG_RMIN + 3).sort((a, b) => dropOf(g2.v, a[4]) - dropOf(g2.v, b[4]))[5];
  at(g2, dropOf(g2.v, edge[4]) - 40);
  put(g2, 0, edge[2], edge[3]);
  const round = Array.from({ length: 110 }, (_, k) => partyWord({ yaw: (k * 120) & 16383, move: (k >> 3) & 1 }));
  assert.ok(predicted(g2, round) >= round.length);
  // D: the real waves, leaps among them, the AI ball steering (a chunk at a time, from the world as the chunk
  // begins) while it can't be going out
  const g3 = await room(1, { seed: 25 });
  at(g3, quietFrom(g3, MC.SG_LEAPFROM + 100));
  seen = g3.v.fxCount();
  const bot = new Partier(0, 25, 1);
  let chunks = 0, hops = 0;
  for (let k = 0; k < 40; k++) {
    const b = g3.v.partier(0);
    if (b.out || b.falling || b.pos[1] < PLAT_Y - 0.5 || g3.v.hole().state !== L.H_PLAY) break;
    const words = Array.from({ length: 30 }, (_, i) => bot.think(g3.v, g3.v.tick + i, i));
    hops += words.filter((w) => w & 0x10000000).length;
    assert.ok(predicted(g3, words) >= 30);
    chunks++;
  }
  const landed = fxs(g3.v, MC.SG_FX_LAND, seen);
  assert.ok(chunks >= 16 && landed.length >= 8, `${chunks} chunks, ${landed.length} stompers landed, ${hops} hops`);
});

// A round of AI balls (client/party-bot.mjs, this minigame's brain), as
// tools/genparty.mjs plays them: { log, sim, stats }.
async function aiRound({ bytes, seed, balls, ticks }) {
  const stats = { start: -1, over: -1, outs: [], places: null, pts: null, winner: -1, lands: 0, hits: 0, waves: 0, knocked: 0 };
  const lastHit = new Map();
  let seen = 0;
  const { log, sim } = await playParty({ bytes, seed, mg: L.MG_STOMP, bots: balls, ticks, delay: 6, onTick: (t, s, v) => {
    if (s.error().code) return;
    const g = v.party();
    for (; seen < v.fxCount(); seen++) {
      const x = v.fx(seen);
      if (x.kind === MC.SG_FX_LAND) stats.lands++;
      if (x.kind === MC.SG_FX_HIT) { if (x.shot & 0x8000) stats.waves++; else stats.hits++; lastHit.set(x.owner, x.tick); }
      if (x.kind === L.FX_SINK && stats.start >= 0 && stats.over < 0) {
        stats.outs.push((x.tick - g.start) * TICK);
        if (x.tick - (lastHit.get(x.owner) ?? -1e9) < 400) stats.knocked++;
      }
    }
    if (stats.start < 0 && g.state === L.H_PLAY) stats.start = t;
    if (stats.over < 0 && stats.start >= 0 && g.state === L.H_OVER) {
      stats.over = t;
      stats.winner = g.winner;
      stats.places = Array.from({ length: balls }, (_, p) => v.partier(p).place);
      stats.pts = Array.from({ length: balls }, (_, p) => v.partier(p).pts);
    }
  } });
  return { log, sim, stats };
}

for (const [balls, ticks] of [[8, 14500], [64, 14500]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, none out in the first 15 s, most sent off by the stompers, a winner or the clock; equal on 1 and 4 threads`, async () => {
    const { log, sim, stats } = await aiRound({ bytes: partyBytes(true), seed: balls + 3, balls, ticks });
    assert.equal(sim.error().code, 0);
    assert.ok(stats.over > 0, 'the round ended');
    const secs = (stats.over - stats.start) * TICK;
    assert.ok(secs > 30 && secs <= MC.SG_LEN * TICK + 0.01, `${secs.toFixed(1)} s of play`);
    assert.ok(stats.lands > 100 && stats.hits > balls, `${stats.lands} stompers landed, ${stats.hits} knocks, ${stats.waves} by shockwaves`);
    const early = stats.outs.filter((s) => s < 15).length;
    assert.ok(early <= balls / 8, `${early} of ${balls} out in the first 15 s (${stats.outs.map((s) => s.toFixed(0))})`);
    assert.ok(stats.knocked >= stats.outs.length / 2, `${stats.knocked} of ${stats.outs.length} outs sent off by a stomper`);
    assert.ok(stats.places.every((x) => x >= 1 && x <= balls), `places ${stats.places}`);
    assert.ok(stats.pts.every((x) => x >= 1 && x <= 10), `points ${stats.pts}`);
    assert.ok(stats.places.includes(1) && stats.pts.includes(10), 'somebody won');
    const v = new View(sim.memory.buffer);
    assert.equal(v.party().game, L.MG_STOMP);
    const parsed = parseLog(log);
    const n = stats.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('the client module: draws the countdown and the round, frames the disc, writes its HUD lines and feed lines, and its brain sees what the sim does', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const g = await room(3, { play: false, seed: 41 });
  const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null };
  const lines = [];
  const hctx = { put: (x, y, s, c) => lines.push([y, s, c]), centre: (y, s, c) => lines.push([y, s, c]), right: (y, s, c) => lines.push([y, s, c]), rows: 44, C: {}, slot: 0, now: 0 };
  const clear = () => { out.scene.clear(); out.decals.length = 0; out.glow.length = 0; out.solid.length = 0; out.casters.length = 0; lines.length = 0; };
  const finite = () => { for (let k = 0; k < out.scene.count * 16; k++) assert.ok(Number.isFinite(out.scene.data[k]), 'finite'); };
  stomp.draw(g.v, { tick: g.v.tick, dt: 0, now: 0, slot: 0 }, out);
  assert.equal(out.scene.count, stones(g.v).length + 2, 'every flagstone and the column');
  finite();
  while (g.v.hole().state !== L.H_PLAY) g.step();
  for (const t of [300, 1500, 2600, 4000, 8000, 11000]) {
    at(g, t);
    for (let k = 0; k < 140; k++) { for (let p = 0; p < 3; p++) put(g, p, C - 3 + 3 * p, C); g.step(); }
    assert.equal(g.v.hole().state, L.H_PLAY);
    clear();
    const tick = g.v.tick;
    stomp.draw(g.v, { tick, dt: 0, ptick: tick + 3.5, now: 0, slot: 0, cam: [C, PLAT_Y + 10, C - 20] }, out);
    finite();
    assert.ok(out.scene.count > 2 && out.scene.count <= 24000, `${out.scene.count} solids`);
    const s = stage(g.v);
    const tt = tp(g) + 3.5;
    let live = 0;
    for (let k = 0; k < s.ns; k++) if (!isLeap(s, k) && tt >= s.tf[k] && tt < s.te[k] && Math.hypot(chargeAt(s, k, tt, {}).x - C, chargeAt(s, k, tt, {}).z - C) < rimAt(s.r0, tt)) live++;
    assert.ok(out.casters.length >= live, `${out.casters.length} stompers drawn of ${live} charging`);
    for (const x of [...out.solid, ...out.glow]) assert.ok(x.pos.every(Number.isFinite) && Number.isFinite(x.size));
    for (const x of out.decals) assert.ok(x.pos.every(Number.isFinite) && Number.isFinite(x.radius));
    stomp.hud(g.v, hctx);
    const text = lines.map((l) => l[1]).join(' | ');
    assert.ok(text.includes('WAVE') || text.includes('PATHS'), text);
    for (const l of lines) assert.ok(l[1].length <= 80, l[1]);
    const fr = stomp.frame(g.v);
    assert.equal(fr.shape, 'disc');
    assert.ok(Math.abs(fr.radius - (rimAt(g.v.party().size, tp(g)) + S * 0.7)) < 1e-3);
  }
  assert.ok(stomp.hint.length <= 70 && stomp.rules.length <= 70);
  // danger: 1 off the disc, high on and just ahead of a charge, none well off its path or behind it; high in a leap's ring
  const g2 = await room(2, { quiet: true, seed: 42 });
  const t2 = tp(g2);
  layCharge(g2, 0, { x: C - 20, z: C, tf: t2 - 150, v: 12, rs: 2 });
  layLeap(g2, 1, { x: C + 2, z: C + 14, tf: t2 + 60, rs: 2 });
  g2.step();
  const s2 = stage(g2.v, true);
  const now = chargeAt(s2, 0, tp(g2), {});
  const T = g2.v.tick;
  assert.equal(stomp.brain.danger(g2.v, C + 500, C, T + 10, 0), 1, 'off the disc');
  assert.ok(stomp.brain.danger(g2.v, now.x, now.z, T, 0) >= 0.95, 'on it');
  assert.ok(stomp.brain.danger(g2.v, now.x + 6, now.z + 0.5, T, 0) > 0.4, 'just ahead of it');
  assert.equal(stomp.brain.danger(g2.v, now.x + 6, now.z + 9, T, 0), 0, 'well off its path');
  assert.equal(stomp.brain.danger(g2.v, now.x - 6, now.z, T, 0), 0, 'behind it');
  assert.ok(stomp.brain.danger(g2.v, C + 2.5, C + 14, T + 55, 0) >= 0.9, 'in the ring as it lands');
  const e = chargeEta(s2, 0, now.x + 6, now.z, tp(g2), 3, {});
  assert.ok(e && Math.abs(e.eta - 3 / 12) < 0.05, `its body 3 m off in ${e?.eta.toFixed(3)} s`);
  // the goal: out of its path
  const goal = stomp.brain.goal(g2.v, 0, { skill: 1, mem: {}, pos: [now.x + 8, now.z], vel: [0, 0], at: T });
  assert.ok(Math.abs(goal[1] - now.z) > 3, `out of the path: ${goal}`);
  // the HUD sees it coming at you, and the ring you're in
  lines.length = 0;
  put(g2, 0, now.x + 8, now.z);
  stomp.hud(g2.v, { ...hctx, me: g2.v.partier(0) });
  assert.ok(lines.some((l) => l[1].startsWith('STOMPER')), lines.map((l) => l[1]).join(' | '));
  lines.length = 0;
  put(g2, 0, C + 2.5, C + 14);
  stomp.hud(g2.v, { ...hctx, me: g2.v.partier(0) });
  assert.ok(lines.some((l) => l[1].startsWith('GET OUT OF THE RING')), lines.map((l) => l[1]).join(' | '));
  // the feed: out within a few seconds of a stomper's hit, it says so, a slam's its own way; else the usual
  const pm = rec(1) + L.PG_M, st = g2.v.party().start;
  const sink = { kind: L.FX_SINK, owner: 1, shot: 255, tick: (st + 2000) >>> 0 };
  const nm = (p) => `P${p + 1}`;
  g2.dv.setUint32(pm, 0, true);
  assert.equal(stomp.sink(sink, nm, g2.v), null);
  g2.dv.setUint32(pm, 1 | (1800 << 16), true);
  assert.equal(stomp.sink(sink, nm, g2.v), 'P2 STOMPED');
  g2.dv.setUint32(pm, 2 | (1800 << 16), true);
  assert.equal(stomp.sink(sink, nm, g2.v), 'P2 SLAMMED');
  assert.equal(stomp.sink({ ...sink, shot: 0 }, nm, g2.v), null);
  g2.dv.setUint32(pm, 1 | (1000 << 16), true);
  assert.equal(stomp.sink(sink, nm, g2.v), null);
  // the wave on now
  const wv = waveAt(stage(g.v, true), 0);
  assert.equal(wv.vol, 0);
  assert.ok(span(stage(g.v), 0, 10)[1] >= 0);
});

test('a tick of 256 balls through the busiest stretch of the round, on the release build', async (t) => {
  const g = await room(256, { seed: 77, debug: false });
  at(g, 6500);
  const words = (k) => Array.from({ length: 256 }, (_, p) => [L.EV_INPUT, p, partyWord({ yaw: (p * 997 + k * 13) & 16383, move: (p + (k >> 6)) & 1 })]);
  for (let k = 0; k < 100; k++) g.step(words(k));
  const n = 1500;
  let ms = 0, left = 0;
  for (let k = 0; k < n; k++) {
    const recs = k % 64 ? [] : words(k);
    const a = performance.now();
    g.step(recs);
    ms += performance.now() - a;
  }
  left = g.v.party().left;
  const per = ms / n;
  t.diagnostic(`${per.toFixed(3)} ms a tick, ${left} balls left`);
  assert.ok(per < 5, `${per.toFixed(3)} ms a tick`);
});
