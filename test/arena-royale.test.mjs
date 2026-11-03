import test from 'node:test';
import assert from 'node:assert/strict';
import { arenaBytes } from './helpers.mjs';
import { View, forcedSeed } from '../src/arena-view.mjs';
import { playArena } from '../tools/genarena.mjs';
import { replay, parseLog, decodeTrace, newMemory, instantiate, Sim } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { compileMap } from '../tools/map.mjs';
import { packMap } from '../tools/map-compile.mjs';
import * as L from '../src/layout.mjs';
import * as AC from '../src/am/consts.mjs';
import ry, { circlesOf, scheduleOf, zoneAt, royaleOf, cratesOf, useful, bare, playedOf, lootName, CRATE } from '../client/am/royale.mjs';
import { AMC } from '../client/am/index.mjs';
import { C } from '../client/font.mjs';

// BATTLE ROYALE (src/am/royale.wat): one life each, crates for guns, a zone
// closing in stages. Helpers as test/arena-evade.test.mjs has them; the
// circles, the wall and the crates read straight from AO (its fields in
// src/am/royale.mjs). The tick a step's hooks ran at is the header's tick
// less one (playedOf).

let debugModule = null;
async function room(n = 2, { seed = 7, play = true, map = null } = {}) {
  debugModule ||= await WebAssembly.compile(arenaBytes(true));
  const memory = newMemory();
  const sim = new Sim(await instantiate(debugModule, memory), memory);
  if (map) sim.loadMap(map);
  sim.init(forcedSeed(L.M_ROYALE, seed));
  const v = new View(sim.memory.buffer);
  const dv = new DataView(sim.memory.buffer);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); };
  const g = { sim, v, dv, step, n };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  if (!play) return g;
  while (v.hole().state !== L.H_PLAY) step();
  return g;
}

const rec = (p) => L.PLAYERS + p * L.PSIZE;
const mr = (p) => L.MODE_REC + p * L.MR_SIZE;
const u32 = (g, a) => g.dv.getUint32(a, true);
const f32 = (g, a) => g.dv.getFloat32(a, true);
const steps = (g, n) => { for (let i = 0; i < n; i++) g.step(); };
const across = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const played = (g) => playedOf(g.v.hole());
// Moves the match on so the next step's hooks run at `t` ticks of play (its clock as long as it was).
function skipTo(g, t) {
  const by = t - 1 - played(g);
  g.dv.setUint32(L.HDR_START, u32(g, L.HDR_START) - by, true);
  g.dv.setUint32(L.HDR_UNTIL, u32(g, L.HDR_UNTIL) - by, true);
}
const at = (g) => scheduleOf(g.v);
const wall = (g) => ({ x: f32(g, L.AO + AC.RY_WX), z: f32(g, L.AO + AC.RY_WZ), r: f32(g, L.AO + AC.RY_WR) });

function put(g, p, x, z, y = g.v.stand(x, z, g.v.height(x, z) + 0.6)) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  for (const o of [L.P_VX, L.P_VY, L.P_VZ]) g.dv.setFloat32(rec(p) + o, 0, true);
  g.sim.u8[rec(p) + L.P_FL] |= L.PF_GROUND;
}
// Whether a body with its feet at f overlaps a box of the map.
const inBox = (map, f) => map.boxes.some((b) => f[0] + 0.5 > b.box[0] && f[0] - 0.5 < b.box[3] && f[2] + 0.5 > b.box[2] && f[2] - 0.5 < b.box[5] && f[1] + 1.8 > b.box[1] + 1e-4 && f[1] + 0.05 < b.box[4]);
// A clear spot on open ground near (x, z): searched outward.
function clear(g, x, z) {
  for (let d = 0; d < 40; d += 1) for (let k = 0; k < 16; k++) {
    const px = x + d * Math.cos(k * Math.PI / 8), pz = z + d * Math.sin(k * Math.PI / 8);
    const y = g.v.stand(px, pz, g.v.height(px, pz) + 0.6);
    if (!inBox(g.v.map(), [px, y, pz])) return [px, y, pz];
  }
  throw new Error('no clear spot');
}
const setHp = (g, p, hp, sh = 0) => { g.sim.u8[rec(p) + L.A_HP] = hp; g.sim.u8[rec(p) + L.A_SH] = sh; };
const hp = (g, p) => g.sim.u8[rec(p) + L.A_HP];
const sh = (g, p) => g.sim.u8[rec(p) + L.A_SH];
// Crate j set by hand: at feet (x, y, z), holding what, shut.
function setCrate(g, j, [x, y, z], what) {
  const a = L.AO + AC.RY_CRATES + j * AC.RY_CSIZE;
  g.dv.setFloat32(a, x, true); g.dv.setFloat32(a + 4, y, true); g.dv.setFloat32(a + 8, z, true);
  g.sim.u8[a + 12] = what; g.sim.u8[a + 13] = 0;
  if (u32(g, L.AO + AC.RY_N) <= j) g.dv.setUint32(L.AO + AC.RY_N, j + 1, true);
}
// Every crate opened (so none is in the way of a test's own).
const shutNone = (g) => { for (let j = 0; j < u32(g, L.AO + AC.RY_N); j++) g.sim.u8[L.AO + AC.RY_CRATES + j * AC.RY_CSIZE + 13] = 1; };

function fxs(v, kind, size, from = 0) {
  const outs = [];
  for (let k = Math.max(from, v.fxCount() - L.FX_MAX); k < v.fxCount(); k++) {
    const f = v.fx(k);
    if (f.kind === kind && (size === undefined || f.size === size)) outs.push(f);
  }
  return outs;
}
// the mode's news from `from` on: [what, owner, shot]
const news = (g, from) => fxs(g.v, L.FX_MODE, undefined, from).filter((f) => f.size >= AC.RY_MX_OUT && f.size <= AC.RY_MX_END).map((f) => [f.size, f.owner, f.shot]);

