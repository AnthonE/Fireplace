// DODGEBALL (src/mg/dodge.wat): the court, the jails and the dodgeballs for
// 1 to 256 balls, the centre line and the walls, pick-ups, throws, hits
// before and after the floor, catches and the lock, a click judged at its own
// tick, throws from jail and the jails' slope, the end and its places, a
// newcomer in play, the prediction bit for bit, the client's flight against
// the sim's and its AI, and rounds of AI balls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y, B_RAD } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/dodge.mjs'; // DB_*: the minigame's own constants
import dodge, { court, balls, slotOf, jailed, fly, launch, reach, dir } from '../client/mg/dodge.mjs';

const C = L.B_CX;
const TICK = 0.008;
const half = (n) => Math.sqrt(Math.max(MC.DB_AMIN, Math.ceil(n / 2) * MC.DB_AREA) / 2);
const nballs = (n) => Math.min(MC.DB_NMAX, Math.max(MC.DB_NMIN, Math.ceil(n / MC.DB_PER)));

// A room of n balls on Dodgeball, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_DODGE + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
const sides = (g, n) => Array.from({ length: n }, (_, p) => g.v.partier(p).side);
// [red slots, blue slots]
const teams = (g, n) => { const s = sides(g, n); return [s.map((x, p) => [x, p]).filter(([x]) => !x).map(([, p]) => p), s.map((x, p) => [x, p]).filter(([x]) => x).map(([, p]) => p)]; };
// Ball p at (x, z) on the floor, rolling at (vx, vz).
function put(g, p, x, z, { vx = 0, vz = 0 } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, PLAT_Y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, (g.dv.getUint8(rec(p) + L.P_FL) & L.PF_BLUE) | L.PF_LIVE | L.PF_GROUND);
}
const BA = (k) => L.PG_S + MC.DB_BALL + k * MC.DB_BSIZE;
const SA = (p) => L.PG_S + MC.DB_SLOT + p * MC.DB_SSIZE;
const ball = (g, k) => balls(g.v).find((b) => b.k === k) || null;
// Dodgeball k set: by default loose and still on the floor at (x, z).
function setBall(g, k, { st = MC.DB_LOOSE, by = 255, side = 0, at = 0, x, y = PLAT_Y + MC.DB_R, z, vx = 0, vy = 0, vz = 0 }) {
  const a = BA(k), dv = g.dv;
  dv.setUint8(a + MC.DB_BST, st);
  dv.setUint8(a + MC.DB_BBY, by);
  dv.setUint8(a + MC.DB_BSIDE, side);
  dv.setUint32(a + MC.DB_BAT, at, true);
  [x, y, z, vx, vy, vz].forEach((val, i) => dv.setFloat32(a + MC.DB_BX + 4 * i, val, true));
}
// Ball p holds dodgeball k.
function hold(g, p, k) {
  setBall(g, k, { st: MC.DB_HELD, by: p, x: 0, z: 0 });
  g.dv.setUint8(SA(p) + MC.DB_HOLD, k + 1);
}
// Every dodgeball off the court (unused), so a test has only its own.
const clear = (g) => { for (let k = 0; k < MC.DB_NMAX; k++) g.dv.setUint8(BA(k) + MC.DB_BST, MC.DB_NONE); for (let p = 0; p < 256; p++) g.dv.setUint8(SA(p) + MC.DB_HOLD, 0); };
const jail = (g, p) => g.dv.setUint32(rec(p) + L.PG_M, MC.DB_JAIL, true);
const playT = (g) => g.v.party().t;
// A ball's clicks: each call a word with its use counter one on.
const clicker = () => { let n = 0; return (yaw = 0, move = 0) => partyWord({ yaw, move, use: ++n & 3 }); };
const yawOf = (a) => Math.round(a / (2 * Math.PI) * 16384) & 16383;
const fxs = (v, from, kind) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
// A room of n with no dodgeballs, every ball in a row on its own half, the rest still.
async function stage(n, opts) {
  const g = await room(n, opts);
  clear(g);
  const c = court(g.v);
  const [red, blue] = teams(g, n);
  red.forEach((p, i) => put(g, p, C - c.hx + 2, C - c.hz + 2 + i * 2.5));
  blue.forEach((p, i) => put(g, p, C + c.hx - 2, C - c.hz + 2 + i * 2.5));
  return { g, c, red, blue };
}

