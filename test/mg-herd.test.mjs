// ROUND UP (src/mg/herd.wat): the meadow, its pens and the flock for 1 to
// 256 balls, each side on its own half; the fence, the mouths and the pens
// for a ball, the other side's mouth shut and its ground rolling it away; a
// sheep running from a ball, quicker the closer, and two balls' pushes
// summed; the fence holding sheep, and a sheep leaning in off it; a flock
// moving off together, parting, wandering back; a sheep penned for its pen's
// side and its drivers; the golden rams; the bark; the grid missing no ball
// of 256; the end with all penned and at the clock, a draw; a newcomer in
// play and a ball alone; the prediction bit for bit along the fence and
// through a mouth; the client and its AI; rounds of AI balls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y, B_RAD } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/herd.mjs'; // HD_*: the minigame's own constants
import herd, { meadow, flock, mouthAt, place, barked, dir } from '../client/mg/herd.mjs';

const C = L.B_CX;
const TICK = 0.008;
const f = Math.fround;
const area = (n) => MC.HD_A0 + MC.HD_AK * Math.min(n, MC.HD_NK) + MC.HD_AK2 * Math.max(0, n - MC.HD_NK);
const nsheep = (n) => Math.min(MC.HD_NMAX, Math.max(MC.HD_NMIN, n));
const nrams = (n) => (n >= MC.HD_RAMN ? MC.HD_NRAM : 1);

// A room of n balls on Round Up, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_HERD + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
const teams = (g, n) => { const s = Array.from({ length: n }, (_, p) => g.v.partier(p).side); return [0, 1].map((x) => s.map((y, p) => [y, p]).filter(([y]) => y === x).map(([, p]) => p)); };
// Ball p at (x, z) from the meadow's centre, on the floor (or y over it), rolling at (vx, vz).
function put(g, p, x, z, { vx = 0, vz = 0, y = 0 } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, C + x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, PLAT_Y + y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, C + z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, (g.dv.getUint8(rec(p) + L.P_FL) & L.PF_BLUE) | L.PF_LIVE | (y > 0 ? 0 : L.PF_GROUND));
}
const SA = (k) => L.PG_S + k * MC.HD_SSIZE;
// Sheep k set: by default loose at (x, z) from the centre, still, worth 1.
function setS(g, k, { st = MC.HD_LOOSE, side = 0, v = 1, x = 0, z = 0, vx = 0, vz = 0, at = 0 } = {}) {
  const a = SA(k), dv = g.dv;
  [C + x, C + z, vx, vz].forEach((val, i) => dv.setFloat32(a + 4 * i, val, true));
  dv.setUint8(a + MC.HD_ST, st);
  dv.setUint8(a + MC.HD_SSIDE, side);
  dv.setUint8(a + MC.HD_SV, v);
  dv.setUint8(a + MC.HD_SBY, 255);
  dv.setUint32(a + MC.HD_SAT, at, true);
}
// Sheep k as the page reads it, its place from the meadow's centre.
const sheep = (g, k) => { const e = flock(g.v)[k]; return { ...e, x: e.x - C, z: e.z - C, sp: Math.hypot(e.vx, e.vz) }; };
// Every sheep off the meadow (not stepped, still counted as left to pen) and no ram to come, so a test has only its own.
function clear(g) {
  for (let k = 0; k < MC.HD_NMAX + MC.HD_NRAM; k++) g.dv.setUint8(SA(k) + MC.HD_ST, MC.HD_NONE);
  g.dv.setUint32(L.PG_H + MC.HD_NR, 0, true);
}
const fxs = (v, from, kind) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
const local = (g, p) => { const b = g.v.partier(p); return { x: b.pos[0] - C, z: b.pos[2] - C, vx: b.vel[0], vz: b.vel[2], sp: Math.hypot(b.vel[0], b.vel[2]) }; };
const turn = (a) => Math.round(a / (2 * Math.PI) * 16384) & 16383;
// A room of n with no sheep on the meadow, each side's balls in rows against one side fence on its own half, still.
async function stage(n, opts) {
  const g = await room(n, opts);
  clear(g);
  const c = meadow(g.v);
  const [red, blue] = teams(g, n);
  const park = () => {
    red.forEach((p, i) => put(g, p, -4 - (i % 6) * 2.5, -c.hz + 1.5 + Math.floor(i / 6) * 2.5));
    blue.forEach((p, i) => put(g, p, 4 + (i % 6) * 2.5, -c.hz + 1.5 + Math.floor(i / 6) * 2.5));
  };
  park();
  return { g, c, red, blue, park };
}

test('the meadow for 1, 8, 64 and 256: a rounded rectangle sized for the crowd, a pen behind each end with its mouth in the fence, a sheep for every ball (8 to 120) laid the same for both sides, one ram to come or three; each side in rows on its own half, out of the flock\'s sight', async () => {
  let last = 0;
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const c = meadow(g.v);
    assert.equal(r.game, L.MG_HERD);
    assert.deepEqual([r.kind, r.len, r.flags], [L.PK_SCORE, MC.HD_LEN, L.PGF_BUMPS | L.PGF_TEAMS]);
    assert.ok(Math.abs(4 * c.hx * c.hz - area(n)) < 0.05 && Math.abs(c.hx / c.hz - MC.HD_ASP) < 1e-4 && c.hx > last, `${2 * c.hx} by ${2 * c.hz} m for ${n}`);
    last = c.hx;
    assert.equal(r.size, c.hx);
    assert.equal(c.cr, f(Math.min(MC.HD_RC, c.hz / 2)));
    const rt = Math.sqrt(n);
    assert.ok(Math.abs(c.pw - (MC.HD_PW0 + MC.HD_PWK * rt)) < 1e-4 && Math.abs(c.pd - (MC.HD_PD0 + MC.HD_PDK * rt)) < 1e-4, `the pens: ${c.pw} by ${c.pd}`);
    assert.ok(Math.abs(c.gw - c.pw * MC.HD_GK) < 1e-4 && Math.abs(c.ar - c.gw - MC.HD_APR) < 1e-4);
    assert.ok(c.gw > 2 * B_RAD && c.pw < c.hz - c.cr, 'a mouth a ball rolls through, a pen clear of the corners');
    assert.deepEqual([c.ns, c.nr, c.left], [nsheep(n), nrams(n), nsheep(n) + nrams(n)]);
    const list = flock(g.v);
    assert.equal(list.length, c.ns + c.nr);
    const sheepList = list.slice(0, c.ns);
    for (const e of sheepList) {
      assert.deepEqual([e.st, e.v, e.by, e.vx, e.vz], [MC.HD_LOOSE, 1, 255, 0, 0]);
      assert.ok(Math.hypot(e.x - C, e.z - C) < c.fr, 'in the flock');
    }
    // every other sheep opposite the one before it through the middle; a last one alone in the middle
    for (let k = 1; k < c.ns; k += 2) assert.ok(Math.abs(list[k].x + list[k - 1].x - 2 * C) < 1e-4 && Math.abs(list[k].z + list[k - 1].z - 2 * C) < 1e-4, `${n}: sheep ${k}`);
    if (c.ns & 1) assert.deepEqual([list[c.ns - 1].x, list[c.ns - 1].z], [C, C]);
    let gap = Infinity;
    for (let a = 0; a < c.ns; a++) for (let b = a + 1; b < c.ns; b++) gap = Math.min(gap, Math.hypot(list[a].x - list[b].x, list[a].z - list[b].z));
    assert.ok(gap > 1, `${n}: the nearest two sheep ${gap.toFixed(2)} m apart`);
    list.slice(c.ns).forEach((e, k) => assert.deepEqual([e.st, e.v, e.at], [MC.HD_NONE, MC.HD_RAMV, MC.HD_RAM0 + k * MC.HD_RAMP]));
    assert.deepEqual(r.tn, [Math.ceil(n / 2), Math.floor(n / 2)]);
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y);
      const deep = (b.pos[0] - C) * dir(b.side);
      assert.ok(deep >= c.fr + MC.HD_FRONT - 1e-4 && deep < c.hx - B_RAD - 1, `${n}: P${p + 1} on its own half, past the flock: ${deep}`);
      assert.ok(Math.abs(b.pos[2] - C) <= c.hz - B_RAD - 0.5, `${n}: P${p + 1} inside the fence`);
      let near = Infinity;
      for (const e of sheepList) near = Math.min(near, Math.hypot(e.x - b.pos[0], e.z - b.pos[2]));
      assert.ok(near > MC.HD_SCARE, `${n}: P${p + 1} out of the flock's sight`);
    }
  }
});

