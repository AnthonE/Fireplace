// SWISS ROLL (src/mg/cheese.wat): bumper balls' wheel of Swiss cheese for the
// crowd, its holes and its rim, the squeeze, the shafts a ball goes down, the
// power-ups, the prediction through all of it, and rounds of AI balls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/cheese.mjs'; // CH_*: the minigame's own constants
import cheese, { stage, wheel, floorAt, edge } from '../client/mg/cheese.mjs';

const C = L.B_CX;
const TICK = 0.008;
const B_RAD = Number(L.BPHYS.B_RAD);
const turn = (a) => Math.round((a / (2 * Math.PI)) * 16384) & 0x3fff; // a word's yaw, 1/16384 turns

// A room of n balls in SWISS ROLL, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_CHEESE + 1, true);
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
  g.dv.setUint32(L.HDR_UNTIL, now - t + MC.CH_LEN, true);
}
// Ball p at (x, z), on the cheese (or at y), rolling at (vx, vz).
function put(g, p, x, z, { y = PLAT_Y, vx = 0, vz = 0, ground = true } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE | (ground ? L.PF_GROUND : 0));
  g.dv.setUint32(rec(p) + L.PG_M, 0, true);
}
// The rest of the room parked on cheese at least 12 m from each of the points given, out of the way.
function park(g, n, from, ...away) {
  const w = wheel(stage(g.v), g.v.party().t);
  let k = 0;
  for (let p = from; p < n; p++) {
    for (; k < 4096; k++) {
      const a = k * 2.39996, r = Math.sqrt((k + 0.5) / 4096) * (w.rim - 2);
      const px = C + r * Math.cos(a), pz = C + r * Math.sin(a);
      if (edge(w, px, pz) > 3 && away.every(([x, z]) => Math.hypot(px - x, pz - z) > 12)) { put(g, p, px, pz); k += 37; break; }
    }
  }
}
const fxs = (v, kind) => { const out = []; for (let k = 0; k < v.fxCount(); k++) { const f = v.fx(k); if (f.kind === kind) out.push(f); } return out; };
const orb = (g, k) => { const o = L.PG_S + MC.CH_ORBS + 16 * k; return { kind: g.v.u8[o + 12], state: g.v.u8[o + 13], life: g.dv.getUint16(o + 14, true), pos: [0, 4, 8].map((i) => g.dv.getFloat32(o + i, true)) }; };
const orbs = (g) => [...Array(MC.CH_NORB).keys()].map((k) => orb(g, k)).filter((o) => o.kind);

test('the wheel for 1, 8, 64 and 256: sized for the crowd, its holes in range and clear of the middle, every ball on cheese clear of them', async () => {
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const st = stage(g.v);
    const r0 = Math.min(MC.CH_R0 + MC.CH_RK * Math.sqrt(n), MC.CH_RMAX);
    assert.equal(r.game, L.MG_CHEESE);
    assert.ok(Math.abs(r.size - r0) < 1e-4 && Math.abs(st.r0 - r0) < 1e-4, `${r.size} m for ${n}`);
    assert.deepEqual([r.kind, r.len], [L.PK_OUT, MC.CH_LEN]);
    const want = Math.min(MC.CH_NHMAX, MC.CH_NH0 + Math.floor(r0 * r0 * MC.CH_NHK));
    assert.ok(st.holes.length >= Math.min(want, 4) && st.holes.length <= want, `${st.holes.length} holes of ${want} for ${n}`);
    const hmax = Math.min(MC.CH_H0 + MC.CH_HK * r0, MC.CH_HMAX);
    for (const h of st.holes) {
      assert.ok(h.r0 >= MC.CH_HMIN - 1e-4 && h.r0 <= hmax + 1e-4, `a hole of ${h.r0} m`);
      assert.ok(Math.hypot(h.x - C, h.z - C) - h.r0 >= MC.CH_MID - 1e-3, 'clear of the middle');
      assert.ok(Math.hypot(h.x - C, h.z - C) <= r0, 'on the wheel');
    }
    const w = wheel(st, 0);
    const seen = new Set();
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y, `${n}: P${p + 1} on the cheese`);
      assert.equal(floorAt(w, b.pos[0], b.pos[2]), -1, `${n}: P${p + 1} not over a hole`);
      assert.ok(edge(w, b.pos[0], b.pos[2]) > 0.5, `${n}: P${p + 1} clear of every drop`);
      seen.add(`${b.pos[0]},${b.pos[2]}`);
    }
    assert.equal(seen.size, n, `${n}: every ball on a spot of its own`);
  }
});

