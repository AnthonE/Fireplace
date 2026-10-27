// PARRY BALL (src/mg/parry.wat): the disc and its rim for 1 to 256 balls,
// the orbs launching, homing and hitting, a parry's reach, cone, distance
// and speed, the lock on a click with nothing in reach, a click judged at its
// own tick, the rim closing in, orbs retiring, the prediction bit for bit
// through all of it, the client's flight against the sim's, and rounds of AI
// balls, one at a 100 ms round trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/parry.mjs'; // PY_*: the minigame's own constants
import parry, { sched, rimAt, orbs, clicks, fly, base, reach, victim, sendMin } from '../client/mg/parry.mjs';

const C = L.B_CX;
const f = Math.fround;
const TICK = 0.008;
const size = (n) => Math.min(MC.PY_R0 + MC.PY_RK * Math.sqrt(n), MC.PY_RMAX);
const norbs = (n) => Math.min(MC.PY_NMAX, Math.max(1, Math.ceil(n / MC.PY_PER)));

// A room of n balls on Parry Ball, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_PARRY + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// Ball p at (x, z) on the floor, rolling at (vx, vz).
function put(g, p, x, z, { vx = 0, vz = 0 } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, PLAT_Y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE | L.PF_GROUND);
}
const OB = (k) => L.PG_S + MC.PY_ORB + k * MC.PY_OSIZE;
// Orb k as the sim has it.
const orb = (g, k) => orbs(g.v).find((o) => o.k === k) || null;
// Orb k set: flying (by default) at ball tgt from (x, z) along (dx, dz) at sp, launched (or parried) on tick at into play.
function setOrb(g, k, { st = MC.PY_FLY, tgt = 0, by = 255, at = playT(g), x, z, dx = 1, dz = 0, sp = MC.PY_S0 }) {
  const a = OB(k), dv = g.dv;
  dv.setUint8(a + MC.PY_OST, st);
  dv.setUint8(a + MC.PY_OTGT, tgt);
  dv.setUint8(a + MC.PY_OBY, by);
  dv.setUint8(a + MC.PY_ORALLY, 0);
  dv.setUint32(a + MC.PY_OAT, at, true);
  dv.setFloat32(a + MC.PY_OX, x, true);
  dv.setFloat32(a + MC.PY_OZ, z, true);
  dv.setFloat32(a + MC.PY_ODX, dx, true);
  dv.setFloat32(a + MC.PY_ODZ, dz, true);
  dv.setFloat32(a + MC.PY_OSP, sp, true);
}
const idle = (g) => { for (let k = 0; k < MC.PY_NMAX; k++) g.dv.setUint8(OB(k) + MC.PY_OST, MC.PY_IDLE); };
// The next step plays tick t into play (the clock moved; the round's end with it).
function at(g, t) {
  const now = g.v.tick;
  g.dv.setUint32(L.HDR_START, now - t, true);
  g.dv.setUint32(L.HDR_UNTIL, now - t + MC.PY_LEN, true);
}
const playT = (g) => g.v.party().t; // the tick into play the next step plays
// A ball's clicks: each call a word with its use counter one on.
const clicker = () => { let n = 0; return (yaw = 0, move = 0) => partyWord({ yaw, move, use: ++n & 3 }); };
const still = (yaw = 0) => partyWord({ yaw });
// The FX since count `from`, of a kind.
const fxs = (v, from, kind) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
// A room of n with every orb idle and ball p at (x, z) for each [p, x, z], the rest far off in a row.
async function stage(n, spots, opts) {
  const g = await room(n, opts);
  idle(g);
  const R = sched(g.v).rad;
  for (let p = 0; p < n; p++) put(g, p, C - R * 0.6 + (p % 16) * 2.5, C - R * 0.6 - Math.floor(p / 16) * 2.5);
  for (const [p, x, z] of spots) put(g, p, x, z);
  return g;
}

