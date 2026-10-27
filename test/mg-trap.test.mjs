// TRAP RUN (src/mg/trap.wat): the course laid out for the crowd and who
// traps, a trap's clock from the tick a trapper rolls onto its pad (the
// mirror the client draws and the bots read, against the sim's own), each
// of the six traps on a runner and the trapper's credit, the walkway and its
// belt, the rails, home and the places, the prediction through all of it,
// and rounds of AI balls playing both sides.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty, partySeed } from '../tools/genparty.mjs';
import trap, { course, phase, PHASE, liveAt, fireAt, cellAt, drops, tiltAt, barAt, crushB, extAt, faceMin, vents, standings, trapper, trapAt, react } from '../client/mg/trap.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/trap.mjs'; // TR_*: the minigame's own constants

const TICK = 0.008;
const TURN = 16384;
const f32 = Math.fround;
const WALK = PLAT_Y + MC.TR_WH;

// A room of n balls on Trap Run, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 3, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_TRAP + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  const g = { sim, v, dv, step, c: course(v) };
  g.trappers = [...Array(n).keys()].filter((p) => trapper(v.partier(p).score));
  g.runners = [...Array(n).keys()].filter((p) => !g.trappers.includes(p));
  return g;
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// Ball p at (x, y, z) (y its bottom), moving v, on the ground or not.
function put(g, p, [x, y, z], { v = [0, 0, 0], ground = true } = {}) {
  const a = rec(p);
  [x, y, z].forEach((q, i) => g.dv.setFloat32(a + L.P_PX + 4 * i, q, true));
  v.forEach((q, i) => g.dv.setFloat32(a + L.P_VX + 4 * i, q, true));
  g.dv.setUint8(a + L.P_FL, L.PF_LIVE | (ground ? L.PF_GROUND : 0));
}
// Out of the way: a runner on the start pad, a trapper against the walkway's far end (the belt holds it there).
const park = (g, p, u = 0) => (trapper(g.v.partier(p).score) ? put(g, p, [g.c.xb - 1.5, WALK, g.c.zw + 1.5 + Math.abs(u)]) : put(g, p, [g.c.x0 - 2, PLAT_Y, g.c.cx + u]));
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const f = v.fx(k); if (f.kind === kind) out.push(f); } return out; };
const word = (yaw, o = {}) => partyWord({ yaw: Math.round(yaw / (2 * Math.PI) * TURN) & (TURN - 1), move: 1, ...o });
const still = partyWord({ yaw: 0, move: 0 });
// Ticks into play (as $p_t counts the tick about to be stepped).
const tp = (g) => g.v.party().t;
const ofKind = (g, kind) => g.c.traps.find((T) => T.kind === kind);
// Trap T as the confirmed world has it now (its arming read again).
const now = (g, T) => course(g.v).traps[T.k];
// Trapper q rolls onto T's pad: armed this tick; then it's parked again. Returns the tick into play it was armed on.
function arm(g, T, q = g.trappers[0]) {
  const t = tp(g);
  put(g, q, [T.pad, WALK, g.c.zpad]);
  g.step();
  park(g, q);
  assert.equal(now(g, T).arm, t + 1, `trap ${T.k} armed on ${t}`);
  return t;
}
// Steps until the tick into play t is next.
function until(g, t, recs = () => []) { while (tp(g) < t) g.step(recs()); }

test('the course for 1, 8, 64 and 256: a trapper for every 16 (none alone), wider for a crowd, 8 to 11 traps with every kind among the first six, railed stretches 7 to 10 m between, the pen for the crowd, centred; the runners on the start pad, the trappers on the walkway', async () => {
  let lastW = 0;
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const c = g.c;
    const w = f32(Math.min(f32(f32(f32(Math.sqrt(n)) * f32(MC.TR_WK)) + f32(MC.TR_W0)), MC.TR_WMAX));
    const ntr = n < 2 ? 0 : Math.max(1, Math.floor(n / MC.TR_PER));
    assert.equal(c.w, w, `${n}: the half-width`);
    assert.ok(c.w > lastW, 'wider for a crowd');
    lastW = c.w;
    assert.equal(g.dv.getUint32(L.PG_H + MC.TR_NTR, true), ntr, `${n}: ${ntr} trappers`);
    assert.deepEqual([r.kind, r.len, r.respawn, r.flags], [L.PK_SCORE, MC.TR_LEN, 0x7fffffff, L.PGF_BUMPS | L.PGF_NOKICK]);
    assert.equal(r.idle, f32(MC.TR_IDLE));
    assert.ok(c.nt >= MC.TR_NT0 && c.nt < MC.TR_NT0 + MC.TR_NTK, `${c.nt} traps`);
    assert.deepEqual(new Set(c.traps.slice(0, MC.TR_NK).map((T) => T.kind)).size, MC.TR_NK, 'every kind among the first six');
    for (let k = 1; k < c.nt; k++) assert.notEqual(c.traps[k].kind, c.traps[k - 1].kind, 'never the same kind twice running');
    assert.equal(c.nc, Math.max(MC.TR_NCMIN, Math.min(MC.TR_NCMAX, Math.round(f32(2 * w) / MC.TR_CELL))));
    assert.equal(c.cw, f32(f32(2 * w) / c.nc));
    assert.ok(Math.abs(c.traps[0].x0 - c.x0 - MC.TR_X1) < 1e-3 && Math.abs(c.fin - c.traps.at(-1).x1 - MC.TR_XN) < 1e-3, 'the first trap and the line');
    for (const T of c.traps) {
      const len = T.kind === MC.TR_K_SWEEP ? 2 * w + 2 : MC.TR_LENS[T.kind];
      assert.ok(Math.abs(T.x1 - T.x0 - len) < 1e-3, `${n}: trap ${T.k}'s length`);
      assert.ok(Math.abs(T.pad - (T.x0 + T.x1) / 2) < 1e-3, 'its pad beside its middle');
      if (T.k) {
        const gap = T.x0 - c.traps[T.k - 1].x1;
        assert.ok(gap >= MC.TR_GAP0 - 1e-3 && gap <= MC.TR_GAP0 + MC.TR_GAPK + 1e-3, `${n}: ${gap.toFixed(2)} m of rails between`);
      }
    }
    assert.ok(Math.abs(c.xb - c.fin - (MC.TR_PEN0 + MC.TR_PENK * n)) < 1e-3, 'the pen for the crowd');
    assert.ok(Math.abs((c.xa + c.xb) / 2 - L.B_CX) < 0.01 && Math.abs(c.cx - L.B_CX) < 1e-6, 'centred');
    assert.ok(Math.abs(c.zw - (c.zr + MC.TR_WALL)) < 1e-4 && Math.abs(c.ww - (MC.TR_WW0 + MC.TR_WWK * ntr)) < 1e-4, 'the walkway past the wall');
    assert.ok(Math.abs(r.size - Math.max(c.xb - c.xa, 2 * c.w + c.ww + MC.TR_WALL) / 2) < 0.01);
    // the grid: runners on the pad inside the rails, trappers on the walkway short of the first pad, apart
    const spots = [];
    let walking = 0;
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.ok(b.ground && !b.out);
      if (b.pos[2] > c.zr) {
        walking++;
        assert.equal(b.pos[1], WALK);
        assert.ok(b.pos[2] > c.zw + 1 - 1e-4 && b.pos[2] < c.zw + c.ww - 1 && b.pos[0] > c.xa + 1 && b.pos[0] < c.x0, `${n}: P${p + 1} on the walkway behind the start line`);
      } else {
        assert.equal(b.pos[1], PLAT_Y);
        assert.ok(b.pos[0] > c.xa + 1 && b.pos[0] < c.x0 && Math.abs(b.pos[2] - c.cx) < c.w - 1, `${n}: P${p + 1} on the pad`);
      }
      spots.push([b.pos[0], b.pos[2]]);
    }
    assert.equal(walking, ntr);
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) > 2.3, `${n}: ${i} and ${j} apart`);
  }
});

