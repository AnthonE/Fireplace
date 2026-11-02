// WHACK A MOLE (src/mg/mole.wat): the lawn and its holes laid out for the
// crowd; the round's pops drawn at setup, each hole's in order and never
// overlapping, more of them up as the round goes, gold and (from 30 s)
// spiked ones; a mole out is a post and its head floor a ball comes down
// on; a whack pays the first ball by slot, once a pop, gold 3, double in the
// frenzy; spikes fling and fine; the fence; placed by points at 80 s; the
// prediction through every mole; rounds of AI balls that whack most moles,
// equal on 1 and 4 threads; the client module, and its brain staged and over
// a network's lag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/mole.mjs'; // WM_*: the minigame's own constants
import moleMg, { stage, popAt, liftAt, whacked, nearest } from '../client/mg/mole.mjs';

const C = L.B_CX;
const f = Math.fround;
const HEAD = f(PLAT_Y + f(MC.WM_TOP)); // a head's top, the sim's f32
const POST = MC.WM_MR + Math.sqrt(MC.WM_TOP * (2 - MC.WM_TOP)); // how near a rolling ball's centre comes to an up mole's axis

// A room of n balls in WHACK A MOLE, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_MOLE + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// Ball p at (x, z) on the lawn (or y), rolling at (vx, vz).
function put(g, p, x, z, { y = PLAT_Y, vx = 0, vy = 0, vz = 0, ground = y === PLAT_Y } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, vy, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE | (ground ? L.PF_GROUND : 0));
}
const score = (g, p) => g.dv.getUint16(rec(p) + L.PG_SCORE, true);
const setScore = (g, p, s) => g.dv.setUint16(rec(p) + L.PG_SCORE, s, true);
const tp = (g) => g.v.party().t;
// The next step plays tick t into play (the clock moved; the round's end with it).
function at(g, t) {
  const now = g.v.tick;
  g.dv.setUint32(L.HDR_START, now - t, true);
  g.dv.setUint32(L.HDR_UNTIL, now - t + MC.WM_LEN, true);
}
// The schedule replaced: only these pops, { i (hole), t0 (ticks into play it rises), up, kind }, in order per hole.
function pin(g, pops) {
  const st = stage(g.v);
  for (let i = 0; i < st.nh; i++) g.dv.setUint8(L.PG_S + MC.WM_COUNT + i, 0);
  for (const p of pops) {
    const k = g.v.u8[L.PG_S + MC.WM_COUNT + p.i];
    const a = L.PG_BIG + MC.WM_POPS + (p.i * MC.WM_PMAX + k) * MC.WM_PSIZE;
    g.dv.setUint16(a + MC.WM_P_T0, p.t0, true);
    g.dv.setUint8(a + MC.WM_P_UP, p.up ?? 150);
    g.dv.setUint8(a + MC.WM_P_KIND, p.kind ?? MC.WM_KMOLE);
    g.dv.setUint32(a + MC.WM_P_BY, 0, true);
    g.dv.setUint8(L.PG_S + MC.WM_COUNT + p.i, k + 1);
  }
}
const hole = (g, i) => stage(g.v).holes[i];
// Ball p still by the fence on the +x side, off every hole.
const park = (g, p) => { const st = stage(g.v); put(g, p, C + st.half - 2, C + 2.4 + 2.1 * p); };
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
const word = (ang, o = {}) => partyWord({ yaw: Math.round(ang / (2 * Math.PI) * 16384) & 16383, move: 1, ...o });
const H32 = (g, k) => g.dv.getUint32(L.PG_H + k, true);
// Ball p dropped onto hole i's head from 1.2 m, off its axis by (ox, oz); stepped till it is on something (or till done()).
function drop(g, p, i, { ox = 0.2, oz = 0, steps = 60, done = () => g.v.partier(p).ground } = {}) {
  const H = hole(g, i);
  put(g, p, H.x + ox, H.z + oz, { y: PLAT_Y + 1.2 });
  for (let k = 0; k < steps && !done(); k++) g.step();
}
// The pop record on hole i now, as the sim keeps it.
const popNow = (g, i) => popAt(hole(g, i), tp(g));