test('Battle Royale: on the kit with no sides, last in the rotation; nothing of it in the countdown; as play starts the circles, each inside the last and the bounds; 2, 16 and 256 fighters spread over Box Canyon, each clear of every box; the crates; a magnum in each hand with a magazine to spare, no frags', async () => {
  assert.equal(L.M_ROYALE, 16);
  assert.ok((L.KIT >> L.M_ROYALE) & 1 && !((L.TEAMED >> L.M_ROYALE) & 1) && !((L.TEAM_MODES >> L.M_ROYALE) & 1) && (L.PAD_MODES >> L.M_ROYALE) & 1);
  assert.deepEqual([L.MODES[L.M_ROYALE].name, L.MODES[L.M_ROYALE].ticks, L.ARENA_MODES.at(-1)], ['BATTLE ROYALE', 48750, L.M_ROYALE]);
  assert.equal(L.AM.find((m) => m.mode === L.M_ROYALE).prefix, 'ry');
  assert.equal(L.AM.filter((m) => m.prefix === 'ry').length, 1);
  assert.equal(AC.RY_MX_OUT, L.MX_AM + 8 * L.AM.findIndex((m) => m.mode === L.M_ROYALE));
  assert.equal(AC.RY_ODDS.reduce((a, b) => a + b), AC.RY_ODDS_SUM);
  assert.equal(AC.RY_ODDS.length, AC.RY_LOOT.length);
  assert.ok(!AC.RY_LOOT.includes(AC.RY_GUN), 'no crate holds the starter');
  assert.equal(AC.RY_SIZE.length, AC.RY_STAGES + 1);
  assert.equal(AC.RY_SCHED.length, 2 * AC.RY_STAGES);
  assert.ok(AC.RY_SCHED.every((t, k) => k === 0 || t > AC.RY_SCHED[k - 1]) && AC.RY_SCHED.at(-1) < L.MODE_TICKS[L.M_ROYALE]);
  assert.ok(AC.RY_CRATES + AC.RY_MAX * AC.RY_CSIZE <= L.AO_SIZE && AC.RY_C + 16 * (AC.RY_STAGES + 1) <= AC.RY_CRATES);
  assert.equal(AMC[L.M_ROYALE], ry);

  const cd = await room(2, { play: false });
  while (cd.v.hole().state !== L.H_PLAY) {
    assert.ok(cd.sim.u8.slice(L.AO, L.AO + L.AO_SIZE).every((x) => x === 0), 'the countdown');
    cd.step();
  }
  const [x0, x1, z0, z1] = cd.v.map().bounds;
  for (const n of [2, 16, 256]) {
    const g = n === 2 ? cd : await room(n);
    const v = g.v;
    const cs = circlesOf(v);
    const hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
    assert.ok(Math.abs(cs[0].x - (x0 + hx)) < 1e-3 && Math.abs(cs[0].z - (z0 + hz)) < 1e-3 && Math.abs(cs[0].r - Math.hypot(hx, hz) - 3) < 1e-3, 'circle 0 round the bounds');
    for (let k = 1; k <= AC.RY_STAGES; k++) {
      assert.ok(Math.abs(cs[k].r - cs[0].r * AC.RY_SIZE[k] / 1024) < 1e-2, `circle ${k}'s size`);
      assert.ok(Math.hypot(cs[k].x - cs[k - 1].x, cs[k].z - cs[k - 1].z) + cs[k].r <= cs[k - 1].r + 1e-3, `circle ${k} inside ${k - 1}`);
      assert.ok(cs[k].x - Math.min(cs[k].r, hx) >= x0 - 1e-3 && cs[k].x + Math.min(cs[k].r, hx) <= x1 + 1e-3 && cs[k].z - Math.min(cs[k].r, hz) >= z0 - 1e-3, `circle ${k} in the bounds`);
    }
    assert.equal(cs[AC.RY_STAGES].r, 0, 'the last closes to nothing');
    const fs = Array.from({ length: n }, (_, p) => v.fighter(p));
    for (const f of fs) {
      assert.ok(f.live && !f.dead && f.team === -1);
      assert.ok(f.pos[0] >= x0 + 2.9 && f.pos[0] <= x1 - 2.9 && f.pos[2] >= z0 + 2.9 && f.pos[2] <= z1 - 2.9, `P${f.slot} in the bounds`);
      assert.ok(!inBox(v.map(), f.pos), `P${f.slot} clear of the boxes`);
      assert.ok(f.pos[1] >= v.height(f.pos[0], f.pos[2]) - 1e-3);
      assert.deepEqual([f.gun, f.mag, f.res, f.grens, f.sh, f.hp], [[L.W_MAGNUM, L.W_MAGNUM], [8, 8], [AC.RY_RES, AC.RY_RES], 0, 100, 100]);
    }
    // spread: each fighter's nearest a good way off (a sunflower's spiral over the bounds' ellipse)
    const nearest = fs.map((f) => Math.min(...fs.filter((o) => o !== f).map((o) => across(o.pos, f.pos))));
    const mean = nearest.reduce((a, b) => a + b) / n;
    assert.ok(Math.min(...nearest) > 1.5, `${n}: nobody on top of another (${Math.min(...nearest).toFixed(1)} m)`);
    assert.ok(mean > (n === 256 ? 6 : n === 16 ? 25 : 60), `${n}: spread (${mean.toFixed(1)} m to the nearest on average)`);
    const e = royaleOf(v);
    assert.deepEqual([e.stand, e.out, e.end, e.stage, e.closing, e.hit], [n, 0, 0, 0, 0, AC.RY_DMG[0]]);
    assert.equal(e.crates, Math.min(AC.RY_MAX, AC.RY_CRATE0 + Math.floor(n / AC.RY_CRATE_PER)));
    const crates = cratesOf(v);
    for (const c of crates) {
      assert.ok(AC.RY_LOOT.includes(c.what) && !c.open);
      for (const o of crates) if (o !== c) assert.ok(across(o.pos, c.pos) >= 4 - 1e-3 || Math.abs(o.pos[1] - c.pos[1]) >= 2, 'crates apart');
    }
    // the first: the flags' stands and the skull's spot (and the hills past them)
    v.map().flags.concat([v.map().ball]).forEach((s, k) => assert.ok(across(crates[k].pos, [s[0], 0, s[1]]) < 1e-3, `on spot ${k}`));
    assert.ok(v.pads().length > 0, 'the map\'s pads');
    assert.deepEqual(news(g, 0).filter((x) => x[0] === AC.RY_MX_SHOW), [[AC.RY_MX_SHOW, 255, 1]]);
  }
});

