// HONEYCOMB (src/mg/honey.wat): a cookie for every ball laid out for the
// crowd, the shape and its outline from the seed, candy that holds on the
// line and cracks off it (and on it too, rolling fast), holds and drops for
// good, the stroke widening with speed, the line thinning and the candy
// growing brittle, tracing in order and home, the places and the clock, the
// prediction bit for bit through all of it, and rounds of AI balls that trace
// carefully and still stray.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/honey.mjs'; // HC_*: the minigame's own constants
import honey, { stage, point, distOf, cellOf, cookieOfPos, centreOf, standings, lineW, holdOf } from '../client/mg/honey.mjs';

const TICK = 0.008;
const CS = MC.HC_CS;

// A room of n balls on the candy, on the debug build (a NaN traps), stepped
// into play unless asked not to; with shape, the first seed from seed on that
// draws it.
async function room(n = 2, { play = true, seed = 7, shape = -1, debug = true } = {}) {
  for (let s = seed; ; s++) {
    const sim = await newParty(debug);
    sim.init(s);
    const v = new View(sim.memory.buffer);
    const dv = v.dv;
    dv.setUint32(L.PG_FORCE, L.MG_HONEY + 1, true);
    const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
    step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
    if (shape >= 0 && stage(v).shape !== shape) continue;
    while (play && v.hole().state !== L.H_PLAY) step();
    return { sim, v, dv, step, S: stage(v), seed: s };
  }
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// Ball p at (x, z) on the candy's top, rolling at (vx, vz).
function put(g, p, x, z, { vx = 0, vz = 0 } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, PLAT_Y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, 0, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, L.PF_LIVE | L.PF_GROUND);
}
// Checkpoint k round cookie c, in the world.
const at = (g, c, k) => { const [cx, cz] = centreOf(g.S, c), [x, z] = point(g.v, k % g.S.K); return [cx + x, cz + z]; };
// The cells of cookie c that have cracked (anything but 0 and 1).
const cracked = (g, c) => { const out = []; for (let k = 0; k < MC.HC_GG; k++) { const v = cellOf(g.v, c, k); if (v > 1) out.push([k, v]); } return out; };
// A point of cookie c's candy at least far m off the line, nearest its centre.
function offLine(g, c, far = 1.5) {
  let best = null;
  for (let k = 0; k < MC.HC_GG; k++) {
    if (cellOf(g.v, c, k) !== 1 || distOf(g.v, k) < far) continue;
    const i = k % MC.HC_G, j = Math.floor(k / MC.HC_G), d = Math.hypot(i - MC.HC_GH, j - MC.HC_GH);
    if (!best || d < best.d) best = { k, d };
  }
  const [cx, cz] = centreOf(g.S, c);
  return [cx + ((best.k % MC.HC_G) - MC.HC_GH) * CS, cz + (Math.floor(best.k / MC.HC_G) - MC.HC_GH) * CS, best.k];
}
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const f = v.fx(k); if (f.kind === kind) out.push(f); } return out; };
const still = partyWord({ yaw: 0 });
// The word that rolls a ball at (x, z) toward (tx, tz).
const toward = (x, z, tx, tz, move = 1) => partyWord({ yaw: Math.round(Math.atan2(tz - z, tx - x) / (2 * Math.PI) * 16384) & 16383, move });