test('the court for 1, 8, 64 and 256: two halves sized for the bigger side, the jails past them, a dodgeball for every 4 on the line, each side in rows on its own half', async () => {
  let last = 0;
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const c = court(g.v);
    assert.equal(r.game, L.MG_DODGE);
    assert.deepEqual([r.kind, r.len, r.flags], [L.PK_SCORE, MC.DB_LEN, L.PGF_BUMPS | L.PGF_TEAMS]);
    assert.ok(Math.abs(c.hx - half(n)) < 1e-4 && c.hx >= last, `${c.hx} m for ${n}`);
    last = c.hx;
    assert.equal(c.hz, c.hx);
    assert.ok(Math.abs(c.jd - Math.max(MC.DB_JMIN, Math.ceil(n / 2) * MC.DB_JAREA / (2 * c.hx))) < 1e-4);
    assert.ok(Math.abs(r.size - (c.hx + c.jd)) < 1e-4);
    const list = balls(g.v);
    assert.equal(c.nb, nballs(n));
    assert.equal(list.length, nballs(n), `${list.length} dodgeballs for ${n}`);
    for (const b of list) {
      assert.deepEqual([b.st, b.by, b.x, b.y], [MC.DB_LOOSE, 255, C, Math.fround(PLAT_Y + MC.DB_R)]);
      assert.ok(Math.abs(b.z - C) < c.hz * 0.9);
    }
    assert.deepEqual(r.tn, [Math.ceil(n / 2), Math.floor(n / 2)]);
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y);
      const deep = (b.pos[0] - C) * dir(b.side);
      assert.ok(deep >= 1 + B_RAD && deep <= c.hx - MC.DB_BACK + 1e-3, `${n}: P${p + 1} on its half, ${deep} m back`);
      assert.ok(Math.abs(b.pos[2] - C) <= c.hz - B_RAD, `${n}: P${p + 1} inside the walls`);
      for (let q = 0; q < p; q++) {
        const o = g.v.partier(q);
        assert.ok(Math.hypot(b.pos[0] - o.pos[0], b.pos[2] - o.pos[2]) > 2.3, `${n}: P${p + 1} and P${q + 1} apart`);
      }
    }
  }
});

test('the centre line and the walls: a ball rolling at the line stops on its side of it and bounces softly; a jailed one is kept in its jail', async () => {
  const { g, c, red, blue } = await stage(4);
  const [r, b] = [red[0], blue[0]];
  put(g, r, C - 3, C, { vx: 8 });
  put(g, b, C + 3, C + 4, { vx: -8 });
  for (let k = 0; k < 250; k++) {
    g.step([[L.EV_INPUT, r, partyWord({ yaw: 0, move: 1 })], [L.EV_INPUT, b, partyWord({ yaw: 8192, move: 1 })]]);
    assert.ok(g.v.partier(r).pos[0] <= C - B_RAD && g.v.partier(b).pos[0] >= C + B_RAD, 'never over it');
  }
  assert.ok(Math.abs(g.v.partier(r).pos[0] - (C - B_RAD)) < 0.01, `red pressed to the line: ${g.v.partier(r).pos[0] - C}`);
  assert.ok(Math.abs(g.v.partier(b).pos[0] - (C + B_RAD)) < 0.01, `blue too: ${g.v.partier(b).pos[0] - C}`);
  // off the side wall, softly
  put(g, r, C - 4, C + c.hz - 1.5, { vz: 10 });
  g.step([[L.EV_INPUT, r, partyWord({ yaw: 0 })]]);
  for (let k = 0; k < 14; k++) g.step();
  assert.ok(g.v.partier(r).pos[2] <= C + c.hz - B_RAD + 1e-4);
  assert.ok(g.v.partier(r).vel[2] < 0 && g.v.partier(r).vel[2] > -10 * MC.DB_PE, `back at ${g.v.partier(r).vel[2]}`);
  // in jail (red's, past blue's back line): kept in it, out of the court
  jail(g, r);
  put(g, r, C + c.hx + c.jd / 2, C, { vx: -9 });
  for (let k = 0; k < 300; k++) {
    g.step([[L.EV_INPUT, r, partyWord({ yaw: 8192, move: 1 })]]);
    assert.ok(g.v.partier(r).pos[0] >= C + c.hx + B_RAD - 1e-4, 'never out of it');
  }
  assert.ok(Math.abs(g.v.partier(r).pos[0] - (C + c.hx + B_RAD)) < 0.01, `pressed to its jail's front: ${g.v.partier(r).pos[0] - C}`);
});