test('the stage for 1, 8, 64 and 256: a disc sized for the crowd, an orb for every 16 balls on its spot with a ball each, every ball apart', async () => {
  let last = 0;
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const s = sched(g.v);
    assert.equal(r.game, L.MG_PARRY);
    assert.ok(Math.abs(r.size - size(n)) < 1e-4 && r.size > last, `${r.size} m for ${n}`);
    last = r.size;
    assert.deepEqual([r.kind, r.len, r.flags, r.floor, r.hop], [L.PK_OUT, MC.PY_LEN, L.PGF_BUMPS | L.PGF_NOKICK, PLAT_Y, 6]);
    assert.equal(s.rad, r.size);
    assert.ok(Math.abs(s.rfin - Math.min(s.rad, Math.max(MC.PY_RMIN, s.rad * MC.PY_RFIN))) < 1e-4, `closing to ${s.rfin}`);
    const list = orbs(g.v);
    assert.equal(s.norb, norbs(n));
    assert.equal(list.length, norbs(n), `${list.length} orbs for ${n}`);
    assert.deepEqual([norbs(1), norbs(16), norbs(17), norbs(64), norbs(256)], [1, 1, 2, 4, 16]);
    const tgts = new Set(list.map((o) => o.tgt));
    assert.equal(tgts.size, list.length, 'each after its own ball');
    for (const o of list) {
      assert.ok(o.tgt < n, 'a ball in the room');
      assert.deepEqual([o.st, o.at, o.by, o.rally], [MC.PY_WAIT, MC.PY_SERVE, 255, 0]);
      assert.ok(Math.abs(Math.hypot(o.x - C, o.z - C) - s.rad * MC.PY_SPOT * Math.sqrt((o.k + 0.5) / list.length)) < 1e-3, 'on its spot');
    }
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y);
      assert.ok(Math.hypot(b.pos[0] - C, b.pos[2] - C) <= r.size * MC.PY_SPAWN + 1e-3, `P${p + 1} in the middle`);
      for (let q = 0; q < p; q++) {
        const o = g.v.partier(q);
        assert.ok(Math.hypot(b.pos[0] - o.pos[0], b.pos[2] - o.pos[2]) > 2.5, `P${p + 1} and P${q + 1} apart`);
      }
    }
  }
});

test('the orbs wait on their spots till PY_SERVE into play, each told to its ball, then launch straight at it at the round\'s least speed', async () => {
  const g = await room(20, { play: false });
  const from = g.v.fxCount();
  const before = orbs(g.v);
  while (g.v.hole().state !== L.H_PLAY) g.step();
  const serve = fxs(g.v, from, MC.PY_FX_SERVE);
  assert.deepEqual(serve.map((x) => [x.owner, x.shot, x.size]), before.map((o) => [o.tgt, o.k, MC.PY_SERVE]), 'each ball told as play starts');
  while (playT(g) < MC.PY_SERVE) {
    g.step();
    assert.deepEqual(orbs(g.v).map((o) => [o.st, o.x, o.z]), before.map((o) => [MC.PY_WAIT, o.x, o.z]), `still at ${playT(g)}`);
  }
  const balls = before.map((o) => g.v.partier(o.tgt).pos);
  g.step();
  for (const o of orbs(g.v)) {
    const b = before.find((x) => x.k === o.k), p = balls[before.indexOf(b)];
    const d = Math.hypot(p[0] - b.x, p[2] - b.z);
    assert.equal(o.st, MC.PY_FLY);
    assert.equal(o.at, MC.PY_SERVE);
    assert.equal(o.sp, f(MC.PY_S0 + MC.PY_SERVE * MC.PY_SKT), 'the least speed on the launch tick');
    assert.ok(Math.abs(o.dx - (p[0] - b.x) / d) < 1e-3 && Math.abs(o.dz - (p[2] - b.z) / d) < 1e-3, 'straight at it');
    assert.ok(Math.abs(Math.hypot(o.x - b.x, o.z - b.z) - o.sp * TICK) < 1e-4, 'a tick on');
  }
});

