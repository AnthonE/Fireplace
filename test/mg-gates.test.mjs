// GATE CRASH (src/mg/gates.wat): the course laid out for the crowd, the
// gates on their clocks (the mirror the client draws and the bots time runs
// by, against the sim's own, tick for tick), a gate solid under a ball's top,
// a slam knocking a ball back hard and never trapping it, the posts, the
// belts, the bumper posts, the rails, home and the places, the prediction
// through all of it, and rounds of AI balls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty, partySeed } from '../tools/genparty.mjs';
import gates, { course, gate, openTicks, untilFall, windows, sectionAt, nextWall, slotAt, standings } from '../client/mg/gates.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/gates.mjs'; // GC_*: the minigame's own constants

const TICK = 0.008;
const TURN = 16384;
const f32 = Math.fround;

// A room of n balls on Gate Crash, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_GATES + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step, c: course(v) };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
// Ball p at (x, y, z) (y its bottom), moving v, on the ground or not.
function put(g, p, [x, y, z], { v = [0, 0, 0], ground = true } = {}) {
  const a = rec(p);
  [x, y, z].forEach((q, i) => g.dv.setFloat32(a + L.P_PX + 4 * i, q, true));
  v.forEach((q, i) => g.dv.setFloat32(a + L.P_VX + 4 * i, q, true));
  g.dv.setUint8(a + L.P_FL, L.PF_LIVE | (ground ? L.PF_GROUND : 0));
}
// Out of the way: on the start pad, at rest.
const park = (g, p, u = 0) => put(g, p, [g.c.x0 - 2, PLAT_Y, g.c.cx + u]);
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const f = v.fx(k); if (f.kind === kind) out.push(f); } return out; };
const word = (yaw, o = {}) => partyWord({ yaw: Math.round(yaw / (2 * Math.PI) * TURN) & (TURN - 1), move: 1, ...o });
const still = partyWord({ yaw: 0, move: 0 });
// Ticks into play (as $p_t counts the tick about to be stepped).
const tp = (g) => g.v.party().t;
function until(g, t) { while (tp(g) < t) g.step(); }
// The first tick from t on that pred holds for.
const first = (t, pred) => { while (!pred(t)) t++; return t; };

test('the course for 1, 8, 64 and 256: wider for a crowd with more gates a wall, 8 to 12 walls 16 to 20 m apart, 148 to 256 m to the line, centred, a grid on the pad', async () => {
  let lastW = 0;
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const c = g.c;
    const w = f32(Math.min(f32(f32(f32(Math.sqrt(n)) * f32(MC.GC_WK)) + f32(MC.GC_W0)), MC.GC_WMAX));
    assert.equal(c.w, w, `${n}: the half-width`);
    assert.ok(c.w > lastW, 'wider for a crowd');
    lastW = c.w;
    assert.equal(c.ng, Math.max(MC.GC_NGMIN, Math.min(MC.GC_NGMAX, Math.trunc(f32(f32(w * 2) / MC.GC_SLOT)))), `${n}: ${c.ng} gates a wall`);
    assert.equal(c.s, f32(f32(w * 2) / c.ng));
    assert.deepEqual([r.kind, r.len, r.respawn, r.flags], [L.PK_SCORE, MC.GC_LEN, MC.GC_BACK, L.PGF_BUMPS | L.PGF_NOKICK]);
    assert.equal(r.idle, f32(MC.GC_IDLE));
    assert.ok(c.nw >= MC.GC_NW0 && c.nw < MC.GC_NW0 + MC.GC_NWK);
    const len = c.fin - c.x0;
    const span = (len - MC.GC_X1 - MC.GC_XN) / (c.nw - 1);
    assert.ok(span >= MC.GC_GAP0 - 1e-3 && span <= MC.GC_GAP0 + MC.GC_GAPK + 1e-3 && len > 147 && len < 257, `${n}: the line ${len.toFixed(0)} m on`);
    for (let k = 1; k < c.nw - 1; k++) assert.ok(Math.abs(c.walls[k].x - c.x0 - MC.GC_X1 - k * span) <= MC.GC_JIT + 1e-3, 'jittered at most GC_JIT');
    assert.ok(Math.abs(c.walls[0].x - c.x0 - MC.GC_X1) < 1e-3 && Math.abs(c.fin - c.walls.at(-1).x - MC.GC_XN) < 1e-3, 'the first and last walls');
    assert.ok(Math.abs((c.xa + c.xb) / 2 - L.B_CX) < 0.01 && Math.abs(c.cx - L.B_CX) < 1e-6, 'centred');
    assert.ok(Math.abs(c.xb - c.fin - (MC.GC_PEN0 + MC.GC_PENK * n)) < 1e-3, 'the pen for the crowd');
    assert.ok(Math.abs(r.size - Math.max(c.xb - c.xa, 2 * c.w) / 2) < 0.01);
    // the grid: every ball on the pad, on the floor, inside the rails, apart, nobody past the start line
    const spots = [];
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.ok(b.pos[0] > c.xa + 1 && b.pos[0] < c.x0 && Math.abs(b.pos[2] - c.cx) < c.w - 1, `${n}: P${p + 1} on the pad`);
      assert.equal(b.pos[1], PLAT_Y);
      assert.ok(b.ground && !b.out);
      spots.push([b.pos[0], b.pos[2]]);
    }
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) > 2.3, `${n}: ${i} and ${j} apart`);
  }
});

