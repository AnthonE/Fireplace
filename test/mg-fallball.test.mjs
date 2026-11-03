// FALL BALL (src/mg/fallball.wat): the pitch, its goals, kerbs and cap for 1
// to 256 balls; a ball off the walls, the nets, the posts and the kerbs, off
// an open side and back in; the giant balls dropping onto marked spots and
// throwing whoever is under them out, shoved by weight (one ball barely, a
// few far), rolling and bouncing as the client's fly flies them, into a goal
// (the scorer's points and the assists) or off a side and replaced, the
// golden one worth 2, the schedule and the cap; a touch's point and a KO's;
// the end and a newcomer; the prediction bit for bit through every wall,
// kerb and fall; the client and its AI; rounds of AI balls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y, B_RAD } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/fallball.mjs'; // FA_*: the minigame's own constants
import fallball, { pitch, giants, slotOf, fly, dir, FALL_S, fallFor, kerbed } from '../client/mg/fallball.mjs';

const C = L.B_CX;
const TICK = 0.008;
const f = Math.fround;
const area = (n) => MC.FA_A0 + MC.FA_AK * Math.min(n, MC.FA_NK) + MC.FA_AK2 * Math.max(0, n - MC.FA_NK);
const capOf = (n) => Math.min(MC.FA_NMAX, Math.max(MC.FA_NMIN, 1 + Math.ceil(n / MC.FA_PER)));
const RR = 2 * Math.sqrt(B_RAD * MC.FA_R); // a ball on the floor meets a giant ball this far from its centre, level
const KERB = Math.sqrt(MC.FA_R ** 2 - (MC.FA_R - MC.FA_BH) ** 2);

// A room of n balls on Fall Ball, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_FALLBALL + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
const teams = (g, n) => { const s = Array.from({ length: n }, (_, p) => g.v.partier(p).side); return [0, 1].map((x) => s.map((y, p) => [y, p]).filter(([y]) => y === x).map(([, p]) => p)); };
// Ball p at (x, z) from the pitch's centre, on the floor (or y over it, rising vy), rolling at (vx, vz).
function put(g, p, x, z, { vx = 0, vz = 0, y = 0, vy = 0 } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, C + x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, PLAT_Y + y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, C + z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, vy, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, (g.dv.getUint8(rec(p) + L.P_FL) & L.PF_BLUE) | L.PF_LIVE | (y > 0 ? 0 : L.PF_GROUND));
}
const GA = (k) => L.PG_S + MC.FA_BALL + k * MC.FA_BSIZE;
const SA = (p) => L.PG_S + MC.FA_SLOT + p * MC.FA_SSIZE;
const H = (k) => L.PG_H + k;
const giant = (g, k) => giants(g.v).find((b) => b.k === k) || null;
// Giant ball k set: by default live, untouched, on the floor at (x, z) from the centre, still.
function setF(g, k, { st = MC.FA_LIVE, gold = 0, by = 255, last = [255, 255], ser = 900 + k, at = 0, x = 0, y = MC.FA_R, z = 0, vx = 0, vy = 0, vz = 0 }) {
  const a = GA(k), dv = g.dv;
  dv.setUint8(a + MC.FA_FST, st);
  dv.setUint8(a + MC.FA_FGOLD, gold);
  dv.setUint8(a + MC.FA_FBY, by);
  dv.setUint8(a + MC.FA_FLAST, last[0]);
  dv.setUint8(a + MC.FA_FLAST + 1, last[1]);
  dv.setUint32(a + MC.FA_FSER, ser, true);
  dv.setInt32(a + MC.FA_FAT, at, true);
  [x, y, z, vx, vy, vz].forEach((val, i) => dv.setFloat32(a + MC.FA_FX + 4 * i, val, true));
}
// No giant balls, and none to drop (the golden one dropped already), so a test has only its own.
function clear(g) {
  for (let k = 0; k <= MC.FA_NMAX; k++) g.dv.setUint8(GA(k) + MC.FA_FST, MC.FA_NONE);
  g.dv.setInt32(H(MC.FA_NEXT), 1e9, true);
  g.dv.setUint32(H(MC.FA_GOLDN), 1, true);
}
const playT = (g) => g.v.party().t;
const fxs = (v, from, kind) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
const local = (g, p) => { const b = g.v.partier(p); return { x: b.pos[0] - C, y: b.pos[1] - PLAT_Y, z: b.pos[2] - C, vx: b.vel[0], vy: b.vel[1], vz: b.vel[2], ground: b.ground, out: b.out, falling: b.falling }; };
// A room of n with no giant balls, each side's balls in a row by its own goal line's corner, still.
async function stage(n, opts) {
  const g = await room(n, opts);
  clear(g);
  const c = pitch(g.v);
  const [red, blue] = teams(g, n);
  red.forEach((p, i) => put(g, p, -c.hx + 3 + (i % 4) * 2.5, -c.hz + 2 + Math.floor(i / 4) * 2.5));
  blue.forEach((p, i) => put(g, p, c.hx - 3 - (i % 4) * 2.5, -c.hz + 2 + Math.floor(i / 4) * 2.5));
  return { g, c, red, blue };
}

