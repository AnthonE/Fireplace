// SOCCER (src/mg/soccer.wat): the pitch, its goals and the footballs for 1
// to 256 balls, the walls, the chamfers, the posts and the nets for a ball,
// a touch from a roll, a chip from a hop, a keeper's and a save, the
// football off the walls, the frame and the nets and the client's flight
// the same bits through it all, a goal and an own goal, the kickoff (one
// football: everyone back; more: only that one), footballs off each other,
// the end and its places, a newcomer in play, the prediction bit for bit
// through the kickoff, the client and its AI, and rounds of AI balls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y, B_RAD } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/soccer.mjs'; // SO_*: the minigame's own constants
import soccer, { pitch, footballs, slotOf, fly, spot, place, dir } from '../client/mg/soccer.mjs';

const C = L.B_CX;
const TICK = 0.008;
const f = Math.fround;
const area = (n) => MC.SO_A0 + MC.SO_AK * Math.min(n, MC.SO_NK) + MC.SO_AK2 * Math.max(0, n - MC.SO_NK);
const nfoot = (n) => Math.min(MC.SO_NMAX, Math.max(MC.SO_NMIN, Math.ceil(n / MC.SO_PER)));
const RS = B_RAD + MC.SO_R;

// A room of n balls on Soccer, on the debug build (a NaN traps), stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7 } = {}) {
  const sim = await newParty(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_SOCCER + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
const teams = (g, n) => { const s = Array.from({ length: n }, (_, p) => g.v.partier(p).side); return [0, 1].map((x) => s.map((y, p) => [y, p]).filter(([y]) => y === x).map(([, p]) => p)); };
// Ball p at (x, z) from the pitch's centre, on the floor (or y over it, in the air rising vy), rolling at (vx, vz).
function put(g, p, x, z, { vx = 0, vz = 0, y = 0, vy = 0 } = {}) {
  g.dv.setFloat32(rec(p) + L.P_PX, C + x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, PLAT_Y + y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, C + z, true);
  g.dv.setFloat32(rec(p) + L.P_VX, vx, true);
  g.dv.setFloat32(rec(p) + L.P_VY, vy, true);
  g.dv.setFloat32(rec(p) + L.P_VZ, vz, true);
  g.dv.setUint8(rec(p) + L.P_FL, (g.dv.getUint8(rec(p) + L.P_FL) & L.PF_BLUE) | L.PF_LIVE | (y > 0 ? 0 : L.PF_GROUND));
}
const FA = (k) => L.PG_S + MC.SO_BALL + k * MC.SO_FSIZE;
const ball = (g, k) => footballs(g.v).find((b) => b.k === k) || null;
// Football k set: by default live, untouched, at (x, y, z) from the centre, still.
function setF(g, k, { st = MC.SO_LIVE, by = 255, last = [255, 255], next = 1e6, x = 0, y = MC.SO_R, z = 0, vx = 0, vy = 0, vz = 0 }) {
  const a = FA(k), dv = g.dv;
  dv.setUint8(a + MC.SO_FST, st);
  dv.setUint8(a + MC.SO_FBY, by);
  dv.setUint8(a + MC.SO_FLAST, last[0]);
  dv.setUint8(a + MC.SO_FLAST + 1, last[1]);
  dv.setInt32(a + MC.SO_FNEXT, next, true);
  [x, y, z, vx, vy, vz].forEach((val, i) => dv.setFloat32(a + MC.SO_FX + 4 * i, val, true));
}
// Every football out of play for ever (gone, never back), so a test has only its own.
const clear = (g) => { for (let k = 0; k < MC.SO_NMAX; k++) { g.dv.setUint8(FA(k) + MC.SO_FST, MC.SO_GONE_ST); g.dv.setInt32(FA(k) + MC.SO_FNEXT, 1e6, true); } };
const playT = (g) => g.v.party().t;
const fxs = (v, from, kind) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
const local = (g, p) => { const b = g.v.partier(p); return { x: b.pos[0] - C, y: b.pos[1] - PLAT_Y, z: b.pos[2] - C, vx: b.vel[0], vy: b.vel[1], vz: b.vel[2], ground: b.ground }; };
// A room of n with no footballs in play, each side's balls in a row near its own goal line's corner, still.
async function stage(n, opts) {
  const g = await room(n, opts);
  clear(g);
  const c = pitch(g.v);
  const [red, blue] = teams(g, n);
  red.forEach((p, i) => put(g, p, -c.hx + 6 + (i % 4) * 2.5, -c.hz + 1.5 + Math.floor(i / 4) * 2.5));
  blue.forEach((p, i) => put(g, p, c.hx - 6 - (i % 4) * 2.5, -c.hz + 1.5 + Math.floor(i / 4) * 2.5));
  return { g, c, red, blue };
}

test('the pitch for 1, 8, 64 and 256: sized for the crowd, half as long again as wide, its goals, boxes and corners; a football for every 16 on its spot, held; each side in a grid on its own half', async () => {
  let last = 0;
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party();
    const c = pitch(g.v);
    assert.equal(r.game, L.MG_SOCCER);
    assert.deepEqual([r.kind, r.len, r.flags], [L.PK_SCORE, MC.SO_LEN, L.PGF_BUMPS | L.PGF_TEAMS]);
    assert.deepEqual([r.acc, r.idle, r.hop], [f(MC.SO_ACC), f(MC.SO_IDLE), f(MC.SO_HOP)]);
    assert.ok(Math.abs(4 * c.hx * c.hz - area(n)) < 0.05 && Math.abs(c.hx / c.hz - MC.SO_ASP) < 1e-4 && c.hx > last, `${2 * c.hx} by ${2 * c.hz} m for ${n}`);
    last = c.hx;
    assert.equal(r.size, f(c.hx + MC.SO_GD));
    assert.ok(Math.abs(c.gw - Math.min(MC.SO_GWMAX, Math.max(MC.SO_GWMIN, 2 * MC.SO_GWK * c.hz))) < 1e-4);
    assert.ok(c.cn > 0 && c.cn <= MC.SO_CORN && c.hz - c.cn - c.gw >= 2 - 1e-4, 'the chamfers clear of the mouths');
    assert.ok(c.boxd >= MC.SO_BOXMIN && c.boxd <= MC.SO_BOXMAX && c.boxhw > c.gw && c.boxhw < c.hz);
    assert.equal(c.nb, nfoot(n));
    assert.equal(c.goal, MC.SO_GOAL0 + (nfoot(n) - 1) * MC.SO_GOALK);
    const list = footballs(g.v);
    assert.equal(list.length, nfoot(n), `${list.length} footballs for ${n}`);
    list.forEach((b, k) => {
      assert.deepEqual([b.st, b.by, b.last, b.next, b.x, b.y, b.vx, b.vy, b.vz], [MC.SO_HELD, 255, [255, 255], 0, 0, f(MC.SO_R), 0, 0, 0]);
      assert.equal(b.z, spot(c, k)[1]);
      assert.ok(Math.abs(b.z) < c.hz * 0.8);
      if (k) assert.ok(b.z - list[k - 1].z > 2 * MC.SO_R + 1, 'apart along the halfway line');
    });
    assert.deepEqual(r.tn, [Math.ceil(n / 2), Math.floor(n / 2)]);
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p);
      assert.equal(b.pos[1], PLAT_Y);
      const deep = (b.pos[0] - C) * dir(b.side);
      assert.ok(deep >= MC.SO_X0 && deep <= c.hx - 2, `${n}: P${p + 1} on its own half, ${deep} m back`);
      assert.ok(Math.abs(b.pos[2] - C) <= c.hz - B_RAD, `${n}: P${p + 1} inside the walls`);
      assert.ok(Math.hypot(b.pos[0] - C, b.pos[2] - C) > MC.SO_CIRC, 'outside the centre circle');
    }
    // play starts: every football let go where it is
    while (g.v.hole().state !== L.H_PLAY) g.step();
    g.step();
    assert.ok(footballs(g.v).every((b) => b.st === MC.SO_LIVE && b.x === 0 && b.vx === 0), 'live, still on its spot');
  }
});

