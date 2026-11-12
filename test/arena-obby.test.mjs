// OBBY (M_OBBY, src/am/obby.wat): an obstacle course over the map's parts,
// on Sky Steps (maps/obby/, tools/obby.mjs). On the kit with no sides, out of
// the rotation, a map's to name; everyone at the start as play begins, with
// empty hands; checkpoints are stages and where a death comes back; the
// finish times a run, and the first home cuts the clock; places by time,
// then stage, then falls; nobody hurts anybody; the client module's lines;
// and AI fighters running the whole course, match after match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newArena, arenaBytes } from './helpers.mjs';
import { View, arenaWord, forcedSeed } from '../src/arena-view.mjs';
import { packMap, MAP_MODES } from '../tools/map-compile.mjs';
import { compileMap, mapDir } from '../tools/map.mjs';
import { playArena } from '../tools/genarena.mjs';
import { obby } from '../tools/obby.mjs';
import { AMC } from '../client/am/index.mjs';
import mod, { stageOf, doneOf, stages, nextPart } from '../client/am/obby.mjs';
import * as L from '../src/layout.mjs';
import * as AC from '../src/am/consts.mjs';

const MAP = compileMap(mapDir('obby')), Z = 488, Y = 30;
// where each stage's checkpoint is, and the finish (tools/obby.mjs)
const CP = { 1: [477.6, Y], 2: [494, Y], 3: [510, Y], 4: [524, Y], 5: [532.5, Y + 3.501], 6: [542, Y + 9.501] }, FINISH = [563, Y + 9.6];

async function course(n = 1, seed = 7) {
  const sim = await newArena(true);
  sim.loadMap(packMap(MAP));
  sim.init(seed);
  const v = new View(sim.memory.buffer), dv = new DataView(sim.memory.buffer);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step, run: (k) => { for (let i = 0; i < k; i++) step(); } };
}
function put(g, p, [x, y], z = Z) {
  const b = L.PLAYERS + p * L.PSIZE;
  g.dv.setFloat32(b + L.P_PX, x, true); g.dv.setFloat32(b + L.P_PY, y, true); g.dv.setFloat32(b + L.P_PZ, z, true);
  for (const o of [L.P_VX, L.P_VY, L.P_VZ]) g.dv.setFloat32(b + o, 0, true);
}
const news = (v, what) => { const out = []; for (let k = 0; k < v.fxCount(); k++) { const e = v.fx(k); if (e.kind === L.FX_MODE && e.size === what) out.push(e); } return out; };

test('Obby: on the kit with no sides, out of the rotation, a map\'s to name; Sky Steps names it and needs no spawn on each half', () => {
  const m = L.MODES[L.M_OBBY], am = L.AM.find((a) => a.mode === L.M_OBBY);
  assert.deepEqual([m.name, m.team, m.ticks], ['OBBY', 0, 37500]);
  assert.deepEqual([am.key, am.prefix, am.hooks], ['obby', 'oy', ['spawn', 'hurt']]);
  assert.ok(!L.ARENA_MODES.includes(L.M_OBBY), 'never in the rotation');
  assert.equal(L.TEAMED & (1 << L.M_OBBY), 0);
  assert.ok(L.KIT & (1 << L.M_OBBY));
  assert.equal(MAP_MODES.obby, L.M_OBBY);
  assert.equal(AC.OY_MX_STAGE, L.MX_AM + 8 * L.AM.indexOf(am), 'its news in its own eight');
  assert.equal(AMC[L.M_OBBY], mod);
  assert.equal(MAP.mode, L.M_OBBY + 1);
  assert.deepEqual(MAP.sides, [6, 0], 'every spawn at the start');
  assert.equal(MAP.parts.filter((p) => p.kind === L.PK_CHECK).length, 6);
  assert.deepEqual(JSON.parse(JSON.stringify(obby())).structures.length, 3, 'the generator\'s spec is the file\'s');
});

