// VOLLEYBALL (src/mg/volley.wat): the court, the net and the volleyballs for
// 1 to 256 balls, the net and the walls, the serve, a bump and a spike, a dig,
// the cooldowns, a point and the serve after it, the fourth touch, the
// volleyball off the net and the walls, the end and its places, a newcomer
// in play, the prediction bit for bit, the client's flight against the sim's
// and its AI, and rounds of AI balls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y, B_RAD } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/volley.mjs'; // VB_*: the minigame's own constants
import volley, { court, balls, slotOf, fly, landing, touch, dir } from '../client/mg/volley.mjs';

const C = L.B_CX;
const TICK = 0.008;
const f = Math.fround;
const area = (n) => Math.max(MC.VB_AMIN, Math.ceil(n / 2) * MC.VB_AREA);
const depth = (n) => Math.min(Math.sqrt(area(n) / 2), MC.VB_HXMAX);
const nballs = (n) => Math.min(MC.VB_NMAX, Math.max(MC.VB_NMIN, Math.ceil(n / MC.VB_PER)));

// A room of n balls on Volleyball, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_VOLLEY + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
const teams = (g, n) => { const s = Array.from({ length: n }, (_, p) => g.v.partier(p).side); return [0, 1].map((x) => s.map((y, p) => [y, p]).filter(([y]) => y === x).map(([, p]) => p)); };
// Ball p at (x, z), on the floor (or y over it, in the air rising vy), rolling at (vx, vz).
function put(g, p, x, z, { vx = 0, vz = 0, y = 0, vy = 0 } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, PLAT_Y + y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, vy, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, (g.dv.getUint8(rec(p) + L.P_FL) & L.PF_BLUE) | L.PF_LIVE | (y > 0 ? 0 : L.PF_GROUND));
}
const BA = (k) => L.PG_S + MC.VB_BALL + k * MC.VB_BSIZE;
const ball = (g, k) => balls(g.v).find((b) => b.k === k) || null;
// Volleyball k set: by default flying, untouched, at (x, y, z), still.
function setVb(g, k, { st = MC.VB_FLY, by = 255, side = 255, n = 0, at = -1000, next = 1e6, serve = 0, x, y, z, vx = 0, vy = 0, vz = 0 }) {
  const a = BA(k), dv = g.dv;
  dv.setUint8(a + MC.VB_BST, st);
  dv.setUint8(a + MC.VB_BBY, by);
  dv.setUint8(a + MC.VB_BSIDE, side);
  dv.setUint8(a + MC.VB_BN, n);
  dv.setInt32(a + MC.VB_BAT, at, true);
  dv.setInt32(a + MC.VB_BNEXT, next, true);
  dv.setUint8(a + MC.VB_BSERVE, serve);
  [x, y, z, vx, vy, vz].forEach((val, i) => dv.setFloat32(a + MC.VB_BX + 4 * i, val, true));
}
// Every volleyball off the court (waiting for ever), so a test has only its own.
const clear = (g) => { for (let k = 0; k < MC.VB_NMAX; k++) { g.dv.setUint8(BA(k) + MC.VB_BST, MC.VB_WAIT); g.dv.setInt32(BA(k) + MC.VB_BNEXT, 1e6, true); } };
const playT = (g) => g.v.party().t;
const fxs = (v, from, kind) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
// A room of n with no volleyballs in play, each side's balls in a row near its back line, still.
async function stage(n, opts) {
  const g = await room(n, opts);
  clear(g);
  const c = court(g.v);
  const [red, blue] = teams(g, n);
  red.forEach((p, i) => put(g, p, C - c.hx + 1.5, C - c.hz + 1.5 + i * 2.5));
  blue.forEach((p, i) => put(g, p, C + c.hx - 1.5, C - c.hz + 1.5 + i * 2.5));
  return { g, c, red, blue };
}

