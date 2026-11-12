// RUSH HOUR (src/mg/traffic.wat): the street laid out for the crowd, its
// strips and traffic from the seed, a crossing only from the kerb across, a
// hit by each kind of vehicle and the way back, the medians and the belt,
// the zebra kept clear through every green, coins, the last 15 s, the walls,
// the clock and the places, the prediction bit for bit through all of it,
// rounds of AI balls equal on 1 and 4 threads, and the client module with
// its brain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/traffic.mjs'; // RH_*: the minigame's own constants
import traffic, { stage, forget, vehicles, vehicleAt, ran, lights, coins, KINDS } from '../client/mg/traffic.mjs';

const C = L.B_CX;
const TICK = 0.008;
const f = Math.fround;

// A room of n balls in RUSH HOUR, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_TRAFFIC + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  forget();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
const ball = (g, p) => {
  const a = rec(p), d = g.dv;
  return { x: d.getFloat32(a + L.P_PX, true), y: d.getFloat32(a + L.P_PY, true), z: d.getFloat32(a + L.P_PZ, true),
    vx: d.getFloat32(a + L.P_VX, true), vy: d.getFloat32(a + L.P_VY, true), vz: d.getFloat32(a + L.P_VZ, true),
    m: d.getUint32(a + L.PG_M, true), score: d.getUint16(a + L.PG_SCORE, true), ground: !!(d.getUint8(a + L.P_FL) & L.PF_GROUND) };
};
const down = (g, p) => (ball(g, p).m & MC.RH_MDOWN) !== 0;
// Ball p at (x, z), on the floor (or y up), moving at (vx, vy, vz); m its PG_M if given.
function put(g, p, x, z, { y = 0, vx = 0, vy = 0, vz = 0, m = null } = {}) {
  const a = rec(p), d = g.dv;
  d.setFloat32(a + L.P_PX, x, true); d.setFloat32(a + L.P_PY, PLAT_Y + y, true); d.setFloat32(a + L.P_PZ, z, true);
  d.setFloat32(a + L.P_VX, vx, true); d.setFloat32(a + L.P_VY, vy, true); d.setFloat32(a + L.P_VZ, vz, true);
  d.setUint8(a + L.P_FL, L.PF_LIVE | (y ? 0 : L.PF_GROUND));
  if (m !== null) d.setUint32(a + L.PG_M, m, true);
}
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
const tp = (g) => g.v.party().t;
const strip = (k) => L.PG_S + k * MC.RH_SREC;
// The road with no traffic on it.
function clearRoad(g) {
  g.sim.u8.fill(0, L.PG_BIG + MC.RH_CELLS, L.PG_BIG + MC.RH_CELLS + MC.RH_NS * MC.RH_NCELL * 2);
  forget();
}
// No coins this round: every slot taken by one that never goes, far from the street.
function noCoins(g) {
  for (let q = 0; q < MC.RH_NCOIN; q++) {
    const a = L.PG_S + MC.RH_COINS + 16 * q;
    g.dv.setFloat32(a, 0, true); g.dv.setFloat32(a + 4, 0, true); g.dv.setUint32(a + 8, 0x7fff0000, true);
  }
}
// Strip k made a kind (its traffic left as it is).
function retype(g, k, type, dir = null) {
  g.dv.setUint8(strip(k) + MC.RH_STYPE, type);
  if (dir !== null) g.dv.setUint8(strip(k) + MC.RH_SDIR, dir);
  forget();
}
// A vehicle of `kind` in strip k, its nose y m along the lane's way on tick t into play: the cell it is in, written.
function pin(g, k, kind, y, t = tp(g)) {
  const s = stage(g.v), st = s.strips[k];
  const d = ran(st, t) - y;
  const i = Math.floor(d / st.pitch) + MC.RH_C0, off8 = Math.min(255, Math.round((d - (i - MC.RH_C0) * st.pitch) * 8));
  const a = L.PG_BIG + MC.RH_CELLS + (k * MC.RH_NCELL + i) * 2;
  g.dv.setUint8(a, kind | 0x30);
  g.dv.setUint8(a + 1, off8);
  forget();
  return i;
}
const zAt = (s, st, y) => (st.dir ? s.z1 - y : s.z0 + y);
const go = partyWord({ yaw: 0, move: 1 }), back = partyWord({ yaw: 8192, move: 1 }), still = partyWord({});
const traffics = (s) => s.strips.filter((st) => st.traffic);