test('who traps is the seed\'s, and so is the course: as play starts a trapper\'s score is TR_TRAP0, a runner\'s 0; other seeds pick other trappers and other orders of traps', async () => {
  const picks = new Set(), orders = new Set();
  for (let seed = 1; seed <= 10; seed++) {
    const g = await room(32, { seed: seed * 7919 });
    assert.equal(g.trappers.length, 2);
    for (const p of g.trappers) assert.ok(g.v.partier(p).pos[2] > g.c.zr && g.v.partier(p).score === MC.TR_TRAP0);
    for (const p of g.runners) assert.ok(g.v.partier(p).pos[2] < g.c.zr && g.v.partier(p).score === 0);
    picks.add(g.trappers.join(','));
    orders.add(g.c.traps.map((T) => T.kind).join(''));
  }
  assert.ok(picks.size >= 8, `trappers ${[...picks].join(' ')}`);
  assert.ok(orders.size >= 9, `courses ${[...orders].join(' ')}`);
  // nobody traps alone; of two, one does
  for (const [n, want] of [[1, 0], [2, 1], [15, 1], [16, 1], [47, 2], [48, 3]]) assert.equal((await room(n, { play: n > 8 ? false : true })).dv.getUint32(L.PG_H + MC.TR_NTR, true), want, `${n} balls`);
});

test('a trapper\'s centre on a pad arms its trap (TR_FX_TRAP there); TR_DELAY on it fires (the FX again, shot | 256), is live its kind\'s TR_LIVES, cools TR_COOL, and only then can be armed again; just off the pad or over it in the air, nothing; the mirror\'s clock is the sim\'s', async () => {
  const g = await room(3);
  const c = g.c;
  const q = g.trappers[0];
  g.runners.forEach((p, i) => park(g, p, 3 * i - 2));
  const T = c.traps[2];
  put(g, q, [T.pad - MC.TR_PADR - 0.05, WALK, c.zpad]);
  g.step();
  put(g, q, [T.pad, WALK + 1.5, c.zpad], { ground: false });
  g.step();
  assert.equal(now(g, T).arm, 0, 'not armed off the pad or in the air');
  park(g, q);
  const fx0 = g.v.fxCount();
  const t0 = arm(g, T, q);
  const a = fxs(g.v, MC.TR_FX_TRAP, fx0);
  assert.deepEqual([a.length, a[0].owner, a[0].shot, a[0].size], [1, q, T.k, T.kind], 'armed: who, which, what');
  assert.ok(Math.abs(a[0].pos[0] - T.pad) < 1e-4 && a[0].pos[1] === WALK && Math.abs(a[0].pos[2] - c.zpad) < 1e-4, 'at its pad');
  assert.equal(now(g, T).by, q);
  // the mirror's clock: armed TR_DELAY, live, cooling, idle
  const run = [];
  for (let t = t0; t < t0 + MC.TR_DELAY + T.live + MC.TR_COOL + 5; t++) run.push(phase(now(g, T), t).ph);
  assert.deepEqual([run.indexOf(PHASE.WARN), run.indexOf(PHASE.LIVE), run.indexOf(PHASE.COOL), run.lastIndexOf(PHASE.COOL) + 1],
    [0, MC.TR_DELAY, MC.TR_DELAY + T.live, MC.TR_DELAY + T.live + MC.TR_COOL]);
  assert.equal(phase(now(g, T), t0 - 1).ph, PHASE.IDLE);
  assert.equal(fireAt(now(g, T)), t0 + MC.TR_DELAY);
  // on the pad the whole time: armed again only on the tick it's idle; it fires on t0 + TR_DELAY
  const idle = t0 + MC.TR_DELAY + T.live + MC.TR_COOL;
  while (tp(g) <= idle) {
    const t = tp(g);
    put(g, q, [T.pad, WALK, c.zpad]);
    g.step();
    assert.equal(now(g, T).arm, t < idle ? t0 + 1 : idle + 1, `tick ${t}`);
  }
  const fired = fxs(g.v, MC.TR_FX_TRAP, fx0).filter((f) => f.shot & 256);
  assert.deepEqual(fired.map((f) => [f.tick - g.v.party().start, f.shot, f.owner]), [[t0 + MC.TR_DELAY, T.k | 256, q]], 'fired once, on time');
  assert.equal(fxs(g.v, MC.TR_FX_TRAP, fx0).length, 3, 'armed, fired, armed again');
  // a runner never arms one (it can't reach a pad: the wall and TR_WH of it); a runner put on a pad arms nothing either
  park(g, q);
  const U = c.traps[4];
  put(g, g.runners[0], [U.pad, WALK, c.zpad]);
  g.step();
  assert.equal(now(g, U).arm, 0, 'a runner on a pad');
});