test('pick-ups: rolling over a loose dodgeball holds it, one at most; a held one goes with its holder, and is dropped when its holder leaves', async () => {
  const { g, red } = await stage(4);
  const p = red[0];
  setBall(g, 0, { x: C - 6, z: C });
  setBall(g, 1, { x: C - 6.5, z: C + 0.5 });
  put(g, p, C - 9, C, { vx: 6 });
  for (let k = 0; k < 80 && slotOf(g.v, p).hold < 0; k++) g.step([[L.EV_INPUT, p, partyWord({ yaw: 0, move: 1 })]]);
  const s = slotOf(g.v, p);
  assert.ok(s.hold === 0 || s.hold === 1, 'holds one');
  const other = 1 - s.hold;
  for (let k = 0; k < 60; k++) g.step([[L.EV_INPUT, p, partyWord({ yaw: 0, move: 1 })]]);
  assert.equal(ball(g, other).st, MC.DB_LOOSE, 'the other stays loose');
  const h = ball(g, s.hold);
  assert.deepEqual([h.st, h.by], [MC.DB_HELD, p]);
  const at = g.v.partier(p).pos;
  assert.deepEqual([h.x, h.z], [at[0], at[2]], 'with its holder');
  // the holder leaves: dropped
  g.step([[L.EV_LEAVE, p]]);
  assert.equal(ball(g, s.hold).st, MC.DB_LOOSE);
});

test('a throw: a click goes the way the ball faces, DB_V and DB_LOFT up, from past its skin; flown as $db_fly flies it (the client\'s fly) to the floor, loose', async () => {
  const { g, c, red } = await stage(4);
  const p = red[0];
  put(g, p, C - 7, C - 2);
  hold(g, p, 0);
  const click = clicker();
  const yaw = 0.3;
  const from = g.v.fxCount();
  g.step([[L.EV_INPUT, p, click(yawOf(yaw))]]);
  const b = ball(g, 0);
  assert.deepEqual([b.st, b.by, b.side], [MC.DB_FLY, p, 0]);
  assert.equal(slotOf(g.v, p).hold, -1);
  assert.equal(slotOf(g.v, p).throws, 1);
  const a = Math.round(yaw / (2 * Math.PI) * 16384) / 16384 * 2 * Math.PI;
  assert.ok(Math.abs(Math.atan2(b.vz, b.vx) - a) < 1e-3 && Math.abs(Math.hypot(b.vx, b.vz) - MC.DB_V) < 1e-3, 'its way, its speed');
  const l = launch(C - 7, PLAT_Y, C - 2, a);
  // one tick of flight already: back it off to the launch
  assert.ok(Math.abs(b.x - b.vx * TICK - l.x) < 2e-3 && Math.abs(b.z - b.vz * TICK - l.z) < 2e-3, `from its front: ${[b.x - b.vx * TICK - l.x, b.z - b.vz * TICK - l.z]}`);
  assert.equal(fxs(g.v, from, MC.DB_FX_THROW).length, 1);
  // the client flies it on as the sim does, through the floor's bounce and a wall
  const js = fly({ ...b }, c, 0);
  const sim = [];
  for (let k = 0; k < 240; k++) { g.step(); sim.push(ball(g, 0)); }
  let x = { ...b };
  for (let k = 0; k < 240; k++) {
    x = fly(x, c, 1);
    assert.ok(Math.abs(x.x - sim[k].x) < 1e-3 && Math.abs(x.y - sim[k].y) < 1e-3 && Math.abs(x.z - sim[k].z) < 1e-3, `${k + 1} ticks on`);
  }
  assert.equal(js.x, b.x);
  assert.equal(ball(g, 0).st, MC.DB_LOOSE, 'loose once it touched the floor');
});

