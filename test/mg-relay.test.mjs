// RELAY RACE (src/mg/relay.wat): the track, its zones, its rows of posts and
// each side's batons for 1 to 256 balls, half of each side in each zone; the
// walls for a ball; the posts on their wave, as the client has them, and a
// ball one meets sent off; a take, the nearest ball of the baton's side, one
// at a time; a carrier's slowdown; a leg over the far line, the handoff to a
// teammate waiting and the carrier's rest, none for a side of one; a baton
// knocked loose by a hard bump from a foe, never by a soft one or by its
// carrier's own charge, lying where it fell for its own side only; a carrier
// that leaves; the end at the target and at the clock, by side, and a draw; a
// newcomer in play and a ball alone; the prediction bit for bit through the
// posts and the walls, carrying and not; the client and its AI; rounds of AI
// balls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y, B_RAD } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/relay.mjs'; // RY_*: the minigame's own constants
import relay, { track, batons, slotOf, carried, postOff, postNear, setAt, dir } from '../client/mg/relay.mjs';

const C = L.B_CX;
const TICK = 0.008;
const f = Math.fround;
const nbat = (n) => Math.min(MC.RY_BMAX, Math.max(1, Math.floor((n + MC.RY_BN) / MC.RY_BD)));
const target = (nb) => MC.RY_TGT + MC.RY_TGTK * (nb - 1);

// A room of n balls on Relay Race, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_RELAY + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
const teams = (g, n) => { const s = Array.from({ length: n }, (_, p) => g.v.partier(p).side); return [0, 1].map((x) => s.map((y, p) => [y, p]).filter(([y]) => y === x).map(([, p]) => p)); };
// Ball p at (x, z) from the track's centre, on the floor (or y over it), rolling at (vx, vz).
function put(g, p, x, z, { vx = 0, vz = 0, y = 0 } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, C + x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, PLAT_Y + y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, C + z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, (g.dv.getUint8(rec(p) + L.P_FL) & L.PF_BLUE) | L.PF_LIVE | (y > 0 ? 0 : L.PF_GROUND));
}
const BA = (k) => L.PG_S + MC.RY_BAT + k * MC.RY_BSIZE;
// Side s's baton i: its number.
const bk = (s, i = 0) => s * MC.RY_BMAX + i;
// Baton k set: by default lying, its side's at once, at (x, z) from the centre, going to its side's far zone.
function setB(g, k, { st = MC.RY_LIES, by = 255, to = k < MC.RY_BMAX ? 1 : 0, at = 0, x = 0, z = 0 } = {}) {
  const a = BA(k), dv = g.dv;
  dv.setUint8(a + MC.RY_BST, st);
  dv.setUint8(a + MC.RY_BBY, by);
  dv.setUint8(a + MC.RY_BTO, to);
  dv.setUint8(a + MC.RY_BSIDE, k < MC.RY_BMAX ? 0 : 1);
  dv.setInt32(a + MC.RY_BAT_AT, at, true);
  dv.setFloat32(a + MC.RY_BX, C + x, true);
  dv.setFloat32(a + MC.RY_BZ, C + z, true);
}
// Ball p carrying baton k to zone `to`.
function carry(g, p, k, to) {
  setB(g, k, { st: MC.RY_HELD, by: p, to: to ?? (k < MC.RY_BMAX ? 1 : 0) });
  g.dv.setUint32(rec(p) + L.PG_M, k + 1, true);
}
const baton = (g, k) => batons(g.v).find((b) => b.k === k);
// Every baton out of play, so a test has only its own; and no posts, for the tests that aren't about them.
const clear = (g) => { for (let k = 0; k < 2 * MC.RY_BMAX; k++) g.dv.setUint8(BA(k) + MC.RY_BST, MC.RY_NONE); };
const noPosts = (g) => g.dv.setUint32(L.PG_H + MC.RY_NR, 0, true);
const fxs = (v, from, kind) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
const local = (g, p) => { const b = g.v.partier(p); return { x: b.pos[0] - C, z: b.pos[2] - C, vx: b.vel[0], vz: b.vel[2], sp: Math.hypot(b.vel[0], b.vel[2]) }; };
// A room of n with no batons in play and no posts, each side's balls in a row along a side wall in its own zone, still.
async function stage(n, opts) {
  const g = await room(n, opts);
  clear(g);
  if (!opts?.posts) noPosts(g);
  const c = track(g.v);
  const [red, blue] = teams(g, n);
  red.forEach((p, i) => put(g, p, -c.hx + 1.5 + (i % 3) * 2.5, -c.hz + 1.5 + Math.floor(i / 3) * 2.5));
  blue.forEach((p, i) => put(g, p, c.hx - 1.5 - (i % 3) * 2.5, -c.hz + 1.5 + Math.floor(i / 3) * 2.5));
  return { g, c, red, blue };
}