test('the lawn for 1, 8, 64 and 256: holes for the crowd, the fence round them, every ball on the lawn clear of the holes', async () => {
  let last = 0;
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const G = Math.min(MC.WM_GMAX, Math.max(MC.WM_GMIN, Math.round(Math.sqrt(n / MC.WM_PER))));
    const half = (G - 1) * MC.WM_PITCH / 2 + MC.WM_EDGE;
    assert.equal(r.game, L.MG_MOLE);
    assert.deepEqual([H32(g, MC.WM_G), H32(g, MC.WM_NH)], [G, G * G], `${G} a side for ${n}`);
    assert.ok(Math.abs(r.size - half) < 1e-4 && r.size >= last, `${r.size} m for ${n}`);
    last = r.size;
    assert.deepEqual([r.kind, r.len, r.floor, r.idle, r.hop, r.respawn, r.flags], [L.PK_SCORE, MC.WM_LEN, PLAT_Y, f(MC.WM_IDLE), 6, 250, L.PGF_BUMPS]);
    const st = stage(g.v);
    assert.equal(st.holes.length, G * G);
    // the holes: a square grid round the centre, WM_EDGE in from the fence
    st.holes.forEach((h, i) => {
      assert.ok(Math.abs(h.x - (C + ((i % G) - (G - 1) / 2) * MC.WM_PITCH)) < 1e-3 && Math.abs(h.z - (C + (Math.floor(i / G) - (G - 1) / 2) * MC.WM_PITCH)) < 1e-3, `hole ${i}`);
    });
    assert.ok(H32(g, MC.WM_NPOP) > G * G * 8, `${H32(g, MC.WM_NPOP)} pops`);
    // the balls: on the lawn, inside the fence, WM_CLEAR from any hole, apart
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.ok(b.pos[1] === PLAT_Y && b.ground && !b.out, `${n}: P${p + 1} on the lawn`);
      assert.ok(Math.abs(b.pos[0] - C) < half - 1 && Math.abs(b.pos[2] - C) < half - 1, `${n}: P${p + 1} inside the fence`);
      const h = nearest(st, b.pos[0], b.pos[2]);
      assert.ok(Math.hypot(b.pos[0] - h.x, b.pos[2] - h.z) >= MC.WM_CLEAR - 1e-3, `${n}: P${p + 1} off hole ${h.i}`);
    }
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const a = g.v.partier(p).pos, b = g.v.partier(q).pos;
      assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) > 2, `${n}: P${p + 1} and P${q + 1} apart`);
    }
  }
});

test('the schedule: each hole\'s pops in order and never overlapping, all up before the end; gold one in 8, spiked only from 30 s; up 1.2 s shrinking to 0.7; more up at once as the round goes', async () => {
  const g = await room(64, { play: false, seed: 5 });
  const st = stage(g.v);
  let total = 0;
  const kinds = [0, 0, 0], late = [0, 0, 0], upEarly = [], upLate = [];
  for (const h of st.holes) {
    let free = 0;
    for (const p of h.pops) {
      total++;
      assert.ok(p.t0 - MC.WM_TELE >= MC.WM_FIRST && p.t0 - MC.WM_TELE >= free, `hole ${h.i}: heaves at ${p.t0 - MC.WM_TELE}, still from ${free}`);
      assert.ok(p.t0 + MC.WM_RISE < MC.WM_LEN, 'up before the end');
      const want = MC.WM_UP0 - Math.floor((MC.WM_UP0 - MC.WM_UP1) * p.t0 / MC.WM_LEN);
      assert.ok(Math.abs(p.up - want) <= MC.WM_UPJ, `up ${p.up} at ${p.t0}`);
      if (p.t0 < 2000) upEarly.push(p.up);
      if (p.t0 > 8000) upLate.push(p.up);
      free = p.t0 + MC.WM_RISE + p.up + MC.WM_DUCK + MC.WM_REST;
      kinds[p.kind]++;
      if (p.t0 >= MC.WM_SPIKE) late[p.kind]++;
      if (p.kind === MC.WM_KSPIKE) assert.ok(p.t0 >= MC.WM_SPIKE, 'spiked only from 30 s');
    }
  }
  assert.equal(total, H32(g, MC.WM_NPOP));
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  assert.ok(mean(upEarly) > 140 && mean(upLate) < 100, `up ${mean(upEarly)} early, ${mean(upLate)} late`);
  const gold = kinds[MC.WM_KGOLD] / total, spiked = late[MC.WM_KSPIKE] / (late[0] + late[2]);
  assert.ok(gold > 0.09 && gold < 0.16, `gold ${gold.toFixed(3)}`);
  assert.ok(spiked > 0.12 && spiked < 0.22, `spiked ${spiked.toFixed(3)} of the rest from 30 s`);
  // moles out at once (the client's height, as $wm_lift), over stretches of the round
  const out = (t0, t1) => { let s = 0, k = 0; for (let t = t0; t < t1; t += 25, k++) for (const h of st.holes) { const p = popAt(h, t); if (p && liftAt(p, t) > 0) s++; } return s / k / st.nh; };
  const a = out(250, 2500), b = out(5000, 8000), c = out(8200, 9900);
  assert.ok(a > 0.1 && a < b && b < c && c < 0.45, `out at once: ${a.toFixed(2)}, ${b.toFixed(2)}, ${c.toFixed(2)} of the holes`);
  // a mole's height: out of its hole over WM_RISE, up at WM_TOP, back in over WM_DUCK
  const p = { t0: 1000, up: 120 };
  assert.deepEqual([0, 1000, 1010, 1019, 1100, 1138, 1139, 1148, 1158, 1200].map((t) => liftAt(p, t)),
    [0, 0, f(10 * f(MC.WM_TOP / MC.WM_RISE)), f(MC.WM_TOP), f(MC.WM_TOP), f(MC.WM_TOP), f(19 * f(MC.WM_TOP / MC.WM_DUCK)), f(10 * f(MC.WM_TOP / MC.WM_DUCK)), 0, 0]);
});