test('Battle Royale on a map laid at run time (maps/lifts: its own bounds, a void under its pit, moving platforms): circle 0 round its bounds, 16 fighters spread clear of its boxes and over its void, crates on its floors', async () => {
  const map = packMap(compileMap('maps/lifts'));
  const g = await room(16, { map });
  const v = g.v, m = v.map();
  const [x0, x1, z0, z1] = m.bounds;
  assert.deepEqual(m.bounds, [452, 572, 452, 524]);
  const cs = circlesOf(v);
  assert.ok(Math.abs(cs[0].x - 512) < 1e-3 && Math.abs(cs[0].z - 488) < 1e-3 && Math.abs(cs[0].r - Math.hypot(60, 36) - 3) < 1e-3);
  const vd = g.dv.getFloat32(L.MAP_VOID, true);
  assert.ok(vd > 0);
  for (let p = 0; p < 16; p++) {
    const f = v.fighter(p);
    assert.ok(f.pos[0] > x0 && f.pos[0] < x1 && f.pos[2] > z0 && f.pos[2] < z1);
    assert.ok(f.pos[1] >= vd + 1, `P${p} over the void (${f.pos[1].toFixed(1)})`);
  }
  for (const c of cratesOf(v)) assert.ok(c.pos[1] >= vd + 1);
  // and it plays: 600 ticks, nobody falls
  steps(g, 600);
  assert.equal(royaleOf(v).stand, 16);
});

test('loot: walking into a crate opens it if of use: a gun in place of the starter in the hand held, then in the other; one more gun not taken; ammo for one carried; an overshield, health, frags while short; counted, news; a fighter out drops its gun as a crate where it fell', async () => {
  const g = await room(3);
  shutNone(g);
  const v = g.v;
  const [ax, ay, az] = clear(g, 512, 512);
  put(g, 0, ax, az, ay);
  put(g, 1, ax + 20, az, v.stand(ax + 20, az, v.height(ax + 20, az) + 0.6));
  put(g, 2, ax - 20, az, v.stand(ax - 20, az, v.height(ax - 20, az) + 0.6));
  const n0 = u32(g, L.AO + AC.RY_N);
  const open = (j) => !!g.sim.u8[L.AO + AC.RY_CRATES + j * AC.RY_CSIZE + 13];
  // a shotgun under P0's feet: in its hand (the one held), and the crate shut no more
  const k0 = g.v.fxCount();
  setCrate(g, 0, [ax + 0.5, ay, az], L.W_SHOTGUN);
  g.step();
  const f0 = v.fighter(0);
  assert.equal(open(0), true);
  assert.equal(f0.gun[f0.hand], L.W_SHOTGUN);
  assert.equal(f0.gun[f0.hand ^ 1], L.W_MAGNUM);
  assert.deepEqual([f0.mag[f0.hand], f0.res[f0.hand]], [L.ARMS[L.W_SHOTGUN].mag, L.ARMS[L.W_SHOTGUN].res]);
  assert.equal(g.dv.getUint16(mr(0) + L.MR_AUX, true), 1);
  assert.deepEqual(news(g, k0), [[AC.RY_MX_LOOT, 0, L.W_SHOTGUN]]);
  // a rifle 1.1 m off: in place of the magnum in the other hand
  setCrate(g, 1, [ax + 1.1, ay, az], L.W_AR);
  g.step();
  assert.deepEqual(v.fighter(0).gun.slice().sort(), [L.W_AR, L.W_SHOTGUN].sort());
  // 1.3 m off: out of reach; a sniper rifle with both hands full: stays shut
  setCrate(g, 2, [ax + 1.3, ay, az], L.W_PLASMA);
  setCrate(g, 3, [ax, ay, az + 0.3], L.W_SNIPER);
  steps(g, 3);
  assert.deepEqual([open(2), open(3)], [false, false]);
  assert.equal(useful(v.fighter(0), L.W_SNIPER), false);
  // ammo for the shotgun once it's short; none while full
  const s = v.fighter(0).gun.indexOf(L.W_SHOTGUN);
  g.sim.u8[rec(0) + L.A_MAG + s] = 1;
  assert.equal(useful(v.fighter(0), L.W_SHOTGUN), true);
  setCrate(g, 4, [ax, ay, az - 0.3], L.W_SHOTGUN);
  g.step();
  assert.equal(open(4), true);
  assert.equal(g.sim.u8[rec(0) + L.A_MAG + s], L.ARMS[L.W_SHOTGUN].mag);
  setCrate(g, 5, [ax, ay, az - 0.3], L.W_SHOTGUN);
  g.step();
  assert.equal(open(5), false, 'full: no use');
  g.sim.u8[L.AO + AC.RY_CRATES + 5 * AC.RY_CSIZE + 13] = 1;
  // the overshield while under it; health while either is short; frags while under 4
  setHp(g, 0, 60, 30);
  setCrate(g, 6, [ax, ay, az], AC.RY_R_HEAL);
  g.step();
  assert.deepEqual([open(6), hp(g, 0), sh(g, 0)], [true, 100, 100]);
  setCrate(g, 7, [ax, ay, az], AC.RY_R_HEAL);
  g.step();
  assert.equal(open(7), false, 'healthy: no use');
  g.sim.u8[L.AO + AC.RY_CRATES + 7 * AC.RY_CSIZE + 13] = 1;
  setCrate(g, 8, [ax, ay, az], AC.RY_R_OVER);
  g.step();
  assert.deepEqual([open(8), sh(g, 0)], [true, L.OVERSHIELD]);
  setCrate(g, 9, [ax, ay, az], AC.RY_R_FRAGS);
  setCrate(g, 10, [ax, ay, az + 0.2], AC.RY_R_FRAGS);
  setCrate(g, 11, [ax, ay, az - 0.2], AC.RY_R_FRAGS);
  g.step();
  assert.deepEqual([open(9), open(10), open(11), v.fighter(0).grens], [true, true, false, 4], 'two crates of two, the third no use');
  assert.equal(g.dv.getUint16(mr(0) + L.MR_AUX, true), 7);
  assert.equal(u32(g, L.AO + AC.RY_OPENED), 7);
  // the map's pads hand out their guns (the arena's own pickup)
  assert.ok(v.pads().some((p) => !p.wait));
  // P0 out by the zone: its gun in hand dropped where it fell, in the first crate opened
  const hand = v.fighter(0).gun[v.fighter(0).hand];
  setHp(g, 0, 1, 0);
  skipTo(g, at(g)[11] + 125);
  g.step();
  assert.ok(v.fighter(0).dead);
  const c = cratesOf(v)[0];
  assert.deepEqual([c.what, c.open], [hand, false]);
  assert.ok(across(c.pos, v.fighter(0).pos) < 1e-3);
  assert.equal(u32(g, L.AO + AC.RY_N), Math.max(n0, 12), 'no crate more');
  // a fighter with the starter alone drops nothing
  setHp(g, 1, 1, 0);
  const before = cratesOf(v);
  skipTo(g, at(g)[11] + 250);
  g.step();
  assert.ok(v.fighter(1).dead);
  assert.deepEqual(cratesOf(v), before);
});