test('the track for 1, 8, 64 and 256: sized for the crowd, a zone across each end, rows of posts between them, a baton for every 4 balls of a side lying in its own zone, a target of 8 legs and 6 more a baton past the first; half of each side in each zone, the sides in turn', async () => {
  // Battle Royale's kit constants are RY_ too, and the assembler takes the arena's of a name: none shared
  for (const k of Object.keys(MC)) assert.ok(!(k in L.AM_CONSTS), `${k} is the arena's`);
  let last = 0;
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const c = track(g.v);
    assert.equal(r.game, L.MG_RELAY);
    assert.deepEqual([r.kind, r.len, r.flags], [L.PK_SCORE, MC.RY_LEN, L.PGF_BUMPS | L.PGF_TEAMS]);
    const s = Math.sqrt(n);
    assert.ok(Math.abs(2 * c.hx - (MC.RY_L0 + MC.RY_LK * s)) < 1e-4 && Math.abs(2 * c.hz - (MC.RY_W0 + MC.RY_WK * s)) < 1e-4 && c.hx > last, `${2 * c.hx} by ${2 * c.hz} m for ${n}`);
    last = c.hx;
    assert.equal(r.size, c.hx);
    assert.equal(c.zx, f(c.hx - MC.RY_ZD));
    assert.deepEqual([c.nb, c.goal], [nbat(n), target(nbat(n))]);
    assert.equal(c.goal, { 1: 8, 8: 8, 64: 50, 256: 194 }[n]);
    assert.equal(c.nb, { 1: 1, 8: 1, 64: 8, 256: 32 }[n]);
    // the rows: centred, RY_ROWGAP apart, clear of the zones, each with a pace of its own from the seed
    assert.equal(c.nr, { 1: 4, 8: 4, 64: 5, 256: 6 }[n]);
    for (const row of c.rows) {
      assert.ok(Math.abs(row.x - C) <= c.zx - MC.RY_CLEAR + 1e-3, `a row ${c.zx - Math.abs(row.x - C)} m from a zone`);
      assert.ok((row.w >>> 16) >= MC.RY_STEP0 && (row.w >>> 16) < MC.RY_STEP0 + MC.RY_STEPN);
    }
    assert.ok(new Set(c.rows.map((x) => x.w)).size === c.nr, 'no two rows alike');
    const list = batons(g.v);
    assert.equal(list.length, 2 * c.nb);
    for (const b of list) {
      assert.deepEqual([b.st, b.by, b.side, b.to], [MC.RY_LIES, 255, b.k < MC.RY_BMAX ? 0 : 1, b.k < MC.RY_BMAX ? 1 : 0]);
      assert.ok(Math.abs(b.x - (C + dir(b.side) * (c.zx + MC.RY_SET))) < 1e-3 && Math.abs(b.z - C) <= c.hz - 2, `in its own zone: ${b.x - C}, ${b.z - C}`);
    }
    assert.deepEqual(r.tn, [Math.ceil(n / 2), Math.floor(n / 2)]);
    const at = [[0, 0], [0, 0]]; // by side, in zone 0 and in zone 1
    const spots = new Set();
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y);
      const e = b.pos[0] > C ? 1 : 0;
      at[b.side][e]++;
      assert.ok(Math.abs(b.pos[0] - C) <= c.hx - MC.RY_IN + 1e-4 && Math.abs(b.pos[0] - C) > c.zx - 2 * MC.RY_GAP, `${n}: P${p + 1} by an end wall: ${b.pos[0] - C}`);
      assert.ok(Math.abs(b.pos[2] - C) <= c.hz - 1.5 + 1e-4, `${n}: P${p + 1} inside the walls`);
      spots.add(`${Math.round(b.pos[0] * 10)},${Math.round(b.pos[2] * 10)}`);
    }
    assert.equal(spots.size, n, 'a spot each');
    const [mr, mb] = r.tn;
    assert.deepEqual(at, [[Math.ceil(mr / 2), Math.floor(mr / 2)], [Math.floor(mb / 2), Math.ceil(mb / 2)]], `${n}: half of each side in each zone`);
  }
});

test('the walls: a ball comes off a side and an end softly, never through, at a corner too', async () => {
  const { g, c, red } = await stage(2);
  const p = red[0];
  const run = (word, k = 1) => { for (let i = 0; i < k; i++) g.step([[L.EV_INPUT, p, word]]); };
  put(g, p, 0, c.hz - 1.3, { vz: 8 });
  run(partyWord({ yaw: 4096, move: 1 }), 80);
  let b = local(g, p);
  assert.ok(b.z <= c.hz - B_RAD + 1e-4 && b.z > c.hz - B_RAD - 0.5, `against the side: ${b.z}`);
  put(g, p, c.hx - 1.03, 2, { vx: 8 });
  run(partyWord({ yaw: 0, move: 0 }), 1);
  b = local(g, p);
  assert.ok(b.x <= c.hx - B_RAD + 1e-4 && b.vx < 0 && b.vx > -8 * MC.RY_PE - 0.2, `off the end softly: ${b.x}, ${b.vx}`);
  put(g, p, -c.hx + 4, -c.hz + 4, { vx: -7, vz: -7 });
  for (let k = 0; k < 150; k++) {
    run(partyWord({ yaw: 10240, move: 1 }));
    b = local(g, p);
    assert.ok(Math.abs(b.x) <= c.hx - B_RAD + 1e-4 && Math.abs(b.z) <= c.hz - B_RAD + 1e-4, `inside the corner: ${b.x}, ${b.z}`);
  }
});