test('an orb homes on a ball rolling across it, turning harder the longer it flies; within reach straight in; there, the ball is out, the KO to its last parrier, and after PY_REST it goes for another', async () => {
  const g = await stage(4, [[0, C, C - 14], [1, C + 12, C + 12], [2, C - 12, C + 12], [3, C, C + 16]]);
  // P1 rolling along +x; the orb from 20 m off heading +z, sent by P2
  setOrb(g, 0, { tgt: 0, by: 1, x: C - 20, z: C - 14, dx: 0, dz: 1, sp: 20 });
  const go = partyWord({ yaw: 0, move: 1 });
  let turnMax = 0, inReach = 0, prev = orb(g, 0), straight = true;
  const from = g.v.fxCount();
  for (let k = 0; k < 400 && !g.v.partier(0).out; k++) {
    const b = g.v.partier(0).pos;
    const d0 = Math.hypot(b[0] - prev.x, b[2] - prev.z);
    g.step([[L.EV_INPUT, 0, go]]);
    const o = orb(g, 0);
    if (g.v.partier(0).out) break;
    const turn = Math.acos(Math.min(1, o.dx * prev.dx + o.dz * prev.dz));
    if (d0 > reach(o.sp) + 0.5) turnMax = Math.max(turnMax, turn / Math.min(MC.PY_TURN1, MC.PY_TURN0 + (playT(g) - 1 - o.at) * MC.PY_TURNK));
    else {
      inReach++;
      const p = g.v.partier(0).pos, u = [p[0] - o.x, p[2] - o.z], du = Math.hypot(...u);
      if (Math.abs(o.dx * u[0] + o.dz * u[1] - du) > 0.05) straight = false;
    }
    prev = o;
  }
  assert.ok(g.v.partier(0).out, 'P1 out');
  assert.ok(turnMax > 0.9 && turnMax < 1.01, `turns at most its rate (${turnMax.toFixed(3)} of it)`);
  assert.ok(inReach > 5 && straight, `straight in for its last ${inReach} ticks`);
  const hit = fxs(g.v, from, MC.PY_FX_HIT);
  assert.equal(hit.length, 1);
  assert.deepEqual([hit[0].owner, hit[0].shot], [0, 0 << 8 | 1]);
  assert.equal(g.v.partier(0).hitBy, 1);
  assert.equal(g.v.partier(1).kos, 1, 'the KO to P2');
  const sink = fxs(g.v, from, L.FX_SINK);
  assert.equal(parry.sink(sink[0], (p) => `P${p + 1}`, g.v), 'P1 WAS HIT  P2 SENT IT');
  // back on its spot, after another (from the PRNG), PY_REST on
  const o = orb(g, 0), t = playT(g) - 1;
  assert.deepEqual([o.st, o.at, o.by, o.last], [MC.PY_WAIT, t + MC.PY_REST, 255, 0]);
  assert.ok([1, 2, 3].includes(o.tgt));
  const serve = fxs(g.v, from, MC.PY_FX_SERVE);
  assert.deepEqual(serve.map((x) => [x.owner, x.size]), [[o.tgt, MC.PY_REST]]);
  assert.ok(Math.hypot(o.x - C, o.z - C) < sched(g.v).rad * MC.PY_SPOT);
});

test('a click with the orb in reach parries: it leaves from the ball\'s front along its facing, PY_UP faster, after the nearest ball in the cone at least PY_SEND s of flight off; facing nobody, the nearest that far; none that far, the farthest', async () => {
  // at 25 m/s a parry may go no nearer than 27.5 x PY_SEND + PY_HIT + 1 = 9.3 m
  const min = sendMin(25);
  assert.ok(Math.abs(min - (25 * MC.PY_UP * MC.PY_SEND + MC.PY_HIT + 1)) < 1e-9 && min > 5 && min < 12);
  for (const [yaw, want] of [[0, 1], [4096, 2], [8192, 2], [12288, 3]]) {
    // P2 20 m along +x, P3 12 m along +z (the nearest that far), P4 14 m along -z, P6 5 m along +x (too near)
    const g = await stage(6, [[0, C, C], [1, C + 20, C], [2, C, C + 12], [3, C, C - 14], [4, C - 5, C - 40], [5, C + 5, C]]);
    setOrb(g, 0, { tgt: 0, by: 4, x: C - 4, z: C + 1, dx: 1, dz: 0, sp: 25 });
    const from = g.v.fxCount();
    g.step([[L.EV_INPUT, 0, partyWord({ yaw, use: 1 })]]);
    const fx = fxs(g.v, from, MC.PY_FX_PARRY);
    assert.equal(fx.length, 1, `parried facing ${yaw}`);
    const a = (yaw / 16384) * 2 * Math.PI;
    assert.deepEqual([fx[0].owner, fx[0].shot & 255, fx[0].shot >> 8], [0, want, 0], `facing ${yaw}: to P${want + 1}`);
    assert.ok(Math.abs(fx[0].pos[0] - (C + Math.cos(a))) < 1e-3 && Math.abs(fx[0].pos[2] - (C + Math.sin(a))) < 1e-3, 'from its front');
    assert.equal(fx[0].size, f(f(25 * f(MC.PY_UP))));
    const o = orb(g, 0);
    assert.deepEqual([o.tgt, o.by, o.last, o.rally, o.at], [want, 0, 0, 1, playT(g) - 1]);
    assert.deepEqual(victim(g.v, 0, C, C, a, new Set(), min), [want, yaw !== 8192], 'the client\'s pick the same');
    assert.equal(clicks(g.v, 0).parries, 1);
    assert.equal(clicks(g.v, 0).lock, 0, 'no lock for a parry');
    assert.equal(fxs(g.v, from, MC.PY_FX_WHIFF).length, 0);
  }
  // a ball another orb hunts is passed over for one that isn't, even in the cone
  let g = await stage(4, [[0, C, C], [1, C + 10, C], [2, C + 15, C + 1], [3, C - 20, C - 20]]);
  setOrb(g, 0, { tgt: 0, x: C - 3, z: C, sp: 25 });
  setOrb(g, 1, { st: MC.PY_WAIT, tgt: 1, at: playT(g) + 500, x: C, z: C - 10 });
  g.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, use: 1 })]]);
  assert.equal(orb(g, 0).tgt, 2);
  // at 60 m/s (18.9 m) nobody is that far: the farthest, not the one faced
  g = await stage(4, [[0, C, C], [1, C + 5, C], [2, C - 10, C], [3, C, C + 15]]);
  setOrb(g, 0, { tgt: 0, x: C - 3, z: C, sp: 60 });
  g.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, use: 1 })]]);
  assert.equal(orb(g, 0).tgt, 3);
});