test('trapdoors: as the trap is armed a share TR_DODDS / 256 of its panels is drawn to drop; through the warning they hold, live they drop whoever is on them (theirs, PG_M), the rest hold; a runner one takes is its trapper\'s, one up, if out within TR_CREDIT of it; after, the floor is whole', async () => {
  const g = await room(3, { seed: 11 });
  const c = g.c;
  const q = g.trappers[0];
  const [p, o] = g.runners;
  park(g, o, 3);
  const T = ofKind(g, MC.TR_K_DROP);
  const cells = MC.TR_DROWS * c.nc;
  // the draw: over many armings about the odds, never past the section's cells
  let n = 0, k = 0;
  for (; k < 12; k++) {
    const t0 = arm(g, T, q);
    const U = now(g, T);
    for (let i = 0; i < cells; i++) n += drops(U, i);
    for (let i = cells; i < 64; i++) assert.ok(!drops(U, i));
    until(g, t0 + MC.TR_DELAY + T.live + MC.TR_COOL);
  }
  const share = n / (k * cells);
  assert.ok(Math.abs(share - MC.TR_DODDS / 256) < 0.08, `${(100 * share).toFixed(0)}% drop`);
  // a runner on a dropping panel and one on a holding one, through the warning and the drop
  const t0 = arm(g, T, q);
  const U = now(g, T);
  const centre = (i) => [T.x0 + (Math.floor(i / c.nc) + 0.5) * MC.TR_CELL, c.zl + ((i % c.nc) + 0.5) * c.cw];
  const bad = [...Array(cells).keys()].find((i) => drops(U, i) && i % c.nc > 0 && i % c.nc < c.nc - 1);
  const good = [...Array(cells).keys()].find((i) => !drops(U, i));
  assert.equal(cellAt(c, U, ...centre(bad)), bad);
  const [bx, bz] = centre(bad), [gx, gz] = centre(good);
  put(g, p, [bx, PLAT_Y, bz]);
  put(g, o, [gx, PLAT_Y, gz]);
  const fx0 = g.v.fxCount();
  until(g, t0 + MC.TR_DELAY, () => [[L.EV_INPUT, p, still], [L.EV_INPUT, o, still]]);
  assert.ok(g.v.partier(p).ground && g.v.partier(p).pos[1] === PLAT_Y, 'held through the warning');
  g.step();
  assert.ok(!g.v.partier(p).ground && g.v.partier(o).ground, 'dropped live; the good panel holds');
  assert.equal(g.v.partier(p).m, (T.k + 1) | (t0 + MC.TR_DELAY) << 8, 'PG_M: the trap and the tick it had it');
  for (let i = 0; i < 400 && !g.v.partier(p).out; i++) g.step();
  assert.ok(g.v.partier(p).out && !g.v.partier(o).out);
  assert.equal(g.v.partier(p).score, Math.trunc(f32(f32(bx) - c.x0) * 10), 'placed where it fell');
  const taken = fxs(g.v, MC.TR_FX_TAKEN, fx0);
  assert.deepEqual(taken.map((f) => [f.owner, f.shot, f.size]), [[p, q, MC.TR_K_DROP]], 'its trapper took it');
  assert.equal(g.v.partier(q).score, MC.TR_TRAP0 + 1);
  assert.equal(g.dv.getUint8(L.PG_S + MC.TR_KILLS + q), 1);
  assert.equal(g.dv.getUint32(L.PG_H + MC.TR_TAKEN, true), 1);
  assert.equal(trap.sink(fxs(g.v, L.FX_SINK, fx0)[0], (s) => `P${s + 1}`, g.v), `P${p + 1} DROPPED BY P${q + 1}`);
  // cooling, the floor is whole again
  until(g, t0 + MC.TR_DELAY + T.live + 1);
  put(g, o, [bx, PLAT_Y, bz]);
  for (let i = 0; i < 30; i++) g.step();
  assert.ok(g.v.partier(o).ground && g.v.partier(o).pos[1] === PLAT_Y, 'whole once it\'s over');
  // credit: a runner out within TR_CREDIT of a trap having it is that trap's trapper's; later, or off the
  // open edge on its own, nobody's
  {
    const g = await room(3, { seed: 5 });
    const c = g.c;
    const q = g.trappers[0];
    const [p, o] = g.runners;
    park(g, o, 3);
    const T = c.traps[1];
    until(g, 700);
    arm(g, T, q);
    // off the open edge along a trap: its last trap's tick set just in time, then just too long ago
    for (const [ago, want] of [[MC.TR_CREDIT - 200, 1], [MC.TR_CREDIT + 10, 0], [-1, 0]]) {
      const fx0 = g.v.fxCount();
      put(g, p, [T.x0 + 3, PLAT_Y, c.zl - 1.2], { ground: false });
      // it is out about 1.2 s on
      g.dv.setUint32(rec(p) + L.PG_M, ago < 0 ? 0 : (T.k + 1) | ((tp(g) + 150 - ago) << 8), true);
      for (let i = 0; i < 400 && !g.v.partier(p).out; i++) g.step();
      assert.ok(g.v.partier(p).out);
      assert.equal(fxs(g.v, MC.TR_FX_TAKEN, fx0).length, want, `${ago} ticks`);
      // back in, for the next
      g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE);
    }
    assert.equal(g.v.partier(q).score, MC.TR_TRAP0 + 1);
  }
});

test('pistons: punching out they take a runner in front of them on toward the open edge at TR_SHOVE (TR_FX_HIT), off it and out, its trapper\'s; the strip past their reach is safe; out, they\'re a wall', async () => {
  const g = await room(4, { seed: 21 });
  const c = g.c;
  const q = g.trappers[0];
  const [p, o, s] = g.runners;
  const T = ofKind(g, MC.TR_K_PIST);
  park(g, s, 4);
  const t0 = arm(g, T, q);
  const hit = [T.x0 + 4, PLAT_Y, c.cx + c.w - 2.5], safe = [T.x1 - 3, PLAT_Y, faceMin(c) - 1.3];
  put(g, p, hit);
  put(g, o, safe);
  until(g, t0 + MC.TR_DELAY, () => [[L.EV_INPUT, p, still], [L.EV_INPUT, o, still]]);
  assert.deepEqual(g.v.partier(p).pos, hit.map(f32), 'nothing through the warning');
  const fx0 = g.v.fxCount();
  let k = 0;
  while (!fxs(g.v, MC.TR_FX_HIT, fx0).length && k++ < MC.TR_PEXT) g.step();
  const e = tp(g) - 1 - (t0 + MC.TR_DELAY);
  const face = c.zr - extAt(e) * 2 * c.w * MC.TR_PREACH;
  const f = fxs(g.v, MC.TR_FX_HIT, fx0)[0];
  assert.deepEqual([f.owner, f.shot, f.size], [p, T.k | (MC.TR_K_PIST << 8), MC.TR_SHOVE]);
  assert.ok(e < MC.TR_PEXT && Math.abs(g.v.partier(p).pos[2] + 1 - face) < 1e-3 && g.v.partier(p).vel[2] === -MC.TR_SHOVE, `punched on tick ${e} of its live time`);
  for (let i = 0; i < 400 && !g.v.partier(p).out; i++) g.step();
  assert.ok(g.v.partier(p).out, 'off the open edge');
  assert.deepEqual(fxs(g.v, MC.TR_FX_TAKEN, fx0).map((f) => [f.owner, f.shot, f.size]), [[p, q, MC.TR_K_PIST]]);
  assert.deepEqual(g.v.partier(o).pos, safe.map(f32), 'the strip past their reach untouched');
  // armed again: held out, a wall to a runner rolled at it, hopping or not
  until(g, t0 + MC.TR_DELAY + T.live + MC.TR_COOL + 1);
  const t1 = arm(g, T, q);
  until(g, t1 + MC.TR_DELAY + MC.TR_PEXT + 2);
  for (const hop of [0, 1]) {
    put(g, o, [T.xc, PLAT_Y, faceMin(c) - 3], { v: [0, 0, 8] });
    for (let i = 0; i < 25; i++) {
      g.step([[L.EV_INPUT, o, word(Math.PI / 2, { hop: hop && i === 3 ? 1 : 0 })]]);
      const b = g.v.partier(o);
      if (b.pos[1] < PLAT_Y + MC.TR_PH) assert.ok(b.pos[2] <= faceMin(c) - 1 + 1e-3, `held off the face (${(b.pos[2] - faceMin(c)).toFixed(3)})`);
    }
  }
  assert.equal(fxs(g.v, MC.TR_FX_HIT, fx0).length, 1, 'no punch but the first');
});

