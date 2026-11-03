// MINI GOLF (src/mg/minigolf.wat): the course for the crowd, the putt from
// the word, the roll, the slopes, the walls and posts, the windmill, the gate
// and the bar on their schedules, the cup, the stroke cap, home, the places;
// the prediction bit for bit; rounds of AI golfers; the client's mirror.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes } from './helpers.mjs';
import { View, partyWord, PLAT_Y } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/minigolf.mjs'; // PT_*: the minigame's own constants
import golfMg, { course, golfer, surf, field, wayFrom, sightOf, simPutt, moverAt, standings, callOf } from '../client/mg/minigolf.mjs';

const f = Math.fround;
const W = (o) => partyWord(o);

// A room of n balls in MINI GOLF, on the debug build (a NaN traps) unless asked not to, stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7, debug = true } = {}) {
  const sim = await newParty(debug);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_MINIGOLF + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
// A room whose course has all six holes (a seed in four lays out six).
async function six(n = 2, opts = {}) {
  for (let seed = 1; ; seed++) {
    const g = await room(n, { ...opts, seed });
    if (g.dv.getUint32(L.PG_H + MC.PT_NH, true) === 6) return g;
  }
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
const holeOf = (g, tpl) => course(g.v, true).holes.find((H) => H.tpl === tpl);
const m = (g, p) => golfer(g.dv.getUint32(rec(p) + L.PG_M, true));
const pos = (g, p) => [0, 4, 8].map((o) => g.dv.getFloat32(rec(p) + L.P_PX + o, true));
const vel = (g, p) => [12, 16, 20].map((o) => g.dv.getFloat32(rec(p) + L.P_PX + o, true));
const score = (g, p) => g.dv.getUint16(rec(p) + L.PG_SCORE, true);
const fxs = (v, kind, from = 0) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
// Ball p at (x, z) on the green of hole H (its index h), still, `strokes` taken there and `total` before it; or rolling at (vx, vz).
function put(g, p, H, x, z, { strokes = 0, total = 0, vx = 0, vz = 0 } = {}) {
  const d = g.dv, a = rec(p);
  d.setFloat32(a + L.P_PX, x, true); d.setFloat32(a + L.P_PY, f(PLAT_Y + surf(H, z)[0]), true); d.setFloat32(a + L.P_PZ, z, true);
  d.setFloat32(a + L.P_VX, vx, true); d.setFloat32(a + L.P_VY, 0, true); d.setFloat32(a + L.P_VZ, vz, true);
  d.setUint8(a + L.P_FL, L.PF_LIVE | L.PF_GROUND);
  d.setUint16(a + L.P_REFIRE, vx || vz ? MC.PT_ROLLMAX : 0, true);
  const ctr = (d.getUint32(a + L.P_IN, true) >>> 29) & 3;
  d.setUint32(a + L.PG_M, (MC.PT_M_BEGUN | (ctr << MC.PT_M_CTR) | H.h | (strokes << MC.PT_M_STROKE) | (total << MC.PT_M_TOTAL)) >>> 0, true);
}
// The next step plays tick t into play.
function at(g, t) {
  const now = g.v.tick;
  g.dv.setUint32(L.HDR_START, now - t, true);
  g.dv.setUint32(L.HDR_UNTIL, now - t + 30000, true);
}
const tNow = (g) => (g.v.tick - g.v.hole().start) | 0;
// A putt by slot p: Space held n ticks at yaw, then let go.
function putt(g, yaw, n, p = 0) {
  for (let k = 0; k < n; k++) g.step([[L.EV_INPUT, p, W({ yaw, hop: 1 })]]);
  g.step([[L.EV_INPUT, p, W({ yaw })]]);
}
const roll = (g, max = 2000) => { for (let k = 0; k < max; k++) { g.step(); const v = vel(g, 0); if (v[0] === 0 && v[2] === 0) return k; } return max; };
const yawTo = (x, z, tx, tz) => Math.round((Math.atan2(tz - z, tx - x) / (2 * Math.PI)) * 16384) & 16383;

test('the course for 1, 8, 64 and 256: 3 to 6 holes side by side round the centre, each walled with its tee and cup clear; everyone on the lawn behind the first, PT_WALK into play on its tee; scored, no push, no hop, no bumps', async () => {
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party(), c = course(g.v, true);
    assert.equal(r.game, L.MG_MINIGOLF);
    assert.ok(c.nh >= MC.PT_NHMIN && c.nh <= MC.PT_NHMAX, `${c.nh} holes`);
    assert.deepEqual([r.kind, r.len, r.acc, r.drag, r.idle, r.hop, r.flags, r.respawn], [L.PK_SCORE, MC.PT_LEN0 + c.nh * MC.PT_LENH, 0, 1, 1, 0, 0, 0x7fffffff]);
    assert.equal(new Set(c.holes.map((H) => H.tpl)).size, c.nh, 'no hole twice');
    assert.equal(c.pars, c.holes.reduce((s, H) => s + H.par, 0));
    assert.ok(Math.abs((c.holes[0].x + c.holes[c.nh - 1].x) / 2 - r.cx) < 1e-3, 'centred');
    for (const H of c.holes) {
      assert.equal(H.x, f(c.x0 + H.h * MC.PT_PITCH));
      assert.ok(H.hw * 2 < MC.PT_PITCH - 4, 'a gap between holes');
      for (const pt of [H.tee, H.cup]) for (const [ax, az, bx, bz] of H.segs) {
        const ex = bx - ax, ez = bz - az, t = Math.max(0, Math.min(1, ((pt[0] - ax) * ex + (pt[1] - az) * ez) / (ex * ex + ez * ez)));
        assert.ok(Math.hypot(pt[0] - ax - ex * t, pt[1] - az - ez * t) >= MC.PT_RW, `hole ${H.h} (${H.tpl}): tee and cup clear of the walls`);
      }
      assert.ok(wayFrom(H, H.tee[0], H.tee[1]) < 120, 'the cup is reachable');
    }
    const H0 = c.holes[0];
    const spots = [];
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y, `${n}: P${p + 1} on the lawn`);
      assert.ok(Math.abs(b.pos[0] - H0.x) < MC.PT_LCOLS * MC.PT_LSTEP / 2 && b.pos[2] <= H0.z - MC.PT_LBACK, `${n}: P${p + 1} behind the first hole`);
      spots.push(b.pos);
    }
    for (let p = 1; p < n; p++) assert.ok(Math.hypot(spots[p][0] - spots[p - 1][0], spots[p][2] - spots[p - 1][2]) >= MC.PT_LSTEP - 1e-4);
    // a newcomer in the countdown lays the round out again: the same course
    const before = g.sim.u8.slice(L.PG_S, L.PG_S + 6 * MC.PT_HSIZE);
    if (n < 256) {
      g.step([[L.EV_JOIN, n]]);
      assert.deepEqual(g.sim.u8.slice(L.PG_S, L.PG_S + 6 * MC.PT_HSIZE), before, 'the same course');
    }
    // into play: still on the lawn till PT_WALK, then on the first tee (sharing its 15 spots)
    while (g.v.hole().state !== L.H_PLAY) g.step();
    for (let k = 0; k < MC.PT_WALK - 2; k++) g.step();
    assert.deepEqual(g.v.partier(0).pos, spots[0], 'still on the lawn');
    g.step(); g.step();
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.ok(b.pos[1] === PLAT_Y && Math.abs(b.pos[0] - H0.tee[0]) <= 2.61 && b.pos[2] <= H0.tee[1] && b.pos[2] >= H0.tee[1] - 3.21, `${n}: P${p + 1} on the first tee`);
      assert.ok(wayFrom(H0, b.pos[0], b.pos[2]) < 999);
    }
  }
});