test('the reach grows with the orb\'s speed: in time the window is about PY_WIN at 12, 30 and 70 m/s, and a click just past the reach misses', async () => {
  const wins = [];
  for (const sp of [12, 30, 70]) {
    const r = f(f(MC.PY_REACH0) + f(sp * f(MC.PY_WIN)));
    for (const [d, ok] of [[r - 0.03, true], [r + 0.03, false]]) {
      const g = await stage(3, [[0, C, C], [1, C + 15, C]]);
      setOrb(g, 0, { tgt: 0, x: C - d, z: C, sp, at: playT(g) - 5 });
      const from = g.v.fxCount();
      g.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, use: 1 })]]);
      assert.equal(fxs(g.v, from, MC.PY_FX_PARRY).length, ok ? 1 : 0, `${sp} m/s from ${d.toFixed(2)} m`);
      assert.equal(fxs(g.v, from, MC.PY_FX_WHIFF).length, ok ? 0 : 1);
    }
    // straight in from far off: the ticks it spends inside the reach before it hits
    const g = await stage(3, [[0, C, C], [1, C + 15, C]]);
    setOrb(g, 0, { tgt: 0, x: C - r - 10, z: C, sp });
    g.dv.setFloat32(OB(0) + MC.PY_OSP, sp, true);
    let n = 0;
    while (!g.v.partier(0).out) {
      const o = orb(g, 0);
      if (Math.hypot(o.x - C, o.z - C) <= reach(o.sp)) n++;
      g.step();
    }
    wins.push(n * TICK);
  }
  for (const w of wins) assert.ok(w > MC.PY_WIN && w < MC.PY_WIN + 0.1, `a window of ${wins.map((x) => x.toFixed(3))} s`);
  assert.ok(wins[0] - wins[2] < 0.08, 'about the same');
});

test('a click with nothing in reach locks the parry for PY_LOCK; a click while locked locks it again; mashing never parries', async () => {
  const g = await stage(3, [[0, C, C], [1, C + 15, C]]);
  const click = clicker();
  const from = g.v.fxCount();
  // P1 hunted, the orb far off: a miss
  setOrb(g, 0, { tgt: 0, x: C - 40, z: C, sp: 12 });
  const t0 = playT(g);
  g.step([[L.EV_INPUT, 0, click()]]);
  assert.equal(clicks(g.v, 0).lock, t0 + MC.PY_LOCK);
  let w = fxs(g.v, from, MC.PY_FX_WHIFF);
  assert.deepEqual(w.map((x) => [x.owner, x.shot, x.size]), [[0, 0, MC.PY_LOCK]]);
  // the orb now in reach, but locked: a click locks again and the orb comes on
  setOrb(g, 0, { tgt: 0, x: C - 3, z: C, sp: 12 });
  const t1 = playT(g);
  g.step([[L.EV_INPUT, 0, click()]]);
  assert.equal(orb(g, 0).tgt, 0, 'not parried');
  assert.equal(clicks(g.v, 0).lock, t1 + MC.PY_LOCK);
  w = fxs(g.v, from, MC.PY_FX_WHIFF);
  assert.deepEqual(w.map((x) => x.shot), [0, 1], 'still locked');
  // the lock run out, a click parries
  setOrb(g, 0, { tgt: 0, x: C - 40, z: C, sp: 12 });
  while (playT(g) < t1 + MC.PY_LOCK) g.step();
  setOrb(g, 0, { tgt: 0, x: C - 3, z: C, sp: 12 });
  g.step([[L.EV_INPUT, 0, click()]]);
  assert.equal(orb(g, 0).tgt, 1, 'parried');
  assert.deepEqual([clicks(g.v, 0).parries, clicks(g.v, 0).whiffs], [1, 2]);
  // a ball nobody hunts is locked by a click too
  g.step([[L.EV_INPUT, 2, partyWord({ use: 1 })]]);
  assert.equal(clicks(g.v, 2).lock, playT(g) - 1 + MC.PY_LOCK);
  // mashing every 30 ticks as an orb comes in: locked through it, out
  const h = await stage(3, [[0, C, C], [1, C + 15, C]]);
  setOrb(h, 0, { tgt: 0, x: C - 30, z: C, sp: 20 });
  const mash = clicker();
  for (let k = 0; k < 400 && !h.v.partier(0).out; k++) h.step(k % 30 === 0 ? [[L.EV_INPUT, 0, mash()]] : []);
  assert.ok(h.v.partier(0).out, 'out');
  assert.equal(clicks(h.v, 0).parries, 0);
});

