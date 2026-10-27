// MINGLE (src/mg/mingle.wat): the carousel and the hall for the crowd, the
// cycle's clock, the number and the rooms it opens, the carousel carrying,
// the hall's floor sweeping, the doors and the walls, the count at the slam
// and its fallback, the last two, the rooms shoving everyone out; the
// prediction through all of it; rounds of AI balls; the client module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y, seed as pseed } from '../src/party-view.mjs';
import { replay, parseLog, encodeLog, decodeTrace, newMemory, instantiate, Sim } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/mingle.mjs'; // MI_*: the minigame's own constants
import mingle, { stage, roomsOf, when, omega, musicOf, winOf, frame, roomAt, count, saved, PHASE } from '../client/mg/mingle.mjs';

const C = L.B_CX;
const TICK = 0.008;
const TAU = 2 * Math.PI;
const f = Math.fround;
const rcOf = (n) => Math.min(f(f(f(Math.sqrt(n)) * f(MC.MI_RCK)) + MC.MI_RC0), MC.MI_RCMAX);
const roomsFor = (n) => Math.max(MC.MI_KMIN, Math.min(MC.MI_KMAX, MC.MI_LIVE0 + Math.ceil(n / MC.MI_LIVEK)));

// A room of n balls in Mingle, on the debug build (a NaN traps) unless asked not to, stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7, debug = true } = {}) {
  const sim = await newParty(debug);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_MINGLE + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
// A room of n whose first call is num (trying seeds from `from`).
async function roomCalling(n, num, from = 1) {
  for (let s = from; s < from + 200; s++) {
    const g = await room(n, { seed: s });
    if (stage(g.v).num === num) return g;
  }
  throw new Error(`no seed calls ${num} for ${n}`);
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// Ball p still at (x, z) on the floor, moving at (vx, vz), nobody's bump on it.
function put(g, p, x, z, { vx = 0, vz = 0 } = {}) {
  g.dv.setUint16(rec(p) + L.B_HITT, 0, true);
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, PLAT_Y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE | L.PF_GROUND);
}
// The point (u, w) of room r's frame in the world, and ball p there.
const at = (st, r, u, w) => [st.cx + u * r.c - w * r.s, st.cx + u * r.s + w * r.c];
const putIn = (g, p, r, u, w = 0, o) => { const st = stage(g.v); put(g, p, ...at(st, r, st.a + u, w), o); };
// Places inside a room, 2.47 m apart at least: by depth, the front pair, the middle, the back pair.
const SPOTS = [[5.3, -1.45], [5.3, 1.45], [3.3, 0], [1.3, -1.45], [1.3, 1.45]];
const playT = (g) => g.v.party().t; // the tick into play the next step plays
const stepTo = (g, t, recs) => { while (playT(g) < t) g.step(recs?.()); };
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
const word = (yaw, move = 1, hop = 0) => partyWord({ yaw: Math.round(yaw / TAU * 16384) & 16383, move, hop });
const openRooms = (g) => roomsOf(g.v).filter((r) => r.open);
const rho = (b) => Math.hypot(b.pos[0] - C, b.pos[2] - C);
const bear = (b) => Math.atan2(b.pos[2] - C, b.pos[0] - C);
const inNow = (v) => new Set([...Array(L.NPLAYER).keys()].filter((p) => { const b = v.partier(p); return b.live && !b.out && !b.falling; }));
const popcount = (m) => { let n = 0; for (const x of m) for (let k = 0; k < 32; k++) n += (x >>> k) & 1; return n; };

test('the stage for 1, 8, 64 and 256: a carousel for the crowd, a hall of rooms round it, every ball on the carousel apart; the first music with play', async () => {
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party(), st = stage(g.v);
    assert.equal(r.game, L.MG_MINGLE);
    assert.deepEqual([r.kind, r.len, r.idle, r.flags & L.PGF_BUMPS], [L.PK_OUT, MC.MI_LEN, f(MC.MI_IDLE), L.PGF_BUMPS]);
    assert.equal(st.rc, rcOf(n), `the carousel ${st.rc} m for ${n}`);
    assert.equal(st.K, roomsFor(n));
    assert.ok(st.a >= st.rc + MC.MI_RING - 1e-3, 'the walls clear of the carousel');
    assert.ok(2 * st.a * Math.tan(Math.PI / st.K) >= MC.MI_PITCH - 0.01, 'each side long enough for its room');
    assert.ok(st.ro > st.a / Math.cos(Math.PI / st.K) + MC.MI_DI, 'the floor under every room');
    assert.deepEqual([st.nlive, popcount(st.live)], [st.K, st.K], 'every room live');
    const rooms = roomsOf(g.v, st);
    for (let k = 0; k < st.K; k++) {
      const d = (rooms[(k + 1) % st.K].yaw - rooms[k].yaw + 2 * TAU) % TAU;
      assert.ok(Math.abs(d - TAU / st.K) < 1e-3, `rooms ${k} and ${k + 1} evenly round`);
      assert.ok(Math.abs(Math.hypot(rooms[k].c, rooms[k].s) - 1) < 1e-5);
    }
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.ok(b.ground && !b.out && b.pos[1] === PLAT_Y);
      assert.ok(rho(b) <= st.rc * MC.MI_SPAWN + 1e-3, `${n}: P${p + 1} on the carousel`);
      for (let q = 0; q < p; q++) assert.ok(Math.hypot(b.pos[0] - g.v.partier(q).pos[0], b.pos[2] - g.v.partier(q).pos[2]) >= 2, `${n}: P${p + 1} and P${q + 1} apart`);
    }
    const k0 = g.v.fxCount();
    while (g.v.hole().state !== L.H_PLAY) g.step();
    const s = stage(g.v);
    assert.deepEqual([s.cycle, s.c0, s.n], [0, 0, n]);
    const music = fxs(g.v, MC.MI_FX_MUSIC, k0);
    assert.equal(music.length, 1);
    assert.deepEqual([music[0].shot, music[0].size], [0, s.nopen]);
    assert.equal(popcount(s.open), s.nopen);
    assert.equal(s.open[0] & ~s.live[0], 0, 'opens only live rooms');
  }
});

