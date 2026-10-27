// SUMO RING (rust/mg/sumo/src/lib.rs, built into src/mg/sumo.wat): the ring
// and its posts for the crowd, the ring's shrink and the posts' swing on the
// schedule client/mg/sumo.mjs works again, a post's knock, a ball off the
// edge out and the last one on the winner, the prediction bit for bit, and
// rounds of AI balls equal on 1 and 4 threads. The minigame is Rust; every
// test here runs the wasm the build makes of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/sumo.mjs'; // SU_*: the minigame's own constants
import sumo, { ringAt, bearingAt, postAt, stage } from '../client/mg/sumo.mjs';

const f = Math.fround;
const TICK = 0.008;

// A room of n balls in SUMO RING, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_SUMO + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// Ball p at (x, z) on the ring, rolling at (vx, vz).
function put(g, p, x, z, { vx = 0, vz = 0 } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, PLAT_Y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE | L.PF_GROUND);
}
// The next step plays tick t of play, as the hooks' p_t has it (the clock
// moved; the round's end with it). After it, party().t is t + 1.
function at(g, t) {
  const now = g.v.tick;
  g.dv.setUint32(L.HDR_START, now - t, true);
  g.dv.setUint32(L.HDR_UNTIL, now - t + MC.SU_LEN, true);
}
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };

test('the ring and its posts for 1, 8, 64 and 256: sized for the crowd, its knobs, every ball on it inside the orbit, clear of the posts and apart', async () => {
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const st = stage(g.v);
    const r0 = Math.min(f(f(f(Math.sqrt(n)) * MC.SU_RK) + MC.SU_R0), MC.SU_RMAX);
    assert.equal(r.game, L.MG_SUMO);
    assert.equal(r.size, r0, `${r.size} m for ${n}`);
    assert.equal(st.r0, r0);
    assert.equal(st.r1, Math.max(f(r0 * f(MC.SU_RLOWK)), MC.SU_RMIN));
    assert.deepEqual([r.kind, r.len, r.floor, r.flags & L.PGF_BUMPS], [L.PK_OUT, MC.SU_LEN, PLAT_Y, L.PGF_BUMPS]);
    assert.equal(st.np, Math.min(MC.SU_P0 + Math.floor(n / MC.SU_PPER), MC.SU_PMAX));
    const spin = Math.trunc(f(f(f(MC.SU_PV * f(Number(L.PHYS.DT))) * 16777216) / f(f(f(6.2831855) * f(MC.SU_ORBIT)) * r0)));
    assert.equal(Math.abs(st.spin), spin, 'the posts\' turn rate: SU_PV m/s round the orbit');
    assert.ok(st.a0 < 2 ** 24);
    const pos = [];
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.ok(b.ground && !b.out && b.pos[1] === PLAT_Y, `${n}: P${p + 1} on the ring`);
      assert.ok(Math.hypot(b.pos[0] - st.cx, b.pos[2] - st.cx) < MC.SU_ORBIT * r0 - MC.SU_POSTR - 1, `${n}: P${p + 1} inside the orbit`);
      for (let k = 0; k < st.np; k++) {
        const [x, z] = postAt(st, k, 0);
        assert.ok(Math.hypot(b.pos[0] - x, b.pos[2] - z) > MC.SU_POSTR + 1.5, `${n}: P${p + 1} clear of post ${k}`);
      }
      for (const [x, z] of pos) assert.ok(Math.hypot(b.pos[0] - x, b.pos[2] - z) >= 2, `${n}: P${p + 1} apart`);
      pos.push([b.pos[0], b.pos[2]]);
    }
  }
});