test('the fence and the mouths for a ball: off a side, an end and a rounded corner softly, never through; through its own mouth into its pen and held by the pen\'s back and sides; the other side\'s mouth is fence, and the ground about it rolls a ball away, but not one in the air', async () => {
  const { g, c, red, blue } = await stage(2);
  const p = red[0], q = blue[0];
  const run = (word, k = 1, who = p) => { for (let i = 0; i < k; i++) g.step([[L.EV_INPUT, who, word]]); };
  put(g, p, 0, c.hz - 1.3, { vz: 8 });
  run(partyWord({ yaw: 4096, move: 1 }), 80);
  let b = local(g, p);
  assert.ok(b.z <= c.hz - B_RAD + 1e-4 && b.z > c.hz - B_RAD - 0.5, `against the side: ${b.z}`);
  // red's own end is at low x: off it beside the mouth
  put(g, p, -c.hx + 1.03, c.gw + 2, { vx: -8 });
  run(partyWord({ yaw: 8192, move: 0 }), 1);
  b = local(g, p);
  assert.ok(b.x >= -c.hx + B_RAD - 1e-4 && b.vx > 0 && b.vx < 8 * MC.HD_PE + 0.2, `off the end softly: ${b.x}, ${b.vx}`);
  // into a corner: kept within its arc
  put(g, p, c.hx - 4, c.hz - 4, { vx: 7, vz: 7 });
  const ix = c.hx - c.cr, iz = c.hz - c.cr;
  for (let k = 0; k < 150; k++) {
    run(partyWord({ yaw: 2048, move: 1 }));
    b = local(g, p);
    const far = Math.hypot(Math.max(0, b.x - ix), Math.max(0, b.z - iz));
    assert.ok(far <= c.cr - B_RAD + 1e-3 && b.x <= c.hx - B_RAD + 1e-4 && b.z <= c.hz - B_RAD + 1e-4, `inside the corner: ${b.x}, ${b.z}`);
  }
  // through its own mouth, down the middle and off a post: into the pen, and there inside its rails
  for (const z0 of [0, c.gw - 0.6]) {
    put(g, p, -c.hx + 4, z0, { vx: -6 });
    let deepest = 0;
    for (let k = 0; k < 400; k++) {
      run(partyWord({ yaw: k < 200 ? 8192 : 4096 + ((k * 37) & 4095), move: 1 }));
      b = local(g, p);
      deepest = Math.min(deepest, b.x);
      if (b.x < -c.hx) assert.ok(b.x >= -c.hx - c.pd + B_RAD - 1e-3 && Math.abs(b.z) <= c.pw - B_RAD + 1e-3, `in its pen: ${b.x}, ${b.z}`);
      else assert.ok(b.x >= -c.hx + B_RAD - 1e-3 || Math.hypot(b.x + c.hx, Math.abs(b.z) - c.gw) >= B_RAD - 1e-3, `in the mouth, off its posts: ${b.x}, ${b.z}`);
    }
    assert.ok(deepest < -c.hx - c.pd + B_RAD + 0.2, `to the back of its pen: ${deepest}`);
  }
  // the other side's mouth: fence to it, and its ground rolls it away
  put(g, p, 0, c.hz - 2);
  put(g, q, -c.hx + 6, 0.3, { vx: -9 });
  let closest = Infinity, nearest = Infinity;
  for (let k = 0; k < 400; k++) {
    run(partyWord({ yaw: turn(Math.atan2(-local(g, q).z, -c.hx - local(g, q).x)), move: 1 }), 1, q);
    b = local(g, q);
    closest = Math.min(closest, b.x);
    if (k > 150) nearest = Math.min(nearest, Math.hypot(b.x + c.hx, b.z));
  }
  assert.ok(closest >= -c.hx + B_RAD - 1e-3, `never through red's mouth: ${closest}`);
  assert.ok(nearest > c.ar - 2.2, `pushing in for all it is worth, it is held ${nearest.toFixed(2)} m off (rolled away inside ${c.ar.toFixed(2)})`);
  // red's own ball stands in its mouth unpushed; blue's in the air over the ground is not pushed till it lands
  put(g, p, -c.hx + 1.5, 0);
  put(g, q, -c.hx + 3, 1, { y: 3 });
  g.step([[L.EV_INPUT, p, partyWord({})], [L.EV_INPUT, q, partyWord({})]]);
  assert.deepEqual([local(g, p).vx, local(g, p).vz], [0, 0], 'its own mouth');
  assert.deepEqual([local(g, q).vx, local(g, q).vz], [0, 0], 'no push in the air');
  for (let k = 0; k < 120 && !g.v.partier(q).ground; k++) g.step();
  g.step();
  assert.ok(local(g, q).vx > 0 && local(g, q).vz > 0, 'on the ground, away from the mouth\'s middle');
});

test('a sheep runs from a ball: straight away, quicker the closer, held to HD_VMAX, and not at all from HD_SCARE off; its velocity closes HD_EASE of the gap a tick', async () => {
  const { g, c, red, park } = await stage(2);
  const p = red[0];
  const one = (d, opts) => { park(); put(g, p, -d, 3, opts); setS(g, 0, { x: 0, z: 3 }); g.step(); return sheep(g, 0); };
  let e = one(3);
  const want = (d) => Math.min(MC.HD_VMAX, MC.HD_FLEE * (1 - d / MC.HD_SCARE)) * MC.HD_EASE;
  assert.ok(Math.abs(e.vx - want(3)) < 1e-5 && e.vz === 0, `3 m off: ${e.vx}, ${e.vz}`);
  assert.ok(Math.abs(e.x - e.vx * TICK) < 1e-4, 'a step of it');
  e = one(4.5);
  assert.ok(Math.abs(e.vx - want(4.5)) < 1e-5, `slower from further: ${e.vx}`);
  e = one(1.5);
  assert.ok(Math.abs(e.vx - MC.HD_VMAX * MC.HD_EASE) < 1e-5, `held to its top speed: ${e.vx}`);
  e = one(MC.HD_SCARE + 0.01);
  assert.deepEqual([e.vx, e.vz], [0, 0], 'out of its sight');
  // a ball in the air scares it as well
  e = one(3, { y: 2 });
  assert.ok(Math.abs(e.vx - want(3)) < 1e-5);
  // followed at 3 m, it comes up to the speed that distance asks: 5 m/s
  park();
  setS(g, 0, { x: 0, z: 3 });
  for (let k = 0; k < 120; k++) { const s = sheep(g, 0); put(g, p, s.x - 3, 3); g.step(); }
  e = sheep(g, 0);
  assert.ok(Math.abs(e.vx - MC.HD_FLEE * 0.5) < 0.15 && e.vz === 0 && e.x > 2, `driven: ${e.vx} m/s, at ${e.x}`);
  // away from where the ball is, whichever way
  park();
  put(g, p, 2, 3 + 2);
  setS(g, 0, { x: 0, z: 3 });
  g.step();
  e = sheep(g, 0);
  assert.ok(e.vx < 0 && Math.abs(e.vx - e.vz) < 1e-6, `straight away: ${e.vx}, ${e.vz}`);
  void c;
});