test('the stage for 1, 8, 64 and 256: a cookie for every ball in a grid with gaps, every ball on its own cookie\'s start mark, the candy inside PG_BIG', async () => {
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party(), S = g.S;
    const cols = Math.ceil(Math.sqrt(n));
    assert.deepEqual([S.nc, S.cols, S.rows], [n, cols, Math.ceil(n / cols)], `${n}: the grid`);
    assert.deepEqual([r.game, r.kind, r.len, r.hop, r.flags], [L.MG_HONEY, L.PK_SCORE, MC.HC_LEN, 0, 0], `${n}: the knobs`);
    assert.ok(Math.abs(r.acc - MC.HC_ACC) < 1e-6 && Math.abs(r.idle - MC.HC_IDLE) < 1e-6);
    assert.ok(n * MC.HC_GG * 2 <= L.PG_BIG_SIZE && MC.HC_VERT + 8 * MC.HC_VMAX <= L.PG_S_SIZE, 'the state fits');
    // the cookies 2 R across, HC_GP cells (3 m of void more) apart, the grid centred on the stage
    const [x0] = centreOf(S, 0);
    if (n > 1) assert.ok(Math.abs(centreOf(S, 1)[0] - x0 - MC.HC_GP * CS) < 1e-3 && MC.HC_GP * CS - 2 * MC.HC_R > 3, 'the gap');
    const fr = honey.frame(g.v);
    assert.ok(Math.abs(fr.centre[0] - r.cx) < 1e-3 && Math.abs(fr.centre[2] - r.cx) < CS * MC.HC_GP / 2 + 1e-3, `${n}: centred`);
    assert.ok(Math.abs(r.size - Math.max(S.cols, S.rows) * MC.HC_GP * CS / 2 + (MC.HC_GP - MC.HC_G) * CS / 2) < 1e-3, `${n}: ${r.size} m`);
    let candy = -1;
    const seen = new Set();
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p), [sx, sz] = at(g, p, 0);
      assert.deepEqual([b.pos[1], b.ground], [PLAT_Y, true], `${n}: P${p + 1} on the candy`);
      assert.ok(Math.abs(b.pos[0] - sx) < 1e-3 && Math.abs(b.pos[2] - sz) < 1e-3, `${n}: P${p + 1} on cookie ${p}'s start mark`);
      const c = cookieOfPos(S, b.pos[0], b.pos[2])[0];
      assert.ok(!seen.has(c), 'a cookie each');
      seen.add(c);
      let k = 0;
      for (let i = 0; i < MC.HC_GG; i++) k += cellOf(g.v, p, i) === 1;
      if (candy < 0) candy = k;
      assert.equal(k, candy, `${n}: cookie ${p} all whole, as every other`);
    }
    assert.ok(candy > 0.7 * MC.HC_GG && candy < 0.85 * MC.HC_GG, `${candy} cells of candy`);
    // nothing past the last cookie
    assert.equal(cookieAtEnd(g), null);
  }
});
const cookieAtEnd = (g) => { const [x, z] = centreOf(g.S, g.S.nc - 1); return g.S.nc % g.S.cols ? cookieOfPos(g.S, x + MC.HC_GP * CS, z) : null; };

test('the shape is the seed\'s, turned its way: all four come up, the outline closed in pieces at most HC_STEP, inside the candy with the line\'s width to spare, and every cell\'s distance from it', async () => {
  const shapes = new Map();
  for (let s = 1; shapes.size < 4 && s < 60; s++) {
    const g = await room(1, { play: false, seed: s });
    const S = g.S;
    if (shapes.has(S.shape)) continue;
    shapes.set(S.shape, S.K);
    let len = 0, max = 0;
    for (let k = 0; k < S.K; k++) {
      const [ax, az] = point(g.v, k), [bx, bz] = point(g.v, (k + 1) % S.K);
      const d = Math.hypot(bx - ax, bz - az);
      assert.ok(d > 0.05 && d <= MC.HC_STEP + 1e-4, `piece ${k}: ${d}`);
      len += d;
      max = Math.max(max, Math.hypot(ax, az));
    }
    assert.ok(max + MC.HC_W0 < MC.HC_R - 0.3, `shape ${S.shape} reaches ${max}`);
    assert.ok(len > 25 && len < 46, `shape ${S.shape}: ${len.toFixed(1)} m round`);
    // the first vertex turned is the start mark
    const turn = g.dv.getUint32(L.PG_H + MC.HC_ROT, true) / 16384 * 2 * Math.PI;
    const v0 = S.shape === MC.HC_UMBRELLA ? [MC.HC_UMB[0] / 100, MC.HC_UMB[1] / 100] : [[MC.HC_CIRC_R, MC.HC_TRI_R, MC.HC_STAR_RO][S.shape], 0];
    const [px, pz] = point(g.v, 0);
    assert.ok(Math.hypot(px - (v0[0] * Math.cos(turn) - v0[1] * Math.sin(turn)), pz - (v0[0] * Math.sin(turn) + v0[1] * Math.cos(turn))) < 2e-3, 'the start mark');
    // a cell's distance: to the nearest piece of the outline
    for (const k of [0, 100, 420, 600, 777]) {
      const x = ((k % MC.HC_G) - MC.HC_GH) * CS, z = (Math.floor(k / MC.HC_G) - MC.HC_GH) * CS;
      let best = Infinity;
      for (let i = 0; i < S.K; i++) {
        const [ax, az] = point(g.v, i), [bx, bz] = point(g.v, (i + 1) % S.K);
        const ex = bx - ax, ez = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
        best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t));
      }
      assert.ok(Math.abs(distOf(g.v, k) - best) < 1e-4, `cell ${k}`);
    }
  }
  assert.deepEqual([...shapes.keys()].sort(), [0, 1, 2, 3], 'circle, triangle, star, umbrella');
  assert.equal(shapes.get(MC.HC_CIRCLE), 64);
});