test('the zone: circle 1 shown as play starts, a warning RY_WARN before each close, the close, the wall moving in on the tick, the next circle shown; hits once a second outside (on it too), shields first, the shields\' wait held, RY_DMG by stage and RY_DMG_END once closed; nothing inside', async () => {
  const g = await room(3);
  shutNone(g);
  const v = g.v;
  const cs = circlesOf(v), sc = at(g);
  // P0 by circle 6's middle (inside them all but the last), P1 and P2 in the bounds' corners farthest from circle 1
  const mid = clear(g, cs[AC.RY_STAGES].x, cs[AC.RY_STAGES].z);
  assert.ok(Math.hypot(mid[0] - cs[5].x, mid[2] - cs[5].z) < cs[5].r - 1);
  put(g, 0, mid[0], mid[2], mid[1]);
  const [x0, x1, z0, z1] = v.map().bounds;
  const corners = [[x0 + 2, z0 + 2], [x1 - 2, z1 - 2], [x0 + 2, z1 - 2], [x1 - 2, z0 + 2]].sort((a, b) => Math.hypot(b[0] - cs[1].x, b[1] - cs[1].z) - Math.hypot(a[0] - cs[1].x, a[1] - cs[1].z));
  const c1 = clear(g, corners[0][0], corners[0][1]), c2 = clear(g, corners[1][0], corners[1][1]);
  put(g, 1, c1[0], c1[2], c1[1]);
  put(g, 2, c2[0], c2[2], c2[1]);
  assert.ok(Math.hypot(c1[0] - cs[1].x, c1[2] - cs[1].z) > cs[1].r + 5);
  // the wall at circle 0 through the wait: nobody hurt
  steps(g, 400);
  assert.deepEqual([hp(g, 1), sh(g, 1), hp(g, 0), sh(g, 0)], [100, 100, 100, 100]);
  assert.deepEqual(wall(g), { x: cs[0].x, z: cs[0].z, r: cs[0].r });
  // the warning, on its tick
  skipTo(g, sc[0] - AC.RY_WARN - 1);
  let k = g.v.fxCount();
  g.step();
  assert.deepEqual(news(g, k), []);
  g.step();
  assert.deepEqual(news(g, k), [[AC.RY_MX_WARN, 255, 1]]);
  // the close, on its tick: the wall starts moving
  skipTo(g, sc[0] - 1);
  k = g.v.fxCount();
  g.step();
  assert.equal(u32(g, L.AO + AC.RY_CLOSING), 0);
  g.step();
  assert.equal(u32(g, L.AO + AC.RY_CLOSING), 1);
  assert.deepEqual(news(g, k), [[AC.RY_MX_CLOSE, 255, 1]]);
  // halfway: halfway between circles 0 and 1 (in f32, as the sim works it)
  skipTo(g, (sc[0] + sc[1]) / 2);
  g.step();
  const f = Math.fround(((sc[1] - sc[0]) / 2) / (sc[1] - sc[0]));
  const w = wall(g);
  assert.ok(Math.abs(w.r - (cs[0].r + f * (cs[1].r - cs[0].r))) < 1e-3 && Math.abs(w.x - (cs[0].x + f * (cs[1].x - cs[0].x))) < 1e-3);
  assert.deepEqual(zoneAt(v, played(g)).wall, (({ x, z, r }) => ({ x, z, r }))(zoneAt(v, played(g))));
  // hits: P1 outside from here on, at RY_DMG[0] a second, on the second of play; shields first and held
  skipTo(g, sc[1] - 2 * AC.RY_EVERY);
  setHp(g, 1, 100, 100);
  g.dv.setUint16(mr(1) + AC.RY_MR_BURN, 0, true);
  let hits = [];
  for (let i = 0; i < 2 * AC.RY_EVERY; i++) {
    const was = [hp(g, 1), sh(g, 1)];
    g.step();
    if (hp(g, 1) !== was[0] || sh(g, 1) !== was[1]) hits.push([played(g) % AC.RY_EVERY, was[1] - sh(g, 1), was[0] - hp(g, 1)]);
    assert.ok(g.dv.getUint16(rec(1) + L.A_SHT, true) > 0, 'the shields\' wait held');
  }
  assert.deepEqual(hits, [[0, AC.RY_DMG[0], 0], [0, AC.RY_DMG[0], 0]]);
  assert.deepEqual([hp(g, 0), sh(g, 0)], [100, 100], 'inside: nothing');
  // the first close done: circle 2 shown; the wall at circle 1; RY_DMG[1]
  k = g.v.fxCount();
  steps(g, 1);
  assert.deepEqual(news(g, k), [[AC.RY_MX_SHOW, 255, 2]]);
  assert.deepEqual(wall(g), { x: cs[1].x, z: cs[1].z, r: cs[1].r });
  assert.equal(u32(g, L.AO + AC.RY_HIT), AC.RY_DMG[1]);
  setHp(g, 1, 100, 3);
  skipTo(g, sc[1] + 3 * AC.RY_EVERY);
  g.step();
  assert.deepEqual([sh(g, 1), hp(g, 1)], [0, 100 - (AC.RY_DMG[1] - 3)], 'through the shields to the health');
  assert.equal(g.dv.getUint16(mr(1) + AC.RY_MR_BURN, true), 2 * AC.RY_DMG[0] + 2 * AC.RY_DMG[1], 'counted (the tick it was shown on a second too)');
  // each stage: its damage; all closed: RY_DMG_END, even at the middle
  for (let s = 2; s <= AC.RY_STAGES; s++) {
    skipTo(g, sc[2 * s - 1] + 2 * AC.RY_EVERY);
    setHp(g, 2, 100, 100);
    setHp(g, 0, 100, 100);
    g.step();
    const dmg = s < AC.RY_STAGES ? AC.RY_DMG[s] : AC.RY_DMG_END;
    assert.equal(u32(g, L.AO + AC.RY_STAGE), s);
    assert.equal(100 - sh(g, 2), dmg, `stage ${s}`);
    assert.equal(100 - sh(g, 0), s < AC.RY_STAGES ? 0 : dmg, `stage ${s}: the middle`);
  }
  assert.deepEqual(wall(g), { x: cs[AC.RY_STAGES].x, z: cs[AC.RY_STAGES].z, r: 0 });
  assert.ok(AC.RY_DMG.every((d, k) => k === 0 || d > AC.RY_DMG[k - 1]) && AC.RY_DMG_END > AC.RY_DMG.at(-1), 'growing');
});