test('a hit: a throw that meets a ball of the other side before the floor sends it to its jail past the thrower\'s back line, a point and a KO to the thrower; a teammate it passes through', async () => {
  const { g, c, red, blue } = await stage(6);
  const [p, mate] = red, q = blue[0];
  put(g, p, C - 5, C);
  put(g, mate, C - 3, C + 0.3);
  put(g, q, C + 6, C);
  hold(g, p, 0);
  const click = clicker();
  const from = g.v.fxCount();
  g.step([[L.EV_INPUT, p, click(0)]]);
  for (let k = 0; k < 90 && !jailed(g.v, q); k++) g.step();
  assert.ok(jailed(g.v, q), 'jailed');
  assert.ok(!jailed(g.v, mate), 'the teammate it passed through');
  const b = g.v.partier(q);
  assert.ok(Math.abs(b.pos[0] - (C - c.hx - c.jd / 2)) < 1e-4, `blue's jail is past red's back line: ${b.pos[0] - C}`);
  assert.deepEqual([g.v.partier(p).score, g.v.partier(p).kos, slotOf(g.v, p).hits], [1, 1, 1]);
  assert.equal(b.hitBy, p);
  const [h] = fxs(g.v, from, MC.DB_FX_HIT);
  assert.deepEqual([h.owner, h.shot & 255, h.shot >> 8], [q, p, 0]);
  assert.equal(ball(g, 0).st, MC.DB_LOOSE);
  assert.ok(ball(g, 0).vx < 0, 'it bounces back off it');
  assert.deepEqual(g.v.party().tscore, [3, 2], 'the sides in play');
});

test('once it has touched the floor a throw is dead: rolling into a foe it does nothing', async () => {
  const { g, blue } = await stage(4);
  const q = blue[0];
  put(g, q, C + 4, C);
  // thrown by red, low and bouncing in front of the foe
  setBall(g, 0, { st: MC.DB_FLY, by: 0, side: 0, x: C + 1, y: PLAT_Y + MC.DB_R + 0.02, z: C, vx: 12, vy: -5 });
  g.step();
  assert.equal(ball(g, 0).st, MC.DB_LOOSE, 'loose on the floor');
  for (let k = 0; k < 60; k++) g.step();
  assert.ok(!jailed(g.v, q), 'not a hit');
});