test('a ball and the walls: off the side wall, the end wall beside the mouth and a chamfer softly; into a goal\'s box through its mouth, its nets and its roof holding it; round a post', async () => {
  const { g, c, red } = await stage(2);
  const p = red[0];
  const run = (word, k = 1) => { for (let i = 0; i < k; i++) g.step([[L.EV_INPUT, p, word]]); };
  // the side wall
  put(g, p, 0, c.hz - 1.3, { vz: 8 });
  run(partyWord({ yaw: 4096, move: 1 }), 80);
  let b = local(g, p);
  assert.ok(b.z <= c.hz - B_RAD + 1e-4 && b.z > c.hz - B_RAD - 0.5, `against the side wall: ${b.z}`);
  // the end wall beside the mouth (red rolling into blue's end, +x)
  put(g, p, c.hx - 1.3, c.gw + 2.5, { vx: 8 });
  run(partyWord({ yaw: 0, move: 1 }), 80);
  b = local(g, p);
  assert.ok(b.x <= c.hx - B_RAD + 1e-4 && b.x > c.hx - B_RAD - 0.5, `against the end wall: ${b.x}`);
  // a chamfer: rolling into the corner it comes off it, never into the cut
  put(g, p, c.hx - 3, c.hz - 3, { vx: 6, vz: 6 });
  for (let k = 0; k < 120; k++) {
    run(partyWord({ yaw: 2048, move: 1 }));
    b = local(g, p);
    assert.ok(Math.abs(b.x) + Math.abs(b.z) <= c.hx + c.hz - c.cn - B_RAD * Math.SQRT2 + 1e-3, `inside the chamfer: ${b.x}, ${b.z}`);
  }
  // into the mouth and the box: held by its back net, its side nets and its roof
  put(g, p, c.hx - 3, 0.5, { vx: 9 });
  let deepest = 0;
  for (let k = 0; k < 200; k++) {
    run(partyWord({ yaw: k < 100 ? 0 : 3000, move: 1, hop: k % 40 === 20 ? 1 : 0 }));
    b = local(g, p);
    deepest = Math.max(deepest, b.x);
    assert.ok(b.x <= c.hx + MC.SO_GD - B_RAD + 1e-4, 'the back net');
    if (b.x > c.hx) assert.ok(Math.abs(b.z) <= c.gw - B_RAD + 1e-4 && b.y + 2 * B_RAD <= MC.SO_GH + 1e-4, `the side net and the roof: ${b.z}, ${b.y}`);
  }
  assert.ok(deepest > c.hx + MC.SO_GD - B_RAD - 0.05, `into the box: ${deepest - c.hx} m`);
  // round a post: a ball rolling along the goal line at the post comes off it
  put(g, p, c.hx - B_RAD - 0.2, c.gw + 3, { vz: -7 });
  for (let k = 0; k < 60; k++) {
    run(partyWord({ yaw: 12288, move: 1 }));
    b = local(g, p);
    assert.ok(Math.hypot(b.x - c.hx, Math.abs(b.z) - c.gw) >= B_RAD + MC.SO_FR - 1e-3, 'never in the post');
  }
});