test('elimination and places: the zone\'s kill is nobody\'s (no kill taken off), out for the match (A_RESPAWN past the clock), news with how many stand; the last standing wins on that tick; the rest by when they went out, then kills; nobody standing; the clock', async () => {
  const g = await room(4);
  shutNone(g);
  const v = g.v;
  g.dv.setUint16(rec(1) + L.A_KILLS, 2, true);
  for (let p = 0; p < 4; p++) setHp(g, p, [30, 30, 80, 100][p], [0, 0, 0, L.OVERSHIELD][p]);
  skipTo(g, at(g)[11] + AC.RY_EVERY);
  const k = g.v.fxCount();
  g.step();
  assert.deepEqual([0, 1, 2, 3].map((p) => v.fighter(p).dead), [true, true, false, false]);
  assert.deepEqual([v.fighter(0).kills, v.fighter(1).kills, v.fighter(0).deaths], [0, 2, 1], 'no kill taken off');
  assert.deepEqual(fxs(v, L.FX_KILL, undefined, k).map((f) => [f.owner, f.shot, f.size]), [[0, 0, AC.RY_KILL_ZONE], [1, 1, AC.RY_KILL_ZONE]]);
  assert.equal(g.dv.getUint16(rec(0) + L.A_RESPAWN, true), 0xffff);
  assert.equal(g.dv.getUint16(mr(0) + AC.RY_MR_OUT, true), played(g) + 1);
  assert.equal(u32(g, L.AO + AC.RY_ZONED), 2);
  // P2 out next second: P3 alone stands in a room of four, and wins
  skipTo(g, at(g)[11] + 2 * AC.RY_EVERY);
  g.step();
  assert.equal(v.hole().state, L.H_OVER);
  assert.deepEqual(news(g, k), [[AC.RY_MX_OUT, 0, 3], [AC.RY_MX_OUT, 1, 2], [AC.RY_MX_OUT, 2, 1], [AC.RY_MX_WIN, 3, 0]]);
  assert.deepEqual([royaleOf(v).end, v.mode().winner], [1, 3]);
  assert.deepEqual([0, 1, 2, 3].map((p) => v.fighter(p).place), [4, 3, 2, 1], 'the winner, then the later out, then kills on a tick');
  // out stays out the rest of the match
  steps(g, 200);
  assert.ok(v.fighter(0).dead);

  // nobody standing: two out on one tick; places by kills, a tie shared
  const n = await room(3);
  shutNone(n);
  g.dv.setUint16(rec(2) + L.A_KILLS, 0, true);
  n.dv.setUint16(rec(2) + L.A_KILLS, 1, true);
  for (let p = 0; p < 3; p++) setHp(n, p, 40);
  skipTo(n, at(n)[11] + AC.RY_EVERY);
  const kn = n.v.fxCount();
  n.step();
  assert.equal(n.v.hole().state, L.H_OVER);
  assert.deepEqual(news(n, kn).at(-1), [AC.RY_MX_END, 255, 0]);
  assert.equal(royaleOf(n.v).end, 2);
  assert.deepEqual([0, 1, 2].map((p) => n.v.fighter(p).place), [2, 2, 1]);

  // the clock: everyone standing, placed by kills
  const c = await room(2);
  c.dv.setUint16(rec(1) + L.A_KILLS, 3, true);
  c.dv.setUint32(L.HDR_UNTIL, c.v.hole().tick, true);
  const kc = c.v.fxCount();
  c.step();
  assert.equal(c.v.hole().state, L.H_OVER);
  assert.deepEqual(news(c, kc).at(-1), [AC.RY_MX_END, 255, 2]);
  assert.equal(royaleOf(c.v).end, 3);
  assert.deepEqual([c.v.fighter(0).place, c.v.fighter(1).place], [2, 1]);
  // alone in a room it goes on: one standing of one is no winner
  const a = await room(1);
  steps(a, 300);
  assert.equal(a.v.hole().state, L.H_PLAY);
});