test('the number and the rooms: 2 to 6, under half the balls in (1 under five), rooms for half at most, two from three balls, never a place for every ball', async () => {
  const seen = new Set();
  for (const n of [2, 3, 4, 5, 6, 7, 9, 12, 16, 33, 64, 200]) {
    for (const seed of [1, 2, 3]) {
      const g = await room(n, { seed: seed * 101 + n });
      const st = stage(g.v);
      const hi = Math.min(MC.MI_NMAX, (n - 1) >> 1);
      if (hi < 2) assert.equal(st.num, 1, `${n}: one`);
      else {
        assert.ok(st.num >= 2 && st.num <= hi, `${n}: ${st.num}`);
        assert.equal(st.num, 2 + (pseed(g.v, MC.MI_KNUM) % (hi - 1)), 'from $p_seed');
      }
      seen.add(st.num);
      const want = Math.min(st.nlive, Math.max(n >= 3 ? 2 : 1, Math.floor(Math.trunc(n * MC.MI_SURV) / st.num)));
      assert.equal(st.nopen, want, `${n}: ${st.nopen} rooms`);
      assert.ok(st.nopen * st.num < n || n === 1, `${n}: ${st.nopen} rooms of ${st.num}`);
    }
  }
  assert.ok([1, 2, 3, 4, 5, 6].every((k) => seen.has(k)), `every number called: ${[...seen]}`);
  // rooms close for good as the crowd thins, and stay closed: 40 balls, 30 leave in the music
  const g = await room(40, { seed: 4 });
  let st = stage(g.v);
  assert.equal(st.nlive, roomsFor(40));
  g.step([...Array(30).keys()].map((k) => [L.EV_LEAVE, k + 10]));
  const live0 = st.live.slice();
  stepTo(g, when(st, 0).end + 1);
  st = stage(g.v);
  assert.equal(st.cycle, 1);
  assert.equal(st.nlive, MC.MI_LIVE0 + Math.ceil(10 / MC.MI_LIVEK), 'the rooms ten balls need');
  assert.equal(popcount(st.live), st.nlive);
  assert.equal(st.live[0] & ~live0[0], 0, 'closed for good, never back');
  assert.equal(st.live[1] & ~live0[1], 0);
  assert.equal(st.open[0] & ~st.live[0], 0, 'opens only live rooms');
  // the live rooms spread round the hall: no gap of more than twice the even one
  const live = roomsOf(g.v, st).filter((r) => r.live).map((r) => r.k);
  for (let i = 0; i < live.length; i++) assert.ok(((live[(i + 1) % live.length] - live[i] + st.K) % st.K || st.K) <= 2 * Math.ceil(st.K / live.length));
});

test('the clock: the music from $p_seed, the doors open 10 s less 0.75 s a cycle, the slam, the hold, the shove, the next music; the client works it from any cycle on', async () => {
  const g = await room(10, { seed: 3 });
  const st0 = stage(g.v);
  const k0 = g.v.fxCount();
  const moments = [];
  for (let c = 0, t = 0; c < 4; c++) {
    const m = musicOf(st0, c);
    assert.ok(m >= MC.MI_M0 && m <= MC.MI_M1 && m > L.PRED_MAX, `music ${m}`);
    assert.equal(m, MC.MI_M0 + pseed(g.v, MC.MI_KMUSIC + c) % (MC.MI_M1 - MC.MI_M0 + 1));
    assert.equal(winOf(c), MC.MI_W0 - MC.MI_WK * c);
    moments.push([t + m, t + m + winOf(c), t + m + winOf(c) + MC.MI_HOLD + MC.MI_EJECT]);
    t += m + winOf(c) + MC.MI_HOLD + MC.MI_EJECT;
  }
  assert.equal(winOf(40), MC.MI_W1, 'never under 5 s');
  // keep everyone on the carousel's middle: nobody in a room, nobody out, the cycles roll on
  const hold = () => { for (let p = 0; p < 10; p++) put(g, p, C + 3 * Math.cos(p), C + 3 * Math.sin(p)); };
  for (let t = 0; t < moments[3][2] + 2; t++) {
    const w = when(st0, playT(g));
    assert.equal(mingle.music(g.v, g.v.tick), w.ph === PHASE.MUSIC);
    if (t % 400 === 0) hold();
    g.step();
  }
  const calls = fxs(g.v, MC.MI_FX_CALL, k0), slams = fxs(g.v, MC.MI_FX_SLAM, k0), musics = fxs(g.v, MC.MI_FX_MUSIC, k0);
  const t0 = g.v.party().start;
  assert.deepEqual(calls.map((x) => x.tick - t0), moments.map((m) => m[0]));
  assert.deepEqual(calls.map((x) => x.size), [0, 1, 2, 3].map(winOf));
  assert.deepEqual(slams.map((x) => x.tick - t0), moments.map((m) => m[1]));
  assert.deepEqual(slams.map((x) => [x.shot, x.size]), [[0, 0], [0, 0], [0, 0], [0, 0]], 'nobody in a room: nobody out');
  assert.deepEqual(musics.map((x) => x.tick - t0), moments.map((m) => m[2]));
  assert.equal(g.v.party().left, 10);
  // the header's cycle and its start; the client counts on from cycle 0's header to the same moments
  const st = stage(g.v);
  assert.deepEqual([st.cycle, st.c0], [4, moments[3][2]]);
  for (const [c, [stop, slam, end]] of moments.entries()) {
    const w = when(st0, stop);
    assert.deepEqual([w.c, w.stop, w.slam, w.back, w.end, w.ph], [c, stop, slam, slam + MC.MI_HOLD, end, PHASE.OPEN]);
    assert.deepEqual([when(st0, stop - 1).ph, when(st0, slam).ph, when(st0, slam + MC.MI_HOLD).ph, when(st0, end).c], [PHASE.MUSIC, PHASE.SHUT, PHASE.OUT, c + 1]);
  }
});