test('courses from many seeds and crowds: walls in order at least 14 m apart; each gate\'s period shorter down the course, its phase in it; every course a belt and bumper posts, clear of the walls and the rails', async () => {
  for (let seed = 1; seed <= 24; seed++) {
    const n = [1, 16, 100, 256][seed % 4];
    const g = await room(n, { play: false, seed: seed * 7919 });
    const c = g.c;
    for (let k = 1; k < c.nw; k++) assert.ok(c.walls[k].x - c.walls[k - 1].x >= 14, `seed ${seed}: walls ${k - 1} and ${k} apart`);
    for (const W of c.walls) {
      assert.ok(Math.abs(W.depth - W.k / (c.nw - 1)) < 1e-6);
      const base = Math.trunc(f32(f32(W.depth * f32(MC.GC_P1 - MC.GC_P0)) + MC.GC_P0));
      for (const G of W.gates) {
        assert.ok(G.per >= base && G.per < base + MC.GC_PK && G.ph < G.per, `seed ${seed}: gate ${G.i}'s clock`);
        // a period holds the warning, the slam, some time down and the rise
        assert.ok(openTicks(G.per, 1, 1e9) + MC.GC_FALL + MC.GC_RISE + 40 < G.per);
      }
    }
    const mean = (W) => W.gates.reduce((a, G) => a + G.per, 0) / W.gates.length;
    assert.ok(mean(c.walls.at(-1)) < mean(c.walls[0]) - 80, 'shorter down the course');
    assert.ok(c.secs.some((S) => S.fl & MC.GC_S_BELT) && c.secs.some((S) => S.fl & MC.GC_S_POSTS), `seed ${seed}: a belt and posts`);
    assert.equal(c.secs[0].fl, 0, 'a clear run to the first wall');
    assert.equal(c.secs[c.nw].fl, 0, 'and from the last to the line');
    for (const S of c.secs) {
      if (S.fl & MC.GC_S_BELT) assert.ok(Math.abs(S.bx0 - S.lo - MC.GC_BIN) < 1e-3 && Math.abs(S.hi - S.bx1 - MC.GC_BOUT) < 1e-3, 'a belt short of both walls');
      assert.equal(S.posts.length > 0, Boolean(S.fl & MC.GC_S_POSTS));
      for (const P of S.posts) {
        assert.ok(P.x - S.lo > 4 && S.hi - P.x > 4, 'clear of the walls');
        assert.ok(Math.abs(P.z - c.cx) < c.w - MC.GC_BR - 0.5, 'clear of the rails');
        for (const Q of S.posts) if (Q !== P) assert.ok(Math.hypot(P.x - Q.x, P.z - Q.z) > 2 * MC.GC_BR + 2.2, 'a ball fits between');
      }
    }
  }
});