test('the court for 1, 8, 64 and 256: two halves sized for the bigger side, no deeper than VB_HXMAX, a volleyball for every 8 waiting in its lane at its server\'s back line, each side in a grid on its own half', async () => {
  let last = 0;
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const c = court(g.v);
    assert.equal(r.game, L.MG_VOLLEY);
    assert.deepEqual([r.kind, r.len, r.flags], [L.PK_SCORE, MC.VB_LEN, L.PGF_BUMPS | L.PGF_TEAMS]);
    assert.deepEqual([r.acc, r.idle, r.hop], [f(MC.VB_ACC), f(MC.VB_IDLE), f(MC.VB_HOP)]);
    assert.ok(Math.abs(c.hx - depth(n)) < 1e-4 && c.hx >= last, `${c.hx} m deep for ${n}`);
    assert.ok(Math.abs(2 * c.hx * c.hz - area(n)) < 1e-2 && c.hz >= c.hx - 1e-5, `${c.hz} m half wide for ${n}`);
    last = c.hx;
    assert.equal(r.size, c.hz);
    assert.equal(c.nb, nballs(n));
    assert.equal(c.goal, MC.VB_GOAL0 + (nballs(n) - 1) * MC.VB_GOALK);
    const list = balls(g.v);
    assert.equal(list.length, nballs(n), `${list.length} volleyballs for ${n}`);
    list.forEach((b, k) => {
      assert.deepEqual([b.st, b.by, b.side, b.next], [MC.VB_WAIT, 255, 255, MC.VB_FIRST + k * MC.VB_STAGGER]);
      assert.ok(Math.abs((b.x - C) * dir(b.serve) - (c.hx - MC.VB_SBACK)) < 1e-4, 'at its server\'s back line');
      assert.ok(Math.abs(b.z - (C + ((k + 0.5) * 2 / c.nb - 1) * c.hz)) < 1e-3, 'in its lane');
      if (k) assert.equal(b.serve, 1 - list[k - 1].serve, 'the sides take turns');
    });
    assert.deepEqual(r.tn, [Math.ceil(n / 2), Math.floor(n / 2)]);
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y);
      const deep = (b.pos[0] - C) * dir(b.side);
      assert.ok(deep >= B_RAD && deep <= c.hx - B_RAD, `${n}: P${p + 1} on its half, ${deep} m back`);
      assert.ok(Math.abs(b.pos[2] - C) <= c.hz - B_RAD, `${n}: P${p + 1} inside the walls`);
      for (let q = 0; q < p; q++) {
        const o = g.v.partier(q);
        assert.ok(Math.hypot(b.pos[0] - o.pos[0], b.pos[2] - o.pos[2]) > 2.3, `${n}: P${p + 1} and P${q + 1} apart`);
      }
    }
  }
});

test('the net and the walls: a ball rolling at the net stops on its side of it and bounces softly; off the back line and the side walls too, on the 256 court\'s width', async () => {
  const { g, c, red, blue } = await stage(4);
  const [r, b] = [red[0], blue[0]];
  put(g, r, C - 3, C, { vx: 8 });
  put(g, b, C + 3, C + 4, { vx: -8 });
  for (let k = 0; k < 250; k++) {
    g.step([[L.EV_INPUT, r, partyWord({ yaw: 0, move: 1, hop: k % 50 === 3 ? 1 : 0 })], [L.EV_INPUT, b, partyWord({ yaw: 8192, move: 1 })]]);
    assert.ok(g.v.partier(r).pos[0] <= C - B_RAD && g.v.partier(b).pos[0] >= C + B_RAD, 'never over it, hopping or not');
  }
  assert.ok(Math.abs(g.v.partier(b).pos[0] - (C + B_RAD)) < 0.01, `blue pressed to the net: ${g.v.partier(b).pos[0] - C}`);
  put(g, r, C - c.hx + 1.3, C + c.hz - 1.3, { vz: 10, vx: -6 });
  g.step([[L.EV_INPUT, r, partyWord({ yaw: 0 })]]);
  for (let k = 0; k < 20; k++) g.step();
  const p = g.v.partier(r);
  assert.ok(p.pos[2] <= C + c.hz - B_RAD + 1e-4 && p.pos[0] >= C - c.hx + B_RAD - 1e-4);
  assert.ok(p.vel[2] < 0 && p.vel[2] > -10 * MC.VB_PE && p.vel[0] > 0, `back off the corner at ${p.vel}`);
  const w = await room(256, { seed: 3 });
  const cw = court(w.v);
  for (let q = 0; q < 256; q++) {
    const x = w.v.partier(q);
    assert.ok(Math.abs(x.pos[2] - C) < cw.hz && (x.pos[0] - C) * dir(x.side) > 0);
  }
});

