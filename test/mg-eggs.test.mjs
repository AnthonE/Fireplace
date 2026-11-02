// EGG RAID (src/mg/eggs.wat): the yard, its nests and the pile for 1 to 256
// balls, each side on its own half; the fence and the nests' floors for a
// ball; a take, one egg at a time, the nearest ball; a carrier's slowdown;
// laying and stealing; an egg knocked loose by a hard bump from a foe and by
// a blast, never by a soft one or by a carrier's own charge; a loose egg's
// slide off the fence and out of a nest, and the client's slide the same
// bits; the golden eggs; bumper's power-ups from the sky, and a ROCKET taken
// from one knocking an egg loose; the end by the nests' value and a draw; a
// newcomer in play and a ball alone; the prediction bit for bit through the
// fence, the nests, the slowdown, a DASH and a SPRING; the client and its AI,
// power-ups drawn and spent; rounds of AI balls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y, B_RAD } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/eggs.mjs'; // EG_*: the minigame's own constants
import eggs, { yard, eggs as eggList, slotOf, slide, nestAt, carried, goldAt, dir } from '../client/mg/eggs.mjs';

const C = L.B_CX;
const TICK = 0.008;
const f = Math.fround;
const area = (n) => MC.EG_A0 + MC.EG_AK * Math.min(n, MC.EG_NK) + MC.EG_AK2 * Math.max(0, n - MC.EG_NK);
const neggs = (n) => Math.min(MC.EG_NMAX, Math.max(MC.EG_NMIN, n));

// A room of n balls on Egg Raid, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_EGGS + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
const teams = (g, n) => { const s = Array.from({ length: n }, (_, p) => g.v.partier(p).side); return [0, 1].map((x) => s.map((y, p) => [y, p]).filter(([y]) => y === x).map(([, p]) => p)); };
// Ball p at (x, z) from the yard's centre, on the floor (or y over it), rolling at (vx, vz).
function put(g, p, x, z, { vx = 0, vz = 0, y = 0 } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, C + x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, PLAT_Y + y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, C + z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, (g.dv.getUint8(rec(p) + L.P_FL) & L.PF_BLUE) | L.PF_LIVE | (y > 0 ? 0 : L.PF_GROUND));
}
const EA = (k) => L.PG_S + MC.EG_EGG + k * MC.EG_ESIZE;
// Egg k set: by default loose, anyone's, at (x, z) from the centre, still.
function setE(g, k, { st = MC.EG_FREE, by = 255, side = 0, v = 1, at = 0, x = 0, z = 0, vx = 0, vz = 0 } = {}) {
  const a = EA(k), dv = g.dv;
  dv.setUint8(a + MC.EG_EST, st);
  dv.setUint8(a + MC.EG_EBY, by);
  dv.setUint8(a + MC.EG_ESIDE, side);
  dv.setUint8(a + MC.EG_EV, v);
  dv.setInt32(a + MC.EG_EAT, at, true);
  [C + x, C + z, vx, vz].forEach((val, i) => dv.setFloat32(a + MC.EG_EX + 4 * i, val, true));
}
// Ball p carrying egg k.
function carry(g, p, k, v = 1) {
  setE(g, k, { st: MC.EG_HELD, by: p, v });
  g.dv.setUint32(rec(p) + L.PG_M, k + 1, true);
}
const egg = (g, k) => eggList(g.v)[k];
const OA = (k) => L.PG_S + MC.EG_ORBS + 16 * k;
// Power-up k of kind, lying on the floor at (x, z) from the centre (ticks left), or falling at y over it.
function setO(g, k, kind, x, z, { y = 0, life = MC.EG_ORBLIFE } = {}) {
  const a = OA(k), dv = g.dv;
  [C + x, PLAT_Y + (y || 0.6), C + z].forEach((v, i) => dv.setFloat32(a + 4 * i, v, true));
  dv.setUint8(a + 12, kind);
  dv.setUint8(a + 13, y ? 1 : 2);
  dv.setUint16(a + 14, y ? 0 : life, true);
}
const orb = (g, k) => ({ kind: g.v.u8[OA(k) + 12], st: g.v.u8[OA(k) + 13], y: g.dv.getFloat32(OA(k) + 4, true) - PLAT_Y, life: g.dv.getUint16(OA(k) + 14, true) });
// No drop till tick into play t.
const hold = (g, t = 1e6) => g.dv.setUint32(L.PG_H + MC.EG_DROP, t, true);
// Every egg out of play (the golden ones too, till theirs lands), so a test has only its own.
const clear = (g) => { for (let k = 0; k < MC.EG_NMAX + MC.EG_NGOLD; k++) g.dv.setUint8(EA(k) + MC.EG_EST, MC.EG_NONE); };
const fxs = (v, from, kind) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
const local = (g, p) => { const b = g.v.partier(p); return { x: b.pos[0] - C, z: b.pos[2] - C, vx: b.vel[0], vz: b.vel[2], sp: Math.hypot(b.vel[0], b.vel[2]) }; };
const yawTo = (g, p, x, z) => { const b = g.v.partier(p); return Math.round(Math.atan2(C + z - b.pos[2], C + x - b.pos[0]) / (2 * Math.PI) * 16384) & 16383; };
// A room of n with no eggs in play, each side's balls in a row against the fence on its own half, still.
async function stage(n, opts) {
  const g = await room(n, opts);
  clear(g);
  const c = yard(g.v);
  const [red, blue] = teams(g, n);
  red.forEach((p, i) => put(g, p, -4 - (i % 6) * 2.5, -c.hz + 1.5 + Math.floor(i / 6) * 2.5));
  blue.forEach((p, i) => put(g, p, 4 + (i % 6) * 2.5, -c.hz + 1.5 + Math.floor(i / 6) * 2.5));
  return { g, c, red, blue };
}

test('the yard for 1, 8, 64 and 256: a rounded rectangle sized for the crowd, a nest near each end, an egg for every ball (10 to 128) piled in the middle, four golden ones to come; each side in rows on its own half', async () => {
  let last = 0;
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const c = yard(g.v);
    assert.equal(r.game, L.MG_EGGS);
    assert.deepEqual([r.kind, r.len, r.flags], [L.PK_SCORE, MC.EG_LEN, L.PGF_BUMPS | L.PGF_TEAMS]);
    assert.ok(Math.abs(4 * c.hx * c.hz - area(n)) < 0.05 && Math.abs(c.hx / c.hz - MC.EG_ASP) < 1e-4 && c.hx > last, `${2 * c.hx} by ${2 * c.hz} m for ${n}`);
    last = c.hx;
    assert.equal(r.size, c.hx);
    assert.equal(c.cr, f(Math.min(MC.EG_RC, c.hz / 2)));
    assert.ok(Math.abs(c.nr - (MC.EG_NR0 + MC.EG_NRK * Math.sqrt(n))) < 1e-4 && Math.abs(c.nx - (c.hx - MC.EG_NIN - c.nr)) < 1e-4);
    assert.ok(c.nx - c.nr > c.pr + 4, 'the nests well clear of the pile');
    assert.equal(c.ne, neggs(n));
    const list = eggList(g.v);
    assert.equal(list.length, neggs(n) + MC.EG_NGOLD);
    for (const e of list.slice(0, c.ne)) {
      assert.deepEqual([e.st, e.by, e.v], [MC.EG_FREE, 255, 1]);
      assert.ok(Math.hypot(e.x - C, e.z - C) < c.pr, 'in the pile');
    }
    for (const e of list.slice(c.ne)) assert.deepEqual([e.st, e.v], [MC.EG_NONE, MC.EG_GOLDV]);
    assert.deepEqual(r.tn, [Math.ceil(n / 2), Math.floor(n / 2)]);
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y);
      const deep = (b.pos[0] - C) * dir(b.side);
      assert.ok(deep >= c.pr + MC.EG_FRONT - 1e-4 && deep < c.nx - c.nr - 2, `${n}: P${p + 1} on its own half, between the pile and its nest: ${deep}`);
      assert.ok(Math.abs(b.pos[2] - C) <= c.hz - B_RAD - 0.5, `${n}: P${p + 1} inside the fence`);
    }
  }
});