test('a gate\'s clock, the sim\'s against the mirror\'s on every tick: up, flashing GC_WARN before the slam, GC_FALL down, down, GC_RISE up; the share up shrinking down the course and with the round', async () => {
  const g = await room(2);
  const c = g.c;
  park(g, 1);
  // a ball at rest centred under the gate every tick: knocked if it's slamming past its top, pushed out of it if
  // it's down or rising under it, else left be; just as the mirror says
  const probe = (W, G, ticks) => {
    const seen = new Set();
    for (let k = 0; k < ticks; k++) {
      const t = tp(g);
      const st = gate(W, G, t);
      put(g, 0, [W.x + 0.01, PLAT_Y, G.zc]);
      g.dv.setUint16(rec(0) + L.PG_SCORE, 0, true);
      g.step([[L.EV_INPUT, 0, still]]);
      const b = g.v.partier(0);
      seen.add(st.st);
      if (st.b >= 2) assert.ok(Math.abs(b.pos[0] - W.x - 0.01) < 1e-5 && b.vel[0] === 0, `tick ${t}: under it, ${st.st}`);
      else if (st.st === MC.GC_FALLING) assert.ok(b.vel[0] === MC.GC_THRU && Math.abs(b.pos[0] - (W.x + MC.GC_T + 1)) < 1e-4, `tick ${t}: slammed through`);
      else assert.ok(Math.abs(b.pos[0] - (W.x + MC.GC_T + 1)) < 1e-4 && b.vel[0] === 0, `tick ${t}: put out of it (${st.st}, ${b.pos[0] - W.x})`);
    }
    assert.equal(seen.size, 5, 'every state');
  };
  for (const W of [c.walls[0], c.walls.at(-1)]) probe(W, W.gates[1], W.gates[1].per + 10);
  // its shape: per period, up then the slam then down then rising, the warning the last GC_WARN of it up
  const W = c.walls[0], G = W.gates[0];
  let t = first(0, (s) => gate(W, G, s).o === 0);
  const run = [];
  for (let k = 0; k < G.per; k++) run.push(gate(W, G, t + k).st);
  const open = openTicks(G.per, W.depth, t);
  assert.deepEqual([run.indexOf(MC.GC_WARNING), run.indexOf(MC.GC_FALLING), run.indexOf(MC.GC_DOWN), run.indexOf(MC.GC_RISING)],
    [open - MC.GC_WARN, open, open + MC.GC_FALL, G.per - MC.GC_RISE]);
  assert.equal(gate(W, G, t + open + MC.GC_FALL - 1).b, 0);
  assert.equal(gate(W, G, t - 1).b, f32(MC.GC_OPEN_H));
  assert.ok(untilFall(W, G, t) === open && untilFall(W, G, t + open) === 0);
  // the share up: GC_O0 at the first wall at the start, GC_O1 at the last from GC_RAMP on, between halfway
  assert.equal(openTicks(1000, 0, 0), Math.trunc(f32(1000 * f32(MC.GC_O0))));
  assert.equal(openTicks(1000, 1, MC.GC_RAMP + 5), Math.trunc(f32(1000 * f32(MC.GC_O1))));
  assert.ok(openTicks(1000, 1, 0) < openTicks(1000, 0, 0) && openTicks(1000, 0, MC.GC_RAMP) < openTicks(1000, 0, 0));
  assert.ok(Math.abs(openTicks(1000, 1, 0) - openTicks(1000, 0, MC.GC_RAMP)) <= 1, 'depth and time count the same');
  // late in the round the sim's gates hold the mirror's shorter windows too
  g.dv.setUint32(L.HDR_START, g.v.hole().tick - MC.GC_RAMP - 3000, true);
  probe(c.walls.at(-1), c.walls.at(-1).gates[0], c.walls.at(-1).gates[0].per + 10);
  // windows: a ball 2.15 m tall gets under from the tick it's risen past it to the tick it's fallen past it
  for (const [a, b] of windows(W, G, tp(g), 2.15)) {
    assert.ok(gate(W, G, a).b >= 2.15 && gate(W, G, a - 1).b < 2.15, 'opens');
    assert.ok(gate(W, G, b - 1).b >= 2.15 && gate(W, G, b).b < 2.15, 'closes');
  }
});

test('a gate whose bottom is under a ball\'s top is a wall: rolled at one down it bounces back off its face, hopping or not; rolled under one up it goes through', async () => {
  const g = await room(2);
  const c = g.c;
  park(g, 1);
  const W = c.walls[2], G = W.gates[1];
  for (const hop of [0, 1]) {
    // down for at least the next 60 ticks
    until(g, first(tp(g) + 1, (s) => { for (let k = 0; k < 90; k++) if (gate(W, G, s + k).b > 1) return false; return true; }));
    put(g, 0, [W.x - 5, PLAT_Y, G.zc], { v: [8, 0, 0] });
    let nearest = Infinity;
    const fx0 = g.v.fxCount();
    for (let k = 0; k < 85; k++) {
      g.step([[L.EV_INPUT, 0, word(0, { hop: hop && g.v.partier(0).ground && W.x - g.v.partier(0).pos[0] < 2.6 ? 1 : 0 })]]);
      nearest = Math.min(nearest, W.x - MC.GC_T - g.v.partier(0).pos[0]);
    }
    assert.ok(nearest > 1 - 1e-3, `${hop ? 'hopping' : 'rolling'}: never into it (${nearest.toFixed(3)})`);
    assert.ok(g.v.partier(0).pos[0] <= W.x - MC.GC_T - 1 + 1e-3, 'held this side');
    const bonk = fxs(g.v, MC.GC_FX_BONK, fx0);
    if (!hop) assert.ok(bonk.length >= 1 && bonk[0].owner === 0 && bonk[0].shot === G.i && bonk[0].size > 5, 'its FX: the gate, how hard');
  }
  // up, long enough to get through: through it and past
  until(g, first(tp(g) + 1, (s) => { for (let k = 0; k < 90; k++) if (gate(W, G, s + k).b < 3) return false; return true; }));
  put(g, 0, [W.x - 3, PLAT_Y, G.zc], { v: [8, 0, 0] });
  for (let k = 0; k < 80; k++) g.step([[L.EV_INPUT, 0, word(0)]]);
  assert.ok(g.v.partier(0).pos[0] > W.x + MC.GC_T + 1, 'through');
  // the posts between the gates are always solid, whatever the gates either side do: rolled at one, never in it
  const zp = c.zl + c.s;
  for (let n = 0; n < 3; n++) {
    put(g, 0, [W.x - 4, PLAT_Y, zp], { v: [8, 0, 0] });
    for (let k = 0; k < 150; k++) {
      g.step([[L.EV_INPUT, 0, word(0)]]);
      const b = g.v.partier(0);
      const dx = b.pos[0] - Math.max(W.x - MC.GC_T, Math.min(W.x + MC.GC_T, b.pos[0])), dz = b.pos[2] - Math.max(zp - MC.GC_PT, Math.min(zp + MC.GC_PT, b.pos[2]));
      assert.ok(Math.hypot(dx, dz) > 1 - 1e-3, `never in the post (${dx.toFixed(3)}, ${dz.toFixed(3)})`);
    }
  }
});