test('a serve: on time, from its server\'s back line in its lane, over the net with room to a spot VB_SD0 to VB_SD1 of the other half deep; the client\'s fly flies it as the sim does, tick for tick, to the floor', async () => {
  for (const n of [2, 64]) {
    const g = await room(n, { seed: 5 + n });
    const c = court(g.v);
    const from = g.v.fxCount();
    for (let k = 0; k < MC.VB_FIRST + (c.nb - 1) * MC.VB_STAGGER + 2; k++) g.step();
    const serves = fxs(g.v, from, MC.VB_FX_SERVE);
    assert.equal(serves.length, c.nb, `${n}: every volleyball served`);
    serves.forEach((s, k) => assert.equal(s.shot & 255, k));
    // a fresh one, served on the next tick, flown by both
    clear(g);
    for (let p = 0; p < n; p++) put(g, p, C + dir(g.v.partier(p).side) * 1.1, C - c.hz + 1.1);
    for (const side of [0, 1]) {
      setVb(g, 0, { st: MC.VB_WAIT, next: playT(g) + 1, serve: side, x: 0, y: 0, z: 0 });
      g.step();
      g.step();
      const b = ball(g, 0);
      assert.equal(b.st, MC.VB_FLY);
      const s = fxs(g.v, from, MC.VB_FX_SERVE).at(-1);
      assert.equal(s.shot >> 8, side);
      assert.ok(Math.abs((s.pos[0] - C) * dir(side) - (c.hx - MC.VB_SBACK)) < 1e-4 && Math.abs(s.pos[1] - (PLAT_Y + MC.VB_SY)) < 1e-4);
      let x = { ...b }, low = Infinity, crossed = false;
      for (let k = 0; k < 900 && ball(g, 0).st === MC.VB_FLY; k++) {
        g.step();
        x = fly(x, c, 1);
        const y = ball(g, 0);
        if (y.st !== MC.VB_FLY) break;
        assert.deepEqual([x.x, x.y, x.z, x.vx, x.vy, x.vz], [y.x, y.y, y.z, y.vx, y.vy, y.vz], `${n}: ${k + 1} ticks on, the same bits`);
        if (Math.sign(y.x - C) !== Math.sign(s.pos[0] - C) && !crossed) { crossed = true; low = y.y - MC.VB_R; }
      }
      assert.ok(crossed && low > PLAT_Y + MC.VB_NET_H + 0.5, `over the net with room: ${low - PLAT_Y} m`);
      const at = fxs(g.v, from, MC.VB_FX_POINT).at(-1);
      const deep = (at.pos[0] - C) * -dir(side);
      assert.ok(deep > MC.VB_SD0 * c.hx - 1.5 && deep < MC.VB_SD1 * c.hx + 1.5, `${n}: down ${deep / c.hx} of the half deep`);
      assert.equal((at.shot >> 8) & 1, side, 'an ace: the server\'s point');
    }
  }
});

test('a bump: a ball rolling into a volleyball knocks it up VB_BUMPUP and on the way it rolls, faster the faster it rolls; one standing under it, straight toward the net; a point of its own and a touch', async () => {
  const { g, red, blue } = await stage(4);
  for (const [p, vx, vz] of [[red[0], 6, 3], [red[0], 0.4, 0.2], [blue[0], -2, -7]]) {
    clear(g);
    const s = g.v.partier(p).side;
    const x0 = C + dir(s) * 5, before = g.v.partier(p).score, from = g.v.fxCount();
    put(g, p, x0, C, { vx, vz });
    setVb(g, 0, { x: x0 + vx * 0.06, y: PLAT_Y + B_RAD + 2, z: C + vz * 0.06 });
    g.step();
    const b = ball(g, 0), me = g.v.partier(p);
    const want = touch(me.vel[0], me.vel[2], false, s);
    assert.ok(Math.abs(b.vx - want.vx) < 1e-4 && Math.abs(b.vy - want.vy) < 1e-4 && Math.abs(b.vz - want.vz) < 1e-4, `${[b.vx, b.vy, b.vz]} for ${[want.vx, want.vy, want.vz]}`);
    assert.equal(b.vy, MC.VB_BUMPUP);
    const sp = Math.hypot(me.vel[0], me.vel[2]);
    if (sp < MC.VB_SLOW) assert.deepEqual([Math.sign(b.vx), b.vz], [-dir(s), 0], 'standing: toward the net');
    else assert.ok(Math.abs(Math.atan2(b.vz, b.vx) - Math.atan2(me.vel[2], me.vel[0])) < 1e-4 && Math.abs(Math.hypot(b.vx, b.vz) - Math.min(MC.VB_BUMPMAX, MC.VB_BUMP0 + MC.VB_BUMPK * sp)) < 1e-4, 'the way it rolls');
    assert.deepEqual([b.by, b.side, b.n], [p, s, 1]);
    assert.equal(me.score, before + 1);
    const [t] = fxs(g.v, from, MC.VB_FX_TOUCH);
    assert.deepEqual([t.owner, t.shot & 255, t.shot & 256, t.shot >> 9], [p, 0, 0, 1]);
  }
  assert.equal(slotOf(g.v, red[0]).touches, 2);
});

