// LONG JUMP (src/mg/jump.wat): the runways for 1 to 256 balls, the deck, the
// slope, the board, the islands and the sea's bed; the roll down the slope
// (the pull, the keys' share along it, the rails), the boost pads; the hop's
// lift by where it is made; the wind's schedule and its push in the air; a
// jump measured where it landed, the sea a foul; best, not last; the way
// back; the clock and the places; the prediction bit for bit through a whole
// run, jump, landing and return; the client and its AI; rounds of AI balls; a
// tick of 256.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/jump.mjs'; // LJ_*: the minigame's own constants
import jump, { stage, laneZ, laneAt, topAt, padAt, liftAt, isleAt, level, windAt, jumper, slotOf, fly } from '../client/mg/jump.mjs';

const TICK = 0.008;
const f = Math.fround;
const HB = PLAT_Y + MC.LJ_BH, HT = HB + MC.LJ_RISE, BED = PLAT_Y - MC.LJ_DEEP;
const near = (a, b, e = 1e-3, m = '') => assert.ok(Math.abs(a - b) <= e, `${m} ${a} against ${b}`);

// A room of n balls in LONG JUMP, on the debug build (a NaN traps) unless asked not to, stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7, debug = true } = {}) {
  const sim = await newParty(debug);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_JUMP + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step, s: stage(v) };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// Ball p at world (x, z), its bottom at y (on the runway there by default), going (vx, vy, vz), in state st with nothing behind it.
function put(g, p, x, z, { vx = 0, vy = 0, vz = 0, y = topAt(g.s, x), st = MC.LJ_RUN, air = st === MC.LJ_FLY, score } = {}) {
  const a = rec(p);
  [x, y, z, vx, vy, vz].forEach((val, i) => g.dv.setFloat32(a + [L.P_PX, L.P_PY, L.P_PZ, L.P_VX, L.P_VY, L.P_VZ][i], val, true));
  g.dv.setUint8(a + L.P_FL, L.PF_LIVE | (air ? 0 : L.PF_GROUND));
  g.dv.setUint32(a + L.PG_M, (g.dv.getUint32(a + L.PG_M, true) & ~MC.LJ_M_ST) | st, true);
  g.dv.setUint16(a + L.P_REFIRE, 0, true);
  if (score !== undefined) g.dv.setUint16(a + L.PG_SCORE, score, true);
}
// The round's clock put t ticks into play.
const at = (g, t) => g.dv.setUint32(L.HDR_START, (g.v.tick - t) >>> 0, true);
// The clock put 10 ticks into the segment (of the first 12) whose level pick likes best.
function atWind(g, pick) {
  let best = 0;
  for (let k = 1; k < 12; k++) if (pick(level(g.v, k)) > pick(level(g.v, best))) best = k;
  at(g, best * MC.LJ_WSEG + 10);
  return level(g.v, best);
}
const W = (yaw = 0, move = 1, hop = 0) => partyWord({ yaw: Math.round(yaw / (2 * Math.PI) * 16384) & 16383, move, hop });
const STILL = W(0, 0);
const ball = (g, p) => { const b = g.v.partier(p); const [l, u] = laneAt(g.s, b.pos[2]); return { ...b, ...jumper(b.m), l, u, x: b.pos[0], y: b.pos[1], d: b.pos[0] - g.s.xe }; };
const fxs = (v, from, kind) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
// Ball p stepped under word (a function of the ball, or a word) till its jump ends, or n ticks: the ball then.
function jumpOut(g, p, word = W(), n = 1500) {
  for (let k = 0; k < n; k++) {
    const b = ball(g, p);
    if (b.st >= MC.LJ_SAND) return b;
    g.step([[L.EV_INPUT, p, typeof word === 'function' ? word(b, k) : word]]);
  }
  return ball(g, p);
}
// Ball p put rolling vx along the board d0 short of its edge on runway l, hopping once it is within hopAt of the edge (never, under 0).
function launch(g, p, { l = 0, d0 = 8, vx = 20, hopAt = -1, u = 0, move = 1 } = {}) {
  put(g, p, g.s.xe - d0, laneZ(g.s, l) + u, { vx });
  return jumpOut(g, p, (b) => W(0, move, b.st === MC.LJ_RUN && hopAt >= 0 && -b.d <= hopAt ? 1 : 0));
}

test('the stage for 1, 8, 64 and 256: a runway for every 6 (2 to 32) side by side, centred; the deck 11.2 m over the board, the board 5 m over five islands, smaller the farther, sea between; every ball on its runway\'s deck; scored, no bumps, no hop but the board\'s', async () => {
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party(), s = g.s;
    const nl = Math.min(MC.LJ_NLMAX, Math.max(MC.LJ_NLMIN, Math.ceil(n / MC.LJ_PER)));
    assert.equal(r.game, L.MG_JUMP);
    assert.equal(s.nl, nl, `${n}: ${s.nl} runways`);
    assert.deepEqual([r.kind, r.len, r.flags, r.hop], [L.PK_SCORE, MC.LJ_LEN, 0, 0]);
    near(r.drag, MC.LJ_DRAG, 1e-6); near(r.idle, MC.LJ_DRAG, 1e-6); near(r.floor, BED, 1e-5);
    near(s.xs - s.xa, MC.LJ_TOP, 1e-4); near(s.xb - s.xs, MC.LJ_SLOPE, 1e-4); near(s.xe - s.xb, MC.LJ_BOARD, 1e-4);
    const far = MC.LJ_ID[MC.LJ_NI - 1] + MC.LJ_IR[MC.LJ_NI - 1];
    near((s.xa + s.xe + far) / 2, r.cx, 1e-3, 'centred along');
    near(s.zl + nl * MC.LJ_PITCH / 2, r.cx, 1e-3, 'centred across');
    near(r.size, Math.max(s.xe + far - s.xa, nl * MC.LJ_PITCH) / 2, 1e-3);
    s.isl.forEach((k, i) => {
      near(k.d, MC.LJ_ID[i], 1e-5); near(k.r, MC.LJ_IR[i], 1e-5);
      if (i) {
        assert.ok(k.r < s.isl[i - 1].r, 'smaller the farther');
        assert.ok(k.d - k.r - (s.isl[i - 1].d + s.isl[i - 1].r) >= 1.4, 'sea between');
      }
      assert.ok(k.r + 1 < MC.LJ_PITCH / 2, 'clear of the next runway\'s');
    });
    const on = Array(nl).fill(0);
    for (let p = 0; p < n; p++) {
      const b = ball(g, p);
      assert.equal(b.y, f(HT), `${n}: P${p + 1} on a deck`);
      assert.ok(b.ground && b.st === MC.LJ_RUN && b.x > s.xa + 1 && b.x < s.xs - 1 && Math.abs(b.u) <= MC.LJ_HW - 1, `${n}: P${p + 1} at ${b.x - s.xa}, ${b.u}`);
      for (let q = 0; q < p; q++) assert.ok(Math.hypot(b.x - g.v.partier(q).pos[0], b.pos[2] - g.v.partier(q).pos[2]) > 2.2, `${n}: P${p + 1} and P${q + 1} apart`);
      on[b.l]++;
    }
    assert.ok(Math.max(...on) - Math.min(...on) <= 1 && Math.max(...on) <= 8, `${n}: ${on}`);
  }
});