test('a touch: a ball rolling into a football puts it out to touching and sends it on, 1 + SO_E of the closing speed turned toward the roll, faster the faster it hits; a standing one shoves it SO_KMIN; the ball itself never moved; a point once a SO_RECOUNT', async () => {
  const { g, red } = await stage(4);
  const p = red[0];
  const speeds = [];
  for (const [vx, vz] of [[4, 0], [8, 1], [5, 4]]) {
    clear(g);
    put(g, p, -5, 0, { vx, vz });
    setF(g, 0, { x: -5 + RS - 0.05, z: 0.3 });
    // the same tick with no football: the ball's own roll
    const save = g.sim.u8.slice(0, 0x100000);
    g.dv.setUint8(FA(0) + MC.SO_FST, MC.SO_GONE_ST);
    g.step();
    const alone = g.sim.u8.slice(rec(p), rec(p) + L.PSIZE);
    g.sim.u8.set(save);
    const from = g.v.fxCount(), score0 = g.v.partier(p).score;
    g.step();
    const me = local(g, p), b = ball(g, 0);
    assert.deepEqual([...g.sim.u8.slice(rec(p), rec(p) + L.PG_SCORE)], [...alone.slice(0, L.PG_SCORE)], 'the ball rolled as if it were not there');
    const dx = b.x - me.x, dz = b.z - me.z, dy = b.y - (me.y + B_RAD);
    assert.ok(Math.abs(Math.hypot(dx, dy, dz) - RS) < 1e-3, `out to touching: ${Math.hypot(dx, dy, dz)}`);
    const nx = dx / Math.hypot(dx, dz), nz = dz / Math.hypot(dx, dz);
    const sp = Math.hypot(me.vx, me.vz);
    let kx = nx + MC.SO_AIM * me.vx / sp, kz = nz + MC.SO_AIM * me.vz / sp;
    const kl = Math.hypot(kx, kz);
    kx /= kl; kz /= kl;
    const bn = me.vx * nx + me.vz * nz, imp = (1 + MC.SO_E) * bn;
    let wx = imp * kx, wz = imp * kz;
    const sep = wx * nx + wz * nz - bn;
    if (sep < MC.SO_KMIN) { wx += (MC.SO_KMIN - sep) * nx; wz += (MC.SO_KMIN - sep) * nz; }
    assert.ok(Math.abs(b.vx - wx) < 1e-3 && Math.abs(b.vz - wz) < 1e-3, `${[b.vx, b.vz]} for ${[wx, wz]}`);
    assert.equal(b.vy, 0, 'rolling: not up');
    assert.deepEqual([b.by, b.last[0]], [p, p]);
    speeds.push(Math.hypot(b.vx, b.vz));
    const [t] = fxs(g.v, from, MC.SO_FX_TOUCH);
    assert.deepEqual([t.owner, t.shot], [p, 0]);
    assert.equal(g.v.partier(p).score, score0 + (speeds.length === 1 ? MC.SO_PT_TOUCH : 0), 'a point, once a SO_RECOUNT');
  }
  assert.ok(speeds[1] > speeds[0], 'harder the faster');
  // standing: shoved off at SO_KMIN
  clear(g);
  for (let k = 0; k < MC.SO_RECOUNT; k++) g.step();
  put(g, p, -5, 0);
  setF(g, 0, { x: -5 + RS - 0.2, z: 0 });
  const s0 = g.v.partier(p).score;
  g.step();
  const b = ball(g, 0);
  assert.ok(Math.abs(b.vx - MC.SO_KMIN) < 1e-4 && b.vz === 0, `a nudge: ${b.vx}`);
  assert.equal(g.v.partier(p).score, s0 + 1);
  assert.equal(slotOf(g.v, p).touches, 2);
});

test('a chip: a ball in the air sends it up at least SO_CHIP0 plus SO_CHIPK of its speed and on at 1 + SO_AIRE; the client\'s fly flies it on the same bits to the floor', async () => {
  const { g, c, red } = await stage(4);
  const p = red[0];
  for (const vx of [3, 9]) {
    clear(g);
    put(g, p, -6, 0, { vx, y: 0.4, vy: 2 });
    setF(g, 0, { x: -6 + RS + 0.02, y: B_RAD + 0.4 });
    g.step();
    const me = local(g, p), b = ball(g, 0);
    assert.ok(!me.ground);
    const sp = Math.hypot(me.vx, me.vz);
    assert.ok(Math.abs(b.vy - Math.min(MC.SO_CHIPMAX, MC.SO_CHIP0 + MC.SO_CHIPK * sp)) < 1e-4, `up ${b.vy}`);
    const on = Math.max((1 + MC.SO_AIRE) * me.vx, me.vx + MC.SO_KMIN);
    assert.ok(Math.abs(b.vx - on) < 0.03 * on, `on ${b.vx} for ${on}`);
    const from = g.v.fxCount();
    let x = { ...b };
    for (let k = 0; k < 200; k++) {
      g.step();
      x = fly(x, c, 1);
      const y = ball(g, 0);
      assert.deepEqual([x.x, x.y, x.z, x.vx, x.vy, x.vz], [y.x, y.y, y.z, y.vx, y.vy, y.vz], `${k + 1} ticks on, the same bits`);
    }
    assert.ok(fxs(g.v, from, MC.SO_FX_TOUCH).length === 0, 'away from the ball, untouched');
  }
  assert.ok(fxs(g.v, 0, MC.SO_FX_TOUCH).some((t) => t.shot & 256), 'marked from the air');
});