test('the schedule: the ring still for SU_HOLD, then in a straight line to its least; the posts swing SU_SWING ticks and back, evenly spaced; its moments as FX on time', async () => {
  const st = { r0: f(20), r1: f(7), np: 4, a0: 0x123456, spin: 4000, cx: 0 };
  assert.equal(ringAt(st.r0, st.r1, 0), st.r0);
  assert.equal(ringAt(st.r0, st.r1, MC.SU_HOLD), st.r0);
  assert.ok(ringAt(st.r0, st.r1, MC.SU_HOLD + 1) < st.r0);
  assert.equal(ringAt(st.r0, st.r1, MC.SU_HOLD + MC.SU_SHRINK), st.r1);
  assert.equal(ringAt(st.r0, st.r1, 20000), st.r1);
  for (let t = MC.SU_HOLD + 1; t < MC.SU_HOLD + MC.SU_SHRINK - 97; t += 97) assert.ok(ringAt(st.r0, st.r1, t) > ringAt(st.r0, st.r1, t + 97), 'shrinking');
  assert.ok(MC.SU_HOLD + MC.SU_SHRINK < MC.SU_LEN - 2000, 'its least well before the clock');
  // the swing: out SU_SWING ticks, back again, the same bearings
  for (const t of [0, 1, 700, MC.SU_SWING - 1]) assert.equal(bearingAt(st, 0, MC.SU_SWING * 2 - t), bearingAt(st, 0, t));
  assert.equal(bearingAt(st, 0, MC.SU_SWING) - bearingAt(st, 0, MC.SU_SWING - 1), st.spin);
  assert.equal(bearingAt(st, 0, MC.SU_SWING + 1) - bearingAt(st, 0, MC.SU_SWING), -st.spin, 'and back');
  assert.equal(bearingAt(st, 1, 0) - bearingAt(st, 0, 0), 2 ** 22, 'a quarter turn apart for four');
  assert.equal(MC.SU_FX_BONK, L.FX_MG + 4 * L.MG_SUMO);
  assert.deepEqual([MC.SU_FX_RING, MC.SU_FX_TURN], [MC.SU_FX_BONK + 1, MC.SU_FX_BONK + 2]);

  const g = await room(2, { seed: 5 });
  const s = stage(g.v);
  const seen = (t) => { at(g, t); const k = g.v.fxCount(); g.step(); assert.equal(g.v.party().t, t + 1); return [MC.SU_FX_RING, MC.SU_FX_TURN].flatMap((kind) => fxs(g.v, kind, k)); };
  let [x, ...rest] = seen(MC.SU_HOLD);
  assert.deepEqual([x.kind, x.owner, x.shot, x.size, x.pos[1], rest.length], [MC.SU_FX_RING, 255, 0, s.r1, PLAT_Y, 0]);
  [x] = seen(MC.SU_HOLD + MC.SU_SHRINK);
  assert.deepEqual([x.kind, x.shot], [MC.SU_FX_RING, 1]);
  [x] = seen(MC.SU_SWING * 3);
  assert.deepEqual([x.kind, x.shot], [MC.SU_FX_TURN, 3]);
  assert.equal(seen(1001).length, 0, 'and nothing between');
});

test('the ring\'s edge is where the schedule has it on every tick: a ball just inside stays up, one just outside falls and is out', async () => {
  for (const t of [100, MC.SU_HOLD + 1, MC.SU_HOLD + 3000, MC.SU_HOLD + MC.SU_SHRINK + 10]) {
    const g = await room(3, { seed: 9 });
    const st = stage(g.v);
    const r = ringAt(st.r0, st.r1, t);
    // a bearing the posts are well away from
    let a = 0;
    for (let i = 0; i < 64; i++) {
      a = (i / 64) * 2 * Math.PI;
      let clear = true;
      for (let k = 0; k < st.np; k++) for (const dt of [0, 60]) {
        const [px, pz] = postAt(st, k, t + dt);
        if (Math.hypot(st.cx + Math.cos(a) * r - px, st.cx + Math.sin(a) * r - pz) < MC.SU_POSTR + 4) clear = false;
      }
      if (clear) break;
    }
    at(g, t);
    put(g, 0, st.cx + Math.cos(a) * (r - 0.05), st.cx + Math.sin(a) * (r - 0.05));
    put(g, 1, st.cx + Math.cos(a + 0.15) * (r + 0.05), st.cx + Math.sin(a + 0.15) * (r + 0.05));
    put(g, 2, st.cx, st.cx);
    g.step();
    assert.ok(g.v.partier(0).ground, `${t}: just inside, held up`);
    assert.ok(!g.v.partier(1).ground, `${t}: just outside, in the air`);
    for (let k = 0; k < 400 && !g.v.partier(1).out; k++) g.step();
    assert.ok(g.v.partier(1).out, `${t}: off the edge is out`);
  }
});