test('the carousel carries a ball with no keys round with it through the music, winding up and down, its way by the cycle; still once the music stops', async () => {
  let ways = new Set();
  for (const seed of [3, 4, 5, 6]) {
    const g = await room(3, { seed });
    const st = stage(g.v), w = when(st, 0);
    const r0 = st.rc * 0.6;
    put(g, 0, C + r0, C);
    put(g, 1, C - r0, C);
    put(g, 2, C, C + r0);
    let turned = 0, last = bear(g.v.partier(0)), want = 0;
    while (playT(g) < w.stop) {
      want += omega(st, 0, playT(g)) * TICK;
      g.step();
      const a = bear(g.v.partier(0));
      turned += ((a - last + 3 * Math.PI) % TAU) - Math.PI;
      last = a;
    }
    const sign = Math.sign(omega(st, 0, MC.MI_RAMP));
    ways.add(sign);
    assert.ok(Math.sign(turned) === sign && Math.abs(turned) > 0.6 * Math.abs(want) && Math.abs(turned) < 1.05 * Math.abs(want),
      `turned ${turned.toFixed(2)} rad, the carousel ${want.toFixed(2)}`);
    assert.equal(omega(st, 0, w.stop), 0);
    assert.ok(Math.abs(Math.abs(omega(st, 0, MC.MI_RAMP)) * st.rc - MC.MI_VRIM) < 1e-4, 'flat out at the rim');
    assert.ok(rho(g.v.partier(0)) < st.rc, 'still on it');
    // once it stops, a ball put still stays still
    put(g, 0, C + r0, C);
    put(g, 1, C - r0, C);
    put(g, 2, C, C + r0);
    for (let k = 0; k < 100; k++) g.step();
    const b = g.v.partier(0);
    assert.deepEqual([b.pos[0], b.pos[2]], [f(C + r0), C]);
  }
  assert.equal(ways.size, 2, 'both ways round');
});

test('the hall\'s floor sweeps a ball back onto the carousel through the music, at 5 m/s at least; not once the doors open', async () => {
  const g = await room(3, { seed: 8 });
  const st = stage(g.v);
  const r1 = (st.rc + st.a) / 2;
  put(g, 0, C + r1, C);
  put(g, 1, C - st.a + 2, C, { vx: -3 }); // rolling out toward a wall
  put(g, 2, C, C - r1);
  g.step();
  assert.ok(g.v.partier(0).vel[0] <= -MC.MI_SWEEP + 1e-3, `${g.v.partier(0).vel[0]}`);
  assert.ok(g.v.partier(1).vel[0] >= MC.MI_SWEEP - 1e-3, 'turned back in');
  const due = Math.ceil((st.a - 2 - st.rc) / (0.97 * MC.MI_SWEEP) / TICK) + 15;
  for (let k = 0; k < due; k++) g.step();
  for (const p of [0, 1, 2]) assert.ok(rho(g.v.partier(p)) < st.rc + 0.1, `P${p + 1} on the carousel`);
  stepTo(g, when(st, 0).stop + 5);
  put(g, 0, C + r1, C);
  for (let k = 0; k < 50; k++) g.step();
  assert.equal(g.v.partier(0).pos[0], f(C + r1), 'no sweep with the doors open');
});