test('a keeper: a ball in its own box sends it off harder, SO_KEEPMIN and SO_KEEPUP at least; on one coming at its goal\'s mouth it\'s a save, SO_PT_SAVE; outside its box, the same touch is an ordinary one', async () => {
  const { g, c, red } = await stage(4);
  const p = red[0];
  const x0 = -c.hx + 3; // in red's own box
  put(g, p, x0, 0);
  setF(g, 0, { x: x0 + RS - 0.05, z: 0.4, vx: -6 });
  const from = g.v.fxCount(), s0 = g.v.partier(p).score;
  g.step();
  let b = ball(g, 0);
  assert.ok(b.vx > 0 && Math.hypot(b.vx, b.vz) >= MC.SO_KEEPMIN - 1e-3 && b.vy >= MC.SO_KEEPUP - 1e-4, `cleared: ${[b.vx, b.vy, b.vz]}`);
  const [t] = fxs(g.v, from, MC.SO_FX_TOUCH);
  assert.equal(t.shot & (512 | 1024), 512 | 1024, 'a keeper\'s, a save');
  assert.equal(g.v.partier(p).score, s0 + MC.SO_PT_TOUCH + MC.SO_PT_SAVE);
  assert.equal(slotOf(g.v, p).saves, 1);
  // the same at the halfway line: no keeper, no save
  clear(g);
  for (let k = 0; k < MC.SO_RECOUNT; k++) g.step();
  put(g, p, -4, 0);
  setF(g, 0, { x: -4 + RS - 0.05, z: 0.4, vx: -6 });
  const f2 = g.v.fxCount();
  g.step();
  b = ball(g, 0);
  assert.ok(b.vx < MC.SO_KEEPMIN && b.vy === 0, `an ordinary touch: ${[b.vx, b.vy]}`);
  assert.equal(fxs(g.v, f2, MC.SO_FX_TOUCH)[0].shot & (512 | 1024), 0);
});

test('off the walls, the chamfers, the frame and the nets: a football comes back off a side wall, a corner\'s cut, the end wall, a post and the crossbar, and in a box off its nets and roof; the client\'s fly the same bits through it all, to rest', async () => {
  const { g, c } = await stage(2);
  for (const p of [0, 1]) put(g, p, -c.hx + 3, -c.hz + 2 + 3 * p);
  const cases = [
    { name: 'side wall', x: 0, y: 2, z: c.hz - 3, vx: 3, vy: 2, vz: 12 },
    { name: 'chamfer', x: c.hx - 4, y: MC.SO_R, z: c.hz - 4, vx: 9, vz: 9 },
    { name: 'end wall', x: c.hx - 4, y: 1.5, z: c.gw + 2, vx: 14, vy: 1 },
    { name: 'over the bar', x: c.hx - 5, y: MC.SO_GH + 1.5, z: 0, vx: 10, vy: 1 },
    { name: 'post', x: c.hx - 4, y: 1.2, z: c.gw + 0.2, vx: 11, vy: 0.5, vz: 0.4 },
    { name: 'crossbar', x: c.hx - 4, y: MC.SO_GH + 0.3, z: 1, vx: 11, vy: 1.4 },
    { name: 'roof', x: -c.hx + 0.5, y: 1.2, z: 0.5, vx: -9, vy: 9, vz: 2 },
  ];
  for (const s of cases) {
    clear(g);
    setF(g, 0, { ...s });
    const from = g.v.fxCount();
    let x = { ...ball(g, 0) }, hit = false;
    for (let k = 0; k < 2000 && x.goal === undefined && (k < 300 || Math.hypot(x.vx, x.vy, x.vz) > 0.4); k++) {
      g.step();
      x = fly(x, c, 1);
      const y = ball(g, 0);
      if (x.goal !== undefined) { assert.equal(y.st, MC.SO_GONE_ST, `${s.name}: a goal where fly says`); break; }
      assert.deepEqual([x.x, x.y, x.z, x.vx, x.vy, x.vz], [y.x, y.y, y.z, y.vx, y.vy, y.vz], `${s.name}: ${k + 1} ticks on, the same bits`);
      assert.ok(Math.abs(y.z) <= c.hz - MC.SO_R + 1e-4 && Math.abs(y.x) <= c.hx + MC.SO_GD - MC.SO_R + 1e-4, `${s.name}: inside`);
      if (Math.abs(y.x) > c.hx) assert.ok(Math.abs(y.z) <= c.gw - MC.SO_R + 1e-4 && y.y <= MC.SO_GH - MC.SO_R + 1e-4, `${s.name}: in the box, under its roof`);
      hit ||= fxs(g.v, from, MC.SO_FX_HIT).length > 0;
    }
    if (s.name !== 'roof') assert.ok(hit, `${s.name}: knocked against it`);
    if (s.name === 'post' || s.name === 'crossbar') assert.ok(fxs(g.v, from, MC.SO_FX_HIT).some((h) => h.shot & 256), `${s.name}: the frame`);
    if (s.name === 'roof') assert.equal(x.goal, 1, 'in under the roof: blue\'s goal');
    else if (s.name !== 'post' && s.name !== 'crossbar') assert.ok(x.goal === undefined && x.vy === 0 && Math.hypot(x.vx, x.vz) < 0.5, `${s.name}: at rest`);
  }
});