test('a gate coming down onto a ball knocks it out the near side at GC_KNOCK back and GC_POP up, its FX on the ball\'s bank; past the gate\'s line on through; and in a roll back and forth under a gate it\'s never inside one solid to it', async () => {
  const g = await room(2);
  const c = g.c;
  park(g, 1);
  const W = c.walls[1], G = W.gates[2];
  for (const off of [-0.3, 0.3]) {
    until(g, first(tp(g) + 1, (s) => untilFall(W, G, s) === 3));
    put(g, 0, [W.x + off, PLAT_Y, G.zc]);
    const fx0 = g.v.fxCount();
    let at = -1;
    for (let k = 0; k < 20 && at < 0; k++) {
      const t = tp(g);
      g.step([[L.EV_INPUT, 0, still]]);
      if (fxs(g.v, MC.GC_FX_KNOCK, fx0).length) at = t;
      else put(g, 0, [W.x + off, PLAT_Y, G.zc]);
    }
    const st = gate(W, G, at);
    assert.ok(st.st === MC.GC_FALLING && st.b < 2 && gate(W, G, at - 1).b >= 2, `slammed the tick its bottom passes the ball's top (${st.b})`);
    const f = fxs(g.v, MC.GC_FX_KNOCK, fx0)[0];
    const b = g.v.partier(0);
    assert.deepEqual([f.owner, f.shot], [0, G.i]);
    if (off < 0) {
      assert.ok(Math.abs(b.pos[0] - (W.x - MC.GC_T - 1)) < 1e-4 && b.vel[0] === -MC.GC_KNOCK && b.vel[1] === MC.GC_POP && !b.ground, 'knocked back and up');
      assert.equal(f.size, MC.GC_KNOCK);
      // it lands well back
      for (let k = 0; k < 200; k++) g.step([[L.EV_INPUT, 0, still]]);
      assert.ok(g.v.partier(0).pos[0] < W.x - 8, `back ${(W.x - g.v.partier(0).pos[0]).toFixed(1)} m`);
    } else assert.ok(Math.abs(b.pos[0] - (W.x + MC.GC_T + 1)) < 1e-4 && b.vel[0] === MC.GC_THRU && b.ground, 'on through');
  }
  // back and forth across the wall's line for two periods, across the slots too: never inside a gate that's under its top
  put(g, 0, [W.x - 3, PLAT_Y, G.zc]);
  let knocks = 0, inside = 0;
  const fx0 = g.v.fxCount();
  for (let k = 0; k < 2 * G.per; k++) {
    const t = tp(g);
    const b0 = g.v.partier(0);
    const yaw = b0.pos[0] < W.x - 3 ? 0.4 * Math.sin(k * 0.05) : b0.pos[0] > W.x + 3 ? Math.PI + 0.4 * Math.sin(k * 0.05) : (k >> 6) & 1 ? Math.PI : 0;
    g.step([[L.EV_INPUT, 0, word(yaw)]]);
    const b = g.v.partier(0);
    const top = b.pos[1] - PLAT_Y + 2;
    for (const H of W.gates) {
      if (gate(W, H, t).b >= top) continue;
      const dx = b.pos[0] - Math.max(W.x - MC.GC_T, Math.min(W.x + MC.GC_T, b.pos[0])), dz = b.pos[2] - Math.max(H.z0, Math.min(H.z1, b.pos[2]));
      if (Math.hypot(dx, dz) < 1 - 2e-3) inside++;
    }
  }
  knocks = fxs(g.v, MC.GC_FX_KNOCK, fx0).length;
  assert.equal(inside, 0, 'never inside one');
  assert.ok(knocks >= 1, `${knocks} knocks on the way`);
});