test('the fence and the nests: a ball comes off a side, an end and a rounded corner softly, never through; a nest\'s floor rolls any ball out, one pushing in too, but not one in the air', async () => {
  const { g, c, red, blue } = await stage(2);
  const p = red[0];
  const run = (word, k = 1) => { for (let i = 0; i < k; i++) g.step([[L.EV_INPUT, p, word]]); };
  put(g, p, 0, c.hz - 1.3, { vz: 8 });
  run(partyWord({ yaw: 4096, move: 1 }), 80);
  let b = local(g, p);
  assert.ok(b.z <= c.hz - B_RAD + 1e-4 && b.z > c.hz - B_RAD - 0.5, `against the side: ${b.z}`);
  put(g, p, 0, 0, { vx: 9 });
  run(partyWord({ yaw: 0, move: 1 }), 20);
  put(g, p, c.hx - 1.03, 2, { vx: 8 });
  run(partyWord({ yaw: 0, move: 0 }), 1);
  b = local(g, p);
  assert.ok(b.x <= c.hx - B_RAD + 1e-4 && b.vx < 0 && b.vx > -8 * MC.EG_PE - 0.2, `off the end softly: ${b.x}, ${b.vx}`);
  // into a corner: kept within its arc, coming off it
  put(g, p, c.hx - 4, c.hz - 4, { vx: 7, vz: 7 });
  const ix = c.hx - c.cr, iz = c.hz - c.cr;
  for (let k = 0; k < 150; k++) {
    run(partyWord({ yaw: 2048, move: 1 }));
    b = local(g, p);
    const q = Math.hypot(Math.max(0, b.x - ix), Math.max(0, b.z - iz));
    assert.ok(q <= c.cr - B_RAD + 1e-3 && b.x <= c.hx - B_RAD + 1e-4 && b.z <= c.hz - B_RAD + 1e-4, `inside the corner: ${b.x}, ${b.z}`);
  }
  // a nest's floor: red's own and blue's, pushing in at the middle from the rim, out within a second, in neither for long
  for (const [s, q] of [[0, p], [1, p], [1, blue[0]]]) {
    const [nx] = nestAt(c, s);
    for (const o of [p, blue[0]]) put(g, o, 3 * o, -c.hz + 2);
    put(g, q, nx - C, c.nr - 0.5);
    let inside = 0;
    for (let k = 0; k < 250; k++) {
      g.step([[L.EV_INPUT, q, partyWord({ yaw: yawTo(g, q, nx - C, 0), move: 1 })]]);
      const m = local(g, q);
      if (Math.hypot(m.x - (nx - C), m.z) < c.nr) inside++;
    }
    assert.ok(inside < 160, `${['red', 'blue'][s]}'s nest rolls P${q + 1} out: inside ${inside} of 250 ticks`);
    const m = local(g, q);
    assert.ok(Math.hypot(m.x - (nx - C), m.z) > c.nr - 1.2, `pushed back to its rim: ${Math.hypot(m.x - (nx - C), m.z)}`);
  }
  // in the air over a nest: no push till it lands
  const [nx] = nestAt(c, 1);
  put(g, p, nx - C + 1, 0, { y: 3 });
  g.step();
  assert.equal(local(g, p).vx, 0, 'no push in the air');
  for (let k = 0; k < 120 && !g.v.partier(p).ground; k++) g.step();
  g.step();
  assert.ok(local(g, p).vx > 0, 'on its floor, out');
});

test('a take: rolling over a loose egg carries it (PG_M); one at a time, a carrier rolls over another and leaves it; of two balls in reach, the nearer; not one high over it', async () => {
  const { g, c, red, blue } = await stage(4);
  const [p, q] = red;
  setE(g, 0, { x: 0, z: 0 });
  setE(g, 1, { x: -6, z: 0 });
  put(g, p, -2.4, 0, { vx: 4 });
  put(g, q, 1.5, 0.3);
  const f0 = g.v.fxCount();
  g.step();
  assert.equal(carried(g.v, q), 0, 'the nearer one takes it');
  assert.equal(carried(g.v, p), -1);
  const e = egg(g, 0);
  assert.deepEqual([e.st, e.by], [MC.EG_HELD, q]);
  const [x] = fxs(g.v, f0, MC.EG_FX_GET);
  assert.deepEqual([x.owner, x.shot, x.size], [q, 0, 1]);
  // q carrying rolls over egg 1 and leaves it
  put(g, q, -4, 0, { vx: -6 });
  for (let k = 0; k < 80; k++) g.step();
  assert.equal(carried(g.v, q), 0);
  assert.equal(egg(g, 1).st, MC.EG_FREE, 'one at a time');
  // high over it: left; landing on it: taken
  put(g, p, -6, 0, { y: 2.5 });
  g.step();
  assert.equal(egg(g, 1).st, MC.EG_FREE, 'out of reach over it');
  for (let k = 0; k < 150 && egg(g, 1).st === MC.EG_FREE; k++) g.step();
  assert.equal(carried(g.v, p), 1, 'taken as it comes down');
  assert.ok(g.v.partier(p).pos[1] - PLAT_Y < MC.EG_LOW);
  void blue;
});