test('the posts: each row slides on its triangle wave, 4 m either way, where the client has it; a ball one meets is put outside it and sent off at 9 m/s and up, a ball beside it or over its top is not', async () => {
  const { g, c, red, blue } = await stage(2, { posts: true });
  const [p] = red, [q] = blue;
  const lim = MC.RY_PR + B_RAD;
  // the wave: its reach and its pace, from the client's copy
  for (let r = 0; r < c.nr; r++) {
    const w = c.rows[r].w, step = w >>> 16, base = r & 1 ? MC.RY_PS / 2 : 0;
    let lo = Infinity, hi = -Infinity, fast = 0;
    for (let t = 0; t < 1400; t++) { const o = postOff(w, r, t) - base; lo = Math.min(lo, o); hi = Math.max(hi, o); fast = Math.max(fast, Math.abs(postOff(w, r, t + 1) - postOff(w, r, t)) / TICK); }
    assert.ok(lo < -MC.RY_PA + 0.05 && hi > MC.RY_PA - 0.05 && lo >= -MC.RY_PA && hi <= MC.RY_PA, `row ${r} from ${lo} to ${hi}`);
    assert.ok(Math.abs(fast - 4 * MC.RY_PA * step / 65536 / TICK) < 0.01 && fast > 3 && fast < 4.8, `row ${r} at ${fast} m/s`);
  }
  // tick by tick down every row: a still ball just inside a post's reach is met, one just outside is not
  let met = 0;
  for (let k = 0; k < 420; k++) {
    const r = k % c.nr, row = c.rows[r];
    const t = g.v.party().t; // the tick the step runs
    const zp = postOff(row.w, r, t) + Math.round((k % 3) - 1) * MC.RY_PS;
    if (Math.abs(zp) > c.hz - 3.5) { g.step(); continue; }
    put(g, p, row.x - C, zp + lim - 0.06);
    put(g, q, row.x - C, zp - lim - 0.06);
    const f0 = g.v.fxCount();
    g.step();
    const hits = fxs(g.v, f0, MC.RY_FX_BONK);
    assert.deepEqual(hits.map((x) => [x.owner, x.shot]), [[p, r]], `tick ${t}, row ${r}: the one inside its reach`);
    const b = local(g, p);
    assert.ok(Math.abs(Math.hypot(b.x - (row.x - C), b.z - zp) - lim) < 1e-3, 'put outside it');
    assert.ok(Math.abs(b.vz - MC.RY_KNOCK) < 1e-3 && Math.abs(b.vx) < 1e-3, `sent straight off: ${b.vx}, ${b.vz}`);
    assert.ok(Math.abs(g.v.partier(p).vel[1] - MC.RY_LIFT) < 1e-4 && !g.v.partier(p).ground, `and up: ${g.v.partier(p).vel[1]} ${g.v.partier(p).ground} k ${k}`);
    assert.deepEqual([local(g, q).vx, local(g, q).vz], [0, 0], 'the one beside it left alone');
    met++;
  }
  assert.ok(met > 150, `${met} posts met`);
  // rolling into one flat out: turned back; over its top (a hop doesn't get there): through
  const row = c.rows[0];
  const t = g.v.party().t;
  const zp = postOff(row.w, 0, t);
  put(g, p, row.x - C - lim + 0.05, zp, { vx: 9.5 });
  put(g, q, row.x - C, zp, { y: MC.RY_PH + 0.1 });
  g.step();
  assert.ok(local(g, p).vx <= -MC.RY_KNOCK + 1e-3, `turned back: ${local(g, p).vx}`);
  assert.equal(local(g, q).vx, 0, 'over its top');
  assert.ok(MC.RY_PH > 0.9 + 1, 'a hop (0.9 m) leaves a ball\'s bottom under its top');
  // the client's nearest post is the sim's
  const near = postNear(c, row.x, C + zp + 1, t);
  assert.ok(near && Math.abs(near.d - 1) < 1e-6 && near.r === 0);
});

test('a take: rolling over a lying baton of your side carries it (PG_M); of two in reach the nearer, a tie to the lower slot; never a foe\'s; one at a time; not from high over it', async () => {
  const { g, c, red, blue } = await stage(6);
  const [p, p2, p3] = red, [q] = blue;
  setB(g, bk(0), { x: 0, z: 0 });
  setB(g, bk(0, 1), { x: -6, z: 0 });
  // a foe sits on it; the nearer of two red balls takes it
  put(g, q, 0.2, 0);
  put(g, p, -2.2, 0);
  put(g, p2, 1.5, 0.3);
  const f0 = g.v.fxCount();
  g.step();
  assert.equal(carried(g.v, p2), bk(0), 'the nearer one takes it');
  assert.deepEqual([carried(g.v, p), carried(g.v, q)], [-1, -1]);
  const b = baton(g, bk(0));
  assert.deepEqual([b.st, b.by, b.to], [MC.RY_HELD, p2, 1]);
  const [x] = fxs(g.v, f0, MC.RY_FX_TAKE);
  assert.deepEqual([x.owner, x.shot], [p2, bk(0) | 256]);
  // p2 carrying rolls over the other and leaves it; a foe on it leaves it too
  put(g, p2, -4, 0, { vx: -6 });
  put(g, q, -6, 0.5);
  for (let k = 0; k < 80; k++) g.step();
  assert.equal(carried(g.v, p2), bk(0));
  assert.equal(baton(g, bk(0, 1)).st, MC.RY_LIES, 'one at a time, and never a foe\'s');
  // two as near as each other: the lower slot
  const [lo, hi] = [p, p3].sort((a, b) => a - b);
  put(g, q, 9, 9);
  put(g, lo, -6, 1.5);
  put(g, hi, -6, -1.5);
  g.step();
  assert.deepEqual([carried(g.v, lo), carried(g.v, hi)], [bk(0, 1), -1], 'a tie to the lower slot');
  // high over one: left; coming down on it: taken
  setB(g, bk(0, 2), { x: 6, z: 3 });
  put(g, hi, 6, 3, { y: 2.5 });
  g.step();
  assert.equal(baton(g, bk(0, 2)).st, MC.RY_LIES, 'out of reach over it');
  for (let k = 0; k < 150 && baton(g, bk(0, 2)).st === MC.RY_LIES; k++) g.step();
  assert.equal(carried(g.v, hi), bk(0, 2), 'taken as it comes down');
  assert.ok(g.v.partier(hi).pos[1] - PLAT_Y < MC.RY_LOW);
  void c;
});

test('a carrier rolls 15% slower: flat out 8.5 m/s where a ball carrying nothing makes 10', async () => {
  const { g, c, red, blue } = await stage(2);
  const [p] = red, [q] = blue;
  carry(g, p, bk(0));
  put(g, p, -c.zx + 2, -3);
  put(g, q, -c.zx + 2, 3);
  let vp = 0, vq = 0;
  for (let k = 0; k < 330; k++) {
    g.step([[L.EV_INPUT, p, partyWord({ yaw: 0, move: 1 })], [L.EV_INPUT, q, partyWord({ yaw: 0, move: 1 })]]);
    vp = local(g, p).sp; vq = local(g, q).sp;
  }
  // v = a + D v a tick, the carrier's then times RY_SLOW
  const a = 0.088, D = 0.9912, k = MC.RY_SLOW;
  const free = a * (1 - D ** 330) / (1 - D), slow = k * a * (1 - (k * D) ** 330) / (1 - k * D);
  assert.ok(Math.abs(vq - free) < 0.02 && Math.abs(vp - slow) < 0.02, `carrying ${vp.toFixed(3)} m/s (${slow.toFixed(3)}), not ${vq.toFixed(3)} (${free.toFixed(3)})`);
  const top = k * a / (1 - k * D);
  assert.ok(top / (a / (1 - D)) > 0.84 && top / (a / (1 - D)) < 0.86, `flat out ${top.toFixed(2)} m/s`);
  assert.equal(carried(g.v, p), bk(0), 'still carrying');
});