test('a join mid-match: before the first close it comes in standing inside the next circle with the starter; after it, out and watching (news), placed last, the leave and rejoin of an out fighter out still', async () => {
  const g = await room(3);
  const v = g.v;
  steps(g, 500);
  const k = v.fxCount();
  g.step([[L.EV_JOIN, 5]]);
  const f = v.fighter(5);
  const c1 = circlesOf(v)[1];
  assert.ok(f.live && !f.dead);
  assert.ok(Math.hypot(f.pos[0] - c1.x, f.pos[2] - c1.z) < 0.8 * c1.r + 5.01, 'inside the next circle');
  assert.ok(!inBox(v.map(), f.pos));
  assert.deepEqual([f.gun, f.res, f.grens], [[L.W_MAGNUM, L.W_MAGNUM], [AC.RY_RES, AC.RY_RES], 0]);
  assert.deepEqual(news(g, k), []);
  // the first close begun: a join is out from the start
  skipTo(g, at(g)[0] + 10);
  g.step();
  const k2 = v.fxCount();
  g.step([[L.EV_JOIN, 6]]);
  assert.ok(v.fighter(6).live && v.fighter(6).dead);
  assert.equal(g.dv.getUint16(rec(6) + L.A_RESPAWN, true) > 60000, true);
  assert.equal(v.fighter(6).deaths, 0);
  assert.deepEqual(news(g, k2), [[AC.RY_MX_LATE, 6, 6]]);
  steps(g, 400);
  assert.ok(v.fighter(6).dead, 'still out');
  assert.equal(royaleOf(v).stand, 4);
  assert.equal(royaleOf(v).out, 1);
  // a standing fighter that leaves and comes back now is out too
  g.step([[L.EV_LEAVE, 5]]);
  g.step([[L.EV_JOIN, 5]]);
  assert.ok(v.fighter(5).dead);
  // and the late are placed last
  g.dv.setUint32(L.HDR_UNTIL, v.hole().tick, true);
  g.step();
  assert.equal(v.hole().state, L.H_OVER);
  assert.deepEqual([0, 1, 2, 5, 6].map((p) => v.fighter(p).place), [1, 1, 1, 4, 4]);
});

test('the match ends inside its clock: two fighters who never move are taken by the zone, the last closing to nothing; on Fireplace\'s 90 s clock the schedule comes in with it', async () => {
  for (const [n, clockTo] of [[2, null], [2, 11250]]) {
    const g = await room(n);
    if (clockTo) g.dv.setUint32(L.HDR_UNTIL, u32(g, L.HDR_START) + clockTo, true);
    const clock = u32(g, L.HDR_UNTIL) - u32(g, L.HDR_START);
    const sc = scheduleOf(g.v);
    let over = null;
    for (let t = 0; t < clock + 10 && over === null; t++) {
      g.step();
      if (g.v.hole().state === L.H_OVER) over = t;
    }
    assert.ok(over !== null && over < clock, `${n} over at ${over} of ${clock}`);
    assert.ok([1, 2].includes(royaleOf(g.v).end));
    assert.equal(sc.at(-1), Math.floor(AC.RY_SCHED.at(-1) * clock / L.MODE_TICKS[L.M_ROYALE]));
    assert.ok(over < sc.at(-1) + 8 * 125, 'within 8 s of the last close');
  }
});

test('a Fiesta after a Battle Royale match: its region exactly a Fiesta\'s (the mode header, the circles and crates, the records, the pads)', async () => {
  const g = await room(4);
  steps(g, 300);
  setHp(g, 1, 1);
  skipTo(g, at(g)[11] + AC.RY_EVERY);
  g.step();
  g.dv.setUint32(L.HDR_SEED, 7, true);
  g.dv.setUint32(L.HDR_HOLE, L.ARENA_MODES.length - 1, true);
  g.dv.setUint32(L.HDR_UNTIL, g.v.hole().tick + 1, true);
  steps(g, 4);
  while (g.v.hole().state !== L.H_PLAY) g.step();
  g.step();
  assert.equal(g.v.mode().mode, L.M_FIESTA);
  const zero = (a, b) => g.sim.u8.slice(a, b).every((x) => x === 0);
  assert.ok(zero(L.AH_MODE, L.AH_END), 'the header');
  assert.ok(zero(L.AO, L.AO + L.AO_SIZE), 'the circles and crates');
  assert.ok(zero(L.MODE_REC, L.MODE_REC + L.NPLAYER * L.MR_SIZE), 'the records');
  if (L.FIESTA) assert.ok(zero(L.PAD, L.PAD + L.NPAD * L.PAD_SIZE), 'the pads');
  for (let p = 0; p < 4; p++) {
    const f = g.v.fighter(p);
    assert.ok(!f.dead && f.respawn === 0 && f.sh === 100 && f.gun[0] !== f.gun[1], `P${p} a Fiesta's`);
  }
});