test('a carrier rolls 15% slower: flat out 8.5 m/s where a ball carrying nothing makes 10, and it coasts to a stop sooner', async () => {
  const { g, c, red, blue } = await stage(2);
  const [p] = red, [q] = blue;
  carry(g, p, 0);
  put(g, p, -c.hx + 3, -3);
  put(g, q, -c.hx + 3, 3);
  let vp = 0, vq = 0;
  for (let k = 0; k < 600; k++) {
    g.step([[L.EV_INPUT, p, partyWord({ yaw: 0, move: k < 330 ? 1 : 0 })], [L.EV_INPUT, q, partyWord({ yaw: 0, move: k < 330 ? 1 : 0 })]]);
    if (k === 329) { vp = local(g, p).sp; vq = local(g, q).sp; }
  }
  // v = a + D v a tick, the carrier's then times EG_SLOW: 10 m/s flat out, and 8.54
  const a = 0.088, D = 0.9912, k = MC.EG_SLOW;
  const free = a * (1 - D ** 330) / (1 - D), slow = k * a * (1 - (k * D) ** 330) / (1 - k * D);
  assert.ok(Math.abs(vq - free) < 0.02 && Math.abs(vp - slow) < 0.02, `carrying ${vp.toFixed(3)} m/s (${slow.toFixed(3)}), not ${vq.toFixed(3)} (${free.toFixed(3)})`);
  const top = k * a / (1 - k * D);
  assert.ok(top / (a / (1 - D)) > 0.84 && top / (a / (1 - D)) < 0.86, `flat out ${top.toFixed(2)} m/s`);
  assert.ok(local(g, p).sp < local(g, q).sp * 0.8, 'coasting, it slows sooner');
  assert.equal(carried(g.v, p), 0, 'still carrying');
});

test('laying: a carrier rolled into its own nest lays it there, its value a point of its own and its side\'s score; into the other nest, nothing', async () => {
  const { g, c, red, blue } = await stage(4);
  const [p] = red, [q] = blue;
  carry(g, p, 3);
  carry(g, q, 4, MC.EG_GOLDV);
  const [rx] = nestAt(c, 0);
  put(g, p, rx - C + c.nr + 1.5, 0, { vx: -6 });
  // blue's carrier into red's nest: it keeps it
  put(g, q, rx - C, -c.nr - 1.5, { vz: 6 });
  const f0 = g.v.fxCount();
  for (let k = 0; k < 60 && carried(g.v, p) >= 0; k++) g.step();
  assert.equal(carried(g.v, p), -1);
  const e = egg(g, 3);
  assert.deepEqual([e.st, e.side, e.by], [MC.EG_NEST, 0, p]);
  assert.deepEqual(g.v.party().tscore, [1, 0]);
  assert.equal(g.v.partier(p).score, 1);
  assert.equal(slotOf(g.v, p).laid, 1);
  const [x] = fxs(g.v, f0, MC.EG_FX_LAY);
  assert.deepEqual([x.owner, x.shot, x.size], [p, 3, 1]);
  for (let k = 0; k < 60; k++) g.step();
  assert.equal(carried(g.v, q), 4, 'nothing laid in the other side\'s nest');
  // home, the golden one is worth 3
  const [bx] = nestAt(c, 1);
  put(g, q, bx - C - c.nr - 1.2, 0, { vx: 6 });
  for (let k = 0; k < 60 && carried(g.v, q) >= 0; k++) g.step();
  assert.deepEqual(g.v.party().tscore, [1, 3]);
  assert.equal(g.v.partier(q).score, 3);
  assert.equal(slotOf(g.v, q).gold, 1);
  assert.equal(fxs(g.v, f0, MC.EG_FX_LAY).at(-1).shot, 4 | 256 | 512);
});

test('stealing: a ball carrying nothing rolled into the other side\'s nest takes its best egg (a golden one first), a point; its own nest, or an empty one, gives nothing', async () => {
  const { g, c, red, blue } = await stage(6);
  const [p, p2, p3] = red, [q] = blue;
  setE(g, 0, { st: MC.EG_NEST, side: 1 });
  setE(g, 1, { st: MC.EG_NEST, side: 1, v: MC.EG_GOLDV });
  setE(g, 2, { st: MC.EG_NEST, side: 1 });
  setE(g, 5, { st: MC.EG_NEST, side: 0 });
  g.step();
  assert.deepEqual(g.v.party().tscore, [1, 5]);
  const [bx] = nestAt(c, 1), [rx] = nestAt(c, 0);
  put(g, p, bx - C - c.nr - 1.2, 0, { vx: 6 });
  const f0 = g.v.fxCount();
  for (let k = 0; k < 60 && carried(g.v, p) < 0; k++) g.step();
  assert.equal(carried(g.v, p), 1, 'the golden one');
  assert.deepEqual(g.v.party().tscore, [1, 2]);
  assert.equal(g.v.partier(p).score, MC.EG_PT_STEAL);
  assert.equal(slotOf(g.v, p).steals, 1);
  const [x] = fxs(g.v, f0, MC.EG_FX_GET);
  assert.deepEqual([x.owner, x.shot, x.size], [p, 1 | 256, MC.EG_GOLDV]);
  // a second raider gets the first of the rest
  put(g, p2, bx - C, c.nr + 1.2, { vz: -6 });
  for (let k = 0; k < 60 && carried(g.v, p2) < 0; k++) g.step();
  assert.equal(carried(g.v, p2), 0);
  put(g, p, 0, c.hz - 2);
  put(g, p2, 3, c.hz - 2);
  // blue's ball in its own nest takes nothing; red's in its own neither
  put(g, q, bx - C - c.nr - 1.2, 2, { vx: 6 });
  put(g, p3, rx - C + c.nr + 1.2, 2, { vx: -6 });
  for (let k = 0; k < 60; k++) g.step();
  assert.deepEqual([carried(g.v, q), carried(g.v, p3)], [-1, -1]);
  assert.deepEqual(g.v.party().tscore, [1, 1]);
});

test('knocked loose: a foe rolling into a carrier at over 5 m/s pops its egg out, sliding the way it was knocked, a point to the foe; a soft bump, or a carrier\'s own charge, keeps it; its carrier can\'t retake it for EG_REGRAB', async () => {
  const { g, c, red, blue } = await stage(4);
  const [p, p2] = red, [q, q2] = blue;
  // soft: closing 3 m/s
  carry(g, p, 0);
  put(g, p, 0, 5);
  put(g, q, -2.6, 5, { vx: 3 });
  for (let k = 0; k < 30; k++) g.step();
  assert.equal(carried(g.v, p), 0, 'a soft bump keeps it');
  // the carrier charging a still foe: it is the faster into it
  put(g, p, -4, -5, { vx: 9 });
  put(g, q, -1.3, -5);
  for (let k = 0; k < 30; k++) g.step();
  assert.ok(g.v.partier(p).bumps >= 1, 'a hard bump, the carrier\'s');
  assert.equal(carried(g.v, p), 0, 'its own charge keeps it');
  // hard: a foe at 9 m/s into a still carrier
  put(g, p, 0, 5);
  put(g, q, -2.3, 5, { vx: 9 });
  put(g, q2, 9, -9);
  g.step();
  const f0 = g.v.fxCount();
  for (let k = 0; k < 10 && carried(g.v, p) >= 0; k++) g.step();
  assert.equal(carried(g.v, p), -1, 'knocked loose');
  const e = egg(g, 0);
  assert.equal(e.st, MC.EG_FREE);
  assert.ok(e.vx > 4 && e.vx <= MC.EG_POPMAX && Math.abs(e.vz) < 1, `sliding on the way it was knocked: ${e.vx}, ${e.vz}`);
  assert.equal(e.by, p);
  const [x] = fxs(g.v, f0, MC.EG_FX_POP);
  assert.ok(x.owner === p && x.shot === q && x.size > MC.EG_HARD, JSON.stringify(x));
  assert.equal(g.v.partier(q).score, MC.EG_PT_KNOCK);
  assert.deepEqual([slotOf(g.v, q).knocks, slotOf(g.v, p).lost], [1, 1]);
  // nobody's for EG_LOCK; its carrier can't have it back for EG_REGRAB, a teammate can
  const t0 = g.v.party().t;
  put(g, q, 9, 9);
  for (let k = 0; k < 70; k++) {
    if (k >= 30) { const at = egg(g, 0); put(g, p, at.x - C, at.z - C); }
    g.step();
    assert.equal(carried(g.v, p), -1, 'not its carrier\'s');
  }
  assert.ok(g.v.party().t - t0 < MC.EG_REGRAB);
  const at = egg(g, 0);
  put(g, p2, at.x - C, at.z - C + 1.4);
  g.step();
  assert.equal(carried(g.v, p2), 0, 'a teammate\'s');
});