test('the pitch for 1, 8, 64 and 256: sized for the crowd, half as long again as wide, wide goals, kerbs by the corners and the halfway line, the cap; each side in a grid on its own half; the kickoff ball dropping onto the centre spot as play starts', async () => {
  let last = 0;
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const c = pitch(g.v);
    assert.equal(r.game, L.MG_FALLBALL);
    assert.deepEqual([r.kind, r.len, r.flags, r.respawn], [L.PK_SCORE, MC.FA_LEN, L.PGF_BUMPS | L.PGF_TEAMS, MC.FA_DOWN]);
    assert.deepEqual([r.acc, r.idle], [f(MC.FA_ACC), f(MC.FA_IDLE)]);
    assert.ok(Math.abs(4 * c.hx * c.hz - area(n)) < 0.1 && Math.abs(c.hx / c.hz - MC.FA_ASP) < 1e-4 && c.hx > last, `${2 * c.hx} by ${2 * c.hz} m for ${n}`);
    last = c.hx;
    assert.equal(r.size, f(c.hx + MC.FA_GD));
    assert.equal(c.gw, f(Math.min(MC.FA_GWMAX, Math.max(MC.FA_GWMIN, f(c.hz * f(MC.FA_GWK))))));
    assert.ok(c.gw >= 2 * MC.FA_R && c.gw < c.hz - 3, `a mouth ${2 * c.gw} m wide, two giant balls and more`);
    assert.deepEqual([c.bx0, c.bx1], [f(c.hx * f(MC.FA_BC0)), f(c.hx * f(MC.FA_BC1))]);
    assert.equal(c.cap, capOf(n));
    assert.equal(giants(g.v).length, 0, 'nothing falls in the countdown');
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y);
      const deep = (b.pos[0] - C) * dir(b.side);
      assert.ok(deep >= MC.FA_X0 && deep <= c.hx - 2, `${n}: P${p + 1} on its own half, ${deep} m back`);
      assert.ok(Math.abs(b.pos[2] - C) <= c.hz * 0.8, `${n}: P${p + 1} well in from the sides`);
    }
    // play starts: the kickoff ball high over the centre spot, called
    const from = g.v.fxCount();
    while (g.v.hole().state !== L.H_PLAY) g.step();
    const list = giants(g.v);
    assert.equal(list.length, 1);
    assert.deepEqual([list[0].k, list[0].st, list[0].gold, list[0].x, list[0].y, list[0].z, list[0].ser], [0, MC.FA_FALL, 0, 0, MC.FA_DROPY, 0, 1]);
    const [d] = fxs(g.v, from, MC.FA_FX_DROP);
    assert.deepEqual([d.owner, d.shot, d.pos], [255, 0, [C, PLAT_Y, C]]);
    assert.ok(Math.abs(d.size - FALL_S) < 1e-4 && FALL_S > 2 && FALL_S < 2.3, `${d.size} s to come down`);
    assert.equal(pitch(g.v).next, MC.FA_ADD);
  }
});

test('a ball and the stage: off an end wall beside the mouth, into a goal\'s box held by its nets, round a post; a kerb holds it in and stands it on its top; off an open side it falls, is down FA_DOWN and drops back in on its own side', async () => {
  const { g, c, red, blue } = await stage(4);
  const p = red[0];
  const run = (word, k = 1) => { for (let i = 0; i < k; i++) g.step([[L.EV_INPUT, p, word]]); };
  // the end wall beside the mouth
  put(g, p, c.hx - 1.3, c.gw + 2.5, { vx: 8 });
  run(partyWord({ yaw: 0, move: 1 }), 80);
  let b = local(g, p);
  assert.ok(b.x <= c.hx - B_RAD + 1e-4 && b.x > c.hx - B_RAD - 0.5, `against the end wall: ${b.x}`);
  // into the mouth and the box
  put(g, p, c.hx - 3, 0.5, { vx: 9 });
  let deepest = 0;
  for (let k = 0; k < 200; k++) {
    run(partyWord({ yaw: k < 100 ? 0 : 3000, move: 1, hop: k % 40 === 20 ? 1 : 0 }));
    b = local(g, p);
    deepest = Math.max(deepest, b.x);
    assert.ok(b.x <= c.hx + MC.FA_GD - B_RAD + 1e-4, 'the back net');
    if (b.x > c.hx) assert.ok(Math.abs(b.z) <= c.gw - B_RAD + 1e-4, `the side net: ${b.z}`);
    assert.ok(!b.falling, 'a floor in the box');
  }
  assert.ok(deepest > c.hx + MC.FA_GD - B_RAD - 0.05, `into the box: ${deepest - c.hx} m`);
  // round a post
  put(g, p, c.hx - B_RAD - 0.2, c.gw + 3, { vz: -7 });
  for (let k = 0; k < 60; k++) {
    run(partyWord({ yaw: 12288, move: 1 }));
    b = local(g, p);
    assert.ok(Math.hypot(b.x - c.hx, Math.abs(b.z) - c.gw) >= B_RAD + MC.FA_FR - 1e-3, 'never in the post');
  }
  // a kerb by a corner and one by the halfway line: rolling at it, held in
  for (const x of [c.hx * 0.8, 0]) {
    assert.ok(kerbed(c, Math.abs(x)));
    put(g, p, x, c.hz - 2, { vz: 8 });
    run(partyWord({ yaw: 4096, move: 1 }), 120);
    b = local(g, p);
    assert.ok(b.z <= c.hz - B_RAD + 1e-4 && b.z > c.hz - B_RAD - 0.6 && b.ground && !b.falling, `held by the kerb: ${b.z}`);
  }
  // dropped onto a kerb's top, it stands there
  put(g, p, c.hx * 0.8, c.hz + MC.FA_BT / 2, { y: MC.FA_BH + 0.4 });
  run(partyWord({ yaw: 0, move: 0 }), 40);
  b = local(g, p);
  assert.ok(Math.abs(b.y - MC.FA_BH) < 1e-4 && b.ground, `on the kerb's top: ${b.y}`);
  // an open stretch: over the side, falling, down, and back in on its own side after FA_DOWN
  const x0 = c.hx * (MC.FA_BC0 + MC.FA_BC1) / 2;
  assert.ok(!kerbed(c, x0));
  put(g, p, x0, c.hz - 2, { vz: 8 });
  const from = g.v.fxCount();
  let k = 0;
  for (; k < 600 && !g.v.partier(p).out; k++) run(partyWord({ yaw: 4096, move: 1 }));
  assert.ok(g.v.partier(p).out, `down after ${k} ticks`);
  assert.equal(fxs(g.v, from, L.FX_SINK).filter((x) => x.owner === p).length, 1);
  const at = g.v.partier(p).outAt;
  while (g.v.partier(p).out) g.step();
  assert.equal(g.v.tick - at, MC.FA_DOWN + 1, 'down FA_DOWN');
  b = local(g, p);
  assert.ok(Math.abs(b.x - dir(0) * c.hx * MC.FA_BACK) < 1e-3 && Math.abs(b.z) <= c.hz * 0.75 + 1e-3 && b.y > 5, `back in, falling in on red's side: ${b.x}, ${b.y}, ${b.z}`);
  for (let i = 0; i < 200; i++) g.step();
  assert.ok(local(g, p).ground && !g.v.partier(p).out, 'and on the pitch');
  assert.ok(blue.length && red.length);
});