test('two balls\' pushes are summed: side by side behind it they drive it twice as hard, either side of it they cancel, a foe\'s and a mate\'s alike', async () => {
  const { g, red, blue, park } = await stage(4);
  const [p, p2] = red, [q] = blue;
  const go = (balls) => { park(); balls.forEach(([b, x, z]) => put(g, b, x, 3 + z)); setS(g, 0, { x: 0, z: 3 }); g.step(); return sheep(g, 0); };
  const alone = go([[p, -4.5, 1]]);
  const two = go([[p, -4.5, 1], [p2, -4.5, -1]]);
  assert.ok(alone.vx > 0.1 && alone.vz < 0, `one, from a little to one side: ${alone.vx}, ${alone.vz}`);
  assert.ok(Math.abs(two.vx - 2 * alone.vx) < 1e-6 && Math.abs(two.vz) < 1e-7, `two side by side: ${two.vx}, ${two.vz}`);
  const mixed = go([[p, -4.5, 1], [q, -4.5, -1]]);
  assert.deepEqual([mixed.vx, mixed.vz], [two.vx, two.vz], 'a foe pushes as a mate does');
  for (const other of [p2, q]) {
    const e = go([[p, -3, 0], [other, 3, 0]]);
    assert.deepEqual([e.vx, e.vz, e.x], [0, 0, 0], 'pulled both ways, it stands');
  }
  // the nearer of two either side wins by the difference
  const e = go([[p, -2, 0], [q, 4, 0]]);
  assert.ok(Math.abs(e.vx - MC.HD_FLEE * (4 - 2) / MC.HD_SCARE * MC.HD_EASE) < 1e-5, `the nearer wins: ${e.vx}`);
});

test('the fence holds sheep: driven at a side, an end beside the mouth and a corner, never nearer than HD_KEEP; left alone it leans in off the fence; a ball rolling along the fence behind one pushes it off the fence', async () => {
  const { g, c, red, park } = await stage(2);
  const p = red[0];
  const inside = (e) => {
    const far = Math.hypot(Math.max(0, Math.abs(e.x) - (c.hx - c.cr)), Math.max(0, Math.abs(e.z) - (c.hz - c.cr)));
    return Math.abs(e.x) <= c.hx - MC.HD_KEEP + 1e-3 && Math.abs(e.z) <= c.hz - MC.HD_KEEP + 1e-3 && far <= c.cr - MC.HD_KEEP + 1e-3;
  };
  // chased from behind toward (tx, tz), 2.5 m off its tail
  const chase = (tx, tz, ticks) => {
    let touched = false;
    for (let k = 0; k < ticks; k++) {
      const s = sheep(g, 0), d = Math.hypot(tx - s.x, tz - s.z) || 1;
      put(g, p, s.x - (tx - s.x) / d * 2.5, s.z - (tz - s.z) / d * 2.5);
      g.step();
      const e = sheep(g, 0);
      assert.equal(e.st, MC.HD_LOOSE, 'never penned');
      assert.ok(inside(e), `inside the fence: ${e.x}, ${e.z}`);
      if (Math.abs(e.z) > c.hz - MC.HD_KEEP - 0.01 || Math.abs(e.x) > c.hx - MC.HD_KEEP - 0.01 || Math.hypot(Math.max(0, Math.abs(e.x) - (c.hx - c.cr)), Math.max(0, Math.abs(e.z) - (c.hz - c.cr))) > c.cr - MC.HD_KEEP - 0.01) touched = true;
    }
    return touched;
  };
  setS(g, 0, { x: 0, z: c.hz - 5 });
  assert.ok(chase(0, c.hz + 5, 250), 'it met the side');
  // left alone on the fence, it walks in
  park();
  for (let k = 0; k < 400; k++) g.step();
  let e = sheep(g, 0);
  assert.ok(c.hz - e.z > MC.HD_SHY - 0.3 && e.sp < 0.2, `in off the fence: ${(c.hz - e.z).toFixed(2)} m`);
  setS(g, 0, { x: c.hx - 5, z: c.gw + 3 });
  assert.ok(chase(c.hx + 5, c.gw + 3, 250), 'it met the end beside the mouth');
  setS(g, 0, { x: c.hx - 7, z: c.hz - 7 });
  assert.ok(chase(c.hx + 3, c.hz + 3, 300), 'it met the corner');
  // on the fence, a ball on the fence 3 m behind it: off the fence it goes
  park();
  setS(g, 0, { x: 0, z: c.hz - MC.HD_KEEP });
  put(g, p, -3, c.hz - B_RAD);
  g.step();
  e = sheep(g, 0);
  assert.ok(e.vx > 0 && e.vz < 0, `pushed along and off: ${e.vx}, ${e.vz}`);
});

test('the flock: a sheep takes HD_ALIGN of its neighbours\' mean velocity, so one driven moves the ones beside it; two overlapping part; with no ball near they wander to their middle, HD_GRAZE at most, and settle', async () => {
  const { g, park } = await stage(2);
  // a neighbour running: half its velocity is what this one wants
  setS(g, 0, { x: -3, z: 3, vx: 4 });
  setS(g, 1, { x: 0, z: 3 });
  g.step();
  let a = sheep(g, 0), b = sheep(g, 1);
  // sheep 0 goes first: it wants half of sheep 1's (0) less the wander to it; sheep 1 then half of sheep 0's new velocity and the wander back
  const graze = Math.min(MC.HD_GRAZE, 3 * MC.HD_COH);
  assert.ok(Math.abs(a.vx - (4 + (graze - 4) * MC.HD_EASE)) < 1e-4, `the runner eases: ${a.vx}`);
  assert.ok(Math.abs(b.vx - (MC.HD_ALIGN * a.vx - graze) * MC.HD_EASE) < 1e-3 && b.vx > 0, `its neighbour moves off with it: ${b.vx}`);
  // out of HD_NEAR: nothing
  clear(g);
  setS(g, 0, { x: -MC.HD_NEAR - 0.5, z: 3, vx: 4 });
  setS(g, 1, { x: 0, z: 3 });
  g.step();
  assert.equal(sheep(g, 1).vx, 0, 'too far to follow');
  // overlapping: apart
  clear(g);
  setS(g, 0, { x: -0.3, z: 3 });
  setS(g, 1, { x: 0.3, z: 3 });
  for (let k = 0; k < 250; k++) g.step();
  a = sheep(g, 0); b = sheep(g, 1);
  assert.ok(b.x - a.x > 2 * MC.HD_SR - 0.25 && b.x - a.x < 2 * MC.HD_SR + 0.3, `parted to ${(b.x - a.x).toFixed(2)} m`);
  // four spread 3 m out wander in to each other, slowly, and stand a body apart
  clear(g);
  [[-3, 0], [3, 0], [0, -3], [0, 3]].forEach(([x, z], k) => setS(g, k, { x, z: 2 + z }));
  let top = 0;
  for (let k = 0; k < 1500; k++) { g.step(); for (let i = 0; i < 4; i++) top = Math.max(top, sheep(g, i).sp); }
  const at = [0, 1, 2, 3].map((k) => sheep(g, k));
  assert.ok(top <= MC.HD_GRAZE * 1.6 && top > 0.3, `at a graze: ${top.toFixed(2)} m/s at most`);
  for (const e of at) assert.ok(Math.hypot(e.x, e.z - 2) < 1.6 && e.sp < 0.25, `gathered: ${e.x.toFixed(2)}, ${(e.z - 2).toFixed(2)}`);
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(Math.hypot(at[i].x - at[j].x, at[i].z - at[j].z) > 2 * MC.HD_SR - 0.3, 'not on top of each other');
  void park;
});