test('a leg: a carrier over the far zone\'s line scores a point for its side and 3 of its own, and the baton is set down 2.5 m past the line, turned round; the near zone\'s line, or a foe\'s baton\'s zone, is nothing', async () => {
  const { g, c, red, blue } = await stage(4);
  const [p] = red, [q] = blue;
  carry(g, p, bk(0)); // red's, to zone 1
  carry(g, q, bk(1)); // blue's, to zone 0
  // each into the zone its baton came from: nothing
  put(g, p, -c.zx + 0.5, 2, { vx: -6 });
  put(g, q, c.zx - 0.5, 2, { vx: 6 });
  for (let k = 0; k < 40; k++) g.step();
  assert.deepEqual([carried(g.v, p), carried(g.v, q), g.v.party().tscore], [bk(0), bk(1), [0, 0]]);
  // red's over the far line
  put(g, p, c.zx - 0.6, 3, { vx: 7 });
  const f0 = g.v.fxCount();
  let k = 0;
  for (; k < 40 && carried(g.v, p) >= 0; k++) assert.ok(local(g, p).x < c.zx, 'short of the line, carrying'), g.step();
  assert.equal(carried(g.v, p), -1);
  assert.ok(local(g, p).x >= c.zx && local(g, p).x < c.zx + 0.2, `on the tick it crossed: ${local(g, p).x}`);
  assert.deepEqual(g.v.party().tscore, [1, 0]);
  assert.deepEqual([g.v.partier(p).score, slotOf(g.v, p).legs], [MC.RY_PT_LEG, 1]);
  const b = baton(g, bk(0));
  assert.deepEqual([b.st, b.by, b.to], [MC.RY_LIES, p, 0], 'set down, going back');
  assert.deepEqual([b.x, b.z], setAt(c, 1, g.v.partier(p).pos[2]).map(f));
  const [x] = fxs(g.v, f0, MC.RY_FX_LEG);
  assert.deepEqual([x.owner, x.shot, x.size], [p, bk(0), 1]);
  // blue's the other way
  put(g, q, -c.zx + 0.6, -3, { vx: -7 });
  for (k = 0; k < 40 && carried(g.v, q) >= 0; k++) g.step();
  assert.deepEqual(g.v.party().tscore, [1, 1]);
  assert.deepEqual([baton(g, bk(1)).to, baton(g, bk(1)).x], [1, f(C - c.zx - MC.RY_SET)]);
  assert.equal(fxs(g.v, f0, MC.RY_FX_LEG).at(-1).shot, bk(1) | 256);
});

test('the handoff and the rest: a teammate waiting where the baton is set down takes it on that tick and runs it back; its carrier can take none for 4 s, that one or another, then can', async () => {
  const { g, c, red, blue } = await stage(6);
  const [p, p2] = red;
  carry(g, p, bk(0));
  put(g, p, c.zx - 0.4, 0, { vx: 7 });
  put(g, p2, c.zx + MC.RY_SET + 1, 1.5);
  const f0 = g.v.fxCount();
  for (let k = 0; k < 20 && !g.v.party().tscore[0]; k++) g.step();
  assert.deepEqual(g.v.party().tscore, [1, 0]);
  assert.deepEqual([carried(g.v, p), carried(g.v, p2)], [-1, bk(0)], 'handed on');
  const t0 = g.v.party().t - 1; // the tick it was run on
  const b = baton(g, bk(0));
  assert.deepEqual([b.st, b.by, b.to, b.at], [MC.RY_HELD, p2, 0, t0]);
  const [x] = fxs(g.v, f0, MC.RY_FX_TAKE);
  assert.deepEqual([x.owner, x.shot, x.tick - g.v.party().start], [p2, bk(0), t0], 'a handoff, not a loose one');
  assert.equal(slotOf(g.v, p).next, t0 + MC.RY_REST);
  // the teammate back over the other line: its leg; the first carrier sits on batons all the while and takes none
  setB(g, bk(0, 1), { x: c.zx + 3, z: -4, to: 0 });
  put(g, p, c.zx + 3, -4);
  put(g, p2, -c.zx + 0.4, 0, { vx: -7 });
  for (let k = 0; k < 20 && g.v.party().tscore[0] < 2; k++) g.step();
  assert.deepEqual([g.v.party().tscore, g.v.partier(p2).score], [[2, 0], MC.RY_PT_LEG]);
  put(g, p2, -c.hx + 1.5, c.hz - 1.5);
  while (g.v.party().t < t0 + MC.RY_REST) {
    g.step();
    put(g, p, c.zx + 3, -4);
    assert.equal(carried(g.v, p), -1, 'resting');
  }
  g.step();
  assert.equal(carried(g.v, p), bk(0, 1), `rested ${MC.RY_REST * TICK} s`);
  void blue;
});

test('a side of one runs both ways itself: no rest, its baton its own again the tick it is set down if it is in reach', async () => {
  const g = await room(1);
  noPosts(g);
  const c = track(g.v);
  carry(g, 0, bk(0));
  put(g, 0, c.zx - 0.4, 0, { vx: 7 });
  for (let k = 0; k < 20 && !g.v.party().tscore[0]; k++) g.step();
  assert.deepEqual(g.v.party().tscore, [1, 0]);
  assert.equal(slotOf(g.v, 0).next, 0, 'no rest');
  for (let k = 0; k < 60 && carried(g.v, 0) < 0; k++) g.step([[L.EV_INPUT, 0, partyWord({ yaw: 0, move: 1 })]]);
  assert.equal(carried(g.v, 0), bk(0));
  assert.equal(baton(g, bk(0)).to, 0, 'and back');
  // three balls: red's two rest, blue's one doesn't
  const t = await stage(3);
  carry(t.g, t.red[0], bk(0));
  carry(t.g, t.blue[0], bk(1));
  put(t.g, t.red[0], t.c.zx - 0.2, 2, { vx: 7 });
  put(t.g, t.blue[0], -t.c.zx + 0.2, -2, { vx: -7 });
  for (let k = 0; k < 10; k++) t.g.step();
  assert.deepEqual(t.g.v.party().tscore, [1, 1]);
  assert.ok(slotOf(t.g.v, t.red[0]).next > t.g.v.party().t && slotOf(t.g.v, t.blue[0]).next === 0);
});