test('the six holes, from the seed: each in its own order and mirrored half the time, their obstacles and slopes', async () => {
  const seen = new Map(), mir = [0, 0];
  for (let seed = 1; seed <= 14; seed++) {
    const g = await room(1, { play: false, seed });
    for (const H of course(g.v, true).holes) {
      seen.set(H.tpl, H);
      mir[H.mir < 0 ? 1 : 0]++;
    }
  }
  assert.equal(seen.size, MC.PT_NTPL, 'all six');
  assert.ok(mir[0] > 8 && mir[1] > 8, `mirrored ${mir[1]} of ${mir[0] + mir[1]}`);
  assert.equal(seen.get(MC.PT_T_WINDMILL).mover.kind, MC.PT_MK_WINDMILL);
  assert.equal(seen.get(MC.PT_T_GATE).mover.kind, MC.PT_MK_GATE);
  assert.equal(seen.get(MC.PT_T_SPINNER).mover.kind, MC.PT_MK_SPINNER);
  assert.equal(seen.get(MC.PT_T_DOGLEG).posts.length, 1);
  assert.equal(seen.get(MC.PT_T_BUMPERS).posts.length, 5);
  assert.equal(seen.get(MC.PT_T_GATE).feats[0].kind, MC.PT_F_RAMP);
  assert.ok(seen.get(MC.PT_T_SPINNER).feats[0].h < 0 && seen.get(MC.PT_T_ZIGZAG).feats[0].h < 0, 'the dips');
  // the dogleg: no straight line from the tee to the cup; the way round is longer
  const D = seen.get(MC.PT_T_DOGLEG);
  assert.equal(sightOf(D, D.tee[0], D.tee[1])[2], false);
  assert.ok(wayFrom(D, D.tee[0], D.tee[1]) > Math.hypot(D.cup[0] - D.tee[0], D.cup[1] - D.tee[1]) + 3);
});