test('the rim crumbles in to CH_RMIN and the holes widen by half over CH_SHRINK; the client\'s wheel is the sim\'s ground, point for point', async () => {
  const g = await room(64, { seed: 3 });
  const st = stage(g.v);
  for (const t of [0, 1000, 3750, MC.CH_SHRINK, MC.CH_SHRINK + 2000]) {
    at(g, t);
    const w = wheel(st, t);
    if (t >= MC.CH_SHRINK) assert.ok(Math.abs(w.rim - MC.CH_RMIN) < 1e-4 && Math.abs(w.grow - 1.5) < 1e-6, 'all the way in');
    // still balls on a sample of points: those the client says are over a drop lose the ground this step, the rest keep it
    const pts = [];
    for (let k = 0; k < 64; k++) {
      const a = k * 2.39996, r = Math.sqrt((k + 0.5) / 64) * (st.r0 + 1);
      pts.push([C + r * Math.cos(a), C + r * Math.sin(a)]);
    }
    pts.forEach(([x, z], p) => put(g, p, x, z));
    g.step();
    pts.forEach(([x, z], p) => {
      if (Math.abs(edge(w, x, z)) < 0.01) return; // f32 against doubles, right on an edge
      const over = floorAt(w, x, z) !== -1;
      assert.equal(!g.v.partier(p).ground, over, `t ${t}: (${(x - C).toFixed(2)}, ${(z - C).toFixed(2)}) ${over ? 'over a drop' : 'on cheese'}`);
    });
  }
});

test('through a hole: a ball rolled into one drops, is held in its shaft till it is under the cheese, and is out; the one left wins', async () => {
  const g = await room(2, { seed: 11 });
  const st = stage(g.v);
  const h = st.holes.reduce((a, b) => (b.r0 > a.r0 ? b : a));
  park(g, 2, 1, [h.x, h.z]);
  // from 1.5 m off its edge toward its centre, fast: momentum carries it at the far wall
  const dx = C - h.x, dz = C - h.z, d = Math.hypot(dx, dz);
  put(g, 0, h.x + (dx / d) * (h.r0 + 1.5), h.z + (dz / d) * (h.r0 + 1.5), { vx: (-dx / d) * 9, vz: (-dz / d) * 9 });
  let held = 0, fell = false;
  for (let k = 0; k < 2000 && !g.v.partier(0).out; k++) {
    g.step([[L.EV_INPUT, 0, partyWord({ yaw: turn(Math.atan2(-dz, -dx)), move: 1 })]]);
    const b = g.v.partier(0);
    if (b.pos[1] < PLAT_Y - 0.5) fell = true;
    if (b.pos[1] < PLAT_Y && b.pos[1] > PLAT_Y - MC.CH_THICK - B_RAD) {
      const r = h.r0 * wheel(st, g.v.party().t).grow;
      assert.ok(Math.hypot(b.pos[0] - h.x, b.pos[2] - h.z) <= r - B_RAD + 1e-3, `in the shaft at ${(PLAT_Y - b.pos[1]).toFixed(2)} m down`);
      held++;
    }
  }
  assert.ok(fell && held > 20, `went down the shaft (${held} ticks in it)`);
  assert.ok(g.v.partier(0).out, 'P1 is out');
  for (let k = 0; k < 50 && g.v.partier(1).place === 0; k++) g.step();
  assert.equal(g.v.partier(1).place, 1, 'P2 wins the round');
});