test('a spike: a ball in the air sends it harder and higher, at least VB_FWD of it on toward the net even rolling away; one coming in faster than VB_DIG is dug, a bump', async () => {
  const { g, red } = await stage(4);
  const p = red[0];
  for (const [vx, vz, inc] of [[5, 2, 0], [-4, 1, 0], [1, 0, 0], [6, 0, 9]]) {
    clear(g);
    put(g, p, C - 5, C, { vx, vz, y: 0.8, vy: 2 });
    setVb(g, 0, { x: C - 5 + vx * 0.06, y: PLAT_Y + 0.8 + B_RAD + 2.05, z: C, vx: -inc });
    g.step();
    const b = ball(g, 0), me = g.v.partier(p);
    assert.ok(!me.ground, 'still in the air');
    const dig = inc > MC.VB_DIG;
    const want = touch(me.vel[0], me.vel[2], !dig, 0);
    assert.ok(Math.abs(b.vx - want.vx) < 1e-4 && Math.abs(b.vz - want.vz) < 1e-4 && b.vy === (dig ? MC.VB_BUMPUP : MC.VB_SPIKEUP), `${[b.vx, b.vy, b.vz]} for ${[want.vx, want.vy, want.vz]}`);
    const h = Math.hypot(b.vx, b.vz), sp = Math.hypot(me.vel[0], me.vel[2]);
    if (dig) { assert.ok(h <= MC.VB_BUMPMAX, 'dug'); continue; }
    assert.ok(Math.abs(h - Math.min(MC.VB_SPIKEMAX, MC.VB_SPIKE0 + MC.VB_SPIKEK * sp)) < 1e-4 && h > MC.VB_BUMPMAX, `harder: ${h}`);
    assert.ok(b.vx / h >= MC.VB_FWD - 1e-6, `on toward the net: ${b.vx / h}`);
  }
  assert.equal(slotOf(g.v, p).spikes, 3);
});

test('the cooldowns: no ball touches a volleyball VB_GAP ticks after a touch, and the ball that made it not for VB_COOL', async () => {
  const { g, red } = await stage(4);
  const [p, q] = red;
  const t = playT(g);
  const near = (who) => { const m = g.v.partier(who); return { x: m.pos[0], y: PLAT_Y + B_RAD + 1.9, z: m.pos[2] }; };
  put(g, p, C - 5, C - 3);
  put(g, q, C - 5, C + 3);
  setVb(g, 0, { ...near(q), by: p, side: 0, n: 1, at: t - MC.VB_GAP + 2 });
  g.step();
  assert.equal(ball(g, 0).n, 1, 'inside the gap: nobody');
  setVb(g, 0, { ...near(q), by: p, side: 0, n: 1, at: t - MC.VB_GAP - 1 });
  g.step();
  assert.deepEqual([ball(g, 0).n, ball(g, 0).by], [2, q], 'past it: another ball');
  setVb(g, 0, { ...near(p), by: p, side: 0, n: 1, at: playT(g) - MC.VB_COOL + 3 });
  g.step();
  assert.equal(ball(g, 0).n, 1, 'its own ball inside its cooldown');
  setVb(g, 0, { ...near(p), by: p, side: 0, n: 1, at: playT(g) - MC.VB_COOL - 1 });
  g.step();
  assert.equal(ball(g, 0).n, 2, 'and past it');
});