test('a putt from the word: Space held charges a tick at a time to PT_CH, let go it goes PT_VK a tick of charge the way the word looks, a stroke and its FX; a tap is nothing; a click, then a click; the keys never roll it', async () => {
  const g = await six(2);
  const H = holeOf(g, MC.PT_T_BUMPERS);
  put(g, 0, H, H.x, H.z + 4);
  // the keys and a hop: nothing moves
  for (let k = 0; k < 40; k++) g.step([[L.EV_INPUT, 0, W({ yaw: 4096, move: 1 })]]);
  assert.deepEqual(vel(g, 0), [0, 0, 0]);
  // a tap under PT_CHMIN: no putt, no stroke
  putt(g, 4096, MC.PT_CHMIN - 2);
  assert.deepEqual([vel(g, 0)[2], m(g, 0).strokes, m(g, 0).charging], [0, 0, false]);
  // held 50 ticks
  for (let k = 0; k < 50; k++) g.step([[L.EV_INPUT, 0, W({ yaw: 4096, hop: 1 })]]);
  assert.deepEqual([m(g, 0).charging, m(g, 0).charge], [true, 50]);
  const f0 = g.v.fxCount();
  g.step([[L.EV_INPUT, 0, W({ yaw: 4096 })]]);
  assert.equal(vel(g, 0)[2], f(50 * f(MC.PT_VK)));
  assert.ok(Math.abs(vel(g, 0)[0]) < 1e-6);
  assert.deepEqual([m(g, 0).strokes, m(g, 0).charging], [1, false]);
  const fx = fxs(g.v, MC.PT_FX_PUTT, f0);
  assert.deepEqual([fx.length, fx[0].owner, fx[0].shot], [1, 0, 1]);
  // held while it rolls: no charge
  for (let k = 0; k < 30; k++) g.step([[L.EV_INPUT, 0, W({ yaw: 4096, hop: 1 })]]);
  assert.equal(m(g, 0).charging, false);
  // charged long it stays at PT_CH; a click then a click putts at the yaw then
  put(g, 0, H, H.x, H.z + 4);
  for (let k = 0; k < MC.PT_CH + 60; k++) g.step([[L.EV_INPUT, 0, W({ yaw: 0, hop: 1 })]]);
  assert.equal(m(g, 0).charge, MC.PT_CH);
  put(g, 0, H, H.x, H.z + 4);
  g.step([[L.EV_INPUT, 0, W({ yaw: 0, use: 1 })]]);
  assert.deepEqual([m(g, 0).charging, m(g, 0).armed], [true, true]);
  for (let k = 0; k < 39; k++) g.step([[L.EV_INPUT, 0, W({ yaw: 0, use: 1 })]]);
  g.step([[L.EV_INPUT, 0, W({ yaw: 8192, use: 2 })]]);
  assert.equal(vel(g, 0)[0], f(-40 * f(MC.PT_VK)));
  assert.equal(m(g, 0).strokes, 1);
});

test('the roll: rolling friction stops a putt about v^2 / 2a on the flat; off a wall it keeps PT_E of its speed in, off a post more than it came in with', async () => {
  const g = await six(2);
  const H = holeOf(g, MC.PT_T_BUMPERS);
  put(g, 0, H, H.x - H.mir * 6, H.z + 22);
  putt(g, 4096, 80);
  const v0 = vel(g, 0)[2], z0 = pos(g, 0)[2];
  const ticks = roll(g);
  const want = v0 * v0 / (2 * (MC.PT_FRIC_DT / 0.008));
  assert.ok(Math.abs(pos(g, 0)[2] - z0 - want) < 0.3, `${(pos(g, 0)[2] - z0).toFixed(2)} m, ${want.toFixed(2)} wanted`);
  assert.ok(Math.abs(ticks - v0 / MC.PT_FRIC_DT) < 3, `${ticks} ticks`);
  // straight into the end wall
  put(g, 0, H, H.x - 3, H.z + H.len - 4, { vz: 8 });
  let back = 0, vin = 0;
  for (let k = 0; k < 60 && !(back = vel(g, 0)[2] < 0); k++) { vin = vel(g, 0)[2]; g.step(); }
  assert.ok(back, 'it came back');
  assert.ok(Math.abs(-vel(g, 0)[2] / (vin - MC.PT_FRIC_DT) - MC.PT_E) < 0.01, `${vel(g, 0)[2]} back from ${vin}`);
  assert.ok(pos(g, 0)[2] <= H.z + H.len - MC.PT_RW + 1e-3, 'touching, not through');
  // into a post: kicked back harder than it came
  const [px, pz, reach] = H.posts[2];
  put(g, 0, H, px, pz - reach - 1.5, { vz: 5 });
  for (let k = 0; k < 60 && vel(g, 0)[2] >= 0; k++) g.step();
  assert.ok(vel(g, 0)[2] < -5, `${vel(g, 0)[2]} off the post`);
});

test('the slopes: the green under a ball is its hole\'s ($pt_surf), a ramp sends a short putt back down and holds a long one on the raised green; a hump slows one going up it', async () => {
  const g = await six(2);
  const G = holeOf(g, MC.PT_T_GATE);
  const ramp = G.feats[0];
  // the ground the ball keeps to
  put(g, 0, G, G.x, ramp.z0 + 1.2, { vz: 0.01 });
  g.step();
  assert.ok(Math.abs(pos(g, 0)[1] - (PLAT_Y + 0.6)) < 0.05, `${pos(g, 0)[1]} on the ramp's middle`);
  // a short roll up the ramp comes back down
  put(g, 0, G, G.x, ramp.z0 - 3, { vz: 5.5 });
  let top = 0;
  for (let k = 0; k < 800; k++) { g.step(); top = Math.max(top, pos(g, 0)[2]); }
  assert.ok(top > ramp.z0 && pos(g, 0)[2] < ramp.z0 + 0.01, `up to ${top.toFixed(2)}, back to ${pos(g, 0)[2].toFixed(2)}`);
  assert.equal(pos(g, 0)[1], PLAT_Y);
  // a long one stays up
  put(g, 0, G, G.x, ramp.z0 - 3, { vz: 9 });
  roll(g);
  assert.ok(pos(g, 0)[2] > ramp.z1 && Math.abs(pos(g, 0)[1] - f(PLAT_Y + 1.2)) < 1e-4, `on the green at ${pos(g, 0)}`);
  // the hump
  const B = holeOf(g, MC.PT_T_BUMPERS), hump = B.feats[0];
  put(g, 0, B, B.x - B.mir * 6.5, hump.z0 - 1, { vz: 6 });
  g.step(); g.step();
  const v1 = vel(g, 0)[2];
  for (let k = 0; k < 40; k++) g.step();
  assert.ok(pos(g, 0)[2] > hump.z0 && v1 - vel(g, 0)[2] > 40 * MC.PT_FRIC_DT + 0.05, 'slowed more than by friction');
  assert.ok(pos(g, 0)[1] > PLAT_Y + 0.05, 'on the hump');
});