test('a catch: a click with nothing held as an enemy throw comes in within reach holds it, two points, the thrower to jail and the catcher\'s longest jailed back; out of reach, or going away, a miss that locks', async () => {
  const { g, c, red, blue } = await stage(6);
  const [p, j1, j2] = red, q = blue[0];
  put(g, p, C - 6, C);
  put(g, q, C + 5, C);
  jail(g, j1); g.dv.setUint32(SA(j1) + MC.DB_JAILT, 10, true);
  jail(g, j2); g.dv.setUint32(SA(j2) + MC.DB_JAILT, 4, true);
  put(g, j1, C + c.hx + 2, C); put(g, j2, C + c.hx + 2, C + 3);
  const sp = MC.DB_V;
  const click = clicker();
  // too far: a miss, locked
  setBall(g, 0, { st: MC.DB_FLY, by: q, side: 1, x: C + 3, y: PLAT_Y + 1.3, z: C, vx: -sp, vy: 0 });
  let from = g.v.fxCount();
  g.step([[L.EV_INPUT, p, click(8192)]]);
  assert.equal(fxs(g.v, from, MC.DB_FX_WHIFF).length, 1);
  assert.ok(slotOf(g.v, p).lock > playT(g) + MC.DB_LOCK - 3);
  // locked: a click in reach misses too, and locks again
  setBall(g, 0, { st: MC.DB_FLY, by: q, side: 1, x: C - 6 + 3, y: PLAT_Y + 1.3, z: C, vx: -sp, vy: 0 });
  from = g.v.fxCount();
  g.step([[L.EV_INPUT, p, click(8192)]]);
  assert.equal(fxs(g.v, from, MC.DB_FX_WHIFF)[0]?.shot, 1, 'still locked');
  // unlocked, in reach and coming: caught
  g.dv.setUint16(SA(p) + MC.DB_LOCKT, 0, true);
  setBall(g, 0, { st: MC.DB_FLY, by: q, side: 1, x: C - 6 + reach(sp) - 0.3, y: PLAT_Y + 1.3, z: C, vx: -sp, vy: 0 });
  from = g.v.fxCount();
  g.step([[L.EV_INPUT, p, click(8192)]]);
  const [f] = fxs(g.v, from, MC.DB_FX_CATCH);
  assert.ok(f, 'caught');
  assert.deepEqual([f.owner, f.shot & 255, f.shot >> 8], [p, q, j2], 'the thrower, and the longest jailed back');
  assert.deepEqual([ball(g, 0).st, ball(g, 0).by, slotOf(g.v, p).hold], [MC.DB_HELD, p, 0]);
  assert.equal(g.v.partier(p).score, 2);
  assert.ok(jailed(g.v, q) && !jailed(g.v, j2) && jailed(g.v, j1));
  assert.ok(Math.abs(g.v.partier(j2).pos[0] - (C - c.hx + MC.DB_BACK)) < 1e-4, 'back at its own back line');
  // going away from it: no catch
  clear(g);
  put(g, p, C - 6, C);
  setBall(g, 1, { st: MC.DB_FLY, by: blue[1], side: 1, x: C - 6 - 2, y: PLAT_Y + 1.3, z: C, vx: -sp, vy: 0 });
  from = g.v.fxCount();
  g.step([[L.EV_INPUT, p, click(8192)]]);
  assert.equal(fxs(g.v, from, MC.DB_FX_CATCH).length, 0, 'gone past');
});

test('a click is judged at the tick of its own word: on the tick the throw would land, caught; a tick later, jailed', async () => {
  for (const late of [0, 1]) {
    const { g, red, blue } = await stage(4, { seed: 11 });
    const p = red[0], q = blue[0];
    put(g, p, C - 6, C);
    put(g, q, C + 6, C);
    setBall(g, 0, { st: MC.DB_FLY, by: q, side: 1, x: C, y: PLAT_Y + B_RAD, z: C, vx: -MC.DB_V, vy: 0 });
    // the tick it would land: flown on till it's within a hit of P's centre
    let n = 0;
    for (let b = fly({ ...ball(g, 0) }, court(g.v), 0); n < 100; n++) {
      b = fly(b, court(g.v), 1);
      if (Math.hypot(b.x - (C - 6), b.y - (PLAT_Y + B_RAD), b.z - C) < B_RAD + MC.DB_R) break;
    }
    for (let k = 0; k < n + late; k++) g.step();
    const click = clicker();
    g.step([[L.EV_INPUT, p, click(8192)]]);
    assert.equal(jailed(g.v, p), late === 1, late ? 'a tick late: jailed' : 'on its tick: caught');
    assert.equal(slotOf(g.v, p).catches, late ? 0 : 1);
  }
});

test('from jail: a prisoner holds what rolls in, throws at the side in front of it, and a hit brings it back; a jail\'s floor rolls what nobody takes back to the court', async () => {
  const { g, c, red, blue } = await stage(4);
  const p = red[0], q = blue[0];
  jail(g, p);
  put(g, p, C + c.hx + 2, C);
  put(g, q, C + 4, C);
  // the slope: a loose ball deep in a jail rolls out toward the court
  setBall(g, 1, { x: C - c.hx - c.jd + 0.6, z: C + 3 });
  // one rolling past the prisoner
  setBall(g, 0, { x: C + c.hx + 2.4, z: C });
  g.step();
  assert.equal(slotOf(g.v, p).hold, 0, 'the prisoner has it');
  const click = clicker();
  g.step([[L.EV_INPUT, p, click(8192)]]);
  assert.equal(ball(g, 0).st, MC.DB_FLY);
  for (let k = 0; k < 90 && !jailed(g.v, q); k++) g.step();
  assert.ok(jailed(g.v, q), 'hit from behind');
  assert.ok(!jailed(g.v, p), 'and back');
  assert.ok(Math.abs(g.v.partier(p).pos[0] - (C - c.hx + MC.DB_BACK)) < 1e-4, 'at its own back line');
  for (let k = 0; k < 600; k++) g.step();
  assert.ok(Math.abs(ball(g, 1).x - C) < c.hx + 0.5, `rolled back out: ${ball(g, 1).x - C}`);
});