test('a belt carries a ball on it back at GC_BELT; off its ends, and in the air over it, not', async () => {
  const g = await room(2);
  const c = g.c;
  park(g, 1);
  const S = c.secs.find((Q) => Q.fl & MC.GC_S_BELT);
  const zz = c.cx - c.w + 1.5;
  put(g, 0, [S.bx0 + 5, PLAT_Y, zz]);
  const x0 = g.v.partier(0).pos[0];
  for (let k = 0; k < 100; k++) g.step([[L.EV_INPUT, 0, still]]);
  const moved = x0 - g.v.partier(0).pos[0];
  assert.ok(Math.abs(moved - 100 * MC.GC_BELT * TICK) < 5e-3, `carried ${moved.toFixed(3)} m in 0.8 s`);
  assert.deepEqual(g.v.partier(0).vel, [0, 0, 0], 'carried, not pushed: its own speed stays');
  // past its far end (toward the next wall) and before its near one: still
  for (const x of [S.bx1 + 0.5, S.bx0 - 1.5]) {
    put(g, 0, [x, PLAT_Y, zz]);
    for (let k = 0; k < 30; k++) g.step([[L.EV_INPUT, 0, still]]);
    assert.ok(Math.abs(g.v.partier(0).pos[0] - f32(x)) < 0.025, `still at ${x - S.bx0}`);
  }
  // in the air over it: not carried while it's up
  put(g, 0, [S.bx0 + 5, PLAT_Y + 2, zz], { ground: false });
  g.step([[L.EV_INPUT, 0, still]]);
  assert.equal(g.v.partier(0).pos[0], f32(S.bx0 + 5));
  // rolling against it flat out a ball still gets up it, slower
  put(g, 0, [S.bx0 - 0.5, PLAT_Y, zz], { v: [9, 0, 0] });
  let k = 0;
  while (g.v.partier(0).pos[0] < S.bx1 && k++ < 2000) g.step([[L.EV_INPUT, 0, word(0)]]);
  assert.ok(k < 2000 && k * TICK > (S.bx1 - S.bx0 + 0.5) / 10, `up it in ${(k * TICK).toFixed(2)} s`);
});

test('a bumper post bounces a ball off at GC_BE of its speed into it and GC_BKICK more, its FX; the rails, the pad\'s back and the pen\'s end hold a ball in, and the pen\'s mouth carries it on', async () => {
  const g = await room(2);
  const c = g.c;
  park(g, 1);
  const S = c.secs.find((Q) => Q.posts.length);
  const P = S.posts[0];
  put(g, 0, [P.x - 4, PLAT_Y, P.z], { v: [6, 0, 0] });
  const fx0 = g.v.fxCount();
  let k = 0;
  while (!fxs(g.v, MC.GC_FX_BONK, fx0).length && k++ < 200) g.step([[L.EV_INPUT, 0, word(0)]]);
  const f = fxs(g.v, MC.GC_FX_BONK, fx0)[0];
  assert.ok(f && f.owner === 0 && f.shot === 4096 + P.j, 'its FX: the post');
  const b = g.v.partier(0);
  const into = f.size;
  assert.ok(Math.abs(-b.vel[0] - (into * MC.GC_BE + MC.GC_BKICK)) < 0.05, `off at ${(-b.vel[0]).toFixed(2)} from ${into.toFixed(2)}`);
  assert.ok(Math.hypot(b.pos[0] - P.x, b.pos[2] - P.z) >= MC.GC_BR + 1 - 1e-4, 'out of it');
  // resting against it, kicked off at GC_BKICK
  put(g, 0, [P.x, PLAT_Y, P.z + MC.GC_BR + 0.95]);
  g.step([[L.EV_INPUT, 0, still]]);
  assert.ok(Math.abs(g.v.partier(0).vel[2] - MC.GC_BKICK) < 1e-4, 'kicked off');
  // the rails: at 12 m/s into either, held in and bounced back
  const W = c.walls[0];
  for (const s of [1, -1]) {
    put(g, 0, [W.x - 6, PLAT_Y, c.cx + s * (c.w - 2)], { v: [0, 0, 12 * s] });
    for (let n = 0; n < 40; n++) g.step([[L.EV_INPUT, 0, still]]);
    const q = g.v.partier(0);
    assert.ok(!q.out && Math.abs(q.pos[2] - c.cx) <= c.w - 1 + 1e-3 && q.vel[2] * s <= 0, `held in: ${(q.pos[2] - c.cx).toFixed(2)}`);
  }
  // the pad's back and the pen's end
  put(g, 0, [c.xa + 2, PLAT_Y, c.cx + 2], { v: [-12, 0, 0] });
  for (let n = 0; n < 40; n++) g.step([[L.EV_INPUT, 0, still]]);
  assert.ok(g.v.partier(0).pos[0] >= c.xa + 1 - 1e-3, 'the back wall');
  put(g, 0, [c.xb - 2, PLAT_Y, c.cx], { v: [12, 0, 0] });
  for (let n = 0; n < 40; n++) g.step([[L.EV_INPUT, 0, still]]);
  assert.ok(g.v.partier(0).pos[0] <= c.xb - 1 + 1e-3, 'the pen\'s end');
  // the mouth: a ball stopped just over the line is carried on in
  put(g, 0, [c.fin + 0.5, PLAT_Y, c.cx]);
  for (let n = 0; n < 300; n++) g.step([[L.EV_INPUT, 0, still]]);
  assert.ok(g.v.partier(0).pos[0] > c.fin + MC.GC_MOUTH - 0.5, 'carried in off the line');
  // and nobody falls off: no sinks
  assert.equal(fxs(g.v, L.FX_SINK).length, 0);
});