test('a mole out: its head is floor a ball comes down on, its post stops a rolling ball that can\'t climb it; rising under a ball it shoves it off, never lifts it; ducking it drops it', async () => {
  const g = await room(2);
  park(g, 1);
  const H = hole(g, 4);
  pin(g, [{ i: 4, t0: tp(g) + 10, up: 150 }]);
  for (let k = 0; k < 30; k++) g.step();
  // dropped onto its head: standing on it at WM_TOP (a whack, below)
  drop(g, 0, 4);
  assert.ok(g.v.partier(0).ground && g.v.partier(0).pos[1] === HEAD, `on its head at ${g.v.partier(0).pos[1]}`);
  for (let k = 0; k < 20; k++) g.step([[L.EV_INPUT, 0, partyWord({})]]);
  assert.equal(g.v.partier(0).pos[1], HEAD, 'still on it');
  // rolled at it, keys held: its centre held POST off the axis, bouncing back, never off the lawn
  let near = 1e9, back = false;
  put(g, 0, H.x - 5, H.z + 0.4, { vx: 6 });
  for (let k = 0; k < 90; k++) {
    g.step([[L.EV_INPUT, 0, word(0)]]);
    const b = g.v.partier(0);
    near = Math.min(near, Math.hypot(b.pos[0] - H.x, b.pos[2] - H.z));
    assert.equal(b.pos[1], PLAT_Y, 'not climbing it');
    if (b.vel[0] < -0.5) back = true;
  }
  assert.ok(near > POST - 0.02 && near < POST + 0.1, `held ${near.toFixed(3)} m off (${POST.toFixed(3)})`);
  assert.ok(back, 'bounced back');
  // a ball resting 0.2 m off a hole as its mole rises: shoved off, still on the lawn
  pin(g, [{ i: 4, t0: tp(g) + 5, up: 150 }]);
  put(g, 0, H.x + 0.2, H.z);
  for (let k = 0; k < 40; k++) {
    g.step([[L.EV_INPUT, 0, partyWord({})]]);
    assert.equal(g.v.partier(0).pos[1], PLAT_Y, 'never lifted');
  }
  assert.ok(Math.hypot(g.v.partier(0).pos[0] - H.x, g.v.partier(0).pos[2] - H.z) > POST - 0.02, 'shoved off');
  // standing on a head as it ducks: down onto the lawn
  drop(g, 0, 4);
  assert.equal(g.v.partier(0).pos[1], HEAD);
  while (liftAt(popNow(g, 4), tp(g)) > 0) g.step([[L.EV_INPUT, 0, partyWord({})]]);
  for (let k = 0; k < 40; k++) g.step([[L.EV_INPUT, 0, partyWord({})]]);
  assert.ok(g.v.partier(0).ground && g.v.partier(0).pos[1] === PLAT_Y, 'down on the lawn');
});

test('a whack: coming down on a head pays the first ball by slot a point, once a pop, the dazed mole still holding balls up; gold pays 3, the frenzy double; rolling into one pays nothing', async () => {
  const g = await room(3);
  park(g, 1); park(g, 2);
  const H = hole(g, 4);
  pin(g, [{ i: 4, t0: tp(g) + 5, up: 200 }]);
  for (let k = 0; k < 30; k++) g.step();
  // rolled into first: nothing
  put(g, 0, H.x - 4, H.z, { vx: 6 });
  for (let k = 0; k < 60; k++) g.step([[L.EV_INPUT, 0, word(0)]]);
  assert.equal(score(g, 0), 0, 'a post pays nothing');
  const k0 = g.v.fxCount();
  drop(g, 0, 4);
  const t = tp(g) - 1;
  assert.equal(score(g, 0), 1);
  const [w, ...more] = fxs(g.v, MC.WM_FX_WHACK, k0);
  assert.ok(w && more.length === 0, 'one whack');
  assert.deepEqual([w.owner, w.shot, w.size], [0, 4, 1]);
  assert.ok(Math.abs(w.pos[0] - H.x) < 1e-4 && w.pos[1] === HEAD && Math.abs(w.pos[2] - H.z) < 1e-4);
  assert.deepEqual(whacked(g.v, popNow(g, 4)), { by: 0, at: t }, 'marked in its pop');
  assert.equal(H32(g, MC.WM_WHACKS), 1);
  assert.equal(g.v.partier(0).m >>> 10, (g.v.tick - 1) & 0x3fffff, 'PG_M: the tick it stood there');
  // standing on it: nothing more; another ball on the dazed head: held up, nothing
  for (let k = 0; k < 30; k++) g.step();
  park(g, 0);
  drop(g, 1, 4);
  assert.equal(g.v.partier(1).pos[1], HEAD, 'a dazed head still holds a ball');
  assert.deepEqual([score(g, 0), score(g, 1)], [1, 0]);
  // two balls landing on one tick (bumps off, so they pass through): the lower slot's
  park(g, 1);
  pin(g, [{ i: 4, t0: tp(g) + 5, up: 200 }]);
  for (let k = 0; k < 30; k++) g.step();
  g.dv.setUint32(L.PG_FLAGS, 0, true);
  put(g, 2, H.x - 0.2, H.z, { y: PLAT_Y + 1.2 });
  put(g, 1, H.x + 0.2, H.z, { y: PLAT_Y + 1.2 });
  const k1 = g.v.fxCount();
  while (!g.v.partier(1).ground) g.step();
  assert.ok(g.v.partier(2).ground && g.v.partier(2).pos[1] === HEAD);
  assert.deepEqual([score(g, 1), score(g, 2)], [1, 0]);
  assert.deepEqual(fxs(g.v, MC.WM_FX_WHACK, k1).map((x) => x.owner), [1]);
  g.dv.setUint32(L.PG_FLAGS, L.PGF_BUMPS, true);
  park(g, 1); park(g, 2);
  // gold: 3
  pin(g, [{ i: 4, t0: tp(g) + 5, up: 200, kind: MC.WM_KGOLD }]);
  for (let k = 0; k < 30; k++) g.step();
  drop(g, 0, 4, { ox: -0.4, oz: 0.3 });
  assert.equal(score(g, 0), 1 + MC.WM_GOLDV);
  // the frenzy: double, a gold one 6
  park(g, 0);
  at(g, MC.WM_FRENZY + 40);
  pin(g, [{ i: 4, t0: MC.WM_FRENZY + 45, up: 200 }, { i: 4, t0: MC.WM_FRENZY + 500, up: 200, kind: MC.WM_KGOLD }]);
  for (let k = 0; k < 30; k++) g.step();
  drop(g, 0, 4);
  assert.equal(score(g, 0), 6, 'a mole worth 2');
  park(g, 0);
  while (tp(g) < MC.WM_FRENZY + 520) g.step();
  drop(g, 0, 4);
  assert.equal(score(g, 0), 12, 'a gold one 6');
});