test('knocked loose by a blast: a foe\'s POW shoves a carrier 4 m off and its egg pops out; a teammate\'s spares it; one blowing up beside a MEGA carrier, too light a jolt for a bump, is still a blast', async () => {
  const { g, c, red, blue } = await stage(4);
  const [p, p2] = red, [q] = blue;
  carry(g, p, 0);
  put(g, p, 0, 4);
  put(g, p2, 4, 4);
  put(g, q, 9, -9);
  g.dv.setUint8(rec(p2) + L.B_ITEM, L.PU_POW);
  g.step([[L.EV_INPUT, p2, partyWord({ use: 1 })]]);
  for (let k = 0; k < 5; k++) g.step();
  assert.equal(carried(g.v, p), 0, 'a teammate\'s blast spares it');
  put(g, q, 4, 4);
  g.dv.setUint8(rec(q) + L.B_ITEM, L.PU_POW);
  const f0 = g.v.fxCount();
  g.step([[L.EV_INPUT, q, partyWord({ use: 1 })]]);
  g.step();
  assert.equal(carried(g.v, p), -1, 'a foe\'s knocks it loose');
  const [x] = fxs(g.v, f0, MC.EG_FX_POP);
  assert.ok(x.owner === p && x.shot === (q | 256), JSON.stringify(x));
  assert.ok(egg(g, 0).vx < -2, `away from the blast: ${egg(g, 0).vx}`);
  // touching a MEGA carrier (three times the weight): a POW jolts it 4.5 m/s, under a bump's EG_HARD
  for (let k = 0; k < MC.EG_REGRAB; k++) g.step();
  clear(g);
  carry(g, p, 1);
  put(g, p, 0, -6);
  g.dv.setUint16(rec(p) + L.B_MEGA, L.MEGA_TICKS, true);
  put(g, q, 2.7, -6);
  put(g, p2, -9, 9);
  g.dv.setUint8(rec(q) + L.B_ITEM, L.PU_POW);
  g.step();
  const f1 = g.v.fxCount();
  g.step([[L.EV_INPUT, q, partyWord({ use: 2 })]]);
  assert.equal(carried(g.v, p), -1, 'a POW beside it is a blast');
  const [y] = fxs(g.v, f1, MC.EG_FX_POP);
  assert.ok(y.owner === p && y.shot === (q | 256) && y.size > MC.EG_SHOVE && y.size < MC.EG_HARD, JSON.stringify(y));
  void c;
});

test('a loose egg slides: EG_FRIC of its speed a tick, off the fence and round a corner, out of a nest it stops on; the client\'s slide the same bits all the way', async () => {
  const { g, c } = await stage(2);
  const [nx] = nestAt(c, 1);
  const runs = [
    { x: c.hx - 4, z: 0, vx: 9, vz: 1 }, // the end
    { x: 0, z: c.hz - 4, vx: 2, vz: 9 }, // the side
    { x: c.hx - 4, z: c.hz - 4, vx: 6, vz: 6.5 }, // a corner
    { x: nx - C + 0.4, z: 0.2, vx: 0, vz: 0 }, // still on a nest
    { x: nx - C, z: 0, vx: 0, vz: 0 }, // dead on a nest's middle
  ];
  for (const r of runs) {
    clear(g);
    setE(g, 0, { ...r, at: 1e6 });
    const mirror = { ...egg(g, 0) };
    let hit = false;
    for (let k = 0; k < 500; k++) {
      g.step();
      slide(mirror, c, 1);
      const e = egg(g, 0);
      assert.deepEqual([e.x, e.z, e.vx, e.vz], [mirror.x, mirror.z, mirror.vx, mirror.vz], `tick ${k} of ${JSON.stringify(r)}`);
      const lx = Math.abs(e.x - C), lz = Math.abs(e.z - C);
      assert.ok(lx <= c.hx - MC.EG_R + 1e-4 && lz <= c.hz - MC.EG_R + 1e-4, 'inside the fence');
      if (lx > c.hx - MC.EG_R - 0.01 || lz > c.hz - MC.EG_R - 0.01 || Math.hypot(Math.max(0, lx - c.hx + c.cr), Math.max(0, lz - c.hz + c.cr)) > c.cr - MC.EG_R - 0.01) hit = true;
    }
    const e = egg(g, 0);
    assert.deepEqual([e.vx, e.vz], [0, 0], 'at rest');
    assert.ok(Math.hypot(e.x - nx, e.z - C) >= c.nr, 'not on a nest');
    if (Math.hypot(r.vx, r.vz) > 5) assert.ok(hit, `it met the fence: ${JSON.stringify(r)}`);
  }
  // EG_FRIC: a free run's speed
  clear(g);
  setE(g, 0, { x: -5, z: 0, vx: 4, at: 1e6 });
  g.step();
  assert.equal(egg(g, 0).vx, f(f(4) * f(MC.EG_FRIC)));
});

test('the golden eggs: called 2 s ahead, landing in the middle at 20, 40, 60 and 80 s, worth 3 laid', async () => {
  const { g, c, red } = await stage(2);
  const ne = c.ne;
  assert.deepEqual([0, 1, 2, 3].map(goldAt), [2500, 5000, 7500, 10000]);
  const f0 = g.v.fxCount();
  while (g.v.party().t < goldAt(0)) g.step();
  assert.equal(egg(g, ne).st, MC.EG_NONE);
  const calls = fxs(g.v, f0, MC.EG_FX_GOLD);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tick - g.v.party().start, goldAt(0) - MC.EG_GOLDW);
  assert.equal(calls[0].shot, 0);
  g.step();
  const e = egg(g, ne);
  assert.deepEqual([e.st, e.v, e.x, e.z], [MC.EG_FREE, MC.EG_GOLDV, C, C]);
  assert.equal(fxs(g.v, f0, MC.EG_FX_GOLD).at(-1).shot, 256);
  // taken and laid: 3 to red and 3 of its own
  put(g, red[0], 1, 0);
  g.step();
  assert.equal(carried(g.v, red[0]), ne);
  const [rx] = nestAt(c, 0);
  put(g, red[0], rx - C + c.nr - 0.2, 0);
  g.step();
  assert.deepEqual([g.v.party().tscore[0], g.v.partier(red[0]).score], [3, 3]);
  // the next one falls 20 s later
  while (g.v.party().t < goldAt(1)) g.step();
  g.step();
  assert.equal(egg(g, ne + 1).st, MC.EG_FREE);
});