test('a drop: the giant ball comes down in about FALL_S where it was called, still across; a ball under it is thrown out at FA_SQV and up, and it lands where it fell, live', async () => {
  const { g, c, red } = await stage(4);
  const p = red[0];
  setF(g, 2, { st: MC.FA_FALL, x: 5, y: MC.FA_DROPY, z: 2 });
  put(g, p, 5.4, 2.2);
  const from = g.v.fxCount();
  let top = 0, k = 0;
  for (; k < 400 && giant(g, 2).st === MC.FA_FALL; k++) {
    g.step();
    const b = local(g, p);
    top = Math.max(top, Math.hypot(b.vx, b.vz));
    const gb = giant(g, 2);
    assert.deepEqual([gb.x, gb.z], [5, 2], 'it moves for nobody');
  }
  assert.ok(Math.abs(k * TICK - FALL_S) < 0.03, `down in ${k * TICK} s`);
  const [land] = fxs(g.v, from, MC.FA_FX_LAND);
  assert.ok(land && land.shot === 2 && land.size > MC.FA_VMAX - 1, `landed at ${land?.size} m/s`);
  assert.equal(giant(g, 2).y, MC.FA_R);
  assert.ok(top >= MC.FA_SQV - 0.2, `thrown out at ${top} m/s`);
  const b = local(g, p);
  assert.ok(Math.hypot(b.x - 5, b.z - 2) >= RR - 1e-3, `out from under it: ${Math.hypot(b.x - 5, b.z - 2)}`);
  assert.ok(c.hx > 0);
});

test('a shove: a ball rolling into a giant ball is put apart by weight and they share 1 + FA_CE of the speed they close at by weight; one ball pushing keeps it going slowly, three far faster', async () => {
  const { g, red } = await stage(8);
  const p = red[0];
  put(g, p, -RR + 0.03, 0.4, { vx: 8 });
  setF(g, 0, { x: 0, z: 0 });
  const save = g.sim.u8.slice(0, 0x100000);
  g.dv.setUint8(GA(0) + MC.FA_FST, MC.FA_NONE);
  g.step();
  const alone = local(g, p);
  g.sim.u8.set(save);
  g.step();
  const me = local(g, p), b = giant(g, 0);
  const d = Math.hypot(alone.x, alone.z), nx = alone.x / d, nz = alone.z / d;
  const over = RR - d, wp = 1, wb = 1 / MC.FA_M, w = wp + wb;
  assert.ok(over > 0);
  assert.ok(Math.abs(me.x - (alone.x + nx * over * wp / w)) < 1e-4 && Math.abs(b.x + nx * over * wb / w) < 1e-4, 'apart by weight');
  const vrel = alone.vx * nx + alone.vz * nz, j = -(1 + MC.FA_CE) * vrel / w;
  assert.ok(Math.abs(me.vx - (alone.vx + nx * j * wp)) < 1e-3 && Math.abs(b.vx + nx * j * wb) < 1e-3, `${me.vx}, ${b.vx}`);
  assert.ok(b.vx > 1.5 && b.vx < 3 && me.vx < 0, `a ram at ${alone.vx} m/s sends it ${b.vx} and comes back at ${me.vx}`);
  assert.deepEqual([b.by, b.last[0]], [p, p]);
  // pushing: one ball, then three side by side, 3 s flat out behind it toward blue's goal
  const speed = async (k) => {
    const s = await stage(8);
    setF(s.g, 0, { x: -6, z: 0 });
    const us = s.red.slice(0, k);
    us.forEach((q, i) => put(s.g, q, -6 - RR - 0.1, (i - (k - 1) / 2) * 0.5));
    for (let i = 0; i < 375; i++) s.g.step(us.map((q) => [L.EV_INPUT, q, partyWord({ yaw: 0, move: 1 })]));
    const gb = giant(s.g, 0);
    return { v: Math.hypot(gb.vx, gb.vz), x: gb.x };
  };
  const one = await speed(1), three = await speed(3);
  assert.ok(one.v > 0.8 && one.v < 3, `one ball: ${one.v.toFixed(2)} m/s`);
  assert.ok(three.v > 2 * one.v && three.x - one.x > 4, `one: ${one.v.toFixed(2)} m/s; three: ${three.v.toFixed(2)} m/s, ${(three.x - one.x).toFixed(1)} m further`);
});