test('a point: a volleyball down on red\'s floor is blue\'s, two of its own to the blue ball that sent it there; dead, it bounces, nobody touches it, and blue serves it VB_PAUSE on', async () => {
  const { g, c, red, blue } = await stage(4);
  const q = blue[0], p = red[0];
  put(g, p, C - 3.5, C + 0.2);
  setVb(g, 0, { x: C - 3, y: PLAT_Y + MC.VB_R + 0.03, z: C, vx: 1, vy: -6, by: q, side: 1, n: 1, at: playT(g) - 3 });
  const from = g.v.fxCount();
  g.step();
  const t = playT(g);
  assert.deepEqual(g.v.party().tscore, [0, 1]);
  assert.deepEqual([g.v.partier(q).score, slotOf(g.v, q).kills], [2, 1]);
  const [pt] = fxs(g.v, from, MC.VB_FX_POINT);
  assert.deepEqual([pt.owner, pt.shot & 255, pt.shot >> 8, pt.size], [q, 0, 1, 1]);
  let b = ball(g, 0);
  assert.deepEqual([b.st, b.serve], [MC.VB_DEAD, 1]);
  assert.ok(Math.abs(b.next - t - MC.VB_PAUSE) <= 1);
  assert.ok(b.vy > 0, 'it bounces');
  for (let k = 0; k < 120; k++) g.step();
  assert.equal(fxs(g.v, from, MC.VB_FX_TOUCH).length, 0, 'dead: no touch');
  assert.deepEqual(g.v.party().tscore, [0, 1], 'and no point');
  for (let k = 0; k < MC.VB_PAUSE && ball(g, 0).st === MC.VB_DEAD; k++) g.step();
  b = ball(g, 0);
  assert.equal(b.st, MC.VB_FLY);
  const [s] = fxs(g.v, from, MC.VB_FX_SERVE);
  assert.deepEqual([s.shot >> 8, s.tick - pt.tick], [1, MC.VB_PAUSE]);
  assert.ok(Math.abs(s.pos[0] - (C + c.hx - MC.VB_SBACK)) < 1e-4, 'from blue\'s back line');
  // one a red ball last touched, down on red's floor: blue's, nobody's kill
  setVb(g, 0, { x: C - 6, y: PLAT_Y + MC.VB_R + 0.03, z: C, vy: -6, by: p, side: 0, n: 1, at: playT(g) - 50 });
  g.step();
  assert.deepEqual(g.v.party().tscore, [0, 2]);
  assert.deepEqual([g.v.partier(p).score, slotOf(g.v, p).kills], [0, 0]);
});

test('the fourth touch: a side\'s touch past VB_MAXT in a row is the other side\'s point, the volleyball dead where it is; a touch by the other side starts the count again', async () => {
  const { g, red } = await stage(4);
  const p = red[0];
  put(g, p, C - 5, C);
  const over = { x: C - 5, y: PLAT_Y + B_RAD + 2, z: C };
  setVb(g, 0, { ...over, by: red[1], side: 0, n: MC.VB_MAXT });
  let from = g.v.fxCount();
  g.step();
  const [pt] = fxs(g.v, from, MC.VB_FX_POINT);
  assert.deepEqual([pt.owner, pt.shot >> 8], [p, 1 | 2], 'blue\'s, a fourth touch');
  assert.deepEqual(g.v.party().tscore, [0, 1]);
  assert.deepEqual([ball(g, 0).st, ball(g, 0).serve, slotOf(g.v, p).faults, slotOf(g.v, p).touches], [MC.VB_DEAD, 1, 1, 0]);
  assert.equal(fxs(g.v, from, MC.VB_FX_TOUCH).length, 0);
  setVb(g, 0, { ...over, by: 9, side: 1, n: MC.VB_MAXT });
  from = g.v.fxCount();
  g.step();
  assert.deepEqual([ball(g, 0).st, ball(g, 0).side, ball(g, 0).n], [MC.VB_FLY, 0, 1], 'after blue\'s: red\'s first');
  assert.deepEqual(g.v.party().tscore, [0, 1]);
});

test('off the net and the walls: a volleyball into the net\'s face comes back on its side, one over its top edge goes up off it, the walls stop it at any height; the client\'s fly the same bits through it all, and on dead to rest', async () => {
  const { g, c } = await stage(2);
  const cases = [
    { x: C - 3, y: PLAT_Y + 1.8, z: C - 2, vx: 7, vy: 1, vz: 0.5 },
    { x: C - 2.2, y: PLAT_Y + MC.VB_NET_H + 0.9, z: C + 3, vx: 4, vy: -1, vz: 0 },
    { x: C + c.hx - 3, y: PLAT_Y + 9, z: C + c.hz - 3, vx: 9, vy: 0, vz: 6 },
  ];
  for (const [i, s] of cases.entries()) {
    clear(g);
    setVb(g, 0, { ...s });
    let x = { ...ball(g, 0) }, nets = 0, side0 = Math.sign(s.x - C);
    const from = g.v.fxCount();
    for (let k = 0; k < 700; k++) {
      g.step();
      x = fly(x, c, 1);
      const y = ball(g, 0);
      g.dv.setInt32(BA(0) + MC.VB_BNEXT, 1e6, true); // dead, never served again
      assert.deepEqual([x.x, x.y, x.z, x.vx, x.vy, x.vz], [y.x, y.y, y.z, y.vx, y.vy, y.vz], `case ${i}: ${k + 1} ticks on, the same bits`);
      assert.ok(Math.abs(y.x - C) <= c.hx - MC.VB_R + 1e-4 && Math.abs(y.z - C) <= c.hz - MC.VB_R + 1e-4, 'inside the walls');
      if (i === 0) assert.equal(Math.sign(y.x - C), side0, 'never through the net');
      if (y.st === MC.VB_FLY) nets = fxs(g.v, from, MC.VB_FX_NET).length;
    }
    if (i === 0) assert.ok(nets >= 1 && x.land.side === 0, 'off the face, down on its own side');
    if (i === 1) assert.ok(nets >= 1, 'off the edge');
    assert.ok(x.vy === 0 && Math.abs(x.vx) < 0.01, 'dead, at rest');
  }
});