test('the power-ups: bumper\'s from the sky, 6 s into play and every 8 s, one more a drop for every 16 balls in, onto the yard and never into a nest; the first ball into one, by slot, takes it; one left lying goes at 10 s; a ROCKET taken from the sky and fired knocks a foe carrier\'s egg loose', async () => {
  // on the clock: one at a time for 8, two for 16, 17 for 256
  const { g, c, red, blue } = await stage(8);
  const g16 = (await stage(16)).g;
  const f0 = g.v.fxCount(), h0 = g16.v.fxCount();
  const at = (v) => (x) => x.tick - v.party().start;
  while (!fxs(g.v, f0, L.FX_DROP).length) g.step();
  const [d0] = fxs(g.v, f0, L.FX_DROP);
  assert.equal(at(g.v)(d0), MC.EG_DROP0);
  const k0 = d0.shot;
  assert.ok(d0.size >= L.PU_MEGA && d0.size <= L.NPU && orb(g, k0).kind === d0.size && orb(g, k0).st === 1);
  // it falls at 10 m/s from ORB_Y and lies there 10 s, nobody near it (everyone along the far fence)
  const far = Math.sign(d0.pos[2] - C) || 1;
  [...red, ...blue].forEach((p, i) => put(g, p, -10 + 2.5 * i, -far * (c.hz - 1.5)));
  let landed = -1;
  for (let k = 0; k < 2000 && orb(g, k0).kind; k++) {
    g.step();
    if (landed < 0 && orb(g, k0).st === 2) { landed = g.v.party().t; assert.ok(Math.abs(orb(g, k0).y - 0.6) < 1e-4); }
  }
  assert.ok(Math.abs(landed - at(g.v)(d0) - (L.ORB_Y - 0.6) / 0.08) < 2, `landed ${landed - at(g.v)(d0)} ticks after the drop`);
  assert.equal(g.v.party().t - landed, MC.EG_ORBLIFE, 'gone 10 s after it landed');
  while (g16.v.party().t <= MC.EG_DROP0 + MC.EG_DROPGAP) g16.step();
  assert.deepEqual(fxs(g.v, f0, L.FX_DROP).map(at(g.v)).slice(0, 2), [MC.EG_DROP0, MC.EG_DROP0 + MC.EG_DROPGAP], 'one at a time for 8');
  assert.deepEqual(fxs(g16.v, h0, L.FX_DROP).map(at(g16.v)), [0, 0, 1, 1].map((i) => MC.EG_DROP0 + i * MC.EG_DROPGAP), 'two for 16');
  // onto the yard, never into a nest: 256 balls, drops forced every tick (the old ones cleared), 17 a time
  const big = await room(256, { seed: 3 });
  const cb = yard(big.v);
  const b0 = big.v.fxCount();
  for (let k = 0; k < 24; k++) {
    for (let j = 0; j < MC.EG_NORB; j++) big.dv.setUint8(OA(j) + 12, 0);
    hold(big, 0);
    big.step();
  }
  const spots = fxs(big.v, b0, L.FX_DROP);
  assert.equal(spots.length, 24 * 17);
  const ix = cb.hx - cb.cr, iz = cb.hz - cb.cr;
  const sides = new Set();
  for (const x of spots) {
    const ax = Math.abs(x.pos[0] - C), az = Math.abs(x.pos[2] - C);
    assert.ok(Math.hypot(Math.max(0, ax - ix), Math.max(0, az - iz)) <= cb.cr - MC.EG_DROPIN + 1e-4, `inside the fence: ${ax}, ${az}`);
    for (const s of [0, 1]) assert.ok(Math.hypot(x.pos[0] - nestAt(cb, s)[0], x.pos[2] - C) >= cb.nr + MC.EG_DROPNEST - 1e-4, 'off the nests');
    sides.add(`${Math.sign(x.pos[0] - C)}${Math.sign(x.pos[2] - C)}`);
  }
  assert.equal(sides.size, 4, 'all over the yard');
  const kinds = spots.reduce((n, x) => { n[x.size]++; return n; }, [0, 0, 0, 0, 0, 0]);
  assert.ok(kinds[L.PU_POW] > kinds[L.PU_SPRING] && kinds[L.PU_DASH] > kinds[L.PU_SPRING] && kinds[L.PU_MEGA] < kinds[L.PU_SPRING], `the mix: ${kinds}`);
  // taken by the first ball into it, by slot, holding none: of two at once the lower; one holding one rolls through
  const t = await stage(4);
  hold(t.g);
  const [p, p2] = t.red, [q, q2] = t.blue;
  const lo = Math.min(p, q), hi = Math.max(p, q);
  setO(t.g, 0, L.PU_DASH, 0, 0);
  setO(t.g, 1, L.PU_POW, 6, 0);
  put(t.g, lo, -1.2, 0);
  put(t.g, hi, 1.2, 0);
  t.g.dv.setUint8(rec(q2) + L.B_ITEM, L.PU_SPRING);
  put(t.g, q2, 6, 1);
  const f1 = t.g.v.fxCount();
  t.g.step();
  assert.deepEqual([t.g.v.partier(lo).item, t.g.v.partier(hi).item, orb(t.g, 0).kind], [L.PU_DASH, 0, 0], 'the lower slot');
  const [pk] = fxs(t.g.v, f1, L.FX_PICKUP);
  assert.deepEqual([pk.owner, pk.shot, pk.size], [lo, 0, L.PU_DASH]);
  assert.deepEqual([orb(t.g, 1).kind, t.g.v.partier(q2).item], [L.PU_POW, L.PU_SPRING], 'hands full: left lying');
  // a ROCKET from the sky: blue rolls into it and fires it at red's carrier 12 m off
  for (const r of [p, p2, q, q2]) t.g.dv.setUint8(rec(r) + L.B_ITEM, 0);
  setO(t.g, 1, 0, 0, 0);
  setO(t.g, 2, L.PU_ROCKET, 3, 0, { y: 4 });
  carry(t.g, p, 0);
  put(t.g, p, -8, 0);
  put(t.g, p2, -6, 8);
  put(t.g, q, 4.5, 0);
  put(t.g, q2, 6, -8);
  const f2 = t.g.v.fxCount();
  const left = partyWord({ yaw: 8192, move: 1 });
  for (let k = 0; k < 120 && !t.g.v.partier(q).item; k++) t.g.step([[L.EV_INPUT, q, left]]);
  assert.equal(t.g.v.partier(q).item, L.PU_ROCKET, 'taken');
  t.g.step([[L.EV_INPUT, q, partyWord({ yaw: 8192, move: 1, use: 1 })]]);
  assert.equal(t.g.v.partier(q).item, 0, 'fired');
  for (let k = 0; k < 60 && carried(t.g.v, p) >= 0; k++) t.g.step([[L.EV_INPUT, q, partyWord({ yaw: 8192, move: 0, use: 1 })]]);
  assert.equal(carried(t.g.v, p), -1, 'knocked loose');
  const [x] = fxs(t.g.v, f2, MC.EG_FX_POP);
  assert.ok(x.owner === p && x.shot === (q | 256) && x.size > MC.EG_SHOVE, JSON.stringify(x));
  assert.equal(fxs(t.g.v, f2, L.FX_BLAST).length, 1);
  assert.ok(egg(t.g, 0).vx < -1, `away from the blast: ${egg(t.g, 0).vx}`);
  assert.deepEqual([t.g.v.partier(q).score, slotOf(t.g.v, q).knocks], [MC.EG_PT_KNOCK, 1]);
});

