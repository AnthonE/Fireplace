// BALLOON BASH (src/mg/balloon.wat): the walled arena for the crowd, its
// tower and crates, the wall closing in and the crates it takes, the
// balloons (stomps, rams, blasts, the guard, the steal, outs and KOs), the
// power-ups, the clock, the prediction bit for bit, and rounds of AI balls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/balloon.mjs'; // BL_*: the minigame's own constants
import balloon, { stage, wallAt, topAt, groundAt, balloonsOf, guarded } from '../client/mg/balloon.mjs';

const C = L.B_CX;
const TICK = 0.008;
const turn = (a) => Math.round((a / (2 * Math.PI)) * 16384) & 0x3fff; // a word's yaw, 1/16384 turns

// A room of n balls in BALLOON BASH, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_BALLOON + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// The next step plays tick t into play (the clock moved, the round's end with it).
function at(g, t) {
  const now = g.v.tick;
  g.dv.setUint32(L.HDR_START, now - t, true);
  g.dv.setUint32(L.HDR_UNTIL, now - t + MC.BL_LEN, true);
}
// Ball p at (x, z), on the floor (or at y), rolling at (vx, vz), its balloons and power-up as asked.
function put(g, p, x, z, { y = PLAT_Y, vx = 0, vy = 0, vz = 0, ground = true, lost = 0, item = 0, mega = 0 } = {}) {
  const d = g.dv, a = rec(p);
  d.setFloat32(a + L.P_PX, x, true); d.setFloat32(a + L.P_PY, y, true); d.setFloat32(a + L.P_PZ, z, true);
  d.setFloat32(a + L.P_VX, vx, true); d.setFloat32(a + L.P_VY, vy, true); d.setFloat32(a + L.P_VZ, vz, true);
  d.setUint8(a + L.P_FL, L.PF_LIVE | (ground ? L.PF_GROUND : 0));
  d.setUint32(a + L.PG_M, lost, true);
  d.setUint8(a + L.B_ITEM, item);
  d.setUint16(a + L.B_MEGA, mega, true);
  d.setUint16(a + L.B_HITT, 0, true);
}
// No boxes: a flat floor inside the wall (the rules' tests).
const flat = (g) => g.dv.setUint32(L.PG_H + MC.BL_NB, 0, true);
// The rest of the room, still, on the floor (a sunflower from the rim in), clear of the boxes, 2.4 m
// apart and at least 9 m from each point given.
function park(g, n, from, ...away) {
  const st = stage(g.v);
  const taken = [];
  let k = 0;
  for (let p = from; p < n; p++) {
    for (; k < 4096; k++) {
      const a = k * 2.39996, r = (st.r0 - 1.6) * Math.sqrt(1 - k / 4096);
      const x = C + r * Math.cos(a), z = C + r * Math.sin(a);
      const clear = st.boxes.every((b) => Math.max(Math.abs(x - b.x), Math.abs(z - b.z)) > b.h + 1.6);
      if (clear && away.every(([ax, az]) => Math.hypot(x - ax, z - az) > 9) && taken.every(([tx, tz]) => Math.hypot(x - tx, z - tz) > 2.4)) {
        put(g, p, x, z);
        taken.push([x, z]);
        k++;
        break;
      }
    }
  }
}
const lost = (g, p) => g.dv.getUint32(rec(p) + L.PG_M, true) & 3;
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const f = v.fx(k); if (f.kind === kind) out.push(f); } return out; };
const roll = (yaw, extra = {}) => partyWord({ yaw: turn(yaw), move: 1, ...extra });
// Steps until f() or n ticks, P1's word each tick.
function until(g, f, n = 400, word = partyWord({ yaw: 0 })) {
  for (let k = 0; k < n && !f(); k++) g.step([[L.EV_INPUT, 0, word]]);
  return f();
}

test('the arena for 1, 8, 64 and 256: sized for the crowd, the tower in the middle, crates clear of each other inside the wall, every ball on the floor clear of them', async () => {
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const st = stage(g.v);
    const r0 = Math.min(MC.BL_R0 + MC.BL_RK * Math.sqrt(n), MC.BL_RMAX);
    assert.equal(r.game, L.MG_BALLOON);
    assert.ok(Math.abs(r.size - r0) < 1e-4 && Math.abs(st.r0 - r0) < 1e-4, `${r.size} m for ${n}`);
    assert.deepEqual([r.kind, r.len], [L.PK_OUT, MC.BL_LEN]);
    const [base, top, ...crates] = st.boxes;
    assert.deepEqual([base.kind, base.x, base.z, base.h, base.top], [MC.BL_KBASE, C, C, Math.fround(MC.BL_T1), MC.BL_T1H]);
    assert.deepEqual([top.kind, top.h, top.top], [MC.BL_KTOP, Math.fround(MC.BL_T2), MC.BL_T2H]);
    assert.ok(base.gone === 0x7fffffff && top.gone === 0x7fffffff, 'the tower stays');
    const want = MC.BL_C0 + Math.floor((r0 * r0 * Math.PI) / MC.BL_CAREA);
    const tall = crates.filter((b) => b.kind === MC.BL_KHIGH).length;
    assert.equal(crates.filter((b) => b.kind === MC.BL_KSTEP).length, tall, 'a step for every tall crate');
    assert.ok(crates.length - tall >= Math.min(want, 4) && crates.length - tall <= want, `${crates.length - tall} crates of ${want} for ${n}`);
    for (const b of crates) {
      const far = Math.hypot(Math.abs(b.x - C) + b.h, Math.abs(b.z - C) + b.h);
      assert.ok(far <= r0 - 1.5 + 1e-3, 'inside the wall');
      // the wall takes it as it reaches its far corner (never, inside the last ring)
      if (far <= MC.BL_RMIN) assert.equal(b.gone, 0x7fffffff);
      else {
        assert.ok(b.gone >= MC.BL_CLOSE0 && b.gone <= MC.BL_CLOSE1, `the wall takes it at ${b.gone}`);
        assert.ok(Math.abs(wallAt(st, b.gone) - far) < 0.02);
      }
      for (const o of st.boxes) {
        if (o === b || (b.kind === MC.BL_KSTEP && o.kind === MC.BL_KHIGH && Math.abs(o.x - b.x) + Math.abs(o.z - b.z) < MC.BL_CRATE + MC.BL_STEP + 1e-3)) continue;
        if (o.kind === MC.BL_KSTEP && b.kind === MC.BL_KHIGH && Math.abs(o.x - b.x) + Math.abs(o.z - b.z) < MC.BL_CRATE + MC.BL_STEP + 1e-3) continue;
        assert.ok(Math.max(Math.abs(o.x - b.x) - o.h - b.h, Math.abs(o.z - b.z) - o.h - b.h) >= MC.BL_GAP - 1e-3 || o.kind === MC.BL_KTOP, `${n}: boxes ${b.i} and ${o.i} a ball's way apart`);
      }
    }
    const seen = new Set();
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y, `${n}: P${p + 1} on the floor`);
      assert.ok(Math.hypot(b.pos[0] - C, b.pos[2] - C) < r0 * MC.BL_SPAWN + 1e-3, `${n}: P${p + 1} inside`);
      assert.ok(st.boxes.every((o) => Math.hypot(Math.max(0, Math.abs(b.pos[0] - o.x) - o.h), Math.max(0, Math.abs(b.pos[2] - o.z) - o.h)) >= 1 + MC.BL_CLEAR - 1e-3), `${n}: P${p + 1} clear of the boxes`);
      assert.equal(balloonsOf(b.m), 3, 'three balloons');
      seen.add(`${b.pos[0]},${b.pos[2]}`);
    }
    assert.equal(seen.size, n, `${n}: every ball on a spot of its own`);
  }
});

