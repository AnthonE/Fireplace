// KART GRAB (src/mg/kart.wat): the course for the crowd, the kart's handling
// (gas, brake, reverse, the turn, the grip, the drift and its mini-turbos),
// the walls and the blocks, the panels and the mushroom, the coins, the item
// boxes, the hits; the prediction bit for bit; rounds of AI karts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/kart.mjs'; // KT_*: the minigame's own constants
import kartMg, { course, coins, coinAt, kartOf } from '../client/mg/kart.mjs';

const C = L.B_CX;
const TICK = 0.008;
const f = Math.fround;

// A room of n karts on KART GRAB, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_KART + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
const H = (g) => g.dv.getFloat32(L.PG_H + MC.KT_HALF, true);
// Kart p at (x, z) on the floor (or y), going (vx, vz), heading h (1/16384 turns), nothing else on it.
function put(g, p, x, z, { y = PLAT_Y, vx = 0, vz = 0, h = 0, ground = true } = {}) {
  const d = g.dv, a = rec(p);
  d.setFloat32(a + L.P_PX, x, true); d.setFloat32(a + L.P_PY, y, true); d.setFloat32(a + L.P_PZ, z, true);
  d.setFloat32(a + L.P_VX, vx, true); d.setFloat32(a + L.P_VY, 0, true); d.setFloat32(a + L.P_VZ, vz, true);
  d.setUint8(a + L.P_FL, L.PF_LIVE | (ground ? L.PF_GROUND : 0));
  d.setUint32(a + L.PG_M, h, true);
  d.setUint16(a + L.B_DASH, 0, true);
}
// Every kart but slot 0 out of the way: down (nothing reaches it) and not back while the test lasts.
function park(g, n) {
  g.dv.setUint32(L.PG_RESPAWN, 1 << 30, true);
  for (let p = 1; p < n; p++) {
    put(g, p, C + H(g) - 2, C + H(g) - 2);
    g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE | L.PF_DEAD);
    g.dv.setUint32(rec(p) + L.B_OUTAT, g.v.tick, true);
  }
}
const kartAt = (g, p) => kartOf(g.dv.getUint32(rec(p) + L.PG_M, true));
const speed = (g, p) => Math.hypot(g.dv.getFloat32(rec(p) + L.P_VX, true), g.dv.getFloat32(rec(p) + L.P_VZ, true));
const pos = (g, p) => [0, 4, 8].map((o) => g.dv.getFloat32(rec(p) + L.P_PX + o, true));
const score = (g, p) => g.dv.getUint16(rec(p) + L.PG_SCORE, true);
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
const drive = (g, word, n = 1) => { for (let k = 0; k < n; k++) g.step([[L.EV_INPUT, 0, word]]); };
const live = (g) => g.dv.getUint32(L.PG_H + MC.KT_LIVE, true);
// No coins, and none dropping: the count told it's full (nothing else reads it).
function noCoins(g) {
  g.sim.u8.fill(0, L.PG_BIG + MC.KT_COINS, L.PG_BIG + MC.KT_COINS + MC.KT_MAX * MC.KT_CSIZE);
  g.dv.setUint32(L.PG_H + MC.KT_LIVE, 1 << 20, true);
}
// No boxes till long after the test.
function noBoxes(g) {
  const n = g.dv.getUint32(L.PG_H + MC.KT_NBOX, true);
  for (let i = 0; i < n; i++) g.dv.setUint32(L.PG_S + MC.KT_BOX + 12 * i + 8, 1 << 30, true);
}
function putCoin(g, c, x, z, { v = 1, kind = MC.KT_KDROP, t0 = g.v.tick - 200, air = 10 } = {}) {
  const a = L.PG_BIG + MC.KT_COINS + c * MC.KT_CSIZE, d = g.dv;
  d.setFloat32(a + MC.KT_C_X, x, true); d.setFloat32(a + MC.KT_C_Z, z, true);
  d.setFloat32(a + MC.KT_C_X0, x, true); d.setFloat32(a + MC.KT_C_Y0, PLAT_Y + MC.KT_CY, true); d.setFloat32(a + MC.KT_C_Z0, z, true); d.setFloat32(a + MC.KT_C_H, 0, true);
  d.setUint32(a + MC.KT_C_T0, t0, true); d.setUint16(a + MC.KT_C_AIR, air, true); d.setUint8(a + MC.KT_C_V, v); d.setUint8(a + MC.KT_C_KIND, kind);
}
// The next step plays tick t into play.
function at(g, t) {
  const now = g.v.tick;
  g.dv.setUint32(L.HDR_START, now - t, true);
  g.dv.setUint32(L.HDR_UNTIL, now - t + MC.KT_LEN, true);
}
const W = (o) => partyWord(o);
const want = (n, fever = false) => { const k = Math.min(MC.KT_CCAP, MC.KT_C0 + ((n * MC.KT_CN) >> 1)); return fever ? k + (k >> 1) : k; };