test('the floor: the deck, the slope and the board under a ball within LJ_HW of a runway\'s middle; the islands\' tops; the sea\'s bed everywhere else; the rails and the deck\'s back hold a rolling ball', async () => {
  const g = await room(2);
  const s = g.s, z0 = laneZ(s, 0);
  put(g, 1, s.xa + 2, laneZ(s, 1));
  // a ball let go on each stays at the runway's top; down the slope it keeps to it
  for (const x of [s.xa + 3, s.xs + 20, s.xb + 2]) {
    put(g, 0, x, z0 + 1);
    for (let k = 0; k < 60; k++) { g.step([[L.EV_INPUT, 0, STILL]]); assert.equal(ball(g, 0).y, topAt(s, ball(g, 0).x), 'on the runway'); assert.ok(ball(g, 0).ground); }
  }
  near(topAt(s, s.xs + MC.LJ_SLOPE / 2), HB + MC.LJ_RISE / 2, 1e-4);
  // the rails: rolled hard across, held at LJ_HW less its radius; the deck's back
  put(g, 0, s.xs + 10, z0);
  for (let k = 0; k < 200; k++) g.step([[L.EV_INPUT, 0, W(Math.PI / 2)]]);
  near(ball(g, 0).u, MC.LJ_HW - 1, 1e-4, 'the rail');
  assert.ok(ball(g, 0).ground && ball(g, 0).st === MC.LJ_RUN);
  put(g, 0, s.xa + 3, z0);
  for (let k = 0; k < 200; k++) g.step([[L.EV_INPUT, 0, W(Math.PI)]]);
  near(ball(g, 0).x, s.xa + 1, 1e-4, 'the back');
  // dropped in the air: onto an island's top over it, to the sea's bed beside it and under the runway
  const k2 = s.isl[2];
  for (const [x, z, top] of [[s.xe + k2.d, z0, PLAT_Y], [s.xe + k2.d + k2.r - 0.05, z0, PLAT_Y], [s.xe + k2.d + k2.r + 0.05, z0, BED], [s.xe + k2.d, z0 + k2.r + 0.1, BED],
    [s.xe + s.isl[0].d, laneZ(s, 1) - 1, PLAT_Y], [s.xe + 3, z0, BED]]) {
    put(g, 0, x, z, { y: PLAT_Y + 0.4, st: MC.LJ_FLY });
    atWind(g, (lv) => -Math.abs(lv));
    for (let k = 0; k < 250 && !(ball(g, 0).ground && ball(g, 0).st >= MC.LJ_SAND); k++) g.step([[L.EV_INPUT, 0, STILL]]);
    near(ball(g, 0).y, top, 1e-4, `at ${x - s.xe}, ${z - z0}`);
    assert.equal(ball(g, 0).st, top === PLAT_Y ? MC.LJ_SAND : MC.LJ_SWIM);
    assert.ok(!ball(g, 0).falling && !ball(g, 0).out);
  }
  assert.equal(isleAt(s, k2.d, 0), 2);
  assert.equal(isleAt(s, k2.d + k2.r + 0.05, 0), -1);
});

test('the roll: the slope pulls LJ_PULL down it; along the runway a ball keeps LJ_XKEEP of its speed a tick and past the deck the keys push LJ_KEYX of their push; across, the full push against LJ_DRAG', async () => {
  const g = await room(1);
  const s = g.s, z0 = laneZ(s, 0), A = Number(L.BPHYS.B_ACC_DT);
  // between pads, no keys: v' = v XKEEP + PULL dt
  put(g, 0, s.xs + MC.LJ_PAD0 + 6, z0, { vx: 15 });
  for (let k = 0; k < 20; k++) {
    const v0 = ball(g, 0).vel[0];
    g.step([[L.EV_INPUT, 0, STILL]]);
    near(ball(g, 0).vel[0], v0 * MC.LJ_XKEEP + MC.LJ_PULL * TICK, 2e-5, 'coasting');
  }
  // forward held: LJ_KEYX of the push more
  let v0 = ball(g, 0).vel[0];
  g.step([[L.EV_INPUT, 0, W(0)]]);
  v0 = ball(g, 0).vel[0];
  g.step([[L.EV_INPUT, 0, W(0)]]);
  near(ball(g, 0).vel[0], v0 * MC.LJ_XKEEP + MC.LJ_PULL * TICK + MC.LJ_KEYX * A, 2e-5, 'the forward key');
  // across: all of it, and none of the pull's
  g.step([[L.EV_INPUT, 0, W(Math.PI / 2)]]);
  const b0 = ball(g, 0);
  g.step([[L.EV_INPUT, 0, W(Math.PI / 2)]]);
  near(ball(g, 0).vel[2], b0.vel[2] * MC.LJ_DRAG + A, 2e-5, 'across');
  near(ball(g, 0).vel[0], b0.vel[0] * MC.LJ_XKEEP + MC.LJ_PULL * TICK, 1e-4, 'along, the key across');
  // on the deck the keys push whole, and nothing pulls
  put(g, 0, s.xa + 2, z0);
  g.step([[L.EV_INPUT, 0, W(0)]]);
  g.step([[L.EV_INPUT, 0, W(0)]]);
  v0 = ball(g, 0).vel[0];
  g.step([[L.EV_INPUT, 0, W(0)]]);
  near(ball(g, 0).vel[0], v0 * MC.LJ_XKEEP + A, 2e-5, 'the deck');
  put(g, 0, s.xa + 2, z0);
  for (let k = 0; k < 50; k++) g.step([[L.EV_INPUT, 0, STILL]]);
  assert.equal(ball(g, 0).vel[0], 0, 'the deck is level');
  // the board: level, the keys' share
  put(g, 0, s.xb + 1, z0, { vx: 10 });
  g.step([[L.EV_INPUT, 0, STILL]]);
  near(ball(g, 0).vel[0], 10 * MC.LJ_XKEEP, 2e-5, 'the board');
});