test('a giant ball rolls and bounces: FA_ROLL and FA_FRIC to rest; off an end wall, a kerb, a post and a goal\'s net; the client\'s fly the same bits all the way, into a goal and off an open side', async () => {
  const { g, c } = await stage(2);
  const run = (b0, n, until) => {
    clear(g);
    setF(g, 0, b0);
    let x = giant(g, 0);
    for (let k = 0; k < n; k++) {
      g.step();
      x = fly(x, c, 1);
      const y = giant(g, 0);
      if (y.st !== MC.FA_LIVE) { assert.ok(x.goal !== undefined || x.lost, `fly saw it go on the same tick (${k})`); return { gone: true, x }; }
      assert.ok(x.goal === undefined && !x.lost, `${k}: still in play`);
      assert.deepEqual([x.x, x.y, x.z, x.vx, x.vy, x.vz], [y.x, y.y, y.z, y.vx, y.vy, y.vz], `${k + 1} ticks on, the same bits`);
      if (until && until(y)) break;
    }
    return { gone: false, x: giant(g, 0) };
  };
  // to rest
  let r = run({ x: -10, z: 0, vx: 4, vz: 0.5 }, 700);
  assert.ok(r.x.vx === 0 && r.x.vz === 0 && r.x.x > -6 && r.x.x < -3, `at rest at ${r.x.x}`);
  // the end wall beside the mouth
  r = run({ x: c.hx - 6, z: c.gw + 4, vx: 10 }, 120);
  assert.ok(r.x.vx < 0 && r.x.x <= c.hx - MC.FA_R, `back off the wall at ${r.x.vx}`);
  // a kerb
  r = run({ x: c.hx * 0.8, z: c.hz - 6, vz: 9 }, 150);
  assert.ok(r.x.vz < 0 && r.x.z <= c.hz - KERB + 1e-4, `back off the kerb at ${r.x.vz}`);
  // a post
  r = run({ x: c.hx - 5, z: c.gw + 1, vx: 8, vz: -0.5 }, 150);
  assert.ok(r.x.x < c.hx, 'off the post');
  // a goal's side net
  r = run({ x: c.hx + 2, z: 0, vz: 7 }, 150);
  assert.ok(r.x.vz <= 0 && r.x.z <= c.gw - MC.FA_R + 1e-4);
  // into a goal, and off an open side
  r = run({ x: c.hx - 8, z: 1, vx: 9 }, 400);
  assert.ok(r.gone && r.x.goal === 0, 'red\'s goal');
  r = run({ x: c.hx * 0.35, z: c.hz - 5, vz: 8 }, 600);
  assert.ok(r.gone && r.x.lost, 'over the side and lost');
});

test('off a side: a giant ball over an open side falls and is lost FA_LOSTY down, its last toucher named; FA_REDROP later a new one drops into its record, in the drop zone, clear of the others', async () => {
  const { g, c, red } = await stage(8);
  setF(g, 3, { x: c.hx * 0.35, z: c.hz - 4, vz: 8, by: red[1], last: [red[1], 255] });
  setF(g, 1, { x: -6, z: -3 });
  const from = g.v.fxCount();
  let k = 0;
  for (; k < 600 && giant(g, 3).st === MC.FA_LIVE; k++) g.step();
  const gone = g.v.tick;
  assert.equal(giant(g, 3).st, MC.FA_WAIT);
  const [lost] = fxs(g.v, from, MC.FA_FX_LOST);
  assert.deepEqual([lost.owner, lost.shot], [red[1], 3]);
  assert.equal(pitch(g.v).lost, 1);
  while (giant(g, 3).st === MC.FA_WAIT) g.step();
  assert.equal(g.v.tick - gone, MC.FA_REDROP);
  const b = giant(g, 3);
  assert.deepEqual([b.st, b.ser], [MC.FA_FALL, 2]);
  assert.ok(b.y < MC.FA_DROPY && b.y > MC.FA_DROPY - 0.01, 'dropped, and a tick down');
  assert.ok(Math.abs(b.x) <= c.hx * MC.FA_DROPK + 1e-4 && Math.abs(b.z) <= c.hz - MC.FA_DROPM + 1e-4, `in the zone: ${b.x}, ${b.z}`);
  assert.ok(Math.hypot(b.x + 6, b.z + 3) >= MC.FA_SEP, 'clear of the other');
  const [d] = fxs(g.v, from, MC.FA_FX_DROP);
  assert.deepEqual([d.shot, d.pos], [3, [f(C + b.x), PLAT_Y, f(C + b.z)]]);
});