test('the course for 1, 8, 64 and 256: a walled square sized for the crowd, blocks and panels on the lattice, boxes in the cells and round the middle, every kart on it clear of the blocks', async () => {
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const half = Math.min(f(f(f(Math.sqrt(n)) * MC.KT_HK) + MC.KT_H0), MC.KT_HMAX);
    assert.ok(Math.abs(H(g) - half) < 1e-4, `${H(g)} m for ${n}`);
    assert.deepEqual([r.game, r.kind, r.len, r.size, r.acc, r.hop], [L.MG_KART, L.PK_SCORE, MC.KT_LEN, H(g), 0, 0]);
    const m = Math.floor((half - MC.KT_MRIM) / MC.KT_S);
    const w = course(g.v);
    assert.equal(w.blocks.length, ((2 * m + 1) ** 2 + 1) / 2 - 1, `${n}: blocks`);
    assert.equal(w.pads.length, ((2 * m + 1) ** 2 - 1) / 2, `${n}: panels`);
    assert.equal(w.boxes.length, MC.KT_NRING + 4 * m * m, `${n}: boxes`);
    for (const b of w.blocks) {
      assert.ok(Math.abs(b.x - C) + MC.KT_BLOCK < half - 3 && Math.abs(b.z - C) + MC.KT_BLOCK < half - 3, 'a block well in');
      assert.equal((Math.round((b.x - C) / MC.KT_S) + Math.round((b.z - C) / MC.KT_S)) & 1, 0);
    }
    for (const p of w.pads) {
      // its way runs round the middle, the way the heading grows
      const a = p.way * Math.PI / 2, rx = p.x - C, rz = p.z - C;
      const round = rx * Math.sin(a) - rz * Math.cos(a), out = rx * Math.cos(a) + rz * Math.sin(a);
      assert.ok(round > 0 && Math.abs(out) < round, `panel ${p.i} way ${p.way} at ${rx}, ${rz}`);
      for (const b of w.blocks) assert.ok(Math.hypot(p.x - b.x, p.z - b.z) >= MC.KT_S - 1e-3);
    }
    for (const b of w.boxes) for (const k of w.blocks) assert.ok(Math.max(Math.abs(b.x - k.x), Math.abs(b.z - k.z)) > MC.KT_BLOCK + 2, 'a box clear of the blocks');
    for (let p = 0; p < n; p++) {
      const [x, y, z] = pos(g, p);
      assert.equal(y, PLAT_Y, `${n}: P${p + 1} on the floor`);
      assert.ok(Math.abs(x - C) < half - 1 && Math.abs(z - C) < half - 1, `${n}: P${p + 1} inside the walls`);
      for (const b of w.blocks) assert.ok(Math.max(Math.abs(x - b.x), Math.abs(z - b.z)) >= MC.KT_BLOCK + 1 - 1e-3, `${n}: P${p + 1} clear of the blocks`);
    }
  }
});

test('the coins drop in as play starts, in lines clear of the blocks, as many as the course keeps for the crowd; a line every KT_EVERY ticks while it is short, twice as often in the fever', async () => {
  for (const n of [2, 8, 64]) {
    const g = await room(n, { seed: 30 + n });
    assert.ok(live(g) >= want(n) && live(g) < want(n) + 3, `${live(g)} coins for ${n}`);
    const w = course(g.v);
    for (const k of coins(g.v)) {
      assert.equal(k.kind, MC.KT_KDROP);
      assert.ok(Math.abs(k.x - C) <= H(g) - MC.KT_IN + 1e-3 && Math.abs(k.z - C) <= H(g) - MC.KT_IN + 1e-3, 'on the floor');
      for (const b of w.blocks) assert.ok(Math.max(Math.abs(k.x - b.x), Math.abs(k.z - b.z)) >= MC.KT_BLOCK + 1.2 - 1e-3, 'clear of the blocks');
      assert.equal(k.y0, f(PLAT_Y + MC.KT_DROPH));
    }
  }
  const g = await room(4, { seed: 5 });
  park(g, 4);
  put(g, 0, C - H(g) + 1, C - H(g) + 1);
  g.dv.setUint8(rec(0) + L.P_FL, L.PF_LIVE | L.PF_DEAD);
  g.dv.setUint32(rec(0) + L.B_OUTAT, g.v.tick, true);
  g.sim.u8.fill(0, L.PG_BIG + MC.KT_COINS, L.PG_BIG + MC.KT_COINS + MC.KT_MAX * MC.KT_CSIZE);
  g.dv.setUint32(L.PG_H + MC.KT_LIVE, 0, true);
  at(g, 400);
  const lines = (ticks) => { const n0 = live(g); for (let k = 0; k < ticks; k++) g.step(); return (live(g) - n0) / 3; };
  assert.equal(lines(MC.KT_EVERY * 3), 3, 'a line a KT_EVERY');
  at(g, MC.KT_FEVER);
  assert.equal(lines(MC.KT_EVERYF * 3), 3, 'a line a KT_EVERYF in the fever');
  g.dv.setUint32(L.PG_H + MC.KT_LIVE, want(4, true), true);
  assert.equal(lines(MC.KT_EVERYF * 3), 0, 'none while the course has enough');
});