test('the end: the first side to the target wins, every ball of it 1st and the rest by their own score; at the clock the side with more, or a draw placed by score', async () => {
  const { g, red, blue } = await stage(6);
  const c = court(g.v);
  g.dv.setUint32(L.PG_TSCORE, c.goal - 1, true);
  g.dv.setUint16(rec(blue[0]) + L.PG_SCORE, 5, true);
  g.dv.setUint16(rec(blue[1]) + L.PG_SCORE, 2, true);
  setVb(g, 0, { x: C + 3, y: PLAT_Y + MC.VB_R + 0.03, z: C + 3, vy: -5 });
  g.step();
  const r = g.v.party();
  assert.equal(r.state, L.H_OVER);
  assert.deepEqual([r.tscore[0], r.twin], [c.goal, 1]);
  assert.deepEqual([...red, ...blue].map((p) => g.v.partier(p).place), [1, 1, 1, 4, 5, 6]);
  assert.deepEqual([...red, ...blue].map((p) => g.v.partier(p).wins), [1, 1, 1, 0, 0, 0]);
  // at the clock, level: a draw, placed by score
  const t = await stage(4, { seed: 9 });
  t.g.dv.setBigUint64(L.PG_TSCORE, (3n << 32n) | 3n, true);
  t.g.dv.setUint16(rec(t.blue[1]) + L.PG_SCORE, 4, true);
  t.g.dv.setUint32(L.HDR_UNTIL, t.g.v.tick + 1, true);
  t.g.step();
  t.g.step();
  assert.equal(t.g.v.party().twin, 3);
  assert.equal(t.g.v.partier(t.blue[1]).place, 1);
  assert.equal(t.g.v.partier(t.red[0]).place, 2);
});

test('a newcomer in play goes to the smaller side and falls in at its back line; a ball alone plays on to the clock', async () => {
  const { g, c } = await stage(3);
  assert.deepEqual(g.v.party().tn, [2, 1]);
  g.step([[L.EV_JOIN, 3]]);
  const b = g.v.partier(3);
  assert.equal(b.side, 1);
  assert.ok(!b.out && b.pos[1] > PLAT_Y + 5, 'falling in');
  assert.ok(Math.abs(b.pos[0] - (C + c.hx - 1.5)) < 1e-4);
  for (let k = 0; k < 200; k++) g.step();
  assert.ok(g.v.partier(3).ground);
  const one = await room(1);
  for (let k = 0; k < 2000; k++) one.step();
  assert.equal(one.v.hole().state, L.H_PLAY, 'alone, red serves and blue\'s floor fills');
  assert.ok(one.v.party().tscore[0] + one.v.party().tscore[1] >= 1);
});

