// A map's own movement and mode (map.json "movement" and "mode"; layout.mjs
// MAP_RULES; $a_gait in src/arena.wat, read by $move): compiled and laid,
// refused when wrong, a Roblox Humanoid's walk, jump, fall and air control
// in metres, the prediction stepping it as the confirmed world does, and a
// map that names a mode playing it every match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newArena, arenaBytes } from './helpers.mjs';
import { View, arenaWord, arenaFrame, forcedSeed } from '../src/arena-view.mjs';
import { compileSpec, packMap, movement, MAP_MODES } from '../tools/map-compile.mjs';
import { newMemory, instantiate, Sim } from '../harness/core.mjs';
import { expand, assemble } from '../tools/asm.mjs';
import * as L from '../src/layout.mjs';

// Roblox's defaults at its 0.28 m a stud: WalkSpeed 16, JumpHeight 7.2, Gravity 196.2
const STUD = 0.28;
const ROBLOX = { walk: 16 * STUD, jump: 7.2 * STUD, gravity: 196.2 * STUD };
const W = 32;
const flat = { height: { width: W, height: W, channels: 1, depth: 8, data: new Uint8Array(W * W).fill(40) } };
// a 64 m floor at 20 m, and a ledge 7 studs (1.96 m) high: a Roblox jump's reach, not the arena's
const LEDGE = { name: 'ledge', boxes: [[510, 20, 484, 520, 21.96, 540, 'rock']] };
const spec = (extra = {}) => ({
  name: 'Gait', bounds: [484, 540, 484, 540],
  terrain: { origin: [480, 480], height: 'height.png', scale: 0.5, base: 0 },
  structures: [LEDGE], spawns: [[488, 488], [536, 536]], ...extra,
});
const f = Math.fround;