test('the kart: gas to KT_VMAX, its heading turning toward the yaw KT_TURN a tick at speed and less standing; the brake stops it and backs it to KT_VREV; with neither it coasts', async () => {
  const g = await room(2, { seed: 3 });
  park(g, 2);
  noCoins(g);
  noBoxes(g);
  put(g, 0, C - 14, C - 10);
  drive(g, W({ yaw: 0, move: 1 }), 50);
  assert.ok(Math.abs(speed(g, 0) - 50 * MC.KT_ACC) < 1e-3, `${speed(g, 0)} m/s after 0.4 s`);
  drive(g, W({ yaw: 0, move: 1 }), 80);
  assert.equal(speed(g, 0), MC.KT_VMAX);
  assert.equal(kartAt(g, 0).h, 0);
  // the turn at speed: KT_TURN a tick, the velocity following the nose
  drive(g, W({ yaw: 4096, move: 1 }), 10);
  assert.equal(kartAt(g, 0).h, 10 * MC.KT_TURN);
  const [vx, , vz] = [0, 4, 8].map((o) => g.dv.getFloat32(rec(0) + L.P_VX + o, true));
  // the grip: the velocity a few ticks' turn behind the nose (KT_TURN / (1 - KT_GRIP) at most)
  const lagged = 10 * MC.KT_TURN - Math.atan2(vz, vx) / (2 * Math.PI) * 16384;
  assert.ok(lagged > 0 && lagged < MC.KT_TURN / (1 - MC.KT_GRIP), `the velocity ${lagged} behind the nose`);
  // the brake: down to a stop, then backing up
  put(g, 0, C - 14, C - 10, { vx: MC.KT_VMAX });
  let k = 0;
  while (g.dv.getFloat32(rec(0) + L.P_VX, true) > 0 && k++ < 200) drive(g, W({ yaw: 0, move: 2 }));
  assert.ok(k >= MC.KT_VMAX / MC.KT_BRAKE - 2 && k <= MC.KT_VMAX / MC.KT_BRAKE + 2, `stopped in ${k} ticks`);
  drive(g, W({ yaw: 0, move: 2 }), 200);
  assert.ok(Math.abs(g.dv.getFloat32(rec(0) + L.P_VX, true) + MC.KT_VREV) < 1e-4, 'backing at KT_VREV');
  // coasting
  put(g, 0, C - 14, C - 10, { vx: 10 });
  drive(g, W({ yaw: 0 }), 125);
  assert.ok(Math.abs(speed(g, 0) - 10 * MC.KT_COAST ** 125) < 0.05, `${speed(g, 0)} coasting`);
  // standing, it turns KT_TURN0 as fast
  put(g, 0, C - 14, C - 10);
  drive(g, W({ yaw: 4096 }), 10);
  assert.equal(kartAt(g, 0).h, 10 * Math.trunc(f(MC.KT_TURN * f(MC.KT_TURN0))));
});

test('the walls hold a kart in at any height and take most of its speed; the blocks hold it out under their tops, and one coming down on a block lands on it', async () => {
  const g = await room(8, { seed: 9 });
  park(g, 8);
  noCoins(g);
  noBoxes(g);
  const h = H(g);
  put(g, 0, C, C - 10, { vx: MC.KT_VMAX });
  let most = 0, back = 0;
  for (let k = 0; k < 200; k++) {
    drive(g, W({ yaw: 0, move: 1 }));
    most = Math.max(most, pos(g, 0)[0]);
    back = Math.min(back, g.dv.getFloat32(rec(0) + L.P_VX, true));
  }
  assert.ok(most <= C + h - 1 + 1e-4, `${most - C} against a wall at ${h}`);
  assert.ok(back < -0.3 * MC.KT_VMAX && back >= -MC.KT_WALLE * MC.KT_VMAX - 0.2, `thrown back at ${back}`);
  // high up (a SPRING), still held
  put(g, 0, C - h + 3, C - 10, { y: PLAT_Y + 6, vx: -20, ground: false });
  for (let k = 0; k < 60; k++) { drive(g, W({ yaw: 8192 })); assert.ok(pos(g, 0)[0] >= C - h + 1 - 1e-4); }
  // into the block at (14, -14) from the lane below it, nose first
  const blk = course(g.v).blocks.find((b) => b.x > C && b.z < C);
  put(g, 0, blk.x, C - 4, { vz: -MC.KT_VMAX, h: 12288 });
  for (let k = 0; k < 150; k++) {
    drive(g, W({ yaw: 12288, move: 1 }));
    assert.ok(pos(g, 0)[2] >= blk.z + MC.KT_BLOCK + 1 - 1e-4, `${pos(g, 0)[2] - blk.z} m off the block`);
  }
  // a corner: out the shortest way
  put(g, 0, blk.x - MC.KT_BLOCK - 0.5, blk.z + MC.KT_BLOCK + 0.5, { vx: 3, vz: -3 });
  drive(g, W({ yaw: 14336 }), 3);
  const [x, , z] = pos(g, 0);
  const qx = Math.min(Math.max(x, blk.x - MC.KT_BLOCK), blk.x + MC.KT_BLOCK), qz = Math.min(Math.max(z, blk.z - MC.KT_BLOCK), blk.z + MC.KT_BLOCK);
  assert.ok(Math.hypot(x - qx, z - qz) >= 1 - 1e-3, 'clear of the corner');
  // dropped onto it
  put(g, 0, blk.x + 0.5, blk.z - 0.5, { y: PLAT_Y + MC.KT_BLOCKH + 3, ground: false });
  drive(g, W({ yaw: 0 }), 120);
  assert.equal(pos(g, 0)[1], f(PLAT_Y + MC.KT_BLOCKH), 'on the block');
  assert.ok(g.v.partier(0).ground);
});