test('knocked loose: a foe rolling into a carrier at over 5 m/s drops its baton where it is, a point to the foe; a soft bump, or the carrier\'s own charge, keeps it', async () => {
  const { g, c, red, blue } = await stage(4);
  const [p] = red, [q] = blue;
  // soft: closing 3 m/s
  carry(g, p, bk(0));
  put(g, p, 0, 5);
  put(g, q, -2.6, 5, { vx: 3 });
  for (let k = 0; k < 30; k++) g.step();
  assert.equal(carried(g.v, p), bk(0), 'a soft bump keeps it');
  // the carrier charging a still foe: it is the faster into it
  put(g, p, -4, -5, { vx: 9 });
  put(g, q, -1.3, -5);
  for (let k = 0; k < 30; k++) g.step();
  assert.ok(g.v.partier(p).bumps >= 1, 'a hard bump, the carrier\'s');
  assert.equal(carried(g.v, p), bk(0), 'its own charge keeps it');
  // hard: a foe at 9 m/s into a still carrier
  put(g, p, 0, 5);
  put(g, q, -2.3, 5, { vx: 9 });
  g.step();
  const f0 = g.v.fxCount();
  for (let k = 0; k < 10 && carried(g.v, p) >= 0; k++) g.step();
  assert.equal(carried(g.v, p), -1, 'knocked loose');
  const t0 = g.v.party().t - 1;
  const b = baton(g, bk(0));
  assert.deepEqual([b.st, b.by, b.to, b.at], [MC.RY_LIES, p, 1, t0 + MC.RY_LOCK], 'lying, still going where it was');
  assert.ok(Math.abs(b.x - C) < 0.3 && Math.abs(b.z - C - 5) < 0.1, `where its carrier was: ${b.x - C}, ${b.z - C}`);
  const [x] = fxs(g.v, f0, MC.RY_FX_DROP);
  assert.ok(x.owner === p && x.shot === q && x.size > MC.RY_HARD, JSON.stringify(x));
  assert.equal(g.v.partier(q).score, MC.RY_PT_KNOCK);
  assert.deepEqual([slotOf(g.v, q).knocks, slotOf(g.v, p).lost, slotOf(g.v, p).next], [1, 1, t0 + MC.RY_REGRAB]);
  assert.deepEqual(g.v.party().tscore, [0, 0]);
  void c;
});

test('a loose baton lies where it fell: nobody\'s for RY_LOCK, never a foe\'s, not its carrier\'s for RY_REGRAB, a teammate\'s at once after the lock, who runs on to the same zone', async () => {
  const { g, c, red, blue } = await stage(4);
  const [p, p2] = red, [q, q2] = blue;
  carry(g, p, bk(0));
  put(g, p, 2, 0);
  put(g, q, -0.3, 0, { vx: 9 });
  for (let k = 0; k < 10 && carried(g.v, p) >= 0; k++) g.step();
  assert.equal(carried(g.v, p), -1);
  const t0 = g.v.party().t - 1, at = baton(g, bk(0));
  const sit = (r, dz = 0) => put(g, r, at.x - C, at.z - C + dz);
  // foes on it, and a teammate through the lock
  while (g.v.party().t < t0 + MC.RY_LOCK) {
    sit(q); sit(q2, 0.5); sit(p2, -0.5); put(g, p, -9, 6);
    g.step();
    assert.equal(baton(g, bk(0)).st, MC.RY_LIES, `locked at ${g.v.party().t - t0}`);
  }
  // its carrier alone on it after the lock: not till RY_REGRAB
  put(g, p2, -9, -6);
  while (g.v.party().t < t0 + MC.RY_REGRAB) {
    sit(q); sit(q2, 0.5); sit(p);
    g.step();
    assert.equal(baton(g, bk(0)).st, MC.RY_LIES, 'not its carrier\'s, never a foe\'s');
  }
  const same = baton(g, bk(0));
  assert.deepEqual([same.x, same.z], [at.x, at.z], 'it lies where it fell');
  // a teammate's (it would have been at once after the lock): then on to zone 1 for the leg
  put(g, p, -9, 6);
  sit(p2, 1);
  const f0 = g.v.fxCount();
  g.step();
  assert.equal(carried(g.v, p2), bk(0));
  assert.equal(fxs(g.v, f0, MC.RY_FX_TAKE)[0].shot, bk(0) | 256, 'a loose one');
  put(g, q, 9, 9); put(g, q2, 9, 6);
  put(g, p2, c.zx - 0.3, 0, { vx: 7 });
  for (let k = 0; k < 10; k++) g.step();
  assert.deepEqual([g.v.party().tscore, g.v.partier(p2).score, g.v.partier(p).score], [[1, 0], MC.RY_PT_LEG, 0]);
  // straight after the lock, with nobody resting: a teammate takes it on that tick
  const u = await stage(4, { seed: 3 });
  setB(u.g, bk(1), { x: 3, z: 3, by: u.blue[0], at: u.g.v.party().t + 4 });
  put(u.g, u.blue[1], 3, 4);
  for (let k = 0; k < 4; k++) { u.g.step(); assert.equal(carried(u.g.v, u.blue[1]), -1); }
  u.g.step();
  assert.equal(carried(u.g.v, u.blue[1]), bk(1));
});