test('spiked moles: touching one flings a ball off at 12 m/s and up, for nothing; coming down on one flings it and costs 2, never below 0', async () => {
  const g = await room(2);
  park(g, 1);
  const H = hole(g, 4);
  pin(g, [{ i: 4, t0: tp(g) + 5, up: 250, kind: MC.WM_KSPIKE }]);
  for (let k = 0; k < 30; k++) g.step();
  setScore(g, 0, 5);
  // rolled into its side
  put(g, 0, H.x - 4, H.z + 0.3, { vx: 5 });
  let k0 = g.v.fxCount(), top = { sp: 0, vy: 0 }, n = 0;
  while (!fxs(g.v, MC.WM_FX_SPIKE, k0).length && n++ < 100) g.step([[L.EV_INPUT, 0, word(0)]]);
  const b = g.v.partier(0);
  top = { sp: Math.hypot(b.vel[0], b.vel[2]), vy: b.vel[1] };
  const [s] = fxs(g.v, MC.WM_FX_SPIKE, k0);
  assert.deepEqual([s.owner, s.shot, s.size], [0, 4, MC.WM_FLING]);
  assert.ok(top.sp >= MC.WM_FLING - 0.01 && b.vel[0] < -10 && top.vy >= MC.WM_FLINGUP - 0.2, `flung at ${top.sp.toFixed(2)} m/s, up ${top.vy.toFixed(2)}`);
  assert.equal((g.v.partier(0).m >>> 8) & 3, MC.WM_SIDE);
  assert.ok(Math.hypot(b.pos[0] - H.x, b.pos[2] - H.z) > MC.WM_MR + 0.5);
  for (let k = 0; k < 60; k++) g.step([[L.EV_INPUT, 0, partyWord({})]]);
  assert.equal(score(g, 0), 5, 'no points lost from its side');
  // come down on its head: flung and fined
  k0 = g.v.fxCount();
  drop(g, 0, 4, { ox: 0.3, oz: 0.1, steps: 80, done: () => fxs(g.v, MC.WM_FX_SPIKE, k0).length > 0 });
  assert.equal(score(g, 0), 5 - MC.WM_SPIKEV);
  const [w] = fxs(g.v, MC.WM_FX_WHACK, k0);
  assert.deepEqual([w.owner, w.shot, w.size], [0, 4, -MC.WM_SPIKEV]);
  assert.deepEqual(fxs(g.v, MC.WM_FX_SPIKE, k0).map((x) => x.shot), [4 | 0x100]);
  const c = g.v.partier(0);
  assert.ok(!c.ground && Math.hypot(c.vel[0], c.vel[2]) > 11 && c.vel[0] > 0, 'flung off its head, out from its axis');
  for (let k = 0; k < 150; k++) g.step([[L.EV_INPUT, 0, partyWord({})]]);
  assert.ok(Math.hypot(g.v.partier(0).pos[0] - H.x, g.v.partier(0).pos[2] - H.z) > 3, 'well off it');
  // with 1 point: 0
  setScore(g, 0, 1);
  pin(g, [{ i: 4, t0: tp(g) - 30, up: 250, kind: MC.WM_KSPIKE }]);
  const k1 = g.v.fxCount();
  drop(g, 0, 4, { ox: -0.1, oz: 0.2, steps: 80, done: () => fxs(g.v, MC.WM_FX_SPIKE, k1).length > 0 });
  assert.equal(score(g, 0), 0);
});

test('the clock: a pop\'s sound as each mole starts to rise, its kind; the call as spiked moles start and as the frenzy does', async () => {
  const g = await room(2);
  const t = tp(g);
  pin(g, [{ i: 0, t0: t + 10 }, { i: 4, t0: t + 12, kind: MC.WM_KGOLD }, { i: 8, t0: t + 12, kind: MC.WM_KSPIKE }]);
  const k0 = g.v.fxCount();
  for (let k = 0; k < 20; k++) g.step();
  const pops = fxs(g.v, MC.WM_FX_POP, k0);
  assert.deepEqual(pops.map((x) => [x.owner, x.shot, x.size, (x.tick - g.v.party().start) | 0]), [[255, 0, 0, t + 10], [255, 4, 1, t + 12], [255, 8, 2, t + 12]]);
  assert.ok(pops.every((x) => Math.abs(x.pos[0] - hole(g, x.shot).x) < 1e-4 && x.pos[1] === PLAT_Y));
  for (const [when, shot] of [[MC.WM_SPIKE - MC.WM_TELE, 0], [MC.WM_FRENZY, 1]]) {
    at(g, when - 2);
    const k1 = g.v.fxCount();
    for (let k = 0; k < 5; k++) g.step();
    assert.deepEqual(fxs(g.v, MC.WM_FX_CALL, k1).map((x) => [x.owner, x.shot, (x.tick - g.v.party().start) | 0]), [[255, shot, when]]);
  }
});