test('on the line, slowly, nothing cracks; off it, the candy cracks under a ball, holds HC_HOLD0 more, and drops for good: a ball still on it falls through and is out, scored by what it traced', async () => {
  const g = await room(2);
  const S = g.S;
  // round the outline from the start at 1.2 m/s, put on it tick by tick
  for (let k = 0; k < S.K - 4; k++) {
    const [ax, az] = at(g, 0, k), [bx, bz] = at(g, 0, k + 1);
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / (1.2 * TICK)));
    for (let i = 0; i < n; i++) {
      const f = i / n;
      put(g, 0, ax + (bx - ax) * f, az + (bz - az) * f, { vx: (bx - ax) / (n * TICK), vz: (bz - az) / (n * TICK) });
      g.step();
    }
  }
  assert.deepEqual(cracked(g, 0), [], 'the line holds');
  assert.ok((g.v.partier(0).m & 255) >= S.K - 4, `traced ${g.v.partier(0).m & 255} of ${S.K}`);
  // off the line, stopped
  const [x, z, k] = offLine(g, 1);
  put(g, 1, x, z);
  const t0 = g.v.party().t;
  g.step();
  const c = cracked(g, 1);
  assert.ok(c.some(([i]) => i === k), 'the cell under it cracks');
  assert.ok(c.every(([, v]) => v === t0 + 1 + holdOf(t0 + 1) || v === t0 + holdOf(t0)), `dropping a hold on: ${c.map(([, v]) => v)}`);
  const drop = c.find(([i]) => i === k)[1];
  while (g.v.party().t < drop) { assert.equal(g.v.partier(1).pos[1], PLAT_Y, 'held'); g.step(); }
  g.step();
  g.step();
  assert.ok(g.v.partier(1).pos[1] < PLAT_Y, 'through');
  for (let n = 0; n < 400 && !g.v.partier(1).out; n++) g.step();
  const b = g.v.partier(1);
  assert.ok(b.out && b.score === 2 * (b.m & 255), `out, scored ${b.score}`);
  assert.equal(cellOf(g.v, 1, k), drop, 'gone for good');
});

test('rolling fast cracks more: the stroke widens with speed, and over HC_VLINE the line goes too', async () => {
  const g = await room(4, { seed: 11 });
  // a straight run off the line through the same spot of two cookies, at 1 m/s and at 3.2 m/s
  const run = (p, v) => {
    const [x, z] = offLine(g, p, 1.2);
    for (let i = 0; i * v * TICK < 1.2; i++) { put(g, p, x - 0.6 + v * TICK * i, z, { vx: v }); g.step(); }
    return cracked(g, p).length;
  };
  const slow = run(0, 1), fast = run(1, 3.2);
  assert.ok(fast > slow * 1.4, `${slow} cells at 1 m/s, ${fast} at 3.2`);
  // along a piece of the outline, at 1.5 m/s and at 2.6
  const along = (p, v) => {
    const [ax, az] = at(g, p, 3), [bx, bz] = at(g, p, 4);
    const d = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / d, uz = (bz - az) / d;
    for (let i = 0; i * v * TICK < d; i++) { put(g, p, ax + ux * v * TICK * i, az + uz * v * TICK * i, { vx: ux * v, vz: uz * v }); g.step(); }
    return cracked(g, p).filter(([k]) => distOf(g.v, k) <= lineW(g.v.party().t)).length;
  };
  assert.equal(along(2, 1.5), 0, 'under the limit the line holds');
  assert.ok(along(3, 2.6) >= 2, 'over it the line cracks');
});