test('the prediction matches the confirmed ball bit for bit: rolling into the net and the walls, hopping, volleyballs in flight; through its own touches, every byte but the touch\'s point of its own', async () => {
  const { g, c } = await stage(4);
  const s = g.v.partier(0).side;
  put(g, 0, C + dir(s) * 4, C);
  setVb(g, 0, { x: C - dir(s) * 4, y: PLAT_Y + 6, z: C, vx: -dir(s) });
  setVb(g, 1, { x: C - dir(s) * 6, y: PLAT_Y + 8, z: C - 2, vz: 1 });
  const toNet = s ? 8192 : 0;
  const words = Array.from({ length: 220 }, (_, k) => partyWord({ yaw: (toNet + k * 83) & 16383, move: k % 40 < 34 ? 1 : 0, hop: k % 37 === 5 ? 1 : 0 }));
  assert.ok(predicted(g, words) >= words.length);
  // through its own touches, 30 ticks ahead: every byte of the record but PG_SCORE, a touch's point of its own (confirmed only)
  let touches = 0;
  for (let k = 0; k < 120; k++) {
    if (k % 25 === 0) { const p = g.v.partier(0).pos; setVb(g, 0, { x: p[0], y: p[1] + 4, z: p[2] }); }
    for (let i = 0; i < 30; i++) g.dv.setUint32(L.PWORDS + 4 * i, words[k + i], true);
    g.sim.x.predict(0, 30);
    const pred = g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE);
    const save = g.sim.u8.slice(0, 0x100000), f0 = g.v.fxCount(); // the FX ring, the region, the prediction's copy
    for (let i = 0; i < 30; i++) g.step([[L.EV_INPUT, 0, words[k + i]]]);
    touches += fxs(g.v, f0, MC.VB_FX_TOUCH).filter((x) => x.owner === 0).length;
    const conf = g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE);
    for (let b = 0; b < L.PSIZE; b++) if (b !== L.PG_SCORE && b !== L.PG_SCORE + 1) assert.equal(pred[b], conf[b], `byte ${b}, ${k}`);
    g.sim.u8.set(save);
    g.step([[L.EV_INPUT, 0, words[k]]]);
  }
  assert.ok(touches >= 10, `${touches} touches`);

  put(g, 0, C + dir(s) * (c.hx - 2), C + c.hz - 2);
  const run = Array.from({ length: 140 }, (_, k) => partyWord({ yaw: (k * 300) & 16383, move: 1, hop: k % 30 === 0 ? 1 : 0 }));
  assert.ok(predicted(g, run) >= run.length);
});

test('the client: the court, the net, the volleyballs flown on, their landing rings and touch pips; its HUD; the AI ball assigned one coming down on its half gets under it, hops into it and sends it over; teammates keep out from under it', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const { g, red, blue } = await stage(32);
  const p = red[0];
  put(g, p, C - 6, C - 1);
  setVb(g, 0, { x: C + 2, y: PLAT_Y + 7, z: C, vx: -3.5, vy: 2 });
  setVb(g, 1, { x: C - 4, y: PLAT_Y + 5, z: C + 4, vx: 1, vy: 1, by: red[1], side: 0, n: 2, at: playT(g) - 20 });
  setVb(g, 2, { st: MC.VB_WAIT, next: playT(g) + 60, serve: 1, x: C + 6, y: PLAT_Y + 3.5, z: C - 5 });
  setVb(g, 3, { st: MC.VB_DEAD, next: playT(g) + 200, x: C + 5, y: PLAT_Y + MC.VB_R, z: C + 5 });
  g.step();
  const out = () => ({ scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null });
  const o = out();
  const g0 = g.v.party();
  volley.draw(g.v, { tick: g0.tick, t: g0.t * TICK, dt: 0, ptick: g0.tick + 6, now: 0, slot: p, pme: g.v.partier(p), own: g.v.partier(p).pos }, o);
  for (let k = 0; k < o.scene.count * 16; k++) assert.ok(Number.isFinite(o.scene.data[k]), 'finite');
  assert.ok(o.scene.count > 16, 'the court, the net, the walls, the volleyballs');
  assert.equal(o.decals.filter((d) => d.kind === 0).length, 2, 'a landing ring for each in flight');
  assert.equal(o.glow.filter((x) => x.size < 0.5).length, 2, 'two pips over the one red touched twice');
  assert.ok(o.casters.length >= 3);
  const lines = [];
  const hctx = { put: () => {}, centre: (y, s) => lines.push(s), right: (y, s) => lines.push(s), rect: () => {}, rows: 44, C: {}, slot: red[1], now: 0, t: g0.t * TICK };
  volley.hud(g.v, hctx);
  assert.ok(lines.includes(`FIRST TO ${court(g.v).goal}`) && lines.some((l) => l.startsWith('TOUCHES')), lines.join(' | '));
  for (const l of [...lines, volley.hint, volley.rules]) assert.ok(l.length <= 70 && /^[ -_]*$/.test(l), l);
  assert.equal(volley.frame(g.v).shape, 'square');
  const fctx = { slot: p, view: g.v, glow: () => {}, banner: () => {}, feed: (s) => lines.push(s), name: (q) => `P${q + 1}`, dist: 0 };
  volley.fx({ kind: MC.VB_FX_POINT, owner: p, shot: 0 | (0 << 8), pos: [C, PLAT_Y, C], size: 3 }, fctx);
  assert.equal(lines.at(-1), `RED SCORES 3  P${p + 1}`);
  // teammates keep out from under one a teammate plays
  for (const m of red.slice(1)) {
    const me = g.v.partier(m);
    const w = volley.brain.goal(g.v, me, {});
    assert.ok(w && (w[0] - C) * dir(0) > 0, 'a home spot on its half');
  }
  // the brain, driving ball p in the sim: under the one coming down to it, a hop, and over the net
  clear(g);
  for (const q of [...red, ...blue]) if (q !== p) put(g, q, C + dir(g.v.partier(q).side) * (court(g.v).hx - 1.5), C + (q & 1 ? 7 : -7));
  put(g, p, C - 7, C + 2);
  setVb(g, 0, { x: C + 3, y: PLAT_Y + 6, z: C - 1, vx: -4.2, vy: 4, by: blue[0], side: 1, n: 1, at: playT(g) - 50 });
  const bot = new Partier(p, 5, 0.9);
  const from = g.v.fxCount();
  let hop = false;
  for (let k = 0; k < 500; k++) {
    const word = bot.think(g.v, g.v.tick, 0);
    if (word & 0x10000000) hop = true;
    g.step([[L.EV_INPUT, p, word]]);
    if (fxs(g.v, from, MC.VB_FX_POINT).length) break;
  }
  const t = fxs(g.v, from, MC.VB_FX_TOUCH);
  assert.ok(t.length >= 1 && t[0].owner === p && (t[0].shot & 256), `P${p + 1} spiked it: ${t.map((x) => `${x.owner}/${x.shot}`)}`);
  assert.ok(hop);
  const [pt] = fxs(g.v, from, MC.VB_FX_POINT);
  assert.ok(!pt || (pt.shot >> 8) === 0 || fxs(g.v, from, MC.VB_FX_TOUCH).some((x) => g.v.partier(x.owner).side === 1), 'over the net: red\'s point, or blue had it back');
  const l = landing({ st: MC.VB_FLY, x: C + 2, y: PLAT_Y + 4.2, z: C, ...touch(-8, 0, true, 1) }, court(g.v), PLAT_Y - 1, PLAT_Y - 1);
  assert.equal(l.side, 0, 'a blue spike lands on red\'s floor');
});