test('doors and walls: a ball left in a room through the music is held in by its shut door; in the scramble an open door lets a ball in and a shut one bounces it; the walls hold; the slam puts a ball in the doorway in or out by its centre; shut through the hold', async () => {
  const g = await room(12, { seed: 21 });
  let st = stage(g.v);
  const w = when(st, 0);
  const rooms = roomsOf(g.v, st);
  const [O, O2] = rooms.filter((r) => r.open), S = rooms.find((r) => !r.open);
  assert.ok(O && O2 && S);
  const park = () => { for (let p = 3; p < 12; p++) put(g, p, C + 2.2 * (p - 7), C); };
  const push = (p, r, a = 0) => [L.EV_INPUT, p, word(r.yaw + a)];
  const u = (p, r) => frame(st, r, g.v.partier(p).pos[0], g.v.partier(p).pos[2])[0] - st.a;
  const wOf = (p, r) => frame(st, r, g.v.partier(p).pos[0], g.v.partier(p).pos[2])[1];
  // the music: the sweep presses a ball left in a room to its shut door
  stepTo(g, w.stop - 200);
  park();
  putIn(g, 0, O, 4);
  for (let k = 0; k < 150; k++) g.step();
  assert.ok(Math.abs(u(0, O) - (MC.MI_WT + 1)) < 0.01, `held in: ${u(0, O)}`);
  // the scramble: in through the open door to the back wall; bounced off the shut one; across a room into its side wall
  stepTo(g, w.stop);
  park();
  putIn(g, 0, O, -5);
  putIn(g, 1, S, -5);
  putIn(g, 2, O2, 2);
  for (let k = 0; k < 320; k++) g.step([push(0, O), push(1, S), push(2, O2, Math.PI / 2)]);
  st = stage(g.v);
  assert.equal(roomAt(st, roomsOf(g.v, st), g.v.partier(0).pos[0], g.v.partier(0).pos[2]), O.k, 'P1 in');
  assert.ok(Math.abs(u(0, O) - (MC.MI_WT + MC.MI_DI - 1)) < 0.01, `P1 against the back wall: ${u(0, O)}`);
  assert.ok(u(1, S) < -MC.MI_WT - 0.99, 'P2 kept out');
  assert.ok(Math.abs(wOf(2, O2) - (MC.MI_WI / 2 - 1)) < 0.01, `P3 against the side wall: ${wOf(2, O2)}`);
  // the slam: centre a hair inside the door's line, in; a hair outside, out
  stepTo(g, w.slam);
  for (let p = 0; p < 12; p++) put(g, p, C + 2.2 * (p - 6), C);
  putIn(g, 0, O, 0.1, -0.9);
  putIn(g, 1, O2, -0.1, 0.5);
  g.step();
  assert.ok(Math.abs(u(0, O) - (MC.MI_WT + 1)) < 1e-3, `in: ${u(0, O)}`);
  assert.ok(Math.abs(u(1, O2) + (MC.MI_WT + 1)) < 1e-3, `out: ${u(1, O2)}`);
  assert.deepEqual([g.v.u8[L.PG_S + MC.MI_ROOMOF], g.v.u8[L.PG_S + MC.MI_ROOMOF + 1]], [O.k, 255], 'counted where the slam left them');
  // the hold: shut
  putIn(g, 1, O, -3);
  for (let k = 0; k < MC.MI_HOLD - 10; k++) g.step([push(1, O)]);
  assert.ok(u(1, O) < -MC.MI_WT - 0.99 && u(1, O) > -MC.MI_WT - 1.2, `against the slammed door: ${u(1, O)}`);
});

test('the slam: the balls in a room of exactly the number are safe; a room over it, one under it and the hall are out, together; the JS counts as the sim does', async () => {
  for (const num of [2, 3]) {
    const g = await roomCalling(7, num);
    let st = stage(g.v);
    const w = when(st, 0);
    stepTo(g, w.slam);
    const [A, B] = openRooms(g);
    let p = 0;
    for (let i = 0; i < num; i++) { putIn(g, p, A, SPOTS[i][0], SPOTS[i][1]); p++; }
    for (let i = 0; i < 7 - num && i < SPOTS.length; i++) { putIn(g, p, B, SPOTS[i][0], SPOTS[i][1]); p++; } // 5 or 4: over
    const was = inNow(g.v);
    const k0 = g.v.fxCount();
    g.step();
    st = stage(g.v);
    const js = count(st, roomsOf(g.v, st), (q) => (was.has(q) ? g.v.partier(q).pos : null));
    for (let q = 0; q < 7; q++) assert.equal(g.v.u8[L.PG_S + MC.MI_ROOMOF + q], js.of[q] < 0 ? 255 : js.of[q], `P${q + 1}'s room`);
    assert.deepEqual([g.v.u8[L.PG_S + MC.MI_CNT + A.k], g.v.u8[L.PG_S + MC.MI_CNT + B.k]], [js.cnt[A.k], js.cnt[B.k]]);
    assert.deepEqual([js.cnt[A.k], js.cnt[B.k]], [num, 7 - num]);
    for (let q = 0; q < 7; q++) {
      const b = g.v.partier(q);
      assert.equal(b.out, q >= num, `P${q + 1}`);
      assert.equal(b.place, q >= num ? 7 : 0, 'out on one tick: one place');
      assert.equal(saved(g.v, q), q < num ? 1 : 0);
    }
    const slam = fxs(g.v, MC.MI_FX_SLAM, k0);
    assert.deepEqual([slam.length, slam[0].shot, slam[0].size], [1, num, 7 - num]);
    assert.equal(fxs(g.v, L.FX_SINK, k0).length, 7 - num);
    assert.deepEqual([st.safe, st.lost, g.dv.getUint32(L.PG_H + MC.MI_DEEP, true)], [num, 7 - num, 0]);
    assert.equal(mingle.sink({ owner: num }, (q) => `P${q + 1}`, g.v), `P${num + 1} WAS ONE OF ${7 - num}  ${7 - 2 * num === 1 ? 'ONE' : 7 - 2 * num} TOO MANY`);
    assert.equal(g.v.party().left, num);
  }
});