test('the boxes: solid under their tops, a hop onto a crate and from it onto a tall one, rolled off the edge to the floor; the client\'s ground is the sim\'s', async () => {
  const g = await room(2, { seed: 21 });
  const st = stage(g.v);
  const tall = st.boxes.find((b) => b.kind === MC.BL_KHIGH);
  const step = st.boxes.find((b) => b.kind === MC.BL_KSTEP && Math.abs(b.x - tall.x) + Math.abs(b.z - tall.z) < 2.2);
  const low = st.boxes.find((b) => b.kind === MC.BL_KLOW);
  assert.ok(tall && step && low, 'a tall crate with its step, and a low one');
  // into a low crate's side along x at floor level: held out of it, bounced back
  park(g, 2, 1, [low.x, low.z], [tall.x, tall.z]);
  const side = low.x - low.h - 1;
  put(g, 0, side - 3, low.z, { vx: 9 });
  let inside = false, back = false;
  for (let k = 0; k < 60; k++) {
    g.step([[L.EV_INPUT, 0, roll(0)]]);
    const b = g.v.partier(0);
    if (b.pos[0] > side + 1e-3) inside = true;
    if (b.vel[0] < 0) back = true;
  }
  assert.ok(!inside && back, 'held at its side, bounced off');
  // a hop from beside it (rolling at it) lands on top
  put(g, 0, side - 1.5, low.z, { vx: 6 });
  g.step([[L.EV_INPUT, 0, roll(0, { hop: 1 })]]);
  assert.ok(until(g, () => g.v.partier(0).ground && g.v.partier(0).pos[1] > PLAT_Y + 0.5, 120, roll(0)), 'on the crate');
  assert.equal(g.v.partier(0).pos[1], PLAT_Y + MC.BL_LOW);
  // rolled off its far edge: down to the floor
  assert.ok(until(g, () => g.v.partier(0).pos[0] > low.x + low.h + 1.5 && g.v.partier(0).ground, 200, roll(0)));
  assert.equal(g.v.partier(0).pos[1], PLAT_Y, 'back on the floor');
  // on the step, a hop onto the tall crate beside it
  const dx = Math.sign(tall.x - step.x), dz = Math.sign(tall.z - step.z);
  park(g, 2, 1, [tall.x, tall.z]);
  put(g, 0, step.x - dx * 0.85, step.z - dz * 0.85, { y: PLAT_Y + MC.BL_LOW, vx: dx * 4, vz: dz * 4 });
  const yaw = Math.atan2(dz, dx);
  g.step([[L.EV_INPUT, 0, roll(yaw)]]);
  g.step([[L.EV_INPUT, 0, roll(yaw, { hop: 1 })]]);
  assert.ok(until(g, () => g.v.partier(0).ground && g.v.partier(0).pos[1] > PLAT_Y + 1, 120, roll(yaw)), 'on the tall crate');
  assert.equal(g.v.partier(0).pos[1], PLAT_Y + MC.BL_HIGH);
  // from the floor it is out of a hop's reach: held at its side
  const far = [tall.x - dx * (tall.h + 4), tall.z - dz * (tall.h + 4)];
  put(g, 0, far[0], far[1], { vx: dx * 7, vz: dz * 7 });
  let top = false;
  for (let k = 0; k < 120; k++) {
    g.step([[L.EV_INPUT, 0, roll(yaw, { hop: k === 30 ? 1 : 0 })]]);
    if (g.v.partier(0).pos[1] > PLAT_Y + 1.2 && g.v.partier(0).ground) top = true;
  }
  assert.ok(!top, 'no hop gets up a tall crate from the floor');
  // still balls dropped over a sample of points (away from every box's edge, where a ball's side would
  // meet it) land where the client says the ground is
  for (let k = 0; k < 160; k++) {
    const a = k * 2.39996, r = Math.sqrt((k + 0.5) / 160) * (st.r0 - 2.5);
    const x = C + r * Math.cos(a), z = C + r * Math.sin(a);
    if (!st.boxes.every((b) => Math.abs(Math.max(Math.abs(x - b.x), Math.abs(z - b.z)) - b.h) > 1.2)) continue;
    at(g, 1000);
    put(g, 0, x, z, { y: PLAT_Y + 2.5, ground: false });
    park(g, 2, 1, [x, z]);
    for (let i = 0; i < 80; i++) g.step();
    assert.equal(g.v.partier(0).pos[1], groundAt(st, x, z, PLAT_Y + 2.5, g.v.party().t), `(${(x - C).toFixed(1)}, ${(z - C).toFixed(1)})`);
  }
});