test('as the round goes the line thins and the candy grows brittle: HC_W0 to HC_W1 by HC_THIN, a hold HC_HOLD0 to HC_HOLD1 by HC_BRITTLE', async () => {
  assert.equal(holdOf(0), MC.HC_HOLD0);
  assert.equal(holdOf(MC.HC_BRITTLE), MC.HC_HOLD1);
  assert.ok(Math.abs(lineW(MC.HC_THIN) - MC.HC_W1) < 1e-9 && Math.abs(lineW(0) - MC.HC_W0) < 1e-9);
  const g = await room(2, { seed: 3 });
  // a cell 0.6 m off the outline: line at the start, candy that cracks once the line is thinner than that
  let k = -1;
  for (let i = 0; i < MC.HC_GG && k < 0; i++) if (cellOf(g.v, 0, i) === 1 && Math.abs(distOf(g.v, i) - 0.6) < 0.05) k = i;
  assert.ok(k >= 0);
  const [cx, cz] = centreOf(g.S, 0);
  const x = cx + ((k % MC.HC_G) - MC.HC_GH) * CS, z = cz + (Math.floor(k / MC.HC_G) - MC.HC_GH) * CS;
  put(g, 0, x, z);
  for (let i = 0; i < 20; i++) { put(g, 0, x, z); g.step(); }
  assert.equal(cellOf(g.v, 0, k), 1, 'still line');
  // on to late in the round (P2 kept on its own line, still)
  g.dv.setUint32(L.HDR_START, g.v.tick - MC.HC_BRITTLE - 10, true);
  g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 2000, true);
  const t0 = g.v.party().t;
  put(g, 0, x, z);
  g.step();
  assert.equal(cellOf(g.v, 0, k), t0 + MC.HC_HOLD1, 'now off the line, a short hold');
});

test('tracing goes in order: a checkpoint skipped to doesn\'t count; all the way round and back to the start mark is home, out of play there, in order, scored; the round goes on', async () => {
  const g = await room(3, { seed: 5 });
  const S = g.S;
  const [jx, jz] = at(g, 0, 12);
  put(g, 0, jx, jz);
  g.step();
  assert.equal(g.v.partier(0).m, 0, 'a jump ahead counts nothing');
  // P1 and P2 round it (put at each checkpoint in turn), P1 a tick ahead
  const seen = g.v.fxCount();
  // (a checkpoint's next is always in reach of it, so a ball put on k has passed k + 1)
  const home = (p) => g.v.partier(p).m & MC.HC_M_HOME;
  for (let k = 1; k <= S.K + 1; k++) {
    if (!home(0)) put(g, 0, ...at(g, 0, k));
    if (k > 1 && !home(1)) put(g, 1, ...at(g, 1, k - 1));
    g.step();
    const m = g.v.partier(0).m & 255;
    if (!home(0)) assert.ok(m >= k && m <= k + MC.HC_AHEAD, `P1 put on ${k} at ${m}`);
  }
  const homes = fxs(g.v, MC.HC_FX_HOME, seen);
  assert.deepEqual(homes.map((f) => [f.owner, f.shot]), [[0, 1], [1, 2]], 'P1 then P2');
  const a = g.v.partier(0), b = g.v.partier(1);
  assert.deepEqual([a.m, b.m], [MC.HC_M_HOME | 1, MC.HC_M_HOME | 2]);
  assert.deepEqual([a.score, b.score], [MC.HC_SFIN, MC.HC_SFIN - 1]);
  assert.ok(a.out && !a.falling && a.pos[1] === PLAT_Y, 'out of play, on the candy');
  const [sx, sz] = at(g, 0, 0);
  assert.ok(Math.abs(a.pos[0] - sx) < 1e-4 && Math.abs(a.pos[2] - sz) < 1e-4, 'on the start mark');
  for (let i = 0; i < 200; i++) g.step();
  assert.equal(g.v.hole().state, L.H_PLAY, 'P3 plays on');
  assert.ok(Math.abs(g.v.partier(0).pos[0] - sx) < 1e-4, 'and P1 stays put');
});

test('off the rim into the void a ball falls and is out', async () => {
  const g = await room(2);
  const [cx, cz] = centreOf(g.S, 0);
  put(g, 0, cx - MC.HC_R + 0.3, cz, { vx: -3 });
  for (let i = 0; i < 300 && !g.v.partier(0).out; i++) g.step([[L.EV_INPUT, 0, partyWord({ yaw: 8192, move: 1 })]]);
  assert.ok(g.v.partier(0).out, 'out');
  assert.equal(cookieOfPos(g.S, g.v.partier(0).pos[0], g.v.partier(0).pos[2]), null, 'over the void');
});