test('no room exact: each room over the number keeps that many, the deepest in, the rest out; nobody in a room over or exact, nobody out', async () => {
  const g = await roomCalling(7, 2);
  let st = stage(g.v);
  let w = when(st, 0);
  stepTo(g, w.slam);
  const [A, B] = openRooms(g);
  // three in each: the deepest two of each kept; P7 in the hall
  const order = [[A, 1, 1.3, -1.45], [A, 0, 5.3, 1.45], [A, 2, 3.3, 0], [B, 3, 3.3, 0], [B, 4, 1.3, 1.45], [B, 5, 5.3, -1.45]];
  for (const [r, q, u, ww] of order) putIn(g, q, r, u, ww);
  put(g, 6, C, C);
  const k0 = g.v.fxCount();
  g.step();
  assert.deepEqual([...Array(7).keys()].map((q) => g.v.partier(q).out), [false, true, false, false, true, false, true]);
  st = stage(g.v);
  assert.deepEqual([st.safe, st.lost, g.dv.getUint32(L.PG_H + MC.MI_DEEP, true)], [4, 3, 1]);
  assert.deepEqual([g.v.u8[L.PG_S + MC.MI_CNT + A.k], g.v.u8[L.PG_S + MC.MI_CNT + B.k]], [2, 2], 'trimmed to the number');
  assert.deepEqual([0, 1, 4, 6].map((q) => g.v.u8[L.PG_S + MC.MI_TRIM + q]), [0, 1, 1, 0]);
  assert.equal(mingle.sink({ owner: 1 }, (q) => `P${q + 1}`, g.v), 'P2 WAS NEAREST THE DOOR');
  assert.equal(fxs(g.v, MC.MI_FX_SLAM, k0)[0].shot, 4);
  assert.equal(mingle.sink({ owner: 6 }, (q) => `P${q + 1}`, g.v), 'P7 WAS LEFT OUT');
  // under the number everywhere: two of three in one, one in the other, the rest in the hall: nobody out
  const h = await roomCalling(7, 3);
  stepTo(h, when(stage(h.v), 0).slam);
  const [A2, B2] = openRooms(h);
  for (let q = 0; q < 7; q++) put(h, q, C + 2.5 * (q - 3), C);
  putIn(h, 0, A2, 5.3, 0);
  putIn(h, 1, A2, 1.3, 0);
  putIn(h, 2, B2, 3.3, 0);
  const k1 = h.v.fxCount();
  h.step();
  assert.deepEqual([fxs(h.v, MC.MI_FX_SLAM, k1)[0].shot, fxs(h.v, MC.MI_FX_SLAM, k1)[0].size], [0, 0]);
  assert.equal(h.v.party().left, 7, 'nobody out');
});

test('the last two: one room for one; both in it, the one nearer the door is out and the deeper wins', async () => {
  for (const deeper of [0, 1]) {
    const g = await room(2, { seed: 9 + deeper });
    const st = stage(g.v);
    assert.deepEqual([st.num, st.nopen], [1, 1]);
    stepTo(g, when(st, 0).slam);
    const [A] = openRooms(g);
    putIn(g, deeper, A, 5.2, 0.4);
    putIn(g, 1 - deeper, A, 2.4, -0.6);
    g.step();
    const r = g.v.party();
    assert.ok(g.v.partier(1 - deeper).out && !g.v.partier(deeper).out);
    assert.equal(r.state, L.H_OVER);
    assert.equal(r.winner, deeper);
    assert.deepEqual([g.v.partier(deeper).place, g.v.partier(1 - deeper).place, g.v.partier(deeper).pts, g.v.partier(1 - deeper).pts], [1, 2, 10, 1]);
    assert.equal(g.dv.getUint32(L.PG_H + MC.MI_DEEP, true), 1);
    assert.equal(mingle.sink({ owner: 1 - deeper }, (q) => `P${q + 1}`, g.v), `P${2 - deeper} WAS NEAREST THE DOOR`);
  }
});

test('the hold, then the rooms shove everyone out at 7 m/s and across to the door, onto the hall, before the doors shut and the music sweeps them in', async () => {
  const g = await room(3, { seed: 12 });
  let st = stage(g.v);
  const w = when(st, 0);
  stepTo(g, w.slam);
  const [A, B] = openRooms(g);
  putIn(g, 0, A, 5.3, 1.45); // in a back corner: to the door across the room
  putIn(g, 1, B, 1.3, -1.45);
  put(g, 2, C, C);
  g.step();
  assert.ok(!g.v.partier(0).out && !g.v.partier(1).out && g.v.partier(2).out);
  // the hold: still, in
  stepTo(g, w.back);
  assert.equal(roomAt(st, roomsOf(g.v, st), g.v.partier(0).pos[0], g.v.partier(0).pos[2]), A.k);
  let fastest = 0;
  while (playT(g) < w.end) {
    g.step();
    const b = g.v.partier(0);
    const [u] = frame(st, A, b.pos[0], b.pos[2]);
    const vu = b.vel[0] * A.c + b.vel[2] * A.s;
    if (u > st.a + 1.2) assert.ok(vu <= -MC.MI_EJV + 1e-3, `going out at ${-vu}`);
    fastest = Math.max(fastest, -vu);
  }
  g.step();
  st = stage(g.v);
  for (const [p, r] of [[0, A], [1, B]]) {
    const b = g.v.partier(p);
    const [u] = frame(st, r, b.pos[0], b.pos[2]);
    assert.ok(u < st.a - MC.MI_WT - 0.99, `P${p + 1} out on the hall: ${u - st.a}`);
    assert.equal(roomAt(st, roomsOf(g.v, st), b.pos[0], b.pos[2]), -1);
  }
  assert.equal(st.cycle, 1, 'the next music');
  for (let k = 0; k < 600; k++) g.step();
  assert.ok(rho(g.v.partier(0)) < st.rc + 1 && rho(g.v.partier(1)) < st.rc + 1, 'swept back onto the carousel');
});