test('the boost pads: three down the slope, left then right, the other way round on the next runway; over one a ball on the ground gains LJ_PADA more while under LJ_PADV; a line through them leaves the slope faster', async () => {
  const g = await room(8);
  const s = g.s;
  for (let p = 1; p < 8; p++) put(g, p, s.xa + 2, laneZ(s, 1) + 3);
  for (const l of [0, 1]) {
    const zc = laneZ(s, l);
    for (let i = 0; i < MC.LJ_NPAD; i++) {
      const [px, pu] = padAt(s, l, i);
      near(px - s.xs, MC.LJ_PAD0 + i * MC.LJ_PADGAP, 1e-4);
      assert.equal(pu, ((i + l) & 1 ? 1 : -1) * MC.LJ_PADU, 'left then right');
      for (const [u, on] of [[pu, true], [-pu, false], [pu + Math.sign(pu) * (MC.LJ_PADW - 0.1), true], [pu - Math.sign(pu) * (MC.LJ_PADW + 0.1), false]]) {
        put(g, 0, px - 1, zc + u, { vx: 15 });
        g.step([[L.EV_INPUT, 0, STILL]]);
        near(ball(g, 0).vel[0], 15 * MC.LJ_XKEEP + (MC.LJ_PULL + (on ? MC.LJ_PADA : 0)) * TICK, 2e-5, `runway ${l} pad ${i} at ${u}`);
      }
      // its ends, along
      for (const [dx, on] of [[-MC.LJ_PADL + 0.3, true], [MC.LJ_PADL - 0.3, true], [-MC.LJ_PADL - 0.3, false], [MC.LJ_PADL + 0.1, false]]) {
        put(g, 0, px + dx - 15 * TICK, zc + pu, { vx: 15 });
        g.step([[L.EV_INPUT, 0, STILL]]);
        assert.equal(ball(g, 0).vel[0] > 15.1, on, `pad ${i} ${dx} along`);
      }
    }
  }
  // at LJ_PADV it adds nothing; in the air nothing
  const [px, pu] = padAt(s, 0, 1), zc = laneZ(s, 0);
  put(g, 0, px, zc + pu, { vx: MC.LJ_PADV + 1 });
  g.step([[L.EV_INPUT, 0, STILL]]);
  near(ball(g, 0).vel[0], (MC.LJ_PADV + 1) * MC.LJ_XKEEP + MC.LJ_PULL * TICK, 2e-5, 'at LJ_PADV');
  put(g, 0, px, zc + pu, { vx: 15, y: topAt(s, px) + 2, st: MC.LJ_RUN, air: true });
  g.step([[L.EV_INPUT, 0, STILL]]);
  assert.ok(ball(g, 0).vel[0] < 15, 'over it in the air');
  // three lines from the slope's top at 8 m/s, no keys: between the pads, down one side, weaving through all three
  const edge = (line) => {
    put(g, 0, s.xs + 0.1, zc + line(0), { vx: 8 });
    let b = ball(g, 0);
    for (let k = 0; k < 900 && b.x < s.xb; k++) {
      g.dv.setFloat32(rec(0) + L.P_PZ, zc + line(b.x - s.xs), true);
      g.step([[L.EV_INPUT, 0, STILL]]);
      b = ball(g, 0);
    }
    return b.vel[0];
  };
  const none = edge(() => 0), side = edge(() => -MC.LJ_PADU), all = edge((sx) => padAt(s, 0, Math.max(0, Math.min(MC.LJ_NPAD - 1, Math.round((sx - MC.LJ_PAD0) / MC.LJ_PADGAP))))[1]);
  assert.ok(none > 9.5 && none < 12 && side > none + 3 && all > side + 1.5 && all < MC.LJ_PADV, `${none}, ${side}, ${all} m/s at the slope's foot`);
});

test('the hop: the key on the board\'s last LJ_HOPZ lifts a ball LJ_LIFT0 at the zone\'s start rising evenly to LJ_LIFT1 at the edge; short of the zone and past the edge it does nothing; a later hop flies farther', async () => {
  const g = await room(1);
  const s = g.s, z0 = laneZ(s, 0);
  near(liftAt(MC.LJ_HOPZ), MC.LJ_LIFT0, 1e-5); near(liftAt(0), MC.LJ_LIFT1, 1e-5);
  const lifts = [];
  for (const hopAt of [MC.LJ_HOPZ + 3, 4, 2.5, 1, 0.3]) {
    put(g, 0, s.xe - 8.5, z0, { vx: 20 });
    at(g, 10);
    const f0 = g.v.fxCount();
    let b = ball(g, 0), up = null;
    for (let k = 0; k < 100 && !up; k++) {
      g.step([[L.EV_INPUT, 0, W(0, 1, -b.d <= hopAt ? 1 : 0)]]);
      b = ball(g, 0);
      if (b.st === MC.LJ_FLY) up = b;
      else assert.ok(b.ground && b.vel[1] === 0 && b.y === f(HB), 'on the board till the hop');
    }
    assert.ok(up && -up.d <= MC.LJ_HOPZ && -up.d <= hopAt && -up.d > Math.min(hopAt, MC.LJ_HOPZ) - 0.4, `hopped ${-up.d} short of the edge for ${hopAt}`);
    assert.equal(up.vel[1], liftAt(f(s.xe - up.x)), 'the lift where it was made');
    assert.ok(!up.ground);
    const off = fxs(g.v, f0, MC.LJ_FX_OFF);
    assert.ok(off.length === 1 && off[0].owner === 0 && off[0].shot === Math.trunc(up.vel[1] * 8), 'its FX');
    lifts.push(up.vel[1]);
  }
  near(lifts[0], MC.LJ_LIFT0, 0.25, 'held from before the zone: the least');
  assert.ok(lifts.every((x, i) => !i || x > lifts[i - 1]) && lifts[4] > MC.LJ_LIFT1 - 0.6, `later, more: ${lifts}`);
  // past the edge the key does nothing: it drops as one that rolled off does
  put(g, 0, s.xe - 0.05, z0, { vx: 20 });
  let b = ball(g, 0);
  for (let k = 0; k < 20; k++) { g.step([[L.EV_INPUT, 0, W(0, 1, b.d > 0 ? 1 : 0)]]); b = ball(g, 0); assert.ok(b.vel[1] <= 0, 'no lift past the edge'); }
  assert.ok(b.st === MC.LJ_FLY && b.y < HB);
  // the same roll at the same wind: no hop, an early one, a late one
  atWind(g, (lv) => -Math.abs(lv));
  const t0 = g.v.party().t;
  const out = [-1, 4.5, 0.4].map((hopAt) => { at(g, t0); return launch(g, 0, { vx: 21, hopAt }); });
  // (an early one, so low a lift so far back, lands no farther than rolling off)
  assert.ok(Math.abs(out[1].last - out[0].last) < 2.5 && out[2].last > out[0].last + 6, `${out.map((x) => x.last)} m`);
});