test('the wall: a ball is held inside it and comes off at half its speed; from BL_CLOSE0 to BL_CLOSE1 it closes in to BL_RMIN, carrying a ball in, and a crate it reaches sinks and is gone', async () => {
  const g = await room(2, { seed: 5 });
  const st = stage(g.v);
  flat(g);
  park(g, 2, 1, [C + st.r0, C]);
  put(g, 0, C + st.r0 - 3, C, { vx: 8 });
  let out = false, back = 0, before = 0;
  for (let k = 0; k < 80; k++) {
    const v0 = g.v.partier(0).vel[0];
    g.step();
    const b = g.v.partier(0);
    if (Math.hypot(b.pos[0] - C, b.pos[2] - C) > st.r0 - 1 + 1e-3) out = true;
    if (b.vel[0] < 0 && !back) { back = b.vel[0]; before = v0; }
  }
  assert.ok(!out, 'never past the wall');
  // (a tick's drag, then the wall)
  assert.ok(Math.abs(-back / (before * Number(L.BPHYS.B_DRAG)) - MC.BL_WALLE) < 1e-3, `off it at ${back} from ${before}`);
  // closing: a still ball at the wall's line is held to it, and carried in at its speed
  for (const t of [MC.BL_CLOSE0, 6000, 8000, MC.BL_CLOSE1, MC.BL_LEN - 100]) {
    at(g, t);
    const rim = wallAt(st, t);
    put(g, 0, C + rim - 1 + 0.5, C);
    park(g, 2, 1, [C + rim, C]);
    g.step();
    const x = g.v.partier(0).pos[0];
    assert.ok(Math.abs(x - (C + rim - 1)) < 1e-3, `t ${t}: held at ${x - C}, the wall at ${rim}`);
    if (t > MC.BL_CLOSE0 && t < MC.BL_CLOSE1) {
      const v = (st.r0 - MC.BL_RMIN) * 125 / (MC.BL_CLOSE1 - MC.BL_CLOSE0);
      assert.ok(Math.abs(g.v.partier(0).vel[0] + v) < 1e-3, `carried in at ${v} m/s`);
    }
  }
  assert.ok(Math.abs(wallAt(st, MC.BL_CLOSE1) - MC.BL_RMIN) < 1e-6);
  // a crate the wall reaches: a ball on it rides it down into the floor
  const g2 = await room(2, { seed: 9 });
  const st2 = stage(g2.v);
  const low = st2.boxes.find((b) => b.kind === MC.BL_KLOW);
  park(g2, 2, 1, [low.x, low.z]);
  at(g2, low.gone - MC.BL_SINK - 20);
  put(g2, 0, low.x, low.z, { y: PLAT_Y + MC.BL_LOW });
  const ys = [];
  for (let k = 0; k < MC.BL_SINK + 60; k++) { g2.step(); ys.push(g2.v.partier(0).pos[1] - PLAT_Y); }
  assert.equal(ys[0], MC.BL_LOW, 'on it till it sinks');
  assert.ok(ys.some((y) => y > 0.2 && y < 0.6), 'down with it');
  assert.equal(ys.at(-1), 0, 'on the floor once it is gone');
  assert.equal(topAt(low, low.gone), -1);
});

test('a stomp: coming down on a ball\'s top pops one of its balloons and bounces the stomper up; coming down beside it does nothing', async () => {
  const g = await room(2);
  flat(g);
  at(g, 1000);
  put(g, 0, C + 8, C);
  put(g, 1, C + 8, C, { y: PLAT_Y + 3.5, ground: false });
  const n0 = g.v.fxCount();
  assert.ok(until(g, () => lost(g, 0) === 1, 200), 'P1 lost one');
  assert.ok(g.v.partier(1).vel[1] >= MC.BL_BOUNCE, `P2 bounced at ${g.v.partier(1).vel[1]}`);
  const [pop] = fxs(g.v, MC.BL_FX_POP, n0);
  assert.deepEqual([pop.owner, pop.shot & 255, (pop.shot >> 8) & 3, pop.size], [0, 1, 0, 2]);
  assert.equal(lost(g, 1), 0, 'P2 keeps its three');
  // beside it, its bottom never over the other's centre
  const h = await room(2);
  flat(h);
  at(h, 1000);
  put(h, 0, C + 8, C);
  put(h, 1, C + 8 + 1.9, C, { y: PLAT_Y + 3.5, ground: false });
  for (let k = 0; k < 150; k++) h.step();
  assert.deepEqual([lost(h, 0), lost(h, 1)], [0, 0]);
});

test('a ram: driven into a ball faster than BL_RAM, and faster than it comes back, pops one; slower, nothing; a MEGA ball rams at BL_RAMM, and anyone at BL_RAMF in the last ring', async () => {
  // P1 rolling at v1 from `from` m (centre to centre) behind P2, which comes back at v2
  const ram = async ({ v1, v2 = 0, mega = 0, t = 1000, keys = true, from = 5.5 }) => {
    const g = await room(2);
    flat(g);
    at(g, t);
    put(g, 0, C + 0.5 - from, C, { vx: v1, mega });
    put(g, 1, C + 0.5, C, { vx: -v2 });
    const n0 = g.v.fxCount();
    for (let k = 0; k < 100; k++) g.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, move: keys ? 1 : 0 })], [L.EV_INPUT, 1, partyWord({ yaw: 8192, move: v2 ? 1 : 0 })]]);
    return { lost: [lost(g, 0), lost(g, 1)], pops: fxs(g.v, MC.BL_FX_POP, n0) };
  };
  const hard = await ram({ v1: 9 });
  assert.deepEqual(hard.lost, [0, 1], 'P2 popped');
  assert.deepEqual([hard.pops[0].owner, hard.pops[0].shot & 255, (hard.pops[0].shot >> 8) & 3], [1, 0, 1]);
  assert.deepEqual((await ram({ v1: 5, keys: false })).lost, [0, 0], 'a soft bump pops nothing');
  assert.deepEqual((await ram({ v1: 9, v2: 7 })).lost, [0, 1], 'head on, the faster pops the slower');
  assert.deepEqual((await ram({ v1: 7.5, v2: 9.5 })).lost, [1, 0]);
  // coasting in from 3.7 m at 6.5 m/s, it meets P2 at about 4.8 (a MEGA ball, sooner, at 5.3)
  assert.deepEqual((await ram({ v1: 6.5, keys: false, from: 3.7 })).lost, [0, 0], 'slower than BL_RAM');
  assert.deepEqual((await ram({ v1: 6.5, mega: 500, keys: false, from: 3.7 })).lost, [0, 1], 'MEGA');
  assert.deepEqual((await ram({ v1: 6.5, keys: false, from: 3.7, t: MC.BL_CLOSE1 + 10 })).lost, [0, 1], 'the last ring');
});