test('home: over the line a ball scores GC_WIN plus the ticks it had left and takes its place; the first cuts the clock to GC_LATE; everyone home ends it, placed by finishing order', async () => {
  const g = await room(3);
  const c = g.c;
  const shove = (p, u, v = 8) => put(g, p, [c.fin - 1.5, PLAT_Y, c.cx + u], { v: [v, 0, 0] });
  shove(0, -2);
  park(g, 1, -3);
  park(g, 2, 3);
  const fx0 = g.v.fxCount();
  let k = 0;
  while (g.v.partier(0).score < MC.GC_WIN && k++ < 60) g.step();
  const t0 = g.v.party().t - 1;
  assert.equal(g.v.partier(0).score, MC.GC_WIN + MC.GC_LEN - t0, 'GC_WIN and the ticks it had left');
  const home = fxs(g.v, MC.GC_FX_HOME, fx0);
  assert.deepEqual([home.length, home[0].owner, home[0].size], [1, 0, 1], 'home 1st');
  const late = fxs(g.v, MC.GC_FX_LATE, fx0)[0];
  assert.equal(late.owner, 0);
  assert.equal(g.v.hole().until, g.v.party().start + t0 + MC.GC_LATE, 'the clock cut');
  assert.equal(late.size, MC.GC_LATE / 125);
  // the score stays, wherever it rolls
  for (let n = 0; n < 200; n++) g.step([[L.EV_INPUT, 0, word(Math.PI)]]);
  assert.equal(g.v.partier(0).score, MC.GC_WIN + MC.GC_LEN - t0);
  shove(1, 1);
  shove(2, 4);
  while (g.v.partier(1).score < MC.GC_WIN) g.step();
  assert.equal(g.v.partier(1).score, g.v.partier(2).score, 'the same tick, the same score');
  assert.deepEqual(standings(g.v).map((e) => [e.slot, e.rank]), [[0, 1], [1, 2], [2, 2]]);
  const r = g.v.party();
  assert.equal(r.state, L.H_OVER, 'everyone home: over on that tick');
  assert.deepEqual([0, 1, 2].map((p) => g.v.partier(p).place), [1, 2, 2]);
  assert.deepEqual([0, 1, 2].map((p) => g.v.partier(p).pts), [10, 5, 5], '10 for 1st, 2nd of 3 shared');
  assert.equal(r.winner, 0);
});

test('the clock: nobody home, the round ends at PG_LEN, placed by how far down the course they are (a decimetre a point, ties shared); a newcomer in play drops onto the pad', async () => {
  const g = await room(3);
  const c = g.c;
  const S = c.secs[0];
  for (const [p, d] of [[0, 3.04], [1, 8.97], [2, 8.93]]) put(g, p, [c.x0 + d, PLAT_Y, c.cx + (p - 1) * 2.5]);
  g.step([[L.EV_JOIN, 3]]);
  const b = g.v.partier(3);
  assert.ok(b.pos[0] > c.xa && b.pos[0] < c.x0 && b.pos[1] > PLAT_Y + 5 && !b.out, 'a newcomer drops onto the pad');
  assert.ok(S.fl === 0);
  while (g.v.party().state === L.H_PLAY) g.step();
  const r = g.v.party();
  assert.equal(r.state, L.H_OVER);
  assert.equal(r.tick - 1 - r.start, MC.GC_LEN, 'at PG_LEN');
  assert.deepEqual([0, 1, 2].map((p) => g.v.partier(p).score), [30, 89, 89]);
  assert.deepEqual([0, 1, 2, 3].map((p) => g.v.partier(p).place), [3, 1, 1, 4], 'by distance, ties shared');
});