test('the wind: a level from the seed every LJ_WSEG, -4 to 4, turning evenly into the next over its last LJ_WTURN, called as the turn starts; it pushes a ball in the air LJ_WSTEP a level, none on the runway; the client\'s the same bits', async () => {
  const g = await room(1, { seed: 21 });
  const s = g.s, z0 = laneZ(s, 0);
  const lv = Array.from({ length: 15 }, (_, k) => level(g.v, k));
  assert.ok(lv.every((x) => Number.isInteger(x) && Math.abs(x) <= MC.LJ_WMAX) && new Set(lv).size >= 4 && lv.some((x) => x > 0) && lv.some((x) => x < 0), `${lv}`);
  near(windAt(g.v, 5), lv[0] * MC.LJ_WSTEP, 1e-6);
  near(windAt(g.v, MC.LJ_WSEG - MC.LJ_WTURN), lv[0] * MC.LJ_WSTEP, 1e-6);
  near(windAt(g.v, MC.LJ_WSEG - MC.LJ_WTURN / 2), (lv[0] + lv[1]) / 2 * MC.LJ_WSTEP, 0.03);
  near(windAt(g.v, MC.LJ_WSEG), lv[1] * MC.LJ_WSTEP, 1e-6);
  // a ball high in the air, no keys, through a turn: every tick its speed is the air's drag and the wind's push, to the bit
  const k = lv.findIndex((x, i) => i < 12 && x !== lv[i + 1]);
  at(g, k * MC.LJ_WSEG + MC.LJ_WSEG - MC.LJ_WTURN - 40);
  const f0 = g.v.fxCount();
  put(g, 0, s.xe + 3, z0, { y: PLAT_Y + 400, vx: 5, st: MC.LJ_FLY });
  const AD = f(Number(L.BPHYS.B_AIR_DRAG));
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const v0 = ball(g, 0).vel[0];
    const w = windAt(g.v, g.v.party().t);
    g.step([[L.EV_INPUT, 0, STILL]]);
    seen.add(w);
    assert.equal(ball(g, 0).vel[0], f(f(w * f(TICK)) + f(v0 * AD)), `tick ${i}`);
  }
  assert.ok(seen.size > 100, 'through the turn');
  const called = fxs(g.v, f0, MC.LJ_FX_WIND);
  assert.ok(called.length === 1 && called[0].owner === 255 && called[0].shot === lv[k + 1] + MC.LJ_WMAX, 'the turn called, the coming level');
  near(called[0].size, lv[k + 1] * MC.LJ_WSTEP, 1e-5);
  assert.equal((called[0].tick - g.v.party().start) | 0, k * MC.LJ_WSEG + MC.LJ_WSEG - MC.LJ_WTURN, 'as it starts');
  // on the runway it is nothing
  put(g, 0, s.xb + 1, z0, { vx: 10 });
  g.step([[L.EV_INPUT, 0, STILL]]);
  near(ball(g, 0).vel[0], 10 * MC.LJ_XKEEP, 2e-5);
  // the same hop into the strongest tailwind and the strongest headwind
  const tail = atWind(g, (x) => x), a = launch(g, 0, { vx: 22, hopAt: 1 });
  const head = atWind(g, (x) => -x), b = launch(g, 0, { vx: 22, hopAt: 1 });
  assert.ok(tail >= 2 && head <= -2 && a.last > b.last + 0.7 * (tail - head), `${a.last} m in ${tail}, ${b.last} m in ${head}`);
});

test('a run and a landing: rolled off the deck, down the slope and off the board, a ball down on an island is held in the sand and its jump is the edge to where it is, in cm, its score; the client\'s flight lands where the sim\'s does', async () => {
  const g = await room(1, { seed: 3 });
  const s = g.s;
  atWind(g, (lv) => -Math.abs(lv - 1));
  const f0 = g.v.fxCount();
  let top = 0;
  // down the middle (between the pads), a hop 2 m short of the edge
  const b = jumpOut(g, 0, (q) => { if (q.st === MC.LJ_RUN) top = q.vel[0]; return W(Math.max(-0.6, Math.min(0.6, -q.u * 0.4 - q.vel[2] * 0.3)), 1, q.st === MC.LJ_RUN && -q.d <= 2 ? 1 : 0); });
  const off = fxs(g.v, f0, MC.LJ_FX_OFF)[0], land = fxs(g.v, f0, MC.LJ_FX_LAND);
  assert.ok(top > 13 && top < 20, `${top} m/s off the board with no pad`);
  assert.equal(b.st, MC.LJ_SAND, `landed: ${b.d} m out`);
  assert.ok(b.ground && b.y === PLAT_Y && b.vel.every((x) => x === 0), 'held in the sand');
  const k = isleAt(s, b.d, b.u);
  assert.ok(k >= 0 && b.d > 12, `on island ${k}`);
  assert.equal(b.score, Math.trunc(f(f(b.x - s.xe) * 100)), 'the edge to where it is, cm');
  assert.deepEqual([b.last, b.foul, b.n], [b.score / 100, false, 1]);
  assert.ok(land.length === 1 && land[0].owner === 0 && land[0].shot === (k | 16), 'its FX: the island, a best');
  near(land[0].size, b.d, 1e-4);
  assert.deepEqual(land[0].pos, b.pos);
  // the flight again from the hop, in the page: the same landing
  const [d, n] = fly(g.v, (off.tick - g.v.party().start) | 0, off.pos[0] - s.xe, off.size, off.shot / 8 > 0 ? liftAt(f(s.xe - off.pos[0])) : 0, 1);
  near(d, b.d, 1e-3, 'the client\'s flight');
  assert.equal(n, land[0].tick - off.tick, 'and its ticks');
  // held till it goes back
  for (let i = 0; i < 30; i++) { g.step([[L.EV_INPUT, 0, W(1)]]); const q = ball(g, 0); assert.ok(Math.hypot(q.x - b.x, q.pos[2] - b.pos[2]) < 1e-3 && q.y === PLAT_Y && q.vel.every((x) => x === 0), 'the keys don\'t move it'); }
});