test('blasts: a POW pops one of every ball it shoves, beside it too, none out of reach; a ROCKET pops the ball it meets; a SPRING\'s landing pops those within its stomp', async () => {
  const g = await room(4);
  flat(g);
  at(g, 1000);
  put(g, 0, C, C + 5, { item: L.PU_POW });
  put(g, 1, C + 2.05, C + 5);
  put(g, 2, C + 7, C + 5);
  put(g, 3, C - 13, C + 5);
  g.step([[L.EV_INPUT, 0, partyWord({ yaw: 0 })]]);
  const n0 = g.v.fxCount();
  g.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, use: 1 })]]);
  assert.deepEqual([0, 1, 2, 3].map((p) => lost(g, p)), [0, 1, 1, 0]);
  assert.deepEqual(fxs(g.v, MC.BL_FX_POP, n0).map((f) => [f.owner, f.shot & 255, (f.shot >> 8) & 3]), [[1, 0, 2], [2, 0, 2]]);
  // a rocket down +x into P2
  const r = await room(2);
  flat(r);
  at(r, 1000);
  put(r, 0, C - 10, C + 5, { item: L.PU_ROCKET });
  put(r, 1, C + 5, C + 5);
  r.step([[L.EV_INPUT, 0, partyWord({ yaw: 0 })]]);
  r.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, use: 1 })]]);
  assert.ok(until(r, () => lost(r, 1) === 1, 120, partyWord({ yaw: 0, use: 1 })), 'the rocket popped one');
  // a spring straight up and down: within STOMP_R of where it lands, one each
  const s = await room(3);
  flat(s);
  at(s, 1000);
  put(s, 0, C, C + 5, { item: L.PU_SPRING });
  put(s, 1, C + 4, C + 5);
  put(s, 2, C - 9, C + 5);
  s.step([[L.EV_INPUT, 0, partyWord({ yaw: 0 })]]);
  s.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, use: 1 })]]);
  assert.ok(until(s, () => lost(s, 1) === 1, 300, partyWord({ yaw: 0, use: 1 })), 'the landing popped one');
  assert.equal(lost(s, 2), 0);
});

// The pops since FX n0: [whose, by whom, how (0 a stomp, 1 a ram, 2 a blast), stolen].
const popped = (g, n0) => fxs(g.v, MC.BL_FX_POP, n0).map((f) => [f.owner, f.shot & 255, (f.shot >> 8) & 3, !!(f.shot & 1024)]);

test('a ROCKET point-blank into a ball touching its owner pops one as a blast, though bumper keeps the owner, touching, as its hitter; one in flight going off beside a ball touching its owner pops that one too', async () => {
  // fired into P2, its skin 5 cm off P1's: off at once, its slot free again by the tick's end
  const g = await room(2);
  flat(g);
  at(g, 1000);
  put(g, 0, C, C + 5, { item: L.PU_ROCKET });
  put(g, 1, C + 2.05, C + 5);
  g.step([[L.EV_INPUT, 0, partyWord({ yaw: 0 })]]);
  const n0 = g.v.fxCount();
  g.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, use: 1 })]]);
  assert.equal(fxs(g.v, L.FX_BLAST, n0).length, 1, 'it went off');
  assert.equal(g.v.u8[L.PROJ + L.J_KIND], 0, 'at once');
  assert.deepEqual([g.v.u8[rec(1) + L.B_HITBY], g.dv.getUint16(rec(1) + L.B_HITT, true)], [0, L.CREDIT_TICKS - 1], 'P1 its hitter this tick');
  assert.deepEqual(popped(g, n0), [[1, 0, 2, false]], 'P2 blasted');
  for (let k = 0; k < 20; k++) g.step();
  assert.deepEqual([lost(g, 0), lost(g, 1)], [0, 1]);
  // fired at P3 5 m off, past P2 sitting against P1's side: in flight a few ticks, its blast takes both
  const h = await room(3);
  flat(h);
  at(h, 1000);
  put(h, 0, C, C + 5, { item: L.PU_ROCKET });
  put(h, 1, C, C + 7.05);
  put(h, 2, C + 5, C + 5);
  h.step([[L.EV_INPUT, 0, partyWord({ yaw: 0 })]]);
  const n1 = h.v.fxCount();
  h.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, use: 1 })]]);
  assert.equal(h.v.u8[L.PROJ + L.J_KIND], L.K_ROCKET, 'in flight');
  assert.ok(until(h, () => fxs(h.v, L.FX_BLAST, n1).length > 0, 40), 'it went off');
  assert.equal(h.v.u8[rec(1) + L.B_HITBY], 0);
  assert.deepEqual(popped(h, n1), [[1, 0, 2, false], [2, 0, 2, false]], 'P2 and P3 blasted');
  assert.deepEqual([lost(h, 0), lost(h, 1), lost(h, 2)], [0, 1, 1]);
});