test('the prediction matches the confirmed ball bit for bit: on the carousel winding up, swept across the hall, in through a door as it opens, a slam it survives, the shove, the next music', async () => {
  const g = await roomCalling(5, 2);
  let st = stage(g.v);
  const w = when(st, 0);
  const [A, B] = openRooms(g);
  // the others well away from P1 on the far side of the carousel from A, and later from the room
  const far = (q, k) => { const a = A.yaw + Math.PI + 0.5 * (k - 1.5); put(g, q, C + 0.75 * st.rc * Math.cos(a), C + 0.75 * st.rc * Math.sin(a)); };
  for (let q = 1; q < 5; q++) far(q, q);
  put(g, 0, ...at(st, A, st.rc * 0.4, 0));
  // A: short pushes every way on the carousel as it winds up
  const roll = Array.from({ length: 220 }, (_, k) => partyWord({ yaw: (k * 2477) & 16383, move: (k >> 4) & 1, hop: k % 90 === 30 ? 1 : 0 }));
  assert.ok(predicted(g, roll) >= roll.length);
  // B: from the hall in front of A's door, pushing for it against the sweep through the stop, in, to the back wall
  stepTo(g, w.stop - 140, () => [[L.EV_INPUT, 0, partyWord({})]]);
  for (let q = 1; q < 5; q++) far(q, q);
  putIn(g, 0, A, -3.5, 0.3);
  const inA = Array(520).fill(word(A.yaw));
  assert.ok(predicted(g, inA) >= inA.length);
  assert.equal(roomAt(st, roomsOf(g.v, st), g.v.partier(0).pos[0], g.v.partier(0).pos[2]), A.k, 'P1 in');
  // C: P2 in A with it, P3 and P4 in B, P5 in the hall; still through the slam (P1 survives) into the hold
  putIn(g, 0, A, 5.3, -1.45);
  putIn(g, 1, A, 1.3, 1.45);
  putIn(g, 2, B, 5.3, -1.45);
  putIn(g, 3, B, 1.3, 1.45);
  put(g, 4, C, C);
  assert.ok(predicted(g, Array(w.slam - playT(g) + 40).fill(partyWord({}))) > 0);
  assert.ok(!g.v.partier(0).out && g.v.partier(4).out, 'P1 safe, P5 out');
  // D: the others out of its way; pushing about through the shove, out onto the hall, into the next music
  for (let q = 1; q < 4; q++) far(q, q);
  const out = Array.from({ length: w.end - playT(g) + 420 }, (_, k) => (k < 150 ? partyWord({}) : partyWord({ yaw: (k * 977) & 16383, move: (k >> 5) & 1 })));
  assert.ok(predicted(g, out) >= out.length);
  st = stage(g.v);
  assert.equal(st.cycle, 1);
  assert.equal(roomAt(st, roomsOf(g.v, st), g.v.partier(0).pos[0], g.v.partier(0).pos[2]), -1, 'shoved out');
});

// A round of AI balls (client/party-bot.mjs's Partier, steered by this
// minigame's brain), each word landing `delay` ticks after it's decided,
// recorded as a log; at each slam the JS's count against the sim's.
async function aiRound({ bytes, seed, balls, ticks, delay = 8 }) {
  const memory = newMemory();
  const sim = new Sim(await instantiate(await WebAssembly.compile(bytes), memory), memory);
  sim.init(seed);
  const v = new View(memory.buffer);
  const bots = Array.from({ length: balls }, (_, k) => ({ r: new Partier(k, seed, 0.3 + 0.6 * ((k * 7) % 10) / 9), queue: [], last: -1 }));
  const recs = [];
  const stats = { start: -1, over: -1, slams: [], places: null, pts: null, winner: -1, mirror: 0, places0: 0 };
  let seen = 0;
  for (let t = 0; t < ticks; t++) {
    const now = [];
    if (t === 0) for (const b of bots) now.push([L.EV_JOIN, b.r.slot]);
    for (const b of bots) {
      b.queue.push(b.r.think(v, t + delay, 2 * delay));
      if (b.queue.length > delay) {
        const w = b.queue.shift();
        if (w !== b.last) { now.push([L.EV_INPUT, b.r.slot, w]); b.last = w; }
      }
    }
    for (const [kind, slot, word] of now) recs.push([t, kind, slot, word]);
    const g0 = v.party(), st0 = stage(v);
    const was = g0.state === L.H_PLAY && g0.t === when(st0, g0.t).slam && when(st0, g0.t).own ? inNow(v) : null;
    sim.feedPlayers(now);
    sim.x.step();
    if (sim.error().code) break;
    if (was) {
      // the count as the JS has it: the balls in before it, where it leaves them (an out only stops a ball)
      const st = stage(v), rooms = roomsOf(v, st);
      const js = count(st, rooms, (p) => (was.has(p) ? v.partier(p).pos : null));
      const deep = v.dv.getUint32(L.PG_H + MC.MI_DEEP, true);
      for (let p = 0; p < L.NPLAYER; p++) {
        const k = v.u8[L.PG_S + MC.MI_ROOMOF + p];
        assert.ok(k === (js.of[p] < 0 ? 255 : js.of[p]) || (deep && k === 255 && js.cnt[js.of[p]] > st.num), `P${p + 1} counted`);
      }
      for (const r of rooms) if (r.open) assert.equal(v.u8[L.PG_S + MC.MI_CNT + r.k], deep && js.cnt[r.k] > st.num ? st.num : js.cnt[r.k]);
      stats.mirror++;
      if (!stats.places0) stats.places0 = st.num * st.nopen;
    }
    const g = v.party();
    for (; seen < v.fxCount(); seen++) { const x = v.fx(seen); if (x.kind === MC.MI_FX_SLAM) stats.slams.push([x.shot, x.size]); }
    if (stats.start < 0 && g.state === L.H_PLAY) stats.start = t;
    if (stats.over < 0 && stats.start >= 0 && g.state === L.H_OVER) {
      stats.over = t;
      stats.winner = g.winner;
      stats.places = bots.map((b) => v.partier(b.r.slot).place);
      stats.pts = bots.map((b) => v.partier(b.r.slot).pts);
    }
  }
  return { log: encodeLog({ courseSeed: seed, ticks, recs }), sim, stats };
}