test('the places at the clock: home by order, then what they traced, one still on its candy ahead of one fallen there; points 10 down to 1; over early once nobody is left on the candy', async () => {
  const g = await room(5, { seed: 9 });
  const S = g.S;
  // P1 home; P2 and P3 to checkpoint 10, P3 off its candy into the void; P4 to 4, P5 stays
  for (let k = 1; k <= S.K; k++) { if (!(g.v.partier(0).m & MC.HC_M_HOME)) put(g, 0, ...at(g, 0, k)); if (k <= 10) { put(g, 1, ...at(g, 1, k)); put(g, 2, ...at(g, 2, k)); } if (k <= 4) put(g, 3, ...at(g, 3, k)); g.step(); }
  const [cx, cz] = centreOf(g.S, 2);
  put(g, 2, cx + MC.HC_R + 1, cz);
  for (let i = 0; i < 300 && !g.v.partier(2).out; i++) g.step();
  assert.ok(g.v.partier(2).out);
  // the clock runs out, everyone else still (P2, P4, P5 on the line at their checkpoints)
  g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 3, true);
  for (let i = 0; i < 6; i++) g.step();
  assert.equal(g.v.hole().state, L.H_OVER);
  const pl = [0, 1, 2, 3, 4].map((p) => g.v.partier(p).place);
  assert.deepEqual(pl, [1, 2, 3, 4, 5], `places ${pl}`);
  assert.deepEqual([0, 1, 2, 3, 4].map((p) => g.v.partier(p).pts), [10, 7, 5, 3, 1]);
  assert.deepEqual(standings(g.v, S).map((e) => e.slot), [0, 1, 2, 3, 4], 'the client ranks them so');
  // everyone off: over at once
  const h = await room(2, { seed: 9 });
  for (const p of [0, 1]) { const [x, z] = centreOf(h.S, p); put(h, p, x + MC.HC_R + 1, z); }
  for (let i = 0; i < 400 && h.v.hole().state === L.H_PLAY; i++) h.step();
  assert.equal(h.v.hole().state, L.H_OVER, 'over');
  assert.ok(h.v.hole().tick < h.v.hole().start + 400);
});

// Slot 0 predicted through words in one run, then the confirmed world stepped
// through them: the same position on every tick, the same record at the end,
// and its strokes in the ring a tick each at most.
function aheadRun(g, words) {
  const n = words.length;
  for (let i = 0; i < n; i++) g.dv.setUint32(L.PWORDS + 4 * i, words[i], true);
  g.sim.x.predict(0, n);
  const track = Array.from({ length: n }, (_, k) => [0, 4, 8].map((o) => g.dv.getFloat32(L.PTRACK + 16 * k + o, true)));
  const player = g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE);
  const strokes = fxs(new View(g.sim.memory.buffer, L.PRED_D), MC.HC_FX_STROKE);
  for (let k = 0; k < n; k++) {
    g.step([[L.EV_INPUT, 0, words[k]]]);
    assert.deepEqual(g.v.partier(0).pos, track[k], `predicted ${k + 1} of ${n}`);
  }
  assert.deepEqual(player, g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE), `the record, ${n} ahead`);
  assert.ok(strokes.length <= n && new Set(strokes.map((f) => f.tick)).size === strokes.length, 'a stroke a tick at most');
  return { strokes, track };
}

// A spot on cookie c's line by its edge, and a way off it over a long run of
// whole candy: [x, z] and the point 2.4 m on.
function edge(g, c) {
  const [cx, cz] = centreOf(g.S, c);
  const offAt = (x, z, min) => { const q = cookieOfPos(g.S, x, z); return q && q[0] === c && cellOf(g.v, c, q[1]) === 1 && distOf(g.v, q[1]) >= min; };
  for (let k = 0; k < MC.HC_GG; k++) {
    if (cellOf(g.v, c, k) !== 1 || distOf(g.v, k) < 0.55 || distOf(g.v, k) > 0.72) continue;
    const x = cx + ((k % MC.HC_G) - MC.HC_GH) * CS, z = cz + (Math.floor(k / MC.HC_G) - MC.HC_GH) * CS;
    for (let i = 0; i < 16; i++) {
      const ux = Math.cos(i * Math.PI / 8), uz = Math.sin(i * Math.PI / 8);
      if ([0.6, 1.2, 1.8, 2.4, 3].every((d) => offAt(x + ux * d, z + uz * d, 0.9))) return [x, z, x + ux * 2.4, z + uz * 2.4];
    }
  }
  throw new Error('no edge');
}