test('a ball blasted and bumped on the same tick: the blast pops one, the blaster\'s, though bumper keeps the bump; the bump is judged as a bump, rammed it is guarded, ramming it pops the other', async () => {
  // P1's POW 9 m off P2 as P3, out of its reach, meets P2 at 9 m/s: P3 rams P2, or P2 rams P3
  const run = async (ramming) => {
    const g = await room(3);
    flat(g);
    at(g, 1000);
    put(g, 0, C, C + 5, { item: L.PU_POW });
    const x = ramming ? C + 8.95 : C + 9.5;
    put(g, 1, x, C + 5, { vx: ramming ? 9 : 0 });
    put(g, 2, x + 2.11, C + 5, { vx: ramming ? 0 : -9 });
    const words = (use) => [[L.EV_INPUT, 0, partyWord({ yaw: 0, use })], [L.EV_INPUT, 1, partyWord({ yaw: 0, move: ramming ? 1 : 0 })],
      [L.EV_INPUT, 2, partyWord({ yaw: 8192, move: ramming ? 0 : 1 })]];
    g.step(words(0));
    assert.equal(g.dv.getUint16(rec(1) + L.B_HITT, true), 0, 'apart till the POW\'s tick');
    const n0 = g.v.fxCount();
    g.step(words(1));
    assert.equal(fxs(g.v, L.FX_BLAST, n0).length, 1, 'the POW');
    assert.deepEqual([g.v.u8[rec(1) + L.B_HITBY], g.v.u8[rec(2) + L.B_HITBY], g.dv.getUint16(rec(2) + L.B_HITT, true)], [2, 1, L.CREDIT_TICKS - 1], 'bumper keeps the bump');
    return { pops: popped(g, n0), lost: [lost(g, 0), lost(g, 1), lost(g, 2)] };
  };
  const rammed = await run(false);
  assert.deepEqual(rammed.pops, [[1, 0, 2, false]], 'P2 blasted, then guarded from P3\'s ram');
  assert.deepEqual(rammed.lost, [0, 1, 0]);
  const ramming = await run(true);
  assert.deepEqual(ramming.pops, [[1, 0, 2, false], [2, 1, 1, true]], 'P2 blasted, then its ram on P3 steals one back');
  assert.deepEqual(ramming.lost, [0, 0, 1]);
});

test('the guard: nobody loses one in play\'s first BL_GUARD0; after a pop, not another for BL_GUARD; it blinks on the client\'s clock as on the sim\'s', async () => {
  const rammed = (g) => {
    put(g, 0, C - 5, C, { vx: 9, lost: lost(g, 0) });
    const m = g.dv.getUint32(rec(1) + L.PG_M, true);
    put(g, 1, C + 0.5, C);
    g.dv.setUint32(rec(1) + L.PG_M, m, true);
    for (let k = 0; k < 70; k++) g.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, move: 1 })]]);
    return lost(g, 1);
  };
  const g = await room(2);
  flat(g);
  at(g, 100);
  assert.equal(rammed(g), 0, 'not in the first 2 s');
  at(g, 1000);
  assert.equal(rammed(g), 1, 'popped');
  const m = g.dv.getUint32(rec(1) + L.PG_M, true);
  const when = (m >>> 16) - 1;
  assert.ok(guarded(m, g.v.party().t) && !guarded(m, when + MC.BL_GUARD), 'guarded, till BL_GUARD on');
  assert.equal(rammed(g), 1, 'again at once: guarded');
  at(g, when + MC.BL_GUARD);
  assert.equal(rammed(g), 2, 'after the guard: popped');
});

test('the steal: a pop gives the popper back one it had lost, never a fourth, and none in the last ring', async () => {
  const run = async (mine, t = 1000) => {
    const g = await room(2);
    flat(g);
    at(g, t);
    put(g, 0, C - 5, C, { vx: 9, lost: mine });
    put(g, 1, C + 0.5, C);
    const n0 = g.v.fxCount();
    for (let k = 0; k < 70; k++) g.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, move: 1 })]]);
    return { mine: lost(g, 0), theirs: lost(g, 1), pop: fxs(g.v, MC.BL_FX_POP, n0)[0] };
  };
  const a = await run(2);
  assert.deepEqual([a.mine, a.theirs, !!(a.pop.shot & 1024)], [1, 1, true], 'one back');
  const b = await run(0);
  assert.deepEqual([b.mine, b.theirs, !!(b.pop.shot & 1024)], [0, 1, false], 'three at most');
  const c = await run(1, MC.BL_CLOSE1 + 10);
  assert.deepEqual([c.mine, c.theirs, !!(c.pop.shot & 1024)], [1, 1, false], 'none in the last ring');
});

test('out of balloons: the last popped puts it out, the KO and the feed to the popper; the last one in wins', async () => {
  const g = await room(3);
  flat(g);
  at(g, 1000);
  put(g, 0, C - 5, C, { vx: 9 });
  put(g, 1, C + 0.5, C, { lost: 2 });
  put(g, 2, C, C + 12, { lost: 2 });
  const n0 = g.v.fxCount();
  assert.ok(until(g, () => g.v.partier(1).out, 60, partyWord({ yaw: 0, move: 1 })), 'P2 out');
  assert.equal(g.v.partier(0).kos, 1, 'a KO for P1');
  const [sink] = fxs(g.v, L.FX_SINK, n0);
  assert.deepEqual([sink.owner, sink.shot], [1, 0]);
  assert.equal(balloon.sink(sink, (p) => `P${p + 1}`), 'P1 POPPED P2 OUT');
  assert.equal(g.v.hole().state, L.H_PLAY, 'two still in');
  // P3's last to a POW: the round is P1's
  put(g, 0, C, C + 8, { item: L.PU_POW });
  g.step();
  g.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, use: 1 })]]);
  for (let k = 0; k < 5 && g.v.partier(0).place === 0; k++) g.step();
  assert.ok(g.v.partier(2).out);
  assert.deepEqual([g.v.partier(0).place, g.v.partier(1).place, g.v.partier(2).place], [1, 3, 2]);
  assert.equal(g.v.party().winner, 0);
});