test('a goal: a football past the line by its radius is the other side\'s, SO_PT_GOAL to its last toucher of that side; gone SO_GONE, then on its spot held SO_HOLD, then live; an own goal is nobody\'s', async () => {
  const { g, c, red, blue } = await stage(4);
  const [p, q] = [red[0], blue[0]];
  setF(g, 0, { x: c.hx + MC.SO_R - 0.01, y: MC.SO_R, z: 0.5, vx: 6, by: q, last: [p, q] });
  g.dv.setUint32(FA(0) + MC.SO_FSAT, playT(g) - 100, true);
  const from = g.v.fxCount();
  g.step();
  const t = playT(g) - 1;
  assert.deepEqual(g.v.party().tscore, [1, 0], 'into blue\'s goal: red\'s');
  assert.deepEqual([g.v.partier(p).score, slotOf(g.v, p).goals, slotOf(g.v, q).own], [MC.SO_PT_GOAL, 1, 0], 'red\'s last toucher scores; blue only touched it after');
  const [gl] = fxs(g.v, from, MC.SO_FX_GOAL);
  assert.deepEqual([gl.owner, gl.shot, gl.size], [p, 0, 1]);
  let b = ball(g, 0);
  assert.deepEqual([b.st, b.next], [MC.SO_GONE_ST, t + MC.SO_GONE]);
  while (ball(g, 0).st === MC.SO_GONE_ST) g.step();
  b = ball(g, 0);
  assert.deepEqual([b.st, b.x, b.z, b.next, playT(g) - 1], [MC.SO_HELD, 0, spot(c, 0)[1], t + MC.SO_GONE + MC.SO_HOLD, t + MC.SO_GONE]);
  const [sp] = fxs(g.v, from, MC.SO_FX_SPOT);
  assert.equal(sp.shot, 256, 'one football: everyone\'s kickoff');
  // a ball on its spot while it's held doesn't touch it
  put(g, q, 0.5, spot(c, 0)[1] - 1);
  g.step();
  assert.equal(ball(g, 0).by, 255);
  while (ball(g, 0).st === MC.SO_HELD) g.step();
  assert.equal(playT(g) - 1, t + MC.SO_GONE + MC.SO_HOLD, 'let go on time');
  // an own goal: blue put it in its own net, red not near it in SO_OWNT
  setF(g, 0, { x: c.hx + MC.SO_R - 0.01, z: -1, vx: 4, by: q, last: [p, q] });
  g.dv.setUint32(FA(0) + MC.SO_FSAT, playT(g) - MC.SO_OWNT - 1, true);
  const f2 = g.v.fxCount();
  g.step();
  assert.deepEqual(g.v.party().tscore, [2, 0]);
  const [own] = fxs(g.v, f2, MC.SO_FX_GOAL);
  assert.deepEqual([own.owner, own.shot & 512, slotOf(g.v, q).own, slotOf(g.v, p).goals], [q, 512, 1, 1], 'an own goal, nobody\'s point');
});

test('the kickoff: with one football everyone is put on its own half in its side\'s grid SO_GONE after a goal and held there still SO_HOLD; with more, nobody is moved', async () => {
  const { g, c, red, blue } = await stage(6);
  put(g, red[0], c.hx - 3, 2, { vx: 5 });
  put(g, blue[1], -c.hx + 4, -3, { vz: 3 });
  setF(g, 0, { x: -c.hx - MC.SO_R - 0.01, z: 0, vx: -3, by: blue[0], last: [255, blue[0]] });
  g.step();
  const t = playT(g) - 1;
  assert.deepEqual(g.v.party().tscore, [0, 1]);
  const h = pitch(g.v);
  assert.deepEqual([h.ko, h.kogo, h.tn], [t + MC.SO_GONE, t + MC.SO_GONE + MC.SO_HOLD, [3, 3]]);
  assert.deepEqual(red.map((p) => g.v.partier(p).m), [0, 1, 2], 'each ball\'s rank among its side');
  while (playT(g) <= h.ko) g.step([[L.EV_INPUT, red[0], partyWord({ yaw: 0, move: 1, hop: 1 })]]);
  const at = [...red, ...blue].map((p) => g.v.partier(p).pos);
  for (const [i, p] of [...red, ...blue].entries()) {
    const b = g.v.partier(p), [x, z] = place(c, b.side, b.m, 3);
    assert.ok(Math.abs(b.pos[0] - x) < 1e-3 && Math.abs(b.pos[2] - z) < 1e-3 && b.pos[1] === PLAT_Y, `P${p + 1} on its place`);
    assert.ok((b.pos[0] - C) * dir(b.side) > 0, 'its own half');
    void i;
  }
  for (let k = 0; k < MC.SO_HOLD - 3; k++) g.step([[L.EV_INPUT, red[0], partyWord({ yaw: k * 300, move: 1, hop: k & 1 })]]);
  [...red, ...blue].forEach((p, i) => assert.deepEqual(g.v.partier(p).pos, at[i], `P${p + 1} held`));
  for (let k = 0; k < 60; k++) g.step([[L.EV_INPUT, red[0], partyWord({ yaw: 0, move: 1 })]]);
  assert.ok(g.v.partier(red[0]).pos[0] > at[0][0] + 0.5, 'and let go');
  // two footballs (17 balls): a goal moves nobody
  const w = await stage(17);
  const c2 = pitch(w.g.v);
  assert.equal(c2.nb, 2);
  setF(w.g, 1, { x: c2.hx + MC.SO_R - 0.01, vx: 3 });
  w.g.step();
  const at2 = Array.from({ length: 17 }, (_, p) => w.g.v.partier(p).pos);
  for (let k = 0; k < MC.SO_GONE + 10; k++) w.g.step();
  assert.deepEqual(Array.from({ length: 17 }, (_, p) => w.g.v.partier(p).pos), at2, 'nobody moved');
  assert.equal(pitch(w.g.v).ko, 0);
  const b = ball(w.g, 1);
  assert.deepEqual([b.st, b.z], [MC.SO_HELD, spot(c2, 1)[1]]);
  assert.equal(fxs(w.g.v, 0, MC.SO_FX_SPOT).at(-1).shot, 1, 'only that one back');
});