test('the end: at the clock the bigger nest wins, every ball of its side 1st and the rest by their own score; level nests are a draw, placed by score', async () => {
  const { g, red, blue } = await stage(6);
  setE(g, 0, { st: MC.EG_NEST, side: 1 });
  setE(g, 1, { st: MC.EG_NEST, side: 1 });
  setE(g, 2, { st: MC.EG_NEST, side: 0, v: MC.EG_GOLDV });
  g.dv.setUint16(rec(blue[0]) + L.PG_SCORE, 5, true);
  g.dv.setUint16(rec(blue[1]) + L.PG_SCORE, 2, true);
  g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 1, true);
  g.step();
  g.step();
  const r = g.v.party();
  assert.equal(r.state, L.H_OVER);
  assert.deepEqual([r.tscore, r.twin], [[3, 2], 1]);
  assert.deepEqual([...red, ...blue].map((p) => g.v.partier(p).place), [1, 1, 1, 4, 5, 6]);
  assert.deepEqual([...red, ...blue].map((p) => g.v.partier(p).wins), [1, 1, 1, 0, 0, 0]);
  const t = await stage(4, { seed: 9 });
  setE(t.g, 0, { st: MC.EG_NEST, side: 0 });
  setE(t.g, 1, { st: MC.EG_NEST, side: 1 });
  t.g.dv.setUint16(rec(t.blue[1]) + L.PG_SCORE, 4, true);
  t.g.dv.setUint32(L.HDR_UNTIL, t.g.v.tick + 1, true);
  t.g.step();
  t.g.step();
  assert.deepEqual([t.g.v.party().tscore, t.g.v.party().twin], [[1, 1], 3]);
  assert.equal(t.g.v.partier(t.blue[1]).place, 1);
  assert.equal(t.g.v.partier(t.red[0]).place, 2);
});

test('a newcomer in play goes to the smaller side and falls in in front of its own nest; a ball alone lays eggs and wins', async () => {
  const { g, c } = await stage(3);
  assert.deepEqual(g.v.party().tn, [2, 1]);
  g.step([[L.EV_JOIN, 3]]);
  const b = g.v.partier(3);
  assert.equal(b.side, 1);
  assert.ok(!b.out && b.pos[1] > PLAT_Y + 5, 'falling in');
  const [bx] = nestAt(c, 1);
  assert.ok(Math.abs(b.pos[0] - (bx - c.nr - MC.EG_BACK)) < 1e-3 && Math.abs(b.pos[2] - C) <= c.hz * 0.6 + 1e-3, `${b.pos[0] - C}, ${b.pos[2] - C}`);
  assert.equal(b.m, 0);
  for (let k = 0; k < 200; k++) g.step();
  assert.ok(g.v.partier(3).ground);
  // alone, an AI ball fetches and lays, and its side wins at the clock
  const one = await room(1);
  const bot = new Partier(0, 3, 0.8);
  for (let k = 0; k < 4000 && one.v.party().tscore[0] < 4; k++) one.step([[L.EV_INPUT, 0, bot.think(one.v, one.v.tick, 0)]]);
  assert.ok(one.v.party().tscore[0] >= 4, `alone it lays: ${one.v.party().tscore}`);
  one.dv.setUint32(L.HDR_UNTIL, one.v.tick + 1, true);
  one.step();
  one.step();
  assert.deepEqual([one.v.party().twin, one.v.partier(0).place, one.v.partier(0).wins], [1, 1, 1]);
});

test('the prediction matches the confirmed ball bit for bit: a carrier, slowed, off the fence and its corners and rolled out of the other nest, through a DASH; a ball carrying nothing through its own nest and a SPRING', async () => {
  const { g, c, red, blue } = await stage(4);
  hold(g); // no power-up from the sky: a pickup, like a take, comes a round trip late
  const s = g.v.partier(0).side;
  const others = [...red, ...blue].filter((p) => p);
  // everyone else in a corner of slot 0's own half, out of its way
  others.forEach((p, i) => put(g, p, dir(s) * (c.hx - 6 - 2.5 * i), -c.hz + 1.5));
  carry(g, 0, 0);
  put(g, 0, -dir(s) * 3, 2);
  g.dv.setUint8(rec(0) + L.B_ITEM, L.PU_DASH);
  const [fx] = nestAt(c, 1 - s);
  // at the other nest's middle, then out to the side's fence, then round and round
  const turn = (a) => Math.round(a / (2 * Math.PI) * 16384) & 16383;
  const toNest = turn(Math.atan2(-2, fx - C + dir(s) * 3));
  const words = Array.from({ length: 480 }, (_, k) => partyWord({ yaw: k < 150 ? toNest : k < 340 ? 4096 : (k * 131) & 16383, move: k < 340 || k % 60 < 52 ? 1 : 0, hop: k > 340 && k % 71 === 9 ? 1 : 0, use: k >= 40 ? 1 : 0 }));
  let inNest = 0, onFence = 0;
  const watch = (k) => { const m = local(g, 0); if (Math.hypot(m.x - (fx - C), m.z) < c.nr) inNest++; if (Math.abs(m.x) > c.hx - 1.05 || Math.abs(m.z) > c.hz - 1.05) onFence++; };
  const n0 = predicted({ ...g, step: (recs) => { g.step(recs); watch(); } }, words);
  assert.ok(n0 >= words.length);
  assert.ok(inNest > 0 && onFence > 0, `through the other nest (${inNest} ticks) and against the fence (${onFence})`);
  assert.equal(carried(g.v, 0), 0, 'carrying all the while');
  assert.deepEqual([g.v.partier(0).item, g.v.partier(0).shots], [0, 1], 'the DASH used');
  // carrying nothing, through its own nest: no eggs anywhere to take or steal
  clear(g);
  g.dv.setUint32(rec(0) + L.PG_M, 0, true);
  const [ox] = nestAt(c, s);
  put(g, 0, ox - C - dir(s) * (c.nr + 4), 1);
  g.dv.setUint8(rec(0) + L.B_ITEM, L.PU_SPRING);
  inNest = 0;
  let high = 0;
  const run = Array.from({ length: 360 }, (_, k) => partyWord({ yaw: k < 120 ? (s ? 0 : 8192) : (k * 97) & 16383, move: 1, hop: k % 53 === 20 ? 1 : 0, use: k >= 150 ? 2 : 1 }));
  const own = (k) => { const m = local(g, 0); if (Math.hypot(m.x - (ox - C), m.z) < c.nr) inNest++; high = Math.max(high, g.v.partier(0).pos[1] - PLAT_Y); };
  assert.ok(predicted({ ...g, step: (recs) => { g.step(recs); own(); } }, run) >= run.length);
  assert.ok(inNest > 0, `through its own nest (${inNest} ticks)`);
  assert.ok(high > 4, `up on the SPRING: ${high.toFixed(1)} m (a hop makes 2)`);
});