test('the end: a side with none in play loses, its balls placed after the winners by their own score; at the clock the side with more in play wins', async () => {
  const { g, red, blue } = await stage(6);
  g.dv.setUint16(rec(blue[0]) + L.PG_SCORE, 4, true);
  g.dv.setUint16(rec(blue[1]) + L.PG_SCORE, 1, true);
  jail(g, blue[0]); jail(g, blue[1]); jail(g, red[0]);
  g.step();
  assert.equal(g.v.hole().state, L.H_PLAY, 'blue has one left');
  jail(g, blue[2]);
  g.step();
  const r = g.v.party();
  assert.equal(r.state, L.H_OVER);
  assert.equal(r.twin, 1);
  assert.deepEqual([...red, ...blue].map((p) => g.v.partier(p).place), [1, 1, 1, 4, 5, 6]);
  assert.deepEqual([...red, ...blue].map((p) => g.v.partier(p).pts), [10, 10, 10, 4, 2, 1]);
  assert.deepEqual([...red, ...blue].map((p) => g.v.partier(p).wins), [1, 1, 1, 0, 0, 0], 'the jailed red too');
  // at the clock: 2 blue in play against 1 red
  const t = await stage(4, { seed: 9 });
  jail(t.g, t.red[0]);
  t.g.step();
  t.g.dv.setUint32(L.HDR_UNTIL, t.g.v.tick, true);
  t.g.step();
  assert.equal(t.g.v.party().twin, 2);
  assert.deepEqual(t.blue.map((p) => t.g.v.partier(p).place), [1, 1]);
});

test('a newcomer in play goes to the smaller side and falls in at its back line, in play; a ball alone plays to the clock', async () => {
  const { g, c } = await stage(3);
  assert.deepEqual(g.v.party().tn, [2, 1]);
  g.step([[L.EV_JOIN, 3]]);
  const b = g.v.partier(3);
  assert.equal(b.side, 1);
  assert.ok(!b.out && b.pos[1] > PLAT_Y + 5, 'falling in');
  assert.ok(Math.abs(b.pos[0] - (C + c.hx - MC.DB_BACK)) < 1e-4);
  for (let k = 0; k < 200; k++) g.step();
  assert.ok(g.v.partier(3).ground && !jailed(g.v, 3));
  assert.equal(g.dv.getUint32(rec(3) + L.PG_M, true), MC.DB_PLAY);
  assert.deepEqual(g.v.party().tscore, [2, 2]);
  const one = await room(1);
  for (let k = 0; k < 300; k++) one.step();
  assert.equal(one.v.hole().state, L.H_PLAY, 'red alone, blue never had one');
});

test('the prediction matches the confirmed ball bit for bit: rolling into the line and the walls, clicking and throwing, and kept in its jail', async () => {
  const { g, c } = await stage(4);
  const s = g.v.partier(0).side;
  put(g, 0, C + dir(s) * 4, C);
  hold(g, 0, 0);
  setBall(g, 1, { x: C + dir(s) * 6, z: C + 3 });
  let n = 0;
  const toLine = s ? 8192 : 0;
  const words = Array.from({ length: 160 }, (_, k) => partyWord({ yaw: (toLine + k * 61) & 16383, move: k % 40 < 34 ? 1 : 0, use: k % 29 === 7 ? ++n & 3 : n & 3 }));
  assert.ok(predicted(g, words) >= words.length);
  assert.ok(slotOf(g.v, 0).throws >= 1, 'threw');
  // in jail: rolling at its walls
  jail(g, 0);
  put(g, 0, C - dir(s) * (c.hx + c.jd / 2), C);
  const run = Array.from({ length: 120 }, (_, k) => partyWord({ yaw: (k * 300) & 16383, move: 1 }));
  assert.ok(predicted(g, run) >= run.length);
  const x = (g.v.partier(0).pos[0] - C) * -dir(s);
  assert.ok(x >= c.hx + B_RAD - 1e-4 && x <= c.hx + c.jd - B_RAD + 1e-4, `in its jail: ${x}`);
});