test('footballs off each other: two that meet are put apart and swap SO_BBE of the speed they close at', async () => {
  const { g } = await stage(40);
  setF(g, 0, { x: -2, z: 0, vx: 6 });
  setF(g, 1, { x: -2 + 2 * MC.SO_R + 0.02, z: 0.3, vx: -2 });
  for (let k = 0; k < 6; k++) g.step();
  const a = ball(g, 0), b = ball(g, 1);
  assert.ok(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) >= 2 * MC.SO_R - 1e-3, 'apart');
  assert.ok(a.vx < 6 * 0.5 && b.vx > 0, `off each other: ${a.vx}, ${b.vx}`);
  assert.ok(Math.abs(a.vx + b.vx - 4 * MC.SO_ROLL ** 6) < 0.3, 'about their speed between them');
});

test('the end: the first side to the target wins, every ball of it 1st and the rest by their own score; at the clock the side with more, or a draw placed by score', async () => {
  const { g, c, red, blue } = await stage(6);
  g.dv.setUint32(L.PG_TSCORE, c.goal - 1, true);
  g.dv.setUint16(rec(blue[0]) + L.PG_SCORE, 5, true);
  g.dv.setUint16(rec(blue[1]) + L.PG_SCORE, 2, true);
  setF(g, 0, { x: c.hx + MC.SO_R - 0.01, vx: 3, last: [red[0], 255] });
  g.step();
  const r = g.v.party();
  assert.equal(r.state, L.H_OVER);
  assert.deepEqual([r.tscore[0], r.twin], [c.goal, 1]);
  assert.deepEqual([...red, ...blue].map((p) => g.v.partier(p).place), [1, 1, 1, 4, 5, 6]);
  assert.deepEqual([...red, ...blue].map((p) => g.v.partier(p).wins), [1, 1, 1, 0, 0, 0]);
  const t = await stage(4, { seed: 9 });
  t.g.dv.setBigUint64(L.PG_TSCORE, (2n << 32n) | 2n, true);
  t.g.dv.setUint16(rec(t.blue[1]) + L.PG_SCORE, 4, true);
  t.g.dv.setUint32(L.HDR_UNTIL, t.g.v.tick + 1, true);
  t.g.step();
  t.g.step();
  assert.equal(t.g.v.party().twin, 3);
  assert.equal(t.g.v.partier(t.blue[1]).place, 1);
  assert.equal(t.g.v.partier(t.red[0]).place, 2);
});

test('a newcomer in play goes to the smaller side and falls in in front of its own goal; a ball alone scores on its own', async () => {
  const { g, c } = await stage(3);
  assert.deepEqual(g.v.party().tn, [2, 1]);
  g.step([[L.EV_JOIN, 3]]);
  const b = g.v.partier(3);
  assert.equal(b.side, 1);
  assert.ok(!b.out && b.pos[1] > PLAT_Y + 5, 'falling in');
  assert.ok(Math.abs(b.pos[0] - (C + c.hx - 2.5)) < 1e-4 && Math.abs(b.pos[2] - C) < c.gw);
  for (let k = 0; k < 200; k++) g.step();
  assert.ok(g.v.partier(3).ground);
  // alone, an AI ball runs it into the other goal
  const one = await room(1);
  const bot = new Partier(0, 3, 0.8);
  for (let k = 0; k < 2500 && one.v.party().tscore[0] < 2; k++) one.step([[L.EV_INPUT, 0, bot.think(one.v, one.v.tick, 0)]]);
  assert.ok(one.v.party().tscore[0] >= 2, `alone it scores: ${one.v.party().tscore}`);
});