test('the clock: at 90 s the balls still in share the win; a ball alone plays on to it and wins; a late joiner watches', async () => {
  const g = await room(3, { seed: 4 });
  flat(g);
  g.step([[L.EV_JOIN, 3]]);
  assert.ok(g.v.partier(3).out, 'P4 watches');
  put(g, 0, C - 3, C, { lost: 2 });
  put(g, 1, C + 3, C);
  put(g, 2, C, C + 4, { lost: 1 });
  at(g, MC.BL_LEN - 3);
  for (let k = 0; k < 10; k++) g.step();
  assert.equal(g.v.hole().state, L.H_OVER);
  assert.deepEqual([0, 1, 2].map((p) => g.v.partier(p).place), [1, 1, 1]);
  assert.equal(g.v.party().winner, 255, 'shared');
  const one = await room(1, { seed: 6 });
  at(one, MC.BL_LEN - 300);
  for (let k = 0; k < 290; k++) one.step();
  assert.equal(one.v.hole().state, L.H_PLAY, 'alone, it plays on');
  for (let k = 0; k < 20; k++) one.step();
  assert.equal(one.v.hole().state, L.H_OVER);
  assert.deepEqual([one.v.partier(0).place, one.v.partier(0).wins], [1, 1]);
});

test('the power-ups: the first BL_DROP0 into play, one more for every BL_DROPN in, landing on the floor or the box under them; the first ball into one takes it; one on a crate the wall takes falls to the floor', async () => {
  const g = await room(40, { seed: 9 });
  const st = stage(g.v);
  at(g, MC.BL_DROP0 - 1);
  g.step();
  assert.equal(stage(g.v).orbs.length, 0, 'none before');
  g.step();
  const first = stage(g.v).orbs;
  assert.equal(first.length, 1 + Math.floor(40 / MC.BL_DROPN));
  assert.ok(first.every((o) => o.falling && o.y > PLAT_Y + 30), 'falling from high');
  assert.ok(fxs(g.v, L.FX_DROP).length >= first.length);
  // the room parked away, they land
  park(g, 40, 0, ...first.map((o) => [o.x, o.z]));
  for (let k = 0; k < 520; k++) g.step();
  const landed = stage(g.v).orbs.filter((o) => first.some((f) => f.k === o.k));
  assert.equal(landed.length, first.length);
  for (const o of landed) {
    assert.ok(!o.falling, 'lying');
    assert.equal(o.y, groundAt(st, o.x, o.z, PLAT_Y + 30, g.v.party().t), 'on what is under it');
  }
  // P1 rolled into one takes it
  const o = landed[0];
  put(g, 0, o.x - 3, o.z, { y: o.y, vx: 5 });
  assert.ok(until(g, () => g.v.partier(0).item, 120, roll(0)), 'P1 holds it');
  assert.equal(g.v.partier(0).item, o.kind);
  assert.ok(fxs(g.v, L.FX_PICKUP).some((f) => f.owner === 0));
  // one lying on a crate the wall is about to take (the two balls in the room on the tower, out of reach)
  const h = await room(2, { seed: 9 });
  const low = stage(h.v).boxes.find((b) => b.kind === MC.BL_KLOW);
  const a = L.PG_S + MC.BL_ORBS + 16 * 31;
  h.dv.setFloat32(a, low.x, true); h.dv.setFloat32(a + 4, PLAT_Y + MC.BL_LOW, true); h.dv.setFloat32(a + 8, low.z, true);
  h.v.u8[a + 12] = L.PU_DASH; h.v.u8[a + 13] = 2; h.dv.setUint16(a + 14, 1000, true);
  put(h, 0, C - 0.5, C, { y: PLAT_Y + MC.BL_T2H });
  put(h, 1, C + 0.5, C + 2, { y: PLAT_Y + MC.BL_T1H });
  at(h, low.gone - 10);
  for (let k = 0; k < 40; k++) h.step();
  assert.deepEqual([h.v.u8[a + 12], h.v.u8[a + 13], h.dv.getFloat32(a + 4, true)], [L.PU_DASH, 2, PLAT_Y], 'down on the floor');
});