test('the client: the yard, the fence, the nests and their eggs heaped, eggs loose, carried and falling, power-ups falling and lying; its HUD and feed; the AI carries home round foes, fetches the nearest egg, raids, a guard charges a foe carrier, and a power-up is fetched and spent where it pays', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const { g, c, red, blue } = await stage(16);
  hold(g);
  for (let k = 0; k < 9; k++) setE(g, k, { st: MC.EG_NEST, side: k & 1, v: k === 4 ? 3 : 1 });
  setE(g, 9, { x: 2, z: 3, vx: 3 });
  carry(g, red[0], 10);
  g.dv.setUint8(rec(red[0]) + L.B_ITEM, L.PU_DASH);
  setE(g, 11, { x: -1, z: 1, at: g.v.party().t + 20 });
  setO(g, 0, L.PU_POW, 6, -4);
  setO(g, 1, L.PU_ROCKET, -6, 5, { y: 15 });
  g.step();
  const out = () => ({ scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null });
  const o = out();
  const g0 = g.v.party();
  eggs.draw(g.v, { tick: g0.tick, t: g0.t * TICK, dt: 0.01, ptick: g0.tick + 6, now: 1000, slot: red[1], pme: g.v.partier(red[1]), own: g.v.partier(red[1]).pos }, o);
  for (let k = 0; k < o.scene.count * 16; k++) assert.ok(Number.isFinite(o.scene.data[k]), 'finite');
  assert.ok(o.scene.count > 120, `the yard, the fence, the nests, the eggs: ${o.scene.count}`);
  assert.equal(o.casters.length, 5, 'a loose egg, a carried one and one popping; two power-ups');
  const eggSolids = [];
  for (let k = 0; k < o.scene.count; k++) if ((o.scene.data[k * 16 + 3] & 3) === 3 && Math.abs(o.scene.data[k * 16 + 5] - MC.EG_EH / 2) < 1e-3) eggSolids.push(k);
  assert.equal(eggSolids.length, 12, 'nine in the nests, three out');
  // the carried one over its carrier's DASH (party's frontend draws that 1.55 m over its head)
  const held = eggSolids.find((k) => o.scene.data[k * 16 + 15] === 10);
  assert.ok(o.scene.data[held * 16 + 1] - g.v.partier(red[0]).pos[1] > 2 * B_RAD + 2.2, 'over the power-up it holds');
  // the power-ups: the lying one bobbing on the floor, the falling one with its streak and a target where it lands
  const ups = o.solid.filter((x) => x.kind === 2);
  assert.equal(ups.length, 2);
  assert.ok(ups.some((x) => Math.abs(x.pos[0] - C - 6) < 1e-3 && Math.abs(x.pos[1] - PLAT_Y - 0.6) < 0.2), 'lying');
  assert.ok(ups.some((x) => Math.abs(x.pos[0] - C + 6) < 1e-3 && x.pos[1] - PLAT_Y > 10), 'falling');
  assert.equal(o.beams.length, 1);
  assert.ok(o.decals.some((d) => d.kind === 3 && Math.abs(d.pos[0] - C + 6) < 1e-3 && Math.abs(d.pos[2] - C - 5) < 1e-3), 'its target');
  // a golden egg called: its ring, then falling
  const o2 = out();
  eggs.draw(g.v, { tick: g0.tick, dt: 0, pt: (goldAt(0) - 50) * TICK, now: 0, slot: -1 }, o2);
  assert.ok(o2.decals.some((d) => d.kind === 0 && d.radius < 2), 'the ring where it lands');
  const lines = [];
  const hctx = { put: () => {}, centre: (y, s) => lines.push(s), right: (y, s) => lines.push(s), rect: () => {}, rows: 44, C: {}, slot: red[0], now: 0, t: g0.t * TICK };
  eggs.hud(g.v, hctx);
  assert.ok(lines.some((l) => l.startsWith('LOOSE EGGS')) && lines.includes('YOU HAVE AN EGG  ROLL INTO YOUR NEST') && lines.some((l) => l.startsWith('LAID 0')), lines.join(' | '));
  for (const l of [...lines, eggs.hint, eggs.rules]) assert.ok(l.length <= 70 && /^[ -_]*$/.test(l), l);
  assert.equal(eggs.frame(g.v).shape, 'square');
  assert.deepEqual([eggs.facing(g.v, red[0]), eggs.facing(g.v, blue[0])], [0, Math.PI]);
  const fctx = { slot: red[0], view: g.v, glow: () => {}, banner: () => {}, feed: (s) => lines.push(s), name: (q) => `P${q + 1}`, dist: 0, now: 0 };
  eggs.fx({ kind: MC.EG_FX_GET, owner: blue[2], shot: 3 | 256, pos: [C, PLAT_Y, C], size: 1 }, fctx);
  assert.equal(lines.at(-1), `P${blue[2] + 1} STOLE AN EGG FROM RED`);
  eggs.fx({ kind: MC.EG_FX_POP, owner: red[0], shot: blue[1], pos: [C, PLAT_Y + 2, C], size: 9, tick: 5 }, fctx);
  assert.equal(lines.at(-1), `P${blue[1] + 1} KNOCKED P${red[0] + 1}'S EGG LOOSE`);
  // the brain: a carrier's goal its own nest, a fetcher's the egg it's sent for, the planner's danger round a foe
  const think = (p) => { const me = g.v.partier(p); const bot = { slot: p, skill: 0.8, mem: {}, pos: [me.pos[0], me.pos[2]], vel: [me.vel[0], me.vel[2]] }; return { me, bot, word: eggs.brain.think(g.v, me, bot, g.v.tick), goal: eggs.brain.goal(g.v, me, bot) }; };
  assert.deepEqual(think(red[0]).goal, nestAt(c, 0));
  const e9 = egg(g, 9);
  const sent = [...red, ...blue].map((p) => think(p).goal).filter((q) => q && q[0] === e9.x && q[1] === e9.z);
  assert.equal(sent.length, 2, 'one of each side for the loose egg');
  put(g, blue[3], g.v.partier(red[0]).pos[0] - C + 2.6, g.v.partier(red[0]).pos[2] - C);
  g.step();
  const me0 = g.v.partier(red[0]);
  assert.ok(eggs.brain.danger(g.v, me0.pos[0] + 2.4, me0.pos[2], g.v.tick, me0) > 0.3, 'a foe next to a carrier');
  assert.equal(eggs.brain.danger(g.v, me0.pos[0] + 2.4, me0.pos[2], g.v.tick, g.v.partier(red[1])), 0, 'nothing to one carrying nothing');
  // a foe carrier on red's half: red's balls near it charge it
  clear(g);
  carry(g, blue[0], 0);
  put(g, blue[0], -8, 4, { vx: 6 });
  put(g, red[2], -14, 4);
  g.step();
  const w = think(red[2]).word;
  assert.ok(w && Math.abs(Math.atan2(Math.sin(w.yaw), Math.cos(w.yaw))) < 0.6, `charging it: ${w && w.yaw}`);
  // power-ups spent where they pay: a POW at a foe carrier 4 m off, held with none in reach; a ROCKET at one 12 m
  // off, its way clear of teammates; a DASH home for a carrier 25 m out; the record the planner reads holds none
  clear(g);
  for (const p of [...red, ...blue]) { g.dv.setUint8(rec(p) + L.B_ITEM, 0); g.dv.setUint32(rec(p) + L.PG_M, 0, true); }
  for (let k = 0; k < MC.EG_NORB; k++) setO(g, k, 0, 0, 0);
  const arm = (p, x, z, item) => { put(g, p, x, z); g.dv.setUint8(rec(p) + L.B_ITEM, item); };
  carry(g, red[0], 1);
  put(g, red[0], 0, 6);
  arm(blue[2], 4, 6, L.PU_POW);
  arm(blue[3], 16, 10, L.PU_POW);
  put(g, blue[0], 14, -12);
  arm(blue[4], 10, 12, L.PU_ROCKET);
  carry(g, red[5], 2);
  arm(red[5], 8, -6, L.PU_DASH);
  g.step();
  const pow = think(blue[2]);
  assert.ok(pow.word?.use && pow.me.item === 0, `a POW: ${JSON.stringify(pow.word)}`);
  assert.ok(!think(blue[3]).word?.use, 'none in reach: held');
  const rk = think(blue[4]).word, aim = Math.atan2(g.v.partier(red[0]).pos[2] - g.v.partier(blue[4]).pos[2], g.v.partier(red[0]).pos[0] - g.v.partier(blue[4]).pos[0]);
  assert.ok(rk?.use && Math.abs(rk.yaw - aim) < 0.05, `a ROCKET at it: ${JSON.stringify(rk)}, ${aim}`);
  const [hx, hz] = nestAt(c, 0), dash = think(red[5]).word, d5 = g.v.partier(red[5]).pos;
  assert.ok(dash?.use && Math.abs(dash.yaw - Math.atan2(hz - d5[2], hx - d5[0])) < 1e-9, `a DASH home: ${JSON.stringify(dash)}`);
  // a power-up lying near: the nearest of each side with its hands free sent for it
  const r6 = g.v.partier(red[6]).pos;
  setO(g, 3, L.PU_SPRING, r6[0] - C + 2, r6[2] - C + 1);
  g.step();
  const at3 = [f(r6[0] + 2), f(r6[2] + 1)];
  const sentFor = red.filter((p) => { const q = think(p).goal; return q && q[0] === at3[0] && q[1] === at3[1]; });
  assert.deepEqual(sentFor, [red[6]], 'the nearest red ball for it');
  // staged: an AI ball alone against a full other nest raids it and brings an egg home
  const one = await stage(2, { seed: 5 });
  const [r0] = one.red;
  put(one.g, one.blue[0], one.c.hx - 3, one.c.hz - 2);
  for (let k = 0; k < 4; k++) setE(one.g, k, { st: MC.EG_NEST, side: 1 });
  const bot = new Partier(r0, 3, 0.8);
  for (let k = 0; k < 2000 && one.g.v.party().tscore[0] < 2; k++) one.g.step([[L.EV_INPUT, r0, bot.think(one.g.v, one.g.v.tick, 0)]]);
  assert.ok(one.g.v.party().tscore[0] >= 2 && slotOf(one.g.v, r0).steals >= 2, `raided home: ${one.g.v.party().tscore}`);
});