test('the prediction is exact however far ahead it runs: it cracks its own ball\'s candy as it strays, holds it there, and drops it through', async () => {
  for (const n of [200, 230, L.PRED_MAX]) {
    const g = await room(2, { seed: 4 });
    // still on the line's edge, then off it a little way, then hands off
    const [x, z, tx, tz] = edge(g, 0);
    put(g, 0, x, z);
    const go = toward(x, z, tx, tz), brake = toward(x, z, tx, tz, 0), s0 = n - 200;
    const { strokes, track } = aheadRun(g, Array.from({ length: n }, (_, k) => (k < s0 ? still : k < s0 + 30 ? go : brake)));
    assert.ok(strokes.length >= 3, `${strokes.length} strokes`);
    assert.ok(strokes[0].tick > g.v.hole().start + s0 - 1, 'none while it stood on the line');
    assert.ok(track[n - 1][1] < PLAT_Y - 0.3 && !g.v.partier(0).out, `through, at ${track[n - 1][1]}`);
  }
});

// The words a driver plays for slot 0 (setup run on the room first, script
// before every step): round the outline at speed v (m/s) a little to one
// side, now and then off to the middle, a stop to finish.
async function driven(n, setup, ticks, { seed = 7, v = 1.4 } = {}) {
  const g = await room(n, { seed });
  const script = setup?.(g);
  const words = [];
  for (let k = 0; k < ticks; k++) {
    script?.(g, k);
    const b = g.v.partier(0), m = b.m & 255;
    const [tx, tz] = k % 300 < 230 ? at(g, 0, m + 2) : centreOf(g.S, 0);
    const sp = Math.hypot(b.vel[0], b.vel[2]);
    words.push(k > ticks - 120 ? still : toward(b.pos[0], b.pos[2], tx, tz, sp < v ? 1 : 0));
    g.step([[L.EV_INPUT, 0, words.at(-1)]]);
    if (g.v.partier(0).out) return words.slice(0, k);
  }
  return words;
}

test('the prediction matches the confirmed ball bit for bit, tick by tick, round the outline, off it over cracking candy and back, and down through it', async () => {
  const words = await driven(4, null, 1400);
  const g = await room(4);
  const seen = g.v.fxCount();
  assert.ok(predicted(g, words) >= words.length);
  const b = g.v.partier(0);
  assert.ok((b.m & 255) > 10, `traced ${b.m & 255}`);
  assert.ok(cracked(g, 0).length > 5 && fxs(g.v, MC.HC_FX_CRACK, seen).some((f) => f.owner === 0), `it cracked ${cracked(g, 0).length} cells`);
  assert.ok(b.falling || cracked(g, 0).length > 10, 'and paid for it');
});

test('the prediction is exact over candy the confirmed world cracked before it: back over its own old cracks it falls with them', async () => {
  // off the line and back the same way, the cracks of the way out confirmed by the time it comes back
  const setup = async () => { const g = await room(2, { seed: 4 }); const e = edge(g, 0); put(g, 0, e[0], e[1]); return [g, e]; };
  const [h, [x, z, tx, tz]] = await setup();
  let words = [];
  for (let k = 0; k < 110; k++) words.push(toward(x, z, tx, tz));
  for (let k = 0; k < 250; k++) words.push(toward(tx, tz, x, z));
  // (up to the confirmed world's out, 14 m down, which is its alone)
  const out = words.findIndex((w) => { h.step([[L.EV_INPUT, 0, w]]); return h.v.partier(0).out; });
  if (out >= 0) words = words.slice(0, out);
  const [g] = await setup();
  assert.ok(predicted(g, words) >= words.length);
  assert.ok(cracked(g, 0).length > 4, 'it cracked its way out');
  const b = g.v.partier(0);
  assert.ok(b.falling || b.out, 'down through the way it came');
});