test('the end at the target: the round is over the tick a side has its legs, 8 with one baton, every ball of it 1st and the rest by their own score', async () => {
  const { g, c, red, blue } = await stage(6);
  assert.equal(c.goal, MC.RY_TGT);
  g.dv.setUint32(L.PG_TSCORE, c.goal - 1, true);
  g.dv.setUint32(L.PG_TSCORE + 4, c.goal - 2, true);
  g.dv.setUint16(rec(blue[0]) + L.PG_SCORE, 7, true);
  g.dv.setUint16(rec(blue[1]) + L.PG_SCORE, 2, true);
  for (let k = 0; k < 50; k++) g.step();
  assert.equal(g.v.party().state, L.H_PLAY, 'one short: still playing');
  carry(g, red[0], bk(0));
  put(g, red[0], c.zx - 0.2, 0, { vx: 7 });
  let k = 0;
  for (; k < 10 && g.v.party().state === L.H_PLAY; k++) g.step();
  const r = g.v.party();
  assert.equal(r.state, L.H_OVER);
  assert.ok(r.t < 200, 'long before the clock');
  assert.deepEqual([r.tscore, r.twin], [[c.goal, c.goal - 2], 1]);
  assert.deepEqual([...red, ...blue].map((p) => g.v.partier(p).place), [1, 1, 1, 4, 5, 6]);
  assert.deepEqual([...red, ...blue].map((p) => g.v.partier(p).wins), [1, 1, 1, 0, 0, 0]);
  // two batons a side: 6 more
  assert.equal(track((await room(16, { play: false })).v).goal, MC.RY_TGT + MC.RY_TGTK);
});

test('the end at the clock: 100 s; the side with more legs wins; level, a draw, placed by score', async () => {
  const { g, red, blue } = await stage(6);
  assert.equal(g.v.party().until - g.v.party().start, MC.RY_LEN);
  assert.equal(MC.RY_LEN * TICK, 100);
  g.dv.setUint32(L.PG_TSCORE, 3, true);
  g.dv.setUint32(L.PG_TSCORE + 4, 5, true);
  g.dv.setUint16(rec(red[1]) + L.PG_SCORE, 6, true);
  g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 1, true);
  g.step();
  g.step();
  const r = g.v.party();
  assert.equal(r.state, L.H_OVER);
  assert.deepEqual([r.tscore, r.twin], [[3, 5], 2]);
  assert.deepEqual([...blue, ...red].map((p) => g.v.partier(p).place), [1, 1, 1, 5, 4, 5]);
  const t = await stage(4, { seed: 9 });
  t.g.dv.setUint32(L.PG_TSCORE, 4, true);
  t.g.dv.setUint32(L.PG_TSCORE + 4, 4, true);
  t.g.dv.setUint16(rec(t.blue[1]) + L.PG_SCORE, 4, true);
  t.g.dv.setUint32(L.HDR_UNTIL, t.g.v.tick + 1, true);
  t.g.step();
  t.g.step();
  assert.deepEqual([t.g.v.party().tscore, t.g.v.party().twin], [[4, 4], 3]);
  assert.equal(t.g.v.partier(t.blue[1]).place, 1);
  assert.equal(t.g.v.partier(t.red[0]).place, 2);
});

test('a newcomer in play goes to the smaller side and falls in by its own end wall; a carrier that leaves drops its baton where it was; a ball alone runs its baton both ways and wins at its target', async () => {
  const { g, c } = await stage(3);
  assert.deepEqual(g.v.party().tn, [2, 1]);
  g.step([[L.EV_JOIN, 3]]);
  const b = g.v.partier(3);
  assert.equal(b.side, 1);
  assert.ok(!b.out && b.pos[1] > PLAT_Y + 5, 'falling in');
  assert.ok(Math.abs(b.pos[0] - (C + c.hx - MC.RY_BACK)) < 1e-3 && Math.abs(b.pos[2] - C) <= c.hz * 0.7 + 1e-3, `${b.pos[0] - C}, ${b.pos[2] - C}`);
  assert.equal(b.m, 0);
  for (let k = 0; k < 200; k++) g.step();
  assert.ok(g.v.partier(3).ground);
  // a carrier that leaves the room drops its baton where it was, its side's to take
  const lv = await stage(4, { seed: 5 });
  const [p, p2] = lv.red;
  carry(lv.g, p, bk(0));
  put(lv.g, p, 3, 2);
  lv.g.step();
  lv.g.step([[L.EV_LEAVE, p]]);
  const lb = baton(lv.g, bk(0));
  assert.deepEqual([lb.st, lb.by], [MC.RY_LIES, p]);
  assert.ok(Math.abs(lb.x - C - 3) < 0.01 && Math.abs(lb.z - C - 2) < 0.01);
  put(lv.g, p2, 3, 3);
  for (let k = 0; k <= MC.RY_LOCK; k++) lv.g.step();
  assert.equal(carried(lv.g.v, p2), bk(0));
  // alone, an AI ball through the posts, there and back
  const one = await room(1);
  const bot = new Partier(0, 3, 0.8);
  const seen = new Set();
  for (let k = 0; k < MC.RY_LEN && one.v.party().state === L.H_PLAY; k++) {
    one.step([[L.EV_INPUT, 0, bot.think(one.v, one.v.tick, 0)]]);
    const bt = baton(one, bk(0));
    if (bt.st === MC.RY_HELD) seen.add(bt.to);
  }
  const r = one.v.party();
  assert.equal(r.state, L.H_OVER, `alone it runs: ${r.tscore} by ${r.t}`);
  assert.deepEqual([...seen].sort(), [0, 1], 'both ways');
  assert.deepEqual([r.tscore, r.twin, one.v.partier(0).place, one.v.partier(0).wins, one.v.partier(0).score], [[MC.RY_TGT, 0], 1, 1, 1, MC.RY_TGT * MC.RY_PT_LEG]);
});