test('the cup: a slow ball over it drops in, sinks PT_SINKT and is on the next tee, the hole counted, its FX; a fast one rolls over', async () => {
  const g = await six(2);
  const c = course(g.v, true);
  const H = c.holes[0], N = c.holes[1];
  // fast over it
  put(g, 0, H, H.cup[0], H.cup[1] - 4, { strokes: 1, vz: 9 });
  for (let k = 0; k < 70; k++) g.step();
  assert.equal(m(g, 0).hole, 0, 'rolled over');
  // putted in
  put(g, 0, H, H.cup[0], H.cup[1] - 4, { strokes: 2 });
  const f0 = g.v.fxCount();
  putt(g, 4096, 44);
  let k = 0;
  for (; k < 600 && m(g, 0).hole === 0; k++) g.step();
  const s = fxs(g.v, MC.PT_FX_SINK, f0);
  assert.deepEqual([s.length, s[0]?.owner, s[0]?.shot, s[0]?.size], [1, 0, 3, 0]);
  assert.deepEqual([m(g, 0).hole, m(g, 0).strokes, m(g, 0).total, m(g, 0).pause], [1, 3, 3, MC.PT_SINKT]);
  g.step();
  assert.deepEqual(pos(g, 0).filter((_, i) => i !== 1), [H.cup[0], H.cup[1]], 'in the cup');
  const tb = 1023 - Math.min(1023, tNow(g) >> 5);
  assert.ok(Math.abs((score(g, 0) & 1023) - tb) <= 1);
  assert.equal(score(g, 0) >> 10, MC.PT_SMAX - 3 - (MC.PT_CAP + 1) * (c.nh - 1));
  for (let i = 0; i < 50; i++) g.step();
  assert.ok(pos(g, 0)[1] < PLAT_Y + surf(H, H.cup[1])[0] - 1, 'sinking');
  for (let i = 0; i < MC.PT_SINKT; i++) g.step();
  assert.deepEqual([m(g, 0).hole, m(g, 0).strokes, m(g, 0).pause], [1, 0, 0]);
  assert.ok(Math.abs(pos(g, 0)[0] - N.tee[0]) < 2.7 && pos(g, 0)[2] <= N.tee[1] && pos(g, 0)[1] === PLAT_Y, 'on the next tee');
});

test('the stroke cap: PT_CAP strokes and still out at rest, the ball is picked up for PT_CAP + 1 where it lies and goes on', async () => {
  const g = await six(2);
  const c = course(g.v, true), H = c.holes[0];
  put(g, 0, H, H.tee[0], H.tee[1]);
  const f0 = g.v.fxCount();
  for (let s = 1; s <= MC.PT_CAP; s++) {
    assert.equal(m(g, 0).hole, 0);
    putt(g, 12288, 8); // into the tee's back wall, softly
    roll(g);
    if (s < MC.PT_CAP) assert.equal(m(g, 0).strokes, s);
  }
  g.step();
  const pk = fxs(g.v, MC.PT_FX_PICK, f0);
  assert.deepEqual([pk.length, pk[0].shot, m(g, 0).hole, m(g, 0).total], [1, MC.PT_CAP + 1, 1, MC.PT_CAP + 1]);
  const at0 = pos(g, 0);
  for (let i = 0; i < 50; i++) g.step();
  assert.deepEqual(pos(g, 0), at0, 'waits where it lies');
  for (let i = 0; i < MC.PT_SINKT; i++) g.step();
  assert.equal(m(g, 0).strokes, 0);
  assert.ok(Math.abs(pos(g, 0)[2] - c.holes[1].tee[1]) < 3.3);
});