test('the street for 1, 8, 64 and 256: as long as the crowd wants, nine strips kerb to kerb, the zebra on it, every ball on the near pavement', async () => {
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party(), s = stage(g.v);
    assert.equal(r.game, L.MG_TRAFFIC);
    assert.deepEqual([r.kind, r.len, r.flags], [L.PK_SCORE, MC.RH_LEN, 0], 'points, 90 s, no bumps');
    assert.ok(Math.abs(2 * s.hw - (MC.RH_W0 + MC.RH_WK * Math.sqrt(n))) < 1e-3, `${2 * s.hw} m long for ${n}`);
    assert.ok(Math.abs(s.zh - (MC.RH_ZH0 + MC.RH_ZHK * Math.sqrt(n))) < 1e-4);
    assert.ok(s.zc - s.zh - MC.RH_ZM > s.z0 + 2 && s.zc + s.zh + MC.RH_ZM < s.z1 - 2, 'the zebra well inside the ends');
    assert.equal(s.strips.length, MC.RH_NS);
    let x = s.xa;
    for (const st of s.strips) {
      assert.ok(Math.abs(st.x0 - x) < 1e-4 && Math.abs(st.x1 - st.x0 - MC.RH_TW[st.type] / 100) < 1e-4, `strip ${st.k}`);
      x = st.x1;
    }
    assert.ok(Math.abs(x - s.xb) < 1e-4 && Math.abs((s.xa + s.xb) / 2 - C) < 1e-3, 'kerb to kerb round the middle');
    assert.ok(Math.abs(r.size - Math.max(s.hw, (s.xb - s.xa) / 2 + MC.RH_PAVE)) < 1e-3);
    const seen = [];
    for (let p = 0; p < n; p++) {
      const b = ball(g, p);
      assert.equal(b.y, PLAT_Y);
      assert.ok(b.x <= s.xa - MC.RH_GRID0 + 1e-3 && b.x > s.xa - MC.RH_PAVE + 1, `${n}: P${p + 1} on the near pavement`);
      assert.ok(Math.abs(b.z - C) < s.hw - MC.RH_EDGE + 1e-3, `${n}: P${p + 1} between the ends`);
      seen.push([b.x, b.z]);
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < Math.min(n, i + 70); j++) assert.ok(Math.hypot(seen[i][0] - seen[j][0], seen[i][1] - seen[j][1]) > 2.1, 'apart');
  }
});

test('the road from the seed, 40 rounds: lanes outside, a median or a belt each side of the middle and never two belts, a bike lane or a tram line among the middle three; every lane its own way, speed and cells; each vehicle in its cell with room behind, lorries only in long cells, fuller as the round goes', async () => {
  const kinds = new Set(), layouts = new Set(), dirs = new Set();
  let early = 0, late = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = await room(2, { play: false, seed });
    const s = stage(g.v);
    const ty = s.strips.map((st) => st.type);
    layouts.add(ty.join(''));
    for (const k of [0, 1, 4, 7, 8]) assert.equal(ty[k], MC.RH_TLANE);
    for (const k of [2, 6]) assert.ok(ty[k] === MC.RH_TMEDIAN || ty[k] === MC.RH_TBELT);
    assert.ok(!(ty[2] === MC.RH_TBELT && ty[6] === MC.RH_TBELT), 'never two belts');
    assert.ok([ty[3], ty[5]].some((x) => x === MC.RH_TBIKE || x === MC.RH_TTRAM) && ty[3] !== ty[5]);
    for (const st of s.strips) {
      if (!st.traffic) { assert.equal(st.pitch, 0); continue; }
      dirs.add(st.dir);
      if (st.type === MC.RH_TLANE) {
        assert.ok(st.v >= MC.RH_VLANE0 && st.v < MC.RH_VLANE0 + MC.RH_VLANEK, `a lane at ${st.v} m/s`);
        assert.ok(st.pitch >= MC.RH_PLANE0 && st.pitch < MC.RH_PLANE0 + MC.RH_PLANEK);
      } else if (st.type === MC.RH_TBIKE) assert.ok(st.v >= MC.RH_VBIKE0 && st.v < MC.RH_VBIKE0 + MC.RH_VBIKEK && st.pitch === MC.RH_PBIKE);
      else assert.deepEqual([st.v, st.pitch], [MC.RH_VTRAM, MC.RH_PTRAM]);
      const span = ran(st, MC.RH_LEN) / st.pitch;
      for (let i = 0; i < MC.RH_NCELL; i++) {
        const kind = st.cells[2 * i] & 7, off = st.cells[2 * i + 1] / 8;
        if (!kind) continue;
        kinds.add(kind);
        assert.ok(off + KINDS[kind].len + MC.RH_GAP <= st.pitch + 0.126, `strip ${st.k} cell ${i}: room behind`);
        if (st.type === MC.RH_TLANE) assert.ok(kind <= MC.RH_KLORRY && (kind !== MC.RH_KLORRY || st.pitch >= MC.RH_PLORRY));
        else assert.equal(kind, st.type === MC.RH_TBIKE ? MC.RH_KBIKE : MC.RH_KTRAM);
        if (st.type !== MC.RH_TTRAM) { const u = (i - MC.RH_C0) / span; if (u >= 0 && u < 1 / 3) early++; else if (u >= 2 / 3 && u < 1) late++; }
      }
    }
  }
  assert.deepEqual([...kinds].sort(), [1, 2, 3, 4, 5], 'every kind of vehicle');
  assert.ok(layouts.size >= 8, `${layouts.size} layouts`);
  assert.equal(dirs.size, 2);
  // of what comes by in the round, the last third is fuller than the first
  assert.ok(late > 1.15 * early, `${early} early, ${late} late`);
});