test('the prediction matches the confirmed ball bit for bit: the walls, the chamfers, a post, a goal\'s box and its roof, hops, and the kickoff called and held; through its own touches, every byte but its point of its own', async () => {
  const { g, c } = await stage(4);
  const s = g.v.partier(0).side, tn = -dir(s);
  put(g, 0, tn * (c.hx - 4), c.gw - 0.6);
  const toGoal = s ? 8192 : 0;
  const words = Array.from({ length: 260 }, (_, k) => partyWord({ yaw: (toGoal + (k < 120 ? 0 : k * 157)) & 16383, move: k % 50 < 44 ? 1 : 0, hop: k % 37 === 5 ? 1 : 0 }));
  assert.ok(predicted(g, words) >= words.length);
  // a goal not yet confirmed: the kickoff it calls is past anything the prediction reaches (PRED_MAX ticks)
  put(g, 0, 0, c.hz - 3);
  setF(g, 0, { x: -tn * (c.hx + MC.SO_R - 0.05), vx: -tn * 3, last: [255, 255] });
  const far = Array.from({ length: L.PRED_MAX }, (_, k) => partyWord({ yaw: (k * 97) & 16383, move: 1, hop: k % 50 === 0 ? 1 : 0 }));
  for (let i = 0; i < far.length; i++) g.dv.setUint32(L.PWORDS + 4 * i, far[i], true);
  g.sim.x.predict(0, far.length);
  const ahead = g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE);
  const save = g.sim.u8.slice(0, 0x100000);
  for (const w of far) g.step([[L.EV_INPUT, 0, w]]);
  assert.ok(pitch(g.v).ko > 0, 'the goal called a kickoff');
  const conf = g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE);
  for (let b = 0; b < L.PSIZE; b++) if (b < L.PG_M || b >= L.PG_M + 4) assert.equal(ahead[b], conf[b], `${L.PRED_MAX} ahead, byte ${b}`);
  g.sim.u8.set(save);
  // a goal at the other end calls the kickoff: the prediction holds the ball on its place as the confirmed world does
  put(g, 0, 0, c.hz - 3);
  setF(g, 0, { x: -tn * (c.hx + MC.SO_R - 0.01), vx: -tn * 2, last: [255, 255] });
  const run = Array.from({ length: 420 }, (_, k) => partyWord({ yaw: (k * 211) & 16383, move: 1, hop: k % 45 === 0 ? 1 : 0 }));
  assert.ok(predicted(g, run) >= run.length);
  assert.ok(pitch(g.v).kogo > 0 && playT(g) > pitch(g.v).kogo, 'through a kickoff and out');
  // through its own touches, 30 ticks ahead: every byte of the record but PG_SCORE (confirmed only)
  let touches = 0;
  for (let k = 0; k < 120; k++) {
    if (k % 20 === 0) { const p = local(g, 0); setF(g, 0, { x: p.x + 2.2, z: p.z, vx: -3 }); }
    for (let i = 0; i < 30; i++) g.dv.setUint32(L.PWORDS + 4 * i, words[k + i], true);
    g.sim.x.predict(0, 30);
    const pred = g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE);
    const save = g.sim.u8.slice(0, 0x100000), f0 = g.v.fxCount();
    for (let i = 0; i < 30; i++) g.step([[L.EV_INPUT, 0, words[k + i]]]);
    touches += fxs(g.v, f0, MC.SO_FX_TOUCH).filter((x) => x.owner === 0).length;
    const conf = g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE);
    for (let b = 0; b < L.PSIZE; b++) if (b !== L.PG_SCORE && b !== L.PG_SCORE + 1) assert.equal(pred[b], conf[b], `byte ${b}, ${k}`);
    g.sim.u8.set(save);
    g.step([[L.EV_INPUT, 0, words[k]]]);
  }
  assert.ok(touches >= 10, `${touches} touches`);
});