// A round of Partier balls (client/party-bot.mjs, steered by this minigame's
// brain) on the debug build, as tools/genparty.mjs plays one.
async function aiRound(balls, seed) {
  const stats = { start: -1, over: -1, homes: [], cracks: 0, falls: 0, places: null, pts: null, winner: -1 };
  let seen = 0;
  const { log } = await playParty({ bytes: partyBytes(true), seed, mg: L.MG_HONEY, bots: balls, ticks: 14000, delay: 6, onTick: (t, s, v) => {
    assert.equal(s.error().code, 0, 'no trap');
    const g = v.party();
    if (stats.start < 0 && g.state === L.H_PLAY) { stats.start = t; seen = v.fxCount(); }
    if (stats.start >= 0 && stats.over < 0) {
      for (; seen < v.fxCount(); seen++) {
        const x = v.fx(seen);
        if (x.kind === MC.HC_FX_HOME) stats.homes.push((t - stats.start) * TICK);
        if (x.kind === MC.HC_FX_CRACK) stats.cracks++;
        if (x.kind === L.FX_SINK) stats.falls++;
      }
    }
    if (stats.over < 0 && stats.start >= 0 && g.state === L.H_OVER) {
      stats.over = t;
      stats.winner = g.winner;
      stats.places = [...Array(balls).keys()].map((p) => v.partier(p).place);
      stats.pts = [...Array(balls).keys()].map((p) => v.partier(p).pts);
    }
  } });
  return { log, stats };
}