test('Obby: as play begins everyone is at the start with empty hands, and the course knows its last stage', async () => {
  const g = await course(4);
  assert.equal(g.v.mode().mode, L.M_OBBY);
  assert.equal(stages(g.v), 6);
  for (let p = 0; p < 4; p++) {
    const f = g.v.fighter(p);
    assert.ok(f.pos[0] >= 450 && f.pos[0] <= 460 && f.pos[1] === Y, `slot ${p} on the start: ${f.pos}`);
    assert.deepEqual([f.gun, f.grens], [[0, 0], 0]);
    assert.equal(stageOf(g.v, p), 0);
  }
  // wherever the countdown took them: put off the course before play, they are back on it as it starts
  const h = await newArena(true);
  h.loadMap(packMap(MAP));
  h.init(7);
  const v = new View(h.memory.buffer), dv = new DataView(h.memory.buffer);
  h.feedPlayers([[L.EV_JOIN, 0]]); h.x.step();
  dv.setFloat32(L.PLAYERS + L.P_PX, 520, true); dv.setFloat32(L.PLAYERS + L.P_PY, 25, true);
  while (v.hole().state !== L.H_PLAY) { h.feedPlayers([]); h.x.step(); }
  assert.ok(v.fighter(0).pos[0] <= 460 && v.fighter(0).pos[1] === Y, `${v.fighter(0).pos}`);
});

test('Obby: a checkpoint touched makes its stage yours, a later one skipped to counts, an earlier one changes nothing', async () => {
  const g = await course(2);
  put(g, 0, CP[1]);
  g.run(2);
  assert.equal(stageOf(g.v, 0), 1);
  assert.equal(stageOf(g.v, 1), 0, 'only who touched it');
  assert.deepEqual(news(g.v, AC.OY_MX_STAGE).map((e) => [e.owner, e.shot]), [[0, 1]]);
  put(g, 0, CP[4]);
  g.run(2);
  assert.equal(stageOf(g.v, 0), 4, 'a shortcut found is a shortcut earned');
  put(g, 0, CP[2]);
  g.run(2);
  assert.equal(stageOf(g.v, 0), 4);
  assert.equal(news(g.v, AC.OY_MX_STAGE).length, 2);
  assert.equal(g.v.fighter(0).points, 4, 'MR_POINTS, as the board reads it');
});

test('Obby: a death comes back on your checkpoint a second on, or at the start before the first', async () => {
  const g = await course(2);
  put(g, 0, CP[3]);
  g.run(2);
  // onto the lava under the course
  put(g, 0, [500, 20.02]);
  put(g, 1, [470, 20.02]);
  g.run(2);
  assert.ok(g.v.fighter(0).dead && g.v.fighter(1).dead);
  assert.equal(g.v.fighter(0).respawn, AC.OY_RESPAWN - 1);
  g.run(AC.OY_RESPAWN + 1);
  const a = g.v.fighter(0), b = g.v.fighter(1);
  assert.ok(!a.dead && Math.abs(a.pos[0] - 510) < 1e-3 && a.pos[1] === Y && a.pos[2] === Z, `on checkpoint 3: ${a.pos}`);
  assert.ok(!b.dead && b.pos[0] <= 460 && b.pos[1] === Y, `at the start: ${b.pos}`);
  assert.deepEqual([a.gun, b.gun], [[0, 0], [0, 0]], 'hands still empty');
  assert.equal(stageOf(g.v, 0), 3, 'the stage is kept');
  assert.deepEqual([a.deaths, b.deaths], [1, 1]);
});

test('Obby: the finish times a run; the first home cuts the clock; over when everyone is home, placed by time, then stage, then falls', async () => {
  const g = await course(4);
  const t0 = g.v.hole().until;
  g.run(100);
  put(g, 2, FINISH);
  g.run(1);
  const done2 = doneOf(g.v, 2);
  assert.ok(done2 >= 100 && done2 <= 102, `timed from the start of play: ${done2}`);
  assert.deepEqual(news(g.v, AC.OY_MX_DONE).map((e) => [e.owner, e.shot]), [[2, 1]]);
  assert.deepEqual(news(g.v, AC.OY_MX_FIRST).map((e) => [e.owner, e.shot]), [[2, 45]]);
  assert.equal(g.v.hole().until, g.v.tick - 1 + AC.OY_AFTER, 'the clock cut');
  assert.ok(g.v.hole().until < t0);
  assert.equal(g.v.mode().leader, 2);
  assert.equal(g.v.hole().state, L.H_PLAY, 'three still running');
  // slot 0 home second; slot 1 to stage 5 with a fall; slot 3 to stage 5 clean
  g.run(50);
  put(g, 0, FINISH);
  put(g, 1, CP[5]);
  put(g, 3, CP[5]);
  g.run(2);
  assert.equal(news(g.v, AC.OY_MX_FIRST).length, 1, 'only the first cuts it');
  put(g, 1, [500, 20.02]);
  g.run(AC.OY_RESPAWN + 5);
  assert.equal(g.v.hole().state, L.H_PLAY);
  // the clock runs out on the two still out
  while (g.v.hole().state === L.H_PLAY) g.run(1);
  assert.equal(g.v.hole().state, L.H_OVER);
  assert.deepEqual([0, 1, 2, 3].map((p) => g.v.fighter(p).place), [2, 4, 1, 3]);
  // and with everyone home it ends at once
  const h = await course(2);
  put(h, 0, FINISH);
  h.run(3);
  assert.equal(h.v.hole().state, L.H_PLAY);
  put(h, 1, FINISH);
  h.run(2);
  assert.equal(h.v.hole().state, L.H_OVER, 'nobody left to wait for');
  assert.deepEqual([h.v.fighter(0).place, h.v.fighter(1).place], [1, 2]);
});