test('a goal: all the way into blue\'s goal is red\'s, FA_PT_GOAL to red\'s last toucher and FA_PT_ASSIST to red balls whose last touch was on it in FA_ASSISTT; one red never touched is red\'s, nobody\'s points; replaced FA_REDROP on', async () => {
  const { g, c, red, blue } = await stage(8);
  const [a, b, d] = red, [e] = blue;
  const t0 = playT(g);
  setF(g, 0, { x: c.hx - 4, z: 1, vx: 8, by: e, last: [a, e], ser: 77 });
  g.dv.setUint32(SA(b) + MC.FA_LASTB, 77, true);
  g.dv.setUint32(SA(b) + MC.FA_LASTT, t0, true);
  g.dv.setUint32(SA(d) + MC.FA_LASTB, 77, true);
  g.dv.setUint32(SA(d) + MC.FA_LASTT, t0 - MC.FA_ASSISTT, true);
  g.dv.setUint32(SA(e) + MC.FA_LASTB, 77, true);
  g.dv.setUint32(SA(e) + MC.FA_LASTT, t0, true);
  const score = (p) => g.v.partier(p).score;
  const s0 = [a, b, d, e].map(score);
  const from = g.v.fxCount();
  for (let k = 0; k < 200 && !fxs(g.v, from, MC.FA_FX_GOAL).length; k++) g.step();
  const [x] = fxs(g.v, from, MC.FA_FX_GOAL);
  assert.deepEqual([x.owner, x.shot, x.size], [a, 0, 1]);
  assert.deepEqual(g.v.party().tscore, [1, 0]);
  assert.deepEqual([a, b, d, e].map(score).map((v, i) => v - s0[i]), [MC.FA_PT_GOAL, MC.FA_PT_ASSIST, 0, 0], 'the scorer, the assist; a touch too old, a foe nothing');
  assert.deepEqual([slotOf(g.v, a).goals, slotOf(g.v, b).assists], [1, 1]);
  assert.equal(giant(g, 0).st, MC.FA_WAIT);
  assert.equal(pitch(g.v).goals, 1);
  // into red's own goal, touched by blue only: blue's goal, nobody's
  setF(g, 1, { x: -c.hx + 4, z: -1, vx: -8, by: e, last: [255, e] });
  const f1 = g.v.fxCount();
  for (let k = 0; k < 200 && !fxs(g.v, f1, MC.FA_FX_GOAL).length; k++) g.step();
  const [y] = fxs(g.v, f1, MC.FA_FX_GOAL);
  assert.deepEqual([y.owner, y.shot], [e, 1 | 256]);
  setF(g, 2, { x: -c.hx + 4, z: -1, vx: -8, by: a, last: [a, 255] });
  const f2 = g.v.fxCount();
  for (let k = 0; k < 200 && !fxs(g.v, f2, MC.FA_FX_GOAL).length; k++) g.step();
  const [z] = fxs(g.v, f2, MC.FA_FX_GOAL);
  assert.deepEqual([z.owner, z.shot], [255, 2 | 256 | 1024], 'blue never touched it: nobody\'s');
  assert.deepEqual(g.v.party().tscore, [1, 2]);
  // replaced
  while (giant(g, 0).st === MC.FA_WAIT) g.step();
  assert.equal(giant(g, 0).st, MC.FA_FALL);
});

test('the golden ball: at FA_GOLDT it drops near the centre spot past the cap, called; into a goal it is worth FA_GOLDV and FA_GOLDV times FA_PT_GOAL, and gone for good', async () => {
  const { g, c, red } = await stage(4);
  g.dv.setUint32(H(MC.FA_GOLDN), 0, true);
  // the clock on to just short of it
  g.dv.setUint32(L.HDR_START, g.v.tick - (MC.FA_GOLDT - 1), true);
  for (let k = 0; k < 2; k++) setF(g, k, { x: -8 + 16 * k, z: 4 });
  const from = g.v.fxCount();
  g.step();
  assert.equal(giant(g, MC.FA_NMAX), null);
  g.step();
  const gb = giant(g, MC.FA_NMAX);
  assert.ok(gb && gb.gold === 1 && gb.st === MC.FA_FALL && Math.abs(gb.x) <= 3 && Math.abs(gb.z) <= 3, 'the golden one, near the centre spot');
  assert.equal(giants(g.v).filter((b) => b.st !== MC.FA_NONE).length, c.cap + 1, 'past the cap');
  const [d] = fxs(g.v, from, MC.FA_FX_DROP);
  assert.equal(d.shot, MC.FA_NMAX | 256);
  const fctx = { slot: red[0], view: g.v, glow: () => {}, banners: [], banner(s) { this.banners.push(s); }, feed: () => {}, name: (q) => `P${q + 1}` };
  fallball.fx(d, fctx);
  assert.deepEqual(fctx.banners, [`GOLDEN BALL  WORTH ${MC.FA_GOLDV}`]);
  setF(g, MC.FA_NMAX, { gold: 1, x: c.hx - 4, z: 0, vx: 9, last: [red[1], 255] });
  const s0 = g.v.partier(red[1]).score;
  const f1 = g.v.fxCount();
  for (let k = 0; k < 200 && !fxs(g.v, f1, MC.FA_FX_GOAL).length; k++) g.step();
  const [x] = fxs(g.v, f1, MC.FA_FX_GOAL);
  assert.deepEqual([x.owner, x.shot, x.size], [red[1], MC.FA_NMAX | 512, MC.FA_GOLDV]);
  assert.deepEqual(g.v.party().tscore, [MC.FA_GOLDV, 0]);
  assert.equal(g.v.partier(red[1]).score - s0, MC.FA_GOLDV * MC.FA_PT_GOAL);
  for (let k = 0; k < MC.FA_REDROP + 50; k++) g.step();
  assert.equal(giant(g, MC.FA_NMAX), null, 'gone for good');
});