test('the client: the court, the dodgeballs, your arc and your reach drawn; its HUD; the AI ball fetches, throws with lead at the nearest foe, catches and dodges, and stays on its half', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const { g, red, blue } = await stage(12);
  const p = red[0];
  put(g, p, C - 5, C);
  hold(g, p, 0);
  setBall(g, 1, { st: MC.DB_FLY, by: blue[0], side: 1, x: C + 2, y: PLAT_Y + 1.3, z: C, vx: -MC.DB_V, vy: 0 });
  setBall(g, 2, { x: C - 2, z: C + 4 });
  g.step();
  const out = () => ({ scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null });
  const o = out();
  const g0 = g.v.party();
  dodge.draw(g.v, { tick: g0.tick, t: g0.t * TICK, dt: 0, ptick: g0.tick + 6, now: 0, slot: p, pme: g.v.partier(p), own: g.v.partier(p).pos }, o);
  for (let k = 0; k < o.scene.count * 16; k++) assert.ok(Number.isFinite(o.scene.data[k]), 'finite');
  assert.ok(o.scene.count > 20, 'the court, the jails, the walls, the balls');
  assert.ok(o.beams.length >= 3, 'your arc');
  assert.ok(o.casters.length >= 3, 'the dodgeballs\' shadows');
  // empty-handed with a throw coming: your reach
  g.dv.setUint8(SA(p) + MC.DB_HOLD, 0);
  setBall(g, 0, { x: C - 8, z: C - 8 });
  const o2 = out();
  dodge.draw(g.v, { tick: g0.tick, t: g0.t * TICK, dt: 0, ptick: g0.tick, now: 0, slot: p, pme: g.v.partier(p), own: g.v.partier(p).pos }, o2);
  assert.ok(o2.decals.some((d) => Math.abs(d.radius - reach(MC.DB_V)) < 0.2), 'your reach');
  const lines = [];
  const hctx = { put: () => {}, centre: (y, s) => lines.push(s), right: (y, s) => lines.push(s), rect: () => {}, rows: 44, C: {}, slot: p, now: 0, t: g0.t * TICK };
  dodge.hud(g.v, hctx);
  assert.ok(lines.some((l) => l.startsWith('INCOMING')), lines.join(' | '));
  for (const l of [...lines, dodge.hint, dodge.rules]) assert.ok(l.length <= 70 && /^[ -_]*$/.test(l), l);
  assert.equal(dodge.frame(g.v).shape, 'square');
  // the brain: the throw coming in, it either catches or dodges (never stands)
  const bot = { slot: p, mem: {}, skill: 1, pos: [C - 5, C], vel: [0, 0], rand: () => 0.5 };
  const words = [];
  for (let k = 0; k < 40 && !words.at(-1)?.use && !jailed(g.v, p); k++) {
    words.push(dodge.brain.think(g.v, g.v.partier(p), bot, g.v.tick + 2));
    g.step();
  }
  assert.ok(words.some((w) => w && (w.use || w.move)), 'catches or dodges');
  // holding, with a foe running across: it throws ahead of it
  clear(g);
  put(g, p, C - 4, C);
  put(g, blue[0], C + 8, C - 4, { vz: 6 });
  put(g, blue[1], C + 14, C + 12);
  put(g, blue[2], C + 14, C - 12);
  hold(g, p, 0);
  g.step();
  const b2 = { slot: p, mem: {}, skill: 1, pos: [C - 4, C], vel: [0, 0], rand: () => 0.5 };
  let w2 = null;
  for (let k = 0; k < 300 && !w2?.use; k++) { w2 = dodge.brain.think(g.v, g.v.partier(p), b2, g.v.tick); g.dv.setUint32(L.HDR_TICK, g.v.tick + 1, true); }
  assert.ok(w2?.use, 'throws');
  const to = g.v.partier(blue[0]).pos;
  const at = Math.atan2(to[2] - C, to[0] - (C - 4));
  assert.ok(w2.yaw > at, `ahead of it: ${w2.yaw} past ${at}`);
  // empty-handed: off for the loose ball on its half; never a goal off its half
  setBall(g, 2, { x: C - 3, z: C + 5 });
  g.dv.setUint8(SA(p) + MC.DB_HOLD, 0);
  setBall(g, 0, { st: MC.DB_NONE, x: 0, z: 0 });
  g.v._db = null;
  const goal = dodge.brain.goal(g.v, g.v.partier(p), { pos: [C - 4, C], mem: {} });
  assert.deepEqual(goal.map((x) => Math.round(x * 10) / 10), [C - 3, C + 5]);
  for (const q of [...red, ...blue]) {
    const gl = dodge.brain.goal(g.v, g.v.partier(q), { pos: [g.v.partier(q).pos[0], g.v.partier(q).pos[2]], mem: {} });
    if (gl && !jailed(g.v, q)) assert.ok((gl[0] - C) * dir(g.v.partier(q).side) >= 0, `P${q + 1}'s goal on its half`);
  }
});