test('Battle Royale\'s client module: the circles, the schedule and the wall as the sim has them on every tick; the crates; HUD lines and the minimap; news; the storm, crates and waypoints drawn; the board; the AI fighter\'s goals', async () => {
  const cd = await room(2, { play: false });
  const lines = (g, slot, extra = {}) => {
    const outs = [];
    ry.hud(g.v, { put: (x, y, s, c) => outs.push([y, s, c]), centre: (y, s, c) => outs.push(['mid', s, c]), right() {}, rect: (...r) => outs.push(['rect', ...r]), rows: 33, C, slot,
      me: g.v.fighter(slot), team: -1, now: 0, t: 1, ...extra });
    return outs;
  };
  assert.deepEqual(lines(cd, 0), [[0, 'ONE LIFE  EVERYONE FOR THEMSELVES', C.YELLOW], [1, 'WALK INTO CRATES FOR GUNS', C.GREY], [2, 'STAY INSIDE THE ZONE', C.GREY]]);
  const gctx = (g, slot) => ({ role: 'attack', rank: 0, view: g.v, ally: () => false, slot, t: g.v.tick });
  assert.equal(ry.goal(cd.v, cd.v.fighter(0), gctx(cd, 0)), null, 'nothing to do before play');

  // the wall: zoneAt on the tick the sim ran, through every stage, to within f32's rounding
  const g = await room(4);
  const v = g.v, sc = at(g);
  const check = () => {
    const z = zoneAt(v, played(g)), w = wall(g);
    assert.ok(Math.abs(z.x - w.x) < 2e-3 && Math.abs(z.z - w.z) < 2e-3 && Math.abs(z.r - w.r) < 2e-3, `the wall at ${played(g)}`);
    assert.equal(z.stage, u32(g, L.AO + AC.RY_STAGE));
    assert.equal(z.closing ? 1 : 0, u32(g, L.AO + AC.RY_CLOSING));
    assert.equal(z.hit, u32(g, L.AO + AC.RY_HIT));
  };
  for (const t of [1, 2, sc[0] - 1, sc[0], sc[0] + 1, ...sc.flatMap((s) => [s - 1, s, s + 333]), sc.at(-1) + 50]) {
    skipTo(g, t);
    g.step();
    check();
  }
  // back to the start of play for the rest
  const h = await room(4);
  shutNone(h);
  const hv = h.v;
  const cs = circlesOf(hv);
  const crates = cratesOf(h.v);
  assert.equal(crates.length, royaleOf(hv).crates);
  // the HUD: alive and kills; when the zone moves; where you are; the minimap
  let l = lines(h, 0);
  const z = zoneAt(hv, played(h));
  const mm = (s) => `${Math.floor(s / 125 / 60)}:${String(Math.floor(s / 125) % 60).padStart(2, '0')}`;
  assert.deepEqual(l[0], [0, '4 ALIVE  0 KILLS', C.YELLOW]);
  assert.deepEqual(l[1], [1, `ZONE MOVES IN ${mm(z.closeIn)}`, C.WHITE]);
  assert.ok(l.filter((x) => x[0] === 'rect').length >= 10, 'the minimap');
  const mid = clear(h, cs[1].x, cs[1].z);
  put(h, 0, mid[0], mid[2], mid[1]);
  h.step();
  assert.deepEqual(lines(h, 0)[2], [2, 'IN THE NEXT CIRCLE', C.GREY]);
  const [x0, , z0] = hv.map().bounds;
  const corner = clear(h, x0 + 3, z0 + 3);
  put(h, 1, corner[0], corner[2], corner[1]);
  h.step();
  const far = Math.hypot(corner[0] - cs[1].x, corner[2] - cs[1].z) - cs[1].r;
  assert.deepEqual(lines(h, 1)[2], [2, `${Math.ceil(far)} M TO THE NEXT CIRCLE`, C.ORANGE]);
  skipTo(h, sc[1] + 10);
  h.step();
  const l2 = lines(h, 1);
  assert.deepEqual([l2[1][1], l2[2][1]], [`ZONE MOVES IN ${mm(sc[2] - played(h))}`, `OUTSIDE THE ZONE  ${AC.RY_DMG[1]} A SECOND`]);
  // news, in the feed and the banners
  const said = [];
  const nctx = (slot) => ({ slot, me: hv.fighter(slot), name: (p) => (p === slot ? 'YOU' : `P${p + 1}`), team: () => -1, feed: (t, c) => said.push(['feed', t, c]),
    banner: (t, c) => said.push(['banner', t, c]), glow: () => said.push(['glow']), sound: null, dist: 10, C, now: 0, view: hv });
  const nf = (size, owner, shot) => ({ tick: 0, kind: L.FX_MODE, owner, shot, pos: [512, 20, 512], size });
  ry.news(nf(AC.RY_MX_OUT, 2, 7), nctx(0));
  ry.news(nf(AC.RY_MX_OUT, 0, 7), nctx(0));
  ry.news(nf(AC.RY_MX_SHOW, 255, 2), nctx(0));
  ry.news(nf(AC.RY_MX_WARN, 255, 2), nctx(0));
  ry.news(nf(AC.RY_MX_CLOSE, 255, 2), nctx(0));
  ry.news(nf(AC.RY_MX_LOOT, 0, L.W_ROCKET), nctx(0));
  ry.news(nf(AC.RY_MX_LATE, 0, 0), nctx(0));
  ry.news(nf(AC.RY_MX_WIN, 3, 4), nctx(0));
  ry.news(nf(AC.RY_MX_END, 255, 0), nctx(0));
  assert.deepEqual(said, [['feed', 'P3 IS OUT  7 LEFT', C.WHITE], ['feed', 'YOU ARE OUT  7 LEFT', C.RED], ['banner', 'YOU ARE OUT  #8', C.RED],
    ['feed', 'THE NEXT CIRCLE IS ON THE MAP', C.CYAN], ['banner', 'NEXT CIRCLE SHOWN', C.CYAN], ['banner', 'THE ZONE MOVES IN 10', C.ORANGE],
    ['feed', 'THE ZONE IS CLOSING IN', C.RED], ['banner', 'THE ZONE IS CLOSING', C.RED], ['glow'], ['banner', 'ROCKET LAUNCHER', C.YELLOW],
    ['banner', 'THE ZONE HAS MOVED  YOU WATCH THIS ONE', C.ORANGE], ['feed', 'P4 IS THE LAST ONE STANDING', C.YELLOW], ['banner', 'P4 WINS', C.YELLOW], ['banner', 'NOBODY STOOD', C.RED]]);
  assert.deepEqual([lootName(AC.RY_R_OVER), lootName(AC.RY_R_HEAL), lootName(AC.RY_R_FRAGS)], ['OVERSHIELD', 'HEALTH', 'FRAGS']);
  // drawn: the storm, a crate for each shut one, LOOT and ZONE waypoints for one bare outside the next circle
  const g2 = await room(3);
  const v2 = g2.v;
  const drawn = (slot) => {
    const out = { solid: [], glow: [], beams: [], markers: [], zone: null, storm: null };
    ry.draw(v2, { dt: 0, now: 0, t: 1, slot, shown: slot, me: v2.fighter(slot), pme: null, cam: [0, 0, 0], view: v2 }, out);
    return out;
  };
  const corner2 = clear(g2, x0 + 3, z0 + 3);
  put(g2, 0, corner2[0], corner2[2], corner2[1]);
  g2.step();
  const o = drawn(0);
  const z2 = zoneAt(v2, played(g2));
  assert.deepEqual(o.storm, { x: z2.x, z: z2.z, r: z2.r, next: circlesOf(v2)[1] });
  assert.equal(o.solid.filter((s) => s.kind === CRATE).length, cratesOf(v2).filter((c) => !c.open).length);
  assert.deepEqual(o.markers.map((m) => m.label), ['ZONE', 'LOOT']);
  // the board: kills, crates, when out; standing first
  assert.deepEqual(ry.cols.map((c) => c.head), ['KILLS', 'CRATES', 'STATUS']);
  assert.equal(ry.cols[2].get(v2.fighter(0)), 'ALIVE');
  assert.ok(ry.standing({ live: true, dead: false, points: 0, kills: 0 }) > ry.standing({ live: true, dead: true, points: 9000, kills: 9 }));
  assert.ok(ry.standing({ live: true, dead: true, points: 9001, kills: 0 }) > ry.standing({ live: true, dead: true, points: 9000, kills: 9 }));
  assert.equal(ry.cols[2].get({ live: true, dead: true, points: 125 * 61 + 1, kills: 0 }), 'OUT 1:01');
  assert.equal(ry.dead({ live: true, dead: true, points: 0 }), 'THE ZONE HAD MOVED  WATCHING');
  // the brain: bare, to the nearest crate of use at a hurry
  const me = v2.fighter(0);
  assert.ok(bare(me));
  const goal = ry.goal(v2, me, gctx(g2, 0));
  const near = cratesOf(v2).filter((c) => !c.open && useful(me, c.what)).sort((a, b) => across(a.pos, me.pos) + 3 * Math.abs(a.pos[1] - me.pos[1]) - across(b.pos, me.pos) - 3 * Math.abs(b.pos[1] - me.pos[1]))[0];
  assert.deepEqual([goal.pos, goal.hurry], [near.pos, 0.6]);
  // armed, nothing near: somewhere inside the next circle, fighting on the way
  g2.sim.u8[rec(0) + L.A_GUN] = L.W_AR; g2.sim.u8[rec(0) + L.A_GUN + 1] = L.W_SHOTGUN;
  shutNone(g2);
  const mid2 = clear(g2, circlesOf(v2)[1].x, circlesOf(v2)[1].z);
  put(g2, 0, mid2[0], mid2[2], mid2[1]);
  const roam = ry.goal(v2, v2.fighter(0), gctx(g2, 0));
  assert.equal(roam.hurry, 0);
  assert.ok(Math.hypot(roam.pos[0] - circlesOf(v2)[1].x, roam.pos[2] - circlesOf(v2)[1].z) < 0.6 * circlesOf(v2)[1].r + 5);
  // outside the next circle with the close too near to walk it: in, shooting on the way
  put(g2, 0, corner2[0], corner2[2], corner2[1]);
  skipTo(g2, at(g2)[0] - 100);
  g2.step();
  const inward = ry.goal(v2, v2.fighter(0), gctx(g2, 0));
  assert.equal(inward.hurry, 0.6);
  assert.ok(Math.hypot(inward.pos[0] - circlesOf(v2)[1].x, inward.pos[2] - circlesOf(v2)[1].z) < Math.hypot(corner2[0] - circlesOf(v2)[1].x, corner2[2] - circlesOf(v2)[1].z));
  // outside the wall: straight in, fighting nobody
  skipTo(g2, at(g2)[1] + 10);
  g2.step();
  assert.equal(ry.goal(v2, v2.fighter(0), gctx(g2, 0)).hurry, 0.95);
  const st = ry.state(v2);
  assert.deepEqual([st.stand, st.stage], [3, 1]);
});