test('the schedule: the kickoff ball, then one every FA_ADD while fewer than the cap are in play, each in the drop zone and FA_SEP from the rest; never more than the cap', async () => {
  const g = await room(16, { seed: 3 });
  const c = pitch(g.v);
  assert.equal(c.cap, 3);
  const drops = [];
  let most = 0;
  for (let k = 0; k < 4 * MC.FA_ADD + 10; k++) {
    const f0 = g.v.fxCount();
    g.step();
    for (const d of fxs(g.v, f0, MC.FA_FX_DROP)) drops.push({ t: d.tick - g.v.hole().start, x: d.pos[0] - C, z: d.pos[2] - C });
    most = Math.max(most, giants(g.v).length);
  }
  assert.deepEqual(drops.map((d) => d.t), [MC.FA_ADD, 2 * MC.FA_ADD], 'the kickoff\'s came as play started; then one every FA_ADD up to the cap');
  assert.equal(most, 3);
  for (const d of drops) {
    assert.ok(Math.abs(d.x) <= c.hx * MC.FA_DROPK + 1e-4 && Math.abs(d.z) <= c.hz - MC.FA_DROPM + 1e-4, `in the zone: ${d.x}, ${d.z}`);
  }
  // with every one still in play, the next waits till one goes
  setF(g, 1, { x: c.hx * 0.35, z: c.hz - 4, vz: 9 });
  let k = 0;
  for (; k < 2000 && giant(g, 1).st !== MC.FA_FALL; k++) g.step();
  assert.ok(k < 2000 && giants(g.v).length === 3, 'replaced, still 3');
  const list = giants(g.v);
  for (const a of list) for (const b of list) if (a.k < b.k && a.st === MC.FA_FALL) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= MC.FA_SEP, 'clear of the rest');
});

test('points of a ball\'s own: a touch once a FA_RECOUNT however long it pushes; a foe bumped off an open side is FA_PT_KO and a KO to the bumper', async () => {
  const { g, c, red, blue } = await stage(4);
  const p = red[0];
  setF(g, 0, { x: -8, z: 0 });
  put(g, p, -8 - RR - 0.1, 0);
  const s0 = g.v.partier(p).score;
  for (let k = 0; k < 3 * MC.FA_RECOUNT - 20; k++) g.step([[L.EV_INPUT, p, partyWord({ yaw: 0, move: 1 })]]);
  assert.equal(slotOf(g.v, p).touches, 3);
  assert.equal(g.v.partier(p).score - s0, 3 * MC.FA_PT_TOUCH);
  // blue rams red off an open side
  clear(g);
  const x0 = c.hx * 0.35;
  put(g, red[1], x0, c.hz - 1.3);
  put(g, blue[0], x0, c.hz - 4.5, { vz: 9 });
  const k0 = g.v.partier(blue[0]).kos, b0 = g.v.partier(blue[0]).score;
  for (let k = 0; k < 600 && !g.v.partier(red[1]).out; k++) g.step([[L.EV_INPUT, blue[0], partyWord({ yaw: 4096, move: 1 })], [L.EV_INPUT, red[1], partyWord({ yaw: 0, move: 0 })]]);
  assert.ok(g.v.partier(red[1]).out, 'knocked off');
  assert.equal(g.v.partier(blue[0]).kos - k0, 1);
  assert.equal(g.v.partier(blue[0]).score - b0, MC.FA_PT_KO);
  assert.equal(slotOf(g.v, blue[0]).kos, 1);
});

test('the end: at the clock the side with more goals wins, every ball of it 1st and the rest by their own score; level is a draw, placed by score; a newcomer in play takes the smaller side and drops in on it', async () => {
  for (const [ts, twin] of [[[3, 1], 1], [[2, 2], 3]]) {
    const { g, red, blue } = await stage(6, { seed: 11 });
    g.dv.setUint32(L.PG_TSCORE, ts[0], true);
    g.dv.setUint32(L.PG_TSCORE + 4, ts[1], true);
    blue.forEach((p, i) => g.dv.setUint16(rec(p) + L.PG_SCORE, 10 - i, true));
    red.forEach((p, i) => g.dv.setUint16(rec(p) + L.PG_SCORE, 5 - i, true));
    g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 2, true);
    for (let k = 0; k < 4; k++) g.step();
    assert.equal(g.v.hole().state, L.H_OVER);
    assert.equal(g.v.party().twin, twin);
    if (twin === 1) {
      red.forEach((p) => assert.equal(g.v.partier(p).place, 1));
      assert.deepEqual(blue.map((p) => g.v.partier(p).place), [4, 5, 6]);
    } else assert.deepEqual([...blue, ...red].map((p) => g.v.partier(p).place), [1, 2, 3, 4, 5, 6]);
  }
  const { g, c } = await stage(3);
  g.step([[L.EV_JOIN, 3]]);
  const b = g.v.partier(3);
  assert.equal(b.side, 1, 'the smaller side');
  assert.ok(Math.abs(b.pos[0] - C - c.hx * MC.FA_BACK) < 1e-3 && b.pos[1] > PLAT_Y + 5, 'dropping in on blue\'s side');
});