test('a click is judged at the tick of its own word: on the tick the orb would land, saved; a tick later, out', async () => {
  const make = async () => {
    const g = await stage(3, [[0, C, C], [1, C + 15, C]]);
    setOrb(g, 0, { tgt: 0, x: C - 12, z: C, sp: 20 });
    return g;
  };
  // how many steps till it lands, with nobody clicking
  const a = await make();
  let n = 0;
  while (!a.v.partier(0).out) { a.step(); n++; }
  const b = await make();
  for (let k = 0; k < n - 1; k++) b.step();
  b.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, use: 1 })]]);
  assert.ok(!b.v.partier(0).out && orb(b, 0).tgt === 1, `a click on step ${n} parries`);
  const c = await make();
  for (let k = 0; k < n; k++) c.step();
  assert.ok(c.v.partier(0).out);
  c.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, use: 1 })]]);
  assert.equal(clicks(c.v, 0).parries, 0, 'a tick late: out already');
});

test('the orbs speed up over the round and with every parry, up to PY_SMAX', async () => {
  // P1 and P2 24 m apart, P3 off to the side, out of both cones
  const g = await stage(3, [[0, C - 12, C], [1, C + 12, C], [2, C, C - 16]]);
  at(g, 6000);
  setOrb(g, 0, { tgt: 0, x: C - 42, z: C, sp: 5 });
  g.step();
  assert.equal(orb(g, 0).sp, f(f(6000 * f(MC.PY_SKT)) + MC.PY_S0), 'never under the round\'s least');
  assert.ok(Math.abs(base(6000) - orb(g, 0).sp) < 1e-4);
  // parried back and forth between P1 and P2: each time PY_UP faster, to the cap
  const ck = [clicker(), clicker()];
  const speeds = [];
  for (let k = 0; k < 2000 && speeds.length < 16; k++) {
    const o = orb(g, 0);
    const p = o.tgt, b = g.v.partier(p).pos;
    if (Math.hypot(o.x - b[0], o.z - b[2]) < reach(o.sp) - 0.5 && p < 2) {
      g.step([[L.EV_INPUT, p, ck[p](p === 0 ? 0 : 8192)]]);
      speeds.push(orb(g, 0).sp);
    } else g.step();
  }
  assert.equal(speeds.length, 16, `${speeds.length} parries`);
  for (let k = 1; k < speeds.length; k++) assert.ok(speeds[k] >= Math.min(MC.PY_SMAX, speeds[k - 1] * MC.PY_UP) - 0.01, `${speeds.map((s) => s.toFixed(1))}`);
  assert.equal(speeds.at(-1), MC.PY_SMAX, 'capped');
  assert.ok(!g.v.partier(0).out && !g.v.partier(1).out);
});

test('the rim closes in from PY_SHRINK0 to PY_SHRINK1, to PY_RFIN of the disc: a ball is kept inside it and bounces softly off it', async () => {
  const g = await stage(3, [[0, C, C]]);
  const s = sched(g.v);
  assert.equal(rimAt(s, MC.PY_SHRINK0), s.rad);
  assert.equal(rimAt(s, MC.PY_SHRINK1 + 100), s.rfin);
  at(g, (MC.PY_SHRINK0 + MC.PY_SHRINK1) / 2);
  const R = rimAt(s, (MC.PY_SHRINK0 + MC.PY_SHRINK1) / 2);
  assert.ok(R < s.rad - 2 && R > s.rfin + 2);
  put(g, 0, C + R + 3, C, { vx: 6 });
  g.step();
  let b = g.v.partier(0);
  assert.ok(Math.abs(b.pos[0] - C - (R - 1)) < 0.02, `on the rim (${(b.pos[0] - C).toFixed(3)} of ${R.toFixed(3)})`);
  assert.ok(b.vel[0] < -2.5 && b.vel[0] > -3.5, `bounced off at ${b.vel[0]}`);
  // pushing out at it: kept inside as it comes in
  const out = partyWord({ yaw: 0, move: 1 });
  for (let k = 0; k < 600; k++) {
    g.step([[L.EV_INPUT, 0, out]]);
    b = g.v.partier(0);
    assert.ok(Math.hypot(b.pos[0] - C, b.pos[2] - C) <= rimAt(s, playT(g) - 1) - 1 + 1e-3, 'inside');
  }
  assert.ok(!b.out);
});