test('a post meeting a ball knocks it away at SU_KICK m/s relative to the post, up off the floor, on the post\'s edge; an FX, and PG_M counts it', async () => {
  const g = await room(2, { seed: 3 });
  const st = stage(g.v);
  const t0 = 600;
  // a ball still in post 0's path, 1.5 m ahead of it along its orbit
  const [x0, z0] = postAt(st, 0, t0);
  const [x1, z1] = postAt(st, 0, t0 + 1);
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  at(g, t0);
  put(g, 0, x0 + ux * (MC.SU_POSTR + 1.5), z0 + uz * (MC.SU_POSTR + 1.5));
  put(g, 1, st.cx, st.cx);
  const from = g.v.fxCount();
  let hit = null;
  for (let k = 0; k < 125 && !hit; k++) { g.step(); [hit] = fxs(g.v, MC.SU_FX_BONK, from); }
  assert.ok(hit, 'knocked');
  const t = g.v.party().t - 1; // the tick the step played
  assert.deepEqual([hit.owner, hit.shot], [0, 0]);
  const b = g.v.partier(0);
  assert.equal(b.m, 1, 'PG_M counts the knock');
  assert.ok(!b.ground && b.vel[1] === MC.SU_POP, 'up off the floor');
  const [px, pz] = postAt(st, 0, t);
  const [qx, qz] = postAt(st, 0, t - 1);
  const h = Math.hypot(b.pos[0] - px, b.pos[2] - pz);
  const nx = (b.pos[0] - px) / h, nz = (b.pos[2] - pz) / h;
  assert.ok(Math.abs(h - (1 + MC.SU_POSTR)) < 0.01, `${h} m from the post: on its edge`);
  const pvx = (px - qx) / TICK, pvz = (pz - qz) / TICK;
  const rel = (b.vel[0] - pvx) * nx + (b.vel[2] - pvz) * nz;
  assert.ok(Math.abs(rel - MC.SU_KICK) < 0.05, `${rel.toFixed(3)} m/s away from the post`);
  assert.deepEqual([hit.pos[0], hit.pos[2]], [b.pos[0], b.pos[2]]);
  assert.ok(Math.abs(hit.size - (MC.SU_KICK + pvx * nx + pvz * nz)) < 0.05, `${hit.size}: the kick and the post's speed into the ball`);
  // a ball over the post's top clears it
  const g2 = await room(2, { seed: 3 });
  at(g2, t0);
  put(g2, 0, x0 + ux * (MC.SU_POSTR + 1.5), z0 + uz * (MC.SU_POSTR + 1.5));
  g2.dv.setFloat32(rec(0) + L.P_PY, PLAT_Y + MC.SU_POSTH + 0.01, true);
  g2.dv.setFloat32(rec(0) + L.P_VY, 25, true);
  g2.dv.setUint8(rec(0) + L.P_FL, L.PF_LIVE);
  const k2 = g2.v.fxCount();
  for (let k = 0; k < 40; k++) g2.step();
  assert.equal(fxs(g2.v, MC.SU_FX_BONK, k2).length, 0, 'over the top, untouched');
});