test('penned: a sheep driven through a mouth is that pen\'s for good, its value to the side\'s score and to each ball of the side that drove it in, the nearest its driver; a foe beside it gets nothing; one a foe drives in still counts for the pen\'s side', async () => {
  const { g, c, red, blue, park } = await stage(6);
  const [p, p2, p3] = red, [q, q2] = blue;
  // red's pen is at low x: one ball behind the sheep, in line with the mouth
  setS(g, 3, { x: -c.hx + 3, z: 0.5 });
  put(g, p, -c.hx + 4.6, 0.5);
  const f0 = g.v.fxCount();
  let k = 0;
  for (; k < 300 && sheep(g, 3).st === MC.HD_LOOSE; k++) g.step();
  let e = sheep(g, 3);
  assert.deepEqual([e.st, e.side, e.by, e.j, e.vx, e.vz], [MC.HD_PENNED, 0, p, 0, 0, 0]);
  assert.ok(e.x < -c.hx - MC.HD_INM && e.x > -c.hx - MC.HD_INM - 0.2 && e.at === g.v.party().t - 1, `as it passed ${MC.HD_INM} m in: ${e.x}`);
  assert.deepEqual(g.v.party().tscore, [1, 0]);
  assert.equal(g.v.partier(p).score, 1);
  let [x] = fxs(g.v, f0, MC.HD_FX_PEN);
  assert.deepEqual([x.owner, x.shot, x.size, x.pos], [p, 3, 1, [f(C - c.hx), PLAT_Y, C]]);
  assert.equal(meadow(g.v).left, c.ns - 1);
  // for good: a ball beside it moves it no more
  put(g, p2, e.x + 1.5, e.z);
  for (let i = 0; i < 100; i++) g.step();
  assert.deepEqual([sheep(g, 3).st, sheep(g, 3).x, sheep(g, 3).z], [MC.HD_PENNED, e.x, e.z]);
  // two of red's drive the next in, a blue ball between them: both red balls score, and only they
  park();
  setS(g, 4, { x: -c.hx + 2.5, z: 0 });
  put(g, p, -c.hx + 4.6, 2.3);
  put(g, p2, -c.hx + 4.6, -2.3);
  put(g, q, -c.hx + c.ar + 0.3, 0);
  const f1 = g.v.fxCount();
  for (k = 0; k < 300 && sheep(g, 4).st === MC.HD_LOOSE; k++) g.step();
  e = sheep(g, 4);
  assert.ok(Math.hypot(local(g, q).x - e.x, local(g, q).z - e.z) < MC.HD_SCARE, 'the blue ball was in its sight too');
  assert.deepEqual([e.st, e.side, e.by, e.j], [MC.HD_PENNED, 0, p, 1], 'of two as near, the lower slot its driver');
  assert.deepEqual(g.v.party().tscore, [2, 0]);
  assert.deepEqual([p, p2, p3, q].map((b) => g.v.partier(b).score), [2, 1, 0, 0]);
  [x] = fxs(g.v, f1, MC.HD_FX_PEN);
  assert.deepEqual([x.owner, x.shot, x.size], [p, 4, 2]);
  // a ram's worth, into blue's pen at high x
  park();
  setS(g, 5, { x: c.hx - 3, z: -0.4, v: MC.HD_RAMV });
  put(g, q, c.hx - 6, -0.4);
  const f2 = g.v.fxCount();
  for (k = 0; k < 300 && sheep(g, 5).st === MC.HD_LOOSE; k++) g.step();
  assert.deepEqual([sheep(g, 5).side, sheep(g, 5).by, g.v.party().tscore, g.v.partier(q).score], [1, q, [2, MC.HD_RAMV], MC.HD_RAMV]);
  [x] = fxs(g.v, f2, MC.HD_FX_PEN);
  assert.deepEqual([x.owner, x.shot, x.size, x.pos[0]], [q, 5 | 256 | 512, MC.HD_RAMV, f(C + c.hx)]);
  // blue's ball at the rim of the ground about red's mouth drives one in: red's, nobody's own
  park();
  setS(g, 6, { x: -c.hx + 1.6, z: 0 });
  put(g, q2, -c.hx + c.ar + 0.1, 0);
  const f3 = g.v.fxCount();
  for (k = 0; k < 900 && sheep(g, 6).st === MC.HD_LOOSE; k++) g.step();
  e = sheep(g, 6);
  assert.deepEqual([e.st, e.side, e.by], [MC.HD_PENNED, 0, 255]);
  assert.deepEqual([g.v.party().tscore, g.v.partier(q2).score], [[3, MC.HD_RAMV], 0]);
  assert.equal(fxs(g.v, f3, MC.HD_FX_PEN)[0].owner, 255);
});