test('home and the end: past the last hole a ball is out of play for good; once half are home the rest have PT_LATE; all home, the round is over, placed by the fewest strokes, a hole not finished PT_CAP + 1, ties to who finished first', async () => {
  const g = await room(4, { seed: 3 });
  const c = course(g.v, true), last = c.holes[c.nh - 1];
  const sink = (p, strokes, total) => {
    put(g, p, last, last.cup[0], last.cup[1] - 0.5, { strokes, total });
    g.step();
    assert.equal(m(g, p).hole, c.nh);
  };
  at(g, 2000);
  const f0 = g.v.fxCount();
  sink(0, 2, 3 * (c.nh - 1));
  for (let i = 0; i < MC.PT_SINKT; i++) g.step();
  assert.ok(g.v.partier(0).out, 'home');
  assert.equal(fxs(g.v, MC.PT_FX_HOME, f0)[0].shot, 3 * (c.nh - 1) + 2);
  const until0 = g.v.hole().until;
  // P2 home on the same strokes, later; P3 on more, P4 two holes short
  for (let i = 0; i < 40; i++) g.step();
  sink(1, 2, 3 * (c.nh - 1));
  for (let i = 0; i < MC.PT_SINKT + 1; i++) g.step();
  assert.ok(g.v.hole().until < until0 && g.v.hole().until <= g.v.tick + MC.PT_LATE, 'half home: the rest have PT_LATE');
  sink(2, 1, 3 * (c.nh - 1) + 4);
  const P4 = c.holes[c.nh - 3];
  put(g, 3, P4, P4.tee[0], P4.tee[1], { total: 2 * (c.nh - 3) });
  for (let i = 0; i < MC.PT_SINKT + 1; i++) g.step();
  assert.equal(g.v.hole().state, L.H_PLAY, 'P4 still out');
  // P4 through its holes in one each
  for (let h = c.nh - 3; h < c.nh; h++) {
    const H = c.holes[h];
    put(g, 3, H, H.cup[0], H.cup[1] - 0.5, { strokes: 1, total: m(g, 3).total });
    g.step();
    for (let i = 0; i < MC.PT_SINKT; i++) g.step();
  }
  for (let i = 0; i < 3 && g.v.hole().state === L.H_PLAY; i++) g.step();
  assert.equal(g.v.hole().state, L.H_OVER, 'all home: over');
  const totals = [0, 1, 2, 3].map((p) => m(g, p).total);
  assert.deepEqual(totals, [3 * c.nh - 1, 3 * c.nh - 1, 3 * c.nh + 2, 2 * (c.nh - 3) + 3]);
  const places = [0, 1, 2, 3].map((p) => g.v.partier(p).place);
  assert.deepEqual(places, [2, 3, 4, 1], 'fewest first; of two level, the one home first');
  // a hole not finished counts PT_CAP + 1
  const g2 = await room(2, { seed: 3 });
  const s0 = score(g2, 0);
  assert.equal(s0 >> 10, MC.PT_SMAX - (MC.PT_CAP + 1) * c.nh);
});

test('the windmill: its blades shut the door while one is within PT_WM_BL of straight down; a ball rolled at the shut door comes back, at the open one goes through', async () => {
  const g = await six(2);
  const H = holeOf(g, MC.PT_T_WINDMILL), M = H.mover;
  const shut = (t) => moverAt(M, t).shut;
  let n = 0;
  for (let t = 0; t < 4 * 630; t++) n += shut(t);
  assert.ok(Math.abs(n / (4 * 630) - (2 * MC.PT_WM_BL) / 4096) < 0.01, `shut ${n} of ${4 * 630}`);
  // the door shut for the next 40 ticks, and open for the next 50
  let ts = 0, to = 0;
  for (let t = 100; !ts; t++) if ([...Array(40).keys()].every((k) => shut(t + k))) ts = t;
  for (let t = 100; !to; t++) if ([...Array(60).keys()].every((k) => !shut(t + k))) to = t;
  put(g, 0, H, M.x, M.z - 2.2, { vz: 4 });
  at(g, ts);
  for (let k = 0; k < 40; k++) g.step();
  assert.ok(vel(g, 0)[2] < 0 && pos(g, 0)[2] < M.z - MC.PT_RW + 1e-3, `shut: back at ${vel(g, 0)[2]}`);
  put(g, 0, H, M.x, M.z - 2.2, { vz: 9 });
  at(g, to);
  for (let k = 0; k < 60; k++) g.step();
  assert.ok(pos(g, 0)[2] > M.z + 1, `open: through to ${pos(g, 0)[2]}`);
});

test('the gate: its gap slides PT_GT_A either way over PT_GT_P ticks and carries a ball sitting in it; its bar turns one back; the bar spins at PT_SP_W and bats a ball in its way', async () => {
  const g = await six(2);
  const G = holeOf(g, MC.PT_T_GATE), M = { ...G.mover, mir: G.mir };
  const gs = [...Array(MC.PT_GT_P).keys()].map((t) => moverAt(M, t).g - M.x);
  assert.ok(Math.abs(Math.max(...gs) - MC.PT_GT_A) < 0.05 && Math.abs(Math.min(...gs) + MC.PT_GT_A) < 0.05);
  // a ball still in the gap is carried along by its edge
  let t0 = 0;
  for (; Math.abs(moverAt(M, t0).g - M.x) > 0.1; t0++);
  put(g, 0, G, M.x, M.z);
  at(g, t0);
  for (let k = 0; k < 120; k++) g.step();
  const g1 = moverAt(M, t0 + 120).g;
  assert.ok(Math.abs(pos(g, 0)[0] - M.x) > 1.5 && Math.abs(pos(g, 0)[0] - g1) < MC.PT_GT_B, `carried to ${pos(g, 0)[0]} (gap at ${g1})`);
  // rolled into the bar, not the gap: turned back
  const bar = moverAt(M, t0).g + (M.x > moverAt(M, t0 + 30).g ? 1 : -1) * 4.5;
  put(g, 0, G, Math.max(M.x - 6, Math.min(M.x + 6, bar)), M.z - 3, { vz: 5 });
  at(g, t0);
  for (let k = 0; k < 60; k++) g.step();
  assert.ok(vel(g, 0)[2] < 0, `back off the bar ${vel(g, 0)}`);
  // the spinner bats a ball sitting in its sweep
  const S = holeOf(g, MC.PT_T_SPINNER), P = S.mover;
  assert.equal(Math.abs(P.w), MC.PT_SP_W);
  put(g, 0, S, P.x + 3.2, P.z);
  g.dv.setUint16(rec(0) + L.P_REFIRE, MC.PT_ROLLMAX, true);
  // the bar a quarter turn off, coming round
  const phiAt = (t) => t * P.w + P.ph;
  let t1 = 0;
  for (; ((phiAt(t1) % 16384) + 16384) % 16384 !== (P.w > 0 ? 16384 - 3000 : 3000) && t1 < 20000; t1++);
  at(g, t1);
  let hit = 0;
  for (let k = 0; k < 160 && !hit; k++) { g.step(); hit = Math.hypot(vel(g, 0)[0], vel(g, 0)[2]) > 3; }
  assert.ok(hit, `batted ${vel(g, 0)}`);
});