test('a crossing counts only from the kerb across: a point over the far kerb on the ground, none for staying, the next back over the near one; not in the air, not short of RH_IN', async () => {
  const g = await room(2);
  clearRoad(g);
  noCoins(g);
  const s = stage(g.v);
  put(g, 1, s.xa - 8, C + 12);
  put(g, 0, s.xa - 2, C);
  const n0 = g.v.fxCount();
  let at = null;
  for (let k = 0; k < 900 && ball(g, 0).score === 0; k++) { at = ball(g, 0).x; g.step([[L.EV_INPUT, 0, go]]); }
  let b = ball(g, 0);
  assert.equal(b.score, 1);
  assert.ok(at < s.xb + MC.RH_IN && b.x >= s.xb + MC.RH_IN, `counted at ${b.x - s.xb} m past the far kerb`);
  assert.deepEqual([b.m & MC.RH_MSIDE, b.m >>> 24], [1, 1]);
  let cross = fxs(g.v, MC.RH_FX_CROSS, n0);
  assert.deepEqual(cross.map((x) => [x.owner, x.shot, x.size]), [[0, 1, 1]]);
  for (let k = 0; k < 300; k++) g.step([[L.EV_INPUT, 0, go]]);
  assert.equal(ball(g, 0).score, 1, 'nothing more for staying over there');
  // in the air over the near pavement: nothing till it lands
  put(g, 0, s.xa - 3, C, { y: 3 });
  g.step([[L.EV_INPUT, 0, still]]);
  assert.equal(ball(g, 0).score, 1);
  for (let k = 0; k < 100 && !ball(g, 0).ground; k++) g.step();
  assert.equal(ball(g, 0).score, 2, 'landed: the second');
  // on the near pavement short of RH_IN, heading for the far one: nothing
  put(g, 0, s.xb + MC.RH_IN - 0.1, C);
  for (let k = 0; k < 20; k++) g.step();
  assert.equal(ball(g, 0).score, 2);
  // there and back and there
  for (let k = 0; k < 1500 && ball(g, 0).score < 3; k++) g.step([[L.EV_INPUT, 0, go]]);
  for (let k = 0; k < 1500 && ball(g, 0).score < 4; k++) g.step([[L.EV_INPUT, 0, back]]);
  b = ball(g, 0);
  assert.deepEqual([b.score, b.m >>> 24, b.m & MC.RH_MSIDE], [4, 4, 0]);
  assert.ok(b.x <= s.xa - MC.RH_IN);
  assert.equal(ball(g, 1).score, 0, 'the ball that stood on the near pavement has none');
});

test('a hit by each kind: knocked on down the lane RH_KICK faster than the vehicle and up, down, nothing meeting it; its edge just reaching a side is a hit and a hair clear is none', async () => {
  for (const kind of [MC.RH_KCAR, MC.RH_KVAN, MC.RH_KLORRY, MC.RH_KBIKE, MC.RH_KTRAM]) {
    for (const k of [0, 1]) {
      const g = await room(2, { seed: 5 + k });
      clearRoad(g);
      const s = stage(g.v), st = s.strips[k], K = KINDS[kind];
      put(g, 1, s.xa - 8, C + 12);
      for (let i = 0; i < 300; i++) g.step();
      const t = tp(g), y = s.hw;
      pin(g, k, kind, y - 5, t);
      // beside its path, a hair clear: it goes by
      put(g, 0, st.xc + K.hw + 1.02, zAt(s, st, y));
      const n0 = g.v.fxCount();
      for (let i = 0; i < 140; i++) g.step();
      assert.equal(fxs(g.v, MC.RH_FX_HIT, n0).length, 0, `${K.name}: a hair clear`);
      // in its path
      pin(g, k, kind, y - 5);
      put(g, 0, st.xc + K.hw + 0.9, zAt(s, st, y));
      let hitT = -1;
      for (let i = 0; i < 200 && hitT < 0; i++) { const t1 = tp(g); g.step(); if (down(g, 0)) hitT = t1; }
      assert.ok(hitT >= 0, `${K.name} hit it`);
      const b = ball(g, 0);
      const [hit] = fxs(g.v, MC.RH_FX_HIT, n0);
      assert.deepEqual([hit.owner, hit.shot & 7, hit.shot >> 4], [0, kind, k]);
      const speed = f(f(st.v * f(f(hitT * f(MC.RH_QA)) + 1)) + MC.RH_KICK);
      assert.equal(b.vz, st.dir ? -speed : speed, 'down the lane, faster than the lane runs');
      assert.equal(b.vy, f(MC.RH_KUP[kind] * f(0.01)));
      assert.equal((b.m >> 8) & 0xffff, hitT + 1);
      assert.ok(!b.ground);
      // the client's mirror has the vehicle where the sim met it
      assert.equal(vehicleAt(stage(g.v), hit.pos[0], hit.pos[2], hitT, 1.001), kind);
      // down, another on top of it meets nothing
      pin(g, k, MC.RH_KLORRY, (st.dir ? s.z1 - b.z : b.z - s.z0) + 4);
      const n1 = g.v.fxCount();
      for (let i = 0; i < 40; i++) g.step();
      assert.equal(fxs(g.v, MC.RH_FX_HIT, n1).length, 0);
      assert.ok(down(g, 0));
    }
  }
});