test('the golden ram: called 3 s ahead, on in the middle at 25 s, worth 3; it runs from further and faster than a sheep; with the meadow empty the next is called at once; three of them from 24 balls, 20 s apart', async () => {
  const g = await room(2);
  const c = meadow(g.v);
  const ram = c.ns;
  const f0 = g.v.fxCount();
  // the balls stand where they were laid, out of the flock's sight: nothing is penned
  while (g.v.party().t < MC.HD_RAM0) {
    const e = sheep(g, ram);
    assert.equal(e.st, g.v.party().t > MC.HD_RAM0 - MC.HD_RAMW ? MC.HD_CALLED : MC.HD_NONE);
    g.step();
  }
  const calls = fxs(g.v, f0, MC.HD_FX_RAM);
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0].tick - g.v.party().start, calls[0].shot, calls[0].owner], [MC.HD_RAM0 - MC.HD_RAMW, 0, 255]);
  assert.ok(Math.abs(calls[0].size - MC.HD_RAMW * TICK) < 1e-4);
  g.step();
  let e = flock(g.v)[ram];
  assert.deepEqual([e.st, e.v, e.x, e.z], [MC.HD_LOOSE, MC.HD_RAMV, C, C]);
  assert.equal(fxs(g.v, f0, MC.HD_FX_RAM).at(-1).shot, 256);
  assert.equal(meadow(g.v).left, c.left, 'the sheep still loose, and the ram');
  // against a sheep, the same ball 3 m off each, and one 6.5 m off
  const t = await stage(2);
  const p = t.red[0];
  setS(t.g, 0, { x: 0, z: 2 });
  setS(t.g, 1, { x: 0, z: 9, v: MC.HD_RAMV });
  put(t.g, p, -3, 2);
  put(t.g, t.blue[0], -3, 9);
  t.g.step();
  const want = MC.HD_RFLEE * (1 - 3 / MC.HD_RSCARE) * MC.HD_EASE;
  assert.ok(Math.abs(sheep(t.g, 1).vx - want) < 1e-5 && sheep(t.g, 1).vx > sheep(t.g, 0).vx * 1.3, `the ram ${sheep(t.g, 1).vx}, the sheep ${sheep(t.g, 0).vx}`);
  t.park();
  setS(t.g, 0, { x: 0, z: 2 });
  setS(t.g, 1, { x: 0, z: 9, v: MC.HD_RAMV });
  put(t.g, p, -6.5, 2);
  put(t.g, t.blue[0], -6.5, 9);
  t.g.step();
  assert.ok(sheep(t.g, 1).vx > 0 && sheep(t.g, 0).vx === 0, 'it sees a ball from further');
  t.park();
  setS(t.g, 0, { st: MC.HD_NONE });
  setS(t.g, 1, { x: -10, z: 2, v: MC.HD_RAMV });
  let top = 0;
  for (let k = 0; k < 200; k++) { const s = sheep(t.g, 1); put(t.g, p, s.x - 2, 2); t.g.step(); top = Math.max(top, sheep(t.g, 1).sp); }
  assert.ok(top > MC.HD_RVMAX - 0.2 && top <= MC.HD_RVMAX + 1e-3, `flat out ${top} m/s (a sheep makes ${MC.HD_VMAX})`);
  // the meadow empty of sheep: called at once, on 3 s later; penned, the round is over
  const h = await room(2);
  const hc = meadow(h.v);
  for (let k = 0; k < hc.ns; k++) setS(h, k, { st: MC.HD_PENNED, side: k & 1 });
  const h0 = h.v.fxCount();
  h.step();
  const t0 = h.v.party().t;
  assert.ok(t0 < 100);
  assert.deepEqual(fxs(h.v, h0, MC.HD_FX_RAM).map((x) => [x.tick - h.v.party().start, x.shot]), [[t0 - 1, 0]]);
  assert.deepEqual([flock(h.v)[hc.ns].st, flock(h.v)[hc.ns].at], [MC.HD_CALLED, t0 - 1 + MC.HD_RAMW]);
  for (let k = 0; k < MC.HD_RAMW; k++) h.step();
  assert.equal(flock(h.v)[hc.ns].st, MC.HD_LOOSE);
  assert.deepEqual([meadow(h.v).left, h.v.party().state], [1, L.H_PLAY]);
  // 24 balls: three, the second and third each HD_RAMP after the one before; with the meadow empty, one at a time
  const big = await room(24);
  const bc = meadow(big.v);
  assert.deepEqual([bc.ns, bc.nr], [24, 3]);
  for (let k = 0; k < bc.ns; k++) setS(big, k, { st: MC.HD_PENNED, side: k & 1 });
  big.step();
  assert.deepEqual(flock(big.v).slice(bc.ns).map((x) => x.st), [MC.HD_CALLED, MC.HD_NONE, MC.HD_NONE], 'one called');
  for (let k = 0; k < MC.HD_RAMW + 2; k++) big.step();
  assert.deepEqual(flock(big.v).slice(bc.ns).map((x) => x.st), [MC.HD_LOOSE, MC.HD_NONE, MC.HD_NONE], 'the next waits while one is loose');
  assert.equal(flock(big.v)[bc.ns + 1].at, MC.HD_RAM0 + MC.HD_RAMP);
  setS(big, bc.ns, { st: MC.HD_PENNED, v: MC.HD_RAMV });
  big.step();
  assert.deepEqual(flock(big.v).slice(bc.ns).map((x) => x.st), [MC.HD_PENNED, MC.HD_CALLED, MC.HD_NONE]);
});

test('the bark: a click is a bark from that tick, heard; for HD_BARKT ticks the barker scares HD_BARKK times as far and as hard; another click inside HD_BARKCD is nothing', async () => {
  const { g, red } = await stage(2);
  const p = red[0];
  put(g, p, -7.5, 3);
  setS(g, 0, { x: 0, z: 3 });
  g.step();
  assert.equal(sheep(g, 0).vx, 0, '7.5 m off, it grazes');
  assert.equal(barked(g.v, p), 0);
  const f0 = g.v.fxCount();
  g.step([[L.EV_INPUT, p, partyWord({ use: 1 })]]);
  const t0 = g.v.party().t;
  assert.equal(barked(g.v, p), t0, 'the tick it barked on, plus 1');
  const [x] = fxs(g.v, f0, MC.HD_FX_BARK);
  assert.deepEqual([x.owner, x.size, x.tick - g.v.party().start], [p, MC.HD_SCARE * MC.HD_BARKK, t0 - 1]);
  const want = MC.HD_FLEE * MC.HD_BARKK * (1 - 7.5 / (MC.HD_SCARE * MC.HD_BARKK)) * MC.HD_EASE;
  assert.ok(Math.abs(sheep(g, 0).vx - want) < 1e-5, `it runs: ${sheep(g, 0).vx} (${want})`);
  // 3 m off, half as hard again
  setS(g, 1, { x: -4.5, z: 3 });
  setS(g, 0, { st: MC.HD_NONE });
  g.step();
  assert.ok(Math.abs(sheep(g, 1).vx - MC.HD_VMAX * MC.HD_EASE) < 1e-5, 'held to its top speed all the same');
  // for HD_BARKT ticks, then as any ball
  setS(g, 0, { x: 0, z: 3 });
  setS(g, 1, { st: MC.HD_NONE });
  let last = 0;
  for (let k = 0; k < MC.HD_BARKT + 5; k++) {
    setS(g, 0, { x: 0, z: 3 });
    g.step([[L.EV_INPUT, p, partyWord({ use: k > 20 ? 2 : 1 })]]);
    if (sheep(g, 0).vx > 0) last = g.v.party().t;
  }
  assert.equal(last - t0 + 1, MC.HD_BARKT, 'the bark\'s length');
  assert.equal(barked(g.v, p), t0, 'a click inside the wait is nothing');
  assert.equal(fxs(g.v, f0, MC.HD_FX_BARK).length, 1);
  // after the wait, the next click barks
  while (g.v.party().t < t0 - 1 + MC.HD_BARKCD - 1) g.step([[L.EV_INPUT, p, partyWord({ use: 2 })]]);
  g.step([[L.EV_INPUT, p, partyWord({ use: 3 })]]);
  assert.equal(barked(g.v, p), t0, 'a tick early: nothing');
  g.step([[L.EV_INPUT, p, partyWord({ use: 0 })]]);
  assert.equal(barked(g.v, p), t0 + MC.HD_BARKCD, 'HD_BARKCD after the last');
  assert.equal(fxs(g.v, f0, MC.HD_FX_BARK).length, 2);
});

test('the grid misses no ball: 256 balls all over the meadow, some barking, and every sheep (a ram too) runs as the sum over every ball says', async () => {
  const g = await room(256, { seed: 5 });
  clear(g);
  const c = meadow(g.v);
  let rng = 99;
  const rand = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 2 ** 32; };
  const t = g.v.party().t;
  const balls = [];
  for (let p = 0; p < 256; p++) {
    const x = (rand() * 2 - 1) * (c.hx - c.cr), z = (rand() * 2 - 1) * (c.hz - 1.5), bark = p % 5 === 0;
    put(g, p, x, z);
    // barking from this tick, as its push would leave it
    g.dv.setUint32(rec(p) + L.PG_M, (g.dv.getUint32(rec(p) + L.PG_M, true) & 0xffff) | (bark ? (t + 1) << 16 : 0), true);
    balls.push({ bark });
  }
  // sheep 12 m apart (no neighbours), 4 m or more inside the fence (no lean), out to the grid's far cells
  const spots = [];
  for (let x = -c.hx + 6; x <= c.hx - 6; x += 12) for (let z = -c.hz + 5; z <= c.hz - 5; z += 12) spots.push([x, z]);
  assert.ok(spots.length >= 40 && spots.length <= MC.HD_NMAX);
  spots.forEach(([x, z], k) => setS(g, k, { x, z, v: k % 7 === 3 ? MC.HD_RAMV : 1 }));
  g.step([]);
  // where the balls stood as the sheep were stepped (two laid on top of each other have bumped apart)
  balls.forEach((b, p) => Object.assign(b, { x: local(g, p).x, z: local(g, p).z }));
  let moved = 0;
  spots.forEach(([x, z], k) => {
    const ram = k % 7 === 3;
    let fx = 0, fz = 0;
    for (const b of balls) {
      const bk = b.bark ? MC.HD_BARKK : 1, R = (ram ? MC.HD_RSCARE : MC.HD_SCARE) * bk, F = (ram ? MC.HD_RFLEE : MC.HD_FLEE) * bk;
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < R && d > 1e-3) { fx += (x - b.x) / d * F * (1 - d / R); fz += (z - b.z) / d * F * (1 - d / R); }
    }
    const top = ram ? MC.HD_RVMAX : MC.HD_VMAX, sp = Math.hypot(fx, fz), k2 = sp > top ? top / sp : 1;
    const e = flock(g.v)[k];
    assert.ok(Math.abs(e.vx - fx * k2 * MC.HD_EASE) < 2e-4 && Math.abs(e.vz - fz * k2 * MC.HD_EASE) < 2e-4, `sheep ${k} at ${x}, ${z}: ${e.vx}, ${e.vz} for ${fx * k2 * MC.HD_EASE}, ${fz * k2 * MC.HD_EASE}`);
    if (sp > 0) moved++;
  });
  assert.ok(moved > spots.length * 0.8, `${moved} of ${spots.length} with a ball in sight`);
});