test('an orb for every 16 balls, kept while 8 are in for each: one retires at its hit when the balls left need fewer; one whose ball leaves goes after the nearest to it', async () => {
  for (const [dead, retire] of [[39, true], [38, false]]) {
    const g = await room(64);
    assert.equal(orbs(g.v).length, 4);
    // out already: `dead` balls besides the one hit
    const o = orb(g, 2);
    let k = 0;
    for (let p = 0; p < 64 && k < dead; p++) {
      if (orbs(g.v).some((x) => x.tgt === p)) continue;
      g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE | L.PF_DEAD);
      k++;
    }
    const b = g.v.partier(o.tgt).pos;
    setOrb(g, 2, { tgt: o.tgt, x: b[0] - 1.5, z: b[2], sp: 20 });
    g.step();
    assert.ok(g.v.partier(o.tgt).out);
    assert.equal(orbs(g.v).length, retire ? 3 : 4, `${64 - dead - 1} left`);
  }
  const g = await stage(4, [[0, C, C], [1, C + 5, C + 4], [2, C - 9, C], [3, C + 12, C - 12]]);
  setOrb(g, 0, { tgt: 3, x: C + 4, z: C + 2, sp: 15 });
  g.step([[L.EV_LEAVE, 3]]);
  assert.equal(orb(g, 0).tgt, 1, 'the nearest to it');
});

test('a ball alone: its parry sends the orb out past its reach and back at it; the round plays till it\'s hit', async () => {
  const g = await room(1);
  assert.equal(orbs(g.v).length, 1);
  assert.equal(orb(g, 0).tgt, 0);
  const click = clicker();
  let parries = 0;
  for (let k = 0; k < 3000 && !g.v.partier(0).out; k++) {
    const o = orb(g, 0), b = g.v.partier(0).pos;
    const d = Math.hypot(o.x - b[0], o.z - b[2]);
    if (o.st === MC.PY_FLY && parries < 3 && d < reach(o.sp) * 0.5) {
      g.step([[L.EV_INPUT, 0, click()]]);
      const n = orb(g, 0);
      assert.equal(n.tgt, 0, 'back at itself');
      assert.ok(Math.hypot(n.x - b[0], n.z - b[2]) > reach(n.sp), 'from out of its reach');
      parries++;
    } else g.step();
  }
  assert.equal(parries, 3);
  assert.ok(g.v.partier(0).out);
  while (g.v.hole().state === L.H_PLAY) g.step();
  assert.equal(g.v.hole().state, L.H_OVER);
});

test('the prediction matches the confirmed ball bit for bit: clicking (misses and parries) and rolling into the rim as it closes in', async () => {
  const g = await stage(4, [[0, C + 5, C], [1, C - 12, C + 6], [2, C - 12, C - 6], [3, C + 2, C + 14]]);
  // an orb at P1, one at P4 far off; P1 clicks now and then, rolling round
  setOrb(g, 0, { tgt: 0, x: C - 30, z: C, sp: 13 });
  setOrb(g, 1, { tgt: 3, x: C + 2, z: C + 60, sp: 13 });
  let n = 0;
  const words = Array.from({ length: 160 }, (_, k) => partyWord({ yaw: (1000 + k * 53) & 16383, move: k % 50 < 40 ? 1 : 0, use: k % 37 === 5 ? ++n & 3 : n & 3 }));
  assert.ok(predicted(g, words) >= words.length);
  assert.ok(clicks(g.v, 0).whiffs >= 2, 'misses');
  // the orb come in to P1 as the rim moves in: a parry on the click, then out into the rim, pressed to it
  at(g, MC.PY_SHRINK0 + 3000);
  const R = rimAt(sched(g.v), MC.PY_SHRINK0 + 3000);
  put(g, 0, C + R - 3, C);
  setOrb(g, 0, { tgt: 0, x: C + R - 7, z: C, sp: 13 });
  const before = clicks(g.v, 0).parries;
  // (short of the orb's flight to the ball it went to: a hit there is a KO on P1's record, ball against ball)
  let touched = 0;
  const step = g.step;
  g.step = (recs) => {
    step(recs);
    const p = g.v.partier(0).pos, lim = rimAt(sched(g.v), playT(g) - 1) - 1, r = Math.hypot(p[0] - C, p[2] - C);
    assert.ok(r <= lim + 1e-3, 'inside the rim');
    if (r > lim - 0.02) touched++;
  };
  const run = Array.from({ length: 85 }, (_, k) => partyWord({ yaw: 0, move: 1, use: k >= 2 ? (n + 1) & 3 : n & 3 }));
  assert.ok(predicted(g, run) >= run.length);
  assert.equal(clicks(g.v, 0).parries, before + 1, 'parried on its own tick');
  assert.ok(touched >= 1, 'pressed to the rim, predicted all the way');
  assert.ok(!g.v.partier(0).out);
});