test('coming back: RH_DOWN after the hit, RH_BACK behind the kerb it last scored from, RH_DROP up and still, where down the street it got to; slots a little apart; no crossing while down', async () => {
  const g = await room(10, { seed: 9 });
  clearRoad(g);
  const s = stage(g.v), st = s.strips[1];
  for (let p = 1; p < 10; p++) put(g, p, s.xa - 8, s.z0 + 4 + 2.5 * p);
  // slot 0 from the near kerb; then slot 3, having scored once, from the far one: each hit in the second lane
  pin(g, 1, MC.RH_KVAN, s.hw - 3);
  put(g, 0, st.xc, zAt(s, st, s.hw));
  let hitT = -1;
  for (let i = 0; i < 100 && hitT < 0; i++) { const t1 = tp(g); g.step(); if (down(g, 0)) hitT = t1; }
  assert.ok(hitT >= 0);
  // thrown over the far kerb while down: no crossing
  put(g, 0, s.xb + 3, C, { m: ball(g, 0).m });
  while (tp(g) < hitT + MC.RH_DOWN) { g.step(); assert.ok(down(g, 0)); }
  assert.equal(ball(g, 0).score, 0, 'no crossing while down');
  const z0 = ball(g, 0).z;
  g.step();
  const a = ball(g, 0);
  assert.deepEqual([a.x, a.y, a.z, a.vx, a.vy, a.vz, a.m], [f(s.xa - MC.RH_BACK), PLAT_Y + MC.RH_DROP, z0, 0, 0, 0, 0]);
  clearRoad(g);
  pin(g, 1, MC.RH_KVAN, s.hw - 3);
  put(g, 3, st.xc, zAt(s, st, s.hw), { m: MC.RH_MSIDE | (1 << 24) });
  g.dv.setUint16(rec(3) + L.PG_SCORE, 1, true);
  hitT = -1;
  for (let i = 0; i < 100 && hitT < 0; i++) { const t1 = tp(g); g.step(); if (down(g, 3)) hitT = t1; }
  assert.ok(hitT >= 0);
  while (tp(g) < hitT + MC.RH_DOWN) g.step();
  const z3 = ball(g, 3).z;
  assert.ok(down(g, 3) && Math.abs(z3 - zAt(s, st, s.hw)) > 6, 'carried down the street');
  g.step();
  const b = ball(g, 3);
  assert.deepEqual([b.x, b.y, b.vx, b.vy, b.vz], [f(s.xb + f(MC.RH_BACK + 1.5)), PLAT_Y + MC.RH_DROP, 0, 0, 0]);
  assert.ok(Math.abs(b.z - z3) < 0.2, 'where down the street it got to');
  assert.equal(b.m, MC.RH_MSIDE | (1 << 24), 'the kerb and the crossings kept');
  for (let i = 0; i < 120; i++) g.step();
  assert.ok(ball(g, 0).ground && ball(g, 0).y === PLAT_Y);
  assert.deepEqual([ball(g, 0).score, ball(g, 3).score], [0, 1]);
});

test('where nothing drives: a ball standing on a median through the round\'s traffic is never hit; a belt carries a ball on it along its way at RH_BELT, not one in the air nor one beside it', async () => {
  for (const seed of [3, 4, 6]) {
    const g = await room(2, { seed });
    retype(g, 2, MC.RH_TMEDIAN);
    retype(g, 6, MC.RH_TBELT, seed & 1);
    const s = stage(g.v);
    put(g, 0, s.strips[2].x0 + 0.31, C - 6);
    put(g, 1, s.strips[2].x1 - 0.31, C + 6);
    for (let i = 0; i < 6000; i++) g.step();
    assert.equal(fxs(g.v, MC.RH_FX_HIT).length, 0, 'safe to its edges, less a lorry\'s overhang');
    const st = s.strips[6], way = st.dir ? -1 : 1;
    put(g, 0, st.xc, C);
    put(g, 1, st.xc, C + 8, { y: 5 });
    for (let i = 0; i < 25; i++) g.step();
    assert.ok(Math.abs(ball(g, 0).z - (C + way * 25 * MC.RH_BELT_DT)) < 1e-3, 'carried');
    assert.equal(ball(g, 0).x, f(st.xc));
    assert.equal(ball(g, 1).z, C + 8, 'not in the air');
    put(g, 1, s.xb + 3, C + 8);
    for (let i = 0; i < 25; i++) g.step();
    assert.equal(ball(g, 1).z, C + 8, 'nor on the pavement');
  }
});

test('the lights: through every green of the round no vehicle is within RH_ZM of the zebra, in any lane, for 1 to 256 balls; between greens they all drive over it; a ball standing on it in a lane lasts the green and not the red', async () => {
  for (const [n, seed] of [[1, 2], [8, 11], [64, 12], [256, 13], [2, 21], [2, 22]]) {
    const g = await room(n, { play: false, seed });
    const s = stage(g.v);
    const zb = s.zh + MC.RH_ZM - 0.005;
    for (const st of traffics(s)) {
      const yc = st.dir ? s.z1 - s.zc : s.zc - s.z0;
      let red = 0;
      for (let t = 0; t < MC.RH_LEN; t += 2) {
        const c = (t + MC.RH_LT - MC.RH_LA) % MC.RH_LT;
        const green = t >= MC.RH_LA && c <= MC.RH_LW;
        let on = 0;
        vehicles(s, st, t, yc - zb, yc + zb, () => { on++; });
        if (green) assert.equal(on, 0, `${n} balls, strip ${st.k}, tick ${t}: on the zebra in a green`);
        else red += on;
      }
      assert.ok(red > 0, `strip ${st.k}: traffic over the zebra between greens`);
    }
  }
  const g = await room(2, { seed: 11 });
  const s = stage(g.v), st = s.strips[0];
  put(g, 1, s.xa - 8, C + 14);
  while (tp(g) < MC.RH_LT + MC.RH_LA - 2) g.step();
  const n0 = g.v.fxCount();
  for (const [p, z] of [[0, s.zc + s.zh], [0, s.zc - s.zh]]) {
    put(g, p, st.xc, z);
    for (let i = 0; i < MC.RH_LW / 2; i++) g.step();
  }
  assert.equal(fxs(g.v, MC.RH_FX_HIT, n0).length, 0, 'on the zebra\'s edges through a green');
  assert.equal(tp(g), MC.RH_LT + MC.RH_LA + MC.RH_LW - 2);
  put(g, 0, st.xc, s.zc);
  for (let i = 0; i < MC.RH_LT - MC.RH_LW && !down(g, 0); i++) g.step();
  assert.ok(down(g, 0), 'and hit in the red');
  // the calls: amber RH_LWARN before each green, the green, its last RH_LEND, red
  const calls = fxs(g.v, MC.RH_FX_CALL).map((x) => [x.shot, x.tick - g.v.party().start]).filter(([, t]) => t <= MC.RH_LT + MC.RH_LA + MC.RH_LW);
  assert.deepEqual(calls, [[MC.RH_CAMBER, MC.RH_LA - MC.RH_LWARN], [MC.RH_CWALK, MC.RH_LA], [MC.RH_CEND, MC.RH_LA + MC.RH_LW - MC.RH_LEND], [MC.RH_CSTOP, MC.RH_LA + MC.RH_LW],
    [MC.RH_CAMBER, MC.RH_LT + MC.RH_LA - MC.RH_LWARN], [MC.RH_CWALK, MC.RH_LT + MC.RH_LA], [MC.RH_CEND, MC.RH_LT + MC.RH_LA + MC.RH_LW - MC.RH_LEND], [MC.RH_CSTOP, MC.RH_LT + MC.RH_LA + MC.RH_LW]]);
  assert.deepEqual([lights(MC.RH_LA - 1).now, lights(MC.RH_LA).now, lights(MC.RH_LA + MC.RH_LW - 1).now, lights(MC.RH_LA + MC.RH_LW).now], ['amber', 'green', 'end', 'red']);
});