test('the prediction matches the confirmed ball bit for bit through every hazard: gates slamming on it, gates down and posts it rolls into, bumper posts, belts, the rails and the line', async () => {
  const g = await room(3);
  const c = g.c;
  park(g, 2);
  // P2 home first, so the clock's cut is behind us (and P3 on the pad, so the round goes on)
  put(g, 1, [c.fin - 1, PLAT_Y, c.cx + 3], { v: [8, 0, 0] });
  while (g.v.partier(1).score < MC.GC_WIN) g.step();
  let compared = 0;
  const stats = { knock: 0, bonk: 0, post: 0, belt: 0 };
  const count = (fx0) => {
    stats.knock += fxs(g.v, MC.GC_FX_KNOCK, fx0).length;
    for (const f of fxs(g.v, MC.GC_FX_BONK, fx0)) stats[f.shot >= 4096 ? 'post' : 'bonk']++;
  };
  // at each wall from 6 m short, weaving across the slots, now and then backing off or hopping
  for (const W of c.walls.slice(0, 6)) {
    for (const [lane, phase] of [[-0.3, 0], [0.35, 0.6]]) {
      put(g, 0, [W.x - 6, PLAT_Y, c.cx + lane * c.w], { v: [7, 0, 0] });
      const fx0 = g.v.fxCount();
      for (let n = 0; n < 12; n++) {
        const words = Array.from({ length: 10 }, (_, i) => {
          const k = n * 10 + i;
          return word(k % 47 < 9 ? Math.PI : 0.6 * Math.sin(k * 0.09 + phase), { hop: k % 53 === 20 ? 1 : 0 });
        });
        compared += predicted(g, words);
      }
      count(fx0);
    }
  }
  // into the slam: waiting under a gate as it falls
  for (const W of c.walls.slice(1, 4)) {
    const G = W.gates[1];
    until(g, first(tp(g) + 1, (s) => untilFall(W, G, s) === 12));
    put(g, 0, [W.x - 0.4, PLAT_Y, G.zc]);
    const fx0 = g.v.fxCount();
    for (let n = 0; n < 4; n++) compared += predicted(g, Array.from({ length: 10 }, (_, i) => word(0, { move: (n + i) % 4 ? 0 : 1 })));
    count(fx0);
  }
  // across the sections: belts and bumper posts, rolling down the course with a wobble
  for (const S of c.secs.filter((Q) => Q.fl)) {
    for (const P of S.posts.slice(0, 2)) {
      put(g, 0, [P.x - 4, PLAT_Y, P.z + 0.3], { v: [6, 0, 0] });
      const fx0 = g.v.fxCount();
      for (let n = 0; n < 8; n++) compared += predicted(g, Array.from({ length: 10 }, (_, i) => word(0.15 * Math.sin(n + i))));
      count(fx0);
    }
    if (S.fl & MC.GC_S_BELT) {
      put(g, 0, [S.bx0 + 1, PLAT_Y, c.cx - c.w + 1.5]);
      for (let n = 0; n < 6; n++) {
        compared += predicted(g, Array.from({ length: 10 }, (_, i) => (n + i) % 3 ? still : word(0.2)));
        const b = g.v.partier(0);
        if (b.ground && b.pos[0] >= S.bx0 && b.pos[0] < S.bx1) stats.belt += 10;
      }
    }
  }
  // the rails, and over the line
  put(g, 0, [c.fin - 2.5, PLAT_Y, c.cx + c.w - 2], { v: [6, 0, 8] });
  for (let n = 0; n < 6; n++) compared += predicted(g, Array.from({ length: 10 }, (_, i) => word(0.4 - 0.1 * i)));
  assert.ok(g.v.partier(0).score >= MC.GC_WIN, 'home');
  assert.ok(compared > 900, `${compared} predictions compared`);
  assert.ok(stats.knock >= 3 && stats.bonk >= 3 && stats.post >= 2 && stats.belt >= 40, `through ${JSON.stringify(stats)}`);
});