test('the fence holds a ball in and bounces it back; one flying over it drops into the sea, down 2 s, back with its points', async () => {
  const g = await room(2);
  park(g, 1);
  pin(g, []);
  const st = stage(g.v);
  put(g, 0, C + st.half - 4, C + 2, { vx: 8 });
  let far = 0, back = 0;
  for (let k = 0; k < 60; k++) {
    g.step([[L.EV_INPUT, 0, word(0)]]);
    const b = g.v.partier(0);
    far = Math.max(far, b.pos[0] - C);
    if (!back && b.vel[0] < 0) back = b.vel[0];
  }
  assert.ok(far <= st.half - 1 + 1e-4, `held ${(st.half - far).toFixed(3)} m in`);
  assert.ok(back < -2, `bounced back at ${back.toFixed(2)} m/s`);
  // over the fence's top: gone
  setScore(g, 0, 7);
  put(g, 0, C - st.half + 1.5, C, { y: PLAT_Y + 1.5, vx: -6, vy: 3 });
  let n = 0;
  while (!g.v.partier(0).out && n++ < 400) g.step();
  assert.ok(g.v.partier(0).out, 'down in the sea');
  const t0 = g.v.tick;
  while (g.v.partier(0).out) g.step();
  assert.equal(g.v.tick - t0, 250, 'down 2 s');
  for (let k = 0; k < 150; k++) g.step();
  const b = g.v.partier(0);
  assert.ok(b.ground && b.pos[1] === PLAT_Y && Math.abs(b.pos[0] - C) < st.half && score(g, 0) === 7, 'back on the lawn with its points');
});

test('placed by points at 80 s, ties sharing; a ball joining in play falls straight in and can whack; a ball alone plays to the end', async () => {
  const g = await room(4);
  at(g, MC.WM_LEN - 2);
  for (const [p, s] of [[0, 5], [1, 9], [2, 5], [3, 0]]) setScore(g, p, s);
  while (g.v.party().state === L.H_PLAY) g.step();
  assert.equal(g.v.party().winner, 1);
  assert.deepEqual([0, 1, 2, 3].map((p) => g.v.partier(p).place), [2, 1, 2, 4]);
  assert.deepEqual([0, 1, 2, 3].map((p) => g.v.partier(p).pts), [7, 10, 7, 1]);
  // late: in at 4 s, falling onto the lawn, then a whack
  const h = await room(2);
  at(h, 500);
  h.step([[L.EV_JOIN, 2]]);
  const b = h.v.partier(2);
  assert.ok(b.live && !b.out && b.pos[1] > PLAT_Y + 3 && b.score === 0, 'falling in');
  for (let k = 0; k < 150; k++) h.step();
  assert.ok(h.v.partier(2).ground && h.v.partier(2).pos[1] === PLAT_Y, 'on the lawn');
  pin(h, [{ i: 4, t0: tp(h) + 5, up: 200 }]);
  for (let k = 0; k < 30; k++) h.step();
  drop(h, 2, 4);
  assert.equal(score(h, 2), 1);
  // alone: no early end, 1st of 1 at the time
  const a = await room(1);
  for (let k = 0; k < 1500; k++) a.step();
  assert.equal(a.v.party().state, L.H_PLAY);
  at(a, MC.WM_LEN - 2);
  while (a.v.party().state === L.H_PLAY) a.step();
  assert.deepEqual([a.v.partier(0).place, a.v.partier(0).wins], [1, 1]);
});

// The prediction against the confirmed world, as helpers.mjs's predicted(),
// for slot 0 of room g through `inputs`: its whole record bit for bit but
// PG_SCORE, which only the confirmed world's tick writes (a whack arrives a
// round trip late, as a bump does) and the prediction carries as it found it.
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