test('off the rim: held off it from outside as it goes down, and out', async () => {
  const g = await room(2, { seed: 5 });
  const w = wheel(stage(g.v), 0);
  // the rim's point with the most cheese inside it
  let best = -1, ax = 0;
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * 2 * Math.PI;
    const e = edge(w, C + Math.cos(a) * (w.rim - 1.5), C + Math.sin(a) * (w.rim - 1.5));
    if (e > best) { best = e; ax = a; }
  }
  park(g, 2, 1, [C + Math.cos(ax) * w.rim, C + Math.sin(ax) * w.rim]);
  put(g, 0, C + Math.cos(ax) * (w.rim - 1), C + Math.sin(ax) * (w.rim - 1), { vx: Math.cos(ax) * 3, vz: Math.sin(ax) * 3 });
  for (let k = 0; k < 2000 && !g.v.partier(0).out; k++) {
    g.step();
    const b = g.v.partier(0);
    const rim = wheel(stage(g.v), g.v.party().t).rim;
    if (b.pos[1] < PLAT_Y && b.pos[1] > PLAT_Y - MC.CH_THICK - B_RAD) assert.ok(Math.hypot(b.pos[0] - C, b.pos[2] - C) >= rim + B_RAD - 1e-3, 'outside the rim');
  }
  assert.ok(g.v.partier(0).out);
});

test('the power-ups: the first drop CH_DROP0 into play, one more for every CH_DROPN balls in, each landing on cheese; the first ball into one takes it; one left lying goes', async () => {
  const g = await room(60, { seed: 9 });
  at(g, MC.CH_DROP0 - 1);
  g.step();
  assert.equal(orbs(g).length, 0, 'none before');
  g.step();
  const slots = [...Array(MC.CH_NORB).keys()].filter((k) => orb(g, k).kind);
  const first = slots.map((k) => orb(g, k));
  assert.equal(first.length, 1 + Math.floor(60 / MC.CH_DROPN), `${first.length} dropped`);
  assert.ok(first.every((o) => o.state === 1 && o.pos[1] > PLAT_Y + 30), 'falling from high');
  assert.ok(fxs(g.v, L.FX_DROP).length >= first.length, 'an FX_DROP each');
  // park the room out of the way of the first, and let them land
  const o0 = first[0];
  park(g, 60, 0, [o0.pos[0], o0.pos[2]]);
  for (let k = 0; k < 600; k++) g.step();
  const landed = slots.map((k) => orb(g, k)).filter((o) => o.kind);
  assert.ok(landed.length >= 1 && landed.every((o) => o.state === 2 && Math.abs(o.pos[1] - (PLAT_Y + 0.6)) < 1e-4), 'lying on the cheese');
  const w = wheel(stage(g.v), g.v.party().t);
  assert.ok(landed.every((o) => floorAt(w, o.pos[0], o.pos[2]) === -1), 'on cheese, not over a hole');
  // P1 rolled into the first one takes it
  const tgt = landed[0];
  put(g, 0, tgt.pos[0] - 2, tgt.pos[2], { vx: 4 });
  let took = 0;
  for (let k = 0; k < 200 && !took; k++) { g.step(); took = g.v.partier(0).item; }
  assert.equal(took, tgt.kind, 'P1 holds it');
  assert.ok(fxs(g.v, L.FX_PICKUP).some((f) => f.owner === 0), 'an FX_PICKUP for P1');
  // one left lying is gone CH_ORBLIFE after it landed
  const lying = [...Array(MC.CH_NORB).keys()].filter((k) => orb(g, k).state === 2);
  if (lying.length) {
    const k = lying.reduce((a, b) => (orb(g, b).life < orb(g, a).life ? b : a));
    const left = orb(g, k).life;
    for (let i = 0; i < left; i++) g.step();
    assert.ok(orb(g, k).kind === 0 || orb(g, k).state === 1, 'gone when its time is up (or its slot a fresh drop)');
  }
});

test('a late joiner watches till the next round, and a round of two ends at 90 s with both on the cheese, a win for each', async () => {
  const g = await room(2, { seed: 4 });
  g.step([[L.EV_JOIN, 2]]);
  assert.ok(g.v.partier(2).out, 'P3 watches');
  // the middle is cheese for good (the holes keep CH_MID clear): two still balls there see out the clock
  put(g, 0, C - 1.5, C);
  put(g, 1, C + 1.5, C);
  at(g, MC.CH_LEN - 3);
  for (let k = 0; k < 10; k++) g.step();
  assert.equal(g.v.hole().state, L.H_OVER);
  assert.deepEqual([g.v.partier(0).place, g.v.partier(1).place], [1, 1]);
});