test('a drift: Space held at speed with the yaw off the nose hops into it; held, it turns that way, keeps its speed and charges; let go it boosts KT_MTB1 or KT_MTB2 by the charge, its FX on its bank; Space going straight is no drift', async () => {
  const g = await room(2, { seed: 4 });
  park(g, 2);
  noCoins(g);
  noBoxes(g);
  put(g, 0, C - 12, C - 8, { vx: MC.KT_VMAX });
  drive(g, W({ yaw: 0, move: 1, hop: 1 }), 30);
  assert.equal(kartAt(g, 0).dir, 0, 'straight: no drift');
  const k0 = g.v.fxCount();
  drive(g, W({ yaw: 4096, move: 1, hop: 1 }));
  assert.equal(kartAt(g, 0).dir, MC.KT_DL, 'drifting toward +');
  assert.equal(g.dv.getFloat32(rec(0) + L.P_VY, true), MC.KT_HOPV, 'with a hop');
  let low = Infinity, h0 = kartAt(g, 0).h;
  for (let k = 0; k < 140; k++) {
    drive(g, W({ yaw: (h0 + 40) & 16383, move: 1, hop: 1 }));
    low = Math.min(low, speed(g, 0));
    const h = kartAt(g, 0).h, dh = (h - h0 + 16384) & 16383;
    assert.ok(dh >= MC.KT_DTURN0 && dh <= MC.KT_DTURN1, `turning its way ${dh} a tick`);
    h0 = h;
  }
  assert.ok(low > MC.KT_VMAX - 2, `kept its speed (${low})`);
  const c = kartAt(g, 0).charge;
  assert.ok(c >= MC.KT_MT1, `charged ${c}`);
  drive(g, W({ yaw: h0, move: 1 }));
  const lvl = c >= MC.KT_MT2 ? 2 : 1;
  assert.equal(lvl, 1, 'a gentle drift: a mini-turbo');
  assert.equal(kartAt(g, 0).dir, 0);
  assert.equal(g.v.partier(0).dash, (lvl === 2 ? MC.KT_MTB2 : MC.KT_MTB1));
  const b = fxs(g.v, MC.KT_FX_BOOST, k0);
  assert.equal(b.length, 1);
  assert.deepEqual([b[0].owner, b[0].shot], [0, lvl]);
  drive(g, W({ yaw: h0, move: 1 }), 40);
  assert.ok(speed(g, 0) > MC.KT_VMAX + 3, `boosted to ${speed(g, 0)}`);
  // a short one: no boost; a long one: the long boost
  put(g, 0, C - 12, C - 8, { vx: MC.KT_VMAX });
  drive(g, W({ yaw: 4096, move: 1, hop: 1 }), 20);
  drive(g, W({ yaw: 0, move: 1 }));
  assert.equal(g.v.partier(0).dash, 0, 'too short to charge');
  put(g, 0, C - 12, C - 8, { vx: MC.KT_VMAX });
  drive(g, W({ yaw: 4096, move: 1, hop: 1 }));
  for (let k = 0; k < 200; k++) drive(g, W({ yaw: (kartAt(g, 0).h + 3000) & 16383, move: 1, hop: 1 }));
  assert.equal(kartAt(g, 0).charge, 255);
  drive(g, W({ yaw: 0, move: 1 }));
  assert.equal(g.v.partier(0).dash, MC.KT_MTB2);
  // slowed right down, it lets go of itself
  put(g, 0, C - 12, C - 8, { vx: MC.KT_VMAX });
  drive(g, W({ yaw: 4096, move: 1, hop: 1 }), 30);
  let n = 0;
  while (kartAt(g, 0).dir && n++ < 400) drive(g, W({ yaw: 4096, move: 2, hop: 1 }));
  assert.ok(n < 400 && speed(g, 0) < MC.KT_DRIFTV, 'braked out of it');
});

test('a dash panel under a kart on the ground tops its boost up to KT_PADB (its FX once); a boost takes it to KT_VBOOST; a mushroom (DASH) boosts KT_SHROOM', async () => {
  const g = await room(8, { seed: 12 });
  park(g, 8);
  noCoins(g);
  noBoxes(g);
  const pad = course(g.v).pads.find((p) => p.way === 0);
  put(g, 0, pad.x - 8, pad.z, { vx: 10 });
  const k0 = g.v.fxCount();
  let on = 0;
  for (let k = 0; k < 120; k++) {
    drive(g, W({ yaw: 0, move: 1 }));
    const x = pos(g, 0)[0];
    if (Math.abs(x - pad.x) <= MC.KT_PADL) { on++; assert.equal(g.v.partier(0).dash, MC.KT_PADB); }
  }
  assert.ok(on > 10);
  const b = fxs(g.v, MC.KT_FX_BOOST, k0);
  assert.equal(b.length, 1);
  assert.deepEqual([b[0].owner, b[0].shot], [0, 0]);
  // flat out on a boost
  put(g, 0, pad.x - 20, pad.z - 4, { vx: 10 });
  g.dv.setUint16(rec(0) + L.B_DASH, 200, true);
  drive(g, W({ yaw: 0, move: 1 }), 100);
  assert.equal(speed(g, 0), MC.KT_VBOOST);
  // a mushroom
  put(g, 0, pad.x - 20, pad.z - 4, { vx: 5 });
  g.dv.setUint8(rec(0) + L.B_ITEM, L.PU_DASH);
  drive(g, W({ yaw: 0, move: 1, use: 1 }));
  assert.equal(g.v.partier(0).item, 0);
  assert.equal(g.v.partier(0).dash, MC.KT_SHROOM);
  assert.ok(speed(g, 0) >= Number(L.BPHYS.DASH_V));
});