test('the sea is a foul: a ball down between islands, short of them, past the last or beside them scores nothing, slows and sinks to the bed, never out; its last says where', async () => {
  const g = await room(1);
  const s = g.s, z0 = laneZ(s, 0);
  const gap = (s.isl[0].d + s.isl[0].r + s.isl[1].d - s.isl[1].r) / 2, past = s.isl[MC.LJ_NI - 1].d + s.isl[MC.LJ_NI - 1].r + 1;
  let n = 0;
  for (const [d, u] of [[gap, 0], [3, 0], [past, 0], [s.isl[1].d, s.isl[1].r + 0.3]]) {
    put(g, 0, s.xe + d - 1, z0 + u, { y: PLAT_Y + 1.5, vx: 3, st: MC.LJ_FLY });
    atWind(g, (lv) => -Math.abs(lv));
    const f0 = g.v.fxCount();
    const b = jumpOut(g, 0, STILL);
    n++;
    assert.equal(b.st, MC.LJ_SWIM, `${d}, ${u}: in the sea`);
    assert.ok(b.y < PLAT_Y - MC.LJ_WET && b.y > PLAT_Y - MC.LJ_WET - 0.5);
    assert.deepEqual([b.score, b.foul, b.n], [0, true, n]);
    near(b.last, b.d, 0.011, 'where it went in');
    const sp = fxs(g.v, f0, MC.LJ_FX_SPLASH);
    assert.ok(sp.length === 1 && sp[0].owner === 0 && fxs(g.v, f0, MC.LJ_FX_LAND).length === 0, 'its FX');
    near(sp[0].size, b.d, 1e-4);
    for (let i = 0; i < MC.LJ_BACK - 2; i++) {
      g.step([[L.EV_INPUT, 0, W(0)]]);
      const q = ball(g, 0);
      assert.ok(q.st === MC.LJ_SWIM && !q.falling && !q.out && q.y >= f(BED) && q.vel[1] >= -MC.LJ_SINKV - 1e-4 && q.vel[0] < 3, 'sinking, slowed');
    }
    assert.equal(ball(g, 0).y, f(BED), 'on the bed');
      assert.ok(ball(g, 0).vel[0] < 1, 'the keys barely move it');
  }
  assert.equal(g.v.partier(0).score, 0);
  assert.deepEqual([slotOf(g.v, 0).jumps, slotOf(g.v, 0).fouls, slotOf(g.v, 0).best], [4, 4, 0]);
});

test('best, not last: a long jump, then a shorter one and a foul leave the score the long one\'s; the slot\'s record counts them and keeps where the best landed', async () => {
  const g = await room(2);
  const s = g.s, z0 = laneZ(s, 0);
  put(g, 1, s.xa + 2, laneZ(s, 1));
  const drop = (d, u = 0) => { put(g, 0, s.xe + d, z0 + u, { y: PLAT_Y + 1, st: MC.LJ_FLY }); at(g, 10); return jumpOut(g, 0, STILL); };
  const a = drop(s.isl[2].d + 0.7, 0.5);
  assert.deepEqual([a.st, a.score], [MC.LJ_SAND, Math.trunc(f(f(a.x - s.xe) * 100))]);
  assert.ok(a.score > 2500);
  let r = slotOf(g.v, 0);
  assert.deepEqual([r.jumps, r.fouls, r.best, r.bx, r.bz], [1, 0, a.score / 100, a.x, a.pos[2]]);
  const f0 = g.v.fxCount();
  const b = drop(s.isl[0].d);
  assert.deepEqual([b.st, b.score, b.last, b.foul], [MC.LJ_SAND, a.score, Math.trunc(f(f(b.x - s.xe) * 100)) / 100, false]);
  assert.equal(fxs(g.v, f0, MC.LJ_FX_LAND)[0].shot, 0, 'no best');
  const c = drop(s.isl[3].d + s.isl[3].r + 0.6);
  assert.deepEqual([c.st, c.score, c.foul], [MC.LJ_SWIM, a.score, true]);
  assert.ok(c.last > a.last, 'a longer foul is nothing');
  r = slotOf(g.v, 0);
  assert.deepEqual([r.jumps, r.fouls, r.best, r.bx, r.bz], [3, 1, a.score / 100, a.x, a.pos[2]]);
  // a longer one takes it
  const d = drop(s.isl[3].d);
  assert.ok(d.st === MC.LJ_SAND && d.score > a.score && d.score === Math.round(d.last * 100));
  assert.deepEqual([slotOf(g.v, 0).best, slotOf(g.v, 0).bx], [d.score / 100, d.x]);
  assert.deepEqual([g.v.partier(1).score, slotOf(g.v, 1).jumps], [0, 0]);
});