test('coins: one and one more for every 16 balls every RH_CEVERY, on a lane; RH_COIN to the first ball by slot within RH_CR, on the floor and not down; gone at RH_CLIFE; never more than RH_NCOIN', async () => {
  const g = await room(34, { seed: 14 });
  clearRoad(g);
  const s = stage(g.v);
  for (let p = 0; p < 34; p++) put(g, p, s.xa - 4 - 2.4 * (p % 2), s.z0 + 4 + 2.4 * (p >> 1));
  while (tp(g) <= MC.RH_CEVERY / 2) g.step();
  const drops = fxs(g.v, MC.RH_FX_COIN).filter((x) => x.owner === 255);
  assert.equal(drops.length, 3, 'three for 34 balls');
  const cs = coins(g.v, tp(g));
  assert.equal(cs.length, 3);
  for (const c of cs) {
    const st = s.strips.find((q) => c.x > q.x0 && c.x < q.x1);
    assert.ok(st.traffic && Math.abs(c.x - st.xc) < 1e-3, 'on a lane\'s middle');
    assert.ok(Math.abs(c.z - C) <= s.hw - MC.RH_EDGE + 1e-3);
  }
  // slots 5 and 2 both on one: slot 2's
  const [c0, c1, c2] = cs;
  put(g, 5, c0.x + 0.5, c0.z);
  put(g, 2, c0.x - 1, c0.z + 1);
  // a ball over one in the air, and a ball down on one: not theirs
  put(g, 7, c1.x, c1.z, { y: 1.6 });
  g.dv.setFloat32(rec(7) + L.P_VY, 0, true);
  put(g, 8, c2.x, c2.z, { m: (tp(g) + 1) << 8 });
  const n0 = g.v.fxCount();
  g.step();
  assert.deepEqual(fxs(g.v, MC.RH_FX_COIN, n0).map((x) => [x.owner, x.shot, x.size]), [[2, c0.q, MC.RH_COIN]]);
  assert.deepEqual([ball(g, 2).score, ball(g, 5).score, ball(g, 7).score, ball(g, 8).score], [MC.RH_COIN, 0, 0, 0]);
  assert.equal(coins(g.v, tp(g)).length, 2);
  // just outside RH_CR: not taken
  put(g, 7, s.xa - 6, C); put(g, 8, s.xa - 6, C + 3, { m: 0 });
  put(g, 9, c1.x + MC.RH_CR + 0.02, c1.z);
  g.step();
  assert.equal(ball(g, 9).score, 0);
  put(g, 9, c1.x + MC.RH_CR - 0.02, c1.z);
  g.step();
  assert.equal(ball(g, 9).score, MC.RH_COIN);
  put(g, 9, s.xa - 6, C + 6);
  // the last lies RH_CLIFE from its drop
  for (let p = 0; p < 34; p++) put(g, p, s.xa - 4 - 2.4 * (p % 2), s.z0 + 4 + 2.4 * (p >> 1));
  const born = MC.RH_CEVERY / 2;
  while (tp(g) < born + MC.RH_CLIFE) { g.step(); assert.ok(coins(g.v, tp(g)).length <= MC.RH_NCOIN); }
  assert.ok(coins(g.v, tp(g)).some((c) => c.q === c2.q && c.age === MC.RH_CLIFE), 'still there on its last tick');
  g.step();
  assert.ok(!coins(g.v, tp(g)).some((c) => c.q === c2.q && c.age > MC.RH_CLIFE), 'gone');
  for (let i = 0; i < 6000; i++) { g.step(); assert.ok(coins(g.v, tp(g)).length <= MC.RH_NCOIN); }
  assert.ok(coins(g.v, tp(g)).length >= 6, 'they lie about when nobody takes them');
});