test('the client: an orb flown on as $py_fly flies it, after a ball that rolls; the stage, the orbs, beams and rings drawn; its HUD; the AI ball parries and faces the nearest', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const g = await stage(6, [[0, C, C], [1, C + 8, C + 3], [2, C - 10, C + 10], [3, C + 12, C - 12], [4, C - 16, C - 2], [5, C + 2, C - 18]]);
  setOrb(g, 0, { tgt: 1, x: C - 25, z: C - 10, dx: 0, dz: 1, sp: 18 });
  // flown on 150 ticks in JS against the ball's real path, and by the sim
  const path = [];
  const sim = [];
  const o0 = orb(g, 0), t0 = playT(g);
  for (let k = 0; k < 150; k++) {
    g.step([[L.EV_INPUT, 1, partyWord({ yaw: (k * 90) & 16383, move: 1 })]]);
    const b = g.v.partier(1).pos;
    path.push([b[0], b[2]]);
    sim.push(orb(g, 0));
  }
  for (const n of [1, 40, 149]) {
    const js = fly({ ...o0 }, t0, n, (k) => path[k - 1]);
    assert.ok(Math.hypot(js.x - sim[n - 1].x, js.z - sim[n - 1].z) < 2e-3, `${n} ticks on: ${js.x - sim[n - 1].x}`);
  }
  // drawn: the stage, an orb, its beam and its ball's red ring
  const out = () => ({ scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null });
  const o = out();
  const g0 = g.v.party();
  parry.draw(g.v, { tick: g0.tick, t: g0.t * TICK, dt: 0, ptick: g0.tick + 12, now: 0, slot: 1, pme: g.v.partier(1), own: g.v.partier(1).pos }, o);
  for (let k = 0; k < o.scene.count * 16; k++) assert.ok(Number.isFinite(o.scene.data[k]), 'finite');
  assert.ok(o.scene.count > 24, 'the floor and the rim');
  assert.equal(o.beams.length, 1);
  assert.ok(o.solid.some((x) => x.kind === 2), 'the orb');
  assert.ok(o.decals.filter((x) => x.color[0] === 1 && x.color[1] < 0.2).length >= 1, 'a red ring');
  assert.ok(o.decals.length >= 4, 'your reach, and who you\'d send it to');
  // the HUD
  const lines = [];
  const hctx = { put: () => {}, centre: (y, s, c) => lines.push(s), right: (y, s, c) => lines.push(s), rect: () => {}, rows: 44, C: {}, slot: 1, now: 0, t: g0.t * TICK };
  parry.hud(g.v, hctx);
  assert.ok(lines.some((l) => l.startsWith('IT\'S AFTER YOU')), lines.join(' | '));
  assert.ok(lines.some((l) => l.startsWith('1 ORB')));
  for (const l of lines) assert.ok(l.length <= 70, l);
  assert.ok(parry.hint.length <= 70);
  assert.equal(parry.frame(g.v).shape, 'disc');
  // the brain: hunted with the orb close, it faces the nearest and clicks once it has seen it long enough
  idle(g);
  put(g, 0, C, C);
  put(g, 1, C + 10, C);
  put(g, 2, C, C - 14);
  setOrb(g, 0, { tgt: 0, x: C - 30, z: C, sp: 18 });
  g.step();
  const me = g.v.partier(0);
  const bot = { slot: 0, mem: {}, skill: 1, pos: [C, C], vel: [0, 0] };
  assert.equal(parry.brain.think(g.v, me, bot, g.v.tick + 6), null, 'far off: the planner\'s');
  setOrb(g, 0, { tgt: 0, x: C - 2.5, z: C, sp: 18 });
  g.step();
  let word = parry.brain.think(g.v, g.v.partier(0), bot, g.v.tick + 6);
  assert.ok(word && Math.abs(word.yaw) < 0.05 && word.use === 0, 'facing P2, not yet seen long enough');
  for (let k = 0; k < 30; k++) {
    g.dv.setUint32(L.HDR_TICK, g.v.tick + 1, true);
    g.dv.setUint32(L.HDR_START, g.dv.getUint32(L.HDR_START, true) + 1, true);
    word = parry.brain.think(g.v, g.v.partier(0), bot, g.v.tick + 6);
    if (word.use) break;
  }
  assert.equal(word.use, 1, 'clicks');
  assert.equal(parry.brain.think(g.v, g.v.partier(0), bot, g.v.tick + 7).use, 0, 'not again inside a lock');
  // danger near a hunted ball, none near none
  const v2 = g.v;
  v2._py = null;
  assert.ok(parry.brain.danger(v2, C + 1.5, C, v2.tick, 2) > 0.4, 'by a hunted ball');
  assert.equal(parry.brain.danger(v2, C + 8, C + 8, v2.tick, 2), 0, 'clear');
});