for (const [balls, ticks] of [[8, 14000], [64, 16000]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, rooms filled at the first slam, the crowd thinning to a winner; equal on 1 and 4 threads`, async () => {
    const seed = (0xa7000000 | (L.MG_MINGLE << 16) | balls) >>> 0;
    const { log, sim, stats } = await aiRound({ bytes: partyBytes(true), seed, balls, ticks });
    assert.equal(sim.error().code, 0);
    assert.ok(stats.over > 0, 'the round ended');
    const secs = (stats.over - stats.start) * TICK;
    assert.ok(secs > 25 && secs < MC.MI_LEN * TICK, `${secs.toFixed(1)} s of play`);
    assert.ok(stats.slams.length >= 3, `${stats.slams.length} slams`);
    assert.equal(stats.mirror, stats.slams.length, 'every slam counted as the JS has it');
    assert.ok(stats.slams[0][0] >= 0.4 * stats.places0, `the first slam: ${stats.slams[0][0]} safe of ${stats.places0} places`);
    assert.ok(stats.places.every((x) => x >= 1 && x <= balls), `places ${stats.places}`);
    assert.ok(stats.pts.every((x) => x >= 1 && x <= 10), `points ${stats.pts}`);
    assert.ok(stats.winner !== 255 && stats.places.filter((x) => x === 1).length === 1, 'one winner');
    const parsed = parseLog(log);
    const n = stats.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('the AI ball sees only what a player sees: the call and the rooms to open changed under it through the music change none of its words; at the doors it picks a room that\'s short', async () => {
  const g = await room(16, { seed: 31 });
  const bots = Array.from({ length: 16 }, (_, p) => new Partier(p, 5, 0.3 + 0.04 * p));
  const stub = (bot) => ({ slot: bot.slot, skill: bot.skill, pos: [...bot.pos], vel: [...bot.vel], mem: structuredClone(bot.mem), rng: bot.rng, rand: Partier.prototype.rand });
  const hide = [MC.MI_NUM, MC.MI_NOPEN, MC.MI_OPENM, MC.MI_OPENM + 4];
  let checked = 0;
  for (let t = 0; t < 1500; t++) {
    const tick = g.v.tick + 6;
    const recs = bots.map((b) => [L.EV_INPUT, b.slot, b.think(g.v, tick, 12)]);
    const st = stage(g.v);
    if (t % 20 === 0 && when(st, tick - st.t0).ph === PHASE.MUSIC) {
      for (const b of bots) {
        const me = g.v.partier(b.slot);
        const a = mingle.brain.think(g.v, me, stub(b), tick);
        const keep = hide.map((k) => g.dv.getUint32(L.PG_H + k, true));
        hide.forEach((k, i) => g.dv.setUint32(L.PG_H + k, (keep[i] ^ 0x5a5a5a5) >>> 0, true));
        const c = mingle.brain.think(g.v, me, stub(b), tick);
        hide.forEach((k, i) => g.dv.setUint32(L.PG_H + k, keep[i], true));
        assert.deepEqual(c, a, `P${b.slot + 1} at ${t}`);
        checked++;
      }
    }
    g.step(recs);
  }
  assert.ok(checked > 200, `${checked} thinks`);
  // the doors open: two rooms of 2, one with a ball in it already and one full; a ball as far from both picks the short one
  const h = await roomCalling(5, 2);
  const st = stage(h.v);
  stepTo(h, when(st, 0).stop + 150);
  const [A, B] = openRooms(h);
  putIn(h, 1, A, 5.3, 0);
  putIn(h, 2, B, 5.3, -1.45);
  putIn(h, 3, B, 1.3, 1.45);
  const mid = (A.yaw + B.yaw) / 2 + (Math.abs(B.yaw - A.yaw) > Math.PI ? Math.PI : 0);
  put(h, 0, C + st.rc * Math.cos(mid), C + st.rc * Math.sin(mid));
  put(h, 4, C - st.rc * Math.cos(mid), C - st.rc * Math.sin(mid));
  h.step();
  for (const [skill, s] of [[0.9, 1], [0.6, 2], [0.3, 3]]) {
    const bot = new Partier(0, s, skill);
    bot.think(h.v, h.v.tick, 0);
    assert.equal(bot.mem.mi.target, A.k, `skill ${skill}: makes for the room a ball short`);
  }
});

test('the client module: draws every phase, frames the hall, writes its HUD lines, hushes the music, its FX and the feed\'s line', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const g = await roomCalling(7, 3);
  const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null };
  const lines = [];
  const hctx = { put: (x, y, s, c) => lines.push([y, s, c]), centre: (y, s, c) => lines.push([y, s, c]), right: (y, s, c) => lines.push([y, s, c]), rows: 44, C: {}, slot: 0, now: 0 };
  let st = stage(g.v);
  const w = when(st, 0);
  const [A] = openRooms(g);
  const shots = [[w.stop - 200, PHASE.MUSIC, 'MUSIC'], [w.stop + 60, PHASE.OPEN, '3!'], [w.slam + 20, PHASE.SHUT, 'SAFE'], [w.back + 50, PHASE.OUT, 'BACK TO THE CAROUSEL']];
  for (const [t, ph, text0] of shots) {
    stepTo(g, Math.min(t, w.slam));
    if (playT(g) === w.slam) SPOTS.slice(0, 3).forEach(([u, ww], q) => putIn(g, q, A, u, ww));
    stepTo(g, t);
    out.scene.clear(); out.decals.length = 0; out.solid.length = 0; lines.length = 0;
    const tick = g.v.tick;
    mingle.draw(g.v, { tick, dt: 0, t: playT(g) * TICK, ptick: tick, now: t * 8, ms: 16, slot: 0, me: g.v.partier(0), pme: null }, out);
    st = stage(g.v);
    assert.equal(when(stage(g.v), playT(g)).ph, ph);
    assert.ok(out.scene.count > 6 * st.K + 20, `${out.scene.count} solids`);
    for (let k = 0; k < out.scene.count * 16; k++) assert.ok(Number.isFinite(out.scene.data[k]), 'finite');
    for (const d of out.decals) assert.ok(d.pos.every(Number.isFinite) && Number.isFinite(d.radius));
    mingle.hud(g.v, { ...hctx, now: t * 8, me: g.v.partier(0) });
    const text = lines.map((l) => l[1]).join(' | ');
    assert.ok(text.includes(text0), text);
    if (ph === PHASE.OPEN) assert.ok(text.includes('NOT IN A ROOM'), text);
    for (const l of lines) assert.ok(l[1].length <= 60, l[1]);
    assert.equal(mingle.music(g.v, tick), ph === PHASE.MUSIC);
    const fr = mingle.frame(g.v);
    assert.equal(fr.shape, 'disc');
    assert.ok(Math.abs(fr.radius - (st.a + MC.MI_DI + 1)) < 1e-3);
  }
  assert.ok(mingle.hint.length <= 70 && mingle.rules.length <= 70);
  const said = [], heard = [];
  const fctx = { slot: 0, glow: () => {}, sound: new Proxy({}, { get: (_, k) => () => heard.push(k) }), banner: (s) => said.push(s), feed: (s) => said.push(s), name: (p) => (p === 0 ? 'YOU' : `P${p + 1}`), dist: 5, view: g.v };
  mingle.fx({ kind: MC.MI_FX_CALL, owner: 255, shot: 4, pos: [C, PLAT_Y, C], size: 1000 }, fctx);
  mingle.fx({ kind: MC.MI_FX_CALL, owner: 255, shot: 1, pos: [C, PLAT_Y, C], size: 1000 }, fctx);
  mingle.fx({ kind: MC.MI_FX_SLAM, owner: 255, shot: 0, pos: [C, PLAT_Y, C], size: 0 }, fctx);
  mingle.fx({ kind: MC.MI_FX_SLAM, owner: 255, shot: 3, pos: [C, PLAT_Y, C], size: 4 }, fctx);
  mingle.fx({ kind: MC.MI_FX_BONK, owner: 0, shot: 1, pos: [C, PLAT_Y, C], size: 6 }, fctx);
  assert.deepEqual(said, ['4!  ROOMS OF 4', 'ONE!  ALONE IN A ROOM', 'NOBODY MADE IT  AGAIN', '4 OUT AT THE SLAM', 'SAFE!']);
  assert.ok(heard.includes('count') && heard.includes('land') && heard.includes('boing') && heard.includes('pickup'));
  assert.equal(mingle.sink({ owner: 5 }, fctx.name, g.v), 'P6 WAS LEFT OUT');
  assert.equal(mingle.brain.danger(g.v, C + st.ro + 1, C, g.v.tick), 1, 'off the floor');
  assert.equal(mingle.brain.danger(g.v, C, C, g.v.tick), 0);
});

test('a tick of 256 balls, AI balls through the music and a scramble, on the release build', async (t) => {
  const g = await room(256, { debug: false, seed: 5 });
  const bots = Array.from({ length: 256 }, (_, p) => new Partier(p, 5, 0.3 + 0.6 * ((p * 5) % 256) / 256));
  let ms = 0, n = 0;
  for (let k = 0; k < 2600 && g.v.hole().state === L.H_PLAY; k++) {
    g.sim.feedPlayers(bots.map((b) => [L.EV_INPUT, b.slot, b.think(g.v, g.v.tick, 0)]));
    const a = performance.now();
    g.sim.x.step();
    if (k >= 300) { ms += performance.now() - a; n++; }
  }
  t.diagnostic(`${(ms / n).toFixed(3)} ms a tick over ${n} ticks, 256 balls`);
  assert.ok(n >= 2000, `${n} ticks timed`);
  assert.ok(ms / n < 2, `${(ms / n).toFixed(3)} ms`);
});