test('the end: with the last one penned the round is over at once, the fuller pen winning, every ball of its side 1st and the rest by their own score', async () => {
  const g = await room(6);
  const c = meadow(g.v);
  const [red, blue] = teams(g, 6);
  // all penned but one sheep: red 3 and blue 3 of them, and blue the ram
  for (let k = 0; k < c.ns; k++) setS(g, k, { st: MC.HD_PENNED, side: k < 4 ? 0 : 1 });
  setS(g, c.ns, { st: MC.HD_PENNED, side: 1, v: MC.HD_RAMV });
  g.dv.setUint32(L.PG_TSCORE, 3, true);
  g.dv.setUint32(L.PG_TSCORE + 4, c.ns - 4 + MC.HD_RAMV, true);
  g.dv.setUint16(rec(blue[0]) + L.PG_SCORE, 5, true);
  g.dv.setUint16(rec(red[1]) + L.PG_SCORE, 2, true);
  red.forEach((p, i) => put(g, p, -4 - i * 2.5, -c.hz + 1.5));
  blue.forEach((p, i) => put(g, p, 4 + i * 2.5, -c.hz + 1.5));
  setS(g, 0, { x: -c.hx + 2.5, z: 0 });
  put(g, red[0], -c.hx + 4.6, 0);
  g.step();
  assert.deepEqual([meadow(g.v).left, g.v.party().state], [1, L.H_PLAY]);
  let k = 0;
  for (; k < 300 && g.v.party().state === L.H_PLAY; k++) g.step();
  const r = g.v.party();
  assert.equal(r.state, L.H_OVER);
  assert.ok(r.t < 600, 'long before the clock');
  assert.equal(sheep(g, 0).at, r.t - 1, 'on the tick it was penned');
  assert.deepEqual([r.tscore, r.twin, meadow(g.v).left], [[4, c.ns - 4 + MC.HD_RAMV], 2, 0]);
  assert.deepEqual([...blue, ...red].map((p) => g.v.partier(p).place), [1, 1, 1, 5, 4, 6], 'blue 1st; red by its own: 1 for the last sheep, 2, 0');
  assert.deepEqual([...blue, ...red].map((p) => g.v.partier(p).wins), [1, 1, 1, 0, 0, 0]);
});

test('at the clock: the fuller pen wins with sheep still out; level pens are a draw, placed by score', async () => {
  const { g, red, blue } = await stage(6);
  setS(g, 0, { x: 0, z: 4 });
  g.dv.setUint32(L.PG_TSCORE, 3, true);
  g.dv.setUint32(L.PG_TSCORE + 4, 2, true);
  g.dv.setUint16(rec(blue[0]) + L.PG_SCORE, 2, true);
  g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 1, true);
  g.step();
  g.step();
  const r = g.v.party();
  assert.equal(r.state, L.H_OVER);
  assert.deepEqual([r.tscore, r.twin], [[3, 2], 1]);
  assert.ok(meadow(g.v).left > 0);
  assert.deepEqual([...red, ...blue].map((p) => g.v.partier(p).place), [1, 1, 1, 4, 5, 5]);
  const t = await stage(4, { seed: 9 });
  t.g.dv.setUint32(L.PG_TSCORE, 1, true);
  t.g.dv.setUint32(L.PG_TSCORE + 4, 1, true);
  t.g.dv.setUint16(rec(t.blue[1]) + L.PG_SCORE, 4, true);
  t.g.dv.setUint32(L.HDR_UNTIL, t.g.v.tick + 1, true);
  t.g.step();
  t.g.step();
  assert.deepEqual([t.g.v.party().tscore, t.g.v.party().twin], [[1, 1], 3]);
  assert.equal(t.g.v.partier(t.blue[1]).place, 1);
  assert.equal(t.g.v.partier(t.red[0]).place, 2);
});

test('a newcomer in play goes to the smaller side and falls in before its own mouth; a ball alone rounds the whole flock up, the ram too, and wins before the clock', async () => {
  const { g, c } = await stage(3);
  assert.deepEqual(g.v.party().tn, [2, 1]);
  g.step([[L.EV_JOIN, 3]]);
  const b = g.v.partier(3);
  assert.equal(b.side, 1);
  assert.ok(!b.out && b.pos[1] > PLAT_Y + 5, 'falling in');
  assert.ok(Math.abs(b.pos[0] - (C + c.hx - MC.HD_BACK)) < 1e-3 && Math.abs(b.pos[2] - C) <= c.hz * 0.6 + 1e-3, `${b.pos[0] - C}, ${b.pos[2] - C}`);
  assert.equal(b.m, MC.HD_M_IN, 'its first push takes its use counter as it stands');
  for (let k = 0; k < 200; k++) g.step();
  assert.ok(g.v.partier(3).ground);
  assert.equal(barked(g.v, 3), 0);
  // alone
  const one = await room(1);
  const oc = meadow(one.v);
  const bot = new Partier(0, 3, 0.8);
  for (let k = 0; k < MC.HD_LEN && one.v.party().state === L.H_PLAY; k++) one.step([[L.EV_INPUT, 0, bot.think(one.v, one.v.tick, 0)]]);
  const r = one.v.party();
  assert.equal(r.state, L.H_OVER);
  assert.ok(r.until - L.P_OVER - r.start < MC.HD_LEN, `all in by ${((r.until - L.P_OVER - r.start) * TICK).toFixed(0)} s`);
  assert.deepEqual([r.tscore, r.twin, one.v.partier(0).place, one.v.partier(0).wins], [[oc.ns + MC.HD_RAMV, 0], 1, 1, 1]);
  assert.ok(one.v.partier(0).score >= oc.ns, `its own: ${one.v.partier(0).score}`);
});