test('the prediction matches the confirmed ball bit for bit: the end walls, a post, a goal\'s box and nets, the kerbs, hops, and off an open side down to its fall', async () => {
  const { g, c } = await stage(4);
  const s = g.v.partier(0).side, tn = -dir(s);
  // round the goal it attacks: walls, post, box, nets
  put(g, 0, tn * (c.hx - 4), c.gw - 0.6);
  const toGoal = s ? 8192 : 0;
  const words = Array.from({ length: 300 }, (_, k) => partyWord({ yaw: (toGoal + (k < 120 ? 0 : k * 157)) & 16383, move: k % 50 < 44 ? 1 : 0, hop: k % 37 === 5 ? 1 : 0 }));
  assert.ok(predicted(g, words) >= words.length);
  // along a kerb, into it and hopping at it
  put(g, 0, tn * c.hx * 0.8, c.hz - 3);
  const kerb = Array.from({ length: 300 }, (_, k) => partyWord({ yaw: (4096 + (k % 90 < 45 ? 600 : -600)) & 16383, move: 1, hop: k % 29 === 3 ? 1 : 0 }));
  assert.ok(predicted(g, kerb) >= kerb.length);
  // off an open side: rolling over it and falling, up to the tick before the confirmed world puts it down
  put(g, 0, tn * c.hx * 0.35, c.hz - 3);
  const off = Array.from({ length: 230 }, (_, k) => partyWord({ yaw: 4096, move: 1, hop: k === 10 ? 1 : 0 }));
  assert.ok(predicted(g, off) >= off.length);
  const b = local(g, 0);
  assert.ok(b.falling && !b.out && b.z > c.hz, `over the side and falling: ${b.y}`);
});

test('the client: the pitch, kerbs, walls and goals; a giant ball dropping with its ring, one rolling, flown on; its HUD and feed; danger off an open side and under a drop; the AI\'s jobs, and a red ball alone pushes a giant ball into blue\'s goal', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const { g, c, red, blue } = await stage(16);
  setF(g, 0, { x: 3, z: 1, vx: 2 });
  setF(g, 1, { st: MC.FA_FALL, x: -6, y: 20, z: 5, vy: -8 });
  g.step();
  const out = () => ({ scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null });
  const o = out();
  const g0 = g.v.party();
  fallball.draw(g.v, { tick: g0.tick, t: g0.t * TICK, dt: 0, ptick: g0.tick + 6, now: 0, slot: red[0], pme: g.v.partier(red[0]) }, o);
  for (let k = 0; k < o.scene.count * 16; k++) assert.ok(Number.isFinite(o.scene.data[k]), 'finite');
  assert.ok(o.scene.count > 40, `the pitch, its kerbs, walls, goals and giant balls: ${o.scene.count}`);
  assert.equal(o.casters.length, 2);
  assert.equal(o.decals.filter((d) => d.kind === 0 && d.radius > MC.FA_R).length, 1 + 1, 'the centre circle, and the drop\'s ring');
  const lines = [];
  const hctx = { put: () => {}, centre: (y, s) => lines.push(s), right: (y, s) => lines.push(s), rect: () => {}, rows: 44, C: {}, slot: red[1], now: 0, t: g0.t * TICK };
  fallball.hud(g.v, hctx);
  assert.ok(lines.some((l) => l.startsWith('BALLS 2')) && lines.some((l) => l.startsWith('TOUCHES')), lines.join(' | '));
  for (const l of [...lines, fallball.hint, fallball.rules, `GOLDEN BALL  WORTH ${MC.FA_GOLDV}`]) assert.ok(l.length <= 70 && /^[ -_]*$/.test(l), l);
  assert.equal(fallball.frame(g.v).shape, 'square');
  assert.deepEqual([fallball.facing(g.v, red[0]), fallball.facing(g.v, blue[0])], [0, Math.PI]);
  const fctx = { slot: red[0], view: g.v, glow: () => {}, banner: () => {}, feed: (s) => lines.push(s), name: (q) => `P${q + 1}`, dist: 0 };
  fallball.fx({ kind: MC.FA_FX_GOAL, owner: red[2], shot: 0, pos: [C, PLAT_Y, C], size: 3 }, fctx);
  assert.equal(lines.at(-1), `RED SCORES 3  P${red[2] + 1}`);
  fallball.fx({ kind: MC.FA_FX_GOAL, owner: 255, shot: 256 | 1024 | 512, pos: [C, PLAT_Y, C], size: 4 }, fctx);
  assert.equal(lines.at(-1), 'BLUE SCORES 4  GOLDEN  UNTOUCHED');
  fallball.fx({ kind: MC.FA_FX_LOST, owner: 255, shot: 0, pos: [C, PLAT_Y, C], size: 0 }, fctx);
  assert.equal(lines.at(-1), 'A BALL FELL OFF');
  // danger: off an open side, near it, by a kerb; under the drop as it comes down, not long before
  const dz = fallball.brain.danger;
  const x0 = c.hx * 0.35;
  assert.deepEqual([dz(g.v, C + x0, C + c.hz - 0.3, g.v.tick), dz(g.v, C + x0, C + c.hz - 1.5, g.v.tick), dz(g.v, C + x0, C, g.v.tick), dz(g.v, C + c.hx * 0.8, C + c.hz - 0.3, g.v.tick)], [1, 0.3, 0, 0]);
  const land = g.v.tick + Math.round(fallFor(20 - MC.FA_R, 8) / TICK);
  assert.equal(dz(g.v, C - 6, C + 5, land - 5), 1);
  assert.equal(dz(g.v, C - 6, C + 5, land - 200), 0);
  // the jobs: a keeper a side, backs and forwards on the giant balls
  const jobs = new Map();
  for (const p of [...red, ...blue]) {
    const me = g.v.partier(p);
    const goal = fallball.brain.goal(g.v, me, { slot: p, skill: 0.8, mem: {}, pos: [me.pos[0], me.pos[2]], vel: [me.vel[0], me.vel[2]] });
    assert.ok(goal && Number.isFinite(goal[0]) && Number.isFinite(goal[1]));
    assert.ok(Math.abs(goal[0] - C) <= c.hx && Math.abs(goal[1] - C) <= c.hz - 1.2, 'on the pitch');
    jobs.set(p, g.v._fa.job.get(p).role);
  }
  for (const side of [red, blue]) {
    assert.equal(side.filter((p) => jobs.get(p) === 'keep').length, 1, 'a keeper');
    assert.ok(side.filter((p) => jobs.get(p) === 'push').length >= 5, 'the rest on the giant balls');
  }
  // a red ball alone gets behind a giant ball and pushes it into blue's goal
  const k2 = await stage(2, { seed: 5 });
  const [att] = k2.red;
  const [idle] = k2.blue;
  put(k2.g, idle, -k2.c.hx + 3, -k2.c.hz + 2);
  put(k2.g, att, k2.c.hx * 0.3, -6);
  setF(k2.g, 0, { x: -2, z: 3 });
  const bot = new Partier(att, 5, 0.9);
  const from = k2.g.v.fxCount();
  let k = 0;
  for (; k < 6000 && !fxs(k2.g.v, from, MC.FA_FX_GOAL).length; k++) k2.g.step([[L.EV_INPUT, att, bot.think(k2.g.v, k2.g.v.tick, 0)]]);
  const [gl] = fxs(k2.g.v, from, MC.FA_FX_GOAL);
  assert.ok(gl && gl.owner === att && ((gl.shot >> 8) & 1) === 0, `scored in ${(k * TICK).toFixed(1)} s`);
  assert.ok(!k2.g.v.partier(att).out, 'and never fell');
});