test('the sweeper: its post is solid; at rest its bar lies sunk in the floor along the course; live, up at ball height, it turns half round, flinging a runner it meets on round, out and up (TR_FX_HIT); a hop over it as it comes clears it', async () => {
  const g = await room(3, { seed: 3 });
  const c = g.c;
  const q = g.trappers[0];
  const [p, o] = g.runners;
  park(g, o, 3);
  park(g, q);
  const T = ofKind(g, MC.TR_K_SWEEP);
  // the post, rolled at from four ways
  for (const a of [0, 1, 2, 3]) {
    const ang = a * Math.PI / 2 + 0.3;
    put(g, p, [T.xc - 4 * Math.cos(ang), PLAT_Y, c.cx - 4 * Math.sin(ang)], { v: [8 * Math.cos(ang), 0, 8 * Math.sin(ang)] });
    for (let i = 0; i < 60; i++) {
      g.step([[L.EV_INPUT, p, word(ang)]]);
      const b = g.v.partier(p);
      assert.ok(Math.hypot(b.pos[0] - T.xc, b.pos[2] - c.cx) >= 1 + MC.TR_POST - 1e-3, 'never in the post');
    }
  }
  // the bar at rest, sunk in the floor: a runner rolls straight across it
  const fx1 = g.v.fxCount();
  put(g, p, [T.xc + 3, PLAT_Y, c.cx - 3], { v: [0, 0, 6] });
  for (let i = 0; i < 120; i++) {
    g.step([[L.EV_INPUT, p, word(Math.PI / 2)]]);
    assert.ok(g.v.partier(p).ground && g.v.partier(p).pos[1] === PLAT_Y, 'on the floor');
  }
  assert.ok(g.v.partier(p).pos[2] > c.cx + 3 && !fxs(g.v, MC.TR_FX_HIT, fx1).length, 'across it');
  // live: a runner standing in its way is flung; one that hops as it comes is not
  const run = (lead) => {
    const t0 = arm(g, T, q);
    const spot = [T.xc + 2.5, PLAT_Y, c.cx + 2.5];
    put(g, p, spot);
    until(g, t0 + MC.TR_DELAY, () => [[L.EV_INPUT, p, still]]);
    const fx0 = g.v.fxCount();
    // the tick into play its bar would touch the ball on the floor
    const touch = Math.sqrt((1 + MC.TR_BW) ** 2 - (1 - MC.TR_BY) ** 2);
    const reach = (() => { for (let t = t0 + MC.TR_DELAY; ; t++) { const a = barAt(now(g, T), t); if (2.5 * Math.cos(a) - 2.5 * Math.sin(a) < touch) return t; } })();
    while (tp(g) < reach + 40) g.step([[L.EV_INPUT, p, partyWord({ yaw: 0, move: 0, hop: lead && tp(g) === reach - lead ? 1 : 0 })]]);
    const hits = fxs(g.v, MC.TR_FX_HIT, fx0).filter((f) => f.owner === p);
    until(g, t0 + MC.TR_DELAY + T.live + MC.TR_COOL + 1);
    return hits;
  };
  const flung = run(0);
  assert.ok(flung.length >= 1 && flung[0].shot === (T.k | (MC.TR_K_SWEEP << 8)) && flung[0].size >= MC.TR_KICK0, 'flung');
  let cleared = 0;
  for (const lead of [10, 13, 16, 19]) if (!run(lead).length) cleared++;
  assert.ok(cleared >= 1, 'a hop in time clears it');
});

test('the crusher: falling, it crushes a runner under it through the floor (TR_FX_HIT), out and its trapper\'s; one clear of it is left be; down and rising, it\'s a wall', async () => {
  const g = await room(3, { seed: 9 });
  const c = g.c;
  const q = g.trappers[0];
  const [p, o] = g.runners;
  const T = ofKind(g, MC.TR_K_CRUSH);
  const t0 = arm(g, T, q);
  const clear = [T.xc + MC.TR_CL / 2 + 1.2, PLAT_Y, c.cx];
  put(g, p, [T.xc + 0.5, PLAT_Y, c.cx - 2]);
  put(g, o, clear);
  until(g, t0 + MC.TR_DELAY, () => [[L.EV_INPUT, p, still], [L.EV_INPUT, o, still]]);
  const fx0 = g.v.fxCount();
  let k = 0;
  while (!g.v.partier(p).falling && k++ < MC.TR_CFALL) g.step();
  const e = tp(g) - 1 - (t0 + MC.TR_DELAY);
  assert.ok(crushB(e) < 2 && crushB(e - 1) >= 2, `crushed the tick its bottom passes the ball's top (${crushB(e).toFixed(2)})`);
  assert.deepEqual(fxs(g.v, MC.TR_FX_HIT, fx0).map((f) => [f.owner, f.shot]), [[p, T.k | (MC.TR_K_CRUSH << 8)]]);
  for (let i = 0; i < 300 && !g.v.partier(p).out; i++) g.step();
  assert.ok(g.v.partier(p).out);
  assert.deepEqual(fxs(g.v, MC.TR_FX_TAKEN, fx0).map((f) => [f.owner, f.shot]), [[p, q]]);
  assert.deepEqual(g.v.partier(o).pos, clear.map(f32), 'clear of it, left be');
  // armed again and down: rolled at from either side, held off it
  until(g, t0 + MC.TR_DELAY + T.live + MC.TR_COOL + 1);
  const t1 = arm(g, T, q);
  until(g, t1 + MC.TR_DELAY + MC.TR_CFALL);
  for (const s of [-1, 1]) {
    put(g, o, [T.xc + s * (MC.TR_CL / 2 + 3), PLAT_Y, c.cx], { v: [-8 * s, 0, 0] });
    for (let i = 0; i < 40; i++) {
      g.step([[L.EV_INPUT, o, word(s < 0 ? 0 : Math.PI)]]);
      assert.ok(Math.abs(g.v.partier(o).pos[0] - T.xc) >= MC.TR_CL / 2 + 1 - 1e-3, 'a wall');
    }
  }
  assert.ok(liveAt(now(g, T), tp(g)) >= MC.TR_CFALL && liveAt(now(g, T), tp(g)) < MC.TR_CUP);
});

test('air jets: live, a runner low over a vent goes up at TR_JETV, back at TR_JETB and toward the open edge at TR_JETS (TR_FX_HIT); between the vents, or before it fires, nothing', async () => {
  const g = await room(3, { seed: 13 });
  const c = g.c;
  const q = g.trappers[0];
  const [p, o] = g.runners;
  const T = ofKind(g, MC.TR_K_JET);
  const V = vents(c, now(g, T));
  assert.equal(V.length, 2 * Math.floor(c.nc / 2) + (c.nc & 1), 'every other cell across, the rows staggered');
  const t0 = arm(g, T, q);
  const [vx, vz] = V[0];
  const between = [vx, PLAT_Y, vz + c.cw];
  put(g, p, [vx, PLAT_Y, vz]);
  put(g, o, between);
  until(g, t0 + MC.TR_DELAY, () => [[L.EV_INPUT, p, still], [L.EV_INPUT, o, still]]);
  assert.ok(g.v.partier(p).ground && g.v.partier(p).pos[0] === f32(vx), 'nothing before it fires');
  const fx0 = g.v.fxCount();
  g.step();
  const b = g.v.partier(p);
  assert.deepEqual(b.vel, [-MC.TR_JETB, MC.TR_JETV, -MC.TR_JETS], 'blown up, back and to the edge');
  assert.ok(!b.ground);
  assert.deepEqual(fxs(g.v, MC.TR_FX_HIT, fx0).map((f) => [f.owner, f.shot, f.size]), [[p, T.k | (MC.TR_K_JET << 8), MC.TR_JETV]]);
  for (let i = 0; i < 30; i++) g.step();
  assert.ok(g.v.partier(p).pos[1] > PLAT_Y + 2, 'high up');
  assert.deepEqual(g.v.partier(o).pos, between.map(f32), 'between the vents, nothing');
});