test('the prediction matches the confirmed ball bit for bit: rolling, hopping, into a hole and down its shaft, and the cheese crumbling under it', async () => {
  const g = await room(2, { seed: 13 });
  const st = stage(g.v);
  const h = st.holes[0];
  const dx = h.x - C, dz = h.z - C, d = Math.hypot(dx, dz);
  park(g, 2, 1, [C, C], [(C + h.x) / 2, (C + h.z) / 2], [h.x, h.z]);
  // across the cheese, a hop, and into the hole's far wall
  put(g, 0, C + (dx / d) * 2, C + (dz / d) * 2);
  const yaw = turn(Math.atan2(dz, dx));
  // (to 14 m down, where the confirmed world puts it out: that is the confirmed world's alone)
  const words = Array.from({ length: 420 }, (_, k) => partyWord({ yaw, move: 1, hop: k === 60 ? 1 : 0 }));
  assert.ok(predicted(g, words) >= 400);
  const b = g.v.partier(0);
  assert.ok(b.pos[1] < PLAT_Y - MC.CH_THICK - 1 && !b.out, `down the shaft and under the cheese, ${(PLAT_Y - b.pos[1]).toFixed(1)} m`);
  // the rim crumbling in under a still ball near it
  const g2 = await room(2, { seed: 17 });
  const w = wheel(stage(g2.v), 2000);
  let ax = 0, best = -1;
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * 2 * Math.PI;
    const e = edge(w, C + Math.cos(a) * (w.rim - 0.4), C + Math.sin(a) * (w.rim - 0.4));
    if (e > best) { best = e; ax = a; }
  }
  park(g2, 2, 1, [C + Math.cos(ax) * w.rim, C + Math.sin(ax) * w.rim], [C + Math.cos(ax) * (w.rim - 8), C + Math.sin(ax) * (w.rim - 8)]);
  at(g2, 2000);
  put(g2, 0, C + Math.cos(ax) * (w.rim - 0.4), C + Math.sin(ax) * (w.rim - 0.4));
  assert.ok(predicted(g2, Array.from({ length: 400 }, () => partyWord({ yaw: 0 }))) >= 350);
  assert.ok(!g2.v.partier(0).ground, 'the rim went from under it');
});