test('the last 15 s: the call at RH_DOUBLE, then a crossing is 2 and a coin 6', async () => {
  const g = await room(2, { seed: 15 });
  clearRoad(g);
  const s = stage(g.v);
  put(g, 0, s.xa - 2, C); put(g, 1, s.xa - 8, C + 10);
  while (tp(g) < MC.RH_DOUBLE - 800) g.step();
  noCoins(g);
  for (let k = 0; k < 790 && ball(g, 0).score === 0; k++) g.step([[L.EV_INPUT, 0, go]]);
  assert.equal(ball(g, 0).score, 1, 'one before');
  while (tp(g) <= MC.RH_DOUBLE) g.step([[L.EV_INPUT, 0, still]]);
  assert.deepEqual(fxs(g.v, MC.RH_FX_CALL).filter((x) => x.shot === MC.RH_CDOUBLE).map((x) => x.tick - g.v.party().start), [MC.RH_DOUBLE]);
  const n0 = g.v.fxCount();
  for (let k = 0; k < 900 && ball(g, 0).score < 3; k++) g.step([[L.EV_INPUT, 0, back]]);
  assert.equal(ball(g, 0).score, 3);
  assert.deepEqual(fxs(g.v, MC.RH_FX_CROSS, n0).map((x) => [x.shot, x.size]), [[2, 2]]);
  const a = L.PG_S + MC.RH_COINS;
  g.dv.setFloat32(a, s.strips[0].xc, true); g.dv.setFloat32(a + 4, C + 9, true); g.dv.setUint32(a + 8, tp(g), true);
  put(g, 1, s.strips[0].xc, C + 9);
  g.step();
  assert.equal(ball(g, 1).score, 2 * MC.RH_COIN);
});

test('the walls: behind both pavements and across both ends, what a ball hits them with given back at RH_BOUNCE; a ball knocked down the lane stays in too; the floor everywhere', async () => {
  const g = await room(2, { seed: 16 });
  clearRoad(g);
  const s = stage(g.v);
  put(g, 1, s.xa - 5, C);
  for (const [x, z, vx, vz] of [[s.xa - MC.RH_PAVE + 1.05, C, -12, 0], [s.xb + MC.RH_PAVE - 1.05, C, 12, 0], [s.xa - 3, s.z0 + 1.05, 0, -12], [s.xb + 3, s.z1 - 1.05, 0, 12]]) {
    put(g, 0, x, z, { vx, vz, m: x > C ? MC.RH_MSIDE : 0 });
    g.step();
    const b = ball(g, 0);
    assert.ok(b.x >= s.xa - MC.RH_PAVE + 1 - 1e-4 && b.x <= s.xb + MC.RH_PAVE - 1 + 1e-4 && b.z >= s.z0 + 1 - 1e-4 && b.z <= s.z1 - 1 + 1e-4, 'inside');
    const v = vx || vz, got = vx ? b.vx : b.vz;
    assert.ok(Math.sign(got) === -Math.sign(v) && Math.abs(Math.abs(got) - Math.abs(v) * MC.RH_BOUNCE) < 0.3, `${v} came back ${got}`);
  }
  // knocked down the first lane near its end
  const st = s.strips[0];
  pin(g, 0, MC.RH_KLORRY, 2 * s.hw - 8);
  put(g, 0, st.xc, zAt(s, st, 2 * s.hw - 5));
  for (let i = 0; i < 120; i++) { g.step(); const b = ball(g, 0); assert.ok(b.z >= s.z0 + 1 - 1e-4 && b.z <= s.z1 - 1 + 1e-4 && b.y >= PLAT_Y); }
  assert.ok(down(g, 0));
  assert.equal(g.v.party().floor, PLAT_Y);
});

test('the clock and the places: 90 s, placed by points with ties sharing, 10 party points down to 1; nobody is ever out; a ball that joins in play drops onto the near pavement and can score', async () => {
  const g = await room(4, { seed: 17 });
  clearRoad(g);
  const s = stage(g.v);
  for (let p = 0; p < 4; p++) put(g, p, s.xa - 4, C - 9 + 6 * p);
  for (let i = 0; i < 400; i++) g.step();
  g.step([[L.EV_JOIN, 4]]);
  let b = ball(g, 4);
  assert.ok(b.x < s.xa - 2 && b.x > s.xa - MC.RH_PAVE && b.y > PLAT_Y + 5 && Math.abs(b.z - C) < s.hw - MC.RH_EDGE + 1e-3 && b.m === 0, 'in over the near pavement');
  for (let k = 0; k < 1500 && ball(g, 4).score === 0; k++) g.step([[L.EV_INPUT, 4, go]]);
  assert.equal(ball(g, 4).score, 1);
  g.step([[L.EV_INPUT, 4, still]]);
  while (g.v.hole().state === L.H_PLAY) {
    if (tp(g) === MC.RH_LEN - 3) [7, 3, 7, 0].forEach((sc, p) => g.dv.setUint16(rec(p) + L.PG_SCORE, sc, true));
    for (let p = 0; p < 5; p++) assert.ok(!g.v.partier(p).out);
    g.step();
  }
  assert.equal(tp(g), MC.RH_LEN + 1, 'over at 90 s');
  assert.deepEqual([0, 1, 2, 3, 4].map((p) => g.v.partier(p).place), [1, 3, 1, 5, 4]);
  assert.deepEqual([0, 1, 2, 3, 4].map((p) => g.v.partier(p).pts), [10, 5, 10, 1, 3]);
});