test('the client: the pitch, the goals, the footballs flown on and turning, a landing ring, a held one\'s pulse; its HUD and feed; the AI chaser gets behind it and shoots, the keeper keeps between it and the goal, the rest spread', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const { g, c, red, blue } = await stage(16);
  setF(g, 0, { x: 3, y: 4, z: 1, vx: 4, vy: 2 });
  g.step();
  const out = () => ({ scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null });
  const o = out();
  const g0 = g.v.party();
  soccer.draw(g.v, { tick: g0.tick, t: g0.t * TICK, dt: 0, ptick: g0.tick + 6, now: 0, slot: red[0], pme: g.v.partier(red[0]), own: g.v.partier(red[0]).pos }, o);
  for (let k = 0; k < o.scene.count * 16; k++) assert.ok(Number.isFinite(o.scene.data[k]), 'finite');
  assert.ok(o.scene.count > 60, `the pitch, its walls, the goals, the football: ${o.scene.count}`);
  assert.equal(o.decals.filter((d) => d.kind === 0 && d.radius < 2).length, 1, 'where it comes down');
  assert.equal(o.casters.length, 1);
  const lines = [];
  const hctx = { put: () => {}, centre: (y, s) => lines.push(s), right: (y, s) => lines.push(s), rect: () => {}, rows: 44, C: {}, slot: red[1], now: 0, t: g0.t * TICK };
  soccer.hud(g.v, hctx);
  assert.ok(lines.includes(`FIRST TO ${c.goal}`) && lines.some((l) => l.startsWith('TOUCHES')), lines.join(' | '));
  for (const l of [...lines, soccer.hint, soccer.rules, 'BACK TO YOUR OWN HALF FOR THE KICKOFF']) assert.ok(l.length <= 70 && /^[ -_]*$/.test(l), l);
  assert.equal(soccer.frame(g.v).shape, 'square');
  assert.deepEqual([soccer.facing(g.v, red[0]), soccer.facing(g.v, blue[0])], [0, Math.PI]);
  const fctx = { slot: red[0], view: g.v, glow: () => {}, banner: () => {}, feed: (s) => lines.push(s), name: (q) => `P${q + 1}`, dist: 0 };
  soccer.fx({ kind: MC.SO_FX_GOAL, owner: red[2], shot: 0, pos: [C, PLAT_Y, C], size: 3 }, fctx);
  assert.equal(lines.at(-1), `RED SCORES 3  P${red[2] + 1}`);
  soccer.fx({ kind: MC.SO_FX_GOAL, owner: blue[1], shot: 512, pos: [C, PLAT_Y, C], size: 1 }, fctx);
  assert.equal(lines.at(-1), `RED SCORES 1  AN OWN GOAL  P${blue[1] + 1}`);
  // the brain on a live football: one chaser (and a second) a side, the rest spread over the pitch
  clear(g);
  setF(g, 0, { x: -c.hx * 0.6, z: 2 });
  g.step();
  const jobs = new Map();
  for (const p of [...red, ...blue]) {
    const me = g.v.partier(p);
    const think = soccer.brain.think(g.v, me, { slot: p, skill: 0.8, mem: {}, pos: [me.pos[0], me.pos[2]], vel: [me.vel[0], me.vel[2]] }, g.v.tick);
    const goal = soccer.brain.goal(g.v, me);
    jobs.set(p, think ? 'plays' : goal ? 'home' : '?');
  }
  assert.ok(red.filter((p) => jobs.get(p) === 'plays').length >= 2, 'red: a chaser, a second and a keeper, in its own third');
  assert.ok(blue.filter((p) => jobs.get(p) === 'home').length >= 5, 'blue: the rest home');
  const homes = blue.filter((p) => jobs.get(p) === 'home').map((p) => soccer.brain.goal(g.v, g.v.partier(p)));
  for (let i = 0; i < homes.length; i++) for (let j = i + 1; j < homes.length; j++) assert.ok(Math.hypot(homes[i][0] - homes[j][0], homes[i][1] - homes[j][1]) > 3, 'spread out');
  // a red chaser against a blue keeper (blue's chaser standing still, nearer it): it gets to the football and puts it past him, or he gets to it
  const k2 = await stage(6, { seed: 4 });
  const hx = k2.c.hx, [att] = k2.red, [kp, idle] = k2.blue;
  for (const p of [...k2.red, ...k2.blue]) if (p !== att && p !== kp) put(k2.g, p, -hx + 3, k2.c.hz - 2 - p * 2.2);
  put(k2.g, att, hx * 0.3, -4);
  put(k2.g, idle, hx * 0.55 + 2, 5);
  put(k2.g, kp, hx - 1.6, 0);
  setF(k2.g, 0, { x: hx * 0.55, z: 1 });
  const bots = [new Partier(att, 5, 0.9), new Partier(kp, 6, 0.4)];
  const from = k2.g.v.fxCount();
  let kept = false;
  for (let k = 0; k < 1500 && !fxs(k2.g.v, from, MC.SO_FX_GOAL).length; k++) {
    k2.g.step(bots.map((b) => [L.EV_INPUT, b.slot, b.think(k2.g.v, k2.g.v.tick, 0)]));
    const kx = local(k2.g, kp);
    if (ball(k2.g, 0).x > hx * 0.4) kept ||= Math.abs(kx.z) < k2.c.gw && kx.x > hx - 4;
  }
  assert.ok(fxs(k2.g.v, from, MC.SO_FX_TOUCH).some((t) => t.owner === att), 'the chaser played it');
  assert.ok(kept, 'the keeper kept to its goal mouth');
  assert.ok(fxs(k2.g.v, from, MC.SO_FX_GOAL).length === 1 || fxs(k2.g.v, from, MC.SO_FX_TOUCH).some((t) => t.owner === kp), 'a goal, or the keeper got to it');
});

// A round of AI balls (client/party-bot.mjs) steered by this minigame's brain on the debug build, stats from it.
async function aiRound(balls, ticks, seed) {
  const stats = { start: -1, over: -1, touches: [0, 0], chips: 0, saves: 0, goals: [0, 0], own: 0, places: null, twin: 0 };
  let seen = 0;
  const r = await playParty({ bytes: partyBytes(true), mg: L.MG_SOCCER, bots: balls, ticks, seed, onTick: (t, sim, v) => {
    const g = v.party();
    for (; seen < v.fxCount(); seen++) {
      const x = v.fx(seen);
      if (stats.over >= 0 || stats.start < 0) continue;
      if (x.kind === MC.SO_FX_TOUCH) { stats.touches[v.partier(x.owner).side]++; if (x.shot & 256) stats.chips++; if (x.shot & 1024) stats.saves++; }
      if (x.kind === MC.SO_FX_GOAL) { stats.goals[(x.shot >> 8) & 1]++; if (x.shot & 512) stats.own++; }
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

for (const [balls, ticks, seed] of [[8, 16200, 5], [64, 16200, 4]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, touched, chipped and scored to the target or the clock; equal on 1 and 4 threads`, async () => {
    const { log, sim, stats, games } = await aiRound(balls, ticks, seed);
    assert.equal(sim.error().code, 0);
    assert.ok(games.every((x) => x === L.MG_SOCCER));
    assert.ok(stats.over > 0, 'the round ended');
    const secs = (stats.over - stats.start) * TICK;
    assert.ok(secs > 20 && secs <= MC.SO_LEN * TICK + 0.01, `${secs.toFixed(1)} s of play`);
    assert.ok(stats.touches[0] >= 2 * balls && stats.touches[1] >= 2 * balls && stats.chips >= 4, `touches ${stats.touches}, ${stats.chips} chips`);
    assert.ok(stats.goals[0] + stats.goals[1] >= 3, `goals ${stats.goals}, ${stats.own} own`);
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