test('Obby: nobody hurts anybody: a rifle butt in the back does nothing', async () => {
  const g = await course(2);
  put(g, 0, [453, Y], 488);
  put(g, 1, [454.2, Y], 488);
  g.run(2);
  for (let k = 0; k < 60; k++) g.step([[L.EV_INPUT, 0, arenaWord({ yaw: 0, pitch: 512, melee: (k >> 4) & 1 })]]);
  const f = g.v.fighter(1);
  assert.deepEqual([f.dead, f.hp, f.sh], [false, 100, 100]);
});

test('Obby by a forced seed on a map with no course: nobody can finish, and it ends at the clock', async () => {
  const sim = await newArena(false);
  sim.init(forcedSeed(L.M_OBBY));
  const v = new View(sim.memory.buffer);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); };
  step([[L.EV_JOIN, 0]]);
  while (v.hole().state !== L.H_PLAY) step();
  assert.equal(v.mode().mode, L.M_OBBY);
  assert.equal(stages(v), 0);
  for (let k = 0; k < 500; k++) step();
  assert.equal(v.hole().state, L.H_PLAY);
  assert.equal(v.hole().until - v.hole().start, L.MODES[L.M_OBBY].ticks);
});

test('Obby\'s client module: the next part to go for, the HUD\'s and the board\'s lines, a marker over the next checkpoint', async () => {
  const g = await course(2);
  const map = g.v.map();
  assert.equal(map.parts.length, MAP.parts.length);
  assert.deepEqual([nextPart(map, 0).stage, nextPart(map, 3).stage, nextPart(map, 6).kind], [1, 4, L.PK_FINISH]);
  put(g, 0, CP[2]);
  g.run(2);
  const lines = [];
  const ctx = { put: (x, y, s) => lines.push(s), C: { WHITE: 0, YELLOW: 1, GREEN: 2, GREY: 3, RED: 4 }, slot: 0, me: g.v.fighter(0) };
  mod.hud(g.v, ctx);
  assert.deepEqual(lines, ['STAGE 2 OF 6']);
  const out = { markers: [] };
  mod.draw(g.v, { shown: 0, C: ctx.C }, out);
  assert.equal(out.markers[0].label, 'CHECKPOINT 3');
  assert.deepEqual(mod.cols.map((c) => c.get(g.v.fighter(0))), ['2', '0']);
  put(g, 0, FINISH);
  g.run(2);
  lines.length = 0;
  mod.hud(g.v, ctx);
  assert.match(lines[0], /^FINISHED IN 0:0\d\.\d\d$/);
  assert.deepEqual(mod.state(g.v).done, [0]);
  out.markers.length = 0;
  mod.draw(g.v, { shown: 0, C: ctx.C }, out);
  assert.equal(out.markers.length, 0, 'home: nothing left to point at');
});

test('Obby with 8 AI fighters on Sky Steps: every one runs the whole course, match after match, on the debug build', async () => {
  const seen = { finished: new Set(), matches: 0, firstHome: 0 };
  let last = -1;
  const r = await playArena({ bytes: arenaBytes(true), seed: 7, bots: 8, ticks: 11000, map: packMap(MAP), onTick: (t, view) => {
    const h = view.hole();
    if (h.hole !== last) { last = h.hole; seen.matches++; seen.finished.clear(); }
    for (let p = 0; p < 8; p++) if (doneOf(view, p)) { if (h.hole === 0 && !seen.firstHome) seen.firstHome = doneOf(view, p); seen.finished.add(p); }
    if (h.hole === 0 && h.state === L.H_OVER) seen.all = seen.finished.size;
  } });
  assert.equal(seen.all, 8, 'all eight home in the first match');
  assert.ok(seen.firstHome > 2500 && seen.firstHome < 6000, `the first home in ${(seen.firstHome / 125).toFixed(1)} s`);
  assert.ok(r.matches >= 2, `${r.matches} matches played through`);
  assert.equal(r.mode.mode, L.M_OBBY, 'the map plays it every match');
});