test('the way back: LJ_BACK after a landing or a splash a ball is still on its slot\'s place on the deck of the runway it is by, to roll again; down on the board it just rolls on', async () => {
  const g = await room(12, { seed: 5 });
  const s = g.s;
  assert.equal(s.nl, 2);
  for (const [p, l, d, st] of [[0, 0, s.isl[1].d, MC.LJ_SAND], [4, 1, s.isl[0].d, MC.LJ_SAND], [5, 0, 3, MC.LJ_SWIM], [7, 1, s.isl[2].d + s.isl[2].r + 0.7, MC.LJ_SWIM]]) {
    put(g, p, s.xe + d, laneZ(s, l) + 0.4, { y: PLAT_Y + 1, st: MC.LJ_FLY });
    at(g, 10);
    const b = jumpOut(g, p, STILL);
    assert.equal(b.st, st);
    for (let k = 0; k < MC.LJ_BACK - 1; k++) { g.step([[L.EV_INPUT, p, W(0)]]); assert.equal(ball(g, p).st, st, `held ${k}`); }
    g.step([[L.EV_INPUT, p, W(0)]]);
    const q = ball(g, p);
    assert.deepEqual([q.st, q.ground, q.y, q.vel], [MC.LJ_RUN, true, f(HT), [0, 0, 0]], `P${p + 1} back`);
    assert.equal(q.l, l, 'on the runway it was by');
    near(q.x - s.xa, MC.LJ_SPOT0 + (Math.floor(p / 3) % 3) * MC.LJ_SPOTX, 1e-4); near(q.u, (p % 3 - 1) * MC.LJ_SPOTU, 1e-4);
    assert.equal(q.n, 1);
    for (let k = 0; k < 150; k++) g.step([[L.EV_INPUT, p, W(0)]]);
    assert.ok(ball(g, p).x > s.xs && ball(g, p).st === MC.LJ_RUN, 'and rolls again');
  }
  // a hop too slow to clear the board comes down on it: no jump, rolling on
  put(g, 0, s.xe - 4.5, laneZ(s, 0), { vx: 1 });
  const n0 = ball(g, 0).n;
  let up = false;
  for (let k = 0; k < 200; k++) { g.step([[L.EV_INPUT, 0, W(0, 0, k < 3 ? 1 : 0)]]); up ||= ball(g, 0).st === MC.LJ_FLY; }
  const b = ball(g, 0);
  assert.ok(up && b.st === MC.LJ_RUN && b.ground && b.y === f(HB) && b.n === n0, 'back on the board');
});

test('the clock and the places: nobody is out while it plays; a newcomer drops onto a deck and jumps; a ball alone plays; at 90 s the best jump wins, a ball in the air or with only fouls scoring nothing', async () => {
  const g = await room(4, { seed: 11 });
  const s = g.s;
  const drop = (p, d) => { put(g, p, s.xe + d, laneZ(s, 0), { y: PLAT_Y + 1, st: MC.LJ_FLY }); at(g, 10); return jumpOut(g, p, STILL); };
  drop(0, s.isl[1].d); drop(1, s.isl[3].d); drop(2, s.isl[0].d - 2); drop(3, 3);
  for (let k = 0; k < 200; k++) g.step();
  g.step([[L.EV_JOIN, 9]]);
  let b = ball(g, 9);
  assert.ok(!b.out && b.y > HT + 5 && b.x < s.xs && Math.abs(b.u) < MC.LJ_HW - 1, 'a newcomer over a deck');
  for (let k = 0; k < 150; k++) g.step([[L.EV_INPUT, 9, STILL]]);
  b = ball(g, 9);
  assert.deepEqual([b.y, b.ground, b.st], [f(HT), true, MC.LJ_RUN]);
  const j = jumpOut(g, 9, (q) => W(0, 1, q.st === MC.LJ_RUN && -q.d < 1.5 ? 1 : 0));
  assert.ok(j.st >= MC.LJ_SAND && j.n === 1, 'and it jumps');
  // P3 off the board again with a jump that would win, still in the air as the clock runs out
  put(g, 2, s.xe + 5, laneZ(s, 1), { y: HB + 6, vx: 26, st: MC.LJ_FLY });
  g.step();
  for (let p = 0; p < 10; p++) if (g.v.partier(p).live) assert.ok(!g.v.partier(p).out && !g.v.partier(p).falling, `P${p + 1} in`);
  assert.equal(g.v.party().left, 5);
  g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 2, true);
  for (let k = 0; k < 4; k++) g.step();
  assert.equal(g.v.hole().state, L.H_OVER);
  const sc = [0, 1, 2, 3, 9].map((p) => g.v.partier(p).score);
  assert.ok(sc[1] > sc[0] && sc[0] > sc[2] && sc[2] > 0 && sc[3] === 0, `${sc}`);
  [0, 1, 2, 3, 9].forEach((p, i) => assert.equal(g.v.partier(p).place, 1 + sc.filter((x) => x > sc[i]).length, `P${p + 1}'s place`));
  assert.deepEqual([g.v.partier(1).place, g.v.partier(1).pts, g.v.party().winner], [1, 10, 1]);
  // a ball alone
  const h = await room(1, { seed: 12 });
  const a = jumpOut(h, 0, (q) => W(0, 1, q.st === MC.LJ_RUN && -q.d < 1 ? 1 : 0));
  assert.ok(a.n === 1 && h.v.hole().state === L.H_PLAY);
  for (let k = 0; k < MC.LJ_BACK + 5; k++) h.step();
  assert.equal(ball(h, 0).st, MC.LJ_RUN);
});