// A round of AI balls (client/party-bot.mjs) steered by this minigame's brain on the debug build, stats from it.
async function aiRound(balls, ticks, seed) {
  const stats = { start: -1, over: -1, takes: [0, 0], steals: [0, 0], lays: [0, 0], knocks: 0, blasts: 0, gold: 0, drops: 0, picks: 0, uses: 0, places: null, twin: 0 };
  let seen = 0;
  const r = await playParty({ bytes: partyBytes(true), mg: L.MG_EGGS, bots: balls, ticks, seed, onTick: (t, sim, v) => {
    const g = v.party();
    for (; seen < v.fxCount(); seen++) {
      const x = v.fx(seen);
      if (stats.over >= 0 || stats.start < 0) continue;
      if (x.kind === MC.EG_FX_GET) stats[x.shot & 256 ? 'steals' : 'takes'][v.partier(x.owner).side]++;
      if (x.kind === MC.EG_FX_LAY) { stats.lays[(x.shot >> 8) & 1]++; if (x.shot & 512) stats.gold++; }
      if (x.kind === MC.EG_FX_POP) stats[x.shot & 256 ? 'blasts' : 'knocks']++;
      if (x.kind === L.FX_DROP) stats.drops++;
      if (x.kind === L.FX_PICKUP) stats.picks++;
      if (x.kind === L.FX_USE) stats.uses++;
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

for (const [balls, ticks, seed] of [[8, 12200, 5], [64, 12200, 4]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, eggs taken, laid and stolen by both sides, knocked loose by bumps and by blasts, power-ups taken and spent, the bigger nest winning at the clock; equal on 1 and 4 threads`, async () => {
    const { log, sim, stats, games } = await aiRound(balls, ticks, seed);
    assert.equal(sim.error().code, 0);
    assert.ok(games.every((x) => x === L.MG_EGGS));
    assert.ok(stats.over > 0, 'the round ended');
    assert.equal(stats.over - stats.start, MC.EG_LEN, 'at the clock');
    for (const s of [0, 1]) assert.ok(stats.takes[s] >= balls / 4 && stats.lays[s] >= balls / 4 && stats.steals[s] >= 3, `takes ${stats.takes}, lays ${stats.lays}, steals ${stats.steals}`);
    assert.ok(stats.knocks >= balls && stats.gold >= 2, `${stats.knocks} knocked loose, ${stats.gold} golden laid`);
    // the power-ups a spice: most taken and spent, their blasts a few of the knocks
    assert.equal(stats.drops, (1 + Math.floor(balls / MC.EG_DROPN)) * Math.ceil((MC.EG_LEN - MC.EG_DROP0) / MC.EG_DROPGAP));
    assert.ok(stats.picks >= stats.drops * 0.7 && stats.uses >= stats.picks * 0.8, `${stats.drops} dropped, ${stats.picks} taken, ${stats.uses} used`);
    assert.ok(stats.blasts >= 2 && stats.blasts < stats.knocks / 2, `${stats.blasts} knocked loose by blasts, ${stats.knocks} by bumps`);
    assert.equal(stats.twin, stats.tscore[0] > stats.tscore[1] ? 1 : stats.tscore[0] < stats.tscore[1] ? 2 : 3);
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