// A round of AI balls (client/party-bot.mjs) steered by this minigame's brain on the debug build, stats from it.
async function aiRound(balls, ticks, seed) {
  const stats = { start: -1, over: -1, throws: 0, hits: 0, catches: 0, places: null, twin: 0, off: 0 };
  let seen = 0;
  const r = await playParty({ bytes: partyBytes(true), mg: L.MG_DODGE, bots: balls, ticks, seed, onTick: (t, sim, v) => {
    const g = v.party();
    for (; seen < v.fxCount(); seen++) {
      const x = v.fx(seen);
      if (stats.over >= 0 || stats.start < 0) continue;
      if (x.kind === MC.DB_FX_THROW) stats.throws++;
      if (x.kind === MC.DB_FX_HIT) stats.hits++;
      if (x.kind === MC.DB_FX_CATCH) stats.catches++;
    }
    if (stats.start < 0 && g.state === L.H_PLAY) stats.start = t;
    if (stats.start >= 0 && stats.over < 0 && g.state === L.H_PLAY) {
      for (let p = 0; p < balls; p++) {
        const b = v.partier(p);
        if (b.live && !b.out && !jailed(v, p) && (b.pos[0] - C) * dir(b.side) < B_RAD - 1e-3) stats.off++;
      }
    }
    if (stats.over < 0 && stats.start >= 0 && g.state === L.H_OVER) {
      stats.over = t;
      stats.twin = g.twin;
      stats.places = [...Array(balls).keys()].map((p) => v.partier(p).place);
      stats.pts = [...Array(balls).keys()].map((p) => v.partier(p).pts);
      stats.sides = [...Array(balls).keys()].map((p) => v.partier(p).side);
    }
  } });
  return { ...r, stats };
}

for (const [balls, ticks, seed] of [[8, 10000, 3], [64, 16500, 5]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, thrown, hit and caught till a side is out, each on its own half; equal on 1 and 4 threads`, async () => {
    const { log, sim, stats, games } = await aiRound(balls, ticks, seed);
    assert.equal(sim.error().code, 0);
    assert.ok(games.every((x) => x === L.MG_DODGE));
    assert.ok(stats.over > 0, 'the round ended');
    const secs = (stats.over - stats.start) * TICK;
    assert.ok(secs > 5 && secs <= MC.DB_LEN * TICK + 0.01, `${secs.toFixed(1)} s of play`);
    assert.ok(stats.throws >= balls && stats.hits >= balls / 2 && stats.catches >= 1, `${stats.throws} throws, ${stats.hits} hits, ${stats.catches} catches`);
    assert.equal(stats.off, 0, 'never over the line');
    assert.ok(stats.twin === 1 || stats.twin === 2);
    stats.sides.forEach((s, p) => assert.equal(stats.places[p] === 1, s === stats.twin - 1, `P${p + 1}: the winners share 1st`));
    assert.ok(stats.pts.every((x) => x >= 1 && x <= 10), `points ${stats.pts}`);
    const parsed = parseLog(log);
    const n = stats.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}