test('the prediction matches the confirmed ball bit for bit: along the fence and round its corners, through its own mouth into its pen and out, against the other side\'s mouth and the ground that rolls it away, barking as it goes', async () => {
  const { g, c, red, blue } = await stage(4);
  const s = g.v.partier(0).side;
  // everyone else in a corner of the far side, out of its way
  [...red, ...blue].filter((p) => p).forEach((p, i) => put(g, p, (i - 1) * 2.6, c.hz - 1.5));
  put(g, 0, dir(s) * (c.hx - 7), 0.8);
  const home = s ? 0 : 8192, away = s ? 8192 : 0;
  // into its own pen and to its back, out through the mouth and across to the other one, at it for two
  // seconds, hopping (the ground rolls a rolling ball away before it gets there: only one in the air
  // comes down against the mouth), along that end's fence into the corner, then anywhere, hopping
  const yaw = (k) => (k < 260 ? home : k < 1050 ? away : k < 1250 ? 4096 : (k * 131) & 16383);
  const words = Array.from({ length: 1500 }, (_, k) => partyWord({ yaw: yaw(k) & 16383, move: k % 90 < 84 ? 1 : 0, hop: (k > 800 && k < 1050 && k % 45 < 3) || (k > 1250 && k % 71 === 9) ? 1 : 0, use: (k / 110) & 3 }));
  let inPen = 0, onFence = 0, rolled = 0, atMouth = 0;
  const watch = () => {
    const m = local(g, 0), u = m.x * dir(s);
    if (u > c.hx) inPen++;
    if (Math.abs(m.z) > c.hz - 1.05 || (Math.abs(u) > c.hx - 1.05 && Math.abs(u) <= c.hx)) onFence++;
    if (Math.hypot(u + c.hx, m.z) < c.ar) rolled++;
    if (u < -c.hx + 1.05 && Math.abs(m.z) < c.gw) atMouth++;
  };
  const n0 = predicted({ ...g, step: (recs) => { g.step(recs); watch(); } }, words);
  assert.ok(n0 >= words.length);
  assert.ok(inPen > 50 && onFence > 50, `in its own pen ${inPen} ticks, against the fence ${onFence}`);
  assert.ok(rolled > 50 && atMouth > 0, `on the other mouth's ground ${rolled} ticks, against the shut mouth ${atMouth}`);
  assert.ok(barked(g.v, 0) > MC.HD_BARKCD, 'it barked, and again');
});

test('the client: the meadow, the fence open at each mouth, the pens, sheep loose and penned and a ram, a ram\'s ring, a bark\'s ring; its HUD and feed; the AI gets behind its sheep on the line to its own mouth, round one it is on the wrong side of, keeps off the other mouth\'s ground, and barks from behind', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const { g, c, red, blue } = await stage(8);
  setS(g, 0, { x: 2, z: 3, vx: 3 });
  setS(g, 1, { x: -4, z: -2 });
  setS(g, 2, { st: MC.HD_PENNED, side: 0, x: -c.hx - 1, z: 0, at: -1000 });
  setS(g, 3, { st: MC.HD_PENNED, side: 1, x: c.hx + 1, z: 0, at: g.v.party().t });
  g.dv.setUint16(SA(3) + MC.HD_SJ, 4, true);
  setS(g, 4, { x: 6, z: 6, v: MC.HD_RAMV });
  g.step([[L.EV_INPUT, red[1], partyWord({ use: 1 })]]);
  const out = () => ({ scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null });
  const o = out();
  const g0 = g.v.party();
  herd.draw(g.v, { tick: g0.tick, t: g0.t * TICK, dt: 0.01, ptick: g0.tick + 6, now: 1000, slot: red[0], pme: g.v.partier(red[0]), own: g.v.partier(red[0]).pos }, o);
  for (let k = 0; k < o.scene.count * 16; k++) assert.ok(Number.isFinite(o.scene.data[k]), 'finite');
  assert.ok(o.scene.count > 150, `the meadow, the fence, the pens, the sheep: ${o.scene.count}`);
  assert.equal(o.casters.length, 5, 'three loose and two penned');
  // a sheep is a woolly body: an ellipsoid longer than wide, one for each, the ram's bigger
  const bodies = [];
  for (let k = 0; k < o.scene.count; k++) if ((o.scene.data[k * 16 + 3] & 3) === 3 && Math.abs(o.scene.data[k * 16 + 4] / o.scene.data[k * 16 + 6] - 0.66 / 0.5) < 1e-3) bodies.push(k);
  assert.equal(bodies.length, 5);
  assert.equal(bodies.filter((k) => o.scene.data[k * 16 + 4] > 0.7).length, 1, 'the ram');
  // the running one faces the way it runs (+x), drawn on from the confirmed tick
  const run = bodies.find((k) => o.scene.data[k * 16 + 15] === 0);
  assert.ok(Math.abs(o.scene.data[run * 16 + 7]) < 1.2 && Math.abs(o.scene.data[run * 16] - (flock(g.v)[0].x + flock(g.v)[0].vx * 0.01)) < 1e-3);
  // the penned: one standing at its place, one on its way there from the mouth
  const [qx, qz] = place(c, 0, 0);
  const stood = bodies.find((k) => o.scene.data[k * 16 + 15] === 2);
  assert.ok(Math.abs(o.scene.data[stood * 16] - qx) < 1e-3 && Math.abs(o.scene.data[stood * 16 + 2] - qz) < 1e-3, 'at its place');
  assert.ok(qx < C - c.hx && qx > C - c.hx - c.pd && Math.abs(qz - C) < c.pw, 'inside red\'s pen');
  const walking = bodies.find((k) => o.scene.data[k * 16 + 15] === 3);
  assert.ok(Math.abs(o.scene.data[walking * 16] - (C + c.hx + 1)) < 0.3, 'just in through the mouth');
  // the mouths' ground and the bark's ring
  assert.equal(o.decals.filter((d) => d.kind === 1 && Math.abs(d.radius - c.ar) < 1e-3).length, 2);
  const bp = g.v.partier(red[1]).pos;
  assert.ok(o.decals.some((d) => d.kind === 0 && Math.abs(d.pos[0] - bp[0]) < 0.1 && Math.abs(d.pos[2] - bp[2]) < 0.1 && d.radius <= MC.HD_SCARE * MC.HD_BARKK), 'the bark');
  // no fence across a mouth
  for (let k = 0; k < o.scene.count; k++) {
    const d = o.scene.data, x = d[k * 16] - C, z = d[k * 16 + 2] - C;
    if (Math.abs(Math.abs(x) - c.hx - 0.15) < 0.05 && d[k * 16 + 1] < PLAT_Y + 1.2 && (d[k * 16 + 3] & 3) === 0) assert.ok(Math.abs(z) > c.gw - 1.3, `a rail across the mouth at ${x}, ${z}`);
  }
  // a ram called: its ring in the middle
  const h = await room(2);
  while (h.v.party().t < MC.HD_RAM0 - 100) h.step();
  const o2 = out();
  herd.draw(h.v, { tick: h.v.tick, dt: 0, now: 0, slot: -1 }, o2);
  assert.ok(o2.decals.some((d) => d.kind === 0 && d.pos[0] === C && d.pos[2] === C), 'the ring where it comes on');
  assert.equal(o2.casters.length, meadow(h.v).ns);
  const lines = [];
  const hctx = { put: () => {}, centre: (y, s) => lines.push(s), right: (y, s) => lines.push(s), rect: () => {}, rows: 44, C: {}, slot: 0, now: 0, t: 0 };
  herd.hud(h.v, hctx);
  assert.ok(lines.includes('LOOSE SHEEP 8  GOLDEN RAM IN 1') && lines.includes('YOU DROVE IN 0  BARK READY'), lines.join(' | '));
  herd.hud(g.v, { ...hctx, slot: red[1] });
  assert.ok(lines.at(-1).startsWith('YOU DROVE IN 0  BARK IN 3.0'), lines.at(-1));
  for (const l of [...lines, herd.hint, herd.rules]) assert.ok(l.length <= 70 && /^[ -_]*$/.test(l), l);
  assert.equal(herd.frame(g.v).shape, 'square');
  assert.deepEqual([herd.facing(g.v, red[0]), herd.facing(g.v, blue[0])], [0, Math.PI]);
  const fctx = { slot: red[0], view: g.v, glow: () => {}, banner: (s) => lines.push(s), feed: (s) => lines.push(s), name: (q) => `P${q + 1}`, dist: 0, now: 0 };
  herd.fx({ kind: MC.HD_FX_PEN, owner: red[0], shot: 3, pos: [C, PLAT_Y, C], size: 1 }, fctx);
  assert.equal(lines.at(-1), 'PENNED!');
  herd.fx({ kind: MC.HD_FX_PEN, owner: blue[2], shot: 8 | 256 | 512, pos: [C, PLAT_Y, C], size: 4 }, fctx);
  assert.equal(lines.at(-1), `P${blue[2] + 1} PENNED A GOLDEN RAM FOR BLUE`);
  herd.fx({ kind: MC.HD_FX_RAM, owner: 255, shot: 0, pos: [C, PLAT_Y, C], size: 3 }, fctx);
  assert.equal(lines.at(-1), 'A GOLDEN RAM IS COMING  TO THE MIDDLE');
  // the brain. One sheep, red's ball on the far side of it from red's mouth: its goal is behind the sheep on that line
  clear(g);
  const think = (p) => { const me = g.v.partier(p); const bot = { slot: p, skill: 0.8, mem: {}, pos: [me.pos[0], me.pos[2]], vel: [me.vel[0], me.vel[2]], rand: () => 0 }; return { me, word: herd.brain.think(g.v, me, bot, g.v.tick), goal: herd.brain.goal(g.v, me, bot) }; };
  setS(g, 0, { x: -5, z: 4 });
  for (let k = 0; k < 4; k++) g.step(); // the bark's wait is still on: 3 s
  const [mx, mz] = mouthAt(c, 0);
  const sent = red.filter((p) => { const q = think(p).goal; return q && Math.hypot(q[0] - (C - 5), q[1] - (C + 4)) < 12; });
  assert.ok(sent.length >= 1, 'a red ball is sent for it');
  put(g, red[0], 0, 5);
  g.step();
  let q = think(red[0]).goal;
  const e0 = flock(g.v)[0];
  const line = Math.atan2(e0.z - mz, e0.x - mx), from = Math.atan2(q[1] - e0.z, q[0] - e0.x);
  assert.ok(Math.abs(line - from) < 0.15 && Math.hypot(q[0] - e0.x, q[1] - e0.z) < 3.6, `behind it, in line with the mouth: ${line}, ${from}`);
  // from the mouth's side of the sheep: round it, outside its sight, not through it
  put(g, red[0], -12, 4);
  g.step();
  q = think(red[0]).goal;
  const e1 = flock(g.v)[0];
  assert.ok(Math.hypot(q[0] - e1.x, q[1] - e1.z) > MC.HD_SCARE, `round it: ${Math.hypot(q[0] - e1.x, q[1] - e1.z).toFixed(1)} m off`);
  // the other mouth's ground is a risk to red, none to blue
  const [bx, bz] = mouthAt(c, 1);
  assert.ok(herd.brain.danger(g.v, bx - 2, bz, g.v.tick, g.v.partier(red[0])) > 0.3);
  assert.equal(herd.brain.danger(g.v, bx - 2, bz, g.v.tick, g.v.partier(blue[0])), 0);
  // a bark: behind its sheep, 3 m off, 8 m from home, the wait over
  clear(g);
  setS(g, 0, { x: -c.hx + 8, z: 0 });
  put(g, red[0], -c.hx + 11, 0);
  for (const p of red.slice(1)) put(g, p, 6 + p, c.hz - 2);
  g.step();
  assert.ok(think(red[0]).word?.use, 'it barks');
  g.step([[L.EV_INPUT, red[0], partyWord({ use: 1 })]]);
  assert.ok(!think(red[0]).word?.use, 'not again inside the wait');
});