test('the tipper: live, its floor tips down from the wall to the open edge, TR_TILT over TR_TRAMP ticks; a runner on it is held to it and pulled down it, off the edge and out unless it climbs; at the wall it holds; then it levels', async () => {
  const g = await room(3, { seed: 17 });
  const c = g.c;
  const q = g.trappers[0];
  const [p, o] = g.runners;
  const T = ofKind(g, MC.TR_K_TIP);
  const t0 = arm(g, T, q);
  put(g, p, [T.xc - 2, PLAT_Y, c.cx - c.w + 2.5]);
  put(g, o, [T.xc + 2, PLAT_Y, c.cx + c.w - 1.5]);
  const up = word(Math.PI / 2);
  until(g, t0 + MC.TR_DELAY, () => [[L.EV_INPUT, p, still], [L.EV_INPUT, o, up]]);
  const fx0 = g.v.fxCount();
  let lowest = 0;
  for (let i = 0; i < T.live && !g.v.partier(p).out; i++) {
    g.step([[L.EV_INPUT, o, up]]);
    const e = tp(g) - 1 - (t0 + MC.TR_DELAY);
    const th = tiltAt(e);
    const b = g.v.partier(o);
    // held to the slope: its bottom on the tipped floor's top at its z
    const top = PLAT_Y - (c.zr - b.pos[2]) * Math.tan(th);
    assert.ok(Math.abs(b.pos[1] - top) < 0.02, `tick ${e}: on the slope (${(b.pos[1] - top).toFixed(3)})`);
    lowest = Math.min(lowest, b.pos[1] - PLAT_Y);
  }
  assert.ok(Math.abs(tiltAt(MC.TR_TRAMP) - MC.TR_TILT / 16384 * 2 * Math.PI) < 1e-9 && tiltAt(MC.TR_TRAMP - 1) === tiltAt(MC.TR_TRAMP));
  for (let i = 0; i < 400 && !g.v.partier(p).out; i++) g.step([[L.EV_INPUT, o, up]]);
  assert.ok(g.v.partier(p).out, 'slid off the open edge');
  assert.deepEqual(fxs(g.v, MC.TR_FX_TAKEN, fx0).map((f) => [f.owner, f.shot]), [[p, q]]);
  until(g, t0 + MC.TR_DELAY + T.live + 2, () => [[L.EV_INPUT, o, up]]);
  assert.ok(!g.v.partier(o).out && g.v.partier(o).pos[1] === PLAT_Y && lowest < 0, 'climbing at the wall, it held; level again');
});

test('the walkway: past the start line its belt carries a trapper on it on down the course at TR_BELT, not one in the air; its sides and ends hold it; the runners\' course: rails along the stretches, the wall all along, the pad\'s back and the pen\'s end hold a runner, and along a trap its open edge doesn\'t', async () => {
  const g = await room(3, { seed: 23 });
  const c = g.c;
  const q = g.trappers[0];
  const [p, o] = g.runners;
  park(g, o, 3);
  // behind the start line it's still
  put(g, q, [c.x0 - 2, WALK, c.zw + c.ww / 2]);
  for (let k = 0; k < 50; k++) g.step([[L.EV_INPUT, q, still]]);
  assert.equal(g.v.partier(q).pos[0], f32(c.x0 - 2));
  const x0 = c.x0 + 3;
  put(g, q, [x0, WALK, c.zw + c.ww / 2]);
  for (let k = 0; k < 100; k++) g.step([[L.EV_INPUT, q, still]]);
  const moved = g.v.partier(q).pos[0] - x0;
  assert.ok(Math.abs(moved - 100 * MC.TR_BELT * TICK) < 2e-3 && g.v.partier(q).vel[0] === 0, `carried ${moved.toFixed(3)} m in 0.8 s, its own speed still 0`);
  put(g, q, [x0, WALK + 2, c.zw + c.ww / 2], { ground: false });
  g.step([[L.EV_INPUT, q, still]]);
  assert.equal(g.v.partier(q).pos[0], f32(x0), 'not in the air');
  // at 12 m/s into either side and either end: held on it
  for (const [at, v] of [[[x0 + 10, c.zw + 2], [0, -12]], [[x0 + 10, c.zw + c.ww - 2], [0, 12]], [[c.xa + 2, c.zw + 2], [-12, 0]], [[c.xb - 2, c.zw + 2], [12, 0]]]) {
    put(g, q, [at[0], WALK, at[1]], { v: [v[0], 0, v[1]] });
    for (let k = 0; k < 40; k++) {
      g.step([[L.EV_INPUT, q, still]]);
      const b = g.v.partier(q);
      assert.ok(b.ground && b.pos[1] === WALK && b.pos[2] >= c.zw + 1 - 1e-3 && b.pos[2] <= c.zw + c.ww - 1 + 1e-3 && b.pos[0] >= c.xa + 1 - 1e-3 && b.pos[0] <= c.xb - 1 + 1e-3, `on the walkway ${at} ${k} ${b.ground} ${b.pos.map((x, i) => x - [c.xa, WALK, c.zw][i])}`);
    }
  }
  park(g, q);
  // a runner: the rails along a stretch and the wall hold it in, rolled at either at 12 m/s
  const S = (c.traps[2].x0 + c.traps[1].x1) / 2;
  for (const s of [1, -1]) {
    put(g, p, [S, PLAT_Y, c.cx + s * (c.w - 2)], { v: [0, 0, 12 * s] });
    for (let k = 0; k < 40; k++) g.step([[L.EV_INPUT, p, still]]);
    const b = g.v.partier(p);
    assert.ok(!b.out && b.ground && Math.abs(b.pos[2] - c.cx) <= c.w - 1 + 1e-3 && b.vel[2] * s <= 0, `held in: ${(b.pos[2] - c.cx).toFixed(2)}`);
  }
  // along a trap, the wall holds and the open edge doesn't
  const T = c.traps[3];
  put(g, p, [T.xc + 1, PLAT_Y, c.cx + c.w - 2], { v: [0, 0, 12] });
  for (let k = 0; k < 40; k++) g.step([[L.EV_INPUT, p, still]]);
  assert.ok(g.v.partier(p).pos[2] <= c.cx + c.w - 1 + 1e-3, 'the wall');
  put(g, p, [T.xc + 1, PLAT_Y, c.cx - c.w + 2], { v: [0, 0, -12] });
  const fx0 = g.v.fxCount();
  for (let k = 0; k < 300 && !g.v.partier(p).out; k++) g.step([[L.EV_INPUT, p, still]]);
  assert.ok(g.v.partier(p).out, 'off the open edge');
  assert.equal(fxs(g.v, MC.TR_FX_TAKEN, fx0).length, 0, 'nobody\'s');
  // the pad's back and the pen's end
  put(g, o, [c.xa + 2, PLAT_Y, c.cx], { v: [-12, 0, 0] });
  for (let k = 0; k < 40; k++) g.step([[L.EV_INPUT, o, still]]);
  assert.ok(g.v.partier(o).pos[0] >= c.xa + 1 - 1e-3, 'the back');
  put(g, o, [c.xb - 2, PLAT_Y, c.cx], { v: [12, 0, 0] });
  for (let k = 0; k < 40; k++) g.step([[L.EV_INPUT, o, still]]);
  assert.ok(g.v.partier(o).pos[0] <= c.xb - 1 + 1e-3 && !g.v.partier(o).out, 'the pen\'s end');
});