// A round of AI balls (client/party-bot.mjs) steered by this minigame's brain on the debug build, stats from it.
// Each hit by an orb another ball sent pushes the ticks from that parry to the hit onto stats.sent.
async function aiRound(balls, ticks, seed, delay = 6) {
  const stats = { start: -1, over: -1, parries: 0, hits: 0, whiffs: 0, places: null, pts: null, winner: -1, sent: [] };
  let seen = 0;
  const last = new Map();
  const r = await playParty({ bytes: partyBytes(true), mg: L.MG_PARRY, bots: balls, ticks, seed, delay, onTick: (t, sim, v) => {
    const g = v.party();
    for (; seen < v.fxCount(); seen++) {
      const x = v.fx(seen);
      if (stats.over >= 0 || stats.start < 0) continue;
      if (x.kind === MC.PY_FX_PARRY) { stats.parries++; last.set(x.shot >> 8, { at: g.t - 1, by: x.owner }); }
      if (x.kind === MC.PY_FX_HIT) {
        stats.hits++;
        const p = last.get(x.shot >> 8);
        if (p && p.by !== 255 && p.by !== x.owner) stats.sent.push(g.t - 1 - p.at);
      }
      if (x.kind === MC.PY_FX_WHIFF) stats.whiffs++;
    }
    if (g.state === L.H_PLAY) for (const o of orbs(v)) if (o.st === MC.PY_FLY) last.set(o.k, { at: o.at, by: o.by });
    if (stats.start < 0 && g.state === L.H_PLAY) stats.start = t;
    if (stats.over < 0 && stats.start >= 0 && g.state === L.H_OVER) {
      stats.over = t;
      stats.winner = g.winner;
      stats.left = g.left;
      stats.places = [...Array(balls).keys()].map((p) => v.partier(p).place);
      stats.pts = [...Array(balls).keys()].map((p) => v.partier(p).pts);
    }
  } });
  return { ...r, stats };
}

for (const [balls, ticks, seed] of [[8, 8000, 3], [64, 16500, 5]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, parried and hit till one is left; equal on 1 and 4 threads`, async () => {
    const { log, sim, stats, games } = await aiRound(balls, ticks, seed);
    assert.equal(sim.error().code, 0);
    assert.ok(games.every((x) => x === L.MG_PARRY));
    assert.ok(stats.over > 0, 'the round ended');
    const secs = (stats.over - stats.start) * TICK;
    assert.ok(secs > 20 && secs <= MC.PY_LEN * TICK + 0.01, `${secs.toFixed(1)} s of play`);
    assert.ok(stats.hits >= Math.min(balls - 1, 40), `${stats.hits} hit`);
    assert.ok(stats.parries > stats.hits * 1.5, `${stats.parries} parries`);
    assert.ok(stats.whiffs < stats.parries / 4, `${stats.whiffs} misses`);
    assert.ok(stats.places.every((x) => x >= 1 && x <= balls), `places ${stats.places}`);
    assert.ok(stats.pts.every((x) => x >= 1 && x <= 10), `points ${stats.pts}`);
    assert.ok(stats.places.includes(1) && stats.pts.includes(10), 'somebody won');
    const parsed = parseLog(log);
    const n = stats.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('at a 100 ms round trip no ball is hit by an orb sent at it before it could see the parry: 16 AI balls, every hit a parry sent landing 0.11 s or more after it', async () => {
  const delay = 13; // ticks from a bot seeing a tick to its word landing
  const { stats } = await aiRound(16, 13000, 9, delay);
  assert.ok(stats.over > 0 && stats.hits === 15, `${stats.hits} hit`);
  assert.ok(stats.sent.length >= 10, `${stats.sent.length} by a parry`);
  // a word decided on the view after the parry's tick lands delay + 1 ticks on; a click on the hit's own tick still saves
  assert.ok(Math.min(...stats.sent) >= delay + 1, `${stats.sent.sort((a, b) => a - b)}`);
});