async function arena(m, seed = 7, debug = true) {
  const sim = await newArena(debug);
  sim.loadMap(packMap(m));
  sim.init(seed);
  const v = new View(sim.memory.buffer), dv = new DataView(sim.memory.buffer);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); };
  step([[L.EV_JOIN, 0]]);
  while (v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
function put(g, x, z, y = 20) {
  const b = L.PLAYERS;
  g.dv.setFloat32(b + L.P_PX, x, true); g.dv.setFloat32(b + L.P_PY, y, true); g.dv.setFloat32(b + L.P_PZ, z, true);
  for (const o of [L.P_VX, L.P_VY, L.P_VZ]) g.dv.setFloat32(b + o, 0, true);
}
const FWD = 1, BACK = 2;
const word = (move = 0, jump = 0) => arenaWord({ yaw: 0, pitch: 512, move, jump });
const across = (p) => Math.hypot(p.vel[0], p.vel[2]);

test('"movement" compiles to the rules as the sim reads them; "mode" to its M_*; a map with neither keeps its bytes', () => {
  const m = compileSpec(spec({ movement: ROBLOX, mode: 'lucky' }), flat);
  const g = movement(ROBLOX);
  assert.equal(m.consts.MAPSEG_NRULESB, L.MAP_RULES_SIZE);
  const dv = new DataView(m.bytes.buffer, m.bytes.byteOffset + m.consts.MAPSEG_RULES, L.MAP_RULES_SIZE);
  assert.equal(dv.getUint32(L.RU_FLAGS, true), L.RU_GAIT);
  assert.equal(dv.getUint32(L.RU_MODE, true), L.M_LUCKY + 1);
  assert.equal(dv.getFloat32(L.RU_WALK, true), f(4.48));
  assert.equal(dv.getFloat32(L.RU_ZWALK, true), f(4.48 * 1.25));
  assert.equal(dv.getFloat32(L.RU_JUMP, true), f(Math.sqrt(2 * ROBLOX.gravity * ROBLOX.jump)), 'leaves the ground at sqrt(2 g h)');
  assert.equal(dv.getFloat32(L.RU_ZJUMP, true), g.ZJUMP);
  assert.equal(dv.getFloat32(L.RU_GRAV, true), f(ROBLOX.gravity / 125));
  assert.equal(dv.getFloat32(L.RU_ACCEL, true), f(4.48 * 10 / 125), 'walk reached in a tenth of a second');
  // a mode alone is rules without the gait
  const only = compileSpec(spec({ mode: 'crossroads' in MAP_MODES ? 'crossroads' : 'lucky' }), flat);
  assert.equal(new DataView(only.bytes.buffer, only.consts.MAPSEG_RULES).getUint32(L.RU_FLAGS, true), 0);
  const plain = compileSpec(spec(), flat);
  assert.equal(plain.consts.MAPSEG_NRULESB, 0);
  assert.equal(plain.consts.MAPSEG_RULES, plain.bytes.length);
  for (const [extra, why] of [
    [{ movement: { ...ROBLOX, walk: 0 } }, /movement.walk 0: over 0/],
    [{ movement: { walk: 4 } }, /movement.jump undefined/],
    [{ movement: { ...ROBLOX, gravity: 'lots' } }, /movement.gravity/],
    [{ movement: { ...ROBLOX, jump: 40, gravity: 100 } }, /leaves the ground at/],
    [{ mode: 'golf' }, /mode "golf": one of fiesta/],
  ]) assert.throws(() => compileSpec(spec(extra), flat), why, JSON.stringify(extra));
});

test('the rules laid at run time are the rules built in; bad rules are refused', async () => {
  const m = compileSpec(spec({ movement: ROBLOX, mode: 'lucky' }), flat);
  const sim = async (bytes) => { const memory = newMemory(); return new Sim(await instantiate(await WebAssembly.compile(bytes), memory), memory); };
  const a = await sim(await assemble(expand('src/game.wat', { ARENA: true, map: m })));
  const b = await sim(arenaBytes());
  a.init(3);
  b.loadMap(packMap(m));
  b.init(3);
  const end = L.MAP_RULES + L.MAP_RULES_SIZE;
  assert.equal(Buffer.compare(Buffer.from(a.u8.subarray(L.MAP, end)), Buffer.from(b.u8.subarray(L.MAP, end))), 0, 'the map\'s area, the rules included');
  assert.deepEqual(new View(b.memory.buffer).map().movement.walk, f(4.48));
  assert.equal(new View(b.memory.buffer).map().mode, L.M_LUCKY);
  const good = packMap(m), at = L.MAPPACK_HEAD + m.consts.MAPSEG_RULES;
  const u32 = (x, o, v) => new DataView(x.buffer).setUint32(o, v, true);
  const f32 = (x, o, v) => new DataView(x.buffer).setFloat32(o, v, true);
  for (const [why, spoil] of [
    ['its rules', (x) => u32(x, at + L.RU_FLAGS, 2)],
    ['its rules', (x) => u32(x, at + L.RU_MODE, L.MODES.length + 1)],
    ['its rules', (x) => f32(x, at + L.RU_GRAV, NaN)],
    ['its rules', (x) => f32(x, at + L.RU_WALK, -1)],
    ['its rules', (x) => f32(x, at + L.RU_JUMP, L.RU_MAX * 2)],
    ['its rules', (x) => u32(x, L.MP_NRULESB, 16)],
    ['a part outside its bytes', (x) => u32(x, L.MP_RULES, x.length)],
  ]) {
    const s = await sim(arenaBytes()), x = good.slice();
    spoil(x);
    assert.throws(() => s.loadMap(x), new RegExp(`refused: ${why}`), why);
  }
  // and a map without rules laid after one with them clears them
  b.loadMap(packMap(compileSpec(spec(), flat)));
  b.init(3);
  assert.ok(b.u8.subarray(L.MAP_RULES, end).every((v) => v === 0));
});

test('a Humanoid walks at its walk speed, gets there in a tenth of a second and stops as fast', async () => {
  const g = await arena(compileSpec(spec({ movement: ROBLOX }), flat));
  put(g, 490, 500);
  g.step([[L.EV_INPUT, 0, word()]]);
  let ticks = 0;
  while (across(g.v.fighter(0)) < f(4.48)) { g.step([[L.EV_INPUT, 0, word(FWD)]]); ticks++; }
  assert.ok(ticks <= 13, `walk speed in ${ticks} ticks`);
  for (let k = 0; k < 60; k++) g.step([[L.EV_INPUT, 0, word(FWD)]]);
  assert.equal(across(g.v.fighter(0)), f(4.48), 'and no faster');
  ticks = 0;
  while (across(g.v.fighter(0)) > 0) { g.step([[L.EV_INPUT, 0, word()]]); ticks++; }
  assert.ok(ticks <= 13, `stopped in ${ticks} ticks`);
  // the arena's own, on the same map without the rules: Quake's 10 m/s
  const q = await arena(compileSpec(spec(), flat));
  put(q, 490, 500);
  for (let k = 0; k < 125; k++) q.step([[L.EV_INPUT, 0, word(FWD)]]);
  assert.ok(Math.abs(across(q.v.fighter(0)) - 10) < 0.01, `the arena runs at RUN: ${across(q.v.fighter(0))}`);
});

test('a Humanoid jumps 7.2 studs under 196.2 studs/s^2, turns in the air, and makes a ledge the arena\'s fighter can\'t', async () => {
  const g = await arena(compileSpec(spec({ movement: ROBLOX }), flat));
  put(g, 490, 500);
  g.step([[L.EV_INPUT, 0, word()]]);
  g.step([[L.EV_INPUT, 0, word(0, 1)]]);
  let top = 0, air = 1;
  while (!g.v.fighter(0).ground) { top = Math.max(top, g.v.fighter(0).pos[1] - 20); g.step([[L.EV_INPUT, 0, word()]]); air++; }
  assert.ok(Math.abs(top - ROBLOX.jump) < 0.12, `apex ${top.toFixed(3)} m, 7.2 studs is ${ROBLOX.jump.toFixed(3)}`);
  const flight = 2 * Math.sqrt(2 * ROBLOX.jump / ROBLOX.gravity) * 125;
  assert.ok(Math.abs(air - flight) <= 2, `${air} ticks in the air, ${flight.toFixed(1)} by the book`);
  // full speed one way, then back the other in mid-air
  put(g, 490, 500);
  for (let k = 0; k < 30; k++) g.step([[L.EV_INPUT, 0, word(FWD)]]);
  g.step([[L.EV_INPUT, 0, word(FWD, 1)]]);
  for (let k = 0; k < 26; k++) g.step([[L.EV_INPUT, 0, word(BACK)]]);
  assert.equal(g.v.fighter(0).ground, false, 'still in the air');
  assert.equal(g.v.fighter(0).vel[0], f(-4.48), 'going back at walk speed, a fifth of a second on');
  // the ledge: run at it and jump
  const onLedge = async (m) => {
    const h = await arena(m);
    put(h, 505, 500);
    for (let k = 0; k < 250; k++) h.step([[L.EV_INPUT, 0, word(k < 200 ? FWD : 0, k > 40 && k < 120 ? 1 : 0)]]);
    return h.v.fighter(0).pos;
  };
  const [x, y] = await onLedge(compileSpec(spec({ movement: ROBLOX }), flat));
  assert.ok(x > 510 && Math.abs(y - 21.96) < 1e-4, `on the ledge: ${x}, ${y}`);
  const [qx, qy] = await onLedge(compileSpec(spec(), flat));
  assert.ok(qx < 510 && qy < 21, `the arena's 1.2 m jump stays under it: ${qx}, ${qy}`);
});

test('the prediction walks and jumps a Humanoid exactly as the confirmed world does', async () => {
  const g = await arena(compileSpec(spec({ movement: ROBLOX }), flat));
  put(g, 490, 500);
  g.step([[L.EV_INPUT, 0, word()]]);
  const w = (k) => arenaWord({ yaw: 4096 * (k >> 6), pitch: 512, move: [FWD, 0, BACK, FWD | 4, 8][(k >> 5) % 5], jump: k % 89 < 3 ? 1 : 0, serial: (arenaFrame({ lag: 3 }) >> ((g.v.tick + k) & 7)) & 1 });
  const inputs = Array.from({ length: 600 }, (_, k) => w(k));
  let compared = 0;
  const due = new Map();
  for (let k = 0; k < inputs.length; k++) {
    for (const n of [1, 6, 30]) {
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
  assert.ok(compared > 600, `${compared} compared`);
});

test('a map that names a mode plays it every match; a forced seed still wins', async () => {
  const m = compileSpec(spec({ mode: 'lucky' }), flat);
  const g = await arena(m, 7, false);
  assert.equal(g.v.mode().mode, L.M_LUCKY, 'the first match');
  // the next match too, where the rotation would play another
  const h = g.v.hole().hole;
  while (g.v.hole().hole === h || g.v.hole().state !== L.H_PLAY) g.step([[L.EV_INPUT, 0, word()]]);
  assert.equal(g.v.mode().mode, L.M_LUCKY, 'the second match');
  const forced = await arena(m, forcedSeed(L.M_SLAYER), false);
  assert.equal(forced.v.mode().mode, L.M_SLAYER);
});