test('home: over the line a runner scores TR_WIN plus the ticks it had left and takes its place (TR_FX_HOME), carried into the pen; the first cuts the clock to TR_LATE; no runner left on the course ends it, the runners home by finishing order, then the trappers by the runners they took, then the rest by distance', async () => {
  const g = await room(4, { seed: 31 });
  const c = g.c;
  const [a, b, d] = g.runners;
  const q = g.trappers[0];
  park(g, q);
  const shove = (p, u, v = 8) => put(g, p, [c.fin - 1.5, PLAT_Y, c.cx + u], { v: [v, 0, 0] });
  shove(a, -2);
  park(g, b, -2);
  park(g, d, 2);
  const fx0 = g.v.fxCount();
  let k = 0;
  while (g.v.partier(a).score < MC.TR_WIN && k++ < 60) g.step();
  const t0 = tp(g) - 1;
  assert.equal(g.v.partier(a).score, MC.TR_WIN + MC.TR_LEN - t0, 'TR_WIN and the ticks it had left');
  const home = fxs(g.v, MC.TR_FX_HOME, fx0);
  assert.deepEqual(home.map((f) => [f.owner, f.size, f.shot]), [[a, 1, MC.TR_LATE / 125]], 'home 1st, the rest TR_LATE to go');
  assert.equal(g.v.hole().until, g.v.party().start + t0 + MC.TR_LATE, 'the clock cut');
  // stopped just over the line, carried on into the pen; its score stays
  put(g, a, [c.fin + 0.5, PLAT_Y, c.cx - 2]);
  for (let n = 0; n < 300; n++) g.step([[L.EV_INPUT, a, still]]);
  assert.ok(g.v.partier(a).pos[0] > c.fin + MC.TR_MOUTH - 0.5, 'carried in off the line');
  assert.equal(g.v.partier(a).score, MC.TR_WIN + MC.TR_LEN - t0);
  // one falls off; the last home: over on that tick
  put(g, b, [c.traps[2].xc, PLAT_Y, c.zl - 1.3], { ground: false });
  while (!g.v.partier(b).out) g.step();
  shove(d, 2);
  while (g.v.partier(d).score < MC.TR_WIN) g.step();
  const r = g.v.party();
  assert.equal(r.state, L.H_OVER, 'no runner left: over');
  assert.deepEqual(standings(g.v).map((e) => [e.slot, e.rank]), [[a, 1], [d, 2], [q, 3], [b, 4]]);
  assert.deepEqual([a, d, q, b].map((p) => g.v.partier(p).place), [1, 2, 3, 4]);
  assert.deepEqual([a, d, q, b].map((p) => g.v.partier(p).pts), [10, 7, 4, 1]);
  assert.equal(r.winner, a);
});

test('the clock: nobody home, the round ends at PG_LEN; placed by score: the trappers by the runners they took, ahead of every runner out on the course, who place by how far down it they got (a decimetre a point); a newcomer runs, from the pad; alone, nobody traps', async () => {
  const g = await room(3, { seed: 37 });
  const c = g.c;
  const q = g.trappers[0];
  const [a, b] = g.runners;
  park(g, q);
  put(g, a, [c.x0 + 3.04, PLAT_Y, c.cx - 2]);
  put(g, b, [c.x0 + 8.97, PLAT_Y, c.cx + 2]);
  g.step([[L.EV_JOIN, 3]]);
  const n = g.v.partier(3);
  assert.ok(n.pos[0] > c.xa && n.pos[0] < c.x0 && n.pos[1] > PLAT_Y + 5 && !n.out && n.score === 0, 'a newcomer drops onto the pad, a runner');
  while (g.v.party().state === L.H_PLAY) g.step();
  const r = g.v.party();
  assert.equal(r.tick - 1 - r.start, MC.TR_LEN, 'at PG_LEN');
  assert.deepEqual([q, a, b].map((p) => g.v.partier(p).score), [MC.TR_TRAP0, 30, 89]);
  assert.deepEqual([q, b, a, 3].map((p) => g.v.partier(p).place), [1, 2, 3, 4]);
  assert.equal(r.winner, q, 'nobody home: the trapper wins');
  // a crowd with two trappers: the one that took more first
  const h = await room(32, { seed: 41 });
  const [q1, q2] = h.trappers;
  h.dv.setUint16(rec(q1) + L.PG_SCORE, MC.TR_TRAP0 + 1, true);
  h.dv.setUint16(rec(q2) + L.PG_SCORE, MC.TR_TRAP0 + 3, true);
  h.dv.setUint32(L.HDR_UNTIL, h.v.hole().tick + 2, true);
  for (let k = 0; k < 3; k++) h.step();
  assert.equal(h.v.party().state, L.H_OVER);
  assert.deepEqual([q2, q1].map((p) => h.v.partier(p).place), [1, 2]);
  assert.ok(h.runners.every((p) => h.v.partier(p).place > 2));
  // a room of one runs alone, nobody trapping, and wins by getting home; in a room of two one traps, and a
  // runner that falls leaves it the win
  {
    const g = await room(1, { seed: 43 });
    assert.deepEqual([g.trappers.length, g.runners.length], [0, 1]);
    put(g, 0, [g.c.fin - 1.5, PLAT_Y, g.c.cx], { v: [8, 0, 0] });
    for (let k = 0; k < 60 && g.v.party().state === L.H_PLAY; k++) g.step();
    assert.equal(g.v.party().state, L.H_OVER, 'home: over');
    assert.deepEqual([g.v.partier(0).place, g.v.party().winner], [1, 0]);
    const h = await room(2, { seed: 44 });
    assert.deepEqual([h.trappers.length, h.runners.length], [1, 1]);
    const [p] = h.runners;
    put(h, p, [h.c.traps[0].xc, PLAT_Y, h.c.zl - 1.3], { ground: false });
    while (h.v.party().state === L.H_PLAY) h.step();
    assert.ok(h.v.partier(p).out);
    assert.deepEqual([h.v.partier(h.trappers[0]).place, h.v.partier(p).place, h.v.party().winner], [1, 2, h.trappers[0]]);
  }
});