for (const [balls, ticks] of [[8, 9000], [64, 10000]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, through the gates, most of them home, the round over and placed; equal on 1 and 4 threads`, async () => {
    let start = -1, over = -1, places = null, pts = null, home = 0, knocks = 0, seen = 0;
    const { log, sim, view } = await playParty({ bytes: partyBytes(true), seed: balls + 5, mg: L.MG_GATES, bots: balls, ticks, onTick: (t, s, v) => {
      if (s.error().code) throw new Error(`trap ${JSON.stringify(s.error())}`);
      const g = v.party();
      if (start < 0 && g.state === L.H_PLAY) start = t;
      for (; seen < v.fxCount(); seen++) {
        const f = v.fx(seen);
        if (over >= 0 || start < 0) continue;
        home += f.kind === MC.GC_FX_HOME;
        knocks += f.kind === MC.GC_FX_KNOCK;
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
    assert.ok(secs > 20 && secs <= MC.GC_LEN * TICK, `${secs.toFixed(1)} s of play`);
    assert.ok(home >= balls * (balls > 8 ? 0.6 : 0.85), `${home} of ${balls} home`);
    assert.ok(places.every((x) => x >= 1 && x <= balls), `places ${places}`);
    assert.ok(pts.every((x) => x >= 1 && x <= 10), `points ${pts}`);
    assert.ok(places.includes(1) && pts.includes(10), 'somebody won');
    if (balls > 8) assert.ok(knocks > 0, `${knocks} knocked back`);
    assert.equal(view.party().game, L.MG_GATES);
    const parsed = parseLog(log);
    const n = over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
    assert.equal(partySeed(balls + 5, L.MG_GATES) >>> 24, 0xa7);
  });
}

test('the client module: the course as the sim has it, drawn (the gates where the clock has them), framed, its HUD lines and its brain', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const g = await room(4, { seed: 99 });
  const c = g.c;
  // the mirror's lookups
  const W = c.walls[3];
  assert.equal(nextWall(c, W.x - 2), W);
  assert.equal(nextWall(c, W.x + MC.GC_T + 1.01), c.walls[4]);
  assert.equal(sectionAt(c, W.x + 0.01).k, W.k + 1);
  assert.equal(slotAt(c, W.gates[2].zc), 2);
  const out = { scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null };
  const ctx = { tick: g.v.tick, dt: 0, t: g.v.party().t * TICK, ptick: g.v.tick, now: 1000, ms: 16, cam: [c.x0, 60, c.cx], slot: 0 };
  gates.draw(g.v, ctx, out);
  assert.ok(out.scene.count > 100 && out.scene.count < 8000, `${out.scene.count} solids`);
  for (let i = 0; i < out.scene.count * 16; i++) assert.ok(Number.isFinite(out.scene.data[i]), 'finite');
  // a gate's panel drawn at its bottom's height
  const G = W.gates[0];
  const want = PLAT_Y + gate(W, G, g.v.party().t).b + MC.GC_OPEN_H / 2;
  let found = false;
  for (let i = 0; i < out.scene.count; i++) {
    const d = out.scene.data.subarray(i * 16, i * 16 + 16);
    if (Math.abs(d[0] - W.x) < 1e-3 && Math.abs(d[2] - G.zc) < 1e-3 && Math.abs(d[1] - want) < 1e-3 && d[11] === 4) found = true;
  }
  assert.ok(found, 'the gate where its clock has it');
  const fr = gates.frame(g.v);
  assert.equal(fr.shape, 'square');
  assert.ok(Math.abs(fr.radius - g.v.party().size) < 0.01);
  assert.equal(gates.facing(g.v, 0), 0);
  // the HUD: your place, how far to go, your gate
  put(g, 0, [W.x - 5, PLAT_Y, G.zc]);
  g.step();
  const lines = [];
  const hctx = { put: (x, y, s, col) => lines.push([y, s, col]), centre: (y, s, col) => lines.push([y, s, col]), right: (y, s, col) => lines.push([y, s, col]), rows: 44, C: {}, slot: 0, me: g.v.partier(0), now: 0 };
  gates.hud(g.v, hctx);
  const text = lines.map((l) => l[1]).join(' | ');
  assert.ok(/1ST OF 4/.test(text) && /M TO GO/.test(text) && new RegExp(`WALL ${W.k + 1} OF ${c.nw}  GATE`).test(text), text);
  for (const l of lines) assert.ok(l[1].length <= 40, l[1]);
  assert.ok(gates.hint.length <= 70 && gates.rules.length <= 70);
  // danger: open floor fine, a gate under a ball's top deadly on the tick it is, a post, the rails
  const me = g.v.partier(0);
  const start = g.v.party().start;
  const t0 = g.v.party().t;
  const down = first(t0, (s) => gate(W, G, s).b === 0), up = first(t0, (s) => gate(W, G, s).b === f32(MC.GC_OPEN_H));
  assert.equal(gates.brain.danger(g.v, W.x, G.zc, start + down, me), 1);
  assert.equal(gates.brain.danger(g.v, W.x, G.zc, start + up, me), 0);
  assert.equal(gates.brain.danger(g.v, W.x - 1.6, G.zc, start + down, me), 0);
  const P = c.posts[0];
  assert.ok(gates.brain.danger(g.v, P.x + 1.5, P.z, start + t0, me) > 0.5);
  assert.ok(gates.brain.danger(g.v, W.x - 6, c.cx + c.w - 0.5, start + t0, me) > 0);
  // its goal: a gate of the next wall, short of it while it waits, past it once it goes
  const bot = { mem: {}, skill: 0.6, slot: 0, at: g.v.tick, pos: [me.pos[0], me.pos[2]], vel: [0, 0] };
  const goal = gates.brain.goal(g.v, me, bot);
  assert.ok(goal && Math.abs(goal[0] - W.x) < 5 && W.gates.some((H) => H.zc === goal[1]), `at a gate of wall ${W.k}: ${goal}`);
  const plan = bot.mem.plan;
  assert.ok(plan.wall === W && (plan.ready ? goal[0] > W.x : goal[0] < W.x));
  assert.ok(windows(W, plan.G, plan.go - 1, 2.15).some(([a, b]) => plan.go >= a && plan.go < b), 'it goes in one of its gate\'s windows');
});