// The prediction against the confirmed world for slot 0 of room g through
// `inputs`: its whole record bit for bit. Returns how many it compared.
function predicted(g, inputs) {
  const due = new Map();
  let compared = 0;
  for (let k = 0; k < inputs.length; k++) {
    for (const n of [1, 6, 40]) {
      if ((k % 7 !== 0 && n !== 1) || k + n > inputs.length) continue;
      for (let i = 0; i < n; i++) g.dv.setUint32(L.PWORDS + 4 * i, inputs[k + i], true);
      g.sim.x.predict(0, n);
      const list = due.get(k + n) || [];
      list.push({ n, from: k, player: g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE) });
      due.set(k + n, list);
    }
    g.step([[L.EV_INPUT, 0, inputs[k]]]);
    for (const p of due.get(k + 1) || []) {
      assert.deepEqual(p.player, g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE), `predicted ${p.n} from ${p.from}`);
      compared++;
    }
  }
  return compared;
}
const hold = (yaw, n, wait = 0) => [...Array(n).fill(W({ yaw, hop: 1 })), ...Array(1 + wait).fill(W({ yaw }))];

test('the prediction matches the confirmed ball bit for bit: a putt charged and let go, over a hump, off posts and walls, through the windmill\'s door, past the gate and the bar, up the ramp, into the cup, down it and onto the next tee; a click putt; the cap', async () => {
  const g = await six(2);
  const c = course(g.v, true);
  let n = 0;
  // the bumpers' hole: up over the hump, off the posts
  const B = holeOf(g, MC.PT_T_BUMPERS);
  put(g, 0, B, B.tee[0], B.tee[1]);
  n += predicted(g, [...hold(4096 + 300, 110, 500), ...hold(4096 - 900, 70, 400)]);
  // the windmill: at its door, both ways
  const Wm = holeOf(g, MC.PT_T_WINDMILL);
  for (const t of [0, 60, 120]) {
    put(g, 0, Wm, Wm.mover.x, Wm.mover.z - 8);
    at(g, 400 + t);
    n += predicted(g, hold(4096, 70, 260));
  }
  // the gate and the ramp
  const G = holeOf(g, MC.PT_T_GATE);
  for (const t of [0, 140]) {
    put(g, 0, G, G.x, G.mover.z - 10);
    at(g, 900 + t);
    n += predicted(g, hold(4096, 130, 420));
  }
  // the bar, and a click putt into it
  const S = holeOf(g, MC.PT_T_SPINNER);
  put(g, 0, S, S.x + 1, S.mover.z - 9);
  n += predicted(g, [W({ yaw: 4096, use: 1 }), ...Array(90).fill(W({ yaw: 4096, use: 1 })), ...Array(400).fill(W({ yaw: 4096, use: 2 }))]);
  // into the cup, down it, onto the next tee (or home); the use counter back to 0 first
  g.step([[L.EV_INPUT, 0, W({ yaw: 4096 })]]);
  put(g, 0, Wm, Wm.cup[0], Wm.cup[1] - 5, { strokes: 1 });
  n += predicted(g, hold(4096, 52, MC.PT_SINKT + 80));
  assert.equal(m(g, 0).hole, Wm.h + 1, `holed and on: ${JSON.stringify(m(g, 0))} at ${pos(g, 0)} cup ${Wm.cup}`);
  const H = c.holes[0];
  // the cap, picked up and on
  put(g, 0, H, H.tee[0], H.tee[1], { strokes: MC.PT_CAP - 1 });
  n += predicted(g, hold(12288, 8, MC.PT_SINKT + 120));
  assert.equal(m(g, 0).total, MC.PT_CAP + 1);
  assert.ok(n > 5000, `${n} compared`);
});

test('a newcomer in play is on the first tee and plays from there, a ball alone plays its holes; the clock ends it', async () => {
  const g = await room(1, { seed: 11 });
  const c = course(g.v, true), H0 = c.holes[0];
  for (let k = 0; k < 300; k++) g.step();
  g.step([[L.EV_JOIN, 1]]);
  assert.ok(!g.v.partier(1).out);
  assert.ok(g.v.partier(1).pos[1] === PLAT_Y && Math.abs(g.v.partier(1).pos[0] - H0.tee[0]) < 2.7, `on the first tee: ${g.v.partier(1).pos}`);
  for (let k = 0; k < 200; k++) g.step();
  assert.equal(g.v.partier(1).pos[1], PLAT_Y);
  assert.deepEqual([m(g, 1).hole, m(g, 1).begun], [0, true]);
  g.step([[L.EV_INPUT, 1, W({ yaw: 4096, hop: 1 })]]);
  for (let k = 0; k < 30; k++) g.step([[L.EV_INPUT, 1, W({ yaw: 4096, hop: 1 })]]);
  g.step([[L.EV_INPUT, 1, W({ yaw: 4096 })]]);
  assert.equal(m(g, 1).strokes, 1);
  // the clock
  g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 3, true);
  for (let k = 0; k < 5; k++) g.step();
  assert.equal(g.v.hole().state, L.H_OVER);
  assert.ok(g.v.partier(0).place >= 1 && g.v.partier(1).place >= 1);
});