test('the prediction matches the confirmed ball bit for bit: a carrier, slowed, into the posts and sent off them, off the walls and a corner, through the zone it left; a ball carrying nothing the same', async () => {
  const { g, c, red, blue } = await stage(4, { posts: true });
  const s = g.v.partier(0).side;
  // everyone else along the far end wall, out of its way
  [...red, ...blue].filter((p) => p).forEach((p, i) => put(g, p, -dir(s) * (c.hx - 1.5), -c.hz + 1.5 + 2.5 * i));
  const turn = (a) => Math.round(a / (2 * Math.PI) * 16384) & 16383;
  for (const held of [true, false]) {
    clear(g);
    g.dv.setUint32(rec(0) + L.PG_M, 0, true);
    // its side's baton, going to the other side's zone: it never gets there, so nothing is the confirmed world's
    if (held) carry(g, 0, bk(s));
    put(g, 0, dir(s) * (c.zx - 6), 1);
    // out through the rows on a slant, with hops, turning back short of the far zone; then into its own zone's corner
    const back = turn(s ? 0 : Math.PI), on = turn(s ? Math.PI : 0);
    const words = Array.from({ length: 1300 }, (_, k) => {
      const a = k < 520 ? on + (Math.floor(k / 80) & 1 ? 1100 : -1100) : back + (k < 800 ? -700 : 1500);
      return partyWord({ yaw: a & 16383, move: k % 90 < 80 ? 1 : 0, hop: k % 61 === 30 ? 1 : 0 });
    });
    let bonks = 0, walls = 0, zone = 0, f0 = g.v.fxCount();
    const watch = () => {
      const m = local(g, 0);
      bonks += fxs(g.v, f0, MC.RY_FX_BONK).filter((x) => x.owner === 0).length;
      f0 = g.v.fxCount();
      if (Math.abs(m.x) > c.hx - 1.05 || Math.abs(m.z) > c.hz - 1.05) walls++;
      if (m.x * dir(s) > c.zx) zone++;
      assert.ok(m.x * dir(s) > -c.zx, 'short of the far zone');
    };
    const n0 = predicted({ ...g, step: (recs) => { g.step(recs); watch(); } }, words);
    assert.ok(n0 >= words.length);
    assert.ok(bonks >= 2 && walls > 0 && zone > 0, `${held ? 'carrying' : 'free'}: ${bonks} posts met, ${walls} ticks on a wall, ${zone} in its zone`);
    assert.equal(carried(g.v, 0), held ? bk(s) : -1, 'all the while');
  }
});

test('the client: the track, its zones, walls and posts where the sim has them, batons lying and carried; its HUD and feed; the AI: a carrier for the far zone, the nearest rested teammate for a lying baton, one waiting where it will be set down, a hunter at a foe\'s carrier, and nobody steered into a post', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const { g, c, red, blue } = await stage(16, { posts: true });
  carry(g, red[0], bk(0));
  put(g, red[0], -4, 3, { vx: 6 });
  setB(g, bk(0, 1), { x: 5, z: -6 });
  setB(g, bk(1), { x: -3, z: 6, by: blue[0], at: g.v.party().t + 20 });
  g.step();
  const out = () => ({ scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null });
  const o = out();
  const g0 = g.v.party();
  relay.draw(g.v, { tick: g0.tick, t: g0.t * TICK, dt: 0.01, ptick: g0.tick + 6, now: 1000, slot: red[0], me: g.v.partier(red[0]), pme: g.v.partier(red[0]), own: g.v.partier(red[0]).pos }, o);
  for (let k = 0; k < o.scene.count * 16; k++) assert.ok(Number.isFinite(o.scene.data[k]), 'finite');
  // the posts: every one the scene has stands where the sim's row is, striped
  const posts = [];
  for (let k = 0; k < o.scene.count; k++) if (o.scene.data[k * 16 + 11] === 4) posts.push([o.scene.data[k * 16], o.scene.data[k * 16 + 2]]);
  assert.ok(posts.length >= c.nr * 3, `${posts.length} posts`);
  for (const [x, z] of posts) assert.ok(postNear(c, x, z, g0.t + 0.01 / TICK).d < 1e-3, 'a post where its row has one');
  // the batons: three sticks, two beams and rings for the lying ones, a target where the carrier sets its down
  const sticks = [];
  for (let k = 0; k < o.scene.count; k++) if ((o.scene.data[k * 16 + 3] & 3) === 1 && Math.abs(o.scene.data[k * 16 + 5] - MC.RY_BH / 2) < 1e-6) sticks.push(k);
  assert.equal(sticks.length, 3);
  assert.equal(o.beams.length, 2);
  assert.equal(o.decals.filter((d) => d.kind === 0).length, 2);
  const tg = o.decals.find((d) => d.kind === 3);
  assert.ok(tg && Math.abs(tg.pos[0] - (C + c.zx + MC.RY_SET)) < 1e-3, 'where to set it down');
  const heldAt = sticks.map((k) => o.scene.data[k * 16 + 1]).sort((a, b) => b - a)[0];
  assert.ok(heldAt - PLAT_Y > 2 * B_RAD + 1, 'the carried one over its carrier');
  const lines = [];
  const hctx = { put: () => {}, centre: (y, s) => lines.push(s), right: (y, s) => lines.push(s), rect: () => {}, rows: 44, C: {}, slot: red[0], now: 0, t: g0.t * TICK };
  relay.hud(g.v, hctx);
  assert.ok(lines.includes(`FIRST TO ${c.goal} LEGS`) && lines.includes('YOU HAVE THE BATON  RUN IT TO THE FAR ZONE') && lines.some((l) => l.startsWith('LEGS 0')), lines.join(' | '));
  for (const l of [...lines, relay.hint, relay.rules]) assert.ok(l.length <= 70 && /^[ -_]*$/.test(l), l);
  assert.equal(relay.frame(g.v).shape, 'square');
  assert.deepEqual([relay.facing(g.v, red[1]), relay.facing(g.v, blue[1])], [0, Math.PI]);
  const fctx = { slot: red[0], view: g.v, glow: () => {}, banner: () => {}, feed: (s) => lines.push(s), name: (q) => `P${q + 1}`, dist: 0, now: 0 };
  relay.fx({ kind: MC.RY_FX_DROP, owner: red[0], shot: blue[1], pos: [C, PLAT_Y + 2, C], size: 9, tick: 5 }, fctx);
  assert.equal(lines.at(-1), `P${blue[1] + 1} KNOCKED P${red[0] + 1}'S BATON LOOSE`);
  relay.fx({ kind: MC.RY_FX_LEG, owner: blue[1], shot: bk(1) | 256, pos: [C, PLAT_Y, C], size: c.goal - 1 }, fctx);
  assert.equal(lines.at(-1), 'BLUE NEEDS ONE MORE LEG');
  relay.fx({ kind: MC.RY_FX_TAKE, owner: red[0], shot: bk(0), pos: [C, PLAT_Y, C], size: 0 }, fctx);
  relay.fx({ kind: MC.RY_FX_BONK, owner: red[0], shot: 1, pos: [C, PLAT_Y, C], size: 0 }, fctx);
  // the brain
  const think = (p) => { const me = g.v.partier(p); const bot = { slot: p, skill: 0.8, mem: {}, pos: [me.pos[0], me.pos[2]], vel: [me.vel[0], me.vel[2]] }; return { me, bot, word: relay.brain.think(g.v, me, bot, g.v.tick), goal: relay.brain.goal(g.v, me, bot) }; };
  const far = think(red[0]).goal;
  assert.ok(Math.abs(far[0] - (C + c.zx + MC.RY_SET)) < 1e-3, `a carrier for the far zone: ${far}`);
  // red's lying baton: one red ball sent for it; where red's carried one will be set down, one waiting
  const goals = red.map((p) => think(p).goal);
  const lying = baton(g, bk(0, 1));
  assert.equal(goals.filter((q) => q && q[0] === lying.x && q[1] === lying.z).length, 1, 'one for the lying baton');
  assert.ok(goals.filter((q, i) => i && q && Math.abs(q[0] - (C + c.zx + MC.RY_SET)) < 1e-3).length >= 1, 'one waiting in the far zone');
  // blue's hunters: at least one after red's carrier, and one near enough charges it
  put(g, blue[3], 1.5, 3);
  g.step();
  const hunters = blue.map((p) => think(p)).filter((x) => x.goal && Math.hypot(x.goal[0] - g.v.partier(red[0]).pos[0], x.goal[1] - g.v.partier(red[0]).pos[2]) < 4);
  assert.ok(hunters.length >= 1, 'hunted');
  // a post where a ball will be is deadly to the planner, the open floor is not
  const row = c.rows[1], tk = g.v.tick + 30;
  const pz = postOff(row.w, 1, g.v.party().t + 30) + C;
  const me0 = g.v.partier(red[2]);
  assert.equal(relay.brain.danger(g.v, row.x, pz + 0.5, tk, me0), 1);
  assert.equal(relay.brain.danger(g.v, row.x, pz + MC.RY_PS / 2, tk, me0), 0);
  assert.equal(relay.brain.danger(g.v, row.x + MC.RY_ROWGAP / 2, pz, tk, me0), 0);
  // a foe next to a carrier, but not to a ball carrying nothing
  put(g, blue[4], g.v.partier(red[0]).pos[0] - C + 2.6, g.v.partier(red[0]).pos[2] - C);
  g.step();
  const mc = g.v.partier(red[0]);
  const here = postNear(c, mc.pos[0] + 2.4, mc.pos[2], g.v.party().t);
  if (!here || here.d > 5) {
    assert.ok(relay.brain.danger(g.v, mc.pos[0] + 2.4, mc.pos[2], g.v.tick, mc) > 0.3, 'a foe next to a carrier');
    assert.equal(relay.brain.danger(g.v, mc.pos[0] + 2.4, mc.pos[2], g.v.tick, g.v.partier(red[1])), 0);
  }
});