test('the prediction matches the confirmed ball bit for bit through every trap as it fires, is live and cools, through armings it never saw coming, along the rails and over the line; and a trapper\'s, on the belt and onto the pads', async () => {
  const g = await room(4, { seed: 1 });
  const c = g.c;
  assert.ok(!g.trappers.includes(0), 'slot 0 runs');
  const q = g.trappers[0];
  const [, b, d] = g.runners;
  // P(b) home first, so the clock's cut is behind us (and set back to PG_LEN, for the time this takes), and
  // P(d) on the pad, so the round goes on
  park(g, d);
  park(g, q);
  put(g, b, [c.fin - 1, PLAT_Y, c.cx + 2], { v: [8, 0, 0] });
  while (g.v.partier(b).score < MC.TR_WIN) g.step();
  g.dv.setUint32(L.HDR_UNTIL, g.v.party().start + MC.TR_LEN, true);
  let compared = 0;
  const hits = new Set(), seen = new Set(), had = new Set();
  let fell = 0;
  const count = (fx0) => { for (const f of fxs(g.v, MC.TR_FX_HIT, fx0)) if (f.owner === 0) hits.add(f.shot >> 8); };
  for (const T of c.traps.slice(0, 8)) {
    for (const [lane, phase0, inside] of [[-0.45, 0, false], [0.45, 0.7, true]]) {
      // armed so that it fires as the ball reaches it, rolled at it weaving, now and then backing off or hopping;
      // or as the ball dawdles in it near the wall
      const t0 = arm(g, T, q);
      until(g, t0 + MC.TR_DELAY - (inside ? 20 : 70));
      put(g, 0, [inside ? T.xc - 1 : T.x0 - 6, PLAT_Y, c.cx + lane * c.w], { v: [inside ? 0 : 6, 0, 0] });
      const fx0 = g.v.fxCount();
      // (until it's well on its way down: going out is the confirmed world's, a round trip on)
      for (let n = 0; n < 24 && g.v.partier(0).pos[1] > PLAT_Y - 6; n++) {
        const words = Array.from({ length: 10 }, (_, i) => {
          const k = n * 10 + i;
          return word((k % 41 < 7 ? Math.PI : 0) + 0.5 * Math.sin(k * 0.07 + phase0), { hop: k % 37 === 15 ? 1 : 0, move: k % 29 < 3 || (inside && k % 3) ? 0 : 1 });
        });
        compared += predicted(g, words);
        seen.add(T.kind);
      }
      count(fx0);
      if (((g.v.partier(0).m & 255) - 1) === T.k) had.add(T.kind);
      if (g.v.partier(0).out || g.v.partier(0).falling) fell++;
      until(g, t0 + MC.TR_DELAY + T.live + MC.TR_COOL + 1);
    }
  }
  // an arming it never saw coming, in the middle of its run through the trap: the trap only flashes
  {
    const T = ofKind(g, MC.TR_K_CRUSH);
    put(g, 0, [T.x0 - 3, PLAT_Y, c.cx], { v: [5, 0, 0] });
    for (let n = 0; n < 6; n++) {
      if (n === 2) { put(g, q, [T.pad, WALK, c.zpad]); }
      compared += predicted(g, Array.from({ length: 10 }, (_, i) => word(0.3 * Math.sin(n + i), { move: (n + i) % 5 ? 1 : 0 })));
      if (n === 2) park(g, q);
    }
    assert.ok(now(g, T).arm > 0, 'armed meanwhile');
  }
  // the rails and the wall along a stretch, and over the line
  put(g, 0, [c.fin - 14, PLAT_Y, c.cx + c.w - 2], { v: [6, 0, 8] });
  for (let n = 0; n < 12; n++) compared += predicted(g, Array.from({ length: 10 }, (_, i) => word(n % 4 < 2 ? 1.2 : -1.2)));
  put(g, 0, [c.fin - 3, PLAT_Y, c.cx], { v: [6, 0, 0] });
  for (let n = 0; n < 6; n++) compared += predicted(g, Array.from({ length: 10 }, () => word(0)));
  assert.ok(g.v.partier(0).score >= MC.TR_WIN, 'home');
  assert.equal(seen.size, MC.TR_NK, 'every kind');
  assert.ok(compared > 3500, `${compared} predictions compared`);
  assert.ok(had.size >= 4 && hits.size >= 2 && fell >= 4, `had by ${[...had]}, hit by ${[...hits]}, ${fell} runs ended falling`);
  // a trapper's: slot 0 on the walkway, the belt, its sides, over the pads (it arms them; that's the confirmed world's)
  const h = await room(4, { seed: 3 });
  assert.ok(h.trappers.includes(0), 'slot 0 traps');
  let hc = 0;
  put(h, 0, [h.c.traps[0].pad - 6, WALK, h.c.zpad]);
  const fx0 = h.v.fxCount();
  for (let n = 0; n < 40; n++) hc += predicted(h, Array.from({ length: 10 }, (_, i) => word(n % 8 < 5 ? 0.25 * Math.sin(n + i * 0.3) : n % 8 < 6 ? Math.PI / 2 : n % 8 < 7 ? -Math.PI / 2 : Math.PI, { move: n % 7 === 3 ? 0 : 1, hop: (n * 10 + i) % 53 === 9 ? 1 : 0 })));
  assert.ok(fxs(h.v, MC.TR_FX_TRAP, fx0).some((f) => f.owner === 0), 'it armed one on the way');
  assert.ok(hc > 400, `${hc} more compared`);
});