test('coins and boxes: the first kart by slot within reach takes a coin; a box hands the first kart holding nothing a power-up and is gone KT_BOXBACK; a coin lies KT_LIFE then goes', async () => {
  const g = await room(3, { seed: 21 });
  park(g, 3);
  noCoins(g);
  noBoxes(g);
  for (let k = 0; k < 6; k++) putCoin(g, 10 + k, C - 10 + 2 * k, C - 9);
  put(g, 0, C - 14, C - 9, { vx: 8 });
  const k0 = g.v.fxCount();
  drive(g, W({ yaw: 0, move: 1 }), 150);
  assert.equal(score(g, 0), 6);
  assert.deepEqual(fxs(g.v, MC.KT_FX_TAKE, k0).map((x) => x.owner), [0, 0, 0, 0, 0, 0]);
  // two in reach of one coin: the lower slot's
  putCoin(g, 3, C + 5, C + 5);
  put(g, 1, C + 5.5, C + 5);
  put(g, 2, C + 4.5, C + 5);
  g.step();
  assert.deepEqual([score(g, 1), score(g, 2)], [1, 0]);
  // its life
  putCoin(g, 4, C - 5, C + 9, { t0: g.v.tick - MC.KT_LIFE - 10, air: 10 });
  g.step();
  assert.equal(g.v.u8[L.PG_BIG + MC.KT_COINS + 4 * MC.KT_CSIZE + MC.KT_C_V], 0, 'gone');
  // a box: the middle's ring
  park(g, 3);
  const box = course(g.v).boxes[0];
  g.dv.setUint32(L.PG_S + MC.KT_BOX + 8, 0, true);
  g.dv.setUint8(rec(0) + L.B_ITEM, L.PU_POW);
  put(g, 0, box.x, box.z);
  g.step();
  assert.equal(g.v.partier(0).item, L.PU_POW, 'holding: passes through');
  assert.equal(course(g.v).boxes[0].back, 0);
  g.dv.setUint8(rec(0) + L.B_ITEM, 0);
  const k1 = g.v.fxCount();
  g.step();
  const item = g.v.partier(0).item;
  assert.ok(item >= 1 && item <= L.NPU, `took ${item}`);
  assert.equal(course(g.v).boxes[0].back, g.v.party().t - 1 + MC.KT_BOXBACK);
  const bx = fxs(g.v, MC.KT_FX_BOX, k1);
  assert.deepEqual([bx.length, bx[0].owner, bx[0].shot, bx[0].size], [1, 0, 0, item]);
  // the odds: over many boxes every power-up comes out, more POW and MEGA for a kart behind
  put(g, 1, C - 10, C + 10);
  const tally = (behind) => {
    const n = [0, 0, 0, 0, 0, 0];
    g.dv.setUint16(rec(1) + L.PG_SCORE, behind ? 50 : 0, true);
    g.dv.setUint16(rec(0) + L.PG_SCORE, behind ? 0 : 50, true);
    for (let k = 0; k < 300; k++) {
      g.dv.setUint8(rec(0) + L.B_ITEM, 0);
      g.dv.setUint32(L.PG_S + MC.KT_BOX + 8, 0, true);
      put(g, 0, box.x, box.z);
      g.step();
      n[g.v.partier(0).item]++;
    }
    return n;
  };
  const ahead = tally(false), behind = tally(true);
  assert.ok(ahead.slice(1).every((x) => x > 0), `${ahead}`);
  assert.ok(behind[L.PU_MEGA] + behind[L.PU_POW] > 2 * (ahead[L.PU_MEGA] + ahead[L.PU_POW]), `${behind} against ${ahead}`);
});