test('the prediction matches the confirmed ball bit for bit: into a car, a van, a lorry, a motorbike and a tram, down and back to each kerb, along a belt, over both kerbs for its points, into the walls', async () => {
  const g = await room(2, { seed: 18 });
  clearRoad(g);
  noCoins(g);
  retype(g, 2, MC.RH_TBELT, 0);
  retype(g, 6, MC.RH_TBELT, 1);
  const s = stage(g.v);
  put(g, 1, s.xa - 8, C + 14);
  for (let i = 0; i < 200; i++) g.step();
  let compared = 0;
  const n0 = g.v.fxCount();
  // each kind in the first lane as the ball rolls off the near kerb into it, then down, back and across
  for (const kind of [MC.RH_KCAR, MC.RH_KVAN, MC.RH_KLORRY, MC.RH_KBIKE, MC.RH_KTRAM]) {
    const st = s.strips[0];
    put(g, 0, s.xa - 1.3, C + 2, { m: ball(g, 0).m & ~MC.RH_MSIDE });
    // its nose reaches the ball's line as the ball reaches the lane
    pin(g, 0, kind, (st.dir ? s.z1 - (C + 2) : C + 2 - s.z0) - st.v * 0.75 - 0.5, tp(g));
    compared += predicted(g, Array(MC.RH_DOWN + 150).fill(go));
    assert.equal(fxs(g.v, MC.RH_FX_HIT, n0).filter((x) => (x.shot & 7) === kind).length, 1, `${KINDS[kind].name} hit it`);
    clearRoad(g);
  }
  // across both belts to the far kerb, into the wall behind it, back, and hit on the way to come back on the far side
  put(g, 0, s.xa - 2, C, { m: 0 });
  g.dv.setUint16(rec(0) + L.PG_SCORE, 0, true);
  compared += predicted(g, [...Array(620).fill(go), ...Array(60).fill(partyWord({ yaw: 4096, move: 1 }))]);
  assert.equal(ball(g, 0).score, 1);
  const st = s.strips[7];
  const b = ball(g, 0);
  pin(g, 7, MC.RH_KLORRY, (st.dir ? s.z1 - b.z : b.z - s.z0) - st.v * 1.6 - 1, tp(g));
  compared += predicted(g, [...Array(MC.RH_DOWN + 140).fill(back), ...Array(700).fill(back), ...Array(200).fill(partyWord({ yaw: 12288, move: 1, hop: 1 }))]);
  assert.equal(fxs(g.v, MC.RH_FX_HIT, n0).length, 6);
  assert.equal(ball(g, 0).score, 2, 'and home for the second');
  assert.ok(compared >= 3000, `${compared} compared`);
});