test('the end: the last ball on wins; two off on one tick share it', async () => {
  const g = await room(3, { seed: 11 });
  const st = stage(g.v);
  put(g, 1, st.cx + st.r0 + 3, st.cx);
  for (let k = 0; k < 2000 && !g.v.partier(1).out; k++) g.step();
  assert.ok(g.v.partier(1).out && !g.v.partier(0).out && !g.v.partier(2).out);
  put(g, 0, st.cx - st.r0 - 3, st.cx);
  put(g, 2, st.cx, st.cx - st.r0 - 3);
  for (let k = 0; k < 2000 && g.v.hole().state === L.H_PLAY; k++) g.step();
  const r = g.v.party();
  assert.equal(r.state, L.H_OVER);
  assert.equal(r.winner, 255, 'shared');
  assert.deepEqual([0, 1, 2].map((p) => g.v.partier(p).place), [1, 3, 1]);
  const h = await room(2, { seed: 12 });
  const sh = stage(h.v);
  put(h, 0, sh.cx + sh.r0 + 3, sh.cx);
  for (let k = 0; k < 2000 && h.v.hole().state === L.H_PLAY; k++) h.step();
  assert.equal(h.v.party().winner, 1, 'the last one on wins alone');
  assert.deepEqual([0, 1].map((p) => h.v.partier(p).place), [2, 1]);
});

test('the prediction matches the confirmed ball bit for bit: knocked by a post, on the edge as the ring shrinks, roaming through the posts', async () => {
  // one ball alone, so nothing bumps it (bumps are the confirmed world's)
  const g = await room(1, { seed: 12 });
  const st = stage(g.v);
  const still = (n) => Array(n).fill(partyWord({}));
  // A: in a post's path
  let t0 = 900;
  const [x0, z0] = postAt(st, 1, t0);
  const [x1, z1] = postAt(st, 1, t0 + 1);
  const len = Math.hypot(x1 - x0, z1 - z0);
  at(g, t0);
  put(g, 0, x0 + (x1 - x0) / len * 3, z0 + (z1 - z0) / len * 3);
  assert.ok(predicted(g, still(120)) >= 120);
  assert.ok(g.v.partier(0).m >= 1 && !g.v.partier(0).out, 'knocked, predicted all the way');
  // B: on the edge as it shrinks, then falling
  t0 = MC.SU_HOLD + 1000;
  at(g, t0);
  const r = ringAt(st.r0, st.r1, t0);
  let a = 0;
  for (let i = 0; i < 64; i++) {
    a = (i / 64) * 2 * Math.PI;
    const p = [st.cx + Math.cos(a) * r, st.cx + Math.sin(a) * r];
    if ([...Array(st.np).keys()].every((k) => [0, 250].every((dt) => Math.hypot(p[0] - postAt(st, k, t0 + dt)[0], p[1] - postAt(st, k, t0 + dt)[1]) > MC.SU_POSTR + 4))) break;
  }
  put(g, 0, st.cx + Math.cos(a) * (r - 0.1), st.cx + Math.sin(a) * (r - 0.1));
  g.dv.setUint32(rec(0) + L.PG_M, 0, true);
  assert.ok(predicted(g, still(250)) >= 250);
  assert.ok(g.v.partier(0).falling, 'the ring went from under it');
  // C: rolling and turning across the orbit, the posts swinging back mid-way
  t0 = MC.SU_SWING - 150;
  at(g, t0);
  put(g, 0, st.cx, st.cx);
  g.dv.setUint32(rec(0) + L.PG_M, 0, true);
  const words = Array.from({ length: 420 }, (_, i) => partyWord({ yaw: (i * 173) & 16383, move: (i >> 4) % 3 === 0 ? 0 : 1, hop: i % 37 === 0 ? 1 : 0 }));
  let k = 0;
  for (; k < words.length && !g.v.partier(0).falling; k += 30) assert.ok(predicted(g, words.slice(k, k + 30)) >= 1);
  assert.ok(k > 200, `${k} ticks before it fell`);
});