test('hits: a rocket\'s blast spins a kart out and drops its coins (3 and one a KT_LOSEK held, at most KT_LOSEMAX) for anyone; spinning it has no control; a plain bump drops nothing; a MEGA kart that runs into one does; then KT_GRACE nothing hits it', async () => {
  const g = await room(3, { seed: 33 });
  park(g, 3);
  noCoins(g);
  noBoxes(g);
  put(g, 1, C + 4, C - 9);
  g.dv.setUint16(rec(1) + L.PG_SCORE, 20, true);
  put(g, 0, C - 6, C - 9);
  g.dv.setUint8(rec(0) + L.B_ITEM, L.PU_ROCKET);
  const k0 = g.v.fxCount();
  let n = 0;
  drive(g, W({ yaw: 0, use: 1 }));
  while (!fxs(g.v, MC.KT_FX_HIT, k0).length && n++ < 200) drive(g, W({ yaw: 0, use: 1 }));
  const hit = fxs(g.v, MC.KT_FX_HIT, k0);
  assert.equal(hit.length, 1);
  const lose = Math.min(MC.KT_LOSEMAX, MC.KT_LOSE0 + Math.floor(20 / MC.KT_LOSEK));
  assert.deepEqual([hit[0].owner, hit[0].shot, hit[0].size], [1, lose, 0]);
  assert.equal(score(g, 1), 20 - lose);
  assert.equal(kartAt(g, 1).spin, MC.KT_SPIN);
  const loose = coins(g.v).filter((k) => k.kind === MC.KT_KLOOSE);
  assert.equal(loose.length, lose);
  for (const k of loose) assert.ok(Math.hypot(k.x - pos(g, 1)[0], k.z - pos(g, 1)[2]) < 12);
  // spinning: the heading whirls, the gas does nothing
  const h0 = kartAt(g, 1).h;
  g.step([[L.EV_INPUT, 1, W({ yaw: 0, move: 1 })]]);
  assert.equal(kartAt(g, 1).h, (h0 + MC.KT_SPINTURN) & 16383);
  for (let k = 0; k < MC.KT_SPIN; k++) g.step([[L.EV_INPUT, 1, W({ yaw: 0, move: 1 })]]);
  assert.equal(kartAt(g, 1).spin, 0);
  g.step([[L.EV_INPUT, 1, 0]]);
  // a rocket inside its grace: nothing
  put(g, 1, C + 4, C - 9);
  put(g, 0, C - 6, C - 9);
  g.dv.setUint8(rec(0) + L.B_ITEM, L.PU_ROCKET);
  g.dv.setUint16(rec(0) + L.P_REFIRE, 0, true);
  const k1 = g.v.fxCount();
  for (let k = 0; k < 60; k++) drive(g, W({ yaw: 0, use: 0 }));
  assert.ok(fxs(g.v, L.FX_BLAST, k1).length >= 1, 'it went off');
  assert.equal(fxs(g.v, MC.KT_FX_HIT, k1).length, 0, 'in its grace');
  // a plain bump, head on at speed: nothing dropped, nobody spun
  for (let k = 0; k < MC.KT_GRACE; k++) g.step();
  put(g, 0, C - 6, C - 9, { vx: 12 });
  put(g, 1, C + 2, C - 9, { vx: -12, h: 8192 });
  const k2 = g.v.fxCount();
  for (let k = 0; k < 60; k++) g.step([[L.EV_INPUT, 0, W({ yaw: 0, move: 1 })], [L.EV_INPUT, 1, W({ yaw: 8192, move: 1 })]]);
  assert.ok(fxs(g.v, L.FX_BUMP, k2).length >= 1, 'they bumped');
  assert.equal(fxs(g.v, MC.KT_FX_HIT, k2).length, 0);
  // MEGA
  put(g, 0, C - 6, C - 9, { vx: 12 });
  put(g, 1, C + 2, C - 9);
  g.dv.setUint16(rec(0) + L.B_MEGA, 500, true);
  const k3 = g.v.fxCount();
  g.step([[L.EV_INPUT, 1, 0]]);
  for (let k = 0; k < 150; k++) drive(g, W({ yaw: 0, move: 1 }));
  const mh = fxs(g.v, MC.KT_FX_HIT, k3);
  assert.equal(mh.length, 1);
  assert.deepEqual([mh[0].owner, mh[0].size], [1, 1]);
});

// The prediction against the confirmed world for slot 0 of room g through
// `inputs`: its whole record bit for bit but PG_SCORE, which only the
// confirmed world's tick writes (a take arrives a round trip late) and the
// prediction carries as it found it. Returns how many it compared.
function predicted(g, inputs) {
  const due = new Map();
  let compared = 0;
  const strip = (u8) => { const r = u8.slice(); r[L.PG_SCORE] = 0; r[L.PG_SCORE + 1] = 0; return r; };
  for (let k = 0; k < inputs.length; k++) {
    for (const n of [1, 6, 30]) {
      if ((k % 7 !== 0 && n !== 1) || k + n > inputs.length) continue;
      for (let i = 0; i < n; i++) g.dv.setUint32(L.PWORDS + 4 * i, inputs[k + i], true);
      g.sim.x.predict(0, n);
      const list = due.get(k + n) || [];
      list.push({ n, from: k, player: strip(g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE)) });
      due.set(k + n, list);
    }
    g.step([[L.EV_INPUT, 0, inputs[k]]]);
    for (const p of due.get(k + 1) || []) {
      assert.deepEqual(p.player, strip(g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE)), `predicted ${p.n} from ${p.from}`);
      compared++;
    }
  }
  return compared;
}