// A round of AI balls (client/party-bot.mjs) steered by this minigame's brain on the debug build, stats from it.
async function aiRound(balls, seed) {
  const stats = { start: -1, over: -1, pens: [0, 0], rams: 0, driven: 0, barks: 0, calls: 0, places: null, twin: 0 };
  let seen = 0;
  const r = await playParty({ bytes: partyBytes(true), mg: L.MG_HERD, bots: balls, ticks: 14000, seed, untilRoundOver: true, onTick: (t, sim, v) => {
    assert.equal(sim.error().code, 0, 'no trap');
    const g = v.party();
    for (; seen < v.fxCount(); seen++) {
      const x = v.fx(seen);
      if (x.kind === MC.HD_FX_PEN) { stats.pens[(x.shot >> 8) & 1]++; if (x.shot & 512) stats.rams++; if (x.owner < 255) stats.driven++; }
      if (x.kind === MC.HD_FX_BARK) stats.barks++;
      if (x.kind === MC.HD_FX_RAM && !(x.shot & 256)) stats.calls++;
    }
    if (stats.start < 0 && g.state === L.H_PLAY) stats.start = t;
    if (stats.over < 0 && stats.start >= 0 && g.state === L.H_OVER) {
      stats.over = t;
      stats.twin = g.twin;
      stats.tscore = g.tscore;
      stats.left = meadow(v).left;
      stats.all = meadow(v).ns + meadow(v).nr;
      stats.places = [...Array(balls).keys()].map((p) => v.partier(p).place);
      stats.sides = [...Array(balls).keys()].map((p) => v.partier(p).side);
      stats.scores = [...Array(balls).keys()].map((p) => v.partier(p).score);
    }
  } });
  return { ...r, stats };
}

for (const [balls, seed] of [[8, 5], [64, 4]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, both sides pen sheep, nearly all of them driven in, the rams called and penned, barks, the whole flock in before the clock and the fuller pen winning; equal on 1 and 4 threads`, async () => {
    const { log, sim, stats, games, ticks } = await aiRound(balls, seed);
    assert.equal(sim.error().code, 0);
    assert.ok(games.every((x) => x === L.MG_HERD));
    assert.ok(stats.over > 0, 'the round ended');
    assert.equal(stats.left, 0, `all in: ${stats.pens}`);
    assert.ok(stats.over - stats.start < MC.HD_LEN, `over in ${((stats.over - stats.start) * TICK).toFixed(0)} s`);
    assert.equal(stats.pens[0] + stats.pens[1], stats.all);
    for (const s of [0, 1]) assert.ok(stats.pens[s] >= stats.all / 5, `each side pens: ${stats.pens}`);
    assert.ok(stats.driven >= stats.all * 0.8, `${stats.driven} of ${stats.all} driven in by a ball of the pen's side`);
    assert.deepEqual([stats.rams, stats.calls], [nrams(balls), nrams(balls)]);
    assert.ok(stats.barks >= balls / 2, `${stats.barks} barks`);
    assert.deepEqual([stats.tscore[0] + stats.tscore[1], stats.twin], [stats.all + (MC.HD_RAMV - 1) * stats.rams, stats.tscore[0] > stats.tscore[1] ? 1 : stats.tscore[0] < stats.tscore[1] ? 2 : 3]);
    if (stats.twin !== 3) stats.sides.forEach((s, p) => assert.equal(stats.places[p] === 1, s === stats.twin - 1, `P${p + 1}: the winners share 1st`));
    assert.ok(stats.scores.filter((x) => x > 0).length >= balls / 4, `their own points: ${stats.scores}`);
    const parsed = parseLog(log);
    const n = Math.min(ticks, stats.over + 50);
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}