for (const [balls, ticks] of [[8, 9000], [64, 10000]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap; the trappers arm traps ahead of the runners and take some, the rest run the course and get home; the round over and placed; equal on 1 and 4 threads`, async () => {
    let start = -1, over = -1, places = null, pts = null, seen = 0;
    const n = { home: 0, armed: 0, fired: 0, hit: 0, taken: 0 };
    const { log, sim, view } = await playParty({ bytes: partyBytes(true), seed: balls + 5, mg: L.MG_TRAP, bots: balls, ticks, onTick: (t, s, v) => {
      if (s.error().code) throw new Error(`trap ${JSON.stringify(s.error())}`);
      const g = v.party();
      if (start < 0 && g.state === L.H_PLAY) start = t;
      for (; seen < v.fxCount(); seen++) {
        const f = v.fx(seen);
        if (over >= 0 || start < 0) continue;
        n.home += f.kind === MC.TR_FX_HOME;
        n.armed += f.kind === MC.TR_FX_TRAP && !(f.shot & 256);
        n.fired += f.kind === MC.TR_FX_TRAP && (f.shot & 256) !== 0;
        n.hit += f.kind === MC.TR_FX_HIT;
        n.taken += f.kind === MC.TR_FX_TAKEN;
      }
      if (over < 0 && start >= 0 && g.state === L.H_OVER) {
        over = t;
        places = [...Array(balls).keys()].map((p) => v.partier(p).place);
        pts = [...Array(balls).keys()].map((p) => v.partier(p).pts);
      }
    } });
    assert.equal(sim.error().code, 0);
    assert.ok(over > 0, 'the round ended');
    const secs = (over - start) * TICK;
    const runners = balls - Math.floor(balls / MC.TR_PER);
    assert.ok(secs > 20 && secs <= MC.TR_LEN * TICK, `${secs.toFixed(1)} s of play`);
    assert.ok(n.armed >= 4 && n.fired >= 3, `${n.armed} armed, ${n.fired} fired`);
    assert.ok(n.home >= runners * (balls > 8 ? 0.15 : 0.4), `${n.home} of ${runners} home`);
    if (balls > 8) assert.ok(n.taken >= 5 && n.hit >= 3, `${n.taken} taken, ${n.hit} hit`);
    assert.ok(places.every((x) => x >= 1 && x <= balls), `places ${places}`);
    assert.ok(pts.every((x) => x >= 1 && x <= 10), `points ${pts}`);
    assert.ok(places.includes(1) && pts.includes(10), 'somebody won');
    assert.equal(view.party().game, L.MG_TRAP);
    const parsed = parseLog(log);
    const nt = over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: nt, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: nt, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: nt, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
    assert.equal(partySeed(balls + 5, L.MG_TRAP) >>> 24, 0xa7);
  });
}

test('the client module: the course as the sim has it, drawn (each trap as its clock stands), framed, its HUD lines for a runner and a trapper; its brain: the danger a runner reads only what it has seen (which trapdoors drop only once the trap flashes), a runner\'s goal past the next trap, a trapper\'s at a pad; how slow a ball is to see a trap armed', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const g = await room(4, { seed: 1 });
  const c = g.c;
  const q = g.trappers[0];
  const [p] = g.runners;
  park(g, q);
  assert.equal(trapAt(c, c.traps[2].xc), c.traps[2]);
  assert.equal(trapAt(c, c.traps[2].x1 + 0.5), null);
  const draw = (t) => {
    const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null };
    trap.draw(g.v, { tick: g.v.tick, dt: 0, t: t * TICK, ptick: g.v.party().start + t, now: 1000, ms: 16, cam: [c.x0, 60, c.cx], slot: p }, out);
    for (let i = 0; i < out.scene.count * 16; i++) assert.ok(Number.isFinite(out.scene.data[i]), 'finite');
    return out;
  };
  const out = draw(tp(g));
  assert.ok(out.scene.count > 100 && out.scene.count < 8000, `${out.scene.count} solids`);
  // the crusher's block where its clock has it, hanging, then down
  const K = ofKind(g, MC.TR_K_CRUSH);
  const t0 = arm(g, K, q);
  const block = (t) => { const o = draw(t); for (let i = 0; i < o.scene.count; i++) { const d = o.scene.data.subarray(i * 16, i * 16 + 16); if (Math.abs(d[0] - K.xc) < 1e-3 && Math.abs(d[4] - MC.TR_CL / 2) < 1e-3 && Math.abs(d[5] - 1.6) < 1e-3) return d[1] - 1.6 - PLAT_Y; } return null; };
  assert.ok(Math.abs(block(t0 + 10) - MC.TR_CH) < 1e-3, 'hanging');
  assert.ok(Math.abs(block(t0 + MC.TR_DELAY + 40) - 0) < 1e-3, 'down');
  const fr = trap.frame(g.v);
  assert.equal(fr.shape, 'square');
  assert.ok(fr.radius >= (c.xb - c.xa) / 2 - 0.01);
  assert.equal(trap.facing(g.v, p), 0);
  // the HUD: a runner's place, how far to go, its next trap; a trapper's tally and its pad
  put(g, p, [K.x0 - 5, PLAT_Y, c.cx]);
  g.step();
  const hud = (slot) => {
    const lines = [];
    const ctx = { put: (x, y, s, col) => lines.push([y, s, col]), centre: (y, s, col) => lines.push([y, s, col]), right: (y, s, col) => lines.push([y, s, col]), rows: 44, C: {}, slot, me: g.v.partier(slot), now: 0 };
    trap.hud(g.v, ctx);
    for (const l of lines) assert.ok(l[1].length <= 40, l[1]);
    return lines.map((l) => l[1]).join(' | ');
  };
  const rt = hud(p);
  assert.ok(/2ND OF 4/.test(rt) && /M TO GO/.test(rt) && new RegExp(`TRAP ${K.k + 1} OF ${c.nt}  CRUSHER ARMED`).test(rt), rt);
  const tt = hud(q);
  assert.ok(/TRAPPER  0 TAKEN/.test(tt) && /PAD \d+ OF/.test(tt) && /RUNNERS ON THE COURSE/.test(tt), tt);
  assert.ok(trap.hint.length <= 70 && trap.rules.length <= 70);
  // danger for a runner: the crusher on the tick it's down, seen or not yet seen; the open edge along a trap
  const me = g.v.partier(p);
  const start = g.v.party().start;
  me._trAt = g.v.tick;
  me._trReact = c.traps.map(() => 0);
  assert.equal(trap.brain.danger(g.v, K.xc, c.cx, start + t0 + MC.TR_DELAY + 20, me), 1);
  assert.equal(trap.brain.danger(g.v, K.xc + MC.TR_CL / 2 + 2.5, c.cx, start + t0 + MC.TR_DELAY + 20, me), 0);
  assert.equal(trap.brain.danger(g.v, K.xc, c.zl + 0.1, start + tp(g), me), 1);
  me._trReact = c.traps.map(() => 999);
  assert.equal(trap.brain.danger(g.v, K.xc, c.cx, start + t0 + MC.TR_DELAY + 20, me), 0, 'not seen yet');
  // trapdoors: before the flash every panel might go; in it, the drawn ones
  const D = ofKind(g, MC.TR_K_DROP);
  until(g, t0 + MC.TR_DELAY + K.live + MC.TR_COOL + 1);
  const t1 = arm(g, D, q);
  const Dn = now(g, D);
  me._trReact = c.traps.map(() => 0);
  const cells = [...Array(MC.TR_DROWS * c.nc).keys()];
  const at = (i) => [D.x0 + (Math.floor(i / c.nc) + 0.5) * MC.TR_CELL, c.zl + ((i % c.nc) + 0.5) * c.cw];
  me._trAt = start + t1 + 5;
  const early = cells.map((i) => trap.brain.danger(g.v, ...at(i), start + fireAt(Dn) + 5, me));
  assert.ok(early.every((x) => x === 0.6), 'unknown before the flash');
  me._trAt = start + fireAt(Dn) - 50;
  const late = cells.map((i) => trap.brain.danger(g.v, ...at(i), start + fireAt(Dn) + 5, me));
  assert.deepEqual(late, cells.map((i) => (drops(Dn, i) ? 1 : at(i)[1] < c.zl + 1.6 ? 0.4 : 0)), 'known in it (and the open edge near)');
  // a runner's goal: short of an armed trap it can't clear, past an idle one; a trapper's: at a pad's stage, or on it
  const bot = { mem: {}, skill: 1, slot: p, at: start + fireAt(Dn) - 60, pos: [D.x0 - 3, c.cx], vel: [0, 0] };
  put(g, p, [D.x0 - 3, PLAT_Y, c.cx]);
  const goal = trap.brain.goal(g.v, g.v.partier(p), bot);
  assert.ok(goal[0] < D.x0 && bot.mem.plan.mode === 'hold', `holds short of it: ${goal} ${bot.mem.plan.mode}`);
  const idle = { mem: {}, skill: 1, slot: p, at: start + fireAt(Dn) + D.live + MC.TR_COOL + 10, pos: [D.x0 - 3, c.cx], vel: [0, 0] };
  const on = trap.brain.goal(g.v, g.v.partier(p), idle);
  assert.ok(on[0] > D.x1 && idle.mem.plan.mode === 'go', 'goes once it\'s done');
  const tb = { mem: {}, skill: 1, slot: q, at: g.v.tick, pos: [c.xa + 2, c.zw + 2], vel: [0, 0] };
  const tg = trap.brain.goal(g.v, g.v.partier(q), tb);
  assert.ok(tb.mem.plan.mode !== undefined && c.traps.some((T) => Math.abs(tg[0] - T.pad) < MC.TR_PADR + 3) && Math.abs(tg[1] - c.zpad) < 1e-6, `at a pad: ${tg} ${tb.mem.plan.mode}`);
  // how slow to take in an armed trap: a skilled ball mostly watches the pads, a poor one waits for the flash
  const lags = (skill) => { const out = []; for (let s = 0; s < 40; s++) for (let k = 0; k < 12; k++) out.push(react(s, skill, k, 3)); return out; };
  const good = lags(0.95), poor = lags(0.1);
  // (at most 0.7 s, more to a poor ball)
  for (const l of [...good, ...poor]) assert.ok(l <= 123 || (l >= MC.TR_DELAY - MC.TR_FLASH && l <= MC.TR_DELAY - MC.TR_FLASH + 123), `${l}`);
  assert.ok(Math.max(...good.filter((l) => l <= 123)) < 50, 'a skilled ball is quick');
  const watch = (a) => a.filter((l) => l <= 123).length / a.length;
  assert.ok(watch(good) > 0.7 && watch(poor) < 0.45, `${watch(good)} ${watch(poor)}`);
});