// A round of AI balls (client/party-bot.mjs) steered by this minigame's brain on the debug build, stats from it.
async function aiRound(balls, ticks, seed) {
  const stats = { start: -1, over: -1, touches: [0, 0], spikes: 0, points: 0, faults: 0, places: null, twin: 0 };
  let seen = 0;
  const r = await playParty({ bytes: partyBytes(true), mg: L.MG_VOLLEY, bots: balls, ticks, seed, onTick: (t, sim, v) => {
    const g = v.party();
    for (; seen < v.fxCount(); seen++) {
      const x = v.fx(seen);
      if (stats.over >= 0 || stats.start < 0) continue;
      if (x.kind === MC.VB_FX_TOUCH) { stats.touches[v.partier(x.owner).side]++; if (x.shot & 256) stats.spikes++; }
      if (x.kind === MC.VB_FX_POINT) { stats.points++; if (x.shot & 512) stats.faults++; }
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

for (const [balls, ticks, seed] of [[8, 16200, 3], [64, 16200, 5]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, served, touched, spiked and scored on both sides to the target or the clock; equal on 1 and 4 threads`, async () => {
    const { log, sim, stats, games } = await aiRound(balls, ticks, seed);
    assert.equal(sim.error().code, 0);
    assert.ok(games.every((x) => x === L.MG_VOLLEY));
    assert.ok(stats.over > 0, 'the round ended');
    const secs = (stats.over - stats.start) * TICK;
    assert.ok(secs > 20 && secs <= MC.VB_LEN * TICK + 0.01, `${secs.toFixed(1)} s of play`);
    assert.ok(stats.touches[0] >= balls && stats.touches[1] >= balls && stats.spikes >= balls, `touches ${stats.touches}, ${stats.spikes} spikes`);
    assert.ok(stats.points >= 4 && stats.faults * 3 < stats.points, `${stats.points} points, ${stats.faults} of them fourth touches`);

    assert.equal(stats.tscore[0] + stats.tscore[1], stats.points);
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