// A round of AI balls (client/party-bot.mjs) steered by this minigame's brain on the debug build, stats from it.
async function aiRound(balls, ticks, seed) {
  const stats = { start: -1, over: -1, goals: [0, 0], gold: 0, drops: 0, lands: 0, lost: 0, downs: 0, places: null, twin: 0 };
  let seen = 0;
  const r = await playParty({ bytes: partyBytes(true), mg: L.MG_FALLBALL, bots: balls, ticks, seed, onTick: (t, sim, v) => {
    const g = v.party();
    for (; seen < v.fxCount(); seen++) {
      const x = v.fx(seen);
      if (stats.over >= 0 || stats.start < 0) continue;
      if (x.kind === MC.FA_FX_GOAL) { stats.goals[(x.shot >> 8) & 1] += x.shot & 512 ? MC.FA_GOLDV : 1; if (x.shot & 512) stats.gold++; }
      if (x.kind === MC.FA_FX_DROP) stats.drops++;
      if (x.kind === MC.FA_FX_LAND) stats.lands++;
      if (x.kind === MC.FA_FX_LOST) stats.lost++;
      if (x.kind === L.FX_SINK) stats.downs++;
    }
    if (stats.start < 0 && g.state === L.H_PLAY) stats.start = t;
    if (stats.over < 0 && stats.start >= 0 && g.state === L.H_OVER) {
      stats.over = t;
      stats.twin = g.twin;
      stats.tscore = g.tscore;
      stats.places = [...Array(balls).keys()].map((p) => v.partier(p).place);
      stats.sides = [...Array(balls).keys()].map((p) => v.partier(p).side);
    }
  } });
  return { ...r, stats };
}

for (const [balls, ticks, seed, goals] of [[8, 16200, 5, 3], [64, 16200, 4, 8]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, giant balls dropped to the cap and pushed into goals, the clock ends it; equal on 1 and 4 threads`, async () => {
    const { log, sim, stats, games } = await aiRound(balls, ticks, seed);
    assert.equal(sim.error().code, 0);
    assert.ok(games.every((x) => x === L.MG_FALLBALL));
    assert.ok(stats.over > 0, 'the round ended');
    const secs = (stats.over - stats.start) * TICK;
    assert.ok(Math.abs(secs - MC.FA_LEN * TICK) < 0.05, `${secs.toFixed(1)} s of play`);
    assert.ok(stats.drops >= capOf(balls) + 1 && stats.lands >= stats.drops - 1, `${stats.drops} drops, ${stats.lands} landed`);
    assert.ok(stats.goals[0] + stats.goals[1] >= goals, `goals ${stats.goals}, ${stats.lost} lost, ${stats.downs} down`);
    assert.deepEqual(stats.tscore, stats.goals);
    if (stats.twin !== 3) stats.sides.forEach((s, p) => assert.equal(stats.places[p] === 1, s === stats.twin - 1, `P${p + 1}: the winners share 1st`));
    const parsed = parseLog(log);
    const n = stats.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}