test('the prediction matches the confirmed ball bit for bit (but its score): onto a head and off it, into a post, a mole rising under it and ducking from under it, a hop over one, spikes from the side and the top, the fence', async () => {
  const g = await room(2, { seed: 11 });
  park(g, 1);
  const st = stage(g.v);
  const H = hole(g, 4), Hs = hole(g, 3), He = hole(g, 5);
  const t = tp(g);
  // hole 4: up from t + 25 for 1.6 s, again from t + 500; hole 3 spiked; hole 5 rising later
  pin(g, [{ i: 3, t0: t + 20, up: 250, kind: MC.WM_KSPIKE }, { i: 3, t0: t + 700, up: 200, kind: MC.WM_KSPIKE },
    { i: 4, t0: t + 25, up: 200 }, { i: 4, t0: t + 400, up: 120 }, { i: 5, t0: t + 300, up: 250 }]);
  const none = partyWord({});
  const k0 = g.v.fxCount();
  // A: over hole 4 as it rises (shoved off), then onto its head from a hop, off it with keys, into its post
  put(g, 0, H.x + 0.3, H.z - 0.2);
  assert.ok(predicted(g, Array(40).fill(none)) >= 40);
  const dx = g.v.partier(0).pos[0] - H.x;
  assert.ok(Math.abs(dx) > 1, 'shoved off as it rose');
  put(g, 0, H.x - 3.2, H.z, { vx: 5.4 });
  assert.ok(predicted(g, [word(0, { hop: 1 }), ...Array(70).fill(word(0))]) >= 71);
  assert.ok(score(g, 0) >= 1, 'whacked it');
  assert.ok(predicted(g, [...Array(40).fill(word(Math.PI / 2)), ...Array(30).fill(word(-Math.PI / 2))]) >= 70);
  // B: a hop clean over hole 5's mole (up), landing past it
  while (tp(g) < t + 330) g.step();
  put(g, 0, He.x - 3.4, He.z + 0.9, { vx: 9 });
  assert.ok(predicted(g, [word(0, { hop: 1 }), ...Array(80).fill(word(0))]) >= 81);
  // C: standing on hole 4's next head as it ducks
  while (tp(g) < t + 430) g.step();
  put(g, 0, H.x + 0.1, H.z + 0.2, { y: PLAT_Y + 1.1 });
  assert.ok(predicted(g, Array(170).fill(none)) >= 170);
  assert.equal(g.v.partier(0).pos[1], PLAT_Y, 'down off it');
  // D: rolled into spiked hole 3's side, flung into the fence's way; then onto its head
  while (tp(g) < t + 720) g.step();
  put(g, 0, Hs.x + 4, Hs.z + 0.5, { vx: -6 });
  assert.ok(predicted(g, Array(120).fill(word(Math.PI))) >= 120);
  put(g, 0, Hs.x - 0.2, Hs.z + 0.2, { y: PLAT_Y + 1.3 });
  assert.ok(predicted(g, Array(120).fill(none)) >= 120);
  const spikes = fxs(g.v, MC.WM_FX_SPIKE, k0).filter((x) => x.owner === 0).map((x) => x.shot);
  assert.ok(spikes.includes(3) && spikes.includes(3 | 0x100), `flung from its side and its head: ${spikes}`);
  // E: into the fence at speed, along it
  put(g, 0, C + st.half - 5, C - 3, { vx: 9, vz: 2 });
  assert.ok(predicted(g, Array(80).fill(word(0.2))) >= 80);
});