test('the prediction matches the confirmed ball bit for bit: into a crate\'s side, a hop onto it, off it, up the tower, and the wall closing on it with a crate sinking under it', async () => {
  // the words, found by driving the confirmed ball once: at a crate's side on the floor and bounced, back,
  // a hop onto it, across and off; then from 9 m out at the tower, a hop onto its base and another onto its
  // top, each hop taken when the ball's edge reaches the side over a step up and its centre crosses in time
  const drive = async () => {
    const g = await room(2, { seed: 13 });
    const low = stage(g.v).boxes.find((b) => b.kind === MC.BL_KLOW);
    park(g, 2, 1, [low.x, low.z], [C, C], [C - 9, C]);
    put(g, 0, low.x - low.h - 7, low.z);
    return { g, low };
  };
  const timely = (e, v) => v > 0 && (e - 1) / v >= 0.1 && e / v <= 0.42;
  const { g: d, low } = await drive();
  const crate = [], tower = [], seen = { side: false, crate: false, base: false, top: 0 };
  for (let k = 0; k < 600 && !(seen.crate && d.v.partier(0).pos[0] > low.x + low.h + 2 && d.v.partier(0).ground); k++) {
    const b = d.v.partier(0);
    const w = k < 180 ? roll(0) : k < 270 ? roll(Math.PI) : roll(0, { hop: b.ground && b.pos[1] === PLAT_Y && timely(low.x - low.h - b.pos[0], b.vel[0]) ? 1 : 0 });
    crate.push(w);
    d.step([[L.EV_INPUT, 0, w]]);
    const a = d.v.partier(0);
    if (k < 180 && a.vel[0] < 0) seen.side = true;
    if (a.pos[1] === PLAT_Y + MC.BL_LOW && Math.abs(a.pos[0] - low.x) <= low.h) seen.crate = true;
  }
  put(d, 0, C - 9, C);
  for (let k = 0; k < 600 && seen.top < 40; k++) {
    const b = d.v.partier(0), y = b.pos[1] - PLAT_Y;
    let w;
    if (y === MC.BL_T2H) w = b.vel[0] > 0.3 ? roll(Math.PI) : partyWord({ yaw: 0 });
    else {
      const e = y === 0 ? C - MC.BL_T1 - b.pos[0] : C - MC.BL_T2 - b.pos[0];
      w = partyWord({ yaw: 0, move: b.vel[0] < 4.5 ? 1 : 0, hop: b.ground && timely(e, b.vel[0]) ? 1 : 0 });
    }
    tower.push(w);
    d.step([[L.EV_INPUT, 0, w]]);
    const a = d.v.partier(0);
    if (a.pos[1] === PLAT_Y + MC.BL_T1H && a.ground) seen.base = true;
    if (a.pos[1] === PLAT_Y + MC.BL_T2H && a.ground) seen.top++;
  }
  assert.deepEqual([seen.side, seen.crate, seen.base, seen.top >= 40], [true, true, true, true], JSON.stringify(seen));
  const { g } = await drive();
  assert.ok(predicted(g, crate) >= crate.length - 10);
  put(g, 0, C - 9, C);
  assert.ok(predicted(g, tower) >= tower.length - 10);
  assert.equal(g.v.partier(0).pos[1], PLAT_Y + MC.BL_T2H, 'on the tower\'s top');
  // the wall closing on a ball at it, and the crate it stands on sinking as the wall reaches it
  const g2 = await room(2, { seed: 17 });
  const st2 = stage(g2.v);
  const b = st2.boxes.filter((o) => o.kind === MC.BL_KLOW).reduce((a, o) => (o.gone < a.gone ? o : a));
  park(g2, 2, 1, [b.x, b.z]);
  at(g2, b.gone - 200);
  put(g2, 0, b.x, b.z, { y: PLAT_Y + MC.BL_LOW });
  const out = Math.atan2(b.z - C, b.x - C);
  assert.ok(predicted(g2, Array.from({ length: 420 }, (_, k) => (k < 260 ? partyWord({ yaw: 0 }) : roll(out)))) >= 400);
  const p = g2.v.partier(0);
  assert.equal(p.pos[1], PLAT_Y, 'the crate went from under it');
  // (pushed on the step's own tick, one before the clock it leaves)
  assert.ok(Math.abs(Math.hypot(p.pos[0] - C, p.pos[2] - C) - (wallAt(st2, g2.v.party().t - 1) - 1)) < 1e-3, 'held at the wall as it closes');
});

test('the client module: draws every phase, the wall, the boxes and every ball\'s balloons; frames the arena; its HUD lines fit; its brain steers round, hops up, fires at a rival and jumps down on one', async () => {
  const { Scene, LOOK } = await import('../client/party-render.mjs');
  for (const n of [3, 140]) {
    const g = await room(n, { seed: 41 + n, play: false });
    const st = stage(g.v);
    const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null };
    const lines = [];
    const hctx = { put: (x, y, s, c) => lines.push([y, s, c]), centre: (y, s, c) => lines.push([y, s, c]), right: (y, s, c) => lines.push([y, s, c]), rows: 44, C: {}, slot: 0, now: 0 };
    for (const t of [-1, 10, MC.BL_DROP0 + 200, MC.BL_CLOSE0 + 600, MC.BL_CLOSE1 + 10]) {
      if (t >= 0) {
        while (g.v.hole().state !== L.H_PLAY) g.step();
        at(g, t);
        g.step();
      }
      if (t === MC.BL_CLOSE0 + 600) g.dv.setUint32(rec(1) + L.PG_M, 1 | ((t - 5) << 16), true);
      const T = g.v.tick;
      out.scene.clear(); out.decals.length = 0; out.beams.length = 0; out.glow.length = 0; out.solid.length = 0; lines.length = 0;
      balloon.draw(g.v, { tick: T, t: Math.max(0, t) * TICK, pt: Math.max(0, t) * TICK, dt: 0, now: 1100, slot: 0, me: g.v.partier(0), pme: g.v.partier(0), ptick: T, pview: g.v }, out);
      const D = out.scene.data;
      for (let k = 0; k < out.scene.count * 16; k++) assert.ok(Number.isFinite(D[k]), 'finite');
      const solids = [...Array(out.scene.count).keys()].map((k) => ({ shape: D[16 * k + 3] % 4, x: D[16 * k], z: D[16 * k + 2], hx: D[16 * k + 4], look: D[16 * k + 11] }));
      assert.equal(solids[0].look, LOOK.CHECKER, 'the mat first');
      const tp = t >= 0 ? g.v.party().t : 0;
      const rim = wallAt(st, tp);
      const pillars = solids.filter((s) => s.shape === 1 && Math.abs(s.hx - 0.62) < 1e-6);
      assert.ok(pillars.length >= 24 && pillars.every((s) => Math.abs(Math.hypot(s.x - C, s.z - C) - rim - 0.6) < 1e-3), `${pillars.length} pillars at the wall`);
      const shown = st.boxes.filter((b) => topAt(b, tp) > 0.01).length;
      assert.ok(solids.filter((s) => s.shape === 0).length >= shown, 'the boxes');
      // a balloon is a sphere 0.42 m across its middle: three a ball, one fewer for P2 once it has lost one
      const want = 3 * n - (t >= MC.BL_CLOSE0 + 600 ? 1 : 0);
      assert.equal(solids.filter((s) => s.shape === 3 && Math.abs(s.hx - 0.42) < 1e-6).length, want, `t ${t}: the balloons`);
      balloon.hud(g.v, { ...hctx, me: g.v.partier(0), t: Math.max(0, t) * TICK });
      const text = lines.map((l) => l[1]).join(' | ');
      if (t >= 0) assert.ok(/BALLOONS OOO/.test(text) && /WALL|RING/.test(text) && /BALLS LEFT/.test(text), text);
      for (const l of lines) assert.ok(l[1].length <= 80, l[1]);
      const fr = balloon.frame(g.v);
      assert.equal(fr.shape, 'disc');
      assert.ok(Math.abs(fr.radius - st.r0) < 1e-4);
    }
  }
  assert.ok(balloon.hint.length <= 70 && balloon.rules.length <= 80);
  // the brain, on a staged room of three
  const g = await room(3, { seed: 23 });
  const st = stage(g.v);
  at(g, 1000);
  g.step();
  const tall = st.boxes.find((b) => b.kind === MC.BL_KHIGH);
  const low = st.boxes.find((b) => b.kind === MC.BL_KLOW);
  const me = g.v.partier(0);
  const B = balloon.brain;
  assert.ok(B.danger(g.v, C + st.r0 - 0.5, C, g.v.tick, me) > 0.2, 'the wall');
  assert.ok(B.danger(g.v, tall.x, tall.z, g.v.tick, me) > 0.2, 'a tall crate from the floor');
  assert.equal(B.danger(g.v, low.x, low.z, g.v.tick, { ...me, pos: [low.x - 8, PLAT_Y, low.z] }), 0, 'a low one: a hop gets it up');
  const bot = (pos, vel, mem = {}) => ({ slot: 0, skill: 0.9, pos, vel, mem, lag: 0, at: g.v.tick, rand: () => 0.1 });
  // (the brain reads the world once a tick: told again after each put)
  const fresh = () => { g.v._blw = null; g.v._bl = null; };
  // rolling at a low crate's side: a hop
  put(g, 0, low.x - low.h - 2.4, low.z, { vx: 7 });
  park(g, 3, 1, [low.x, low.z]);
  fresh();
  assert.equal(B.hop(g.v, g.v.partier(0), bot([low.x - low.h - 2.4, low.z], [7, 0])), true, 'hops at the crate');
  assert.equal(B.hop(g.v, g.v.partier(0), bot([low.x - low.h - 2.4, low.z], [-7, 0])), false, 'not rolling away');
  // a rival in reach with a POW in hand: used; with a ROCKET, aimed at it
  put(g, 0, C + 8, C, { item: L.PU_POW });
  put(g, 1, C + 8, C + 5);
  park(g, 3, 2, [C + 8, C], [low.x, low.z]);
  g.dv.setUint32(L.HDR_START, g.v.tick - 2000, true);
  fresh();
  let w = B.think(g.v, g.v.partier(0), bot([C + 8, C], [0, 0]), g.v.tick);
  assert.ok(w?.use, 'the POW');
  put(g, 0, C + 8, C, { item: L.PU_ROCKET });
  fresh();
  w = B.think(g.v, g.v.partier(0), bot([C + 8, C], [0, 0]), g.v.tick);
  assert.ok(w?.use && Math.abs(w.yaw - Math.PI / 2) < 0.05, `the rocket at it, ${w?.yaw}`);
  // up on a crate with a rival below it 4 m off: off and down at it, a hop to carry it there
  put(g, 0, low.x, low.z, { y: PLAT_Y + MC.BL_LOW });
  put(g, 1, low.x + 4, low.z);
  fresh();
  w = B.think(g.v, g.v.partier(0), bot([low.x, low.z], [0, 0]), g.v.tick);
  assert.ok(w && w.hop && Math.abs(w.yaw) < 0.2, `jumps down at it: ${JSON.stringify(w)}`);
  // its goal: a power-up near with its hands free, else the rival
  put(g, 0, C + 8, C);
  put(g, 1, C + 8, C + 5);
  fresh();
  const goal = B.goal(g.v, g.v.partier(0), bot([C + 8, C], [0, 0]));
  assert.ok(goal.every(Number.isFinite) && Math.hypot(goal[0] - (C + 8), goal[1] - (C + 5)) < 8, `at P2: ${goal}`);
});