for (const [balls, ticks] of [[8, 12200], [64, 12400]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, every ball crossing, some hit and most runs not, every hit where the client draws a vehicle, coins taken, placed by points at 90 s; equal on 1 and 4 threads`, async () => {
    const bytes = partyBytes(true);
    const st = { start: -1, over: -1, cross: 0, hits: 0, mirror: 0, coins: 0, scores: null, cr: null, places: null, pts: null };
    let seen = 0;
    const r = await playParty({ bytes, seed: balls, mg: L.MG_TRAFFIC, bots: balls, ticks, onTick: (t, sim, v) => {
      const h = v.hole();
      if (st.over >= 0) return;
      if (st.start < 0 && h.state === L.H_PLAY) { st.start = h.start; forget(); }
      for (; seen < v.fxCount(); seen++) {
        const x = v.fx(seen);
        if (st.start < 0) continue;
        if (x.kind === MC.RH_FX_CROSS) st.cross++;
        if (x.kind === MC.RH_FX_COIN && x.owner !== 255) st.coins++;
        if (x.kind === MC.RH_FX_HIT) {
          st.hits++;
          if (vehicleAt(stage(v), x.pos[0], x.pos[2], x.tick - st.start, 1.001) === (x.shot & 7)) st.mirror++;
        }
      }
      if (h.state === L.H_OVER) {
        st.over = t;
        const all = [...Array(balls).keys()].map((p) => v.partier(p));
        st.scores = all.map((b) => b.score); st.cr = all.map((b) => b.m >>> 24); st.places = all.map((b) => b.place); st.pts = all.map((b) => b.pts);
        assert.ok(all.every((b) => !b.out));
      }
    } });
    assert.equal(r.sim.error().code, 0);
    assert.ok(st.over > 0, 'the round ended');
    assert.equal(st.over - st.start, MC.RH_LEN, 'at 90 s');
    assert.ok(st.cr.every((n) => n >= 2), `crossings ${st.cr}`);
    assert.ok(st.cross >= 5 * balls, `${st.cross} crossings`);
    assert.ok(st.hits >= balls / 2 && st.hits < st.cross, `${st.hits} hits to ${st.cross} crossings`);
    assert.equal(st.mirror, st.hits, 'every hit where the client draws its vehicle');
    assert.ok(st.coins >= 4, `${st.coins} coins`);
    assert.ok(new Set(st.scores).size >= 4, `scores ${st.scores}`);
    st.scores.forEach((sc, p) => assert.equal(st.places[p], 1 + st.scores.filter((o) => o > sc).length));
    assert.ok(st.pts.every((x) => x >= 1 && x <= 10) && st.pts.includes(10), `points ${st.pts}`);
    const parsed = parseLog(r.log);
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks, threads: 1, tag: 'r1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks, threads: 4, tag: 'r4', startWorkers });
    const d = await replay({ bytes, log: parsed, ticks, threads: 1, tag: 'rd' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('the client module: draws the street, its traffic, lights and coins through the countdown and play, frames it, writes its HUD lines, takes its FX', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  for (const n of [3, 256]) {
    const g = await room(n, { play: false, seed: 20 + n });
    const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null };
    const lines = [];
    const hctx = { put: (x, y, str, c) => lines.push([y, str, c]), centre: (y, str, c) => lines.push([y, str, c]), right: (y, str, c) => lines.push([y, str, c]), rows: 44, C: {}, slot: 0, now: 0 };
    let most = 0;
    for (let k = 0; k < 1700; k++) {
      if (k % 400 === 100) {
        for (const a of [out.solid, out.glow, out.decals, out.casters]) a.length = 0;
        out.scene.clear();
        lines.length = 0;
        traffic.draw(g.v, { tick: g.v.tick, dt: 0, now: k * 8, slot: 0 }, out);
        assert.ok(out.scene.count > 150 && out.scene.count < 12000, `${out.scene.count} solids`);
        most = Math.max(most, out.casters.length);
        for (let i = 0; i < out.scene.count * 16; i++) assert.ok(Number.isFinite(out.scene.data[i]), 'finite');
        traffic.hud(g.v, { ...hctx, me: g.v.partier(0) });
        for (const l of lines) assert.ok(l[0] >= 2 && l[0] <= 6 && l[1].length <= 60, l[1]);
        if (g.v.hole().state === L.H_PLAY) assert.ok(lines.some((l) => /CROSSINGS 0 +POINTS 0/.test(l[1])) && lines.some((l) => /ZEBRA CLEAR (IN|FOR) \d/.test(l[1])), lines.map((l) => l[1]).join(' | '));
      }
      g.step();
    }
    assert.ok(most > 6, `${most} shadows of traffic`);
    assert.ok(out.solid.some((x) => x.kind !== undefined) && out.decals.length >= 1, 'coins drawn');
    const s = stage(g.v);
    const fr = traffic.frame(g.v);
    assert.equal(fr.shape, 'square');
    assert.ok(Math.abs(fr.radius - g.v.party().size) < 1e-3 && Math.abs(fr.centre[0] - C) < 1e-3);
    assert.equal(traffic.facing(g.v, 0), 0);
    const ctx = { slot: 0, glow: () => {}, banner: () => {}, feed: () => {}, name: (p) => `P${p + 1}`, dist: 10, sound: {}, C: {} };
    for (const fx of [{ kind: MC.RH_FX_CROSS, owner: 0, shot: 1, size: 2 }, { kind: MC.RH_FX_CROSS, owner: 1, shot: 1, size: 1 }, { kind: MC.RH_FX_HIT, owner: 0, shot: 3 | 16, size: 14 },
      { kind: MC.RH_FX_HIT, owner: 1, shot: 5, size: 20 }, { kind: MC.RH_FX_COIN, owner: 255, shot: 0, size: 0 }, { kind: MC.RH_FX_COIN, owner: 0, shot: 0, size: 3 },
      ...[1, 2, 3, 4, 5].map((shot) => ({ kind: MC.RH_FX_CALL, owner: 255, shot, size: 0 }))]) traffic.fx({ ...fx, pos: [s.xa, PLAT_Y, C] }, ctx);
  }
  assert.ok(traffic.hint.length <= 70 && traffic.rules.length <= 70);
});

test('the brain: its danger is a vehicle there on that tick; alone on the street it waits at the kerb for a gap, crosses again and again and is seldom hit, its words landing 6 ticks late', async () => {
  const g = await room(1, { seed: 23 });
  const s = stage(g.v);
  // danger: 1 on a vehicle, 0 on a median and on the pavement
  const t = tp(g), st = traffics(s)[0];
  let nose = null;
  vehicles(s, st, t + 50, 5, 2 * s.hw - 5, (kind, col, front, len) => { nose ??= front - len / 2; });
  const T = g.v.party().start + t + 50;
  assert.equal(traffic.brain.danger(g.v, st.xc, zAt(s, st, nose), T), 1);
  assert.equal(traffic.brain.danger(g.v, s.xa - 2, zAt(s, st, nose), T), 0);
  const safe = s.strips.find((q) => !q.traffic);
  assert.equal(traffic.brain.danger(g.v, safe.xc, zAt(s, st, nose), T), 0);
  const bot = new Partier(0, 5, 0.9);
  const queue = [];
  let waited = 0, last = -1;
  while (g.v.hole().state === L.H_PLAY) {
    queue.push(bot.think(g.v, g.v.tick + 6, 6));
    const w = queue.length > 6 ? queue.shift() : still;
    const b = ball(g, 0);
    if (b.ground && b.x < s.xa && Math.hypot(b.vx, b.vz) < 0.3 && tp(g) > 200) waited++;
    g.step(w !== last ? [[L.EV_INPUT, 0, w]] : []);
    last = w;
  }
  const b = ball(g, 0), hits = fxs(g.v, MC.RH_FX_HIT).length;
  assert.ok(b.m >>> 24 >= 7, `${b.m >>> 24} crossings`);
  assert.ok(hits <= 3, `${hits} hits`);
  assert.ok(waited > 100, `${waited} ticks waiting at the near kerb`);
});