test('the prediction matches the confirmed ball bit for bit: off the deck, weaving down the slope over the pads, a hop on the board, the flight in the wind, the sand, the wait and the deck again; and off the board into the sea and back', async () => {
  const seed = 9;
  const words = (hopFrom) => (k) => W(0.45 * Math.sin(k * 0.021), k % 211 < 190 ? 1 : 0, k >= hopFrom ? 1 : 0);
  // a scout on the same room finds the tick the hop zone is half crossed
  const sc = await room(2, { seed });
  let kz = -1;
  for (let k = 0; k < 1500 && kz < 0; k++) { sc.step([[L.EV_INPUT, 0, words(1e9)(k)]]); if (-ball(sc, 0).d < MC.LJ_HOPZ / 2) kz = k + 1; }
  assert.ok(kz > 300, `the zone at ${kz}`);
  const g = await room(2, { seed });
  const s = g.s;
  let compared = 0;
  const seen = new Set();
  const run = (mk, n) => {
    for (let c = 0; c < n; c += 10) {
      compared += predicted(g, Array.from({ length: 10 }, (_, i) => mk(c + i)));
      seen.add(ball(g, 0).st);
    }
  };
  // A: the whole run and the jump, then held and back on the deck and off again
  const f0 = g.v.fxCount();
  run(words(kz), kz + 20);
  assert.equal(ball(g, 0).st, MC.LJ_FLY, 'hopped');
  assert.ok(fxs(g.v, f0, MC.LJ_FX_OFF)[0].shot > 30, 'a hop past the zone\'s middle');
  run(words(kz), 520);
  assert.ok(ball(g, 0).n === 1 && ball(g, 0).st === MC.LJ_RUN && ball(g, 0).x > s.xa + 2, `ended ${JSON.stringify(jumper(g.v.partier(0).m))} and rolling again`);
  // B: onto an island from the air in a strong wind, the wait, the deck
  atWind(g, (lv) => Math.abs(lv));
  put(g, 0, s.xe + s.isl[1].d - 6, laneZ(s, 0) + 0.3, { y: PLAT_Y + 4, vx: 14, vz: -0.5, st: MC.LJ_FLY });
  run(() => W(0.3), 110);
  assert.equal(ball(g, 0).st, MC.LJ_SAND, `on the sand at ${ball(g, 0).d}`);
  const best = g.v.partier(0).score;
  run(() => W(0.3), 200);
  assert.ok(ball(g, 0).st === MC.LJ_RUN && best > 0);
  // C: a slow roll off the board into the sea, sinking, and back
  put(g, 0, s.xe - 3, laneZ(s, 0), { vx: 5 });
  run((k) => W(-0.2, k < 150 ? 1 : 0), 200);
  assert.equal(ball(g, 0).st, MC.LJ_SWIM, 'in the sea');
  run(() => W(0), 200);
  assert.ok(ball(g, 0).st === MC.LJ_RUN && ball(g, 0).foul && g.v.partier(0).score >= best);
  // D: through a turn of the wind in the air, the keys held across
  const lv = Array.from({ length: 12 }, (_, k) => level(g.v, k)), kt = lv.findIndex((x, i) => i < 11 && Math.abs(x - lv[i + 1]) >= 2);
  at(g, kt * MC.LJ_WSEG + MC.LJ_WSEG - MC.LJ_WTURN + 20);
  put(g, 0, s.xe + 1, laneZ(s, 0), { y: PLAT_Y + 30, vx: 6, st: MC.LJ_FLY });
  run(() => W(Math.PI / 2), 250);
  assert.ok(ball(g, 0).st >= MC.LJ_SAND);
  assert.deepEqual([...seen].sort(), [MC.LJ_RUN, MC.LJ_FLY, MC.LJ_SAND, MC.LJ_SWIM]);
  assert.ok(compared > 2000, `${compared} compared`);
});

test('the client module: draws the runways, pads, boards, islands and their rings, the lines on the water, the windsocks and a flag at a best; frames the stage; its HUD and FX; its brain rolls the pads, hops on the board and lands on sand', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const g = await room(8, { seed: 14 });
  const s = g.s;
  put(g, 0, s.xe + s.isl[2].d, laneZ(s, 0), { y: PLAT_Y + 1, st: MC.LJ_FLY });
  at(g, MC.LJ_WSEG - MC.LJ_WTURN - 100);
  const landed = jumpOut(g, 0, STILL);
  const out = () => ({ scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null });
  const o = out();
  const r = g.v.party();
  jump.draw(g.v, { tick: r.tick, t: r.t * TICK, dt: 0, ptick: r.tick + 6, now: 1000, slot: 0, pme: g.v.partier(0) }, o);
  const count = o.scene.count ?? o.scene.n;
  for (let k = 0; k < count * 16; k++) assert.ok(Number.isFinite(o.scene.data[k]), 'finite');
  assert.ok(count > 2 * 60, `two runways and their islands: ${count}`);
  const looks = new Set(); for (let k = 0; k < count; k++) looks.add(o.scene.data[k * 16 + 11]);
  for (const lk of [9, 8, 5, 3, 0]) assert.ok(looks.has(lk), `look ${lk}: the track, the board, the pads, steel, sand`);
  assert.equal(o.decals.length, 2 * MC.LJ_NI, 'a ring an island');
  // a flag where P1's best landed
  let flag = false;
  for (let k = 0; k < count; k++) if (Math.abs(o.scene.data[k * 16] - landed.x) < 1e-3 && Math.abs(o.scene.data[k * 16 + 2] - landed.pos[2]) < 1e-3 && o.scene.data[k * 16 + 1] > PLAT_Y) flag = true;
  assert.ok(flag, 'the flag');
  const fr = jump.frame(g.v);
  assert.equal(fr.shape, 'square');
  assert.ok(fr.radius >= (s.xe - s.xa) / 2 && fr.centre[0] > s.xa && fr.centre[0] < s.xe + 40);
  assert.equal(jump.facing(g.v, 0), 0);
  const lines = [];
  jump.hud(g.v, { put: () => {}, centre: (y, x) => lines.push(x), right: (y, x) => lines.push(x), rect: () => {}, rows: 44, C: {}, slot: 0, now: 0, t: r.t * TICK });
  assert.ok(lines.includes(`BEST ${landed.last.toFixed(2)} M`) && lines.includes(`LAST ${landed.last.toFixed(2)} M`) && lines.includes('JUMPS 1  FOULS 0'), lines.join(' | '));
  assert.ok(lines.some((x) => /WIND/.test(x)) && lines.some((x) => / IN \d+$/.test(x)), lines.join(' | '));
  const said = [];
  const fctx = { slot: 0, view: g.v, glow: () => {}, banner: (x) => said.push(x), feed: (x) => said.push(x), name: (q) => `P${q + 1}`, dist: 0 };
  jump.fx({ kind: MC.LJ_FX_LAND, owner: 0, shot: 3 | 16, pos: [s.xe + 30, PLAT_Y, 0], size: 30.125 }, fctx);
  jump.fx({ kind: MC.LJ_FX_LAND, owner: 1, shot: 1, pos: [s.xe + 18, PLAT_Y, 0], size: 18 }, fctx);
  jump.fx({ kind: MC.LJ_FX_SPLASH, owner: 0, shot: 0, pos: [s.xe + 16, PLAT_Y, 0], size: 15.5 }, fctx);
  jump.fx({ kind: MC.LJ_FX_WIND, owner: 255, shot: MC.LJ_WMAX + 3, pos: [s.xe, PLAT_Y, 0], size: 3.75 }, fctx);
  jump.fx({ kind: MC.LJ_FX_OFF, owner: 0, shot: 40, pos: [s.xe, HB, 0], size: 20 }, fctx);
  assert.deepEqual(said, ['30.13 M  YOUR BEST', 'P1 JUMPED 30.13 M', 'SPLASH AT 15.50 M  NO JUMP', 'TAILWIND 3 COMING']);
  for (const l2 of [...lines, ...said, jump.hint, jump.rules, '<<<< HEADWIND']) assert.ok(l2.length <= 70 && /^[ -_]*$/.test(l2), l2);
  // an AI ball alone: every jump it takes the pads, hops in the zone, and most come down on sand
  const h = await room(1, { seed: 15 });
  const bot = new Partier(0, 7, 0.9);
  const f0 = h.v.fxCount();
  for (let k = 0; k < 8000; k++) h.step([[L.EV_INPUT, 0, bot.think(h.v, h.v.tick, 0)]]);
  const offs = fxs(h.v, f0, MC.LJ_FX_OFF), lands = fxs(h.v, f0, MC.LJ_FX_LAND), wet = fxs(h.v, f0, MC.LJ_FX_SPLASH);
  assert.ok(offs.length >= 6 && offs.every((x) => x.shot > 0), `${offs.length} jumps, every one hopped`);
  assert.ok(offs.filter((x) => x.size > 22).length >= offs.length - 1, `over the pads: ${offs.map((x) => x.size.toFixed(1))}`);
  assert.ok(lands.length >= 3 && lands.length > wet.length && Math.max(...lands.map((x) => x.size)) > 26, `${lands.map((x) => x.size.toFixed(1))} landed, ${wet.length} wet`);
});