// A round of AI balls (client/party-bot.mjs) steered by this minigame's brain on the debug build, stats from it.
async function aiRound(balls, ticks, seed) {
  const stats = { start: -1, over: -1, takes: [0, 0], loose: [0, 0], legs: [0, 0], drops: [0, 0], bonks: 0, places: null, twin: 0 };
  let seen = 0;
  const r = await playParty({ bytes: partyBytes(true), mg: L.MG_RELAY, bots: balls, ticks, seed, onTick: (t, sim, v) => {
    const g = v.party();
    for (; seen < v.fxCount(); seen++) {
      const x = v.fx(seen);
      if (stats.over >= 0 || stats.start < 0) continue;
      if (x.kind === MC.RY_FX_TAKE) { stats.takes[v.partier(x.owner).side]++; if (x.shot & 256) stats.loose[v.partier(x.owner).side]++; }
      if (x.kind === MC.RY_FX_LEG) stats.legs[(x.shot >> 8) & 1]++;
      if (x.kind === MC.RY_FX_DROP) stats.drops[v.partier(x.owner).side]++;
      if (x.kind === MC.RY_FX_BONK) stats.bonks++;
    }
    if (stats.start < 0 && g.state === L.H_PLAY) stats.start = t;
    if (stats.over < 0 && stats.start >= 0 && g.state === L.H_OVER) {
      stats.over = t;
      stats.twin = g.twin;
      stats.tscore = g.tscore;
      stats.goal = track(v).goal;
      stats.places = [...Array(balls).keys()].map((p) => v.partier(p).place);
      stats.sides = [...Array(balls).keys()].map((p) => v.partier(p).side);
    }
  } });
  return { ...r, stats };
}

for (const [balls, ticks, seed] of [[8, 13700, 5], [64, 13700, 4]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, both sides running legs and handing on, batons knocked loose and picked up again, posts met, the round over at a side's target or the clock with the side ahead winning; equal on 1 and 4 threads`, async () => {
    const { log, sim, stats, games } = await aiRound(balls, ticks, seed);
    assert.equal(sim.error().code, 0);
    assert.ok(games.every((x) => x === L.MG_RELAY));
    assert.ok(stats.over > 0, 'the round ended');
    const len = stats.over - stats.start;
    assert.deepEqual(stats.legs, stats.tscore);
    assert.ok(len === MC.RY_LEN || (len < MC.RY_LEN && Math.max(...stats.tscore) === stats.goal), `over at ${len}: ${stats.tscore} of ${stats.goal}`);
    for (const s of [0, 1]) assert.ok(stats.legs[s] >= stats.goal / 2 && stats.takes[s] >= stats.legs[s], `legs ${stats.legs}, takes ${stats.takes}`);
    assert.ok(stats.drops[0] + stats.drops[1] >= balls / 8 && stats.loose[0] + stats.loose[1] >= 1 && stats.bonks >= 1, `${stats.drops} knocked loose, ${stats.loose} picked up, ${stats.bonks} posts met`);
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