// A round of Partier balls steered by this minigame's brain (tools/genparty.mjs), recorded as a log.
async function aiRound(balls, ticks, seed) {
  let start = -1, over = -1, seen = 0, bonks = 0, at15 = -1;
  let places = null, pts = null;
  const { log, sim } = await playParty({ bytes: partyBytes(true), seed, mg: L.MG_SUMO, bots: balls, ticks, onTick: (t, s, v) => {
    const g = v.party();
    for (; seen < v.fxCount(); seen++) bonks += v.fx(seen).kind === MC.SU_FX_BONK;
    if (start < 0 && g.state === L.H_PLAY) start = t;
    if (start >= 0 && at15 < 0 && t - start >= 15 / TICK) at15 = g.left;
    if (start >= 0 && over < 0 && g.state === L.H_OVER) {
      over = t;
      places = [...Array(balls).keys()].map((p) => v.partier(p).place);
      pts = [...Array(balls).keys()].map((p) => v.partier(p).pts);
    }
  } });
  return { log, sim, start, over, bonks, at15, places, pts };
}

for (const [balls, ticks, seed] of [[8, 14000, 21], [64, 14000, 22]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, most of them on a while, the posts knocking, a winner or the clock; equal on 1 and 4 threads`, async () => {
    const r = await aiRound(balls, ticks, seed);
    assert.equal(r.sim.error().code, 0);
    assert.ok(r.over > 0, 'the round ended');
    const secs = (r.over - r.start) * TICK;
    assert.ok(secs > 20 && secs <= MC.SU_LEN * TICK + 0.01, `${secs.toFixed(1)} s of play`);
    assert.ok(r.at15 >= balls / 2, `${r.at15} of ${balls} still on 15 s in`);
    assert.ok(r.bonks >= balls / 2, `${r.bonks} knocks`);
    assert.ok(r.places.every((x) => x >= 1 && x <= balls), `places ${r.places}`);
    assert.ok(r.pts.every((x) => x >= 1 && x <= 10), `points ${r.pts}`);
    assert.ok(r.places.includes(1) && r.pts.includes(10), 'somebody won');
    assert.ok(r.places.some((x) => x > 1), 'somebody lost');
    const parsed = parseLog(r.log);
    const n = r.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('the client module: draws the ring and every post through the round, frames it, writes its HUD line; its brain sees the edge and the posts', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const g = await room(16, { seed: 41 });
  const st = stage(g.v);
  const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null };
  const lines = [];
  const hctx = { put: (x, y, s, c) => lines.push([y, s, c]), centre: (y, s, c) => lines.push([y, s, c]), right: (y, s, c) => lines.push([y, s, c]), rows: 44, C: {}, slot: 0, now: 0 };
  for (const t of [10, MC.SU_HOLD - 100, MC.SU_HOLD + 2000, MC.SU_HOLD + MC.SU_SHRINK + 100]) {
    at(g, t);
    g.step();
    out.scene.clear(); out.decals.length = 0; lines.length = 0;
    const me = g.v.partier(0);
    sumo.draw(g.v, { tick: g.v.tick, ptick: g.v.tick, dt: 0, now: 1000, slot: 0, me, pme: me }, out);
    assert.equal(out.scene.count, 1 + 2 * st.np, `${out.scene.count} solids at ${t}`);
    for (let k = 0; k < out.scene.count * 16; k++) assert.ok(Number.isFinite(out.scene.data[k]), 'finite');
    const fr = sumo.frame(g.v);
    assert.equal(fr.radius, ringAt(st.r0, st.r1, t + 1));
    sumo.hud(g.v, { ...hctx, me, t: t * TICK });
    assert.ok(lines.length === 1 && lines[0][1].startsWith(`RING ${Math.round(fr.radius)} M`), lines.map((l) => l[1]).join('|'));
    const tick = g.v.tick;
    assert.equal(sumo.brain.danger(g.v, st.cx, st.cx, tick), 0, 'the middle is safe');
    assert.equal(sumo.brain.danger(g.v, st.cx + fr.radius + 1, st.cx, tick), 1, `off the edge at ${t}`);
    const [px, pz] = postAt(st, 0, g.v.party().t);
    assert.ok(sumo.brain.danger(g.v, px, pz, tick) >= 0.7, 'a post');
  }
  assert.deepEqual(sumo.brain.goal(g.v), [st.cx, st.cx]);
});