for (const [balls, seed] of [[8, 6], [64, 7]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, they trace with care and stray, most get home, some fall through; places and points for all; equal on 1 and 4 threads`, async () => {
    const { log, stats } = await aiRound(balls, seed);
    assert.ok(stats.over > 0, 'the round ended');
    const secs = (stats.over - stats.start) * TICK;
    assert.ok(stats.homes.length >= balls / 2, `${stats.homes.length} of ${balls} home in ${secs.toFixed(1)} s`);
    assert.ok(stats.homes[0] > 12, `the first home at ${stats.homes[0].toFixed(1)} s`);
    assert.ok(stats.cracks >= balls / 4, `${stats.cracks} cracks heard`);
    if (balls >= 64) assert.ok(stats.falls >= 2, `${stats.falls} falls`);
    assert.ok(stats.places.every((x) => x >= 1 && x <= balls), `places ${stats.places}`);
    assert.ok(stats.pts.every((x) => x >= 1 && x <= 10), `points ${stats.pts}`);
    assert.ok(stats.winner >= 0 && stats.places[stats.winner] === 1, 'somebody won');
    const parsed = parseLog(log);
    const n = stats.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('an AI ball alone traces every shape home, slowing for the corners, and sometimes strays', async () => {
  for (const shape of [0, 1, 2, 3]) {
    const g = await room(2, { shape, seed: 20 });
    const bot = new Partier(0, 3, 0.9);
    put(g, 1, ...centreOf(g.S, 1));
    const q = [];
    let t = 0, fast = 0, slow = 0;
    for (; t < 9000 && !(g.v.partier(0).m & MC.HC_M_HOME) && !g.v.partier(0).out; t++) {
      q.push(bot.think(g.v, g.v.tick + 6, 12));
      put(g, 1, ...at(g, 1, 0));
      g.step([[L.EV_INPUT, 0, q.length > 6 ? q.shift() : still]]);
      const sp = Math.hypot(...g.v.partier(0).vel);
      if (sp > MC.HC_VLINE) fast++;
      if (sp < 0.6) slow++;
    }
    const b = g.v.partier(0);
    assert.ok(b.m & MC.HC_M_HOME, `shape ${shape}: home in ${(t * TICK).toFixed(1)} s (traced ${b.m & 255} of ${g.S.K}${b.out ? ', fell' : ''})`);
    assert.ok(t * TICK > 15 && t * TICK < 60, `shape ${shape}: ${(t * TICK).toFixed(1)} s`);
    assert.ok(fast < t / 10, `shape ${shape}: over the limit ${fast} of ${t} ticks`);
    if (shape >= 1) assert.ok(slow > 0, `shape ${shape}: it slowed for a corner`);
  }
  // a less careful one strays off the line
  const g = await room(1, { seed: 21 });
  const bot = new Partier(0, 8, 0.2);
  const q = [];
  for (let t = 0; t < 4000 && !(g.v.partier(0).m & MC.HC_M_HOME) && !g.v.partier(0).out; t++) {
    q.push(bot.think(g.v, g.v.tick + 6, 12));
    g.step([[L.EV_INPUT, 0, q.length > 6 ? q.shift() : still]]);
  }
  assert.ok(cracked(g, 0).length > 5, `it cracked ${cracked(g, 0).length} cells`);
});

test('the client module: draws every cookie and the paint layer (line, groove, traced, start, cracks, holes), frames the grid, faces you along the outline, writes its HUD lines, its FX and the feed\'s fall line', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const g = await room(4, { seed: 5 });
  const S = g.S;
  const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null };
  const lines = [];
  const hctx = { put: (x, y, s, c) => lines.push([y, s, c]), centre: (y, s, c) => lines.push([y, s, c]), right: (y, s, c) => lines.push([y, s, c]), rows: 44, C: {}, slot: 0, now: 0 };
  const draw = () => {
    out.scene.clear(); out.glow.length = out.solid.length = out.decals.length = out.beams.length = 0; lines.length = 0;
    honey.draw(g.v, { tick: g.v.tick, dt: 0, now: 0, slot: 0, me: g.v.partier(0), cam: [g.v.party().cx, 60, g.v.party().cx] }, out);
    honey.hud(g.v, { ...hctx, me: g.v.partier(0) });
  };
  draw();
  assert.equal(out.scene.count, S.nc, 'a disc each');
  assert.equal(out.decals.length, S.nc, 'a start mark each');
  const P = out.paint;
  assert.ok(P && P.n === Math.max(S.cols, S.rows) * MC.HC_GP, 'the paint layer over the grid');
  const ids = new Set(P.cells);
  for (const id of [1, 3, 4]) assert.ok(ids.has(id), `paint ${id}`);
  assert.ok(lines.some(([y, s]) => y === 0 && s === 'TRACED 0%') && lines.some(([, s]) => /^THE (CIRCLE|TRIANGLE|STAR|UMBRELLA)$/.test(s)), lines.map((l) => l[1]).join('|'));
  // P1 a little way round, P2 cracking off the line: traced line, cracks, then a hole and crumbs
  for (let k = 1; k <= 6; k++) { put(g, 0, ...at(g, 0, k)); g.step(); }
  const [x, z] = offLine(g, 1);
  put(g, 1, x, z);
  g.step();
  const v0 = P.version;
  draw();
  assert.ok(P.version > v0 && new Set(P.cells).has(2) && [...P.cells].some((c) => c >= 5 && c < 12), 'traced and cracked');
  for (let i = 0; i < MC.HC_HOLD0 + 5; i++) g.step();
  draw();
  assert.ok(new Set(P.cells).has(12) && out.solid.length > 0, 'a hole, crumbs falling');
  const f = honey.frame(g.v);
  assert.equal(f.shape, 'square');
  const [ax, az] = point(g.v, 0), [bx, bz] = point(g.v, 1);
  assert.ok(Math.abs(honey.facing(g.v) - Math.atan2(bz - az, bx - ax)) < 1e-9);
  // the FX
  const said = [];
  const fctx = { slot: 0, glow: () => said.push('glow'), banner: (s) => said.push(s), feed: (s) => said.push(s), sound: {}, name: (p) => `P${p + 1}`, dist: 5, view: g.v };
  honey.fx({ kind: MC.HC_FX_CRACK, owner: 0, shot: 2, pos: [x, PLAT_Y, z], size: 0.3, tick: 1 }, fctx);
  honey.fx({ kind: MC.HC_FX_HOME, owner: 0, shot: 1, pos: [x, PLAT_Y, z], size: 20, tick: 1 }, fctx);
  honey.fx({ kind: MC.HC_FX_HOME, owner: 2, shot: 3, pos: [x, PLAT_Y, z], size: 20, tick: 1 }, fctx);
  assert.ok(said.includes('IT CRACKS!') && said.includes('TRACED IT 1ST!') && said.includes('P3 TRACED IT 3RD'), said.join('|'));
  assert.match(honey.sink({ owner: 0, shot: 255 }, (p) => `P${p + 1}`, g.v), /^P1 FELL THROUGH AT \d+%$/);
  assert.ok(honey.hint.length <= 70 && /^[ -_]*$/.test(honey.hint + honey.rules + honey.name), 'the 3x5 font\'s characters');
});