// Rounds of AI golfers (client/party-bot.mjs, this brain), as tools/genparty.mjs plays them.
for (const [balls, seed] of [[8, 8], [64, 64]]) {
  test(`a round of ${balls} AI golfers on the debug build: no trap, holes sunk round the course in about par, the round over, placed by strokes; equal on 1 and 4 threads`, async (t) => {
    const st = { start: -1, over: -1, sinks: 0, picks: 0, strokes: [], places: null, scores: null, totals: null, pts: null };
    let seen = 0;
    const { log, sim, view, ticks } = await playParty({ bytes: partyBytes(true), mg: L.MG_MINIGOLF, seed, bots: balls, ticks: 23000, delay: 8, untilRoundOver: true, onTick: (tk, s, v) => {
      assert.equal(s.error().code, 0, 'no trap');
      for (; seen < v.fxCount(); seen++) {
        const x = v.fx(seen);
        if (x.kind === MC.PT_FX_SINK) { st.sinks++; st.strokes.push(x.shot); }
        if (x.kind === MC.PT_FX_PICK) { st.picks++; st.strokes.push(x.shot); }
      }
      const r = v.party();
      if (st.start < 0 && r.state === L.H_PLAY) st.start = tk;
      if (st.over < 0 && st.start >= 0 && r.state === L.H_OVER) {
        st.over = tk;
        const all = [...Array(balls).keys()].map((p) => v.partier(p));
        st.places = all.map((b) => b.place);
        st.scores = all.map((b) => b.score);
        st.totals = all.map((b) => golfer(b.m).total);
        st.pts = all.map((b) => b.pts);
      }
    } });
    assert.equal(sim.error().code, 0);
    assert.ok(st.over > 0, 'the round ended');
    const c = course(view, true);
    const per = st.strokes.reduce((a, b) => a + b, 0) / st.strokes.length;
    t.diagnostic(`${c.nh} holes, par ${c.pars}: ${st.sinks} sunk, ${st.picks} picked up, ${per.toFixed(2)} strokes a hole, over in ${((st.over - st.start) * 0.008).toFixed(1)} s`);
    assert.ok(st.sinks >= balls * c.nh * 0.6, `${st.sinks} holes sunk`);
    assert.ok(per > 1.5 && per < 4, `${per} a hole`);
    assert.ok(st.picks <= st.sinks * 0.1, `${st.picks} picked up`);
    st.scores.forEach((s, p) => assert.equal(st.places[p], 1 + st.scores.filter((o) => o > s).length, 'placed by score'));
    st.totals.forEach((s, p) => { if (view.partier(p).out) assert.ok(st.totals.every((o, q) => !view.partier(q).out || o >= s || st.places[q] < st.places[p]), 'fewer strokes, a better place'); });
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

test('the client module: draws the course at every phase, frames it, its HUD and FX; its mirror rolls a putt where the sim does; its brain lines a putt up and lets it go', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  assert.deepEqual([MC.PT_FX_PUTT, MC.PT_FX_SINK, MC.PT_FX_PICK, MC.PT_FX_HOME], [0, 1, 2, 3].map((k) => L.FX_MG + 4 * L.MG_MINIGOLF + k));
  assert.ok(golfMg.hint.length <= 70 && golfMg.rules.length <= 70);
  assert.equal(golfMg.id, L.MG_MINIGOLF);
  assert.equal(f(MC.PT_VK), f(MC.PT_VMAX / MC.PT_CH));
  assert.ok(Math.abs(MC.PT_RADT - (2 * Math.PI * 125) / 16384) < 1e-6 && Math.abs(MC.PT_GSTILL - (MC.PT_FRIC_DT / MC.PT_SLOPEG_DT)) < 1e-6);
  const g = await six(2, { play: false });
  const out = () => ({ scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null });
  const check = (o) => {
    assert.ok(o.scene.count > 100, `${o.scene.count} solids`);
    for (let k = 0; k < o.scene.count * 16; k++) assert.ok(Number.isFinite(o.scene.data[k]), 'finite');
    for (const d of o.decals) assert.ok(d.pos.every(Number.isFinite) && d.radius > 0);
  };
  let o = out();
  golfMg.draw(g.v, { tick: g.v.tick, dt: 0, now: 0, slot: 0 }, o);
  check(o);
  while (g.v.hole().state !== L.H_PLAY) g.step();
  for (let k = 0; k <= MC.PT_WALK; k++) g.step();
  for (let k = 0; k < 20; k++) g.step([[L.EV_INPUT, 0, W({ yaw: 4096, hop: 1 })]]);
  o = out();
  const me = g.v.partier(0);
  golfMg.draw(g.v, { tick: g.v.tick, dt: 0.004, ptick: g.v.tick, now: 1000, slot: 0, me, pme: me }, o);
  check(o);
  assert.ok(o.decals.length >= 7 + 2 * 6, 'the cups and the aim');
  const lines = [];
  golfMg.hud(g.v, { put: (x, y, s, c) => lines.push([y, s]), centre: (y, s) => lines.push([y, s]), right: (y, s) => lines.push([y, s]), rect() {}, rows: 44, C: {}, slot: 0, me, now: 0 });
  const text = lines.map((l) => l[1]).join(' | ');
  assert.ok(/HOLE 1 OF 6 {2}PAR \d {2}STROKE 1/.test(text) && /POWER #+-+/.test(text) && /1ST OF 2/.test(text), text);
  for (const l of lines) assert.ok(l[1].length <= 80);
  const fr = golfMg.frame(g.v);
  assert.equal(fr.shape, 'square');
  assert.ok(fr.radius >= 6 * MC.PT_PITCH / 2);
  const said = [];
  golfMg.fx({ kind: MC.PT_FX_SINK, owner: 0, shot: 1, size: 0, pos: [0, 0, 0] }, { slot: 0, view: g.v, banner: (s) => said.push(s), feed: (s) => said.push(s), sound: {}, glow() {}, dist: 0 });
  assert.deepEqual(said, ['HOLE IN ONE!']);
  assert.deepEqual([callOf(2, 3), callOf(3, 3), callOf(5, 3), callOf(7, 3)], ['BIRDIE', 'PAR', 'DOUBLE BOGEY', 'PICKED UP']);
  // the mirror against the sim: putts on every hole end within a few cm of where the sim's do
  const c = course(g.v, true);
  for (const H of c.holes) {
    const yaw = yawTo(H.tee[0], H.tee[1], ...sightOf(H, H.tee[0], H.tee[1]));
    put(g, 0, H, H.tee[0], H.tee[1]);
    const t0 = tNow(g) + 100;
    for (let k = 0; k < 99; k++) g.step([[L.EV_INPUT, 0, W({ yaw, hop: 1 })]]);
    g.step([[L.EV_INPUT, 0, W({ yaw })]]);
    assert.equal(tNow(g), t0);
    const v = vel(g, 0);
    const r = simPutt(H, pos(g, 0)[0], pos(g, 0)[2], v[0], v[2], t0);
    roll(g, 1500);
    if (m(g, 0).hole === H.h) assert.ok(Math.hypot(pos(g, 0)[0] - r.x, pos(g, 0)[2] - r.z) < 0.25, `hole ${H.h} (${H.tpl}): sim ${pos(g, 0)} mirror ${r.x}, ${r.z}`);
    else assert.ok(r.sunk, 'both holed');
  }
  // the brain: a putt lined up, Space held, let go on its tick, its yaw toward what it sees
  const H = c.holes[0];
  put(g, 0, H, H.tee[0], H.tee[1]);
  const bot = new Partier(0, 3, 0.9);
  let hop = 0, released = -1;
  for (let k = 0; k < 400 && released < 0; k++) {
    const w = bot.think(g.v, g.v.tick, 0);
    assert.equal((w >>> 24) & 15, 0, 'no keys');
    if ((w >>> 28) & 1) hop++; else if (hop) released = k;
    g.step([[L.EV_INPUT, 0, w]]);
  }
  assert.ok(released > 0 && hop >= MC.PT_CHMIN && m(g, 0).strokes === 1, `held ${hop}, putted`);
  const lineUp = Math.atan2(sightOf(H, H.tee[0], H.tee[1])[1] - H.tee[1], sightOf(H, H.tee[0], H.tee[1])[0] - H.tee[0]);
  const a = Math.atan2(vel(g, 0)[2], vel(g, 0)[0]);
  assert.ok(Math.abs(Math.atan2(Math.sin(a - lineUp), Math.cos(a - lineUp))) < 0.7, 'about its line');
  assert.ok(standings(g.v).length === 2 && field(H).dist.some(Number.isFinite));
});

test('a tick of 256 balls, AI golfers round the course, on the release build', async (t) => {
  const g = await room(256, { debug: false, seed: 5 });
  const bots = Array.from({ length: 256 }, (_, p) => new Partier(p, 5, 0.3 + 0.6 * ((p * 5) % 256) / 256));
  let ms = 0, n = 0, think = 0;
  const f0 = g.v.fxCount();
  for (let k = 0; k < 4000 && g.v.hole().state === L.H_PLAY; k++) {
    const b0 = performance.now();
    const words = bots.map((b) => [L.EV_INPUT, b.slot, b.think(g.v, g.v.tick, 0)]);
    think += performance.now() - b0;
    g.sim.feedPlayers(words);
    const a = performance.now();
    g.sim.x.step();
    if (k >= 500) { ms += performance.now() - a; n++; }
  }
  const sunk = fxs(g.v, MC.PT_FX_SINK, f0).length;
  t.diagnostic(`${(ms / n).toFixed(3)} ms a tick over ${n} ticks, 256 balls (${sunk} holes sunk); the bots ${(think / 4000).toFixed(2)} ms a tick`);
  assert.ok(n >= 3000 && sunk >= 256, `${n} ticks timed, ${sunk} sunk`);
  assert.ok(ms / n < 2, `${(ms / n).toFixed(3)} ms`);
});