// Rounds of AI balls (client/party-bot.mjs, this brain), as tools/genparty.mjs plays them.
for (const [balls, ticks] of [[8, 10850], [64, 10900]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, most moles whacked and nearly every ball whacking them, gold ones too, no spikes, nobody stuck, placed by points at 80 s; equal on 1 and 4 threads`, async () => {
    const stats = { start: -1, over: -1, whacks: 0, by: new Map(), gold: 0, fines: 0, flings: 0, falls: 0, pops: 0, places: null, final: null, pts: null };
    // stuck: keys held on the lawn and still under 0.5 m/s (against a post, the fence, a crowd), the longest run of it
    const pushing = new Array(balls).fill(0), stuck = new Array(balls).fill(0);
    let seen = 0;
    const { log, sim, view } = await playParty({ bytes: partyBytes(true), mg: L.MG_MOLE, seed: balls, bots: balls, ticks, delay: 8, onTick: (t, s, v) => {
      assert.equal(s.error().code, 0, 'no trap');
      for (; seen < v.fxCount(); seen++) {
        const x = v.fx(seen);
        if (x.kind === MC.WM_FX_WHACK && x.size > 0) { stats.whacks++; stats.by.set(x.owner, (stats.by.get(x.owner) || 0) + 1); if (x.size >= MC.WM_GOLDV) stats.gold++; }
        if (x.kind === MC.WM_FX_WHACK && x.size < 0) stats.fines++;
        if (x.kind === MC.WM_FX_SPIKE) stats.flings++;
        if (x.kind === MC.WM_FX_POP && x.size !== MC.WM_KSPIKE) stats.pops++;
        if (x.kind === L.FX_SINK) stats.falls++;
      }
      const g = v.party();
      if (stats.start < 0 && g.state === L.H_PLAY) stats.start = t;
      if (g.state === L.H_PLAY) for (let p = 0; p < balls; p++) {
        const b = v.partier(p), keys = (v.dv.getUint32(rec(p) + L.P_IN, true) >>> 24) & 15;
        pushing[p] = keys && b.ground && !b.out && Math.hypot(b.vel[0], b.vel[2]) < 0.5 ? pushing[p] + 1 : 0;
        stuck[p] = Math.max(stuck[p], pushing[p]);
      }
      if (stats.over < 0 && stats.start >= 0 && g.state === L.H_OVER) {
        stats.over = t;
        const all = [...Array(balls).keys()].map((p) => v.partier(p));
        stats.places = all.map((b) => b.place);
        stats.final = all.map((b) => b.score);
        stats.pts = all.map((b) => b.pts);
      }
    } });
    assert.equal(sim.error().code, 0);
    assert.ok(stats.over > 0, 'the round ended');
    assert.equal(stats.over - stats.start, MC.WM_LEN, 'at the time');
    // (more balls than holes: the clumsiest, slowest to see a heave, can be beaten to every mole)
    assert.ok(stats.by.size >= balls * 0.9, `${stats.by.size} of ${balls} balls whacked a mole`);
    assert.ok(stats.whacks >= stats.pops * 0.7, `${stats.whacks} whacks of ${stats.pops} moles`);
    assert.ok(stats.gold >= 5, `${stats.gold} gold`);
    assert.ok(stats.fines + stats.flings <= 2, `${stats.fines} fines, ${stats.flings} flings`);
    assert.ok(stats.falls <= 1, `${stats.falls} falls`);
    // nobody stuck: no ball pushing and going nowhere for 2 s (waiting still by a hole is fine)
    stuck.forEach((n, p) => assert.ok(n < 250, `P${p + 1} pushed ${n} ticks without moving`));
    const sorted = [...stats.final].sort((a, b) => b - a);
    assert.ok(sorted[0] >= sorted.at(-1) + 8, `scores ${sorted}`);
    stats.final.forEach((s, p) => assert.equal(stats.places[p], 1 + stats.final.filter((o) => o > s).length, 'placed by points'));
    assert.ok(stats.pts.every((x) => x >= 1 && x <= 10) && stats.pts.includes(10), `points ${stats.pts}`);
    assert.equal(view.party().game, L.MG_MOLE);
    const parsed = parseLog(log);
    const n = stats.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('the client module: draws the lawn, its holes, heaves, moles up, whacked, gold and spiked; frames the square; its HUD lines; its FX', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  assert.deepEqual([MC.WM_FX_POP, MC.WM_FX_WHACK, MC.WM_FX_SPIKE, MC.WM_FX_CALL], [0, 1, 2, 3].map((k) => L.FX_MG + 4 * L.MG_MOLE + k));
  assert.equal(moleMg.id, L.MG_MOLE);
  assert.ok(moleMg.hint.length <= 70 && /^[ -_]*$/.test(moleMg.hint));
  const g = await room(6, { seed: 41, play: false });
  const out = () => ({ scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null });
  const lines = [];
  const hctx = (o = {}) => ({ put: (x, y, s, c) => lines.push([y, s, c]), centre: (y, s, c) => lines.push([y, s, c]), right: (y, s, c) => lines.push([y, s, c]), rows: 44, C: {}, slot: 0, now: 0, ...o });
  const check = (o, min) => {
    assert.ok(o.scene.count >= min, `${o.scene.count} solids`);
    for (let k = 0; k < o.scene.count * 16; k++) assert.ok(Number.isFinite(o.scene.data[k]), 'finite');
    for (const s of [...o.solid, ...o.glow]) assert.ok(s.pos.every(Number.isFinite) && Number.isFinite(s.size));
  };
  const st = stage(g.v);
  let o = out();
  moleMg.draw(g.v, { tick: g.v.tick, dt: 0, now: 0, slot: 0 }, o);
  check(o, st.nh * 2 + 20);
  const base = o.scene.count;
  assert.equal(moleMg.env, 'day');
  const fr = moleMg.frame(g.v);
  assert.deepEqual([fr.shape, fr.radius, fr.centre], ['square', st.half, [C, PLAT_Y, C]]);
  while (g.v.hole().state !== L.H_PLAY) g.step();
  for (let k = 0; k < 100; k++) g.step();
  // a heave of each kind, a mole up of each, one whacked
  const t = tp(g);
  pin(g, [{ i: 0, t0: t + 40 }, { i: 1, t0: t + 40, kind: MC.WM_KGOLD }, { i: 2, t0: t + 40, kind: MC.WM_KSPIKE },
    { i: 3, t0: t - 30 }, { i: 4, t0: t - 30, kind: MC.WM_KGOLD }, { i: 5, t0: t - 30, kind: MC.WM_KSPIKE }, { i: 6, t0: t - 30 }]);
  g.dv.setUint8(L.PG_BIG + MC.WM_POPS + 6 * MC.WM_PMAX * MC.WM_PSIZE + MC.WM_P_HIT, 1);
  g.step();
  o = out();
  moleMg.draw(g.v, { tick: g.v.tick, dt: 0, ptick: g.v.tick + 0.4, now: 1000, slot: 0, cam: [C, PLAT_Y + 20, C - 30], pme: g.v.partier(0) }, o);
  check(o, base + 3 + 4 * 4 + 7);
  assert.ok(o.glow.length >= 3 + 2, 'gold shines, stars over the whacked one');
  assert.equal(o.decals.length, 6, 'a ring round each hole heaving or up, none round the whacked one');
  // its HUD: your points and place, the frenzy, the spikes to come
  moleMg.hud(g.v, hctx({ t: tp(g) * 0.008, me: g.v.partier(0) }));
  let text = lines.map((l) => l[1]).join(' | ');
  assert.ok(/0 POINTS {2}\d+(ST|ND|RD|TH) OF 6/.test(text) && /FRENZY IN \d+/.test(text) && /SPIKED MOLES IN \d+/.test(text), text);
  for (const l of lines) assert.ok(l[1].length <= 40, l[1]);
  at(g, MC.WM_FRENZY + 10);
  g.step();
  lines.length = 0;
  moleMg.hud(g.v, hctx({ t: tp(g) * 0.008, me: g.v.partier(0) }));
  text = lines.map((l) => l[1]).join(' | ');
  assert.ok(text.includes('FRENZY  DOUBLE POINTS') && !text.includes('SPIKED'), text);
  // its FX: banners, flashes and sounds, none of them throwing
  const said = [];
  const fctx = { slot: 0, now: 0, dist: 5, glow: () => said.push('glow'), banner: (s) => said.push(s), feed: (s) => said.push(s), name: (p) => `P${p + 1}`,
    sound: { jump() {}, melee() {}, kill() {}, holed() {}, hurt() {}, boing() {}, count() {} } };
  const fx = (kind, owner, shot, size) => moleMg.fx({ tick: g.v.tick, kind, owner, shot, pos: [C, PLAT_Y, C], size }, fctx);
  fx(MC.WM_FX_POP, 255, 4, MC.WM_KGOLD);
  fx(MC.WM_FX_WHACK, 0, 4, 3);
  fx(MC.WM_FX_WHACK, 0, 4, -2);
  fx(MC.WM_FX_WHACK, 1, 4, 6);
  fx(MC.WM_FX_SPIKE, 0, 4, 12);
  fx(MC.WM_FX_CALL, 255, 0, 0);
  fx(MC.WM_FX_CALL, 255, 1, 0);
  for (const s of ['GOLD MOLE  +3', 'SPIKED  -2', 'P2 WHACKED A GOLD MOLE', 'OUCH  SPIKES', 'FRENZY!  DOUBLE POINTS']) assert.ok(said.includes(s), `${s} in ${said}`);
});

test('the brain: rolls at a mole whose dirt heaves and comes down on it, round a spiked one in the way; never goes for a spiked one; its danger is the spikes, the posts, the fence', async () => {
  const g = await room(2, { seed: 3 });
  park(g, 1);
  const H = hole(g, 5), Hs = hole(g, 4), Hf = hole(g, 2);
  const bot = new Partier(0, 1, 0.8);
  // a mole about to heave 11 m off, a spiked one up between
  pin(g, [{ i: 4, t0: tp(g) - 10, up: 250, kind: MC.WM_KSPIKE }, { i: 5, t0: tp(g) + MC.WM_TELE + 30, up: 200 }]);
  put(g, 0, H.x - 11, H.z + 0.6);
  const k0 = g.v.fxCount();
  let n = 0;
  while (!fxs(g.v, MC.WM_FX_WHACK, k0).length && n++ < 500) g.step([[L.EV_INPUT, 0, bot.think(g.v, g.v.tick, 0)]]);
  assert.deepEqual(fxs(g.v, MC.WM_FX_WHACK, k0).map((x) => [x.owner, x.shot, x.size]), [[0, 5, 1]], 'whacked it');
  assert.equal(fxs(g.v, MC.WM_FX_SPIKE, k0).length, 0, 'clear of the spikes');
  // only a spiked one up, next to it: it keeps off it and never hops at it
  pin(g, [{ i: 2, t0: tp(g) + 20, up: 250, kind: MC.WM_KSPIKE }]);
  put(g, 0, Hf.x - 5, Hf.z);
  const k1 = g.v.fxCount();
  for (let k = 0; k < 300; k++) {
    const w = bot.think(g.v, g.v.tick, 0);
    assert.equal((w >>> 28) & 1, 0, 'no hop');
    g.step([[L.EV_INPUT, 0, w]]);
  }
  assert.equal(fxs(g.v, MC.WM_FX_SPIKE, k1).length, 0);
  assert.equal(bot.mem.wm.plan.target, -1, 'nothing to go for');
  // danger: past the fence's line, by the spikes, against a post, the open lawn
  const st = stage(g.v);
  pin(g, [{ i: 2, t0: tp(g) - 30, up: 250, kind: MC.WM_KSPIKE }, { i: 6, t0: tp(g) - 30, up: 250 }]);
  g.step();
  const { danger, goal } = moleMg.brain;
  const T = g.v.tick;
  assert.equal(danger(g.v, C + st.half - 0.2, C, T), 0.4);
  assert.equal(danger(g.v, Hf.x + 1.5, Hf.z, T), 1);
  assert.equal(danger(g.v, hole(g, 6).x + 1.2, hole(g, 6).z, T), 0.3);
  assert.equal(danger(g.v, hole(g, 6).x + 3, hole(g, 6).z - 3, T), 0);
  assert.ok(goal(g.v, g.v.partier(0), bot).every(Number.isFinite));
});

test('the brain over a network: its words landing 6 ticks after it sees the world, it comes down on a mole from 3, 5 and 7 m off, still or rolling across', async () => {
  for (const [d, vz, seed] of [[3, 0, 21], [5, 0, 22], [7, 0, 23], [5, 3, 24], [7, -4, 25]]) {
    const g = await room(2, { seed });
    park(g, 1);
    const H = hole(g, 4);
    const bot = new Partier(0, seed, 0.8);
    pin(g, [{ i: 4, t0: tp(g) + MC.WM_TELE + 20, up: MC.WM_UP0 }]);
    put(g, 0, H.x - d, H.z - 1, { vz });
    const q = [];
    const k0 = g.v.fxCount();
    for (let n = 0; n < 400 && !fxs(g.v, MC.WM_FX_WHACK, k0).length; n++) {
      q.push(bot.think(g.v, g.v.tick + 6, 12));
      g.step([[L.EV_INPUT, 0, q.length > 6 ? q.shift() : 0]]);
    }
    assert.deepEqual(fxs(g.v, MC.WM_FX_WHACK, k0).map((x) => [x.owner, x.shot]), [[0, 4]], `from ${d} m, rolling ${vz} m/s across`);
  }
});