for (const [balls, sd] of [[8, 3], [64, 5]]) {
  test(`a round of ${balls} AI balls (the Partier, this brain) on the debug build: no trap, balls knocked through, a winner; equal on 1 and 4 threads`, async () => {
    let start = -1, over = -1, places = null, pts = null, outs = 0, trap = 0;
    const ticks = L.P_COUNT + MC.CH_LEN + 80 + balls;
    const { log, sim } = await playParty({ bytes: partyBytes(true), seed: sd, mg: L.MG_CHEESE, bots: balls, ticks, delay: 6, onTick: (t, s, v) => {
      if (s.error().code) trap = s.error().code;
      const g = v.party();
      if (start < 0 && g.state === L.H_PLAY) start = t;
      if (over < 0 && start >= 0 && g.state === L.H_OVER) {
        over = t;
        places = [...Array(balls).keys()].map((p) => v.partier(p).place);
        pts = [...Array(balls).keys()].map((p) => v.partier(p).pts);
        outs = [...Array(balls).keys()].filter((p) => v.partier(p).out).length;
      }
    } });
    assert.equal(trap, 0, 'no trap');
    assert.ok(over > 0, 'the round ended');
    assert.ok(over - start <= MC.CH_LEN, 'by the clock at the latest');
    assert.ok(outs >= Math.floor(balls / 2), `${outs} of ${balls} went through`);
    assert.ok(places.every((x) => x >= 1 && x <= balls), `places ${places}`);
    assert.ok(pts.every((x) => x >= 1 && x <= 10), `points ${pts}`);
    assert.ok(places.includes(1) && pts.includes(10), 'somebody won');
    const v = new View(sim.memory.buffer);
    assert.equal(v.party().game, L.MG_CHEESE);
    const parsed = parseLog(log);
    const n = over + 40;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('the client module: the wheel and a shaft a hole right after it, the power-ups, the frame, the HUD, and a brain that keeps off the drops', async () => {
  const { Scene, LOOK } = await import('../client/party-render.mjs');
  for (const n of [3, 140]) {
    const g = await room(n, { seed: 41 + n });
    const st = stage(g.v);
    const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null };
    const lines = [];
    const hctx = { put: (x, y, s, c) => lines.push([y, s, c]), centre: (y, s, c) => lines.push([y, s, c]), right: (y, s, c) => lines.push([y, s, c]), rows: 44, C: {}, slot: 0, now: 0 };
    for (const t of [10, MC.CH_DROP0 + 50, 3000, MC.CH_SHRINK + 10, MC.CH_LEN - 5]) {
      at(g, t);
      g.step();
      out.scene.clear(); out.decals.length = 0; out.beams.length = 0; out.glow.length = 0; out.solid.length = 0; lines.length = 0;
      cheese.draw(g.v, { tick: g.v.tick, t: t * TICK, pt: t * TICK, dt: 0, now: 1234, slot: 0, me: g.v.partier(0), pme: g.v.partier(0), ptick: g.v.tick, pview: g.v }, out);
      const D = out.scene.data;
      assert.equal(out.scene.count, 1 + st.holes.length, 'the wheel and its shafts');
      for (let k = 0; k < out.scene.count * 16; k++) assert.ok(Number.isFinite(D[k]), 'finite');
      const w = wheel(st, t);
      assert.ok(Math.abs(D[4] - w.rim) < 1e-3 && D[11] === LOOK.CHEESE && D[12] === st.holes.length, 'the wheel: its rim now, its holes after it');
      st.holes.forEach((h, k) => {
        const o = 16 * (k + 1);
        assert.ok(Math.abs(D[o] - h.x) < 1e-3 && Math.abs(D[o + 2] - h.z) < 1e-3, 'a shaft where its hole is');
        assert.ok(Math.abs(D[o + 4] + h.r0 * w.grow) < 1e-3 && D[o + 12] === -(k + 1), 'mirrored, its place after the wheel');
      });
      if (t > MC.CH_DROP0 && t < MC.CH_SHRINK) assert.ok(out.solid.some((s) => s.kind !== undefined), 'power-ups or crumbs');
      cheese.hud(g.v, { ...hctx, me: g.v.partier(0), t: t * TICK });
      const text = lines.map((l) => l[1]).join(' | ');
      assert.ok(/CRUMBLES|HOLDS/.test(text), text);
      for (const l of lines) assert.ok(l[1].length <= 80, l[1]);
      const fr = cheese.frame(g.v);
      assert.equal(fr.shape, 'disc');
      assert.ok(Math.abs(fr.radius - st.r0) < 1e-4);
    }
    // the brain: every hole and past the rim deadly, the middle fine, near an edge a warning
    const w = wheel(st, g.v.party().t);
    for (const h of st.holes) assert.equal(cheese.brain.danger(g.v, h.x, h.z), 1);
    assert.equal(cheese.brain.danger(g.v, C + w.rim + 1, C), 1);
    assert.equal(cheese.brain.danger(g.v, C, C), 0);
    const by = st.holes.flatMap((h) => [0, 1, 2, 3, 4, 5].map((a) => [h.x + Math.cos(a) * (h.r0 * w.grow + 0.5), h.z + Math.sin(a) * (h.r0 * w.grow + 0.5)]))
      .find(([x, z]) => Math.abs(edge(w, x, z) - 0.5) < 1e-3);
    assert.ok(by, 'a point 0.5 m off a hole and nothing nearer');
    const near = cheese.brain.danger(g.v, by[0], by[1]);
    assert.ok(near > 0.2 && near < 1, `${near} by a hole`);
    const me = g.v.partier(0);
    const goal = cheese.brain.goal(g.v, me, { slot: 0, skill: 0.9, pos: [me.pos[0], me.pos[2]], vel: [0, 0], mem: {}, rand: () => 0.1 });
    assert.ok(goal.every(Number.isFinite) && edge(w, goal[0], goal[1]) > -2, `goal ${goal}`);
  }
  assert.ok(cheese.hint.length <= 70);
});