test('the prediction matches the confirmed kart bit for bit (but its score): the gas, turns, a drift and its turbo, a panel, a mushroom, a block, the wall, the brake and reverse, a SPRING onto a block and off', async () => {
  const g = await room(8, { seed: 17 });
  park(g, 8);
  noBoxes(g);
  // coins on its way, taken as it goes (the score the confirmed world's alone)
  g.sim.u8.fill(0, L.PG_BIG + MC.KT_COINS, L.PG_BIG + MC.KT_COINS + MC.KT_MAX * MC.KT_CSIZE);
  for (let k = 0; k < 10; k++) putCoin(g, 40 + k, C - 16 + 3 * k, C - 9.5);
  g.dv.setUint32(L.PG_H + MC.KT_LIVE, 1 << 20, true);
  put(g, 0, C - 18, C - 9.5);
  g.dv.setUint8(rec(0) + L.B_ITEM, L.PU_DASH);
  const s0 = score(g, 0);
  const words = [
    ...Array(90).fill(W({ yaw: 0, move: 1 })),
    ...Array(40).fill(W({ yaw: 1500, move: 1 })),
    ...Array(110).fill(W({ yaw: 6000, move: 1, hop: 1 })),
    ...Array(60).fill(W({ yaw: 12288, move: 1 })),
    ...Array(30).fill(W({ yaw: 12288, move: 1, use: 1 })),
    ...Array(120).fill(W({ yaw: 0, move: 1 })),
    ...Array(150).fill(W({ yaw: 4096, move: 2 })),
    ...Array(200).fill(W({ yaw: 9000, move: 1 })),
  ];
  assert.ok(predicted(g, words) >= words.length);
  assert.ok(score(g, 0) > s0, 'took coins');
  // over a panel, into a block and off the wall
  const pad = course(g.v).pads.find((p) => p.way === 0);
  put(g, 0, pad.x - 10, pad.z);
  const k0 = g.v.fxCount();
  assert.ok(predicted(g, [...Array(200).fill(W({ yaw: 0, move: 1 })), ...Array(80).fill(W({ yaw: 4096, move: 1 })), ...Array(150).fill(W({ yaw: 0, move: 1 }))]) >= 430);
  assert.ok(fxs(g.v, MC.KT_FX_BOOST, k0).some((x) => x.shot === 0), 'boosted off the panel');
  // a SPRING up onto a block, and off it
  const blk = course(g.v).blocks[0];
  put(g, 0, blk.x + MC.KT_BLOCK + 2.2, blk.z, { vx: -5, h: 8192 });
  g.dv.setUint8(rec(0) + L.B_ITEM, L.PU_SPRING);
  g.dv.setUint16(rec(0) + L.P_REFIRE, 0, true);
  const up = [W({ yaw: 8192, use: 1 }), ...Array(40).fill(W({ yaw: 8192, use: 1, move: 1 })), ...Array(160).fill(W({ yaw: 8192, use: 1 })), ...Array(150).fill(W({ yaw: 8192, use: 1, move: 1 }))];
  let onTop = false;
  for (let k = 0; k < up.length; k += 10) {
    assert.ok(predicted(g, up.slice(k, k + 10)) >= Math.min(10, up.length - k));
    if (pos(g, 0)[1] === f(PLAT_Y + MC.KT_BLOCKH)) onTop = true;
  }
  assert.ok(onTop, 'landed on the block');
  assert.equal(pos(g, 0)[1], PLAT_Y, 'and drove off it');
});