for (const [balls, sd] of [[8, 5], [64, 5]]) {
  test(`a round of ${balls} AI balls (the Partier, this brain) on the debug build: no trap, stomps, rams and blasts, outs through the round, a winner; equal on 1 and 4 threads`, async () => {
    let start = -1, over = -1, places = null, pts = null, outs = 0, trap = 0, seen = 0;
    const how = [0, 0, 0], outAt = [];
    const ticks = L.P_COUNT + MC.BL_LEN + 80 + balls;
    const { log, sim } = await playParty({ bytes: partyBytes(true), seed: sd, mg: L.MG_BALLOON, bots: balls, ticks, delay: 6, onTick: (t, s, v) => {
      if (s.error().code) trap = s.error().code;
      const g = v.party();
      if (start < 0 && g.state === L.H_PLAY) start = t;
      for (let k = seen; k < v.fxCount(); k++) {
        const f = v.fx(k);
        if (f.kind === MC.BL_FX_POP && start >= 0) how[(f.shot >> 8) & 3]++;
        if (f.kind === L.FX_SINK && start >= 0 && over < 0) outAt.push(t - start);
      }
      seen = v.fxCount();
      if (over < 0 && start >= 0 && g.state === L.H_OVER) {
        over = t;
        places = [...Array(balls).keys()].map((p) => v.partier(p).place);
        pts = [...Array(balls).keys()].map((p) => v.partier(p).pts);
        outs = [...Array(balls).keys()].filter((p) => v.partier(p).out).length;
      }
    } });
    assert.equal(trap, 0, 'no trap');
    assert.ok(over > 0 && over - start <= MC.BL_LEN, 'the round ended, by the clock at the latest');
    assert.ok(how.every((n) => n > 0), `pops: ${how[0]} stomps, ${how[1]} rams, ${how[2]} blasts`);
    assert.ok(outs >= Math.floor(balls / 2), `${outs} of ${balls} out`);
    assert.ok(outAt.some((t) => t < MC.BL_CLOSE0) && outAt.some((t) => t >= MC.BL_CLOSE0), `outs through the round: ${outAt.map((t) => Math.round(t * TICK))}`);
    assert.ok(places.every((x) => x >= 1 && x <= balls), `places ${places}`);
    assert.ok(pts.every((x) => x >= 1 && x <= 10), `points ${pts}`);
    assert.ok(places.includes(1) && pts.includes(10), 'somebody won');
    assert.equal(new View(sim.memory.buffer).party().game, L.MG_BALLOON);
    const parsed = parseLog(log);
    const n = over + 40;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}