// Rounds of AI balls (client/party-bot.mjs, this brain), as tools/genparty.mjs plays them.
for (const [balls, seed] of [[8, 8], [64, 64]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, jump after jump, most on sand and some in the sea, the best past 28 m, nobody out, placed by their best; equal on 1 and 4 threads`, async (t) => {
    const st = { start: -1, over: -1, lands: [], wet: 0, isl: Array(MC.LJ_NI).fill(0), places: null, scores: null, pts: null };
    let seen = 0;
    const { log, sim, view, ticks } = await playParty({ bytes: partyBytes(true), mg: L.MG_JUMP, seed, bots: balls, ticks: 14000, delay: 8, untilRoundOver: true, onTick: (tk, s, v) => {
      assert.equal(s.error().code, 0, 'no trap');
      for (; seen < v.fxCount(); seen++) {
        const x = v.fx(seen);
        if (x.kind === MC.LJ_FX_LAND) { st.lands.push(x.size); st.isl[x.shot & 15]++; }
        if (x.kind === MC.LJ_FX_SPLASH) st.wet++;
      }
      const r = v.party();
      if (st.start < 0 && r.state === L.H_PLAY) st.start = tk;
      if (r.state === L.H_PLAY && tk % 50 === 0) assert.equal(r.left, balls, 'nobody out');
      if (st.over < 0 && st.start >= 0 && r.state === L.H_OVER) {
        st.over = tk;
        const all = [...Array(balls).keys()].map((p) => v.partier(p));
        st.places = all.map((b) => b.place);
        st.scores = all.map((b) => b.score);
        st.pts = all.map((b) => b.pts);
      }
    } });
    assert.equal(sim.error().code, 0);
    assert.ok(st.over > 0, 'the round ended');
    assert.equal(st.over - st.start, MC.LJ_LEN, 'on the clock');
    const jumps = st.lands.length + st.wet, share = st.wet / jumps;
    const sorted = [...st.scores].sort((a, b) => b - a);
    t.diagnostic(`${(jumps / balls).toFixed(1)} jumps a ball, ${(100 * share).toFixed(0)}% in the sea, islands ${st.isl.join('/')}, best ${sorted[0] / 100} m, median ${sorted[balls >> 1] / 100}, worst ${sorted[balls - 1] / 100}`);
    assert.ok(jumps >= balls * 8, `${jumps} jumps`);
    assert.ok(share > 0.05 && share < 0.45, `${st.wet} of ${jumps} in the sea`);
    assert.ok(sorted[0] > 2800 && sorted[balls - 1] > 1000 && sorted[0] > sorted[balls - 1] + 100, `bests ${sorted[0]} to ${sorted[balls - 1]}`);
    assert.ok(st.isl[2] + st.isl[3] + st.isl[4] > 0 && st.isl[1] > 0, `islands ${st.isl}`);
    [...Array(balls).keys()].forEach((p) => assert.equal(Math.round(slotOf(view, p).best * 100), st.scores[p], 'the slot\'s best its score'));
    st.scores.forEach((s, p) => assert.equal(st.places[p], 1 + st.scores.filter((o) => o > s).length, 'placed by score'));
    assert.ok(st.pts.every((x) => x >= 1 && x <= 10) && st.pts.includes(10), `points ${st.pts}`);
    const parsed = parseLog(log);
    const n = Math.min(ticks, st.over + 50);
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('a tick of 256 balls, AI balls jumping off 32 runways, on the release build', async (t) => {
  const g = await room(256, { debug: false, seed: 5 });
  const bots = Array.from({ length: 256 }, (_, p) => new Partier(p, 5, 0.3 + 0.6 * ((p * 5) % 256) / 256));
  let ms = 0, n = 0, think = 0;
  const f0 = g.v.fxCount();
  let ended = 0, seen = f0;
  for (let k = 0; k < 4000 && g.v.hole().state === L.H_PLAY; k++) {
    const b0 = performance.now();
    const words = bots.map((b) => [L.EV_INPUT, b.slot, b.think(g.v, g.v.tick, 0)]);
    think += performance.now() - b0;
    g.sim.feedPlayers(words);
    const a = performance.now();
    g.sim.x.step();
    if (k >= 500) { ms += performance.now() - a; n++; }
    for (; seen < g.v.fxCount(); seen++) { const x = g.v.fx(seen); if (x.kind === MC.LJ_FX_LAND || x.kind === MC.LJ_FX_SPLASH) ended++; }
  }
  t.diagnostic(`${(ms / n).toFixed(3)} ms a tick over ${n} ticks, 256 balls (${ended} jumps ended); the bots ${(think / 4000).toFixed(2)} ms a tick`);
  assert.ok(n >= 3000 && ended >= 256 * 3, `${n} ticks timed, ${ended} jumps`);
  assert.ok(ms / n < 2, `${(ms / n).toFixed(3)} ms`);
});