// Rounds of AI karts (client/party-bot.mjs, this brain), as tools/genparty.mjs plays them.
for (const [balls, ticks] of [[8, 10400], [64, 10500]]) {
  test(`a round of ${balls} AI karts on the debug build: no trap, coins taken all round, boxes, drifts, hits; placed by coins at the time; equal on 1 and 4 threads`, async () => {
    const stats = { start: -1, over: -1, takes: 0, takers: new Set(), hits: 0, boxes: 0, turbos: 0, places: null, scores: null, pts: null };
    let seen = 0;
    const { log, sim, view } = await playParty({ bytes: partyBytes(true), mg: L.MG_KART, seed: balls, bots: balls, ticks, delay: 8, onTick: (t, s, v) => {
      assert.equal(s.error().code, 0, 'no trap');
      for (; seen < v.fxCount(); seen++) {
        const x = v.fx(seen);
        if (x.kind === MC.KT_FX_TAKE) { stats.takes++; stats.takers.add(x.owner); }
        if (x.kind === MC.KT_FX_HIT) stats.hits++;
        if (x.kind === MC.KT_FX_BOX) stats.boxes++;
        if (x.kind === MC.KT_FX_BOOST && x.shot > 0) stats.turbos++;
      }
      const r = v.party();
      if (stats.start < 0 && r.state === L.H_PLAY) stats.start = t;
      if (stats.over < 0 && stats.start >= 0 && r.state === L.H_OVER) {
        stats.over = t;
        const all = [...Array(balls).keys()].map((p) => v.partier(p));
        stats.places = all.map((b) => b.place);
        stats.scores = all.map((b) => b.score);
        stats.pts = all.map((b) => b.pts);
      }
    } });
    assert.equal(sim.error().code, 0);
    assert.ok(stats.over > 0, 'the round ended');
    assert.equal(stats.over - stats.start, MC.KT_LEN, 'at the time');
    assert.ok(stats.takes > balls * 15, `${stats.takes} coins taken`);
    assert.ok(stats.takers.size >= balls * 0.9, `by ${stats.takers.size} karts`);
    assert.ok(stats.boxes > balls && stats.hits > balls / 2 && stats.turbos > 0, `${stats.boxes} boxes, ${stats.hits} hits, ${stats.turbos} turbos`);
    const sorted = [...stats.scores].sort((a, b) => b - a);
    assert.ok(sorted[0] > sorted.at(-1) + 5, `scores ${sorted}`);
    stats.scores.forEach((s, p) => assert.equal(stats.places[p], 1 + stats.scores.filter((o) => o > s).length, 'placed by coins'));
    assert.ok(stats.pts.every((x) => x >= 1 && x <= 10) && stats.pts.includes(10), `points ${stats.pts}`);
    assert.equal(view.party().game, L.MG_KART);
    const parsed = parseLog(log);
    const n = stats.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('the client module: draws every phase, frames the square, writes its HUD lines; its coins are where the sim takes them; its brain drives', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  assert.equal(MC.KT_FX_TAKE, L.FX_MG + 4 * L.MG_KART);
  assert.deepEqual([MC.KT_FX_HIT, MC.KT_FX_BOX, MC.KT_FX_BOOST], [MC.KT_FX_TAKE + 1, MC.KT_FX_TAKE + 2, MC.KT_FX_TAKE + 3]);
  assert.ok(kartMg.hint.length <= 70 && kartMg.rules.length <= 70);
  assert.equal(kartMg.id, L.MG_KART);
  const g = await room(8, { seed: 41, play: false });
  const out = () => ({ scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null });
  const lines = [];
  const hctx = (o = {}) => ({ put: (x, y, s, c) => lines.push([y, s, c]), centre: (y, s, c) => lines.push([y, s, c]), right: (y, s, c) => lines.push([y, s, c]), rows: 44, C: {}, slot: 0, now: 0, ...o });
  const check = (o) => {
    assert.ok(o.scene.count > 40, `${o.scene.count} solids`);
    for (let k = 0; k < o.scene.count * 16; k++) assert.ok(Number.isFinite(o.scene.data[k]), 'finite');
    for (const s of [...o.solid, ...o.glow]) assert.ok(s.pos.every(Number.isFinite) && Number.isFinite(s.size));
    for (const d of o.decals) assert.ok(d.pos.every(Number.isFinite) && d.radius > 0);
  };
  let o = out();
  kartMg.draw(g.v, { tick: g.v.tick, dt: 0, now: 0, slot: 0 }, o);
  check(o);
  while (g.v.hole().state !== L.H_PLAY) g.step();
  for (let k = 0; k < 40; k++) g.step();
  o = out();
  lines.length = 0;
  const me = g.v.partier(0);
  me.m = (me.m & 16383) | (MC.KT_DL << 14) | (100 << 16);
  kartMg.draw(g.v, { tick: g.v.tick, dt: 0.004, ptick: g.v.tick, now: 1000, slot: 0, pme: me, own: me.pos }, o);
  check(o);
  assert.ok(o.solid.filter((s) => s.kind === 10).length >= 20, 'coins');
  assert.ok(o.glow.some((s) => s.kind === 5), 'drift sparks');
  kartMg.hud(g.v, hctx({ t: g.v.party().t * TICK, me }));
  const text = lines.map((l) => l[1]).join(' | ');
  assert.ok(/DRIFT =+ TURBO/.test(text) && /COIN FEVER IN/.test(text) && /OF 8/.test(text), text);
  for (const l of lines) assert.ok(l[1].length <= 80);
  at(g, MC.KT_FEVER + 10);
  g.step();
  kartMg.draw(g.v, { tick: g.v.tick, dt: 0, ptick: g.v.tick, now: 2000, slot: 0 }, out());
  assert.equal(kartMg.env, 'sunset');
  const fr = kartMg.frame(g.v);
  assert.deepEqual([fr.shape, fr.radius, fr.centre], ['square', H(g), [C, PLAT_Y, C]]);
  // coinAt is $kt_at: coins dropped onto still karts are taken in flight where the mirror has them
  at(g, 500);
  noBoxes(g);
  g.sim.u8.fill(0, L.PG_BIG + MC.KT_COINS, L.PG_BIG + MC.KT_COINS + MC.KT_MAX * MC.KT_CSIZE);
  g.dv.setUint32(L.PG_H + MC.KT_LIVE, 1 << 20, true);
  let seen = g.v.fxCount(), checked = 0;
  for (let r = 0; r < 4; r++) {
    const thrown = [];
    for (let p = 0; p < 8; p++) {
      const bx = C - 9 + 2.6 * p, bz = C - 9.5;
      put(g, p, bx, bz);
      const a = L.PG_BIG + MC.KT_COINS + (60 + p) * MC.KT_CSIZE, d = g.dv;
      putCoin(g, 60 + p, bx + 0.3, bz, { t0: g.v.tick, air: 40 + 7 * p });
      d.setFloat32(a + MC.KT_C_X0, bx + 3, true); d.setFloat32(a + MC.KT_C_Y0, PLAT_Y + 2 + r, true); d.setFloat32(a + MC.KT_C_Z0, bz - 1, true); d.setFloat32(a + MC.KT_C_H, 1.2, true);
      thrown.push({ c: 60 + p, t0: g.v.tick, air: 40 + 7 * p, x: f(bx + 0.3), z: f(bz), x0: f(bx + 3), y0: f(PLAT_Y + 2 + r), z0: f(bz - 1), h: f(1.2) });
    }
    for (let k = 0; k < 90; k++) g.step();
    for (; seen < g.v.fxCount(); seen++) {
      const x = g.v.fx(seen);
      if (x.kind !== MC.KT_FX_TAKE) continue;
      const k0 = thrown.find((c) => c.c === x.shot);
      if (!k0) continue;
      const p = coinAt(k0, x.tick);
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(p[i] - x.pos[i]) < 1e-3, `coin ${x.shot} at ${p} vs ${x.pos}`);
      checked++;
    }
  }
  assert.ok(checked >= 24, `${checked} takes checked`);
  // the brain: the blocks and walls are danger, the open floor isn't; its word is a drive
  const w = course(g.v);
  const { danger, think } = kartMg.brain;
  assert.equal(danger(g.v, C + 7, C - 7), 0);
  assert.ok(danger(g.v, w.blocks[0].x, w.blocks[0].z) > 0);
  assert.ok(danger(g.v, C + H(g) - 0.5, C) > 0);
  put(g, 0, C - 9, C - 9.5);
  const word = think(g.v, g.v.partier(0), { slot: 0, skill: 0.8, at: g.v.tick, pos: [C - 9, C - 9.5], vel: [0, 0], mem: {}, rand: () => 0.5 });
  assert.ok(word && Number.isFinite(word.yaw) && [0, 1, 2].includes(word.move));
});