test('Battle Royale with 8 and 16 AI fighters over a whole clock: crates opened, kills, a winner inside it; no trap on the debug build, the same hash on every tick on 1 and 4 threads', async (t) => {
  const [debug, bytes] = [arenaBytes(true), arenaBytes()];
  // a whole match at least: its clock and the countdown's
  const ticks = L.MODE_TICKS[L.M_ROYALE] + 3000;
  for (const bots of [8, 16]) {
    const count = {}, ends = [];
    let k0 = 0, start = -1, zoned = 0, kills = 0;
    const { log } = await playArena({ bytes: debug, seed: forcedSeed(L.M_ROYALE), bots, ticks, leaveAt: 1000,
      onTick: (tick, v) => {
        for (let k = Math.max(k0, v.fxCount() - L.FX_MAX); k < v.fxCount(); k++) {
          const f = v.fx(k);
          if (f.kind === L.FX_MODE) count[f.size] = (count[f.size] || 0) + 1;
          if (f.kind === L.FX_KILL) { if (f.size === AC.RY_KILL_ZONE) zoned++; else if (f.owner !== f.shot) kills++; }
        }
        k0 = v.fxCount();
        const h = v.hole();
        if (h.state === L.H_PLAY && start < 0) start = tick;
        if (h.state === L.H_OVER && start >= 0) { ends.push([tick - start, royaleOf(v).end]); start = -1; }
      } });
    const n = (m) => count[m] || 0;
    t.diagnostic(`${bots} fighters: matches ${ends.map(([d, e]) => `${(d / 125).toFixed(0)} s (end ${e})`).join(', ')}; out ${n(AC.RY_MX_OUT)}, kills ${kills}, by the zone ${zoned}, crates opened ${n(AC.RY_MX_LOOT)}, winners ${n(AC.RY_MX_WIN)}`);
    assert.ok(ends.length >= 1 && ends.every(([d]) => d < L.MODE_TICKS[L.M_ROYALE]), `${bots}: over inside the clock`);
    assert.ok(n(AC.RY_MX_LOOT) >= bots, `${bots}: crates opened`);
    assert.ok(kills >= bots / 2, `${bots}: kills`);
    assert.ok(n(AC.RY_MX_WIN) >= 1, `${bots}: a winner`);
    const parsed = parseLog(log);
    const a = await replay({ bytes, log: parsed, ticks, threads: 1, tag: `ry${bots}x1` });
    const b = await replay({ bytes, log: parsed, ticks, threads: 4, tag: `ry${bots}x4`, startWorkers });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
  }
});
